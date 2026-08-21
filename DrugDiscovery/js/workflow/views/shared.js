/** Shared pieces of the workflow views. */
import { esc, loading, notice } from "../../ui.js";
import { workflowApi } from "../api.js";

export const STEP_GLYPH = {
  pending: "○", queued: "◔", running: "◐", complete: "●",
  failed: "⚠", cancelled: "◌", blocked: "⊘",
};

export const RUN_GLYPH = {
  queued: "○", running: "◐", complete: "●",
  partial: "◑", failed: "⚠", cancelled: "◌",
};

export const KIND_COLOR = {
  disease: "var(--ev-established)",
  target_set: "var(--ev-strong)",
  structure: "var(--accent)",
  ligand_set: "var(--ev-clinical)",
  compound_library: "var(--ev-preliminary)",
  scientific_result: "var(--ev-preclinical)",
  ranking: "var(--warning)",
  report: "var(--ev-hypothesis)",
  plan: "var(--text-dim)",
};

/** A run picker shared by the runs and graph views. */
export async function withRun(root, params, render) {
  let list;
  try { list = await workflowApi.runs(30); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  if (!list.runs.length) {
    root.innerHTML = notice(
      "No workflow has been run yet. Start one from <a href=\"#/workflow/design\">New Run</a>.",
      "info", "◌");
    return;
  }

  const requested = params?.get("run") ? Number(params.get("run")) : null;
  const current = list.runs.find((r) => r.id === requested) || list.runs[0];

  root.innerHTML = `
    <div class="wf-runbar lg-surface lg-d1">
      <label for="wf-runsel">Run</label>
      <select id="wf-runsel">${list.runs.map((r) =>
        `<option value="${r.id}" ${r.id === current.id ? "selected" : ""}>
          #${r.id} · ${esc(r.workflow.name)} · ${esc(r.status)}
          ${r.resumed_from_run_id ? `(resumed from #${r.resumed_from_run_id})` : ""}</option>`).join("")}</select>
    </div>
    <div id="wf-runbody">${loading("Loading…")}</div>`;

  const body = root.querySelector("#wf-runbody");
  const select = root.querySelector("#wf-runsel");

  async function show(id) {
    body.innerHTML = loading("Loading…");
    try { await render(body, id); }
    catch (error) { body.innerHTML = notice(esc(error.message), "danger", "⚠"); }
  }
  select.addEventListener("change", () => show(Number(select.value)));
  await show(current.id);
}

/** The panel that opens when a step is selected. */
export function renderStep(step) {
  const provenance = step.provenance || {};
  const cache = provenance.cache || {};
  return `
    <section class="wf-panel lg-surface lg-d1">
      <header class="wf-panel-head">
        <div><h3>${esc(step.label)}</h3>
          <span class="mono small dim">${esc(step.executor)} · ${esc(step.executor_version || "")}</span></div>
        <span class="wf-state wf-state-${esc(step.status)}">${STEP_GLYPH[step.status] || "•"} ${esc(step.status)}</span>
      </header>

      <h4>Why it ran</h4>
      <p class="wf-reason">${esc(step.reason || step.purpose || "—")}</p>

      ${step.error ? `<h4>Failure</h4><p class="wf-error">${esc(step.error)}</p>` : ""}
      ${step.blocked_reason ? `<h4>Why it was not attempted</h4><p class="wf-caveat">${esc(step.blocked_reason)}</p>` : ""}

      <h4>Execution</h4>
      <table class="wf-props"><tbody>
        <tr><th>Executor</th><td class="mono small">${esc(step.executor)}
          <span class="wf-chip">${esc(step.executor_kind)}</span></td></tr>
        <tr><th>Attempts</th><td class="mono">${step.attempts} (${step.retries} retr${step.retries === 1 ? "y" : "ies"})</td></tr>
        <tr><th>Runtime</th><td class="mono">${step.runtime_seconds ?? "—"} s</td></tr>
        <tr><th>Waited for</th><td class="mono small">${(step.parent_steps || []).join(", ") || "nothing"}</td></tr>
        <tr><th>Feeds</th><td class="mono small">${(step.child_steps || []).join(", ") || "nothing"}</td></tr>
        <tr><th>Reused a result</th><td>${step.cache_hit
          ? `<span class="wf-cached">yes — from step ${step.cached_from_step_id}</span>`
          : "no — it ran"}</td></tr>
      </tbody></table>

      <h4>Parameters</h4>
      ${Object.keys(step.parameters || {}).length
        ? `<table class="wf-props"><tbody>${Object.entries(step.parameters).map(([k, v]) =>
            `<tr><th>${esc(k)}</th><td class="mono">${esc(JSON.stringify(v))}</td></tr>`).join("")}</tbody></table>`
        : `<p class="dim small">none — this step takes no parameters</p>`}

      <h4>Cache key</h4>
      <p class="mono small dim">${esc((step.cache_key || "").slice(0, 32))}…</p>
      <p class="wf-caveat">${esc(cache.statement || "")}</p>

      ${(step.logs || []).length ? `<h4>Log</h4>
        <pre class="wf-log">${step.logs.map((l) => esc(l)).join("\n")}</pre>` : ""}

      ${(step.input_artifacts || []).length ? `<h4>Inputs</h4>
        ${step.input_artifacts.map(artifactCard).join("")}` : ""}
      ${(step.output_artifacts || []).length ? `<h4>Outputs</h4>
        ${step.output_artifacts.map((a) => artifactCard(a, true)).join("")}` : ""}
    </section>`;
}

export function artifactCard(artifact, full = false) {
  const provenance = artifact.provenance || {};
  const kind = artifact.kind;
  return `
    <div class="wf-artifact" style="--kind:${KIND_COLOR[kind] || "var(--border-strong)"}">
      <div class="wf-artifact-head">
        <span class="wf-artifact-kind">${esc(kind.replace(/_/g, " "))}</span>
        <strong>${esc(artifact.name)}</strong>
        <span class="wf-prov wf-prov-${esc(provenance.provenance_type || "derived")}">${esc(provenance.provenance_type || "derived")}</span>
        <span class="mono small dim">${esc((artifact.content_sha256 || "").slice(0, 12))}</span>
      </div>
      ${Object.keys(artifact.summary || {}).length ? `
        <table class="wf-summary"><tbody>${Object.entries(artifact.summary).map(([k, v]) =>
          `<tr><th>${esc(k.replace(/_/g, " "))}</th><td class="mono">${esc(
            typeof v === "object" ? JSON.stringify(v) : String(v))}</td></tr>`).join("")}</tbody></table>` : ""}
      ${provenance.statement ? `<p class="wf-caveat">${esc(provenance.statement)}</p>` : ""}
      ${full && artifact.payload ? `<details class="wf-details">
        <summary>Full payload</summary>
        <pre class="wf-log">${esc(JSON.stringify(artifact.payload, null, 1).slice(0, 12000))}</pre>
      </details>` : ""}
    </div>`;
}
