/** Every candidate the search produced, including the ones it rejected. */

import { esc, loading, notice } from "../../ui.js";
import { optimizerApi } from "../api.js";
import { RUN_GLYPH, STATE_GLYPH, objectiveCells, withRun } from "./shared.js";

export async function candidatesView(root, params) {
  await withRun(root, params, render);
}

async function render(host, runId) {
  const [run, list] = await Promise.all([
    optimizerApi.run(runId),
    optimizerApi.candidates(runId, { limit: 400 }),
  ]);
  const keys = (run.objectives || []).map((o) => o.key);
  const labels = Object.fromEntries((run.objectives || []).map((o) => [o.key, o.label]));

  host.innerHTML = `
    ${runSummary(run)}
    <section class="opt-panel lg-surface lg-d1">
      <header class="opt-panel-head">
        <h3>Candidates</h3>
        <div class="opt-filters">
          ${["all", "front", "active", "dominated", "rejected", "invalid"].map((state) =>
            `<button class="opt-filter ${state === "all" ? "active" : ""}" data-state="${state}">${state}</button>`).join("")}
        </div>
      </header>
      <div class="opt-scroll">
        <table class="opt-table" id="opt-cand-table">
          <thead><tr>
            <th>Label</th><th>State</th><th>Gen</th>
            ${keys.map((k) => `<th class="num" title="${esc(labels[k] || k)}">${esc(k.replace(/_/g, " "))}</th>`).join("")}
            <th class="num">MW</th><th class="num">cLogP</th><th class="num">SA</th>
            <th class="num">sim</th><th>Produced by</th>
          </tr></thead>
          <tbody>${list.candidates.map((c) => row(c, keys)).join("")}</tbody>
        </table>
      </div>
      <p class="opt-note">${esc(run.counts_note || "")}</p>
    </section>
    <div id="opt-cand-detail"></div>`;

  const table = host.querySelector("#opt-cand-table");
  host.querySelectorAll(".opt-filter").forEach((button) =>
    button.addEventListener("click", () => {
      host.querySelectorAll(".opt-filter").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      const wanted = button.dataset.state;
      table.querySelectorAll("tbody tr").forEach((tr) => {
        tr.hidden = wanted !== "all" && tr.dataset.state !== wanted;
      });
    }));

  const detail = host.querySelector("#opt-cand-detail");
  table.querySelectorAll("tbody tr").forEach((tr) =>
    tr.addEventListener("click", async () => {
      table.querySelectorAll("tbody tr").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      detail.innerHTML = loading("Loading candidate…");
      try {
        detail.innerHTML = renderCandidate(await optimizerApi.candidate(runId, Number(tr.dataset.id)));
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) { detail.innerHTML = notice(esc(error.message), "danger", "⚠"); }
    }));
}

function row(c, keys) {
  const d = c.descriptors || {};
  return `
    <tr data-id="${c.id}" data-state="${esc(c.state)}">
      <td class="mono small">${esc(c.label)}</td>
      <td><span class="opt-cstate opt-cstate-${esc(c.state)}">${STATE_GLYPH[c.state] || "•"} ${esc(c.state)}</span></td>
      <td class="num mono">${c.generation}</td>
      ${objectiveCells(c.objectives, keys)}
      <td class="num mono">${d.molecular_weight ?? "—"}</td>
      <td class="num mono">${d.clogp ?? "—"}</td>
      <td class="num mono">${c.synthesis?.value ?? "—"}</td>
      <td class="num mono">${c.similarity_to_seed ?? "—"}</td>
      <td class="small dim">${esc(c.transformation || "seed structure")}</td>
    </tr>`;
}

function runSummary(run) {
  const movement = run.trajectory?.movement || {};
  return `
    <section class="opt-panel lg-surface lg-d1">
      <header class="opt-panel-head">
        <div><h3>${esc(run.name)}</h3>
          <span class="dim small">${esc(run.strategy)} · seed ${esc(run.seed_name || "")}
            <span class="mono">${esc(run.seed_smiles)}</span></span></div>
        <span class="opt-state opt-state-${esc(run.status)}">${RUN_GLYPH[run.status] || "•"} ${esc(run.status)}</span>
      </header>
      ${run.error ? `<p class="opt-error">${esc(run.error)}</p>` : ""}
      ${(run.warnings || []).length ? `<div class="opt-warnings">${run.warnings.map((w) => `<div>⚠ ${esc(w)}</div>`).join("")}</div>` : ""}

      <div class="opt-stats">
        <div><b>${run.generations_completed}</b><span>generations</span></div>
        <div><b>${run.candidates_evaluated}</b><span>candidates</span></div>
        <div><b>${Object.values(run.candidate_counts || {}).reduce((a, b) => a + b, 0) - (run.candidate_counts?.rejected || 0) - (run.candidate_counts?.invalid || 0)}</b><span>valid</span></div>
        <div><b>${run.candidate_counts?.rejected || 0}</b><span>rejected</span></div>
        <div><b>${run.runtime_seconds ?? "—"}</b><span>seconds</span></div>
        <div><b>${esc(run.stop_reason || "—")}</b><span>stopped because</span></div>
      </div>

      ${Object.keys(movement).length ? `
        <h4>Where the search went</h4>
        <table class="opt-table opt-movement">
          <thead><tr><th>Objective</th><th class="num">First generation best</th><th class="num">Final best</th><th class="num">Δ</th><th>Direction</th></tr></thead>
          <tbody>${Object.entries(movement).map(([key, m]) => `
            <tr>
              <td>${esc(m.label)}</td>
              <td class="num mono">${m.first_generation_best}</td>
              <td class="num mono">${m.final_best}</td>
              <td class="num mono">${m.delta > 0 ? "+" : ""}${m.delta}</td>
              <td>${m.moved_toward_objective
                ? '<span class="opt-moved yes">→ toward the objective</span>'
                : m.unchanged
                  ? '<span class="opt-moved flat">unchanged</span>'
                  : '<span class="opt-moved no">← away</span>'}</td>
            </tr>`).join("")}</tbody>
        </table>
        <p class="opt-note">Each objective is reported separately and never summed. A search that improved solubility at the cost of penetration has not improved by any single number.</p>` : ""}

      ${(run.generations || []).length ? `
        <h4>Per generation</h4>
        <div class="opt-scroll"><table class="opt-table">
          <thead><tr><th class="num">Gen</th><th class="num">Parents</th><th class="num">Proposed</th><th class="num">Evaluated</th><th class="num">Rejected</th><th class="num">Invalid</th><th class="num">Front</th><th>Categories used</th></tr></thead>
          <tbody>${run.generations.map((g) => `
            <tr>
              <td class="num mono">${g.generation}</td><td class="num mono">${g.parents}</td>
              <td class="num mono">${g.proposed}</td><td class="num mono">${g.evaluated}</td>
              <td class="num mono">${g.rejected_by_constraints}</td><td class="num mono">${g.invalid_structures}</td>
              <td class="num mono">${g.front_size}</td>
              <td class="small dim">${(g.categories_used || []).map((c) => esc(c.replace(/_/g, " "))).join(", ")}</td>
            </tr>
            ${g.child_filter?.surrogate ? `<tr class="opt-subrow"><td></td><td colspan="7" class="small dim">
              surrogate: ${g.child_filter.surrogate.trained
                ? `trained on ${g.child_filter.surrogate.n_training} candidates · ${esc(g.child_filter.criterion || "")}${
                    g.child_filter.mean_uncertainty_selected != null
                      ? ` · uncertainty selected ${g.child_filter.mean_uncertainty_selected} vs rejected ${g.child_filter.mean_uncertainty_rejected}` : ""}`
                : esc(g.child_filter.surrogate.reason || "not trained")}</td></tr>` : ""}`).join("")}</tbody>
        </table></div>` : ""}
    </section>`;
}

function renderCandidate(c) {
  const predictions = (c.predictions?.values) || {};
  const qsar = c.predictions?.qsar || {};
  const edge = c.incoming_edge;
  return `
    <section class="opt-panel lg-surface lg-d1">
      <header class="opt-panel-head">
        <div><h3>${esc(c.label)}</h3><span class="mono small">${esc(c.smiles)}</span></div>
        <span class="opt-cstate opt-cstate-${esc(c.state)}">${STATE_GLYPH[c.state] || "•"} ${esc(c.state)}</span>
      </header>

      ${c.rejection_reason ? `<p class="opt-error">Rejected: ${esc(c.rejection_reason)}</p>` : ""}

      <h4>Provenance</h4>
      <table class="opt-props"><tbody>
        <tr><th>Produced by</th><td>${esc(c.provenance?.produced_by || "—")}
          <span class="opt-chip small">${esc(c.provenance?.category || "")}</span></td></tr>
        <tr><th>Why</th><td>${esc(c.provenance?.rationale || "—")}</td></tr>
        <tr><th>What it costs</th><td>${esc(c.provenance?.tradeoff || "—")}</td></tr>
        ${c.provenance?.detail?.smarts ? `<tr><th>Reaction SMARTS</th><td class="mono small">${esc(c.provenance.detail.smarts)}</td></tr>` : ""}
        <tr><th>Kind</th><td><span class="opt-prov opt-prov-${esc(c.provenance?.provenance_type || "derived")}">${esc(c.provenance?.provenance_type || "derived")}</span>
          ${c.generated ? '<span class="opt-prov opt-prov-generated">generated</span>' : ""}</td></tr>
      </tbody></table>
      <p class="opt-caveat">${esc(c.provenance?.statement || "")}</p>

      ${edge ? `
        <h4>What this transformation did</h4>
        <div class="opt-delta-grid">
          <div class="opt-delta improved"><h5>Improved</h5>${
            edge.improved.length ? edge.improved.map((e) => `<div>${esc(e.label)} <b>${e.before} → ${e.after}</b> <span class="mono">${e.delta > 0 ? "+" : ""}${e.delta}</span></div>`).join("") : "<div class='dim'>nothing</div>"}</div>
          <div class="opt-delta worsened"><h5>Worsened</h5>${
            edge.worsened.length ? edge.worsened.map((e) => `<div>${esc(e.label)} <b>${e.before} → ${e.after}</b> <span class="mono">${e.delta > 0 ? "+" : ""}${e.delta}</span></div>`).join("") : "<div class='dim'>nothing</div>"}</div>
        </div>` : ""}

      <h4>Predictions</h4>
      <div class="opt-scroll"><table class="opt-table">
        <thead><tr><th>Endpoint</th><th>Value</th><th>Kind</th><th>Confidence</th><th>In domain</th></tr></thead>
        <tbody>${Object.entries(predictions).map(([key, p]) => `
          <tr>
            <td class="small">${esc(key)}</td>
            <td class="mono small">${esc(String(p.value))}${p.probability != null ? ` <span class="dim">(p=${p.probability})</span>` : ""}</td>
            <td><span class="opt-prov opt-prov-${p.badge === "measured" ? "experimental" : "predicted"}">${esc(p.badge)}</span></td>
            <td class="small dim">${esc((p.confidence || "").replace(/_/g, " ").toLowerCase())}</td>
            <td class="small">${p.in_domain === true ? "yes" : p.in_domain === false ? "no" : "—"}</td>
          </tr>`).join("")}</tbody>
      </table></div>
      <p class="opt-caveat">${esc(c.predictions?.separation_note || "")}</p>
      ${qsar.status && qsar.status !== "ok" ? `<p class="opt-caveat"><strong>QSAR registry:</strong> ${esc(qsar.reason || qsar.status)}</p>` : ""}

      <h4>Docking</h4>
      ${c.docking?.status === "ok" ? `
        <table class="opt-props"><tbody>
          <tr><th>${esc(c.docking.score_name)}</th><td class="mono">${c.docking.score} ${esc(c.docking.score_units)}</td></tr>
          <tr><th>Ligand efficiency</th><td class="mono">${c.docking.ligand_efficiency ?? "—"}</td></tr>
          <tr><th>Poses</th><td class="mono">${c.docking.poses}</td></tr>
          <tr><th>Engine</th><td class="mono small">${esc(c.docking.engine)} ${esc(c.docking.engine_version || "")}</td></tr>
        </tbody></table>
        <p class="opt-caveat">${esc(c.docking.meaning?.statement || "")}</p>`
        : `<p class="opt-caveat">${esc(c.docking?.reason || c.docking?.status || "not run")}</p>`}

      <h4>Synthesis</h4>
      <table class="opt-props"><tbody>
        <tr><th>Accessibility</th><td class="mono">${c.synthesis?.value ?? "—"} <span class="dim">${esc(c.synthesis?.band || "")}</span></td></tr>
        <tr><th>Scale</th><td class="small dim">${esc(c.synthesis?.scale || "")}</td></tr>
      </tbody></table>
      <p class="opt-caveat">${esc(c.synthesis?.caveat || "")}</p>

      <h4>Constraints</h4>
      <div class="opt-scroll"><table class="opt-table">
        <thead><tr><th>Gate</th><th class="num">Value</th><th class="num">Min</th><th class="num">Max</th><th>Result</th></tr></thead>
        <tbody>${((c.constraints?.checked) || []).map((k) => `
          <tr><td class="small">${esc(k.key)}</td>
            <td class="num mono">${k.value ?? "—"}</td>
            <td class="num mono dim">${k.minimum ?? "—"}</td>
            <td class="num mono dim">${k.maximum ?? "—"}</td>
            <td>${k.passed ? '<span class="opt-pass">passed</span>' : '<span class="opt-fail">failed</span>'}</td>
          </tr>`).join("")}</tbody>
      </table></div>
    </section>`;
}
