/** Molecular-dynamics API client. */
import { API_ORIGIN } from "../config.js";
const BASE = `${API_ORIGIN}/api/v1/md`;

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

export const mdApi = {
  status: () => request("/status"),
  submit: (payload) => post("/runs", payload),
  runs: (limit = 40) => request(`/runs?limit=${limit}`),
  run: (id) => request(`/runs/${id}`),
  structure: (id, which = "final") => request(`/runs/${id}/structure?which=${which}`),
  trajectory: (id, stride = 1) => request(`/runs/${id}/trajectory?stride=${stride}`),
  cancel: (id) => post(`/runs/${id}/cancel`, {}),
  freeEnergyStatus: () => request("/free-energy/status"),
  planNetwork: (transformations) => post("/free-energy/network", { transformations }),
};
