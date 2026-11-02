import StatusBadge from "./StatusBadge.jsx";

export default function TestsPanel({
  tests,
  testState,
  runningTestId,
  onRun,
  onRunAll,
  onReset,
}) {
  const anyRunning = !!runningTestId;

  return (
    <div className="flex-1 min-h-0 bg-panel border border-edge rounded-lg flex flex-col overflow-hidden">
      <div className="flex justify-between items-center px-3 py-2 border-b border-edge text-[11px] tracking-widest text-muted uppercase">
        <span>TESTS — {tests.length}</span>
        <div className="flex gap-1.5 items-center normal-case tracking-normal">
          <button
            className="btn btn-ghost"
            disabled={anyRunning}
            onClick={onReset}
            title="Truncate blog DB + zero LB counters"
          >
            reset data
          </button>
          <button
            className="btn btn-primary"
            disabled={anyRunning}
            onClick={onRunAll}
          >
            ▶ run all
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {tests.map((t) => {
          const st = testState[t.id];
          const status = st?.status || "idle";
          const isRunning = status === "running";
          const borderColor = {
            idle: "border-l-edge",
            running: "border-l-info bg-info/5",
            pass: "border-l-ok bg-ok/5",
            fail: "border-l-err bg-err/5",
            error: "border-l-warn bg-warn/5",
          }[status];

          return (
            <div
              key={t.id}
              className={`bg-panel-deep border border-edge border-l-[3px] ${borderColor} rounded-md px-2.5 py-2 flex flex-col gap-1`}
            >
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-xs text-fg">{t.name}</span>
                <StatusBadge status={status} />
              </div>
              <div className="text-[11px] text-muted leading-snug">
                {t.description}
              </div>
              {st?.detail && (
                <div
                  className={`text-[11px] bg-black/30 rounded px-1.5 py-1 break-all ${
                    status === "pass"
                      ? "text-ok"
                      : status === "fail" || status === "error"
                        ? "text-err"
                        : "text-fg"
                  }`}
                >
                  {st.detail}
                </div>
              )}
              <div className="flex gap-2 items-center mt-0.5">
                <button
                  disabled={anyRunning}
                  onClick={() => onRun(t)}
                  className={`btn ${isRunning ? "" : "!px-2 !py-0.5 !text-[11px]"}`}
                >
                  {isRunning
                    ? "running…"
                    : st?.ms != null
                      ? `rerun (${st.ms}ms)`
                      : "run"}
                </button>
                {st?.ms != null && !isRunning && (
                  <span className="text-muted text-[11px]">
                    last: {st.ms}ms
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
