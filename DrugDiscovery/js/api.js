/**
 * Thin API client.
 *
 * GET responses are memoised for the session, because entity pages
 * cross-reference each other heavily and the underlying data only changes when
 * an ingestion job runs.
 */

import { API_ORIGIN } from "./config.js";

// Absolute when the UI is served from a different origin than the API, and
// same-origin relative otherwise. See config.js.
const BASE = `${API_ORIGIN}/api/v1`;
const cache = new Map();

async function request(path, { method = "GET", body, useCache = true } = {}) {
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
      /* response body was not JSON; keep the status text */
    }
    throw new Error(detail);
  }

  const data = await response.json();
  if (method === "GET" && useCache) cache.set(key, data);
  return data;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
};

export const api = {
  clearCache: () => cache.clear(),

  stats: () => request("/stats"),
  evidenceLevels: () => request("/evidence-levels"),
  sources: () => request("/sources"),
  predicates: () => request("/predicates"),
  measureTypes: () => request("/measure-types"),

  search: (q, opts = {}) => request(`/search${qs({ q, ...opts })}`),
  suggest: (q, limit = 8) => request(`/search/suggest${qs({ q, limit })}`),

  entities: (params) => request(`/entities${qs(params)}`),
  entity: (id) => request(`/entities/${id}`),

  compoundChemistry: (id) => request(`/compounds/${id}/chemistry`),
  compoundSvgUrl: (id) => `${BASE}/compounds/${id}/svg`,
  compoundSdfUrl: (id) => `${BASE}/compounds/${id}/sdf`,

  structures: (params) => request(`/structures${qs(params)}`),
  mechanism: (id) => request(`/mechanism/${id}`),
  diseaseMechanism: (id) => request(`/disease-mechanism/${id}`),
  graph: (id, params) => request(`/graph/${id}${qs(params)}`),
  matrix: (params) => request(`/matrix${qs(params)}`),
  compare: (ids) => request(`/compare${qs({ ids: ids.join(",") })}`),

  brainRegions: () => request("/brain/regions"),
  cells: () => request("/cells"),
  pathways: (params) => request(`/pathways${qs(params)}`),
  trials: (params) => request(`/trials${qs(params)}`),
  publications: (params) => request(`/publications${qs(params)}`),

  aiStatus: () => request("/ai/status"),
  aiAsk: (question) =>
    request("/ai/ask", { method: "POST", body: { question }, useCache: false }),
  drugsTargeting: (target) => request(`/ai/drugs-targeting${qs({ target })}`),

  validation: (params) => request(`/admin/validation${qs(params)}`),
  conflicts: () => request("/admin/conflicts"),
  ingestRuns: () => request("/admin/ingest-runs"),
};
