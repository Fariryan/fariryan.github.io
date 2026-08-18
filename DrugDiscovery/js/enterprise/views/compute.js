/**
 * Jobs and reproducible runs.
 *
 * The message this page has to carry is that work continues without the
 * browser. It is stated plainly and demonstrated by the fact that progress
 * keeps advancing across a reload.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { entApi } from "../api.js";

const STATE_TONE = {
  queued: "",
  running: "info",
  succeeded: "ok",
  failed: "danger",
  cancelled: "warn",
  timed_out: "warn",
};

export async function computeView(host) {
  host.innerHTML = loading("Loading jobs and runs…");

  let jobs;
  let runs;
  let observability;
  try {
    [jobs, runs, observability] = await Promise.all([
      entApi.jobs(),
      entApi.runs(),
      entApi.observability(),
    ]);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = `
    ${renderQueue(jobs, observability)}
    ${renderJobs(jobs)}
    ${renderRuns(runs)}
    <div id="ent-run-detail"></div>
  `;

  wire(host);
}

function renderQueue(jobs, obs) {
  const s = jobs.stats;
  const q = obs.queue?.last_24h || {};
  return card(
    "Queue",
    `<div class="ent-stats small">
       <div><span class="v">${s.queued}</span><span class="l">queued</span></div>
       <div><span class="v">${s.running}</span><span class="l">running</span></div>
       <div><span class="v">${q.failed ?? 0}</span><span class="l">failed (24h)</span></div>
       <div><span class="v">${
         q.queue_wait_seconds?.p95 != null ? q.queue_wait_seconds.p95 + "s" : "—"
       }</span><span class="l">p95 wait</span></div>
     </div>
     ${notice(esc(jobs.note), "info", "ℹ")}`
  );
}

function renderJobs(jobs) {
  if (!jobs.jobs.length) {
    return card("Jobs", empty("No job has been submitted."));
  }
  const rows = jobs.jobs
    .map(
      (j) => `<tr>
        <td class="mono">${esc(j.job_key)}</td>
        <td>${esc(j.kind)}</td>
        <td><span class="ent-pill ${STATE_TONE[j.state] || ""}">${esc(
        j.state
      )}</span></td>
        <td>
          <div class="ent-progress"><span style="width:${Math.round(
            (j.progress || 0) * 100
          )}%"></span></div>
          <div class="dim">${esc(j.progress_note || "")}</div>
        </td>
        <td>${j.attempts}/${j.max_attempts}</td>
        <td>${
          ["queued", "running"].includes(j.state)
            ? `<button class="sm ent-cancel" data-key="${esc(
                j.job_key
              )}">Cancel</button>`
            : ""
        }</td>
      </tr>
      ${
        j.error
          ? `<tr class="ent-error-row"><td colspan="6" class="dim">${esc(
              j.error
            )}</td></tr>`
          : ""
      }`
    )
    .join("");

  return card(
    "Jobs",
    `<div class="table-wrap"><table class="ent-table">
      <thead><tr><th>Key</th><th>Kind</th><th>State</th><th>Progress</th>
        <th>Attempts</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
  );
}

function renderRuns(runs) {
  if (!runs.runs.length) {
    return card("Runs", empty("No run has been recorded."));
  }
  const rows = runs.runs
    .map(
      (r) => `<tr>
        <td><button class="link ent-open-run" data-run="${esc(
          r.run_id
        )}">${esc(r.run_id)}</button></td>
        <td>${esc(r.kind)}</td>
        <td>${esc(r.label || "—")}</td>
        <td>${esc(r.state)}</td>
        <td>${
          r.cloned_from
            ? `<span class="dim">from ${esc(r.cloned_from)}</span>`
            : ""
        }</td>
      </tr>`
    )
    .join("");
  return card(
    "Runs",
    `<div class="table-wrap"><table class="ent-table">
      <thead><tr><th>Run</th><th>Kind</th><th>Label</th><th>State</th>
        <th>Lineage</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
  );
}

function wire(host) {
  host.querySelectorAll(".ent-cancel").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await entApi.cancelJob(button.dataset.key);
        computeView(host);
      } catch (error) {
        button.insertAdjacentHTML(
          "afterend",
          notice(esc(error.message), "danger", "⚠")
        );
      }
    });
  });

  const detail = host.querySelector("#ent-run-detail");
  host.querySelectorAll(".ent-open-run").forEach((button) => {
    button.addEventListener("click", async () => {
      detail.innerHTML = loading("Reopening the run…");
      try {
        detail.innerHTML = renderRunDetail(await entApi.run(button.dataset.run));
        wireClone(detail, button.dataset.run, host);
      } catch (error) {
        detail.innerHTML = notice(esc(error.message), "danger", "⚠");
      }
    });
  });
}

function renderRunDetail(run) {
  const repro = run.reproducibility || {};
  return card(
    `${esc(run.run_id)} — ${esc(run.label || run.kind)}`,
    `<div class="ent-field">
       <div class="ent-field-label">Configuration</div>
       <pre class="ent-pre">${esc(
         JSON.stringify(run.configuration, null, 1)
       )}</pre>
     </div>

     <div class="ent-stats small">
       <div><span class="v">${run.models_used?.length ?? 0}</span><span class="l">models</span></div>
       <div><span class="v">${run.jobs?.length ?? 0}</span><span class="l">jobs</span></div>
       <div><span class="v">${run.provenance?.length ?? 0}</span><span class="l">provenance records</span></div>
       <div><span class="v">${
         run.random_seed ?? "none"
       }</span><span class="l">seed</span></div>
     </div>

     ${
       repro.code_changed
         ? notice(
             `The code has changed since this run: it was produced at
              <code>${esc((repro.code_version_then || "").slice(0, 12))}</code>
              and the platform is now at
              <code>${esc((repro.code_version_now || "").slice(0, 12))}</code>.
              A re-run may legitimately differ.`,
             "warn",
             "⚠"
           )
         : notice("The code version is unchanged since this run.", "ok", "✓")
     }
     <p class="dim">${esc(repro.note || "")}</p>

     ${
       run.lineage?.ancestors?.length
         ? `<div class="ent-field">
              <div class="ent-field-label">Lineage</div>
              <ul>${run.lineage.ancestors
                .map(
                  (a) =>
                    `<li>cloned from <span class="mono">${esc(
                      a.run_id
                    )}</span>, changing ${esc(
                      Object.keys(a.changed_to_get_here || {}).join(", ") ||
                        "nothing recorded"
                    )}</li>`
                )
                .join("")}</ul>
            </div>`
         : ""
     }

     <form class="ent-form ent-clone-form">
       <div class="ent-field-label">Re-run with one parameter changed</div>
       <div class="ent-form-row">
         <label>Parameter path
           <input name="path" type="text" placeholder="budget.max_generations" required />
         </label>
         <label>New value
           <input name="value" type="text" placeholder="12" required />
         </label>
       </div>
       <button type="submit">Clone run</button>
     </form>
     <div class="ent-clone-result"></div>`
  );
}

function wireClone(host, runId, root) {
  const form = host.querySelector(".ent-clone-form");
  const result = host.querySelector(".ent-clone-result");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    let value = data.get("value");
    // Numbers and booleans typed into a text box should arrive as such;
    // sending "12" where the engine expects 12 changes behaviour silently.
    if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
    else if (value === "true" || value === "false") value = value === "true";

    result.innerHTML = loading("Cloning…");
    try {
      const clone = await entApi.cloneRun(runId, {
        delta: { [data.get("path")]: value },
      });
      result.innerHTML = notice(
        `Created <span class="mono">${esc(clone.run_id)}</span> from
         <span class="mono">${esc(clone.cloned_from)}</span>.`,
        "ok",
        "✓"
      );
      computeView(root);
    } catch (error) {
      result.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}
