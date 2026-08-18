/**
 * Runs: reopen, clone, re-run from a step, compare.
 *
 * A run is reopenable months later because none of its state lives in a
 * conversation. That is the property this screen exists to demonstrate.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { apApi } from "../api.js";
import { currentRun } from "../router.js";

export async function runsView(host) {
  host.innerHTML = loading("Loading runs…");
  let payload;
  try {
    payload = await apApi.runs();
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!payload.runs.length) {
    host.innerHTML = empty("No run yet. Start one under Start Discovery.");
    return;
  }

  host.innerHTML = `
    ${card(
      "Runs",
      `<div class="table-wrap"><table class="ap-table">
        <thead><tr><th>Run</th><th>Objective</th><th>Depth</th>
          <th>State</th><th>Lineage</th><th></th></tr></thead>
        <tbody>${payload.runs
          .map(
            (r) => `<tr>
              <td><button class="link ap-open" data-run="${esc(
                r.run_id
              )}">${esc(r.run_id)}</button></td>
              <td>${esc((r.objective || "").slice(0, 70))}</td>
              <td>${esc(r.depth)}</td>
              <td>${esc(r.state.replace(/_/g, " "))}</td>
              <td class="dim">${
                r.cloned_from ? `from ${esc(r.cloned_from)}` : ""
              }</td>
              <td><input type="checkbox" class="ap-compare" value="${esc(
                r.run_id
              )}" /></td>
            </tr>`
          )
          .join("")}</tbody></table></div>
       <div class="ap-actions">
         <button class="sm" id="ap-compare-btn">Compare selected</button>
       </div>`
    )}
    <div id="ap-run-detail"></div>
  `;
  wire(host);
}

function wire(host) {
  const detail = host.querySelector("#ap-run-detail");

  host.querySelectorAll(".ap-open").forEach((button) => {
    button.addEventListener("click", async () => {
      const runId = button.dataset.run;
      currentRun.set(runId);
      detail.innerHTML = loading("Reopening…");
      try {
        detail.innerHTML = renderRun(await apApi.run(runId));
        wireClone(detail, runId);
      } catch (error) {
        detail.innerHTML = notice(esc(error.message), "danger", "⚠");
      }
    });
  });

  host.querySelector("#ap-compare-btn")?.addEventListener("click", async () => {
    const ids = [...host.querySelectorAll(".ap-compare:checked")].map(
      (c) => c.value
    );
    if (ids.length < 2) {
      detail.innerHTML = notice("Select at least two runs.", "warn", "⚠");
      return;
    }
    detail.innerHTML = loading("Comparing…");
    try {
      detail.innerHTML = renderComparison(await apApi.compare(ids));
    } catch (error) {
      detail.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

function renderRun(run) {
  const repro = run.reproducibility || {};
  return card(
    `${esc(run.run_id)} — ${esc(run.title)}`,
    `<p class="ap-objective">${esc(run.objective)}</p>

     <div class="ap-stats">
       <div><span class="v">${run.progress.finished}/${run.progress.total}</span><span class="l">steps</span></div>
       <div><span class="v">${esc(run.state.replace(/_/g, " "))}</span><span class="l">state</span></div>
       <div><span class="v">${run.findings.length}</span><span class="l">findings</span></div>
       <div><span class="v">${Math.round(run.progress.cpu_seconds)}s</span><span class="l">compute</span></div>
     </div>

     <div class="ap-field">
       <div class="ap-field-label">Reproducibility</div>
       <table class="ap-table compact">
         <tr><td>code version</td><td class="mono">${esc(
           (repro.code_version || "").slice(0, 12)
         )}</td></tr>
         <tr><td>random seed</td><td class="mono">${esc(
           String(repro.random_seed ?? "—")
         )}</td></tr>
         ${
           repro.cloned_from
             ? `<tr><td>cloned from</td><td class="mono">${esc(
                 repro.cloned_from
               )}</td></tr>`
             : ""
         }
         ${
           repro.resumed_from_task
             ? `<tr><td>resumed from</td><td class="mono">${esc(
                 repro.resumed_from_task
               )}</td></tr>`
             : ""
         }
       </table>
     </div>

     ${
       run.findings.length
         ? `<div class="ap-field">
              <div class="ap-field-label">Findings</div>
              <ul>${run.findings
                .map(
                  (f) =>
                    `<li class="${f.weakens_conclusion ? "weakens" : ""}">
                      <span class="ap-pill ${
                        f.severity === "high" ? "failed" : "warn"
                      }">${esc(f.kind.replace(/_/g, " "))}</span>
                      ${esc(f.summary)}</li>`
                )
                .join("")}</ul>
            </div>`
         : ""
     }

     <form class="ap-form ap-clone-form">
       <div class="ap-field-label">Re-run</div>
       <div class="ap-form-row">
         <label>From step <span class="dim">optional</span>
           <select name="from_task">
             <option value="">the beginning</option>
             ${run.tasks
               .map(
                 (t) =>
                   `<option value="${esc(t.task_id)}">${esc(t.label)}</option>`
               )
               .join("")}
           </select>
         </label>
         <label>Depth
           <select name="depth">
             ${["quick_screen", "standard", "deep", "research_grade"]
               .map(
                 (d) =>
                   `<option value="${d}" ${
                     d === run.depth ? "selected" : ""
                   }>${d.replace(/_/g, " ")}</option>`
               )
               .join("")}
           </select>
         </label>
         <label>Your name<input name="started_by" type="text" required /></label>
       </div>
       <button type="submit">Clone and re-run</button>
     </form>
     <div class="ap-clone-result"></div>`
  );
}

function wireClone(host, runId) {
  const form = host.querySelector(".ap-clone-form");
  const result = host.querySelector(".ap-clone-result");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    result.innerHTML = loading("Cloning…");
    try {
      const child = await apApi.clone(runId, {
        started_by: data.get("started_by"),
        from_task: data.get("from_task") || null,
        delta: { depth: data.get("depth") },
      });
      currentRun.set(child.run_id);
      result.innerHTML = notice(
        `Created <span class="mono">${esc(child.run_id)}</span>.
         <a href="#/autopilot/start">Approve its plan</a> to start it.`,
        "ok",
        "✓"
      );
    } catch (error) {
      result.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

function renderComparison(payload) {
  const ids = payload.runs.map((r) => r.run_id);
  return card(
    "Comparison",
    `<div class="table-wrap"><table class="ap-table compact">
      <thead><tr><th>Attribute</th>${ids
        .map((i) => `<th class="mono">${esc(i)}</th>`)
        .join("")}</tr></thead>
      <tbody>
        ${["depth", "autonomy", "state", "random_seed", "code_version"]
          .map(
            (key) =>
              `<tr><td>${key.replace(/_/g, " ")}</td>${payload.runs
                .map(
                  (r) =>
                    `<td class="mono">${esc(
                      String(r[key] ?? "—").slice(0, 16)
                    )}</td>`
                )
                .join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table></div>

    <div class="ap-field-label">Tasks that differ (${
      payload.differing_tasks.length
    })</div>
    <div class="table-wrap"><table class="ap-table compact">
      <thead><tr><th>Task</th>${ids
        .map((i) => `<th class="mono">${esc(i.slice(-7))}</th>`)
        .join("")}</tr></thead>
      <tbody>${payload.tasks
        .filter((t) => t.differs)
        .map(
          (t) =>
            `<tr><td class="mono">${esc(t.task_id)}</td>${ids
              .map(
                (i) =>
                  `<td>${esc(
                    (t.runs[i]?.state || "").replace(/_/g, " ")
                  )}</td>`
              )
              .join("")}</tr>`
        )
        .join("")}</tbody></table></div>
    <p class="dim">${esc(payload.note)}</p>`
  );
}
