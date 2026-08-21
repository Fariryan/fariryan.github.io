/** Every step of a run, and what each one actually did. */

import { esc, loading, notice } from "../../ui.js";
import { workflowApi } from "../api.js";
import { RUN_GLYPH, STEP_GLYPH, artifactCard, renderStep, withRun } from "./shared.js";

let timer = null;

export async function runsView(root, params) {
  if (timer) { clearInterval(timer); timer = null; }
  await withRun(root, params, render);
}

async function render(host, runId) {
  const run = await workflowApi.run(runId);

  host.innerHTML = `
    <section class="wf-panel lg-surface lg-d1">
      <header class="wf-panel-head">
        <div><h3>${esc(run.workflow.name)}</h3>
          <p class="wf-objective">${esc(run.workflow.objective)}</p>
          <span class="dim small">${esc(run.workflow.disease || "")}
            ${run.workflow.target ? `· ${esc(run.workflow.target)}` : ""}
            · planned by ${esc(run.workflow.planned_by)}</span></div>
        <span class="wf-state wf-state-${esc(run.status)}">${RUN_GLYPH[run.status] || "•"} ${esc(run.status)}</span>
      </header>

      ${run.error ? `<p class="wf-error">${esc(run.error)}</p>` : ""}
      ${(run.warnings || []).length ? `<div class="wf-warnings">${run.warnings.map((w) => `<div>⚠ ${esc(w)}</div>`).join("")}</div>` : ""}
      ${run.resumed_from_run_id ? `<p class="wf-caveat">Resumed from run #${run.resumed_from_run_id}, restarting at <strong>${esc(run.resumed_from_step)}</strong>. That run is unchanged and stays on record exactly as it finished.</p>` : ""}

      <div class="wf-stats">
        <div><b>${run.steps_complete}/${run.steps_total}</b><span>complete</span></div>
        <div><b>${run.steps_failed}</b><span>failed</span></div>
        <div><b>${run.steps_blocked}</b><span>blocked</span></div>
        <div><b>${run.steps_cached}</b><span>reused</span></div>
        <div><b>${run.runtime_seconds ?? "—"}</b><span>seconds</span></div>
        <div><b>${esc(run.stop_reason || "—")}</b><span>stopped because</span></div>
      </div>

      <div class="wf-actions">
        ${run.resumable_from
          ? `<button id="wf-resume" class="wf-btn">Resume from ${esc(run.resumable_from)}</button>` : ""}
        <a class="wf-btn ghost" href="#/workflow/graph?run=${run.id}">See the graph →</a>
        <a class="wf-btn ghost" href="#/scientist/ask?workflow_run=${run.id}">Ask the AI Scientist about this run →</a>
      </div>

      <h4>Steps</h4>
      <ol class="wf-steps" id="wf-steps">
        ${run.steps.map((s) => `
          <li class="wf-step wf-step-${esc(s.status)}" data-key="${esc(s.key)}">
            <div class="wf-step-head">
              <span class="wf-state wf-state-${esc(s.status)}">${STEP_GLYPH[s.status] || "•"} ${esc(s.status)}</span>
              <strong>${esc(s.label)}</strong>
              <span class="wf-chip">${esc(s.executor_kind)}</span>
              ${s.cache_hit ? '<span class="wf-cached">reused</span>' : ""}
              <span class="mono small dim">${s.runtime_seconds != null ? `${s.runtime_seconds}s` : ""}</span>
            </div>
            <p class="wf-step-reason">${esc(s.reason)}</p>
            ${s.error ? `<p class="wf-error small">${esc(s.error)}</p>` : ""}
            ${s.blocked_reason ? `<p class="wf-caveat small">${esc(s.blocked_reason)}</p>` : ""}
          </li>`).join("")}
      </ol>
      <p class="wf-note">${esc(run.inspectability)}</p>
    </section>

    <div id="wf-step-detail"></div>

    ${run.artifacts.length ? `
      <section class="wf-panel lg-surface lg-d1">
        <h3>Artifacts</h3>
        <p class="wf-note">Every result this run produced, content-hashed. The hash is what lets a later run recognise an identical computation and skip it.</p>
        ${run.artifacts.map((a) => artifactCard(a)).join("")}
      </section>` : ""}`;

  const detail = host.querySelector("#wf-step-detail");
  host.querySelectorAll(".wf-step").forEach((node) =>
    node.addEventListener("click", async () => {
      host.querySelectorAll(".wf-step").forEach((n) => n.classList.remove("selected"));
      node.classList.add("selected");
      detail.innerHTML = loading("Loading step…");
      try {
        detail.innerHTML = renderStep(await workflowApi.step(runId, node.dataset.key));
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) { detail.innerHTML = notice(esc(error.message), "danger", "⚠"); }
    }));

  const resume = host.querySelector("#wf-resume");
  if (resume) {
    resume.addEventListener("click", async () => {
      resume.disabled = true;
      try {
        const result = await workflowApi.resume(runId);
        location.hash = `#/workflow/runs?run=${result.run.id}`;
      } catch (error) {
        resume.disabled = false;
        detail.innerHTML = notice(esc(error.message), "warn", "⚠");
      }
    });
  }

  if (["queued", "running"].includes(run.status)) {
    if (timer) clearInterval(timer);
    timer = setInterval(async () => {
      const fresh = await workflowApi.run(runId);
      if (!["queued", "running"].includes(fresh.status)) {
        clearInterval(timer); timer = null;
        await render(host, runId);
      }
    }, 6000);
  }
}
