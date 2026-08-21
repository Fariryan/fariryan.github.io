/** Chemical Gradient Optimizer API client. */
import { API_ORIGIN } from "../config.js";
const BASE = `${API_ORIGIN}/api/v1/optimizer`;

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

export const optimizerApi = {
  status: () => request("/status"),
  transformations: () => request("/transformations"),
  preview: (smiles, limit = 24) => post("/preview", { smiles, limit }),
  submit: (payload) => post("/runs", payload),
  runs: (limit = 30) => request(`/runs?limit=${limit}`),
  run: (id) => request(`/runs/${id}`),
  candidates: (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/runs/${id}/candidates${query ? `?${query}` : ""}`);
  },
  candidate: (runId, id) => request(`/runs/${runId}/candidates/${id}`),
  lineage: (id) => request(`/runs/${id}/lineage`),
  pareto: (id) => request(`/runs/${id}/pareto`),
  matchedPairs: (id, support = 2) =>
    request(`/runs/${id}/matched-pairs?minimum_support=${support}`),
  cancel: (id) => post(`/runs/${id}/cancel`, {}),
  tune: (smiles, trials = 12) => post("/tune", { smiles, trials }),
};
