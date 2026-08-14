/**
 * Discovery Lab API client.
 *
 * Separate from the atlas client so the two caches cannot interfere: the atlas
 * memoises aggressively because its data only changes when an ingestion runs,
 * while lab results change whenever a job completes. Anything that a refresh
 * can invalidate is fetched uncached.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/lab`;
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
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      /* not JSON; the status is the message */
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
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
};

/** Topic selector: an entity id, or free text when nothing is selected. */
const topic = (subject) =>
  subject?.id ? { node_id: subject.id } : { q: subject?.label };

export const labApi = {
  clearCache: () => cache.clear(),

  status: () => request("/status", { useCache: true }),
  vocabulary: () => request("/vocabulary", { useCache: true }),
  window: (months) => request(`/window${qs({ months })}`),

  suggest: (q, limit = 10) => request(`/entities/suggest${qs({ q, limit })}`),
  context: (nodeId) => request(`/entities/${nodeId}/context`),

  refreshLiterature: (payload) =>
    request("/literature/refresh", { method: "POST", body: payload }),
  literature: (subject, params) =>
    request(`/literature${qs({ ...topic(subject), ...params })}`),
  paper: (id) => request(`/literature/${id}`, { useCache: true }),
  novelty: (subject, params) =>
    request(`/novelty${qs({ ...topic(subject), ...params })}`),
  recentChemistry: (subject, params) =>
    request(`/chemistry/recent${qs({ ...topic(subject), ...params })}`),
  timeline: (subject, params) =>
    request(`/timeline${qs({ ...topic(subject), ...params })}`),
  entityFrequency: (subject, params) =>
    request(`/entities/frequency${qs({ ...topic(subject), ...params })}`),
  topics: () => request("/topics"),

  evidenceGraph: (subject, params) =>
    request(`/evidence-graph${qs({ ...topic(subject), ...params })}`),
  evidenceGraphEdge: (subject, edgeId, params) =>
    request(
      `/evidence-graph/edge${qs({ ...topic(subject), edge_id: edgeId, ...params })}`
    ),
  contradictions: (subject, params) =>
    request(`/contradictions${qs({ ...topic(subject), ...params })}`),
  gaps: (subject, params) =>
    request(`/gaps${qs({ ...topic(subject), ...params })}`),
  correlations: (subject, params) =>
    request(`/correlations${qs({ ...topic(subject), ...params })}`),
  hypotheses: (subject, params) =>
    request(`/hypotheses${qs({ ...topic(subject), ...params })}`),

  analyse: (smiles) =>
    request("/chem/analyse", { method: "POST", body: { smiles } }),
  bbb: (smiles) => request("/chem/bbb", { method: "POST", body: { smiles } }),
  admet: (smiles) => request("/chem/admet", { method: "POST", body: { smiles } }),
  design: (payload) =>
    request("/chem/design", { method: "POST", body: payload }),
  conformers: (payload) =>
    request("/chem/conformers", { method: "POST", body: payload }),
  docking: (payload) =>
    request("/chem/docking", { method: "POST", body: payload }),
  depictionUrl: (smiles, width = 380, height = 260) =>
    `${BASE}/chem/depiction${qs({ smiles, width, height })}`,

  targetStructures: (nodeId, months) =>
    request(`/targets/${nodeId}/structures${qs({ months })}`),

  designResults: (jobId) => request(`/designs/${jobId}`),
  job: (jobId) => request(`/jobs/${jobId}`),
  jobs: (params) => request(`/jobs${qs(params)}`),
  cancelJob: (jobId) => request(`/jobs/${jobId}/cancel`, { method: "POST" }),

  search: (q) => request(`/search${qs({ q })}`),

  exportUrl: () => `${BASE}/workbench/export`,
  exportCandidates: async (items, format) => {
    const response = await fetch(`${BASE}/workbench/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, format }),
    });
    if (!response.ok) throw new Error(`Export failed: HTTP ${response.status}`);
    return response.blob();
  },
};

/**
 * Poll a job to completion.
 *
 * Progress is reported through the callback so a long synchronisation shows
 * what it is doing rather than a spinner that could equally mean "hung".
 */
export async function awaitJob(jobId, onProgress, { intervalMs = 1200, timeoutMs = 600000 } = {}) {
  const started = Date.now();
  for (;;) {
    const job = await labApi.job(jobId);
    onProgress?.(job);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    if (Date.now() - started > timeoutMs) {
      throw new Error("The job is still running; it has taken longer than expected.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
