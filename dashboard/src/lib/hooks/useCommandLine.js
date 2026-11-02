import { useState, useCallback, useMemo } from "react";
import { STRATEGIES } from "../constants.js";
import { fetchJSON } from "../api.js";

export function useCommandLine({
  log,
  clearLogs,
  healthSnapshotRef,
  changeStrategy,
  serverAction,
  setPaused,
  burst,
  startTraffic,
  stopTraffic,
  setDistribution,
  tests,
  reset,
}) {
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);

  const run = useCallback(
    async (raw) => {
      const line = raw.trim();
      if (!line) return;
      setHistory((prev) => [...prev, line]);
      setHistIdx(-1);
      log("cmd", `> ${line}`);

      const [name, ...args] = line.split(/\s+/);
      const n = name.toLowerCase();

      try {
        switch (n) {
          case "help":
            log(
              "info",
              "help | health | config | clear | burst <n> | traffic start <rps> | traffic stop | strategy <name> | enable|disable|drain|undrain <name> | reset | test <id> | tests | poll",
            );
            break;
          case "health":
            if (healthSnapshotRef.current)
              log("info", JSON.stringify(healthSnapshotRef.current));
            else log("warn", "no health snapshot yet");
            break;
          case "config": {
            const r = await fetchJSON("/admin/config");
            log(
              "info",
              `strategy=${r.strategy} ports=${r.ports?.join(",")} weights=${JSON.stringify(r.weights || {})}`,
            );
            break;
          }
          case "clear":
            clearLogs();
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
            if (!args[0]) return log("error", `usage: ${n} <server-name>`);
            await serverAction(args[0], n);
            break;
          case "reset":
            await reset.resetAllData();
            break;
          case "tests":
            log("info", tests.tests.map((t) => `  ${t.id}`).join("\n"));
            break;
          case "test": {
            const t = tests.tests.find((x) => x.id === args[0]);
            if (!t)
              return log("error", `no test with id "${args[0]}". Try "tests".`);
            await tests.runTest(t);
            break;
          }
          case "pause":
            setPaused(true);
            break;
          case "resume":
            setPaused(false);
            break;
          default:
            log("error", `unknown command: "${name}". Type "help".`);
        }
      } catch (err) {
        log("error", `command failed: ${err.message}`);
      }
    },
    [
      log,
      clearLogs,
      healthSnapshotRef,
      changeStrategy,
      serverAction,
      setPaused,
      burst,
      startTraffic,
      stopTraffic,
      setDistribution,
      tests,
      reset,
    ],
  );

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        run(cmd);
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
        clearLogs();
      }
    },
    [cmd, history, histIdx, run, clearLogs],
  );

  return useMemo(
    () => ({ cmd, setCmd, run, onKeyDown }),
    [cmd, run, onKeyDown],
  );
}
