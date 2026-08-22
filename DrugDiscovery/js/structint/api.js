/** Protein Structure Intelligence API client. */
import { API_ORIGIN } from "../config.js";
const BASE = `${API_ORIGIN}/api/v1/structure-intelligence`;

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

export const psiApi = {
  status: () => request("/status"),
  coordinates: (pdbId) => request(`/structures/${encodeURIComponent(pdbId)}/coordinates`),
  analysis: (pdbId, kind, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/structures/${encodeURIComponent(pdbId)}/${kind}${query ? `?${query}` : ""}`);
  },
  analyze: (payload) => post("/analyze", payload),
  dock: (payload) => post("/dock", payload),
  targetStructures: (nodeId) => request(`/targets/${nodeId}/structures`),
  // Jobs are ordinary lab_jobs rows; the platform's existing route serves them.
  job: (id) => fetch(`${API_ORIGIN}/api/v1/lab/jobs/${id}`, {
    headers: { accept: "application/json" },
  }).then((r) => r.json()),
};
