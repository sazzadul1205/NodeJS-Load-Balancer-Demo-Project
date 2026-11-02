import { STRATEGIES } from "../lib/constants.js";

export default function Header({
  health,
  connected,
  paused,
  onTogglePause,
  strategy,
  onChangeStrategy,
  onBurst100,
  onBurst1000,
  trafficRunning,
  onStartTraffic,
  onStopTraffic,
}) {
  const available = health?.available ?? 0;
  const total = health?.total ?? 0;
  const proxied = health?.lb?.totalProxied ?? 0;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-3.5 py-2.5 bg-panel border border-edge rounded-lg">
      <div className="flex items-center gap-5 flex-wrap">
        <h1 className="m-0 text-sm font-semibold tracking-widest text-brand">
          ⚡ LB CONTROL CENTER
        </h1>
        <div className="flex gap-3.5 items-center">
          <span className="flex gap-1.5 items-baseline">
            <span className="text-muted text-[11px]">up</span>
            <span className="font-semibold">
              {available}/{total}
            </span>
          </span>
          <span className="flex gap-1.5 items-baseline">
            <span className="text-muted text-[11px]">proxied</span>
            <span className="font-semibold">{proxied.toLocaleString()}</span>
          </span>
          <span className="flex gap-1.5 items-center">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected
                  ? "bg-ok shadow-[0_0_8px_#3fb950]"
                  : "bg-err shadow-[0_0_8px_#f85149]"
              }`}
            />
            <span className="text-muted text-[11px]">
              {connected ? "live" : "offline"}
            </span>
          </span>
          {paused && <span className="text-warn font-semibold">PAUSED</span>}
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <label className="flex items-center gap-1.5">
          <span className="text-muted text-[11px]">strategy</span>
          <select
            value={strategy}
            onChange={(e) => onChangeStrategy(e.target.value)}
            className="bg-panel-deep text-fg border border-edge rounded px-2 py-1 text-xs font-mono cursor-pointer focus:outline-none focus:border-info"
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={onBurst100}>
          burst 100
        </button>
        <button className="btn" onClick={onBurst1000}>
          burst 1000
        </button>
        {trafficRunning ? (
          <button className="btn btn-danger" onClick={onStopTraffic}>
            ■ stop traffic
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onStartTraffic}>
            ▶ 20 rps
          </button>
        )}
        <button className="btn btn-ghost" onClick={onTogglePause}>
          {paused ? "▶" : "⏸"}
        </button>
      </div>
    </header>
  );
}
