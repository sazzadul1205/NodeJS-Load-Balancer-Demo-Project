import { memo } from "react";
import StatusBadge from "./StatusBadge.jsx";

const BORDER = {
  healthy: "border-l-ok",
  down: "border-l-err",
  disabled: "border-l-muted",
  draining: "border-l-warn",
};

function BackendCard({ server, busy, onAction }) {
  const status = !server.enabled
    ? "disabled"
    : server.draining
      ? "draining"
      : server.healthy
        ? "healthy"
        : "down";

  return (
    <div
      className={`bg-panel border border-edge border-l-[3px] ${BORDER[status]} rounded-lg p-3 flex flex-col gap-2.5 transition-opacity ${
        status === "disabled" ? "opacity-60" : ""
      }`}
    >
      <div className="flex justify-between items-center">
        <span className="font-semibold text-brand">{server.name}</span>
        <StatusBadge status={status} />
      </div>

      <div className="flex gap-4 items-baseline">
        <div className="flex gap-1.5 items-baseline">
          <span className="text-muted text-[11px]">active</span>
          <span className="text-base font-semibold">
            {server.activeRequests}
          </span>
          {server.delta > 0 && (
            <span
              key={server.totalProxied}
              className="text-ok text-[10px] font-semibold animate-fade"
            >
              +{server.delta}
            </span>
          )}
        </div>
        <div className="flex gap-1.5 items-baseline">
          <span className="text-muted text-[11px]">total</span>
          <span className="text-base font-semibold">
            {server.totalProxied.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex gap-1.5">
        {server.enabled ? (
          <>
            <button
              className="btn"
              disabled={busy}
              onClick={() => onAction(server.name, "disable")}
            >
              disable
            </button>
            {server.draining ? (
              <button
                className="btn"
                disabled={busy}
                onClick={() => onAction(server.name, "undrain")}
              >
                undrain
              </button>
            ) : (
              <button
                className="btn"
                disabled={busy}
                onClick={() => onAction(server.name, "drain")}
              >
                drain
              </button>
            )}
          </>
        ) : (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onAction(server.name, "enable")}
          >
            enable
          </button>
        )}
      </div>

      {server.lastError && (
        <div className="text-[11px] text-err truncate">{server.lastError}</div>
      )}
    </div>
  );
}

// Only re-render when the fields BackendCard actually uses have changed.
export default memo(BackendCard, (prev, next) => {
  if (prev.busy !== next.busy) return false;
  if (prev.onAction !== next.onAction) return false;
  const a = prev.server;
  const b = next.server;
  return (
    a.name === b.name &&
    a.enabled === b.enabled &&
    a.healthy === b.healthy &&
    a.draining === b.draining &&
    a.activeRequests === b.activeRequests &&
    a.totalProxied === b.totalProxied &&
    a.delta === b.delta &&
    a.lastError === b.lastError
  );
});
