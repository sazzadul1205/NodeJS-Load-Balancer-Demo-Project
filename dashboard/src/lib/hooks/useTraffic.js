import { useState, useCallback, useRef, useMemo } from "react";
import { LB_URL, TARGET_PATH } from "../api.js";

const CONCURRENCY = 20;

export function useTraffic(log) {
  const [distribution, setDistribution] = useState({});
  const [trafficRunning, setTrafficRunning] = useState(false);
  const [burstProgress, setBurstProgress] = useState(null);
  const trafficRef = useRef({ running: false, timer: null });
  const logRef = useRef(log);
  const burstInFlightRef = useRef(false);

  const fireOne = useCallback(async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(`${LB_URL}${TARGET_PATH}`);
      const instance = r.headers.get("x-instance") || "unknown";
      const ms = Math.round(performance.now() - t0);
      return { ok: r.ok, status: r.status, instance, ms };
    } catch (err) {
      return { ok: false, status: 0, instance: "ERR", ms: 0, err: err.message };
    }
  }, []);

  const burst = useCallback(
    async (n, { updateUI = true } = {}) => {
      if (burstInFlightRef.current) {
        return { dist: {}, ms: 0, n: 0, ok: 0, failures: [], skipped: true };
      }
      burstInFlightRef.current = true;

      const dist = {};
      const failures = [];
      const start = performance.now();

      if (updateUI) setBurstProgress({ done: 0, total: n });

      try {
        for (let i = 0; i < n; i += CONCURRENCY) {
          const size = Math.min(CONCURRENCY, n - i);
          const batch = Array.from({ length: size }, fireOne);
          const results = await Promise.all(batch);
          for (const r of results) {
            dist[r.instance] = (dist[r.instance] || 0) + 1;
            if (!r.ok) failures.push(r);
          }
          // Incremental UI update — the chart moves as batches land.
          if (updateUI) {
            setDistribution({ ...dist });
            setBurstProgress({ done: Math.min(i + size, n), total: n });
          }
        }
      } finally {
        burstInFlightRef.current = false;
        if (updateUI) {
          setBurstProgress(null);
          setDistribution({ ...dist });
        }
      }

      const ms = Math.round(performance.now() - start);
      return { dist, ms, n, ok: n - failures.length, failures };
    },
    [fireOne],
  );

  const startTraffic = useCallback(
    (rps) => {
      if (trafficRef.current.running) return;
      trafficRef.current.running = true;
      setTrafficRunning(true);
      setDistribution({});
      logRef.current?.("info", `traffic: ${rps} rps started`);
      const interval = 1000 / rps;
      const fire = async () => {
        if (!trafficRef.current.running) return;
        await fireOne();
        trafficRef.current.timer = setTimeout(fire, interval);
      };
      fire();
    },
    [fireOne],
  );

  const stopTraffic = useCallback(() => {
    if (!trafficRef.current.running) return;
    trafficRef.current.running = false;
    setTrafficRunning(false);
    clearTimeout(trafficRef.current.timer);
    logRef.current?.("info", "traffic: stopped");
  }, []);

  return useMemo(
    () => ({
      distribution,
      setDistribution,
      burst,
      startTraffic,
      stopTraffic,
      trafficRunning,
      burstProgress,
    }),
    [
      distribution,
      burst,
      startTraffic,
      stopTraffic,
      trafficRunning,
      burstProgress,
    ],
  );
}
