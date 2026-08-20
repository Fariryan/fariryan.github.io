/** Docking API client. */
import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/docking`;

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* status line only */
    }
    throw new Error(detail);
  }
  return response.json();
}

const post = (path, payload) =>
  request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
  });

export const dkApi = {
  status: () => request("/status"),
  previewSite: (payload) => post("/site/preview", payload),
  submit: (payload) => post("/campaigns", payload),
  campaigns: (limit = 50) => request(`/campaigns?limit=${limit}`),
  campaign: (id) => request(`/campaigns/${id}`),
  ranking: (id) => request(`/campaigns/${id}/ranking`),
  cancel: (id) => post(`/campaigns/${id}/cancel`, {}),
  run: (id) => request(`/runs/${id}`),
  pose: (runId, rank) => request(`/runs/${runId}/poses/${rank}`),
};
