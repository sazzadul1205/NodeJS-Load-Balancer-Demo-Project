import { useEffect, useRef } from "react";

const LEVEL_CLASS = {
  info: "text-fg",
  success: "text-ok",
  error: "text-err",
  warn: "text-warn",
  cmd: "text-info",
};

export default function LogPanel({ logs, onClear }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div className="flex-[2] min-w-0 bg-panel border border-edge rounded-lg flex flex-col min-h-0 overflow-hidden">
      <div className="flex justify-between items-center px-3 py-2 border-b border-edge text-[11px] tracking-widest text-muted uppercase">
        <span>LIVE LOG</span>
        <button className="btn btn-ghost" onClick={onClear}>
          clear
        </button>
      </div>
      <div
        ref={ref}
        className="flex-1 overflow-y-auto px-2.5 py-1.5 text-xs bg-panel-deep"
      >
        {logs.map((l) => (
          <div key={l.id} className="flex gap-2.5 py-px">
            <span className="text-[#4d5766] shrink-0">
              {l.ts.toLocaleTimeString("en-GB", { hour12: false })}
            </span>
            <span className={`break-all ${LEVEL_CLASS[l.level] || "text-fg"}`}>
              {l.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}