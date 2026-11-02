import { useState, useCallback, useMemo } from "react";

const MAX_LOG = 300;

export function useLogs() {
  const [entries, setEntries] = useState([]);

  const log = useCallback((level, msg) => {
    setEntries((prev) => {
      // Deduplicate consecutive identical messages — stops a failing poll
      // from filling the log with 300 copies of the same error.
      const last = prev[prev.length - 1];
      if (last && last.level === level && last.msg === msg) {
        const next = [...prev];
        next[next.length - 1] = { ...last, count: (last.count || 1) + 1 };
        return next;
      }
      const entry = {
        id: `${Date.now()}-${Math.random()}`,
        level,
        msg,
        ts: new Date(),
        count: 1,
      };
      const next = [...prev, entry];
      return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return useMemo(() => ({ entries, log, clear }), [entries, log, clear]);
}
