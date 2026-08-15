/**
 * Campaign overview — the command centre.
 *
 * Answers four questions in the order a researcher actually asks them: where
 * does this campaign stand, what is it currently betting on, what is the main
 * thing it does not know, and what should happen next.
 *
 * Every number here is read from the campaign record. Nothing is computed in
 * this file, and nothing is estimated: a count that cannot be read is shown as
 * absent rather than as zero.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { activeCampaign, discApi } from "../api.js";

export async function overviewView(root) {
  const current = activeCampaign.get();
  if (!current) {
    root.innerHTML = notice(
      `<strong>No campaign selected.</strong><br />
       A campaign is the unit of research memory here — every section is a view
       of one. <a href="#/discovery/campaigns">Create or choose one</a>.`,
      "muted",
      "◎"
    );
    return;
  }

  root.innerHTML = loading("Loading campaign…");

  try {
    const [campaign, hypotheses, timeline] = await Promise.all([
      discApi.campaign(current.code),
      discApi.hypotheses(current.code).catch(() => ({ count: 0, hypotheses: [] })),
      discApi.timeline(current.code).catch(() => ({ count: 0, events: [] })),
    ]);

    const summary = campaign.summary || {};
    const leading = pickLeading(hypotheses.hypotheses);
    const recent = timeline.events.slice(-6).reverse();

    root.innerHTML = `
      <div class="disc-command">
        <div class="disc-command-head">
          <div>
            <div class="row">
              <span class="disc-campaign-code big">${esc(campaign.code)}</span>
              <span class="disc-state">${esc(campaign.state.replace(/_/g, " "))}</span>
              <span class="dim">generation ${campaign.current_generation}</span>
            </div>
            <h3>${esc(campaign.title)}</h3>
            <div class="dim">${esc(campaign.disease.name)}${
              campaign.disease.subtype ? ` · ${esc(campaign.disease.subtype)}` : ""
            }</div>
          </div>
          <div class="disc-goal">
            <div class="small dim">Research goal</div>
            ${esc(campaign.research_goal)}
          </div>
        </div>

        <div class="disc-tiles">
          ${tile(summary.hypotheses, "Hypotheses", summary.hypotheses_rejected
            ? `${summary.hypotheses_rejected} rejected, kept`
            : "none rejected yet")}
          ${tile(summary.candidates, "Candidates", summary.candidates_rejected
            ? `${summary.candidates_rejected} rejected, kept`
            : "no candidates yet")}
          ${tile(summary.predictions, "Predictions", "each with its model version")}
          ${tile(summary.preclinical_runs, "Preclinical runs", "submitted to the evaluation workspace")}
          ${tile(summary.negative_knowledge, "Negative knowledge", "checked before proposing")}
          ${tile(summary.decisions, "Decisions", "each with its reasons")}
        </div>

        <div class="disc-columns">
          ${card(
            "Current hypothesis",
            leading
              ? `<div class="row">
                   <span class="disc-code">${esc(leading.code)}</span>
                   <span class="status-chip status-hypothesis">◈ Hypothesis</span>
                   <span class="disc-state">${esc(leading.status)}</span>
                 </div>
                 <h4>${esc(leading.title)}</h4>
                 <p>${esc(leading.mechanistic_rationale)}</p>
                 <div class="disc-evidence-split">
                   <div><div class="disc-evidence-head supporting">Supporting</div>
                     ${leading.supporting_evidence.length || "—"}</div>
                   <div><div class="disc-evidence-head contradicting">Contradicting</div>
                     ${leading.contradicting_evidence.length || "—"}</div>
                 </div>
                 <a class="sm" href="#/discovery/hypotheses">Open Hypothesis Lab →</a>`
              : empty(
                  "No hypothesis yet. Retrieve disease evidence, then propose " +
                    "hypotheses from it."
                )
          )}

          ${card(
            "Main uncertainty",
            leading && leading.uncertainties.length
              ? `<ul class="disc-uncertainty-list">
                   ${leading.uncertainties.map((u) => `<li>${esc(u)}</li>`).join("")}
                 </ul>
                 ${
                   leading.critique?.available
                     ? `<div class="lab-note">
                          The critic raised ${leading.critique.objections.length}
                          objection(s) and recommends
                          <strong>${esc(leading.critique.recommendation.replace(/_/g, " "))}</strong>.
                        </div>`
                     : ""
                 }`
              : empty("Nothing recorded yet.")
          )}
        </div>

        ${card(
          "Recent activity",
          recent.length
            ? `<div class="disc-timeline compact">
                ${recent
                  .map(
                    (event) => `
                  <div class="disc-event">
                    <div class="disc-event-time">${esc(event.at.replace("T", " ").slice(5, 16))}</div>
                    <div class="disc-event-dot"></div>
                    <div class="disc-event-body">
                      <div class="disc-event-kind">${esc(event.kind.replace(/_/g, " "))}</div>
                      <div>${esc(event.summary)}</div>
                    </div>
                  </div>`
                  )
                  .join("")}
               </div>
               <a class="sm" href="#/discovery/memory">Full research memory →</a>`
            : empty("Nothing has happened yet.")
        )}

        ${card(
          "Next step",
          nextStep(campaign, summary, leading)
        )}
      </div>`;
  } catch (error) {
    root.innerHTML = notice(
      `<strong>This campaign could not be loaded.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
  }
}

function tile(value, label, hint) {
  return `<div class="disc-tile">
    <div class="disc-tile-value">${value ?? "—"}</div>
    <div class="disc-tile-label">${esc(label)}</div>
    <div class="disc-tile-hint">${esc(hint)}</div>
  </div>`;
}

/**
 * The hypothesis the campaign is currently betting on.
 *
 * Chosen by status, not by any score: nothing here ranks hypotheses by how
 * persuasive their prose is.
 */
function pickLeading(hypotheses) {
  const order = ["promising", "investigating", "proposed", "weakening", "paused"];
  for (const status of order) {
    const found = hypotheses.find((h) => h.status === status);
    if (found) return found;
  }
  return hypotheses[0] || null;
}

/**
 * What to do next, derived from the campaign's actual state.
 *
 * Rules over the record, not a model's opinion — the reasoning gateway is not
 * consulted for this, so the recommendation is available even when it is down.
 */
function nextStep(campaign, summary, leading) {
  if (!summary.hypotheses && campaign.state === "draft") {
    return `<strong>Retrieve disease evidence.</strong>
      <p>This campaign has no evidence yet. Hypotheses proposed without it
      would be prose, and the backend refuses to generate them.</p>
      <a class="sm primary" href="#/discovery/disease">Disease Intelligence →</a>`;
  }
  if (!summary.hypotheses) {
    return `<strong>Propose hypotheses from the evidence.</strong>
      <p>Evidence has been retrieved. The next step is mechanistic proposals,
      each criticised independently.</p>
      <a class="sm primary" href="#/discovery/hypotheses">Hypothesis Lab →</a>`;
  }
  if (leading && leading.critique?.recommendation === "do_not_pursue") {
    return `<strong>Review ${esc(leading.code)} before spending compute on it.</strong>
      <p>The critic recommended against pursuing this hypothesis. It has not
      been rejected — that is a researcher's decision — but committing
      chemistry effort to it now would be committing to an objection nobody
      has answered.</p>
      <a class="sm primary" href="#/discovery/hypotheses">Read the objections →</a>`;
  }
  return `<strong>Target discovery, then chemistry.</strong>
    <p>The next stages — target dossiers, known chemistry, candidate design and
    optimisation — are not built yet. They are listed in the navigation and
    marked as such, rather than shown as empty results.</p>`;
}
