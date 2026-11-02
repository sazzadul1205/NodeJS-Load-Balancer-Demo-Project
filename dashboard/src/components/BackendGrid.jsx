import { memo } from "react";
import BackendCard from "./BackendCard.jsx";
import AddBackendCard from "./AddBackendCard.jsx";

function BackendGrid({
  servers,
  connected,
  busy,
  onAction,
  onRemove,
  onAdd,
  suggestedPort,
}) {
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
      {servers.length === 0 && !connected && (
        <div className="col-span-full p-8 text-center text-muted">
          Connecting to LB…
        </div>
      )}
      {servers.map((s) => (
        <BackendCard
          key={s.name}
          server={s}
          busy={busy}
          onAction={onAction}
          onRemove={onRemove}
        />
      ))}
      <AddBackendCard
        onAdd={onAdd}
        disabled={busy || !connected}
        suggestedPort={suggestedPort}
      />
    </section>
  );
}

export default memo(BackendGrid);
