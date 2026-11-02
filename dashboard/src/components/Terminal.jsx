import { forwardRef } from "react";

const Terminal = forwardRef(function Terminal({ cmd, setCmd, onKeyDown }, ref) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 bg-panel border border-edge rounded-lg">
      <span className="text-ok font-bold text-sm">$</span>
      <input
        ref={ref}
        value={cmd}
        onChange={(e) => setCmd(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder='try "test round-robin", "reset", "burst 100", "help"'
        spellCheck={false}
        autoComplete="off"
        autoFocus
        className="flex-1 bg-transparent border-none text-fg font-mono text-[13px] py-1 outline-none caret-ok placeholder:text-[#4d5766]"
      />
    </div>
  );
});

export default Terminal;
