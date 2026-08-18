/**
 * Chemical Intelligence API client.
 *
 * Its own client, and its own cache, for the same reason Discovery Lab has
 * one: the atlas memoises hard because its data only changes when an
 * ingestion job runs, while the fabric's data changes whenever a queued job
 * finishes. Anything an ingestion can invalidate is fetched uncached.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/chemint`;
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

export const chemApi = {
  clearCache: () => cache.clear(),

  // Vocabularies never change between deploys, so they are worth caching.
  status: () => request("/status"),
  vocabulary: () => request("/vocabulary", { useCache: true }),
  sources: () => request("/sources", { useCache: true }),

  search: (q, params) => request(`/search${qs({ q, ...params })}`),
  suggest: (q, limit = 10) => request(`/suggest${qs({ q, limit })}`),
  browse: (params) => request(`/browse${qs(params)}`),

  substance: (id) => request(`/substances/${id}`),
  claims: (id, params) => request(`/substances/${id}/claims${qs(params)}`),
  literature: (id, params) => request(`/substances/${id}/literature${qs(params)}`),
  safety: (id) => request(`/substances/${id}/safety`),
  provenance: (id) => request(`/substances/${id}/provenance`),
  scaffoldFamily: (id, params) =>
    request(`/substances/${id}/scaffold-family${qs(params)}`),

  neighborhood: (params) => request(`/neighborhood${qs(params)}`),
  scaffolds: (params) => request(`/scaffolds${qs(params)}`),
  quality: () => request("/quality"),
  queue: () => request("/queue"),

  normalize: (structure) =>
    request("/normalize", { method: "POST", body: { structure } }),
  ingest: (identifier) =>
    request("/ingest", { method: "POST", body: { identifier } }),

  // Asset URLs, used directly as element sources rather than fetched.
  depictionUrl: (id, width = 460, height = 360) =>
    `${BASE}/substances/${id}/depiction${qs({ width, height })}`,
  // For structures with no entity of their own — a scaffold is a SMILES
  // string, not a substance.
  smilesDepictionUrl: (smiles, width = 220, height = 170) =>
    `${BASE}/depiction${qs({ smiles, width, height })}`,
  conformerUrl: (id) => `${BASE}/substances/${id}/conformer`,
};
