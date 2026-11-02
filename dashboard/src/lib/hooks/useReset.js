import { useCallback } from "react";
import { LB_URL } from "../api.js";

export function useReset({ logs, health, traffic }) {
  const resetAllData = useCallback(
    async (silent = false) => {
      if (!silent) logs.log("info", "resetting all data…");
      let blogOk = false;
      let lbOk = false;

      try {
        const r = await fetch(`${LB_URL}/api/admin/reset`, { method: "POST" });
        blogOk = r.ok;
        if (!r.ok && r.status !== 404)
          logs.log("warn", `blog reset: HTTP ${r.status}`);
        if (r.status === 404)
          logs.log("warn", "blog /api/admin/reset not found — DB not cleared");
      } catch (err) {
        if (!silent) logs.log("warn", `blog reset: ${err.message}`);
      }

      try {
        await health.resetLB();
        lbOk = true;
      } catch (err) {
        if (!silent) logs.log("error", `LB reset: ${err.message}`);
      }

      traffic.setDistribution({});
      if (!silent) {
        if (blogOk && lbOk)
          logs.log("success", "all data reset (blog DB + LB counters)");
        else if (lbOk)
          logs.log("success", "LB counters reset (blog DB not cleared)");
        else logs.log("error", "reset failed");
      }
      return { blogOk, lbOk };
    },
    [logs, health, traffic],
  );

  return { resetAllData };
}
