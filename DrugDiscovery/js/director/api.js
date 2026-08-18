/**
 * Discovery Director API client.
 *
 * Advancing a campaign is a POST that returns after a bounded number of
 * stages and stops at any approval gate, so the interface never holds a long
 * request open. A campaign's whole state is in the database — the browser can
 * be closed mid-campaign and the timeline reopened months later.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/director`;

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
          : payload.detail?.blocked || JSON.stringify(payload.detail) || detail;
    } catch {
      /* not JSON; the status is the message */
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export const ddApi = {
  status: () => request("/status"),
  agents: () => request("/agents"),
  loop: () => request("/loop"),
  failureModes: () => request("/failure-modes"),
  hypothesisAxes: () => request("/hypothesis-axes"),

  listCampaigns: (limit = 25) => request(`/campaigns?limit=${limit}`),
  createCampaign: (payload) =>
    request("/campaigns", { method: "POST", body: payload }),
  getCampaign: (key) => request(`/campaigns/${encodeURIComponent(key)}`),
  advance: (key, stages = 1, options = {}) =>
    request(`/campaigns/${encodeURIComponent(key)}/advance`, {
      method: "POST",
      body: { stages, options },
    }),
  pause: (key) =>
    request(`/campaigns/${encodeURIComponent(key)}/pause`, { method: "POST" }),
  resume: (key) =>
    request(`/campaigns/${encodeURIComponent(key)}/resume`, { method: "POST" }),

  timeline: (key) => request(`/campaigns/${encodeURIComponent(key)}/timeline`),
  evidence: (key) => request(`/campaigns/${encodeURIComponent(key)}/evidence`),
  failureMap: (key) =>
    request(`/campaigns/${encodeURIComponent(key)}/failure-map`),
  nextActions: (key) =>
    request(`/campaigns/${encodeURIComponent(key)}/next-actions`),
  audit: (key) => request(`/campaigns/${encodeURIComponent(key)}/audit`),
  approvals: (key) =>
    request(`/campaigns/${encodeURIComponent(key)}/approvals`),

  decide: (approvalId, payload) =>
    request(`/approvals/${approvalId}/decide`, { method: "POST", body: payload }),
  falsify: (key, hypothesisId, payload) =>
    request(
      `/campaigns/${encodeURIComponent(key)}/hypotheses/${hypothesisId}/falsify`,
      { method: "POST", body: payload }
    ),
};
