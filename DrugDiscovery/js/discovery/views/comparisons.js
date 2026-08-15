/**
 * Comparisons — and the bridge to the preclinical workspace.
 *
 * Two things on one page because they are the same question: what happened to
 * the candidates we spent real computation on. Every run links back to the
 * workspace that did the work rather than re-rendering its output here, so
 * there is exactly one implementation of a docking result in the platform.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { labApi } from "../../lab/api.js";
import { activeCampaign, discApi } from "../api.js";

export async function comparisonsView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = loading("Collecting evaluation results…");

  try {
    // Collecting is the act of reading finished jobs back into the campaign,
    // so opening this page is what pulls results home.
    const [runs, candidates, findings, negative] = await Promise.all([
      discApi.preclinicalRuns(campaign.code),
      discApi.candidates(campaign.code, { limit: 400 }),
      discApi.findings(campaign.code).catch(() => null),
      discApi.negativeKnowledge(campaign.code).catch(() => ({ count: 0, entries: [] })),
    ]);

    const byId = new Map(candidates.candidates.map((c) => [c.id, c]));
    const evaluated = candidates.candidates.filter(
      (c) => (c.predictions || {}).docking_score
    );

    root.innerHTML = `
      ${card(
        "Preclinical evaluations",
        runs.runs.length
          ? `<div class="small dim mb">
              Checked ${runs.collection.checked}, collected ${runs.collection.collected},
              ${runs.collection.still_running} still running,
              ${runs.collection.failed} failed.
             </div>
             <table class="disc-table">
               <tr><th>Candidate</th><th>Analysis</th><th>Status</th><th>Job</th><th></th></tr>
               ${runs.runs
                 .map(
                   (run) => `<tr>
                     <td class="mono small">${esc(
                       byId.get(run.candidate_id)?.code || run.candidate_id
                     )}</td>
                     <td>${esc(run.analysis)}</td>
                     <td>${
                       run.status === "completed"
                         ? `<span class="dim">completed</span>`
                         : run.status === "running"
                           ? `<span class="chip">running</span>`
                           : `<span class="danger" title="${esc(run.error || "")}">${esc(
                               run.status
                             )}</span>`
                     }</td>
                     <td class="dim small">${run.job_id ?? "—"}</td>
                     <td><a class="sm" href="${esc(run.open_in_preclinical)}">
                       Open full analysis →</a></td>
                   </tr>`
                 )
                 .join("")}
             </table>
             <div class="lab-note">
               These ran in the In Silico / In Vitro / In Vivo Mouse workspace.
               This page links to it rather than redrawing its results, so
               there is one implementation of a docking result in the platform.
             </div>`
          : empty(
              "Nothing has been sent for evaluation yet. Send a candidate from " +
                "Candidate Design."
            )
      )}

      ${card(
        "Candidates with structural evidence",
        evaluated.length
          ? `<div class="disc-smallmultiples">
              ${evaluated
                .map((candidate) => {
                  const docking = candidate.predictions.docking_score;
                  return `<div class="disc-sm">
                    <div class="disc-code">${esc(candidate.code)}</div>
                    <img src="${esc(labApi.depictionUrl(candidate.smiles, 150, 110))}"
                         alt="${esc(candidate.code)}" loading="lazy" />
                    <div class="small">
                      <strong>${docking.value}</strong> ${esc(docking.units || "")}
                      <span class="status-chip status-${esc(docking.status)}">${esc(
                        docking.status
                      )}</span>
                    </div>
                    <div class="dim small">${esc(docking.model_name)}
                      ${esc(docking.model_version)}</div>
                    ${docking.is_surrogate
                      ? `<div class="danger small">surrogate estimate, not a docking run</div>`
                      : ""}
                  </div>`;
                })
                .join("")}
             </div>
             <div class="lab-note">
               A docking score is a scoring-function value for a pose — not a
               binding affinity, and not an activity. Surrogate estimates are
               labelled and never sorted into the same column as real runs.
             </div>`
          : empty("No candidate has structural evidence yet.")
      )}

      ${findings
        ? card(
            `What generation ${findings.generation} taught`,
            findings.findings?.length
              ? `<ul class="small">
                  ${findings.findings
                    .map((f) => `<li>${esc(f.statement)}</li>`)
                    .join("")}
                 </ul>
                 <div class="lab-note">${esc(findings.note || "")}</div>`
              : empty(esc(findings.reason || "Nothing computable yet."))
          )
        : ""}

      ${card(
        `Negative knowledge (${negative.count})`,
        negative.count
          ? `<ul class="small">
              ${negative.entries
                .map(
                  (entry) => `<li>
                    <strong>${esc(entry.label)}</strong>
                    <span class="dim">seen ${entry.observations}×, generation
                      ${entry.generation_learned}</span>
                    <div class="dim">${esc(entry.reason)}</div>
                  </li>`
                )
                .join("")}
             </ul>
             <div class="lab-note">${esc(negative.note || "")}</div>`
          : empty("Nothing ruled out yet.")
      )}`;
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}
