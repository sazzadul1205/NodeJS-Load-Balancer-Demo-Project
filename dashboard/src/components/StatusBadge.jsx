import { memo } from "react";

const STYLES = {
  healthy: "text-ok bg-ok/10",
  down: "text-err bg-err/10",
  disabled: "text-muted bg-muted/10",
  draining: "text-warn bg-warn/10",
  running: "text-info bg-info/10",
  pass: "text-ok bg-ok/10",
  fail: "text-err bg-err/10",
  error: "text-warn bg-warn/10",
  idle: "text-muted bg-muted/10",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded font-semibold ${
        STYLES[status] || STYLES.idle
      }`}
    >
      {status === "running" && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-info animate-pulse-ok" />
      )}
      {status}
    </span>
  );
}

export default memo(StatusBadge);
