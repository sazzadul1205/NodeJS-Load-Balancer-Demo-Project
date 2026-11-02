import { memo } from "react";
import BackendCard from "./BackendCard.jsx";

function BackendGrid({ servers, connected, busy, onAction }) {
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2.5">
      {servers.length === 0 && (
        <div className="col-span-full p-8 text-center text-muted">
          {connected ? "No servers registered." : "Connecting to LB…"}
        </div>
      )}
      {servers.map((s) => (
        <BackendCard key={s.name} server={s} busy={busy} onAction={onAction} />
      ))}
    </section>
  );
}

export default memo(BackendGrid);
