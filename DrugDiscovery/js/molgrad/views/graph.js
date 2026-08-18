/**
 * The branching search graph.
 *
 * Abandoned branches are drawn, not hidden. A graph showing only the winning
 * lineage would suggest the optimiser walked straight to its answer, when in
 * fact most of what a run establishes is which directions did not work — and
 * the reason each was left is on the node.
 */

import { esc, loading, notice } from "../../ui.js";
import { mgApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

const STATE_TONE = {
  active: "active",
  expanded: "expanded",
  abandoned: "abandoned",
  rejected: "rejected",
  duplicate: "duplicate",
};

export async function graphView(root, params) {
  const runKey = params?.get("run") || currentRun.get();
  if (!runKey) {
    root.innerHTML = needsRun();
    return;
  }

  root.innerHTML = loading("Loading the search graph…");

  let graph;
  try {
    graph = await mgApi.graph(runKey);
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const byGeneration = new Map();
  for (const node of graph.nodes) {
    if (!byGeneration.has(node.generation)) byGeneration.set(node.generation, []);
    byGeneration.get(node.generation).push(node);
  }
  const generations = [...byGeneration.keys()].sort((a, b) => a - b);

  root.innerHTML = `
    <div class="mg-graph-summary">
      <div class="mg-graph-count">
        <div class="value">${graph.nodes.length}</div><div class="label">candidates</div>
      </div>
      <div class="mg-graph-count">
        <div class="value">${generations.length}</div><div class="label">generations</div>
      </div>
      <div class="mg-graph-count abandoned">
        <div class="value">${graph.abandoned.count}</div>
        <div class="label">abandoned</div>
      </div>
    </div>

    <div class="mg-caveat">${esc(graph.abandoned.note)}</div>

    ${
      Object.keys(graph.abandoned.by_reason || {}).length
        ? `<section class="card">
             <h3>Why branches were abandoned</h3>
             <table class="mg-table">
               <thead><tr><th>Reason</th><th>Count</th></tr></thead>
               <tbody>
                 ${Object.entries(graph.abandoned.by_reason)
                   .sort((a, b) => b[1] - a[1])
                   .map(
                     ([reason, count]) =>
                       `<tr><td>${esc(reason.replace(/_/g, " "))}</td>
                        <td class="mono">${count}</td></tr>`
                   )
                   .join("")}
               </tbody>
             </table>
           </section>`
        : ""
    }

    <section class="card">
      <h3>Search graph by generation</h3>
      <div class="mg-graph">
        ${generations
          .map(
            (generation) => `
          <div class="mg-graph-gen">
            <div class="mg-graph-gen-label">GEN ${generation}</div>
            <div class="mg-graph-nodes">
              ${byGeneration
                .get(generation)
                .map(
                  (node) => `
                <a class="mg-node mg-node-${esc(
                  STATE_TONE[node.state] || "active"
                )} ${node.pareto_rank === 0 ? "frontier" : ""}"
                   href="#/molgrad/trajectory?run=${encodeURIComponent(
                     runKey
                   )}&candidate=${encodeURIComponent(node.key)}"
                   title="${esc(
                     node.abandon_reason
                       ? `abandoned: ${node.abandon_reason.replace(/_/g, " ")}`
                       : node.state
                   )}">
                  <span class="mono">${esc(node.key)}</span>
                  ${
                    node.pareto_rank === 0
                      ? '<span class="mg-node-front">frontier</span>'
                      : ""
                  }
                  ${
                    node.abandon_reason
                      ? `<span class="mg-node-reason">${esc(
                          node.abandon_reason.replace(/_/g, " ")
                        )}</span>`
                      : ""
                  }
                </a>`
                )
                .join("")}
            </div>
          </div>`
          )
          .join("")}
      </div>

      <div class="mg-legend">
        ${Object.entries(STATE_TONE)
          .map(
            ([state, tone]) =>
              `<span class="mg-legend-item">
                 <span class="mg-node mg-node-${esc(tone)} sample"></span>
                 ${esc(state)}
               </span>`
          )
          .join("")}
      </div>
    </section>

    <section class="card">
      <h3>Edges <span class="n">${graph.edges.length}</span></h3>
      <table class="mg-table">
        <thead><tr><th>From</th><th>Change</th><th>To</th><th>Engine</th><th>Gen</th></tr></thead>
        <tbody>
          ${graph.edges
            .slice(0, 200)
            .map(
              (edge) => `<tr>
                <td class="mono small">${esc(edge.from || "seed")}</td>
                <td>${esc(edge.change)}</td>
                <td class="mono small">${esc(edge.to || "")}</td>
                <td class="dim small">${esc(edge.engine)}</td>
                <td>${edge.generation}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`;
}
