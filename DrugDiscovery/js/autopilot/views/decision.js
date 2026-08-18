/**
 * CANDIDATE DECISION ROOM.
 *
 * Five panels per candidate — structure at the centre, evolution left,
 * properties and liabilities right, target above, known chemistry below —
 * with candidates laid side by side.
 *
 * Deliberately unranked. A Pareto front has no internal order, and imposing
 * one would present a preference the platform does not have as if it were a
 * result.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { apApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

export async function decisionView(host) {
  const runId = currentRun.get();
  if (!runId) {
    host.innerHTML = needsRun();
    return;
  }

  host.innerHTML = loading("Assembling the decision room…");
  let room;
  try {
    room = await apApi.decisionRoom(runId);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!room.available) {
    host.innerHTML = notice(esc(room.reason), "muted", "◌");
    return;
  }

  host.innerHTML = `
    ${notice(esc(room.ranking_note), "info", "◫")}
    <div class="ap-room ${room.comparable ? "comparing" : ""}">
      ${room.candidates.map(renderCandidate).join("")}
    </div>
  `;
}

function renderCandidate(c) {
  return `<article class="ap-room-card">
    <!-- TOP — target and mechanism -->
    <header class="ap-room-top">
      <div class="ap-field-label">Target / mechanism</div>
      <div>${esc(c.target.target || "no target named")}
        ${
          c.target.disease
            ? `<span class="dim">· ${esc(c.target.disease)}</span>`
            : ""
        }</div>
      ${
        c.target.evidence?.activity_count != null
          ? `<div class="dim">${c.target.evidence.activity_count} measured
             activities, ${c.target.evidence.ligand_count} ligands indexed</div>`
          : ""
      }
    </header>

    <div class="ap-room-body">
      <!-- LEFT — evolution history -->
      <aside class="ap-room-left">
        <div class="ap-field-label">Evolution</div>
        ${
          c.evolution.available
            ? `<div class="dim">generation ${c.evolution.generation}</div>
               ${
                 c.evolution.what_changed
                   ? `<p><strong>${esc(c.evolution.what_changed)}</strong></p>`
                   : ""
               }
               ${
                 c.evolution.why_created
                   ? `<p class="dim">${esc(c.evolution.why_created)}</p>`
                   : ""
               }
               ${
                 c.evolution.ancestry?.length
                   ? `<ol class="ap-ancestry">${c.evolution.ancestry
                       .map(
                         (a) =>
                           `<li><span class="mono">${esc(
                             a.candidate_key
                           )}</span>${
                             a.what_changed
                               ? `<div class="dim">${esc(a.what_changed)}</div>`
                               : ""
                           }</li>`
                       )
                       .join("")}</ol>`
                   : `<p class="dim">No ancestors — this is a seed.</p>`
               }`
            : `<p class="dim">${esc(c.evolution.reason || "No lineage.")}</p>`
        }
      </aside>

      <!-- CENTRE — the structure -->
      <div class="ap-room-centre">
        <div class="mono ap-room-key">${esc(c.centre.candidate_key)}</div>
        <div class="ap-room-struct">${
          c.centre.svg || '<div class="dim">not depictable</div>'
        }</div>
        <div class="mono dim ap-smiles">${esc(
          (c.centre.smiles || "").slice(0, 70)
        )}</div>
      </div>

      <!-- RIGHT — properties and liabilities -->
      <aside class="ap-room-right">
        <div class="ap-field-label">Properties</div>
        ${renderProperties(c.properties)}

        <div class="ap-field-label">Liabilities</div>
        ${
          c.liabilities.failure_modes?.length
            ? `<ul class="ap-liabilities">${c.liabilities.failure_modes
                .map(
                  (m) =>
                    `<li><span class="ap-pill ${
                      m.severity === "high" ? "failed" : "warn"
                    }">${esc(m.severity)}</span> ${esc(m.label)}</li>`
                )
                .join("")}</ul>`
            : `<p class="dim">No high or moderate liability recorded.</p>`
        }
        <p class="dim">${esc(c.liabilities.note)}</p>
      </aside>
    </div>

    <!-- BOTTOM — known chemistry -->
    <footer class="ap-room-bottom">
      <div class="ap-field-label">Known chemistry</div>
      <p>${esc(c.known_chemistry.headline || "No neighbourhood assessed.")}</p>
      ${
        c.known_chemistry.withdrawn_analogues?.length
          ? `<div class="ap-withdrawn">
               <strong>Withdrawn analogues</strong>
               ${c.known_chemistry.withdrawn_analogues
                 .map(
                   (w) =>
                     `<span class="ap-pill failed">${esc(w.name)} ${
                       w.similarity ? w.similarity.toFixed(2) : ""
                     }</span>`
                 )
                 .join(" ")}
             </div>`
          : ""
      }

      <div class="ap-room-extra">
        <div>
          <div class="ap-field-label">Uncertainty</div>
          <p class="dim">${esc(c.uncertainty.summary)}</p>
        </div>
        <div>
          <div class="ap-field-label">Synthetic feasibility</div>
          <p class="dim">${esc(
            c.synthesis?.interpretation || c.synthesis?.note || "Not assessed."
          )}</p>
        </div>
        <div>
          <div class="ap-field-label">Next experiment</div>
          <p class="dim">${esc(
            c.next_experiment?.proposal || "None ranked."
          )}</p>
        </div>
      </div>
    </footer>
  </article>`;
}

function renderProperties(properties) {
  const values = properties.objective_values || {};
  const confidence = properties.objective_confidence || {};
  const entries = Object.entries(values);
  if (!entries.length) {
    return `<p class="dim">No objective values recorded.</p>`;
  }
  return `<table class="ap-table compact">
    <tbody>${entries
      .map(
        ([k, v]) =>
          `<tr>
            <td class="mono">${esc(k)}</td>
            <td>${typeof v === "number" ? v.toFixed(3) : esc(String(v))}</td>
            <td class="dim">${esc(
              (confidence[k] || "").replace(/_/g, " ").toLowerCase()
            )}</td>
          </tr>`
      )
      .join("")}</tbody>
  </table>
  <p class="dim">${esc(properties.note)}</p>`;
}
