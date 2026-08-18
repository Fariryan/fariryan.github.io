/**
 * Hypotheses: nine axes, shown as nine axes.
 *
 * There is no total on this page and no ranked list, because the engine
 * computes neither. A hypothesis strong on eight axes and untestable on the
 * ninth is not "89% good" — it is untestable, and an average would say the
 * opposite. The weakest axis is called out instead, since that is the score
 * that changes what to do next.
 *
 * The Critic's objection sits beside each hypothesis rather than folded into
 * it. A proposition and the case against it are two things.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { ddApi } from "../api.js";
import { currentCampaign, needsCampaign } from "../router.js";

export async function hypothesesView(host) {
  const key = currentCampaign.get();
  if (!key) {
    host.innerHTML = needsCampaign();
    return;
  }

  host.innerHTML = loading("Loading hypotheses…");
  let campaign;
  let axes;
  try {
    [campaign, axes] = await Promise.all([
      ddApi.getCampaign(key),
      ddApi.hypothesisAxes(),
    ]);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!campaign.hypotheses.length) {
    host.innerHTML = empty(
      "No hypothesis has been proposed yet. The hypothesis stage runs third in the loop."
    );
    return;
  }

  host.innerHTML = `
    <p class="dim">${esc(axes.note)}</p>
    <div class="dd-hypotheses">
      ${campaign.hypotheses.map((h) => renderHypothesis(h, key)).join("")}
    </div>
  `;

  wireFalsify(host, key);
}

function statusTone(status) {
  return (
    {
      falsified: "danger",
      weakened: "warn",
      supported: "ok",
      approved: "ok",
      rejected: "danger",
    }[status] || ""
  );
}

function renderHypothesis(h, campaignKey) {
  const scores = h.scores || {};
  const weakest = scores.weakest;

  return card(
    `${h.hypothesis_key} <span class="dd-pill ${statusTone(h.status)}">${esc(
      h.status
    )}</span>`,
    `
    <p class="dd-statement">${esc(h.statement)}</p>

    <div class="dd-falsifiable">
      <strong>Falsified by:</strong> ${esc(h.falsifiable_by)}
      <div class="dim">A hypothesis with no such condition is not stored —
        the engine refuses it.</div>
    </div>

    ${
      scores.axes?.length
        ? `<div class="dd-axes">
             ${scores.axes.map(renderAxis).join("")}
           </div>
           ${
             weakest
               ? `<p class="dd-weakest"><strong>Weakest axis:</strong>
                  ${esc(weakest.key.replace(/_/g, " "))} at
                  ${esc(String(weakest.score))} — ${esc(weakest.why_it_matters)}</p>`
               : ""
           }
           <p class="dim">${esc(scores.note || "")}</p>`
        : `<p class="dim">${esc(scores.note || "Not scored.")}</p>`
    }

    ${renderCritique(h.critique)}

    <div class="dd-provenance dim">
      Proposed by <span class="mono">${esc(h.proposed_by || "unknown")}</span>
      ${
        h.llm_provenance?.resolved_model
          ? ` using <span class="mono">${esc(h.llm_provenance.resolved_model)}</span>`
          : ""
      }. The nine scores are that model's judgement of the evidence, not
      measurements.
    </div>

    ${
      h.status === "falsified"
        ? ""
        : `<form class="dd-falsify" data-hypothesis="${h.id}">
             <label>Record that evidence overturned this
               <input name="reason" type="text" required
                 placeholder="What falsified it?" />
             </label>
             <label>Your name
               <input name="decided_by" type="text" required />
             </label>
             <button type="submit">Falsify</button>
           </form>`
    }
  `,
    "dd-hypothesis"
  );
}

function renderAxis(axis) {
  const score = axis.score;
  const known = score != null;
  // The bar shows the score as given. For the two inverted axes the fill is
  // tinted as a warning rather than reversed, so a long bar never silently
  // means two opposite things.
  return `
    <div class="dd-axis ${axis.higher_is_better ? "" : "inverted"}"
         title="${esc(axis.description)}">
      <div class="dd-axis-label">
        ${esc(axis.label)}
        ${axis.higher_is_better ? "" : '<span class="dim">(high is bad)</span>'}
      </div>
      <div class="dd-axis-bar">
        ${
          known
            ? `<span style="width:${Math.round(score * 100)}%"></span>`
            : '<span class="unknown"></span>'
        }
      </div>
      <div class="dd-axis-score mono">${known ? score.toFixed(2) : "not scored"}</div>
    </div>`;
}

function renderCritique(critique) {
  if (!critique || !Object.keys(critique).length) {
    return `<p class="dim">The Critic has not examined this hypothesis yet.</p>`;
  }
  return `
    <div class="dd-critique">
      <strong>The Critic's case against it</strong>
      ${
        critique.severity
          ? `<span class="dd-pill ${
              critique.severity === "high" ? "danger" : "warn"
            }">${esc(critique.severity)}</span>`
          : ""
      }
      ${critique.objection ? `<p>${esc(critique.objection)}</p>` : ""}
      ${
        critique.falsification_test
          ? `<p><strong>Proposed test:</strong> ${esc(
              critique.falsification_test
            )}</p>`
          : ""
      }
      ${
        critique.what_would_refute_it
          ? `<p><strong>What would refute it:</strong> ${esc(
              critique.what_would_refute_it
            )}</p>`
          : ""
      }
      ${
        critique.falsified_reason
          ? `<p><strong>Falsified:</strong> ${esc(
              critique.falsified_reason
            )} — recorded by ${esc(critique.falsified_by || "unknown")}</p>`
          : ""
      }
    </div>`;
}

function wireFalsify(host, key) {
  host.querySelectorAll(".dd-falsify").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        await ddApi.falsify(key, Number(form.dataset.hypothesis), {
          reason: data.get("reason"),
          decided_by: data.get("decided_by"),
        });
        hypothesesView(host);
      } catch (error) {
        form.insertAdjacentHTML(
          "afterend",
          notice(esc(error.message), "danger", "⚠")
        );
      }
    });
  });
}
