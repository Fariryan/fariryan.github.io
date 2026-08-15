/**
 * Hypothesis Lab.
 *
 * Each hypothesis is rendered beside its critique rather than above it, and
 * the objections are not collapsed by default. A proposal shown without its
 * objections reads as a finding; shown with them, it reads as what it is —
 * something to test.
 *
 * The status control is the researcher's. The critic can flag a hypothesis as
 * weakening; only a person rejects one, and rejection requires a reason
 * because the reason is the part worth keeping.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { bindJob } from "../../jobstore.js";
import { activeCampaign, discApi } from "../api.js";

const STATUSES = [
  "proposed",
  "investigating",
  "promising",
  "weakening",
  "paused",
  "rejected",
  "archived",
];

export async function hypothesesView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = `
    ${card(
      "Generate hypotheses",
      `<div class="toolbar">
        <span id="h-run-control"></span>
        <span class="small dim">
          Proposed from this campaign's evidence, then criticised by a separate
          call that never sees its own proposal to defend.
        </span>
      </div>
      <div id="h-run-result"></div>`
    )}
    <div id="h-list">${loading()}</div>`;

  bindJob(root, `disc-hypotheses:${campaign.id}`, {
    control: "#h-run-control",
    output: "#h-run-result",
    runLabel: "Propose & criticise",
    start: () => discApi.generateHypotheses(campaign.code, { criticise: true }),
    render: (host, result) => {
      host.innerHTML = `<div class="small dim mt">${result.count} hypothesis(es) proposed.</div>`;
      load(root, campaign);
    },
  });

  await load(root, campaign);
}

async function load(root, campaign) {
  const host = root.querySelector("#h-list");
  try {
    const payload = await discApi.hypotheses(campaign.code);
    if (!payload.count) {
      host.innerHTML = empty(
        "No hypotheses yet. They are proposed from the campaign's evidence, " +
          "so retrieve literature first."
      );
      return;
    }
    host.innerHTML = payload.hypotheses.map(renderHypothesis).join("");
    wire(root, campaign);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function renderHypothesis(hypothesis) {
  const critique = hypothesis.critique || {};
  const objections = critique.objections || [];

  return `
    <div class="disc-hypothesis" data-hid="${hypothesis.id}">
      <div class="disc-hyp-head">
        <span class="disc-code">${esc(hypothesis.code)}</span>
        <span class="status-chip status-hypothesis" title="A proposal to be tested. Not a finding.">◈ Hypothesis</span>
        <span class="disc-state">${esc(hypothesis.status)}</span>
        <span class="spacer"></span>
        <select class="sm" data-status>
          ${STATUSES.map(
            (status) =>
              `<option value="${status}" ${status === hypothesis.status ? "selected" : ""}>${status}</option>`
          ).join("")}
        </select>
      </div>

      <h4>${esc(hypothesis.title)}</h4>

      <dl class="disc-hyp-body">
        <dt>Observation</dt><dd>${esc(hypothesis.biological_observation)}</dd>
        <dt>Intervention</dt><dd>${esc(hypothesis.proposed_intervention)}</dd>
        <dt>Rationale</dt><dd>${esc(hypothesis.mechanistic_rationale)}</dd>
      </dl>

      <div class="disc-evidence-split">
        <div>
          <div class="disc-evidence-head supporting">Supporting</div>
          ${
            hypothesis.supporting_evidence.length
              ? hypothesis.supporting_evidence
                  .map((id) => `<span class="disc-cite">${esc(id)}</span>`)
                  .join("")
              : `<span class="dim small">none cited</span>`
          }
        </div>
        <div>
          <div class="disc-evidence-head contradicting">Contradicting</div>
          ${
            hypothesis.contradicting_evidence.length
              ? hypothesis.contradicting_evidence
                  .map((id) => `<span class="disc-cite">${esc(id)}</span>`)
                  .join("")
              : `<span class="dim small">none cited</span>`
          }
        </div>
      </div>

      ${
        hypothesis.required_drug_properties.length
          ? `<div class="disc-props"><strong>Required drug properties:</strong>
              ${hypothesis.required_drug_properties.map((p) => `<span class="chip">${esc(p)}</span>`).join("")}
             </div>`
          : ""
      }

      ${
        hypothesis.uncertainties.length
          ? `<div class="disc-uncertain"><strong>Uncertainties</strong>
              <ul>${hypothesis.uncertainties.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>
             </div>`
          : ""
      }

      <div class="disc-critique ${critique.available ? "" : "unavailable"}">
        <div class="disc-critique-head">
          <strong>Critic</strong>
          ${
            critique.available
              ? `<span class="disc-recommendation ${esc(critique.recommendation)}">${esc(
                  critique.recommendation.replace(/_/g, " ")
                )}</span>
                 <span class="dim small">${objections.length} objection(s) · ${esc(
                   critique.provenance?.resolved_model || "model not reported"
                 )}</span>`
              : `<span class="dim small">${esc(critique.reason || "not run")}</span>`
          }
        </div>
        ${objections
          .map(
            (objection) => `
          <div class="disc-objection severity-${esc(objection.severity)}">
            <div class="row">
              <span class="disc-objection-cat">${esc(objection.category.replace(/_/g, " "))}</span>
              <span class="disc-severity">${esc(objection.severity)}</span>
            </div>
            <div>${esc(objection.objection)}</div>
            <div class="small dim">Would be resolved by: ${esc(objection.what_would_resolve_it)}</div>
          </div>`
          )
          .join("")}
        ${
          critique.available
            ? `<div class="lab-note">${esc(critique.overall_assessment)}</div>`
            : ""
        }
      </div>

      ${
        hypothesis.status_reason
          ? `<div class="disc-status-reason"><strong>Status reason:</strong> ${esc(
              hypothesis.status_reason
            )}</div>`
          : ""
      }
    </div>`;
}

function wire(root, campaign) {
  root.querySelectorAll("[data-hid]").forEach((element) => {
    const select = element.querySelector("[data-status]");
    select.addEventListener("change", async () => {
      const status = select.value;
      let reason = "";
      if (status === "rejected") {
        // Required by the backend, and rightly: a rejection without a reason
        // throws away the most reusable thing a campaign produces.
        reason = window.prompt(
          "Why is this hypothesis rejected? The reason is kept permanently."
        );
        if (!reason) {
          await load(root, campaign);
          return;
        }
      }
      try {
        await discApi.updateHypothesis(Number(element.dataset.hid), {
          status,
          reason: reason || `moved to ${status} by the researcher`,
        });
        await load(root, campaign);
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
}
