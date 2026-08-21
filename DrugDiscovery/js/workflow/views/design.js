/** State an objective, read the plan, then run it. */

import { esc, loading, notice } from "../../ui.js";
import { workflowApi } from "../api.js";

export async function designView(root) {
  let status;
  try { status = await workflowApi.status(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  const capabilities = Object.entries(status.capabilities);
  const available = capabilities.filter(([, v]) => v.available).length;

  root.innerHTML = `
    <section class="wf-panel lg-surface lg-d1">
      <header class="wf-panel-head">
        <div><h3>${available} of ${capabilities.length} capabilities available here</h3>
          <p class="wf-note">Each was probed by asking its own engine, not by checking that a module imports. Steps needing an unavailable capability are left out of the plan with the reason recorded.</p></div>
      </header>
      <div class="wf-caps">
        ${capabilities.map(([key, v]) => `
          <div class="wf-cap ${v.available ? "yes" : "no"}" ${v.reason ? `title="${esc(v.reason)}"` : ""}>
            <span class="wf-dot"></span>${esc(key.replace(/_/g, " "))}
          </div>`).join("")}
      </div>
      ${capabilities.filter(([, v]) => !v.available).map(([key, v]) =>
        `<p class="wf-caveat"><strong>${esc(key.replace(/_/g, " "))}:</strong> ${esc(v.reason)}</p>`).join("")}
    </section>

    <section class="wf-panel lg-surface lg-d1">
      <div class="wf-grid">
        <div>
          <label for="wf-area">Therapeutic area</label>
          <input id="wf-area" type="text" value="Neuroscience" />
          <label for="wf-disease">Disease</label>
          <input id="wf-disease" type="text" value="glioblastoma" />
          <label for="wf-target">Target <span class="dim">(optional — the workflow selects one if you do not)</span></label>
          <input id="wf-target" type="text" value="EGFR" placeholder="optional" />
        </div>
        <div>
          <label for="wf-objective">Objective</label>
          <textarea id="wf-objective" rows="4">Discover and optimize plausible BBB-compatible compounds for a glioblastoma target</textarea>
          <label class="wf-check"><input id="wf-usellm" type="checkbox" checked />
            Let the reasoning model choose which of the available steps this objective needs</label>
          <p class="wf-note">The model may only select from steps this deployment already has. It cannot introduce a step, change an executor or set a scientific parameter, and any dependency it omits is added back.</p>
        </div>
      </div>
      <div class="wf-actions">
        <button id="wf-plan" class="wf-btn ghost">Plan it</button>
        <button id="wf-run" class="wf-btn">Plan and run</button>
      </div>
    </section>

    <div id="wf-out"></div>`;

  const out = root.querySelector("#wf-out");
  const collect = () => ({
    name: `${root.querySelector("#wf-disease").value.trim() || "Workflow"} — automated discovery`,
    objective: root.querySelector("#wf-objective").value.trim(),
    therapeutic_area: root.querySelector("#wf-area").value.trim() || null,
    disease: root.querySelector("#wf-disease").value.trim() || null,
    target: root.querySelector("#wf-target").value.trim() || null,
    use_llm: root.querySelector("#wf-usellm").checked,
  });

  root.querySelector("#wf-plan").addEventListener("click", async () => {
    out.innerHTML = loading("Probing every engine, then planning…");
    try { out.innerHTML = renderPlan(await workflowApi.plan(collect())); }
    catch (error) { out.innerHTML = notice(esc(error.message), "warn", "⚠"); }
  });

  root.querySelector("#wf-run").addEventListener("click", async () => {
    out.innerHTML = loading("Planning and queueing…");
    try {
      const result = await workflowApi.submit(collect());
      out.innerHTML = `
        <div class="wf-panel lg-surface lg-d1">
          <strong>Run ${result.run.id} started.</strong>
          <p class="wf-note">${esc(result.note)}</p>
          <p><a class="wf-btn ghost" href="#/workflow/runs?run=${result.run.id}">Watch every step →</a>
             <a class="wf-btn ghost" href="#/workflow/graph?run=${result.run.id}">See the graph →</a></p>
        </div>
        ${renderPlan({steps: result.workflow.plan, excluded: result.workflow.excluded,
                      planned_by: result.workflow.planned_by,
                      provenance: result.workflow.plan_provenance})}`;
    } catch (error) {
      out.innerHTML = notice(`<strong>Refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });
}

function renderPlan(plan) {
  const provenance = plan.provenance || {};
  const model = provenance.model || {};
  return `
    <section class="wf-panel lg-surface lg-d1">
      <header class="wf-panel-head">
        <div><h3>${plan.steps.length} steps</h3>
          <span class="dim small">planned by
            <strong>${esc(plan.planned_by === "language_model" ? "the reasoning model" : "the default template")}</strong>
            ${model.resolved_model ? `· ${esc(model.resolved_model)}` : ""}</span></div>
      </header>

      ${provenance.model_rationale ? `
        <h4>Why this plan</h4>
        <p class="wf-reason">${esc(provenance.model_rationale)}</p>
        <p class="wf-caveat">${esc(provenance.constraint || "")}</p>` : ""}
      ${(provenance.dependencies_added_back || []).length ? `
        <p class="wf-caveat">Dependencies the model omitted were added back: ${
          provenance.dependencies_added_back.map(esc).join(", ")}. A plan that docks without a receptor is not a plan.</p>` : ""}
      ${(provenance.discarded_suggestions || []).length ? `
        <p class="wf-caveat">Discarded, because this deployment has no such step: ${
          provenance.discarded_suggestions.map((d) => esc(d.key)).join(", ")}</p>` : ""}
      ${provenance.llm_planning && provenance.llm_planning.attempted === false ? `
        <p class="wf-caveat">The reasoning model was not used: ${esc(provenance.llm_planning.reason)} ${esc(provenance.llm_planning.note || "")}</p>` : ""}

      <h4>The plan</h4>
      <ol class="wf-plan">
        ${plan.steps.map((s) => `
          <li>
            <div class="wf-plan-head">
              <strong>${esc(s.label || s.key)}</strong>
              <span class="wf-chip">${esc(s.executor_kind)}</span>
              <span class="mono small dim">${esc(s.executor)}</span>
            </div>
            <p class="wf-plan-reason">${esc(s.reason || s.purpose || "")}</p>
            ${(s.depends_on || []).length ? `<p class="dim small">after: ${s.depends_on.map(esc).join(", ")}</p>` : ""}
          </li>`).join("")}
      </ol>

      ${(plan.excluded || []).length ? `
        <h4>Left out, and why</h4>
        <table class="wf-table">
          <thead><tr><th>Step</th><th>Reason</th><th>What is lost</th></tr></thead>
          <tbody>${plan.excluded.map((e) => `
            <tr><td class="small">${esc(e.label || e.key)}</td>
              <td class="small dim">${esc(e.reason)}</td>
              <td class="small dim">${esc(e.consequence || "")}</td></tr>`).join("")}</tbody>
        </table>
        <p class="wf-caveat">An absent step is invisible in a finished run. These are listed so that "we did not compute a free energy" reads as a finding rather than a gap.</p>` : ""}
    </section>`;
}
