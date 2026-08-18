/**
 * Property Intelligence API client.
 *
 * Profiles are POSTed rather than GETed because the input is a structure, and
 * a SMILES in a query string is a reliable source of URL-encoding bugs.
 * Nothing here is cached: a profile is cheap to recompute and the engine
 * version can change under a long-lived tab.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/propintel`;
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

export const propApi = {
  // Vocabularies are fixed for a deployment, so they are worth caching.
  status: () => request("/status", { useCache: true }),
  vocabulary: () => request("/vocabulary", { useCache: true }),
  models: () => request("/models", { useCache: true }),

  profile: (smiles, includeActivity = true) =>
    request("/profile", {
      method: "POST",
      body: { smiles, include_activity: includeActivity },
    }),
  radar: (smiles) => request("/radar", { method: "POST", body: { smiles } }),
  references: (smiles, options = {}) =>
    request("/references", { method: "POST", body: { smiles, ...options } }),
  compare: (smiles, references) =>
    request("/compare", { method: "POST", body: { smiles, references } }),
  explain: (smiles, property) =>
    request("/explain", { method: "POST", body: { smiles, property } }),
  batch: (structures) =>
    request("/batch", { method: "POST", body: { structures } }),
};
