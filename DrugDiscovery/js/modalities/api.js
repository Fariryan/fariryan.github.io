/** Modality API client. */
import { API_ORIGIN } from "../config.js";
const BASE = `${API_ORIGIN}/api/v1/modalities`;

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json", ...(options.headers || {}) }, ...options });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { const b = await response.json(); if (b?.detail) detail = b.detail; } catch { /* */ }
    throw new Error(detail);
  }
  return response.json();
}
const post = (p, payload) => request(p, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(payload || {}) });

export const modalityApi = {
  status: () => request("/status"),
  peptide: (payload) => post("/peptide", payload),
  biologic: (payload) => post("/biologic", payload),
  degrader: (payload) => post("/degrader", payload),
  linkers: (payload) => post("/degrader/linkers", payload),
  structureChains: (pdbId) => request(`/structure/${encodeURIComponent(pdbId)}/chains`),
  structureInterfaces: (pdbId) => request(`/structure/${encodeURIComponent(pdbId)}/interfaces`),
  interface: (payload) => post("/interface", payload),
  interfaces: (limit = 30) => request(`/interfaces?limit=${limit}`),
  survey: () => request("/graph/survey"),
  browse: (modality, limit = 60) => request(`/graph/${modality}?limit=${limit}`),
  classify: (payload) => post("/classify", payload),
  entities: (modality) => request(`/entities${modality ? `?modality=${modality}` : ""}`),
  entity: (id) => request(`/entities/${id}`),
  create: (payload) => post("/entities", payload),
};
