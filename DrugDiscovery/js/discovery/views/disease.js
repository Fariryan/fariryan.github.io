/**
 * Disease Intelligence.
 *
 * Two things are shown that a results list normally hides. The coverage table
 * states how many records the provider matched against how many were actually
 * read — "4 of 673" and "4 of 4" are different claims about completeness. And
 * every claim is marked as a language model's reading of a named record, with
 * the record one click away, so the interpretation and the evidence never
 * merge into one thing.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { jobStore, runControl, bindJob } from "../../jobstore.js";
import { activeCampaign, discApi } from "../api.js";

const WINDOWS = [
  ["latest", "Latest"],
  ["month", "Last month"],
  ["three_months", "Last 3 months"],
  ["six_months", "Last 6 months"],
  ["year", "Last year"],
  ["all", "All evidence"],
];

export async function diseaseView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice(
      "Select a campaign first — evidence belongs to a campaign.",
      "muted",
      "◎"
    );
    return;
  }

  root.innerHTML = `
    ${card(
      "Retrieve literature",
      `<div class="toolbar">
        <label class="row small">Window
          <select id="d-window">
            ${WINDOWS.map(
              ([key, label]) =>
                `<option value="${key}" ${key === "all" ? "selected" : ""}>${label}</option>`
            ).join("")}
          </select>
        </label>
        <label class="row small">Records per facet
          <input class="search-input" id="d-per" type="number" value="8" min="1" max="50" style="width:70px" />
        </label>
        <span id="d-run-control"></span>
      </div>
      <div class="lab-note">
        Records come from Europe PMC with their real identifiers and publication
        dates. Claims are then extracted by the reasoning model and marked
        <strong>llm_synthesis</strong> — the paper stays the evidence.
      </div>
      <div id="d-run-result"></div>`
    )}
    <div id="d-evidence">${loading("Loading evidence…")}</div>`;

  bindJob(root, `disc-research:${campaign.id}`, {
    control: "#d-run-control",
    output: "#d-run-result",
    runLabel: "Research disease",
    start: () =>
      discApi.research(campaign.code, {
        window: root.querySelector("#d-window").value,
        per_facet: Number(root.querySelector("#d-per").value),
        force: true,
      }),
    render: (host, result) => {
      host.innerHTML = renderCoverage(result);
      loadEvidence(root, campaign);
    },
  });

  await loadEvidence(root, campaign);
}

function renderCoverage(result) {
  const extraction = result.extraction || {};
  return `
    <div class="disc-coverage mt">
      <div class="row">
        <strong>${result.records_retrieved} records</strong>
        <span class="dim">→</span>
        <strong>${result.claims_extracted} claims</strong>
        <span class="spacer"></span>
        <span class="small dim">${esc(result.window)} window</span>
      </div>
      <table class="disc-table mt">
        <tr><th>Facet</th><th class="num">Provider matched</th><th class="num">Read</th><th></th></tr>
        ${(result.coverage || [])
          .map(
            (facet) => `<tr>
              <td>${esc(facet.facet)}</td>
              <td class="num">${facet.provider_hit_count ?? "—"}</td>
              <td class="num">${facet.retrieved}</td>
              <td class="small dim">${
                facet.broadened_from_subtype
                  ? "broadened past the subtype — not subtype-specific"
                  : facet.error
                    ? esc(facet.error)
                    : ""
              }</td>
            </tr>`
          )
          .join("")}
      </table>
      <div class="lab-note">
        The middle column is what Europe PMC said it holds; the right column is
        what was actually read. A campaign built on a small fraction of the
        matching literature is a different thing from one built on all of it.
        ${extraction.batches_failed
          ? `<br /><strong>${extraction.batches_failed}</strong> extraction batch(es) failed and were skipped.`
          : ""}
        ${extraction.citations_dropped
          ? `<br /><strong>${extraction.citations_dropped}</strong> citation(s) to records that were never supplied were dropped.`
          : ""}
      </div>
    </div>`;
}

async function loadEvidence(root, campaign) {
  const host = root.querySelector("#d-evidence");
  try {
    const payload = await discApi.evidence(campaign.code, { limit: 400 });
    if (!payload.count) {
      host.innerHTML = empty(
        "No evidence yet. Run the retrieval above — hypotheses generated " +
          "without evidence are just prose, and the backend refuses them."
      );
      return;
    }

    const byFacet = new Map();
    for (const claim of payload.claims) {
      const facet = claim.facet || "other";
      if (!byFacet.has(facet)) byFacet.set(facet, []);
      byFacet.get(facet).push(claim);
    }

    host.innerHTML = card(
      `Structured claims (${payload.count})`,
      `${[...byFacet.entries()]
        .map(
          ([facet, claims]) => `
          <div class="disc-facet">
            <div class="disc-facet-head">${esc(facet)} <span class="dim">${claims.length}</span></div>
            ${claims.map(renderClaim).join("")}
          </div>`
        )
        .join("")}
      <div class="lab-note">${esc(payload.note)}</div>`
    );
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function renderClaim(claim) {
  const context = [claim.species, claim.model_system, claim.evidence_type]
    .filter(Boolean)
    .join(" · ");
  return `
    <div class="disc-claim">
      <div class="disc-claim-text">
        <strong>${esc(claim.subject)}</strong>
        <span class="disc-rel">${esc(claim.relationship)}</span>
        ${esc(claim.object)}
      </div>
      <div class="disc-claim-meta">
        <span class="status-chip status-llm_synthesis" title="A language model's reading of the cited record. The record is the evidence.">✦ AI synthesis</span>
        ${context ? `<span class="dim">${esc(context)}</span>` : ""}
        ${claim.source.url
          ? `<a href="${esc(claim.source.url)}" target="_blank" rel="noopener">${esc(claim.source.id)}</a>`
          : `<span>${esc(claim.source.id)}</span>`}
        ${claim.source.published ? `<span class="dim">${esc(claim.source.published)}</span>` : ""}
        ${claim.source.is_preprint ? `<span class="disc-preprint">preprint</span>` : ""}
        ${claim.extraction.model ? `<span class="dim small">read by ${esc(claim.extraction.model)}</span>` : ""}
      </div>
      ${claim.quote ? `<div class="disc-quote">“${esc(claim.quote)}”</div>` : ""}
    </div>`;
}
