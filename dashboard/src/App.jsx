import { useRef, useEffect, useMemo, useCallback } from "react";

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

  // Stable refs — survive re-renders so memoized children don't churn.
  const { addServer, removeServer, serverAction, changeStrategy } = health;

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
    changeStrategy,
    serverAction,
    addServer,
    removeServer,
    setPaused: health.setPaused,
    burst: traffic.burst,
    startTraffic: traffic.startTraffic,
    stopTraffic: traffic.stopTraffic,
    setDistribution: traffic.setDistribution,
    tests,
    reset,
  });

  // Stable wrappers used by the grid.
  const handleAddServer = useCallback(
    (port, weight) => addServer(port, weight),
    [addServer],
  );
  const handleRemoveServer = useCallback(
    (name) => removeServer({ name }).catch(() => {}),
    [removeServer],
  );

  // Suggest "next port" for the add-backend form.
  const suggestedPort = useMemo(() => {
    const ports = health.servers
      .map((s) => parseInt(s.name.replace(/^api-/, ""), 10))
      .filter((n) => Number.isInteger(n));
    return ports.length ? Math.max(...ports) + 1 : 9001;
  }, [health.servers]);

  return (
    <div className="grid grid-rows-[auto_auto_1fr_auto] gap-2.5 h-screen p-2.5">
      <Header
        health={health.health}
        connected={health.connected}
        paused={health.paused}
        onTogglePause={() => health.setPaused((p) => !p)}
        strategy={health.strategy}
        onChangeStrategy={changeStrategy}
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
        onAction={serverAction}
        onRemove={handleRemoveServer}
        onAdd={handleAddServer}
        suggestedPort={suggestedPort}
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
