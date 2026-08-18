/**
 * Molecular Gradient shell.
 *
 * Same pattern as every added section: one entry point, the stylesheet
 * injected here rather than linked from index.html, and the selected run held
 * under its own localStorage key.
 */

import { esc, loading, notice } from "../ui.js";
import { mgApi } from "./api.js";

export const SECTIONS = [
  {
    key: "runs",
    label: "Runs",
    icon: "▤",
    module: () => import("./views/runs.js"),
    view: "runsView",
    lede:
      "Configure an optimisation from a seed molecule and a set of objectives, or reopen one that has already run.",
  },
  {
    key: "trajectory",
    label: "Trajectory",
    icon: "⇢",
    module: () => import("./views/trajectory.js"),
    view: "trajectoryView",
    lede:
      "The evolutionary path of one candidate: 2D structures left, 3D centre, property trajectories right, and every edit explained.",
  },
  {
    key: "pareto",
    label: "Pareto Frontier",
    icon: "◈",
    module: () => import("./views/pareto.js"),
    view: "paretoView",
    lede:
      "Candidates representing different trade-offs. None is ranked above another — that is what a frontier means.",
  },
  {
    key: "graph",
    label: "Search Graph",
    icon: "⁘",
    module: () => import("./views/graph.js"),
    view: "graphView",
    lede:
      "The branching search, including the branches that were abandoned and the reason each was left.",
  },
];

const STYLESHEET = "css/molgrad.css";
const RUN_KEY = "neuroatlas.molgrad.run";

function ensureStylesheet() {
  if (document.querySelector("link[data-molgrad-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.molgradStyle = "true";
  document.head.appendChild(link);
}

const listeners = new Set();

export const currentRun = {
  get() {
    try {
      return localStorage.getItem(RUN_KEY) || null;
    } catch {
      return null;
    }
  },
  set(key) {
    try {
      localStorage.setItem(RUN_KEY, key);
    } catch {
      /* a full or disabled localStorage must not break the interface */
    }
    listeners.forEach((listener) => listener(key));
  },
  clear() {
    localStorage.removeItem(RUN_KEY);
    listeners.forEach((listener) => listener(null));
  },
  subscribe(listener) {
    listeners.add(listener);
    listener(this.get());
    return () => listeners.delete(listener);
  },
};

export async function molgradView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "runs";
  const definition = SECTIONS.find((s) => s.key === key);

  const fromUrl = params?.get("run");
  if (fromUrl) currentRun.set(fromUrl);

  root.innerHTML = `
    <div class="mg-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/molgrad/runs">Molecular Gradient</a> › ${esc(definition.label)}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
      <div class="spacer"></div>
      <div id="mg-run-chip"></div>
    </div>
    <nav class="mg-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/molgrad/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="mg-body">${loading("Preparing…")}</div>
    <div class="disclaimer">
      <strong>Every property here is predicted, not measured.</strong>
      Candidates are ranked against one another on model output, and the
      models carry the limitations stated on their cards. A frontier candidate
      is a hypothesis worth testing, not a compound known to be better.
      Research and education only; not medical advice.
    </div>
  `;

  renderRunChip(root.querySelector("#mg-run-chip"));

  const body = root.querySelector("#mg-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(
      `<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(
        error.message
      )}`,
      "danger",
      "⚠"
    );
    console.error(error);
  }
}

function renderRunChip(host) {
  if (!host) return;
  currentRun.subscribe((key) => {
    host.innerHTML = key
      ? `<div class="mg-run-chip">
           <div class="who">
             <div class="name mono">${esc(key)}</div>
             <div class="sub">selected run</div>
           </div>
           <button class="sm" id="mg-clear-run">Clear</button>
         </div>`
      : `<div class="mg-run-chip">
           <div class="who">
             <div class="name dim">No run selected</div>
             <div class="sub">Configure one under Runs</div>
           </div>
         </div>`;
    host
      .querySelector("#mg-clear-run")
      ?.addEventListener("click", () => currentRun.clear());
  });
}

export function needsRun() {
  return notice(
    `Select or configure a run under <a href="#/molgrad/runs">Runs</a> first.`,
    "muted",
    "▤"
  );
}
