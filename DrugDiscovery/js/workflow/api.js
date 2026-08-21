/** Automated discovery workflow API client. */
import { API_ORIGIN } from "../config.js";
const BASE = `${API_ORIGIN}/api/v1/workflow`;

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", ...(options.headers || {}) }, ...options });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const b = await response.json(); if (b?.detail) detail = b.detail; } catch { /* */ }
    throw new Error(detail);
  }
  return response.json();
}
const post = (p, payload) => request(p, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(payload || {}) });

export const workflowApi = {
  status: () => request("/status"),
  plan: (payload) => post("/plan", payload),
  submit: (payload) => post("/runs", payload),
  runs: (limit = 30) => request(`/runs?limit=${limit}`),
  run: (id) => request(`/runs/${id}`),
  step: (runId, key) => request(`/runs/${runId}/steps/${encodeURIComponent(key)}`),
  artifact: (runId, id) => request(`/runs/${runId}/artifacts/${id}`),
  graph: (id) => request(`/runs/${id}/graph`),
  resume: (id) => post(`/runs/${id}/resume`, {}),
  cancel: (id) => post(`/runs/${id}/cancel`, {}),
};
