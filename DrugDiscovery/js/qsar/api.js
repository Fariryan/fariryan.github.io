/** QSAR API client. */
import { API_ORIGIN } from "../config.js";
const BASE = `${API_ORIGIN}/api/v1/qsar`;

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", ...(options.headers || {}) }, ...options,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const b = await response.json(); if (b?.detail) detail = b.detail; } catch { /* */ }
    throw new Error(detail);
  }
  return response.json();
}
const post = (p, payload) =>
  request(p, { method: "POST", headers: { "content-type": "application/json" },
               body: JSON.stringify(payload || {}) });

export const qsApi = {
  status: () => request("/status"),
  availableTargets: (minimum = 60) => request(`/datasets/available?minimum=${minimum}`),
  previewDataset: (payload) => post("/datasets/preview", payload),
  train: (payload) => post("/train", payload),
  models: (promotedOnly = false) => request(`/models?promoted_only=${promotedOnly}`),
  model: (id) => request(`/models/${id}`),
  predict: (payload) => post("/predict", payload),
};
