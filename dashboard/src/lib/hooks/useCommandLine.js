import { useState, useCallback } from "react";
import { STRATEGIES } from "../constants.js";
import { fetchJSON } from "../api.js";

export function useCommandLine({ logs, health, traffic, tests, reset }) {
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);

  const run = useCallback(
    async (raw) => {
      const line = raw.trim();
      if (!line) return;
      setHistory((prev) => [...prev, line]);
      setHistIdx(-1);
      logs.log("cmd", `> ${line}`);

      const [name, ...args] = line.split(/\s+/);
      const n = name.toLowerCase();

      try {
        switch (n) {
          case "help":
            logs.log(
              "info",
              "help | health | config | clear | burst <n> | traffic start <rps> | traffic stop | strategy <name> | enable|disable|drain|undrain <name> | reset | test <id> | tests",
            );
            break;
          case "health":
            if (health.health) logs.log("info", JSON.stringify(health.health));
            break;
          case "config": {
            const r = await fetchJSON("/admin/config");
            logs.log(
              "info",
              `strategy=${r.strategy} ports=${r.ports?.join(",")} weights=${JSON.stringify(r.weights || {})}`,
            );
            break;
          }
          case "clear":
            logs.clear();
            traffic.setDistribution({});
            break;
          case "strategy":
            if (!args[0])
              return logs.log(
                "error",
                `usage: strategy ${STRATEGIES.join("|")}`,
              );
            await health.changeStrategy(args[0]);
            break;
          case "burst":
            await traffic.burst(
              Math.min(5000, parseInt(args[0] || "100", 10) || 100),
            );
            break;
          case "traffic":
            if (args[0] === "start")
              traffic.startTraffic(
                Math.min(500, parseInt(args[1] || "20", 10) || 20),
              );
            else if (args[0] === "stop") traffic.stopTraffic();
            else logs.log("error", "usage: traffic start <rps> | traffic stop");
            break;
          case "enable":
          case "disable":
          case "drain":
          case "undrain":
            if (!args[0]) return logs.log("error", `usage: ${n} <server-name>`);
            await health.serverAction(args[0], n);
            break;
          case "reset":
            await reset.resetAllData();
            break;
          case "tests":
            logs.log("info", tests.tests.map((t) => `  ${t.id}`).join("\n"));
            break;
          case "test": {
            const t = tests.tests.find((x) => x.id === args[0]);
            if (!t)
              return logs.log(
                "error",
                `no test with id "${args[0]}". Try "tests".`,
              );
            await tests.runTest(t);
            break;
          }
          case "pause":
            health.setPaused(true);
            logs.log("info", "polling paused");
            break;
          case "resume":
            health.setPaused(false);
            logs.log("info", "polling resumed");
            break;
          default:
            logs.log("error", `unknown command: "${name}". Type "help".`);
        }
      } catch (err) {
        logs.log("error", `command failed: ${err.message}`);
      }
    },
    [logs, health, traffic, tests, reset],
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
        logs.clear();
      }
    },
    [cmd, history, histIdx, run, logs],
  );

  return { cmd, setCmd, run, onKeyDown };
}
