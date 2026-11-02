export default function DistributionPanel({ distribution }) {
  const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);

  return (
    <div className="shrink-0 max-h-[220px] bg-panel border border-edge rounded-lg flex flex-col overflow-hidden">
      <div className="flex justify-between items-center px-3 py-2 border-b border-edge text-[11px] tracking-widest text-muted uppercase">
        <span>DISTRIBUTION — X-Instance</span>
        {total > 0 && (
          <span className="text-muted text-[11px]">{total} req</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2.5 flex flex-col gap-2">
        {total === 0 ? (
          <div className="text-muted text-[11px] p-3.5">
            Run a test or <code>burst 100</code> to prove round-robin.
          </div>
        ) : (
          entries.map(([name, count]) => {
            const pct = (count / total) * 100;
            return (
              <div
                key={name}
                className="grid grid-cols-[90px_1fr_90px] gap-2 items-center text-xs"
              >
                <span className="text-brand font-semibold">{name}</span>
                <div className="h-2.5 bg-[#1a2230] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-info to-accent transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-right font-semibold">
                  {count}{" "}
                  <span className="text-muted text-[11px]">
                    ({pct.toFixed(0)}%)
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
