import { useState, useCallback, useRef } from "react";
import { LB_URL, TARGET_PATH } from "../api.js";

const CONCURRENCY = 20;

export function useTraffic(log) {
  const [distribution, setDistribution] = useState({});
  const [trafficRunning, setTrafficRunning] = useState(false);
  const trafficRef = useRef({ running: false, timer: null });

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
      const dist = {};
      const failures = [];
      const start = performance.now();

      for (let i = 0; i < n; i += CONCURRENCY) {
        const batch = Array.from(
          { length: Math.min(CONCURRENCY, n - i) },
          fireOne,
        );
        const results = await Promise.all(batch);
        for (const r of results) {
          dist[r.instance] = (dist[r.instance] || 0) + 1;
          if (!r.ok) failures.push(r);
        }
      }

      const ms = Math.round(performance.now() - start);
      if (updateUI) setDistribution(dist);
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
      log?.("info", `traffic: ${rps} rps started`);
      const interval = 1000 / rps;
      const fire = async () => {
        if (!trafficRef.current.running) return;
        await fireOne();
        trafficRef.current.timer = setTimeout(fire, interval);
      };
      fire();
    },
    [fireOne, log],
  );

  const stopTraffic = useCallback(() => {
    if (!trafficRef.current.running) return;
    trafficRef.current.running = false;
    setTrafficRunning(false);
    clearTimeout(trafficRef.current.timer);
    log?.("info", "traffic: stopped");
  }, [log]);

  return {
    distribution,
    setDistribution,
    burst,
    startTraffic,
    stopTraffic,
    trafficRunning,
  };
}
