export const LB_URL = import.meta.env.VITE_LB_URL || "http://localhost:8000";
export const TARGET_PATH =
  import.meta.env.VITE_TARGET_PATH || "/api/posts?limit=5";

export async function fetchJSON(
  path,
  { method = "GET", body, headers = {} } = {},
) {
  const h = { ...headers };
  if (body) h["Content-Type"] = "application/json";
  const r = await fetch(`${LB_URL}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export function fetchRaw(path, opts = {}) {
  return fetch(`${LB_URL}${path}`, opts);
}

export async function postJSON(path, body) {
  const r = await fetch(`${LB_URL}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
