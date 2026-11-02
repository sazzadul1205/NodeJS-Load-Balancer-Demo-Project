import { useCallback } from "react";

import { useLogs } from "./lib/hooks/useLogs.js";
import { useHealthPoll } from "./lib/hooks/useHealthPoll.js";
import { useTraffic } from "./lib/hooks/useTraffic.js";
import { useReset } from "./lib/hooks/useReset.js";
import { useTests } from "./lib/hooks/useTests.js";
import { useCommandLine } from "./lib/hooks/useCommandLine.js";

import Header from "./components/Header.jsx";
import BackendGrid from "./components/BackendGrid.jsx";
import LogPanel from "./components/LogPanel.jsx";
import DistributionPanel from "./components/DistributionPanel.jsx";
import TestsPanel from "./components/TestsPanel.jsx";
import Terminal from "./components/Terminal.jsx";

export default function App() {
  // Compose hooks in dependency order — no cycles.
  const logs = useLogs();
  const health = useHealthPoll(logs.log);
  const traffic = useTraffic(logs.log);
  const reset = useReset({ logs, health, traffic });
  const tests = useTests({ logs, health, traffic });
  const cli = useCommandLine({ logs, health, traffic, tests, reset });

  // UI-safe wrappers: hooks throw, we catch + log here so buttons never crash.
  const safeChangeStrategy = useCallback(
    (s) =>
      health
        .changeStrategy(s)
        .catch((err) =>
          logs.log("error", `strategy change failed: ${err.message}`),
        ),
    [health, logs],
  );

  const safeServerAction = useCallback(
    (name, action) =>
      health
        .serverAction(name, action)
        .catch((err) =>
          logs.log("error", `${action} ${name} failed: ${err.message}`),
        ),
    [health, logs],
  );

  return (
    <div className="grid grid-rows-[auto_auto_1fr_auto] gap-2.5 h-screen p-2.5">
      <Header
        health={health.health}
        connected={health.connected}
        paused={health.paused}
        onTogglePause={() => health.setPaused((p) => !p)}
        strategy={health.strategy}
        onChangeStrategy={safeChangeStrategy}
        onBurst100={() => traffic.burst(100)}
        onBurst1000={() => traffic.burst(1000)}
        trafficRunning={traffic.trafficRunning}
        onStartTraffic={() => traffic.startTraffic(20)}
        onStopTraffic={traffic.stopTraffic}
      />

      <BackendGrid
        servers={health.servers}
        connected={health.connected}
        busy={!!tests.runningTestId}
        onAction={safeServerAction}
      />

      <main className="flex gap-2.5 min-h-0">
        <LogPanel logs={logs.entries} onClear={logs.clear} />
        <div className="flex-1 min-w-[300px] flex flex-col gap-2.5 min-h-0">
          <DistributionPanel distribution={traffic.distribution} />
          <TestsPanel
            tests={tests.tests}
            testState={tests.testState}
            runningTestId={tests.runningTestId}
            onRun={tests.runTest}
            onRunAll={tests.runAllTests}
            onReset={() => reset.resetAllData()}
          />
        </div>
      </main>

      <Terminal cmd={cli.cmd} setCmd={cli.setCmd} onKeyDown={cli.onKeyDown} />
    </div>
  );
}
