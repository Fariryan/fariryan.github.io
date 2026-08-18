/**
 * Autonomous Discovery API client.
 *
 * The interface polls rather than holding a request open: a wave runs real
 * scientific engines and takes as long as they take. Nothing is lost if the
 * browser closes mid-run — the run's whole state is in the database.
 */

import { API_ORIGIN } from "../config.js";

const BASE = `${API_ORIGIN}/api/v1/autopilot`;

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

export const apApi = {
  status: () => request("/status"),
  tools: () => request("/tools"),
  evidenceLanguage: () => request("/evidence-language"),

  plan: (body) => request("/plan", { method: "POST", body }),
  approvePlan: (id, body) =>
    request(`/runs/${encodeURIComponent(id)}/approve-plan`, { method: "POST", body }),
  advance: (id, body) =>
    request(`/runs/${encodeURIComponent(id)}/advance`, { method: "POST", body: body || {} }),
  cancel: (id, body) =>
    request(`/runs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: body || {} }),

  runs: () => request("/runs"),
  run: (id) => request(`/runs/${encodeURIComponent(id)}`),
  map: (id) => request(`/runs/${encodeURIComponent(id)}/map`),
  task: (id, taskId) =>
    request(`/runs/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}`),
  why: (id, subject) =>
    request(`/runs/${encodeURIComponent(id)}/why/${encodeURIComponent(subject)}`),
  story: (id) => request(`/runs/${encodeURIComponent(id)}/story`),
  regenerateStory: (id) =>
    request(`/runs/${encodeURIComponent(id)}/story/regenerate`, { method: "POST" }),
  contradictions: (id) => request(`/runs/${encodeURIComponent(id)}/contradictions`),
  evolution: (id) => request(`/runs/${encodeURIComponent(id)}/evolution`),
  generations: (id) => request(`/runs/${encodeURIComponent(id)}/generations`),
  generation: (id, step) =>
    request(`/runs/${encodeURIComponent(id)}/generations/${step}`),
  decisionRoom: (id, keys) =>
    request(
      `/runs/${encodeURIComponent(id)}/decision-room` +
        (keys?.length ? `?candidates=${encodeURIComponent(keys.join(","))}` : "")
    ),
  checkpoints: (id) => request(`/runs/${encodeURIComponent(id)}/checkpoints`),
  decide: (checkpointId, body) =>
    request(`/checkpoints/${checkpointId}/decide`, { method: "POST", body }),
  cost: (id) => request(`/runs/${encodeURIComponent(id)}/cost`),
  clone: (id, body) =>
    request(`/runs/${encodeURIComponent(id)}/clone`, { method: "POST", body }),
  compare: (ids) => request(`/compare?runs=${encodeURIComponent(ids.join(","))}`),
  output: (id, mode) =>
    request(`/runs/${encodeURIComponent(id)}/output/${encodeURIComponent(mode)}`),
};
