/**
 * Enterprise API client.
 *
 * Sends the organisation header on every request so the backend resolves a
 * principal. Authentication itself is the deployment's: an API key in an
 * Authorization header, or an identity header set by an authenticating proxy.
 * This client does not hold credentials and has nowhere to put one.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/enterprise`;

async function request(path, { method = "GET", body } = {}) {
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
      detail =
        typeof payload.detail === "string"
          ? payload.detail
          : JSON.stringify(payload.detail) || detail;
    } catch {
      /* not JSON; the status is the message */
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export const entApi = {
  status: () => request("/status"),
  me: () => request("/me"),
  governanceStatement: () => request("/governance/statement"),
  connectorCatalogue: () => request("/connectors/catalogue"),

  portfolio: () => request("/portfolio"),
  programs: () => request("/programs"),

  models: () => request("/models"),
  transitionModel: (key, version, body) =>
    request(
      `/models/${encodeURIComponent(key)}/${encodeURIComponent(version)}/transition`,
      { method: "POST", body }
    ),

  ledger: () => request("/ledger"),
  verifyLedger: () => request("/ledger/verify"),
  evidenceChain: (type, id) =>
    request(`/evidence-chain/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),

  jobs: () => request("/jobs"),
  submitJob: (body) => request("/jobs", { method: "POST", body }),
  cancelJob: (key) =>
    request(`/jobs/${encodeURIComponent(key)}/cancel`, { method: "POST" }),

  runs: () => request("/runs"),
  run: (id) => request(`/runs/${encodeURIComponent(id)}`),
  cloneRun: (id, body) =>
    request(`/runs/${encodeURIComponent(id)}/clone`, { method: "POST", body }),

  datasets: () => request("/datasets"),
  search: (q) => request(`/search?q=${encodeURIComponent(q)}`),
  connectors: () => request("/connectors"),

  validation: () => request("/validation"),
  learning: () => request("/learning"),
  scanLearning: () => request("/learning/scan", { method: "POST" }),
  decideProposal: (id, body) =>
    request(`/learning/proposals/${id}/decide`, { method: "POST", body }),

  governance: () => request("/governance"),
  createPackage: (body) =>
    request("/governance/packages", { method: "POST", body }),
  package: (key) => request(`/governance/packages/${encodeURIComponent(key)}`),

  observability: () => request("/observability"),
  audit: () => request("/audit"),
};
