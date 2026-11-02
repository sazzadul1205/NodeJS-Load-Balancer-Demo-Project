import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LB_URL, postJSON } from "../api.js";

const POLL_MS = 1000;

export function useHealthPoll(log) {
  const [servers, setServers] = useState([]);
  const [health, setHealth] = useState(null);
  const [strategy, setStrategy] = useState("round-robin");
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lastPollAt, setLastPollAt] = useState(null);
  const [pollLatency, setPollLatency] = useState(null);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [polling, setPolling] = useState(false);

  const prevTotalsRef = useRef({});
  const logRef = useRef(log);
  useEffect(() => {
    logRef.current = log;
  }, [log]);

  const applyHealth = useCallback((j) => {
    const prev = prevTotalsRef.current;
    const withDelta = (j.servers || []).map((s) => ({
      ...s,
      delta:
        prev[s.name] != null ? Math.max(0, s.totalProxied - prev[s.name]) : 0,
    }));
    prevTotalsRef.current = Object.fromEntries(
      (j.servers || []).map((s) => [s.name, s.totalProxied]),
    );
    setServers(withDelta);
    setHealth(j);
    if (j.strategy) setStrategy(j.strategy);
    setConnected(true);
  }, []);

  const pollNow = useCallback(async () => {
    if (polling) return;
    setPolling(true);
    const t0 = performance.now();
    try {
      const r = await fetch(`${LB_URL}/admin/health`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      applyHealth(j);
      setLastPollAt(Date.now());
      setPollLatency(Math.round(performance.now() - t0));
      setPollErrorCount(0);
    } catch (err) {
      setPollErrorCount((c) => c + 1);
      setConnected(false);
      logRef.current?.("error", `poll failed: ${err.message}`);
    } finally {
      setPolling(false);
    }
  }, [applyHealth, polling]);

  useEffect(() => {
    if (paused) return;
    pollNow();
    const id = setInterval(pollNow, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const changeStrategy = useCallback(async (s) => {
    try {
      await postJSON("/admin/strategy", { strategy: s });
      setStrategy(s);
      logRef.current?.("success", `strategy → ${s}`);
    } catch (err) {
      logRef.current?.("error", `strategy change failed: ${err.message}`);
      throw err;
    }
  }, []);

  const serverAction = useCallback(async (name, action) => {
    try {
      await postJSON(`/admin/servers/${name}/${action}`);
      logRef.current?.("success", `${action} → ${name}`);
    } catch (err) {
      logRef.current?.("error", `${action} ${name} failed: ${err.message}`);
      throw err;
    }
  }, []);

  const resetLB = useCallback(async () => {
    await postJSON("/admin/reset");
  }, []);

  return useMemo(
    () => ({
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
      pollNow,
      lastPollAt,
      pollLatency,
      pollErrorCount,
      polling,
    }),
    [
      servers,
      health,
      connected,
      paused,
      strategy,
      changeStrategy,
      serverAction,
      resetLB,
      pollNow,
      lastPollAt,
      pollLatency,
      pollErrorCount,
      polling,
    ],
  );
}
