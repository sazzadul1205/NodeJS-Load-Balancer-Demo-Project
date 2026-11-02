import { useState, useCallback, useRef } from "react";
import { TESTS } from "../../tests.js";
import { fetchJSON, fetchRaw, postJSON } from "../api.js";

export function useTests({ logs, health, traffic }) {
  const [testState, setTestState] = useState({});
  const [runningTestId, setRunningTestId] = useState(null);
  const runningRef = useRef(false);

  const runTest = useCallback(
    async (test) => {
      if (runningRef.current) return;
      runningRef.current = true;
      traffic.stopTraffic();

      setRunningTestId(test.id);
      setTestState((prev) => ({ ...prev, [test.id]: { status: "running" } }));
      logs.log("info", `▶ ${test.name}`);

      const t0 = performance.now();
      const ctx = {
        burst: (n) => traffic.burst(n, { updateUI: false }),
        setStrategy: async (s) => {
          await postJSON("/admin/strategy", { strategy: s });
          health.setStrategy(s);
        },
        serverAction: (name, action) =>
          postJSON(`/admin/servers/${name}/${action}`),
        resetLB: health.resetLB,
        showDistribution: (d) => traffic.setDistribution(d),
        fetchJSON,
        fetchRaw,
        servers: health.servers.slice(),
        originalStrategy: health.strategy,
        pass: (detail) => ({ pass: true, detail }),
        fail: (detail) => ({ pass: false, detail }),
      };

      try {
        const result = await test.run(ctx);
        const ms = Math.round(performance.now() - t0);
        setTestState((prev) => ({
          ...prev,
          [test.id]: {
            status: result.pass ? "pass" : "fail",
            detail: result.detail,
            ms,
          },
        }));
        logs.log(
          result.pass ? "success" : "error",
          `${result.pass ? "✓" : "✗"} ${test.name}: ${result.detail}`,
        );
      } catch (err) {
        const ms = Math.round(performance.now() - t0);
        setTestState((prev) => ({
          ...prev,
          [test.id]: { status: "error", detail: err.message, ms },
        }));
        logs.log("error", `✗ ${test.name}: ${err.message}`);
      } finally {
        runningRef.current = false;
        setRunningTestId(null);
      }
    },
    [logs, health, traffic],
  );

  const runAllTests = useCallback(async () => {
    logs.log("info", `▶▶ running all ${TESTS.length} tests`);
    for (const t of TESTS) await runTest(t);
    logs.log("success", "▶▶ all tests finished");
  }, [runTest, logs]);

  return { tests: TESTS, testState, runningTestId, runTest, runAllTests };
}
