import { useCallback, useMemo } from "react";
import { LB_URL } from "../api.js";

export function useReset({ log, resetLB, setDistribution }) {
  const resetAllData = useCallback(
    async (silent = false) => {
      if (!silent) log("info", "resetting all data…");
      let blogOk = false;
      let lbOk = false;

      try {
        const r = await fetch(`${LB_URL}/api/admin/reset`, { method: "POST" });
        blogOk = r.ok;
        if (!r.ok && r.status !== 404)
          log("warn", `blog reset: HTTP ${r.status}`);
        if (r.status === 404)
          log("warn", "blog /api/admin/reset not found — DB not cleared");
      } catch (err) {
        if (!silent) log("warn", `blog reset: ${err.message}`);
      }

      try {
        await resetLB();
        lbOk = true;
      } catch (err) {
        if (!silent) log("error", `LB reset: ${err.message}`);
      }

      setDistribution({});
      if (!silent) {
        if (blogOk && lbOk)
          log("success", "all data reset (blog DB + LB counters)");
        else if (lbOk)
          log("success", "LB counters reset (blog DB not cleared)");
        else log("error", "reset failed");
      }
      return { blogOk, lbOk };
    },
    [log, resetLB, setDistribution],
  );

  return useMemo(() => ({ resetAllData }), [resetAllData]);
}
