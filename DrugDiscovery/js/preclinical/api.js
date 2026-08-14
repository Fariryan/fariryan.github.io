/** Preclinical laboratory API client. */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/preclinical`;
const cache = new Map();

async function request(path, { method = "GET", body, useCache = false } = {}) {
  const key = `${method} ${path}`;
  if (method === "GET" && useCache && cache.has(key)) return cache.get(key);

  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(BASE + path, options);
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      detail = (await response.json()).detail || detail;
    } catch {
      /* keep the status */
    }
    throw new Error(detail);
  }
  const data = await response.json();
  if (method === "GET" && useCache) cache.set(key, data);
  return data;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
};

export const pcApi = {
  status: () => request("/status", { useCache: true }),
  vocabulary: () => request("/vocabulary", { useCache: true }),

  cellModels: (params) => request(`/cell-models${qs(params)}`),
  cellModel: (identifier) => request(`/cell-models/${encodeURIComponent(identifier)}`),

  measuredInVitro: (params) => request(`/invitro/measured${qs(params)}`),
  simulate: (payload) => request("/invitro/simulate", { method: "POST", body: payload }),

  dock: (payload) => request("/docking", { method: "POST", body: payload }),
  dockingEngine: () => request("/docking/engine", { useCache: true }),
  dynamics: (payload) => request("/dynamics", { method: "POST", body: payload }),
  dynamicsEngine: () => request("/dynamics/engine", { useCache: true }),

  pkpd: (payload) => request("/pkpd", { method: "POST", body: payload }),
  mouseModels: (params) => request(`/mouse/models${qs(params)}`),
  report: (id) => request(`/report/${encodeURIComponent(id)}`),
};

/** Job polling reuses Discovery Lab's queue endpoints. */
export async function awaitJob(jobId, onProgress, { intervalMs = 1500, timeoutMs = 1800000 } = {}) {
  const started = Date.now();
  for (;;) {
    const response = await fetch(`${API_ORIGIN}/api/v1/lab/jobs/${jobId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const job = await response.json();
    onProgress?.(job);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    if (Date.now() - started > timeoutMs) throw new Error("Job is still running.");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
