import { useState, useCallback, useRef, useMemo } from "react";
import { TESTS } from "../../tests.js";
import { fetchJSON, fetchRaw, postJSON } from "../api.js";

export function useTests({
  log,
  burst,
  stopTraffic,
  setDistribution,
  setStrategy,
  resetLB,
  serversRef,
  strategyRef,
}) {
  const [testState, setTestState] = useState({});
  const [runningTestId, setRunningTestId] = useState(null);
  const runningRef = useRef(false);

  const runTest = useCallback(
    async (test) => {
      if (runningRef.current) return;
      runningRef.current = true;
      stopTraffic();

      setRunningTestId(test.id);
      setTestState((prev) => ({ ...prev, [test.id]: { status: "running" } }));
      log("info", `▶ ${test.name}`);

      const t0 = performance.now();
      const ctx = {
        burst: (n) => burst(n, { updateUI: false }),
        setStrategy: async (s) => {
          await postJSON("/admin/strategy", { strategy: s });
          setStrategy(s);
        },
        serverAction: (name, action) =>
          postJSON(`/admin/servers/${name}/${action}`),
        resetLB,
        showDistribution: setDistribution,
        fetchJSON,
        fetchRaw,
        servers: (serversRef.current || []).slice(),
        originalStrategy: strategyRef.current,
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
        log(
          result.pass ? "success" : "error",
          `${result.pass ? "✓" : "✗"} ${test.name}: ${result.detail}`,
        );
      } catch (err) {
        const ms = Math.round(performance.now() - t0);
        setTestState((prev) => ({
          ...prev,
          [test.id]: { status: "error", detail: err.message, ms },
        }));
        log("error", `✗ ${test.name}: ${err.message}`);
      } finally {
        runningRef.current = false;
        setRunningTestId(null);
      }
    },
    [
      log,
      burst,
      stopTraffic,
      setDistribution,
      setStrategy,
      resetLB,
      serversRef,
      strategyRef,
    ],
  );

  const runAllTests = useCallback(async () => {
    log("info", `▶▶ running all ${TESTS.length} tests`);
    for (const t of TESTS) await runTest(t);
    log("success", "▶▶ all tests finished");
  }, [runTest, log]);

  return useMemo(
    () => ({ tests: TESTS, testState, runningTestId, runTest, runAllTests }),
    [testState, runningTestId, runTest, runAllTests],
  );
}
