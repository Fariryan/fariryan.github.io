/** The modality architecture, and the graph's modality distribution. */

import { esc, loading, notice } from "../../ui.js";
import { modalityApi } from "../api.js";
import { MODALITY_COLOR, barChart, provBadge } from "./shared.js";

export async function overviewView(root) {
  let status;
  let survey;
  try {
    [status, survey] = await Promise.all([
      modalityApi.status(), modalityApi.survey(),
    ]);
  } catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  root.innerHTML = `
    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${status.modalities.length} modalities</h3>
          <span class="dim small">RDKit ${esc(status.engines.rdkit)} · Biopython ${esc(status.engines.biopython)}</span></div>
      </header>
      <p class="md9-note">${esc(status.engines.note)}</p>
      <div class="md9-cards">
        ${status.modalities.map((m) => `
          <div class="md9-card" style="--kind:${MODALITY_COLOR[m.key] || "var(--border-strong)"}">
            <div class="md9-card-head">
              <strong>${esc(m.label)}</strong>
              <span class="md9-rep">${esc(m.representation.replace(/_/g, " "))}</span>
            </div>
            <p class="md9-card-body">${esc(m.description)}</p>
            <div class="md9-card-meta">
              <div><span>identified by</span> ${m.identity_fields.map(esc).join(", ")}</div>
              ${m.engines.length ? `<div><span>engines</span> ${m.engines.map(esc).join(", ")}</div>` : ""}
              ${m.components.length ? `<div><span>composed of</span> ${m.components.map(esc).join(", ")}</div>` : ""}
              ${m.evidence_kinds.length ? `<div><span>evidence looks like</span> ${m.evidence_kinds.map(esc).join(", ")}</div>` : ""}
            </div>
          </div>`).join("")}
      </div>
    </section>

    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${status.refusals.length} properties refused</h3></div>
      </header>
      <p class="md9-note">${esc(status.refusals_note)}</p>
      <div class="md9-scroll">
        <table class="md9-table">
          <thead><tr><th>Modality</th><th>Property</th><th>Status</th><th>Why</th></tr></thead>
          <tbody>${status.refusals.map((r) => `
            <tr>
              <td><span class="md9-dot" style="background:${MODALITY_COLOR[r.modality] || "var(--text-dim)"}"></span>${esc(r.modality_label)}</td>
              <td class="mono small">${esc(r.property.replace(/_/g, " "))}</td>
              <td><span class="md9-status md9-status-${esc(r.status)}">${esc(r.status)}</span></td>
              <td class="small dim">${esc(r.reason)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </section>

    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>Modalities in the knowledge graph</h3>
          <span class="dim small">${survey.examined} drug and compound entities examined</span></div>
      </header>
      ${barChart(
        Object.entries(survey.by_modality).map(([k, v]) => ({ modality: k, count: v })),
        { valueKey: "count", labelKey: "modality" })}
      <div class="md9-grid">
        <div>
          <h4>How each was classified</h4>
          <table class="md9-props"><tbody>
            <tr><th>from the source record ${provBadge("database")}</th><td class="mono">${survey.by_basis.source || 0}</td></tr>
            <tr><th>from the name stem ${provBadge("inferred")}</th><td class="mono">${survey.by_basis.name || 0}</td></tr>
            <tr><th>from the structure ${provBadge("inferred")}</th><td class="mono">${survey.by_basis.structure || 0}</td></tr>
            <tr><th>not classifiable</th><td class="mono">${survey.unclassified}</td></tr>
          </tbody></table>
        </div>
        <div>
          <h4>Real modalities this phase does not model</h4>
          ${Object.keys(survey.unmodelled_modalities).length
            ? `<table class="md9-props"><tbody>${Object.entries(survey.unmodelled_modalities).map(
                ([k, v]) => `<tr><th>${esc(k.replace(/_/g, " "))}</th><td class="mono">${v}</td></tr>`).join("")}</tbody></table>`
            : `<p class="dim small">none present</p>`}
          <p class="md9-caveat">${esc(survey.unmodelled_note)}</p>
        </div>
      </div>
      <p class="md9-caveat">${esc(survey.note)}</p>
      <div class="md9-actions">
        ${Object.keys(survey.by_modality).map((k) =>
          `<button class="md9-pill" data-modality="${esc(k)}">Browse ${esc(k.replace(/_/g, " "))}</button>`).join("")}
      </div>
      <div id="md9-browse"></div>
    </section>`;

  const browse = root.querySelector("#md9-browse");
  root.querySelectorAll(".md9-pill").forEach((button) =>
    button.addEventListener("click", async () => {
      root.querySelectorAll(".md9-pill").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      browse.innerHTML = loading("Loading…");
      try {
        const data = await modalityApi.browse(button.dataset.modality, 40);
        browse.innerHTML = `
          <h4>${esc(data.definition.label)} — ${data.count} entities</h4>
          <div class="md9-scroll"><table class="md9-table">
            <thead><tr><th>Name</th><th>Kind</th><th>Max phase</th><th>Classified</th><th>Rule</th></tr></thead>
            <tbody>${data.entities.map((e) => `
              <tr>
                <td>${esc(e.name)}</td>
                <td class="small dim">${esc(e.kind)}</td>
                <td class="mono small">${esc(String(e.max_phase ?? "—"))}</td>
                <td>${provBadge(e.classification.provenance_type)}</td>
                <td class="small dim">${esc(e.classification.rule)}</td>
              </tr>`).join("")}</tbody>
          </table></div>`;
      } catch (error) { browse.innerHTML = notice(esc(error.message), "danger", "⚠"); }
    }));
}
