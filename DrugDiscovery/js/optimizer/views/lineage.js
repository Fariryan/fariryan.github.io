/** The evolution tree. Clicking an edge shows what the transformation did. */

import { esc, notice } from "../../ui.js";
import { optimizerApi } from "../api.js";
import { STATE_GLYPH, withRun } from "./shared.js";

export async function lineageView(root, params) {
  await withRun(root, params, render);
}

const CATEGORY_COLOR = {
  r_group: "var(--ev-established)",
  functional_group: "var(--ev-strong)",
  bioisostere: "var(--accent)",
  homologation: "var(--ev-clinical)",
  ring_replacement: "var(--ev-preliminary)",
  scaffold: "var(--danger)",
  fragment_growing: "var(--ev-hypothesis)",
  fragment_linking: "var(--warning)",
  fragment_merging: "var(--ev-preclinical)",
  stereochemistry: "var(--text-dim)",
};

async function render(host, runId) {
  const data = await optimizerApi.lineage(runId);
  if (!data.nodes.length) {
    host.innerHTML = notice("This run produced no candidates.", "info", "◌");
    return;
  }

  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const children = new Map();
  for (const edge of data.edges) {
    if (!children.has(edge.parent_id)) children.set(edge.parent_id, []);
    children.get(edge.parent_id).push(edge);
  }
  const roots = data.nodes.filter((n) => n.generation === 0);

  host.innerHTML = `
    <section class="opt-panel lg-surface lg-d1">
      <header class="opt-panel-head">
        <div><h3>Chemical evolution</h3>
          <span class="dim small">${data.nodes.length} structures · ${data.edges.length} transformations · ${data.generations} generations</span></div>
        <div class="opt-legend wrap">
          ${Object.keys(CATEGORY_COLOR).map((c) =>
            `<span class="opt-key"><i style="background:${CATEGORY_COLOR[c]}"></i>${esc(c.replace(/_/g, " "))}</span>`).join("")}
        </div>
      </header>
      <p class="opt-note">Every arrow is a named transformation. Click one to see the structural change, why it was made, and what each objective did.</p>
      <div class="opt-tree" id="opt-tree">
        ${roots.map((root) => branch(root, children, byId, 0)).join("")}
      </div>
    </section>
    <div id="opt-edge-detail"></div>`;

  const detail = host.querySelector("#opt-edge-detail");
  host.querySelectorAll("[data-edge]").forEach((node) =>
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      host.querySelectorAll("[data-edge]").forEach((n) => n.classList.remove("selected"));
      node.classList.add("selected");
      const edge = data.edges.find((e) => e.id === Number(node.dataset.edge));
      detail.innerHTML = renderEdge(edge, byId.get(edge.parent_id), byId.get(edge.child_id), data.objectives);
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));

  host.querySelectorAll(".opt-branch-toggle").forEach((toggle) =>
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggle.closest(".opt-branch").classList.toggle("collapsed");
    }));
}

function branch(node, children, byId, depth) {
  const outgoing = children.get(node.id) || [];
  const collapsed = depth >= 1 && outgoing.length > 6;
  return `
    <div class="opt-branch ${collapsed ? "collapsed" : ""}">
      <div class="opt-node opt-node-${esc(node.state)}">
        ${outgoing.length ? `<button class="opt-branch-toggle" title="collapse">${outgoing.length}</button>` : `<span class="opt-branch-spacer"></span>`}
        <span class="opt-node-label">${STATE_GLYPH[node.state] || "•"} ${esc(node.label)}</span>
        <span class="opt-node-smiles mono">${esc(node.smiles)}</span>
        ${node.pareto_rank === 0 ? `<span class="opt-node-front">front</span>` : ""}
        ${node.rejection_reason ? `<span class="opt-node-reject" title="${esc(node.rejection_reason)}">rejected</span>` : ""}
      </div>
      ${outgoing.length ? `<div class="opt-children">
        ${outgoing.map((edge) => {
          const child = byId.get(edge.child_id);
          if (!child) return "";
          const net = edge.improved.length - edge.worsened.length;
          return `
            <div class="opt-edge-wrap">
              <button class="opt-edge" data-edge="${edge.id}"
                style="--cat:${CATEGORY_COLOR[edge.category] || "var(--border-strong)"}">
                <span class="opt-edge-arrow">→</span>
                <span class="opt-edge-name">${esc(edge.transformation)}</span>
                <span class="opt-edge-score ${net > 0 ? "up" : net < 0 ? "down" : "flat"}">
                  +${edge.improved.length} / −${edge.worsened.length}</span>
              </button>
              ${branch(child, children, byId, depth + 1)}
            </div>`;
        }).join("")}
      </div>` : ""}
    </div>`;
}

function renderEdge(edge, parent, child, objectives) {
  const labels = Object.fromEntries((objectives || []).map((o) => [o.key, o.label]));
  return `
    <section class="opt-panel lg-surface lg-d1">
      <header class="opt-panel-head">
        <div><h3>${esc(edge.transformation)}</h3>
          <span class="opt-chip">${esc(edge.category.replace(/_/g, " "))}</span>
          <span class="dim small">generation ${edge.generation}</span></div>
      </header>

      <div class="opt-transform">
        <div class="opt-transform-side">
          <h5>${esc(parent?.label || "parent")}</h5>
          <code>${esc(parent?.smiles || "")}</code>
        </div>
        <div class="opt-transform-arrow">→</div>
        <div class="opt-transform-side">
          <h5>${esc(child?.label || "child")}</h5>
          <code>${esc(child?.smiles || "")}</code>
        </div>
      </div>
      ${edge.detail?.smarts ? `<p class="opt-note mono small">${esc(edge.detail.smarts)}</p>` : ""}
      ${edge.detail?.fragment ? `<p class="opt-note">Fragment <span class="mono">${esc(edge.detail.fragment)}</span> attached at atom ${edge.detail.attachment_atom} (${esc(edge.detail.attachment_kind || "")}).</p>` : ""}
      ${edge.detail?.linker ? `<p class="opt-note">Linked with <span class="mono">${esc(edge.detail.linked_with || "")}</span> through <span class="mono">${esc(edge.detail.linker)}</span>.</p>` : ""}
      ${edge.detail?.shared_core ? `<p class="opt-note">Merged on a shared core of ${edge.detail.shared_atoms} atoms: <span class="mono small">${esc(edge.detail.shared_core)}</span></p>` : ""}

      <h4>Why this move</h4>
      <p class="opt-reason">${esc(edge.rationale || "—")}</p>
      <h4>What it costs</h4>
      <p class="opt-caveat">${esc(edge.tradeoff || "—")}</p>

      <h4>Objectives</h4>
      <div class="opt-delta-grid">
        <div class="opt-delta improved">
          <h5>Improved (${edge.improved.length})</h5>
          ${edge.improved.length ? edge.improved.map((e) => `
            <div><span>${esc(labels[e.key] || e.key)}</span>
              <b>${e.before} → ${e.after}</b>
              <span class="mono">${e.delta > 0 ? "+" : ""}${e.delta}</span></div>`).join("")
            : "<div class='dim'>nothing</div>"}
        </div>
        <div class="opt-delta worsened">
          <h5>Worsened (${edge.worsened.length})</h5>
          ${edge.worsened.length ? edge.worsened.map((e) => `
            <div><span>${esc(labels[e.key] || e.key)}</span>
              <b>${e.before} → ${e.after}</b>
              <span class="mono">${e.delta > 0 ? "+" : ""}${e.delta}</span></div>`).join("")
            : "<div class='dim'>nothing</div>"}
        </div>
        <div class="opt-delta unchanged">
          <h5>Unchanged (${edge.unchanged.length})</h5>
          ${edge.unchanged.length ? edge.unchanged.map((k) => `<div>${esc(labels[k] || k)}</div>`).join("")
            : "<div class='dim'>nothing</div>"}
        </div>
      </div>
      <p class="opt-caveat">Outcome for the child: <strong>${esc(edge.outcome)}</strong>. Values on both sides are model outputs and calculated descriptors, not measurements; neither structure has been made.</p>
    </section>`;
}
