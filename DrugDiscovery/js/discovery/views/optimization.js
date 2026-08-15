/**
 * Optimization.
 *
 * The Pareto front, shown as what it is: a set of trade-offs, not a ranked
 * list. There is no single score anywhere on this page, and the "best" row
 * names a different candidate for each objective — which is usually the real
 * answer, and the one a weighted score would hide.
 *
 * The selection panel below shows why each candidate was chosen for expensive
 * evaluation, decomposed into predicted quality, model uncertainty and
 * diversity. A candidate picked on uncertainty alone looks like a mistake
 * without that decomposition.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { bindJob } from "../../jobstore.js";
import { labApi } from "../../lab/api.js";
import { activeCampaign, discApi } from "../api.js";

export async function optimizationView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = `
    ${card(
      "Rank and select",
      `<div class="toolbar">
        <span id="o-run-control"></span>
        <label class="row small">Evaluation budget
          <input class="search-input" id="o-budget" type="number" value="5"
                 min="1" max="60" style="width:70px" />
        </label>
        <span class="small dim">
          Ranking is Pareto; selection mixes quality, uncertainty and diversity.
        </span>
      </div>
      <div id="o-run-result"></div>`
    )}
    <div id="o-body">${loading()}</div>`;

  bindJob(root, `disc-screen:${campaign.id}`, {
    control: "#o-run-control",
    output: "#o-run-result",
    runLabel: "Screen &amp; select",
    start: () =>
      discApi.screen(campaign.code, {
        budget: Number(root.querySelector("#o-budget").value),
      }),
    render: (host, result) => {
      host.innerHTML = renderSelection(result.selection, result.research_questions);
      load(root, campaign);
    },
  });

  await load(root, campaign);
}

async function load(root, campaign) {
  const host = root.querySelector("#o-body");
  try {
    const pareto = await discApi.pareto(campaign.code);
    if (!pareto.candidates?.length) {
      host.innerHTML = empty("Nothing to rank yet.");
      return;
    }

    const objectives = pareto.objectives || [];
    const front = pareto.candidates.filter((c) => c.front === 1);

    host.innerHTML = `
      ${card(
        `Pareto front — ${pareto.front_one_size} of ${pareto.ranked} ranked`,
        `<div class="disc-best">
          ${Object.entries(pareto.best_at_each_objective || {})
            .map(
              ([key, best]) => `<div class="disc-best-cell">
                <div class="disc-tile-label">Best ${esc(best.label || key)}</div>
                <div class="disc-code">${esc(best.candidate_code)}</div>
                <div class="disc-tile-value small">${best.value}</div>
                <div class="disc-tile-hint">${esc(best.direction)}</div>
              </div>`
            )
            .join("")}
        </div>
        <div class="lab-note">${esc(pareto.note || "")}</div>

        <div style="overflow-x:auto" class="mt">
          <table class="disc-table">
            <tr>
              <th>Candidate</th><th>Front</th>
              ${objectives.map((o) => `<th class="num">${esc(o.label || o.key)}</th>`).join("")}
              <th>Missing</th><th>Status</th>
            </tr>
            ${pareto.candidates
              .slice()
              .sort((a, b) => (a.front ?? 99) - (b.front ?? 99))
              .slice(0, 60)
              .map(
                (candidate) => `<tr class="${candidate.front === 1 ? "front-one" : ""}">
                  <td class="mono small">${esc(candidate.code)}</td>
                  <td class="num">${candidate.front ?? "—"}</td>
                  ${objectives
                    .map(
                      (o) => `<td class="num">${
                        candidate.objective_values?.[o.key] ?? "—"
                      }</td>`
                    )
                    .join("")}
                  <td class="dim small">${esc(
                    (candidate.objectives_missing || []).join(", ")
                  )}</td>
                  <td class="dim small">${esc(candidate.status)}</td>
                </tr>`
              )
              .join("")}
          </table>
        </div>`
      )}

      ${card(
        "Front 1, side by side",
        front.length
          ? `<div class="disc-smallmultiples">
              ${front
                .slice(0, 8)
                .map(
                  (candidate) => `<div class="disc-sm">
                    <div class="disc-code">${esc(candidate.code)}</div>
                    <img src="${esc(labApi.depictionUrl(candidate.smiles, 150, 110))}"
                         alt="${esc(candidate.code)}" loading="lazy" />
                    ${objectives
                      .map(
                        (o) => `<div class="small">
                          <span class="dim">${esc(o.key)}</span>
                          ${candidate.objective_values?.[o.key] ?? "—"}
                        </div>`
                      )
                      .join("")}
                  </div>`
                )
                .join("")}
             </div>`
          : empty("No candidate is on front 1 yet.")
      )}`;
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function renderSelection(selection, questions) {
  if (!selection?.selected?.length) {
    return `<div class="small dim mt">${esc(selection?.reason || "Nothing selected.")}</div>`;
  }

  return `
    <div class="mt">
      <strong>${selection.selected.length} selected of ${selection.considered}</strong>
      <table class="disc-table mt">
        <tr>
          <th>Candidate</th><th class="num">Front</th><th class="num">Score</th>
          <th class="num">Quality</th><th class="num">Uncertainty</th><th class="num">Diversity</th>
        </tr>
        ${selection.selected
          .map(
            (item) => `<tr>
              <td class="mono small">${esc(item.code)}${item.pinned ? " (pinned)" : ""}</td>
              <td class="num">${item.front ?? "—"}</td>
              <td class="num">${item.selection_score ?? "—"}</td>
              <td class="num">${item.terms?.predicted_quality ?? "—"}</td>
              <td class="num">${item.terms?.uncertainty ?? "—"}</td>
              <td class="num">${item.terms?.diversity ?? "—"}</td>
            </tr>`
          )
          .join("")}
      </table>
      <div class="lab-note">
        Weights: ${esc(JSON.stringify(selection.weights))}. ${esc(selection.note || "")}
      </div>

      ${questions?.length
        ? `<div class="mt"><strong>What would reduce uncertainty most</strong>
            <ul class="small">
              ${questions
                .map(
                  (q) => `<li>[${q.value_score}] ${esc(q.question)}
                    <div class="dim">${esc(q.uncertainty_addressed)}</div>
                    ${q.blocked_by ? `<div class="muted">Blocked: ${esc(q.blocked_by)}</div>` : ""}
                  </li>`
                )
                .join("")}
            </ul>
            <div class="lab-note">
              Computed from the campaign's own state, not asked of a model — so
              it is available even when the reasoning service is down.
            </div>
           </div>`
        : ""}
    </div>`;
}
