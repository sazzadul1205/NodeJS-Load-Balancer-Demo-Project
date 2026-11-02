import { useState, useCallback } from "react";

const MAX_LOG = 300;

export function useLogs() {
  const [entries, setEntries] = useState([]);

  const log = useCallback((level, msg) => {
    setEntries((prev) => {
      const next = [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, level, msg, ts: new Date() },
      ];
      return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
    });
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, log, clear };
}
