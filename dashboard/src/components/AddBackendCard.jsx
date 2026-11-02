import { useState, memo } from "react";

function AddBackendCard({ onAdd, disabled, suggestedPort = 9001 }) {
  const [open, setOpen] = useState(false);
  const [port, setPort] = useState("");
  const [weight, setWeight] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setOpen(false);
    setPort("");
    setWeight("1");
    setError(null);
  };

  const openForm = () => {
    setPort(String(suggestedPort));
    setWeight("1");
    setError(null);
    setOpen(true);
  };

  const submit = async (e) => {
    e?.preventDefault();
    const p = parseInt(port, 10);
    const w = parseInt(weight || "1", 10);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      setError("port must be 1–65535");
      return;
    }
    if (!Number.isInteger(w) || w < 1) {
      setError("weight must be ≥ 1");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(p, w);
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={openForm}
        disabled={disabled}
        className="border border-dashed border-edge rounded-lg p-3 flex items-center justify-center text-muted hover:text-brand hover:border-brand/40 transition-colors min-h-[120px] bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + add backend
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-panel border border-edge border-l-[3px] border-l-info rounded-lg p-3 flex flex-col gap-2.5"
    >
      <div className="flex justify-between items-center">
        <span className="font-semibold text-info text-xs uppercase tracking-widest">
          add backend
        </span>
        <button
          type="button"
          onClick={reset}
          className="btn btn-ghost"
          disabled={submitting}
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted text-[10px] uppercase tracking-widest">
            port
          </span>
          <input
            autoFocus
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={submitting}
            placeholder="9004"
            className="bg-panel-deep border border-edge rounded px-2 py-1 text-fg text-xs font-mono outline-none focus:border-info w-full"
          />
        </label>
        <label className="flex flex-col gap-0.5 w-16">
          <span className="text-muted text-[10px] uppercase tracking-widest">
            weight
          </span>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            disabled={submitting}
            min="1"
            className="bg-panel-deep border border-edge rounded px-2 py-1 text-fg text-xs font-mono outline-none focus:border-info w-full"
          />
        </label>
      </div>

      {error && <div className="text-err text-[11px]">{error}</div>}

      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={submitting || !port}
          className="btn btn-primary flex-1"
        >
          {submitting ? "adding…" : "add"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={submitting}
          className="btn"
        >
          cancel
        </button>
      </div>
    </form>
  );
}

export default memo(AddBackendCard);
