/** AI Scientist API client. */
import { API_ORIGIN } from "../config.js";
const BASE = `${API_ORIGIN}/api/v1/scientist`;

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
const send = (method, p, payload) => request(p, {
  method, headers: { "content-type": "application/json" },
  body: JSON.stringify(payload || {}) });

export const scientistApi = {
  status: () => request("/status"),
  conversations: (limit = 30) => request(`/conversations?limit=${limit}`),
  conversation: (id) => request(`/conversations/${id}`),
  create: (payload) => send("POST", "/conversations", payload),
  attach: (id, payload) => send("PATCH", `/conversations/${id}`, payload),
  ask: (id, question) => send("POST", `/conversations/${id}/ask`, { question }),
  message: (cid, id) => request(`/conversations/${cid}/messages/${id}`),
};
