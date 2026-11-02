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

export default function StatusBadge({ status }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded font-semibold ${
        STYLES[status] || STYLES.idle
      }`}
    >
      {status}
    </span>
  );
}
