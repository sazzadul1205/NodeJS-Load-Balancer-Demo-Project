import { useState, useEffect, useCallback, useRef } from "react";
import { LB_URL, postJSON } from "../api.js";

const POLL_MS = 1000;

export function useHealthPoll(log) {
  const [servers, setServers] = useState([]);
  const [health, setHealth] = useState(null);
  const [strategy, setStrategy] = useState("round-robin");
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const prevTotalsRef = useRef({});

  useEffect(() => {
    if (paused) return;
    let cancelled = false;

    async function poll() {
      try {
        const r = await fetch(`${LB_URL}/admin/health`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (cancelled) return;

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
          log?.("error", `poll failed: ${err.message}`);
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

  // Throws on failure — caller decides whether to log or surface.
  const changeStrategy = useCallback(
    async (s) => {
      await postJSON("/admin/strategy", { strategy: s });
      setStrategy(s);
      log?.("success", `strategy → ${s}`);
    },
    [log],
  );

  const serverAction = useCallback(
    async (name, action) => {
      await postJSON(`/admin/servers/${name}/${action}`);
      log?.("success", `${action} → ${name}`);
    },
    [log],
  );

  const resetLB = useCallback(async () => {
    await postJSON("/admin/reset");
  }, []);

  return {
    servers,
    health,
    connected,
    paused,
    setPaused,
    strategy,
    setStrategy,
    changeStrategy,
    serverAction,
    resetLB,
  };
}
