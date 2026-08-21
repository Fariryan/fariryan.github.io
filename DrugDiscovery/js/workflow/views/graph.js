/** The run as a Cytoscape graph. Clicking a node opens what it contains. */

import { esc, loading, notice } from "../../ui.js";
import { workflowApi } from "../api.js";
import { KIND_COLOR, artifactCard, renderStep, withRun } from "./shared.js";

const STATUS_COLOR = {
  pending: "#8b949e", queued: "#8b949e", running: "var(--ev-strong)",
  complete: "var(--ev-established)", failed: "var(--danger)",
  cancelled: "var(--ev-hypothesis)", blocked: "var(--warning)",
};

function cssValue(token) {
  if (!token.startsWith("var(")) return token;
  const name = token.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#8b949e";
}

export async function graphView(root, params) {
  await withRun(root, params, render);
}

async function render(host, runId) {
  const graph = await workflowApi.graph(runId);

  host.innerHTML = `
    <section class="wf-panel lg-surface lg-d1">
      <header class="wf-panel-head">
        <div><h3>${graph.counts.steps} steps · ${graph.counts.artifacts} artifacts</h3>
          <span class="dim small">${graph.counts.complete} complete · ${graph.counts.failed} failed · ${graph.counts.blocked} blocked</span></div>
        <div class="wf-legend">
          ${Object.entries(graph.status_meaning).map(([k, v]) =>
            `<span class="wf-key" title="${esc(v)}"><i style="background:${cssValue(STATUS_COLOR[k] || "#8b949e")}"></i>${esc(k)}</span>`).join("")}
        </div>
      </header>
      <p class="wf-note">${esc(graph.note)}</p>
      <div id="wf-cy" class="wf-cy"></div>
    </section>

    ${(graph.excluded || []).length ? `
      <section class="wf-panel lg-surface lg-d1">
        <h3>Not in this graph</h3>
        <table class="wf-table">
          <thead><tr><th>Step</th><th>Reason</th><th>What is lost</th></tr></thead>
          <tbody>${graph.excluded.map((e) => `
            <tr><td class="small">${esc(e.label || e.key)}</td>
              <td class="small dim">${esc(e.reason)}</td>
              <td class="small dim">${esc(e.consequence || "")}</td></tr>`).join("")}</tbody>
        </table>
      </section>` : ""}

    <div id="wf-node-detail"></div>`;

  const container = host.querySelector("#wf-cy");
  const detail = host.querySelector("#wf-node-detail");

  if (!window.cytoscape) {
    container.innerHTML = notice(
      "The graph library did not load, so the graph cannot be drawn. Every step and artifact is still listed under Runs.",
      "warn", "⚠");
    return;
  }

  const cy = window.cytoscape({
    container,
    elements: [...graph.nodes, ...graph.edges],
    style: [
      {
        selector: 'node[type = "step"]',
        style: {
          shape: "round-rectangle",
          "background-color": (el) => cssValue(STATUS_COLOR[el.data("status")] || "#8b949e"),
          "background-opacity": 0.85,
          label: "data(label)",
          color: "#e6edf3",
          "font-size": 10,
          "text-valign": "center",
          "text-wrap": "wrap",
          "text-max-width": 96,
          width: 118,
          height: 42,
          "border-width": 1.5,
          "border-color": "#30363d",
        },
      },
      {
        selector: 'node[type = "artifact"]',
        style: {
          shape: "ellipse",
          "background-color": (el) => cssValue(KIND_COLOR[el.data("kind")] || "#8b949e"),
          "background-opacity": 0.55,
          label: "data(kind)",
          color: "#8b949e",
          "font-size": 8,
          "text-valign": "bottom",
          "text-margin-y": 4,
          width: 22,
          height: 22,
        },
      },
      {
        selector: 'edge[type = "dependency"]',
        style: {
          width: 2, "line-color": "#484f58", "target-arrow-color": "#484f58",
          "target-arrow-shape": "triangle", "curve-style": "bezier",
        },
      },
      {
        selector: 'edge[type = "produces"]',
        style: {
          width: 1, "line-color": "#30363d", "line-style": "dashed",
          "curve-style": "bezier",
        },
      },
      { selector: "node:selected", style: { "border-width": 3, "border-color": "#58a6ff" } },
    ],
    layout: {
      name: "breadthfirst", directed: true, spacingFactor: 1.2,
      padding: 24, avoidOverlap: true,
    },
    wheelSensitivity: 0.2,
  });

  cy.on("tap", "node", async (event) => {
    const data = event.target.data();
    detail.innerHTML = loading("Loading…");
    try {
      if (data.type === "step") {
        detail.innerHTML = renderStep(await workflowApi.step(runId, data.key));
      } else {
        const artifact = await workflowApi.artifact(runId, data.artifact_id);
        detail.innerHTML = `<section class="wf-panel lg-surface lg-d1">
          <h3>Artifact</h3>${artifactCard(artifact, true)}</section>`;
      }
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      detail.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}
