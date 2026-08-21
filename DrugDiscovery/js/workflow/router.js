/** Automated discovery workflow shell. */
import { esc, loading, notice } from "../ui.js";
const STYLESHEET = "css/workflow.css";

export const SECTIONS = [
  { key: "design", label: "New Run", icon: "▶",
    module: () => import("./views/design.js"), view: "designView",
    lede: "State an objective. The planner probes every engine, includes only the steps this deployment can actually run, and says why it left the others out." },
  { key: "runs", label: "Runs", icon: "☰",
    module: () => import("./views/runs.js"), view: "runsView",
    lede: "Every step of every run: what ran, why it ran, its parameters, its inputs, its outputs, its logs and its failures. Nothing is hidden behind a progress bar." },
  { key: "graph", label: "Workflow Graph", icon: "⚯",
    module: () => import("./views/graph.js"), view: "graphView",
    lede: "The run as a directed graph. Rectangles are steps, circles are the artifacts they produced. Click either to open what it actually contains." },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-workflow-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = STYLESHEET;
  link.dataset.workflowStyle = "true";
  document.head.appendChild(link);
}

export async function workflowView(root, section, params) {
  ensureStylesheet();
  const key = SECTIONS.some((s) => s.key === section) ? section : "design";
  const definition = SECTIONS.find((s) => s.key === key);
  root.innerHTML = `
    <div class="wf-head">
      <div>
        <div class="breadcrumbs"><a href="#/workflow/design">Automated Discovery</a> › ${esc(definition.label)}</div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="wf-tabs">
      ${SECTIONS.map((s) => `<a href="#/workflow/${s.key}" class="${s.key === key ? "active" : ""}">
        <span class="ico">${s.icon}</span>${esc(s.label)}</a>`).join("")}
    </nav>
    <div id="wf-body">${loading("Preparing…")}</div>`;
  const body = root.querySelector("#wf-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(`<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(error.message)}`, "danger", "⚠");
    console.error(error);
  }
}
