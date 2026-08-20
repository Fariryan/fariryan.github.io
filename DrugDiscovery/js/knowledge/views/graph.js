/**
 * The cross-source knowledge graph.
 *
 * Cytoscape.js is used, and it is the library already vendored for the atlas's
 * own graph viewer — no new dependency, no new licence to audit, and one
 * rendering engine to reason about rather than two. Its MIT notice ships in
 * frontend/vendor/LICENSES.md.
 *
 * Clicking a node calls back to the provider that produced it and shows the
 * evidence in full, which is the requirement the phase brief states: a node is
 * a way into its source record, not a decoration.
 */

import { esc, loading, notice } from "../../ui.js";
import { kbApi } from "../api.js";
import {
  KIND_GLYPH,
  identifierChip,
  kbDisclaimer,
  provenanceBlock,
  statusChip,
} from "../ui.js";

//: Kept in step with app.knowledge.entities.EntityKind.
const KIND_STYLE = {
  disease: "#e0679a",
  gene: "#d9b038",
  protein: "#35c7d8",
  target: "#a371f7",
  pathway: "#2bb8a3",
  structure: "#7a86f0",
  compound: "#3ee08f",
  drug: "#f0883e",
  assay: "#8b949e",
  trial: "#4a9eff",
  publication: "#9dbdae",
};

export async function graphView(root, params) {
  const preset = params?.get("disease") || "";

  root.innerHTML = `
    <section class="kb-controls lg-surface lg-d1">
      <div class="kb-control-row">
        <label for="kb-disease">Disease</label>
        <input id="kb-disease" type="search" autocomplete="off" spellcheck="false"
               value="${esc(preset)}"
               placeholder="Ontology identifier — MONDO_0018177, MONDO_0005184, EFO_0000305…"
               aria-label="Disease ontology identifier" />
        <label for="kb-targets" class="dim small">Targets</label>
        <select id="kb-targets"><option>6</option><option selected>10</option><option>20</option></select>
        <label for="kb-follow" class="dim small">Expand</label>
        <select id="kb-follow"><option>1</option><option selected>2</option><option>3</option><option>5</option></select>
        <label for="kb-window" class="dim small">Literature</label>
        <select id="kb-window">
          <option value="30d">30 days</option>
          <option value="1y" selected>1 year</option>
          <option value="all">All time</option>
        </select>
        <button id="kb-build" class="kb-btn">Build graph</button>
      </div>
      <p class="dim small kb-control-note">
        Expansion is bounded on purpose. Glioblastoma has over eleven thousand
        associated targets; following all of them would be tens of thousands of
        requests to public APIs for a graph nobody can read. What was actually
        traversed is recorded on the result.
      </p>
    </section>

    <div id="kb-graph-status"></div>
    <div class="kb-graph-layout">
      <div id="kb-graph-host" class="kb-graph-host lg-surface lg-d1"></div>
      <aside id="kb-evidence" class="kb-evidence lg-surface lg-d1">
        <div class="kb-evidence-idle">
          <span class="kb-idle-glyph">⁘</span>
          <p>Build a graph, then click any node to open the evidence behind it.</p>
        </div>
      </aside>
    </div>
    <div id="kb-graph-report"></div>
    ${kbDisclaimer}`;

  const statusHost = root.querySelector("#kb-graph-status");
  const graphHost = root.querySelector("#kb-graph-host");
  const evidenceHost = root.querySelector("#kb-evidence");
  const reportHost = root.querySelector("#kb-graph-report");
  const input = root.querySelector("#kb-disease");

  async function build() {
    const disease = input.value.trim();
    if (!disease) {
      statusHost.innerHTML = notice("Enter a disease ontology identifier.", "warn", "⚠");
      return;
    }
    statusHost.innerHTML = loading(
      `Assembling the graph for ${esc(disease)} — querying Open Targets, UniProt, Reactome, RCSB, ClinicalTrials.gov and Europe PMC…`
    );
    reportHost.innerHTML = "";
    try {
      const graph = await kbApi.diseaseGraph({
        disease,
        target_limit: Number(root.querySelector("#kb-targets").value),
        follow_targets: Number(root.querySelector("#kb-follow").value),
        literature_window: root.querySelector("#kb-window").value,
      });
      statusHost.innerHTML = "";
      render(graph);
    } catch (error) {
      statusHost.innerHTML = notice(
        `<strong>The graph could not be assembled.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  }

  function render(graph) {
    reportHost.innerHTML = renderReport(graph);
    drawGraph(graph, graphHost, evidenceHost);
  }

  root.querySelector("#kb-build").addEventListener("click", build);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      build();
    }
  });

  if (preset) build();
}

/* ------------------------------------------------------------------ report */

function renderReport(graph) {
  const kinds = Object.entries(graph.counts.by_kind || {})
    .sort((a, b) => b[1] - a[1])
    .map(
      ([kind, n]) =>
        `<span class="kb-kind kb-kind-${esc(kind)}">${KIND_GLYPH[kind] || "•"} ${esc(
          kind
        )} <b>${n}</b></span>`
    )
    .join("");

  const predicates = Object.entries(graph.counts.by_predicate || {})
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `<span class="kb-pred">${esc(p.replace(/_/g, " "))} <b>${n}</b></span>`)
    .join("");

  const calls = (graph.calls || [])
    .map(
      (c) => `
      <tr class="${c.status === "ok" ? "" : "kb-row-warn"}">
        <td>${statusChip(c.status, c.count)}</td>
        <td class="mono small">${esc(c.provider)}</td>
        <td class="small">${esc(c.purpose)}</td>
        <td class="num mono small">${c.total_available ?? "—"}</td>
        <td class="small dim">${esc(c.note || "")}</td>
      </tr>`
    )
    .join("");

  return `
    <section class="kb-report lg-surface lg-d1">
      <header class="kb-report-head">
        <div>
          <h3>What this graph is made of</h3>
          <p class="dim small">
            ${graph.counts.nodes} nodes, ${graph.counts.edges} edges, from
            ${(graph.calls || []).length} provider calls.
            ${graph.cross_references_recorded
              ? `${graph.cross_references_recorded} entities added to the cross-reference map.`
              : ""}
          </p>
        </div>
        ${
          graph.incomplete
            ? `<span class="kb-status kb-status-unavailable"><span class="kb-glyph">⚠</span>incomplete</span>`
            : `<span class="kb-status kb-status-ok"><span class="kb-glyph">●</span>all sources answered</span>`
        }
      </header>

      ${
        graph.incomplete
          ? `<p class="kb-incomplete">${esc(graph.incomplete_reason)}</p>`
          : ""
      }
      ${graph.truncated ? `<p class="kb-incomplete">Node limit reached; expansion stopped early.</p>` : ""}

      <div class="kb-chips">${kinds}</div>
      <div class="kb-chips kb-preds">${predicates}</div>

      <details class="kb-calls">
        <summary>Provider calls · ${(graph.calls || []).length}</summary>
        <table class="kb-table">
          <thead><tr><th>Status</th><th>Provider</th><th>Purpose</th><th class="num">Available</th><th>Note</th></tr></thead>
          <tbody>${calls}</tbody>
        </table>
      </details>

      ${provenanceBlock(graph.provenance, "Sources behind this graph")}
      <p class="dim small kb-storage-note">${esc(graph.storage_note || "")}</p>
    </section>`;
}

/* ------------------------------------------------------------------- graph */

function drawGraph(graph, host, evidenceHost) {
  if (!window.cytoscape) {
    host.innerHTML = notice(
      "The graph library did not load, so the graph cannot be drawn. The evidence table above is unaffected.",
      "warn",
      "⚠"
    );
    return;
  }

  host.innerHTML = "";

  const elements = [
    ...graph.nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.label,
        kind: n.kind,
        provider: n.provider,
      },
    })),
    ...graph.edges.map((e) => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.predicate.replace(/_/g, " ").toLowerCase(),
        predicate: e.predicate,
        provider: e.provider,
      },
    })),
  ];

  const cy = window.cytoscape({
    container: host,
    elements,
    style: [
      {
        selector: "node",
        style: {
          "background-color": (el) => KIND_STYLE[el.data("kind")] || "#8b949e",
          label: "data(label)",
          color: "#cfe3d8",
          "font-size": 9,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "text-max-width": 90,
          "text-wrap": "ellipsis",
          width: 18,
          height: 18,
          "border-width": 1,
          "border-color": "rgba(255,255,255,.25)",
        },
      },
      {
        selector: 'node[kind="disease"]',
        style: { width: 34, height: 34, "font-size": 12, "font-weight": "bold" },
      },
      {
        selector: "edge",
        style: {
          width: 1,
          "line-color": "rgba(150,200,180,.28)",
          "target-arrow-color": "rgba(150,200,180,.4)",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.6,
          "curve-style": "bezier",
          "font-size": 7,
          color: "#6f8f80",
        },
      },
      {
        selector: "node:selected",
        style: { "border-width": 3, "border-color": "#3ee08f" },
      },
      { selector: ".dimmed", style: { opacity: 0.15 } },
    ],
    layout: {
      name: "cose",
      animate: false,
      nodeRepulsion: 9000,
      idealEdgeLength: 70,
      padding: 24,
    },
    wheelSensitivity: 0.2,
  });

  cy.on("tap", "node", async (event) => {
    const node = event.target;
    cy.elements().addClass("dimmed");
    node.removeClass("dimmed");
    node.neighborhood().removeClass("dimmed");
    await showEvidence(evidenceHost, node.data());
  });

  cy.on("tap", (event) => {
    if (event.target === cy) cy.elements().removeClass("dimmed");
  });
}

/* ---------------------------------------------------------------- evidence */

async function showEvidence(host, data) {
  host.innerHTML = loading(`Fetching the evidence for ${esc(data.label)}…`);
  let result;
  try {
    result = await kbApi.nodeEvidence(data.id, data.kind);
  } catch (error) {
    host.innerHTML = notice(
      `<strong>Evidence could not be fetched.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  const record = (result.records || [])[0];
  host.innerHTML = `
    <header class="kb-evidence-head">
      <div>
        <span class="kb-kind kb-kind-${esc(data.kind)}">${KIND_GLYPH[data.kind] || "•"} ${esc(
          data.kind
        )}</span>
        <h3>${esc(data.label)}</h3>
        <div class="mono small dim">${esc(data.id)}</div>
      </div>
      ${statusChip(result.status, result.count)}
    </header>

    ${
      result.status !== "ok"
        ? `<div class="kb-section-note">${esc(
            result.note || "No further detail was recorded."
          )}</div>`
        : renderRecord(record, data.kind)
    }

    ${provenanceBlock(result.provenance, "Where this came from")}`;
}

function renderRecord(record, kind) {
  if (!record) return `<p class="dim">The provider returned no detail.</p>`;

  const ids = (record.identifiers || []).map(identifierChip).join("");
  const skip = new Set(["id", "identifiers", "name", "title", "symbol"]);

  const rows = Object.entries(record)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      let rendered;
      if (Array.isArray(v)) {
        if (!v.length) return "";
        rendered = v
          .slice(0, 12)
          .map((item) =>
            typeof item === "object"
              ? `<span class="kb-sub">${esc(
                  item.name || item.label || item.mechanism_of_action || JSON.stringify(item).slice(0, 90)
                )}</span>`
              : `<span class="kb-sub">${esc(String(item).slice(0, 120))}</span>`
          )
          .join("");
        if (v.length > 12) rendered += `<span class="dim small"> +${v.length - 12} more</span>`;
      } else if (typeof v === "object") {
        rendered = Object.entries(v)
          .filter(([, x]) => x !== null && x !== undefined)
          .map(([x, y]) => `<span class="kb-sub">${esc(x)} <b>${esc(String(y))}</b></span>`)
          .join("");
      } else {
        rendered = `<span>${esc(String(v).slice(0, 600))}</span>`;
      }
      return rendered
        ? `<tr><th>${esc(k.replace(/_/g, " "))}</th><td>${rendered}</td></tr>`
        : "";
    })
    .join("");

  return `
    ${ids ? `<div class="kb-chips kb-ids">${ids}</div>` : ""}
    <table class="kb-record"><tbody>${rows}</tbody></table>`;
}
