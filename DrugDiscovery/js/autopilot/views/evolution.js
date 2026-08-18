/**
 * CHEMICAL EVOLUTION TREE and property trajectories.
 *
 * Abandoned branches are shown, not pruned. A tree containing only the
 * surviving lineage records a conclusion; the branches that failed are what
 * a medicinal chemistry programme actually learns from.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { apApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

export async function evolutionView(host) {
  const runId = currentRun.get();
  if (!runId) {
    host.innerHTML = needsRun();
    return;
  }

  host.innerHTML = loading("Loading the evolution tree…");
  let payload;
  try {
    payload = await apApi.evolution(runId);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (payload.available === false) {
    host.innerHTML = notice(esc(payload.reason), "muted", "◌");
    return;
  }

  const tree = payload.tree || {};
  const trajectories = payload.trajectories || {};

  if (!tree.available) {
    host.innerHTML = notice(esc(tree.reason || "No tree available."), "muted", "◌");
    return;
  }

  host.innerHTML = `
    ${renderTree(tree)}
    ${renderTrajectories(trajectories)}
    <div id="ap-candidate-detail"></div>
  `;
  wire(host, tree);
}

function renderTree(tree) {
  const byGeneration = {};
  for (const node of tree.nodes) {
    (byGeneration[node.generation] ||= []).push(node);
  }

  return card(
    `Evolution tree — ${tree.nodes.length} candidates, ${tree.abandoned} abandoned`,
    `<div class="ap-tree">
      ${Object.keys(byGeneration)
        .map(Number)
        .sort((a, b) => a - b)
        .map(
          (generation) => `
          <div class="ap-generation">
            <div class="ap-generation-label">gen ${generation}</div>
            <div class="ap-generation-nodes">
              ${byGeneration[generation]
                .map(
                  (n) => `
                <button class="ap-candidate ${
                  n.on_frontier ? "frontier" : ""
                } ${n.rejection_reason ? "abandoned" : ""}"
                        data-candidate="${esc(n.candidate_key)}">
                  <div class="ap-candidate-key mono">${esc(n.candidate_key)}</div>
                  ${n.on_frontier ? '<span class="ap-star">★</span>' : ""}
                  ${
                    n.what_changed
                      ? `<div class="ap-change">${esc(n.what_changed)}</div>`
                      : ""
                  }
                  ${
                    n.rejection_reason
                      ? `<div class="ap-rejected">${esc(n.rejection_reason)}</div>`
                      : ""
                  }
                </button>`
                )
                .join("")}
            </div>
          </div>`
        )
        .join("")}
    </div>
    <p class="dim">${esc(tree.note)}</p>`
  );
}

function renderTrajectories(trajectories) {
  if (!trajectories.available || !trajectories.series?.length) {
    return card(
      "Property trajectories",
      empty(trajectories.reason || "No objective produced a trajectory.")
    );
  }

  return card(
    "Property trajectories",
    `${trajectories.series
      .map((series) => {
        const values = series.points.map((p) => p.best);
        if (!values.length) return "";
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min || 1;
        return `<div class="ap-trajectory">
          <div class="ap-trajectory-head">
            <strong>${esc(series.label)}</strong>
            <span class="dim">${esc(series.direction)}</span>
          </div>
          <div class="ap-sparkline">
            ${series.points
              .map(
                (p) =>
                  `<span class="ap-spark" style="height:${
                    8 + Math.round(((p.best - min) / span) * 40)
                  }px" title="gen ${p.generation}: best ${p.best}, mean ${
                    p.mean
                  } (n=${p.n})"></span>`
              )
              .join("")}
          </div>
          <div class="dim">gen 0 → ${series.points.length - 1};
            best ${values[0]} → ${values[values.length - 1]}</div>
        </div>`;
      })
      .join("")}
     <p class="dim">${esc(trajectories.note)}</p>`
  );
}

function wire(host, tree) {
  const detail = host.querySelector("#ap-candidate-detail");
  host.querySelectorAll(".ap-candidate").forEach((button) => {
    button.addEventListener("click", () => {
      const node = tree.nodes.find(
        (n) => n.candidate_key === button.dataset.candidate
      );
      if (!node) return;
      detail.innerHTML = card(
        `${esc(node.candidate_key)}${node.on_frontier ? " ★ on the frontier" : ""}`,
        `<div class="mono ap-smiles">${esc(node.smiles)}</div>

         <div class="ap-field">
           <div class="ap-field-label">Why it was created</div>
           <p>${esc(node.why_created || "No rationale recorded.")}</p>
         </div>
         ${
           node.what_changed
             ? `<div class="ap-field">
                  <div class="ap-field-label">What changed</div>
                  <p>${esc(node.what_changed)}${
                 node.targeted_property
                   ? ` — targeting ${esc(node.targeted_property)}`
                   : ""
               }</p>
                </div>`
             : ""
         }
         ${
           node.why_rejected
             ? `<div class="ap-field">
                  <div class="ap-field-label">Why it was rejected</div>
                  <p class="ap-rejected-text">${esc(node.why_rejected)}</p>
                </div>`
             : ""
         }
         ${
           node.improved && Object.keys(node.improved).length
             ? `<div class="ap-field">
                  <div class="ap-field-label">Property effect</div>
                  <div>Improved: ${esc(Object.keys(node.improved).join(", "))}</div>
                  ${
                    node.worsened && Object.keys(node.worsened).length
                      ? `<div>Worsened: ${esc(
                          Object.keys(node.worsened).join(", ")
                        )}</div>`
                      : ""
                  }
                </div>`
             : ""
         }
         ${
           node.has_precedent !== null && node.has_precedent !== undefined
             ? `<div class="dim">Known precedent: ${
                 node.has_precedent ? "yes" : "none found in the indexed sources"
               }</div>`
             : ""
         }
         <div class="dim">Novelty: ${esc(
           node.novelty_class || "not assessed"
         )} · SAscore ${esc(String(node.synthetic_accessibility ?? "—"))}</div>`
      );
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}
