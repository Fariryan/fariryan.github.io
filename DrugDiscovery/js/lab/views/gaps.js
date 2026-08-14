/**
 * Gap Finder.
 *
 * Three panels: gaps, correlations, and generated hypotheses. Every card here
 * carries a "Why?" that opens the complete reasoning trace, and the rules that
 * produced nothing are listed with a count of zero — a silent rule and a rule
 * that found nothing look identical otherwise, and they are not the same thing.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { labApi } from "../api.js";
import { needsSubject } from "../router.js";
import { subjectStore } from "../store.js";
import {
  confidenceChip,
  provBadge,
  relationshipChip,
  whyPanel,
  wireProvenance,
  wireWhy,
} from "../ui.js";

const TABS = [
  { key: "gaps", label: "Gaps" },
  { key: "correlations", label: "Correlations" },
  { key: "hypotheses", label: "Hypotheses" },
];

export async function gapsView(root, params) {
  const subject = subjectStore.get();
  if (!subject) {
    root.innerHTML = needsSubject("the Gap Finder");
    return;
  }

  const tab = params?.get("tab") || "gaps";
  root.innerHTML = `
    <div class="tabs" id="gap-tabs">
      ${TABS.map(
        (t) =>
          `<button data-tab="${t.key}" class="${t.key === tab ? "active" : ""}">${esc(
            t.label
          )}</button>`
      ).join("")}
    </div>
    <div class="tab-panel" id="gap-panel"></div>`;

  const panel = root.querySelector("#gap-panel");
  const show = async (key) => {
    root
      .querySelectorAll("#gap-tabs button")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === key));
    panel.innerHTML = loading();
    try {
      if (key === "gaps") await renderGaps(panel, subject);
      else if (key === "correlations") await renderCorrelations(panel, subject);
      else await renderHypotheses(panel, subject);
    } catch (error) {
      panel.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  };

  root.querySelector("#gap-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (button) show(button.dataset.tab);
  });

  await show(tab);
}

/* ---------------------------------------------------------------- gaps */

async function renderGaps(panel, subject) {
  const data = await labApi.gaps(subject, { limit_per_rule: 6 });

  const byRule = {};
  for (const finding of data.findings) {
    (byRule[finding.rule] ||= []).push(finding);
  }

  panel.innerHTML = `
    ${card(
      "Rules evaluated",
      `<div class="grid grid-2" style="gap:6px">
        ${data.rules_evaluated
          .map(
            (rule) => `<div class="row-between" style="padding:5px 0;border-bottom:1px solid var(--border)">
              <div>
                <div style="font-size:12.5px;font-weight:560">${esc(rule.label)}</div>
                <div class="small dim">${esc(rule.question)}</div>
              </div>
              <span class="chip ${rule.findings ? "" : "dim"}">${rule.findings}</span>
            </div>`
          )
          .join("")}
      </div>
      <div class="lab-note">${esc(data.coverage_caveat)}</div>`
    )}
    ${
      data.findings.length
        ? Object.entries(byRule)
            .map(
              ([rule, findings]) => `
        <section class="card">
          <h3>${esc(findings[0].rule_label)} <span class="dim">(${findings.length})</span></h3>
          ${findings.map((finding, index) => findingCard(finding, `${rule}-${index}`)).join("")}
        </section>`
            )
            .join("")
        : empty("No gap rule produced a finding for this entity.")
    }`;

  wireProvenance(panel);
  wireWhy(panel);
  wireNav(panel);
}

function findingCard(finding, id) {
  return `<div class="finding">
    <div class="top">
      <span class="headline">${esc(finding.headline)}</span>
      ${confidenceChip(finding.confidence)}
      ${relationshipChip(finding.relationship_class)}
      ${provBadge(finding.provenance)}
    </div>
    <div class="statement">${esc(finding.statement)}</div>
    <div class="row">
      ${(finding.entities || [])
        .filter((entity) => entity.id)
        .map(
          (entity) =>
            `<span class="chip clickable" data-nav="#/entity/${entity.id}">${esc(
              entity.name
            )}</span>`
        )
        .join("")}
      <span class="spacer"></span>
      <button class="sm" data-why="why-${esc(id)}">Why?</button>
    </div>
    <div class="hidden" id="why-${esc(id)}">
      ${whyPanel(finding.why)}
      ${
        finding.next_evidence_needed?.length
          ? `<div class="why-panel"><h5>Next evidence needed</h5><ul>${finding.next_evidence_needed
              .map((item) => `<li>${esc(item)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
      <div class="lab-note">${esc(finding.language_note)}</div>
    </div>
  </div>`;
}

/* -------------------------------------------------------- correlations */

async function renderCorrelations(panel, subject) {
  const data = await labApi.correlations(subject, { limit: 20 });
  if (!data.findings.length) {
    panel.innerHTML = empty("No correlations were found for this entity.");
    return;
  }

  panel.innerHTML = `
    <div class="lab-note mb">${esc(data.caveat)}</div>
    ${data.findings.map((finding, index) => findingCard(finding, `corr-${index}`)).join("")}`;

  wireProvenance(panel);
  wireWhy(panel);
  wireNav(panel);
}

/* --------------------------------------------------------- hypotheses */

async function renderHypotheses(panel, subject) {
  const data = await labApi.hypotheses(subject, { limit: 10 });
  if (!data.hypotheses.length) {
    panel.innerHTML =
      empty("No hypotheses could be assembled for this entity.") +
      `<div class="lab-note">Hypotheses are assembled from computed gap and
       correlation findings. With none of those, there is nothing to assemble —
       run a literature refresh first.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="lab-note mb">${esc(data.method)}<br /><br />${esc(data.warning)}</div>
    ${data.hypotheses
      .map(
        (hypothesis, index) => `
      <section class="card">
        <div class="hyp-label">${esc(hypothesis.label)}</div>
        <h3 style="border:none;padding:0;margin:0 0 10px;font-size:15px">${esc(
          hypothesis.statement
        )}</h3>
        <div class="row mb">
          ${confidenceChip(hypothesis.confidence)}
          ${relationshipChip(hypothesis.relationship_class)}
          ${provBadge(hypothesis.provenance)}
          <span class="rule-tag">${esc(hypothesis.derived_from.basis)}</span>
        </div>

        <h5 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin:12px 0 6px">Rationale</h5>
        <ol class="rationale">
          ${hypothesis.rationale
            .map(
              (clause) =>
                `<li class="${esc(clause.kind)}">${esc(clause.text)}${
                  clause.kind === "assumption"
                    ? ' <span class="dim">(assumption)</span>'
                    : ""
                }</li>`
            )
            .join("")}
        </ol>

        <h5 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin:12px 0 6px">Supporting evidence</h5>
        ${
          hypothesis.supporting_evidence.length
            ? `<ul class="small muted" style="padding-left:17px">${hypothesis.supporting_evidence
                .map((item) => {
                  if (item.type === "publication") {
                    const links = [];
                    if (item.pmid) {
                      links.push(
                        `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(
                          item.pmid
                        )}/" target="_blank" rel="noopener">PMID ${esc(item.pmid)}</a>`
                      );
                    }
                    if (item.doi) {
                      links.push(
                        `<a href="https://doi.org/${esc(
                          item.doi
                        )}" target="_blank" rel="noopener">doi</a>`
                      );
                    }
                    return `<li>${esc(item.title)} <span class="dim">${esc(
                      item.date || ""
                    )}${item.is_preprint ? " · preprint" : ""}</span> ${links.join(" · ")}</li>`;
                  }
                  if (item.type === "database") {
                    return `<li>${esc(item.name)} <span class="dim">(database)</span></li>`;
                  }
                  return `<li>${esc(item.measure_type || "measurement")} ${esc(
                    String(item.best_reported_value ?? "")
                  )} ${esc(item.units || "")}</li>`;
                })
                .join("")}</ul>`
            : `<div class="dim small">No citable record is attached to this hypothesis.</div>`
        }

        ${listBlock("Contradictory evidence", hypothesis.contradictory_evidence, "counter")}
        ${listBlock("Missing evidence", hypothesis.missing_evidence, "missing")}
        ${listBlock("Next evidence needed", hypothesis.next_evidence_needed)}
      </section>`
      )
      .join("")}`;

  wireProvenance(panel);
}

function listBlock(title, items, className = "") {
  if (!items?.length) return "";
  return `<h5 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);margin:12px 0 6px">${esc(
    title
  )}</h5>
  <ul class="small ${esc(className)}" style="padding-left:17px;color:var(--text-muted)">
    ${items.map((item) => `<li>${esc(item)}</li>`).join("")}
  </ul>`;
}

function wireNav(root) {
  root.querySelectorAll("[data-nav]").forEach((element) => {
    element.style.cursor = "pointer";
    element.addEventListener("click", () => {
      window.location.hash = element.dataset.nav;
    });
  });
}
