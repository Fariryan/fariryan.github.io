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

  targets: (id) => request(`/campaigns/${encodeURIComponent(id)}/targets`),
  proposeTargets: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/targets`, {
      method: "POST",
      body: payload,
    }),
  updateTarget: (targetId, payload) =>
    request(`/targets/${targetId}`, { method: "PATCH", body: payload }),
  graph: (id) => request(`/campaigns/${encodeURIComponent(id)}/graph`),

  knownChemistry: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/known-chemistry`, {
      method: "POST",
      body: payload,
    }),
  addSeed: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/seeds`, {
      method: "POST",
      body: payload,
    }),

  candidates: (id, params) =>
    request(`/campaigns/${encodeURIComponent(id)}/candidates${qs(params)}`),
  candidate: (candidateId) => request(`/candidates/${candidateId}`),
  updateCandidate: (candidateId, payload) =>
    request(`/candidates/${candidateId}`, { method: "PATCH", body: payload }),
  generate: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/generate`, {
      method: "POST",
      body: payload,
    }),
  screen: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/screen`, {
      method: "POST",
      body: payload,
    }),
  pareto: (id) => request(`/campaigns/${encodeURIComponent(id)}/pareto`),
  chemicalSpace: (id) =>
    request(`/campaigns/${encodeURIComponent(id)}/chemical-space`),
  lineage: (id) => request(`/campaigns/${encodeURIComponent(id)}/lineage`),

  sendToPreclinical: (candidateId, payload) =>
    request(`/candidates/${candidateId}/preclinical`, {
      method: "POST",
      body: payload,
    }),
  preclinicalRuns: (id) =>
    request(`/campaigns/${encodeURIComponent(id)}/preclinical`),

  nextGeneration: (id, payload) =>
    request(`/campaigns/${encodeURIComponent(id)}/next-generation`, {
      method: "POST",
      body: payload,
    }),
  findings: (id, params) =>
    request(`/campaigns/${encodeURIComponent(id)}/findings${qs(params)}`),
  negativeKnowledge: (id) =>
    request(`/campaigns/${encodeURIComponent(id)}/negative-knowledge`),
  report: (id) => request(`/campaigns/${encodeURIComponent(id)}/report`),

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
