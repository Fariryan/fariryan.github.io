/**
 * Evidence Graph.
 *
 * Curated edges are solid, literature-derived edges are dashed, and the two can
 * be filtered apart. That distinction is the whole reason this view exists
 * separately from the atlas's knowledge graph: a curated mechanism record and a
 * sentence in one preprint are both edges, and drawing them identically would
 * be a scientific error rendered in CSS.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { KIND_COLORS } from "../../viewer-graph.js";
import { labApi } from "../api.js";
import { needsSubject } from "../router.js";
import { subjectStore } from "../store.js";
import { confidenceChip, provBadge, relationshipChip, wireProvenance } from "../ui.js";

let cy = null;

export async function graphView(root, params) {
  const subject = subjectStore.get();
  if (!subject) {
    root.innerHTML = needsSubject("the Evidence Graph");
    return;
  }

  root.innerHTML = `
    <div class="graph-filters">
      <label><input type="checkbox" id="f-curated" checked /> Curated edges</label>
      <label><input type="checkbox" id="f-literature" checked /> Literature edges</label>
      <label>Minimum papers per literature edge
        <select id="f-minpapers">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>
      <label>Depth
        <select id="f-depth"><option>1</option><option>2</option></select>
      </label>
      <span class="spacer"></span>
      <button class="sm" id="g-fit">Fit</button>
      <button class="sm" id="g-reload">Reload</button>
    </div>
    <div id="graph-counts" class="mb"></div>
    <div class="lab-graph" id="lab-graph-host">
      ${loading("Building the evidence graph…")}
    </div>
    <div id="graph-legend"></div>`;

  const load = async () => {
    const host = root.querySelector("#lab-graph-host");
    host.innerHTML = loading("Building the evidence graph…");

    let data;
    try {
      data = await labApi.evidenceGraph(subject, {
        depth: root.querySelector("#f-depth").value,
        include_curated: root.querySelector("#f-curated").checked,
        include_literature: root.querySelector("#f-literature").checked,
        min_papers: root.querySelector("#f-minpapers").value,
      });
    } catch (error) {
      host.innerHTML = notice(esc(error.message), "danger", "⚠");
      return;
    }

    if (!data.nodes.length) {
      host.innerHTML = empty(
        "Nothing to draw: this entity has no curated neighbours and no literature has been retrieved for it."
      );
      return;
    }

    root.querySelector("#graph-counts").innerHTML = `
      <div class="row small dim">
        ${data.counts.nodes} nodes ·
        ${data.counts.curated_edges} curated edges ·
        ${data.counts.literature_edges} literature edges ·
        ${data.counts.nodes_outside_platform} entities not in the curated graph
      </div>`;

    root.querySelector("#graph-legend").innerHTML = `
      <div class="graph-legend">
        ${(data.legend.origins || [])
          .map(
            (origin) =>
              `<div class="item" title="${esc(origin.description)}">
                 <span class="swatch" style="background:${
                   origin.value === "curated" ? "var(--accent)" : "var(--ev-preliminary)"
                 }"></span>${esc(origin.label)}</div>`
          )
          .join("")}
        <div class="item"><span class="swatch" style="background:var(--ev-established)"></span>increases</div>
        <div class="item"><span class="swatch" style="background:var(--danger)"></span>decreases</div>
      </div>
      <div class="lab-note">${esc(data.note)}</div>`;

    draw(host, data, subject, root);
  };

  ["#f-curated", "#f-literature", "#f-minpapers", "#f-depth"].forEach((selector) =>
    root.querySelector(selector).addEventListener("change", load)
  );
  root.querySelector("#g-reload").addEventListener("click", load);
  root.querySelector("#g-fit").addEventListener("click", () => cy?.fit(undefined, 40));

  await load();
}

const POLARITY_COLOR = {
  increases: "#3fb950",
  decreases: "#f85149",
  associates: "#a371f7",
  no_effect: "#8b949e",
};

function draw(host, data, subject, root) {
  if (!window.cytoscape) {
    host.innerHTML = notice("The graph library is unavailable.", "warn", "⚠");
    return;
  }
  host.innerHTML = "";

  const elements = [
    ...data.nodes.map((node) => ({
      data: {
        id: node.key,
        label: node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label,
        full: node.label,
        kind: node.kind,
        inPlatform: node.in_platform ? 1 : 0,
        isRoot: node.key === data.root ? 1 : 0,
        size: node.key === data.root ? 42 : 15 + Math.min(20, (node.degree || 0) * 2),
        nodeId: node.node_id || "",
      },
    })),
    ...data.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        origin: edge.origin,
        polarity: edge.polarity || "",
        papers: edge.paper_count || 0,
      },
    })),
  ];

  cy?.destroy();
  cy = window.cytoscape({
    container: host,
    elements,
    wheelSensitivity: 0.25,
    minZoom: 0.12,
    maxZoom: 3,
    style: [
      {
        selector: "node",
        style: {
          "background-color": (n) => KIND_COLORS[n.data("kind")] || "#93a4b8",
          "border-width": (n) => (n.data("inPlatform") ? 1.5 : 2),
          "border-color": (n) => (n.data("inPlatform") ? "#0b0f14" : "#d29922"),
          "border-style": (n) => (n.data("inPlatform") ? "solid" : "dashed"),
          width: "data(size)",
          height: "data(size)",
          label: (n) => (n.data("isRoot") || n.data("size") > 22 ? n.data("label") : ""),
          color: "#e6edf5",
          "font-size": "10px",
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-outline-width": 2.5,
          "text-outline-color": "#0b0f14",
          "text-max-width": "120px",
          "text-wrap": "ellipsis",
        },
      },
      {
        selector: "node[isRoot = 1]",
        style: {
          "border-width": 3,
          "border-color": "#35c6d8",
          "font-size": "13px",
          "font-weight": 700,
          "text-valign": "center",
          "text-margin-y": 0,
          "z-index": 30,
        },
      },
      {
        selector: 'edge[origin = "curated"]',
        style: {
          "curve-style": "straight",
          "line-color": "#35c6d8",
          "target-arrow-color": "#35c6d8",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.6,
          width: 2,
          opacity: 0.85,
        },
      },
      {
        selector: 'edge[origin = "literature"]',
        style: {
          "curve-style": "bezier",
          "line-style": "dashed",
          "line-dash-pattern": [5, 4],
          "line-color": (e) => POLARITY_COLOR[e.data("polarity")] || "#8b949e",
          "target-arrow-color": (e) => POLARITY_COLOR[e.data("polarity")] || "#8b949e",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.55,
          width: (e) => 1 + Math.min(3, e.data("papers") * 0.6),
          opacity: 0.75,
        },
      },
      { selector: ".dim", style: { opacity: 0.07, "text-opacity": 0 } },
      {
        selector: ".spotlight",
        style: { "border-width": 3, "border-color": "#35c6d8", "z-index": 40 },
      },
    ],
    layout: {
      name: "concentric",
      animate: false,
      concentric: (n) => (n.data("isRoot") ? 10 : 5 + (n.data("size") || 0) / 10),
      levelWidth: () => 2,
      minNodeSpacing: 30,
      padding: 40,
    },
  });

  cy.on("mouseover", "node", (event) => {
    const hood = event.target.closedNeighborhood();
    cy.elements().difference(hood).addClass("dim");
    hood.addClass("spotlight");
  });
  cy.on("mouseout", "node", () => cy.elements().removeClass("dim").removeClass("spotlight"));

  cy.on("tap", "node", (event) => {
    const nodeId = event.target.data("nodeId");
    if (nodeId) window.location.hash = `#/entity/${nodeId}`;
  });

  cy.on("tap", "edge", async (event) => {
    const edge = data.edges.find((candidate) => candidate.id === event.target.id());
    if (edge) showEdgePanel(host, edge, subject, root);
  });

  cy.ready(() => cy.fit(undefined, 40));
}

async function showEdgePanel(host, edge, subject, root) {
  host.querySelector(".edge-panel")?.remove();

  const panel = document.createElement("div");
  panel.className = "edge-panel";
  panel.innerHTML = loading("Loading the evidence behind this edge…");
  host.appendChild(panel);

  let detail = edge;
  try {
    detail = await labApi.evidenceGraphEdge(subject, edge.id, { depth: 1 });
  } catch {
    /* fall back to what the graph payload already carries */
  }

  const supporting = detail.supporting || [];
  panel.innerHTML = `
    <span class="close" title="Close">✕</span>
    <h4>${esc(detail.label || detail.predicate)}</h4>
    <div class="row mb">
      ${provBadge(detail.provenance || { class: "database" })}
      ${confidenceChip(detail.confidence)}
      ${relationshipChip(detail.relationship_class)}
    </div>
    <div class="small muted mb">
      <strong>Direct relationship:</strong> ${detail.direct ? "yes — a source asserts it" : "no — extracted from text"}<br />
      <strong>Origin:</strong> ${esc(detail.origin_label || detail.origin)}
      ${detail.paper_count ? `<br /><strong>Records:</strong> ${detail.paper_count}` : ""}
      ${
        detail.study_contexts?.length
          ? `<br /><strong>Experimental contexts:</strong> ${esc(detail.study_contexts.join(", "))}`
          : ""
      }
    </div>
    ${detail.statement ? `<div class="quote">“${esc(detail.statement)}”</div>` : ""}
    ${
      supporting.length
        ? `<h5 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin:11px 0 5px">Supporting records</h5>
           ${supporting
             .map(
               (record) => `<div style="margin-bottom:9px">
                 <div class="small">${esc(record.title || "")}</div>
                 <div class="small dim">${esc(record.date || "")}${
                   record.is_preprint ? " · preprint" : ""
                 }${record.study_context ? " · " + esc(record.study_context) : ""}</div>
                 ${record.sentence ? `<div class="quote">“${esc(record.sentence)}”</div>` : ""}
                 ${
                   record.pmid
                     ? `<a class="small" href="https://pubmed.ncbi.nlm.nih.gov/${esc(
                         record.pmid
                       )}/" target="_blank" rel="noopener">PMID ${esc(record.pmid)}</a>`
                     : ""
                 }
               </div>`
             )
             .join("")}`
        : ""
    }
    ${
      detail.provenance_records?.length
        ? `<h5 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin:11px 0 5px">Source records</h5>
           ${detail.provenance_records
             .map(
               (record) => `<div class="small" style="margin-bottom:6px">
                 <strong>${esc(record.source_name || record.source_key || "source")}</strong>
                 ${record.record_id ? `<span class="dim"> · ${esc(record.record_id)}</span>` : ""}
                 ${
                   record.url
                     ? ` <a href="${esc(record.url)}" target="_blank" rel="noopener">open</a>`
                     : ""
                 }
               </div>`
             )
             .join("")}`
        : ""
    }
    <div class="lab-note">${esc(detail.why || "")}</div>`;

  panel.querySelector(".close").addEventListener("click", () => panel.remove());
  wireProvenance(panel);
}
