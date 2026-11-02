import { useState, useEffect, useRef, useCallback } from "react";

/* =========================================================
 * Config
 * ========================================================= */

const LB_URL = import.meta.env.VITE_LB_URL || "http://localhost:8000";
const TARGET_PATH = import.meta.env.VITE_TARGET_PATH || "/api/posts?limit=5";
const POLL_MS = 1000;
const MAX_LOG = 300;
const STRATEGIES = ["round-robin", "least-connections", "random", "weighted"];

/* =========================================================
 * App
 * ========================================================= */

export default function App() {
  const [servers, setServers] = useState([]);
  const [health, setHealth] = useState(null);
  const [strategy, setStrategy] = useState("round-robin");
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [logs, setLogs] = useState([]);
  const [distribution, setDistribution] = useState({});
  const [busy, setBusy] = useState(false);
  const [trafficRunning, setTrafficRunning] = useState(false);
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);

  const logRef = useRef(null);
  const inputRef = useRef(null);
  const trafficRef = useRef({ running: false, timer: null });
  const prevTotalsRef = useRef({}); // for per-poll deltas

  /* ----------------------------- Logging ----------------------------- */

  const log = useCallback((level, msg) => {
    setLogs((prev) => {
      const entry = {
        id: `${Date.now()}-${Math.random()}`,
        level,
        msg,
        ts: new Date(),
      };
      const next = [...prev, entry];
      return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
    });
  }, []);

  // Welcome messages (once)
  useEffect(() => {
    log("info", `Dashboard ready → ${LB_URL}`);
    log("info", `Burst target: ${TARGET_PATH}`);
    log("info", `Type "help" for the command list.`);
  }, [log]);

  /* ----------------------------- Polling ----------------------------- */

  useEffect(() => {
    if (paused) return;
    let cancelled = false;

    async function poll() {
      try {
        const r = await fetch(`${LB_URL}/admin/health`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (cancelled) return;

        // Compute delta per server from last poll → "requests/sec" signal.
        const prev = prevTotalsRef.current;
        const withDelta = (j.servers || []).map((s) => ({
          ...s,
          delta:
            prev[s.name] != null
              ? Math.max(0, s.totalProxied - prev[s.name])
              : 0,
        }));
        prevTotalsRef.current = Object.fromEntries(
          (j.servers || []).map((s) => [s.name, s.totalProxied]),
        );

        setServers(withDelta);
        setHealth(j);
        if (j.strategy) setStrategy(j.strategy);
        setConnected(true);
      } catch (err) {
        if (!cancelled) {
          setConnected(false);
          log("error", `poll failed: ${err.message}`);
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paused, log]);

  /* ----------------------------- Auto-scroll ----------------------------- */

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  /* ----------------------------- Admin actions ----------------------------- */

  const postJSON = async (path, body) => {
    const r = await fetch(`${LB_URL}${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = {};
    try {
      j = await r.json();
    } catch {
      /* non-JSON error page */
    }
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };

  const serverAction = async (name, action) => {
    setBusy(true);
    try {
      await postJSON(`/admin/servers/${name}/${action}`);
      log("success", `${action} → ${name}`);
    } catch (err) {
      log("error", `${action} ${name} failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const changeStrategy = async (s) => {
    try {
      await postJSON("/admin/strategy", { strategy: s });
      setStrategy(s);
      log("success", `strategy → ${s}`);
    } catch (err) {
      log("error", `strategy change failed: ${err.message}`);
    }
  };

  /* ----------------------------- Traffic generation ----------------------------- */

  const fireOne = async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(`${LB_URL}${TARGET_PATH}`);
      const instance = r.headers.get("x-instance") || "unknown";
      const ms = Math.round(performance.now() - t0);
      setDistribution((prev) => ({
        ...prev,
        [instance]: (prev[instance] || 0) + 1,
      }));
      return { ok: r.ok, status: r.status, instance, ms };
    } catch (err) {
      return { ok: false, status: 0, instance: "ERR", ms: 0, err: err.message };
    }
  };

  const burst = async (n = 100) => {
    log("info", `burst: firing ${n} requests…`);
    setDistribution({});
    const start = performance.now();
    const results = [];
    const CONCURRENCY = 20; // stays under browser per-host connection cap

    for (let i = 0; i < n; i += CONCURRENCY) {
      const batch = Array.from(
        { length: Math.min(CONCURRENCY, n - i) },
        fireOne,
      );
      results.push(...(await Promise.all(batch)));
    }

    const ms = Math.round(performance.now() - start);
    const ok = results.filter((r) => r.ok).length;
    const failed = n - ok;
    const rps = Math.round(n / (ms / 1000));
    log(
      failed ? "error" : "success",
      `burst done: ${ok}/${n} ok${failed ? ` · ${failed} failed` : ""} in ${ms}ms (${rps} rps)`,
    );
  };

  const startTraffic = (rps) => {
    if (trafficRef.current.running) return;
    trafficRef.current.running = true;
    setTrafficRunning(true);
    setDistribution({});
    log("info", `traffic: ${rps} rps started`);

    const interval = 1000 / rps;
    const fire = async () => {
      if (!trafficRef.current.running) return;
      await fireOne();
      trafficRef.current.timer = setTimeout(fire, interval);
    };
    fire();
  };

  const stopTraffic = () => {
    trafficRef.current.running = false;
    setTrafficRunning(false);
    clearTimeout(trafficRef.current.timer);
    log("info", "traffic: stopped");
  };

  /* ----------------------------- Command parser ----------------------------- */

  const runCommand = async (raw) => {
    const line = raw.trim();
    if (!line) return;
    setHistory((prev) => [...prev, line]);
    setHistIdx(-1);
    log("cmd", `> ${line}`);

    const [name, ...args] = line.split(/\s+/);
    try {
      switch (name.toLowerCase()) {
        case "help":
          log(
            "info",
            "help | health | config | clear | burst <n> | traffic start <rps> | traffic stop | strategy <name> | enable|disable|drain|undrain <name>",
          );
          break;

        case "health":
          if (health) log("info", JSON.stringify(health));
          else log("error", "no health snapshot yet");
          break;

        case "config": {
          const r = await fetch(`${LB_URL}/admin/config`);
          const j = await r.json();
          log(
            "info",
            `strategy=${j.strategy} ports=${j.ports?.join(",") || "?"} weights=${JSON.stringify(j.weights || {})}`,
          );
          break;
        }

        case "clear":
          setLogs([]);
          setDistribution({});
          break;

        case "strategy":
          if (!args[0])
            return log("error", `usage: strategy ${STRATEGIES.join("|")}`);
          await changeStrategy(args[0]);
          break;

        case "burst":
          await burst(Math.min(5000, parseInt(args[0] || "100", 10) || 100));
          break;

        case "traffic":
          if (args[0] === "start")
            startTraffic(Math.min(500, parseInt(args[1] || "20", 10) || 20));
          else if (args[0] === "stop") stopTraffic();
          else log("error", "usage: traffic start <rps> | traffic stop");
          break;

        case "enable":
        case "disable":
        case "drain":
        case "undrain":
          if (!args[0]) return log("error", `usage: ${name} <server-name>`);
          await serverAction(args[0], name);
          break;

        case "pause":
          setPaused(true);
          log("info", "polling paused");
          break;

        case "resume":
          setPaused(false);
          log("info", "polling resumed");
          break;

        default:
          log("error", `unknown command: "${name}". Type "help".`);
      }
    } catch (err) {
      log("error", `command failed: ${err.message}`);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      runCommand(cmd);
      setCmd("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const next = Math.min(history.length - 1, histIdx + 1);
      setHistIdx(next);
      setCmd(history[history.length - 1 - next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx - 1;
      if (next < 0) {
        setHistIdx(-1);
        setCmd("");
      } else {
        setHistIdx(next);
        setCmd(history[history.length - 1 - next]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLogs([]);
    }
  };

  /* ----------------------------- Render ----------------------------- */

  return (
    <div className="app">
      <Header
        strategy={strategy}
        onChangeStrategy={changeStrategy}
        health={health}
        connected={connected}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        onBurst={() => burst(100)}
        onBurst1000={() => burst(1000)}
        trafficRunning={trafficRunning}
        onStartTraffic={() => startTraffic(20)}
        onStopTraffic={stopTraffic}
      />

      <section className="backends">
        {servers.length === 0 && (
          <div className="empty">
            {connected ? "No servers registered." : "Connecting to LB…"}
          </div>
        )}
        {servers.map((s) => (
          <BackendCard
            key={s.name}
            server={s}
            busy={busy}
            onAction={serverAction}
          />
        ))}
      </section>

      <section className="main">
        <LogPanel logs={logs} logRef={logRef} onClear={() => setLogs([])} />
        <DistributionPanel distribution={distribution} />
      </section>

      <Terminal
        cmd={cmd}
        setCmd={setCmd}
        onKeyDown={onKeyDown}
        inputRef={inputRef}
      />
    </div>
  );
}

/* =========================================================
 * Subcomponents
 * ========================================================= */

function Header({
  strategy,
  onChangeStrategy,
  health,
  connected,
  paused,
  onTogglePause,
  onBurst,
  onBurst1000,
  trafficRunning,
  onStartTraffic,
  onStopTraffic,
}) {
  const available = health?.available ?? 0;
  const total = health?.total ?? 0;
  const proxied = health?.lb?.totalProxied ?? 0;

  return (
    <header className="header">
      <div className="header-left">
        <h1>⚡ LB CONTROL CENTER</h1>
        <div className="stats">
          <span className="stat">
            <span className="k">up</span>
            <span className="v">
              {available}/{total}
            </span>
          </span>
          <span className="stat">
            <span className="k">proxied</span>
            <span className="v">{proxied.toLocaleString()}</span>
          </span>
          <span className={`stat conn ${connected ? "ok" : "err"}`}>
            <span className="dot" />
            <span className="k">{connected ? "live" : "offline"}</span>
          </span>
          {paused && <span className="stat warn">PAUSED</span>}
        </div>
      </div>
      <div className="header-right">
        <label className="strat-label">
          <span className="k">strategy</span>
          <select
            value={strategy}
            onChange={(e) => onChangeStrategy(e.target.value)}
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button onClick={onBurst}>burst 100</button>
        <button onClick={onBurst1000}>burst 1000</button>
        {trafficRunning ? (
          <button className="danger" onClick={onStopTraffic}>
            ■ stop traffic
          </button>
        ) : (
          <button className="primary" onClick={onStartTraffic}>
            ▶ 20 rps
          </button>
        )}
        <button className="ghost" onClick={onTogglePause}>
          {paused ? "▶" : "⏸"}
        </button>
      </div>
    </header>
  );
}

function BackendCard({ server, busy, onAction }) {
  const status = !server.enabled
    ? "disabled"
    : server.draining
      ? "draining"
      : server.healthy
        ? "healthy"
        : "down";

  return (
    <div className={`card ${status}`}>
      <div className="card-head">
        <span className="name">{server.name}</span>
        <span className={`badge ${status}`}>{status}</span>
      </div>

      <div className="metrics">
        <div className="metric">
          <span className="k">active</span>
          <span className="v">{server.activeRequests}</span>
          {server.delta > 0 && <span className="delta">+{server.delta}</span>}
        </div>
        <div className="metric">
          <span className="k">total</span>
          <span className="v">{server.totalProxied.toLocaleString()}</span>
        </div>
      </div>

      <div className="actions">
        {server.enabled ? (
          <>
            <button
              disabled={busy}
              onClick={() => onAction(server.name, "disable")}
            >
              disable
            </button>
            {server.draining ? (
              <button
                disabled={busy}
                onClick={() => onAction(server.name, "undrain")}
              >
                undrain
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => onAction(server.name, "drain")}
              >
                drain
              </button>
            )}
          </>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={() => onAction(server.name, "enable")}
          >
            enable
          </button>
        )}
      </div>

      {server.lastError && <div className="err-msg">{server.lastError}</div>}
    </div>
  );
}

function LogPanel({ logs, logRef, onClear }) {
  return (
    <div className="panel log-panel">
      <div className="panel-head">
        <span>LIVE LOG</span>
        <button className="ghost" onClick={onClear}>
          clear
        </button>
      </div>
      <div className="log-body" ref={logRef}>
        {logs.map((l) => (
          <div key={l.id} className={`log-line log-${l.level}`}>
            <span className="ts">
              {l.ts.toLocaleTimeString("en-GB", { hour12: false })}
            </span>
            <span className="msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionPanel({ distribution }) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);

  return (
    <div className="panel dist-panel">
      <div className="panel-head">
        <span>LAST BURST — X-Instance</span>
        {total > 0 && <span className="muted">{total} req</span>}
      </div>
      <div className="dist-body">
        {total === 0 ? (
          <div className="muted pad">
            Run <code>burst 100</code> to prove round-robin from the client
            side.
          </div>
        ) : (
          entries.map(([name, count]) => {
            const pct = (count / total) * 100;
            return (
              <div key={name} className="dist-row">
                <span className="dist-name">{name}</span>
                <div className="dist-bar-wrap">
                  <div className="dist-bar" style={{ width: `${pct}%` }} />
                </div>
                <span className="dist-count">
                  {count} <span className="muted">({pct.toFixed(1)}%)</span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Terminal({ cmd, setCmd, onKeyDown, inputRef }) {
  return (
    <div className="terminal">
      <span className="prompt">$</span>
      <input
        ref={inputRef}
        value={cmd}
        onChange={(e) => setCmd(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder='type a command — "help", "burst 100", "traffic start 50", "disable api-9002"'
        spellCheck={false}
        autoComplete="off"
        autoFocus
      />
    </div>
  );
}
