import { useRef, useEffect, useMemo } from "react";

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
  const logs = useLogs();
  const health = useHealthPoll(logs.log);
  const traffic = useTraffic(logs.log);

  // Refs for hooks that need "latest value at call time" without
  // re-creating callbacks on every poll.
  const serversRef = useRef([]);
  const strategyRef = useRef("");
  const healthSnapshotRef = useRef(null);
  useEffect(() => {
    serversRef.current = health.servers;
  }, [health.servers]);
  useEffect(() => {
    strategyRef.current = health.strategy;
  }, [health.strategy]);
  useEffect(() => {
    healthSnapshotRef.current = health.health;
  }, [health.health]);

  const reset = useReset({
    log: logs.log,
    resetLB: health.resetLB,
    setDistribution: traffic.setDistribution,
  });

  const tests = useTests({
    log: logs.log,
    burst: traffic.burst,
    stopTraffic: traffic.stopTraffic,
    setDistribution: traffic.setDistribution,
    setStrategy: health.setStrategy,
    resetLB: health.resetLB,
    serversRef,
    strategyRef,
  });

  const cli = useCommandLine({
    log: logs.log,
    clearLogs: logs.clear,
    healthSnapshotRef,
    changeStrategy: health.changeStrategy,
    serverAction: health.serverAction,
    setPaused: health.setPaused,
    burst: traffic.burst,
    startTraffic: traffic.startTraffic,
    stopTraffic: traffic.stopTraffic,
    setDistribution: traffic.setDistribution,
    tests,
    reset,
  });

  return (
    <div className="grid grid-rows-[auto_auto_1fr_auto] gap-2.5 h-screen p-2.5">
      <Header
        health={health.health}
        connected={health.connected}
        paused={health.paused}
        onTogglePause={() => health.setPaused((p) => !p)}
        strategy={health.strategy}
        onChangeStrategy={health.changeStrategy}
        onBurst100={() => traffic.burst(100)}
        onBurst1000={() => traffic.burst(1000)}
        trafficRunning={traffic.trafficRunning}
        onStartTraffic={() => traffic.startTraffic(20)}
        onStopTraffic={traffic.stopTraffic}
        onPollNow={health.pollNow}
        lastPollAt={health.lastPollAt}
        pollLatency={health.pollLatency}
        pollErrorCount={health.pollErrorCount}
        polling={health.polling}
      />

      <BackendGrid
        servers={health.servers}
        connected={health.connected}
        busy={!!tests.runningTestId}
        onAction={health.serverAction}
      />

      <main className="flex gap-2.5 min-h-0">
        <LogPanel logs={logs.entries} onClear={logs.clear} />
        <div className="flex-1 min-w-[300px] flex flex-col gap-2.5 min-h-0">
          <DistributionPanel
            distribution={traffic.distribution}
            progress={traffic.burstProgress}
          />
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
