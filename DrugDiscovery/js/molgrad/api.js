/**
 * Molecular Gradient API client.
 *
 * Advancing a run is a POST that returns after a bounded number of
 * generations, so the interface polls rather than holding a request open. A
 * run's whole state lives in the database, which is what lets the browser be
 * closed and reopened mid-optimisation.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/molgrad`;

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
      detail = (await response.json()).detail || detail;
    } catch {
      /* not JSON; the status is the message */
    }
    throw new Error(detail);
  }
  return response.json();
}

export const mgApi = {
  status: () => request("/status"),
  vocabulary: () => request("/vocabulary"),
  engines: () => request("/engines"),

  analyseSeed: (smiles) =>
    request("/analyse-seed", { method: "POST", body: { smiles } }),

  createRun: (config) => request("/runs", { method: "POST", body: config }),
  listRuns: () => request("/runs"),
  getRun: (key) => request(`/runs/${encodeURIComponent(key)}`),
  advance: (key, generations = 1) =>
    request(`/runs/${encodeURIComponent(key)}/advance`, {
      method: "POST",
      body: { generations },
    }),
  stop: (key) =>
    request(`/runs/${encodeURIComponent(key)}/stop`, { method: "POST" }),

  candidates: (key, params = {}) => {
    const search = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    return request(
      `/runs/${encodeURIComponent(key)}/candidates${search ? `?${search}` : ""}`
    );
  },
  candidate: (key, candidateKey) =>
    request(
      `/runs/${encodeURIComponent(key)}/candidates/${encodeURIComponent(candidateKey)}`
    ),
  trajectory: (key, candidateKey) =>
    request(
      `/runs/${encodeURIComponent(key)}/trajectory/${encodeURIComponent(candidateKey)}`
    ),
  graph: (key) => request(`/runs/${encodeURIComponent(key)}/graph`),
  report: (key) => request(`/runs/${encodeURIComponent(key)}/report`),

  // The Chemical Intelligence depiction route renders any SMILES, so the
  // trajectory can draw structures that exist nowhere but in this run.
  depictionUrl: (smiles, width = 260, height = 200) =>
    `${API_ORIGIN}/api/v1/chemint/depiction?smiles=${encodeURIComponent(
      smiles
    )}&width=${width}&height=${height}`,
};
