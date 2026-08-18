/**
 * START DISCOVERY — one input, then the plan before anything executes.
 *
 * The plan review is the important half of this screen. Showing a workflow
 * before running it is what separates an orchestrator from a black box: the
 * user can see which capabilities were chosen, which were omitted and why,
 * and drop any step they do not want.
 */

import { card, esc, loading, notice } from "../../ui.js";
import { apApi } from "../api.js";
import { currentRun } from "../router.js";

const EXAMPLES = [
  "Find a potential therapy for treatment-resistant glioblastoma.",
  "Improve this molecule for BBB penetration without losing target activity.",
  "Investigate why this candidate is toxic and generate safer alternatives.",
  "Find unexplored therapeutic hypotheses for Parkinson's disease.",
  "Compare current EGFR-targeting approaches and design candidates addressing their major limitations.",
  "Take this molecule through the complete DrugDiscovery pipeline.",
];

export async function startView(host) {
  host.innerHTML = loading("Loading capabilities…");

  let status;
  try {
    status = await apApi.status();
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = `
    ${renderForm(status)}
    <div id="ap-plan"></div>
    ${renderCapabilities(status)}
  `;
  wireForm(host);
}

function renderForm(status) {
  return card(
    "What do you want to find out?",
    `<form class="ap-form" id="ap-start">
      <label>Objective
        <textarea name="objective" rows="4" required
          placeholder="A disease, a target, a molecule, a SMILES, or a question in plain words."></textarea>
      </label>

      <div class="ap-examples">
        <span class="dim">Examples:</span>
        ${EXAMPLES.map(
          (e) =>
            `<button type="button" class="ap-example" data-text="${esc(e)}">${esc(
              e.length > 58 ? e.slice(0, 55) + "…" : e
            )}</button>`
        ).join("")}
      </div>

      <details class="ap-optional">
        <summary>Structured inputs (optional)</summary>
        <div class="ap-form-row">
          <label>Disease<input name="disease" type="text" /></label>
          <label>Target<input name="target" type="text" /></label>
        </div>
        <label>SMILES<input name="smiles" type="text" placeholder="CC(=O)Oc1ccccc1C(=O)O" /></label>
      </details>

      <div class="ap-form-row">
        <label>Depth
          <select name="depth">
            ${status.depths
              .map(
                (d) =>
                  `<option value="${esc(d.depth)}" ${
                    d.depth === "standard" ? "selected" : ""
                  }>${esc(d.label)}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>Autonomy
          <select name="autonomy">
            ${status.autonomy.levels
              .map(
                (l) =>
                  `<option value="${esc(l.level)}" ${
                    l.level === "level_2" ? "selected" : ""
                  }>${esc(l.label)}</option>`
              )
              .join("")}
          </select>
        </label>
        <label>Your name<input name="started_by" type="text" required /></label>
      </div>

      <div id="ap-depth-note" class="ap-depth-note"></div>

      <button type="submit" class="primary">Plan the discovery</button>
      <p class="dim">Nothing runs yet. You will see the plan first.</p>
    </form>
    <div class="ap-autonomy-limits">
      <strong>Autonomy limits.</strong> ${esc(status.autonomy.limits)}
    </div>`
  );
}

function renderCapabilities(status) {
  return card(
    `${status.tools.length} capabilities available to the planner`,
    `<div class="table-wrap"><table class="ap-table">
      <thead><tr><th>Tool</th><th>Engine it calls</th><th>Do it yourself</th></tr></thead>
      <tbody>${status.tools
        .map(
          (t) => `<tr>
            <td><strong>${esc(t.label)}</strong><div class="dim">${esc(
            t.purpose
          )}</div></td>
            <td class="mono dim">${esc(t.engine)}</td>
            <td>${
              t.manual_route
                ? `<a href="${esc(t.manual_route)}">${esc(t.manual_route)}</a>`
                : "—"
            }</td>
          </tr>`
        )
        .join("")}</tbody></table></div>
     <p class="dim">${esc(status.integrity_note)}</p>`
  );
}

function wireForm(host) {
  const form = host.querySelector("#ap-start");
  const planHost = host.querySelector("#ap-plan");
  const depthNote = host.querySelector("#ap-depth-note");

  host.querySelectorAll(".ap-example").forEach((button) => {
    button.addEventListener("click", () => {
      form.querySelector("[name=objective]").value = button.dataset.text;
    });
  });

  const showDepth = async () => {
    const status = await apApi.status();
    const chosen = form.querySelector("[name=depth]").value;
    const entry = status.depths.find((d) => d.depth === chosen);
    if (!entry) return;
    depthNote.innerHTML = `
      <strong>${esc(entry.label)}.</strong> ${esc(entry.confidence_note)}
      ${
        entry.omits?.length
          ? `<div class="dim">Omits: ${entry.omits.map(esc).join("; ")}.</div>`
          : ""
      }`;
  };
  form.querySelector("[name=depth]").addEventListener("change", showDepth);
  showDepth();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const inputs = {};
    for (const key of ["disease", "target", "smiles"]) {
      const value = data.get(key);
      if (value) inputs[key] = value;
    }

    planHost.innerHTML = loading("Reading the objective and planning…");
    try {
      const result = await apApi.plan({
        objective: data.get("objective"),
        inputs,
        depth: data.get("depth"),
        autonomy: data.get("autonomy"),
        started_by: data.get("started_by"),
      });
      currentRun.set(result.run_id);
      planHost.innerHTML = renderPlan(result);
      wirePlan(planHost, result.run_id, data.get("started_by"));
    } catch (error) {
      planHost.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

function renderPlan(result) {
  const plan = result.plan;
  const interpretation = plan.interpretation;

  return card(
    `Plan for ${esc(result.run_id)}`,
    `<div class="ap-interpretation">
       <div class="ap-field-label">How this was read</div>
       <p><strong>${esc(
         interpretation.intent.replace(/_/g, " ")
       )}</strong> — ${esc(interpretation.reasoning)}</p>
       <div class="dim">Interpreted by ${esc(interpretation.interpreted_by)}.
         ${
           interpretation.disease
             ? `Disease: <strong>${esc(interpretation.disease)}</strong>. `
             : ""
         }${
      interpretation.target
        ? `Target: <strong>${esc(interpretation.target)}</strong>.`
        : ""
    }</div>
       ${
         interpretation.open_questions?.length
           ? `<div class="ap-questions"><strong>Open questions</strong>
                <ul>${interpretation.open_questions
                  .map((q) => `<li>${esc(q)}</li>`)
                  .join("")}</ul></div>`
           : ""
       }
     </div>

     ${renderGraph(plan.graph)}

     ${
       plan.omitted_steps?.length
         ? `<div class="ap-omitted">
              <strong>${plan.omitted_steps.length} step(s) not planned at this depth</strong>
              <ul>${plan.omitted_steps
                .map(
                  (o) => `<li><strong>${esc(o.label)}</strong> — ${esc(o.reason)}</li>`
                )
                .join("")}</ul>
            </div>`
         : ""
     }

     ${
       plan.checkpoints?.length
         ? `<p class="dim">${plan.checkpoints.length} checkpoint(s) will pause
              the run for your decision: ${plan.checkpoints
                .map((c) => esc(c.kind.replace(/_/g, " ")))
                .join(", ")}.</p>`
         : `<p class="dim">At this autonomy level the run will not pause
              except before recommending an experiment, which always requires
              a person.</p>`
     }

     <form class="ap-form" id="ap-approve">
       <div class="ap-field-label">Customise before running (optional)</div>
       <label>Steps to drop <span class="dim">comma-separated task ids</span>
         <input name="drop" type="text" placeholder="docking, pkpd" />
       </label>
       <div class="ap-actions">
         <button type="submit" class="primary">Run full workflow</button>
         <a class="btn" href="#/autopilot/map">Open the live map</a>
       </div>
       <p class="dim">Dropping a step also drops anything that depended on it,
         with the reason recorded — the run will not substitute a value it
         does not have.</p>
     </form>
     <div id="ap-approve-result"></div>
     <p class="dim">${esc(plan.note)}</p>`
  );
}

function renderGraph(graph) {
  return `<div class="ap-graph">
    ${graph.layers
      .map(
        (layer, index) => `
        <div class="ap-layer">
          <div class="ap-layer-label">wave ${index + 1}</div>
          <div class="ap-layer-nodes">
            ${layer
              .map((taskId) => {
                const node = graph.nodes.find((n) => n.task_id === taskId);
                return `<div class="ap-node planned" title="${esc(
                  node?.rationale || ""
                )}">
                  <div class="ap-node-label">${esc(node?.label || taskId)}</div>
                  <div class="ap-node-tool mono">${esc(
                    node?.tool_key || node?.task_type || ""
                  )}</div>
                </div>`;
              })
              .join("")}
          </div>
        </div>`
      )
      .join('<div class="ap-layer-arrow">↓</div>')}
    <p class="dim">${esc(graph.parallel_note)}</p>
  </div>`;
}

function wirePlan(host, runId, approvedBy) {
  const form = host.querySelector("#ap-approve");
  const result = host.querySelector("#ap-approve-result");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = new FormData(form).get("drop") || "";
    const drop = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    result.innerHTML = loading("Starting…");
    try {
      await apApi.approvePlan(runId, {
        approved_by: approvedBy,
        modifications: drop.length ? { drop_tasks: drop } : undefined,
      });
      result.innerHTML = notice(
        `Run <span class="mono">${esc(runId)}</span> started.
         <a href="#/autopilot/map">Watch it on the live map</a>.`,
        "ok",
        "▶"
      );
    } catch (error) {
      result.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}
