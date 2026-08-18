/**
 * Autonomous Discovery shell.
 *
 * The same additive pattern as every other section. Nothing here replaces a
 * manual tab: the autopilot calls the same engines those tabs call, and the
 * banner says so, because a scientist who prefers to drive should not have to
 * wonder whether the manual route still works. It does.
 */

import { esc, loading, notice } from "../ui.js";

export const SECTIONS = [
  {
    key: "start",
    label: "Start Discovery",
    icon: "▶",
    module: () => import("./views/start.js"),
    view: "startView",
    lede:
      "Describe what you want to find out. The system works out which capabilities to use, shows you the plan, and runs it.",
  },
  {
    key: "map",
    label: "Live Discovery Map",
    icon: "◎",
    module: () => import("./views/map.js"),
    view: "mapView",
    lede:
      "Watch the investigation happen. Every node shows its state and its result; click one to open its evidence.",
  },
  {
    key: "story",
    label: "Discovery Story",
    icon: "▤",
    module: () => import("./views/story.js"),
    view: "storyView",
    lede:
      "How the result was reached, chapter by chapter, generated from what the run actually recorded.",
  },
  {
    key: "evolution",
    label: "Chemical Evolution",
    icon: "⑃",
    module: () => import("./views/evolution.js"),
    view: "evolutionView",
    lede:
      "The optimisation tree including every abandoned branch, and how each property moved across generations.",
  },
  {
    key: "generations",
    label: "Generation Viewer",
    icon: "⧉",
    module: () => import("./views/generations.js"),
    view: "generationsView",
    lede:
      "Step through each optimisation edit: 2D before and after with the changed atoms highlighted, the 3D result, why the change was made and what it did to every property.",
  },
  {
    key: "decision",
    label: "Decision Room",
    icon: "◫",
    module: () => import("./views/decision.js"),
    view: "decisionView",
    lede:
      "Every candidate with its structure, evolution, properties, liabilities, target context and known chemistry — side by side, deliberately unranked.",
  },
  {
    key: "runs",
    label: "Runs",
    icon: "⟲",
    module: () => import("./views/runs.js"),
    view: "runsView",
    lede:
      "Every run, reopenable months later. Clone one, re-run it from any step, or compare two.",
  },
];

const STYLESHEET = "css/autopilot.css";
const RUN_KEY = "neuroatlas.autopilot.run";

function ensureStylesheet() {
  if (document.querySelector("link[data-autopilot-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.autopilotStyle = "true";
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
  set(id) {
    try {
      localStorage.setItem(RUN_KEY, id);
    } catch {
      /* a full or disabled localStorage must not break the interface */
    }
    listeners.forEach((listener) => listener(id));
  },
  clear() {
    try {
      localStorage.removeItem(RUN_KEY);
    } catch {
      /* as above */
    }
    listeners.forEach((listener) => listener(null));
  },
  subscribe(listener) {
    listeners.add(listener);
    listener(this.get());
    return () => listeners.delete(listener);
  },
};

export async function autopilotView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "start";
  const definition = SECTIONS.find((s) => s.key === key);

  const fromUrl = params?.get("run");
  if (fromUrl) currentRun.set(fromUrl);

  root.innerHTML = `
    <div class="ap-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/autopilot/start">Autonomous Discovery</a> › ${esc(
            definition.label
          )}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
      <div class="spacer"></div>
      <div id="ap-run-chip"></div>
    </div>
    <nav class="ap-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/autopilot/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div class="ap-expert-note">
      <strong>Expert mode is unchanged.</strong> Every tab you used before is
      exactly where it was and works exactly as it did. The autopilot calls
      those same engines — it is an additional way in, not a replacement.
    </div>
    <div id="ap-body">${loading("Preparing…")}</div>
    <div class="disclaimer">
      <strong>Automation does not add certainty.</strong>
      Every value a run produces comes from the same engines as before and
      carries the same uncertainty. A candidate is a hypothesis worth testing,
      not a compound known to work. Research and education only; not medical
      advice.
    </div>
  `;

  renderRunChip(root.querySelector("#ap-run-chip"));

  const body = root.querySelector("#ap-body");
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
  currentRun.subscribe((id) => {
    host.innerHTML = id
      ? `<div class="ap-run-chip">
           <div class="who">
             <div class="name mono">${esc(id)}</div>
             <div class="sub">selected run</div>
           </div>
           <button class="sm" id="ap-clear-run">Clear</button>
         </div>`
      : `<div class="ap-run-chip">
           <div class="who">
             <div class="name dim">No run selected</div>
             <div class="sub">Start one under Start Discovery</div>
           </div>
         </div>`;
    host.querySelector("#ap-clear-run")?.addEventListener("click", () =>
      currentRun.clear()
    );
  });
}

export function needsRun() {
  return notice(
    `Start or select a run under <a href="#/autopilot/start">Start Discovery</a> first.`,
    "muted",
    "▶"
  );
}
