/**
 * Molecular Discovery Lab API client.
 *
 * Talks to this application's own backend and to nothing else. The RONEU
 * gateway is reached only through `/discovery/ai/*`, server-side, so no key
 * ever exists in this file and the browser never contacts the reasoning
 * infrastructure directly.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/discovery`;

const cache = new Map();

async function request(path, { method = "GET", body, useCache = false } = {}) {
  const key = `${method} ${path}`;
  if (useCache && method === "GET" && cache.has(key)) return cache.get(key);

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      /* the body was not JSON; the status is what we have */
    }
    throw new Error(detail);
  }

  const payload = await response.json();
  if (useCache && method === "GET") cache.set(key, payload);
  return payload;
}

function qs(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

export const discApi = {
  clearCache: () => cache.clear(),

  status: () => request("/status", { useCache: true }),
  aiStatus: (refresh = false) => request(`/ai/status${qs({ refresh })}`),
  aiModels: () => request("/ai/models"),

  campaigns: (params) => request(`/campaigns${qs(params)}`),
  campaign: (id) => request(`/campaigns/${encodeURIComponent(id)}`),
  createCampaign: (payload) =>
    request("/campaigns", { method: "POST", body: payload }),
  updateCampaign: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}`, { method: "PATCH", body: payload }),
  branch: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/branch`, {
      method: "POST",
      body: payload,
    }),

  research: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/research`, {
      method: "POST",
      body: payload,
    }),
  evidence: (id, params) =>
    request(`/campaigns/${encodeURIComponent(id)}/evidence${qs(params)}`),

  hypotheses: (id) => request(`/campaigns/${encodeURIComponent(id)}/hypotheses`),
  generateHypotheses: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/hypotheses`, {
      method: "POST",
      body: payload,
    }),
  updateHypothesis: (hypothesisId, payload) =>
    request(`/hypotheses/${hypothesisId}`, { method: "PATCH", body: payload }),

  timeline: (id) => request(`/campaigns/${encodeURIComponent(id)}/timeline`),
  llmRuns: (id, params) =>
    request(`/campaigns/${encodeURIComponent(id)}/llm-runs${qs(params)}`),
};

/** The campaign the workspace is currently looking at, kept across sections. */
const CAMPAIGN_KEY = "neuroatlas.discovery.campaign";

export const activeCampaign = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || "null");
    } catch {
      return null;
    }
  },
  set(campaign) {
    if (campaign) {
      localStorage.setItem(
        CAMPAIGN_KEY,
        JSON.stringify({ id: campaign.id, code: campaign.code, title: campaign.title })
      );
    } else {
      localStorage.removeItem(CAMPAIGN_KEY);
    }
    window.dispatchEvent(new CustomEvent("discovery:campaign-changed"));
  },
};
