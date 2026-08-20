/**
 * Knowledge-layer API client.
 *
 * Thin, like every other module's. Provider statuses arrive already
 * distinguishing "the source has nothing" from "the source could not be
 * reached", and this file passes both through unchanged.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/knowledge`;

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
      /* the status line is all we have */
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

export const kbApi = {
  status: () => request("/status"),
  providers: () => request("/providers"),
  namespaces: () => request("/identifiers/namespaces"),
  resolveIdentifier: (q) => request(`/identifiers/resolve?q=${encodeURIComponent(q)}`),
  diseaseGraph: (payload) => post("/graph/disease", payload),
  nodeEvidence: (nodeId, kind) =>
    request(
      `/graph/node?node_id=${encodeURIComponent(nodeId)}&kind=${encodeURIComponent(kind || "")}`
    ),
  literatureWindows: () => request("/literature/windows"),
  literatureSearch: (payload) => post("/literature/search", payload),
  literatureRetained: (limit = 50, q = "") =>
    request(`/literature/retained?limit=${limit}&q=${encodeURIComponent(q)}`),
  validateDoi: (doi) => post("/literature/validate", { doi }),
};
