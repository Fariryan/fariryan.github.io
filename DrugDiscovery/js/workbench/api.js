/** Workbench API client. */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/workbench`;

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
      /* status line only */
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

export const wbApi = {
  status: () => request("/status"),
  normalize: (payload) => post("/chem/normalize", payload),
  molblock: (payload) => post("/chem/molblock", payload),
  descriptors: (payload) => post("/chem/descriptors", payload),
  fingerprintCatalogue: () => request("/chem/fingerprints"),
  fingerprints: (payload) => post("/chem/fingerprints", payload),
  similarity: (payload) => post("/chem/similarity", payload),
  substructure: (payload) => post("/chem/substructure", payload),
  conformers: (payload) => post("/chem/conformers", payload),
  scaffolds: (payload) => post("/chem/scaffolds", payload),
  pca: (payload) => post("/space/pca", payload),
  cluster: (payload) => post("/space/cluster", payload),
  matrix: (payload) => post("/space/matrix", payload),
  structureSearch: (q, limit = 10) =>
    request(`/structures/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  inspect: (pdbId) => request(`/structures/${encodeURIComponent(pdbId)}/inspect`),
  download: (pdbId) => request(`/structures/${encodeURIComponent(pdbId)}/download`),
  ligand: (pdbId, resname, copy = "") =>
    request(
      `/structures/${encodeURIComponent(pdbId)}/ligand/${encodeURIComponent(resname)}` +
        (copy ? `?copy=${encodeURIComponent(copy)}` : "")
    ),
  prepare: (pdbId, options) =>
    post(`/structures/${encodeURIComponent(pdbId)}/prepare`, options),
};
