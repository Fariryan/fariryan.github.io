/**
 * Evidence Graph.
 *
 * The campaign's claims as a network. Every edge carries the records behind it
 * and is labelled with its evidence status — these are a language model's
 * readings of named papers, so they are interpretations, and the graph says so
 * rather than presenting them as established relationships.
 *
 * Edges whose relationship did not map onto the predicate vocabulary are drawn
 * dashed. An inferred connection and a stated one must not look the same.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { activeCampaign, discApi } from "../api.js";

export async function graphView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = loading("Building the evidence graph…");

  try {
    const graph = await discApi.graph(campaign.code);
    if (!graph.nodes.length) {
      root.innerHTML = empty(
        "No evidence yet. Retrieve literature and the graph builds itself from " +
          "the extracted claims."
      );
      return;
    }

    root.innerHTML = `
      ${card(
        `Evidence graph — ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
        `<div class="graph-stage" id="graph-stage"></div>
         <div class="graph-legend">
           <span><span class="graph-line solid"></span> mapped predicate</span>
           <span><span class="graph-line dashed"></span> relationship not in the vocabulary</span>
           <span class="dim">Vocabulary: ${esc(graph.predicate_vocabulary.join(", "))}</span>
         </div>
         <div class="lab-note">${esc(graph.note)}</div>`
      )}
      <div id="graph-detail"></div>`;

    renderGraph(root, graph);
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

/**
 * Drawn with the vendored Cytoscape the atlas already ships.
 *
 * Layout is force-directed and therefore arbitrary — unlike the chemical-space
 * view, position here carries no meaning, and the legend does not pretend it
 * does.
 */
async function renderGraph(root, graph) {
  const stage = root.querySelector("#graph-stage");
  const detail = root.querySelector("#graph-detail");

  const cytoscape = (await import("../../../vendor/cytoscape.min.js")).default
    || window.cytoscape;
  if (!cytoscape) {
    stage.innerHTML = notice("The graph library could not be loaded.", "warn", "⚠");
    return;
  }

  const cy = cytoscape({
    container: stage,
    elements: [
      ...graph.nodes.map((node) => ({
        data: { id: node.id, label: node.label, kind: node.kind, mentions: node.mentions },
      })),
      ...graph.edges.map((edge, index) => ({
        data: {
          id: `e${index}`,
          source: edge.source,
          target: edge.target,
          label: edge.predicate,
          mapped: edge.predicate_mapped,
          index,
        },
      })),
    ],
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "font-size": "9px",
          "text-wrap": "ellipsis",
          "text-max-width": "90px",
          "background-color": "#64748b",
          width: "mapData(mentions, 1, 12, 12, 34)",
          height: "mapData(mentions, 1, 12, 12, 34)",
        },
      },
      { selector: 'node[kind = "gene"]', style: { "background-color": "#0ea5e9" } },
      { selector: 'node[kind = "disease"]', style: { "background-color": "#ef4444" } },
      { selector: 'node[kind = "drug"]', style: { "background-color": "#22c55e" } },
      { selector: 'node[kind = "pathway"]', style: { "background-color": "#a855f7" } },
      { selector: 'node[kind = "hypothesis"]', style: { "background-color": "#f59e0b", shape: "diamond" } },
      {
        selector: "edge",
        style: {
          label: "data(label)",
          "font-size": "7px",
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "line-color": "#94a3b8",
          "target-arrow-color": "#94a3b8",
          width: 1.2,
        },
      },
      // Unmapped relationships are visually distinct, always.
      { selector: "edge[!mapped]", style: { "line-style": "dashed", opacity: 0.6 } },
    ],
    layout: { name: "cose", animate: false, nodeRepulsion: 8000 },
  });

  cy.on("tap", "edge", (event) => {
    const edge = graph.edges[event.target.data("index")];
    detail.innerHTML = card(
      `${edge.source.split(":")[1]} — ${edge.predicate} — ${edge.target.split(":")[1]}`,
      `<div class="row">
        <span class="status-chip status-${esc(edge.status)}">${esc(edge.status)}</span>
        ${edge.predicate_mapped
          ? ""
          : `<span class="chip warn">relationship not in the vocabulary</span>`}
        <span class="dim small">as written: “${esc(edge.raw_relationship)}”</span>
      </div>
      ${edge.species.length
        ? `<div class="small">Species: ${esc(edge.species.join(", "))}</div>`
        : ""}
      ${edge.model_systems.length
        ? `<div class="small">Model systems: ${esc(edge.model_systems.join(", "))}</div>`
        : ""}
      <div class="mt small"><strong>${edge.evidence_count} record(s)</strong></div>
      <ul class="small">
        ${edge.evidence
          .map(
            (record) => `<li>
              <span class="mono">${esc(record.source_id)}</span>
              ${record.published ? `<span class="dim">${esc(record.published)}</span>` : ""}
              ${record.title ? `<div class="dim">${esc(record.title)}</div>` : ""}
              ${record.quote ? `<div class="disc-quote">“${esc(record.quote)}”</div>` : ""}
            </li>`
          )
          .join("")}
      </ul>`
    );
  });
}
