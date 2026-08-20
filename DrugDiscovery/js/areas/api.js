/**
 * Therapeutic-area API client.
 *
 * Thin, like every other module's client: it shapes URLs and surfaces errors,
 * and it never interprets a scientific value. Section statuses arrive from the
 * backend already distinguishing "the source has nothing" from "the source
 * could not be reached", and this file passes both through unchanged.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/areas`;

async function get(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* the status line is all we have */
    }
    throw new Error(detail);
  }
  return response.json();
}

async function post(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* as above */
    }
    throw new Error(detail);
  }
  return response.json();
}

export const areasApi = {
  list: () => get("/"),
  status: () => get("/status"),
  area: (key) => get(`/${encodeURIComponent(key)}`),
  specialization: (key) => get(`/${encodeURIComponent(key)}/specialization`),
  searchDiseases: (q, limit = 8) =>
    get(`/diseases/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  openWorkspace: (key, disease, options = {}) =>
    post(`/${encodeURIComponent(key)}/workspace`, { disease, ...options }),
  workspace: (key, diseaseId) =>
    get(`/${encodeURIComponent(key)}/workspace/${encodeURIComponent(diseaseId)}`),
  workspaces: (key) => get(`/${encodeURIComponent(key)}/workspaces`),
};
