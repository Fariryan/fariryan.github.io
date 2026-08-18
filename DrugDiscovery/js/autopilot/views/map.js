/**
 * THE LIVE DISCOVERY MAP.
 *
 * The point of this screen is that a scientist can watch the investigation
 * happen rather than watch a spinner. Nodes carry their own state and a
 * one-line result, so the map is readable without clicking; clicking opens
 * the evidence behind a node.
 *
 * It advances the run by polling: each tick asks the backend to run the next
 * wave, then redraws. Closing the tab stops the polling, not the run — every
 * task's state is already in the database, and reopening resumes the view.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { apApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

const STATE_TONE = {
  waiting_for_dependency: "waiting",
  queued: "queued",
  running: "running",
  waiting_for_user: "review",
  human_review_required: "review",
  completed: "done",
  warning: "warn",
  failed: "failed",
  cancelled: "cancelled",
  skipped: "skipped",
};

let timer = null;

export async function mapView(host) {
  const runId = currentRun.get();
  if (!runId) {
    host.innerHTML = needsRun();
    return;
  }

  host.innerHTML = loading("Loading the discovery map…");
  stopPolling();

  const draw = async () => {
    let map;
    let checkpoints;
    let cost;
    try {
      [map, checkpoints, cost] = await Promise.all([
        apApi.map(runId),
        apApi.checkpoints(runId),
        apApi.cost(runId),
      ]);
    } catch (error) {
      stopPolling();
      host.innerHTML = notice(esc(error.message), "danger", "⚠");
      return null;
    }

    host.innerHTML = `
      ${renderHeader(map, cost)}
      ${renderCheckpoints(checkpoints)}
      ${renderMap(map)}
      ${renderLegend(map)}
      <div id="ap-node-detail"></div>
    `;
    wire(host, runId, map);
    return map;
  };

  const map = await draw();
  if (map && isActive(map.state)) startPolling(host, runId, draw);
}

function isActive(state) {
  return state === "running";
}

function startPolling(host, runId, draw) {
  stopPolling();
  timer = setInterval(async () => {
    // The tab may have navigated away; stop rather than drawing into nothing.
    if (!document.body.contains(host)) {
      stopPolling();
      return;
    }
    try {
      await apApi.advance(runId, {});
    } catch (error) {
      // A 409 means a checkpoint opened or the run finished — both are normal
      // and the redraw below will show which.
      if (error.status !== 409) {
        stopPolling();
      }
    }
    const map = await draw();
    if (!map || !isActive(map.state)) stopPolling();
  }, 2500);
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function renderHeader(map, cost) {
  const p = map.progress;
  return `
    <div class="ap-map-head">
      <div class="ap-progress-block">
        <div class="ap-progress">
          <span style="width:${Math.round((p.fraction || 0) * 100)}%"></span>
        </div>
        <div class="dim">${p.finished} of ${p.total} steps ·
          <span class="ap-pill ${STATE_TONE[map.state] || ""}">${esc(
    map.state.replace(/_/g, " ")
  )}</span>
          · ${Math.round(cost.cpu_seconds)}s compute</div>
      </div>
      <div class="ap-actions">
        <button class="sm" id="ap-step">Run one wave</button>
        <a class="btn sm" href="#/autopilot/story">Story</a>
        <a class="btn sm" href="#/autopilot/evolution">Evolution</a>
      </div>
    </div>
    ${
      cost.depth_note
        ? `<p class="ap-depth-inline">${esc(cost.depth_note)}</p>`
        : ""
    }`;
}

function renderCheckpoints(payload) {
  const pending = (payload.checkpoints || []).filter((c) => c.state === "pending");
  if (!pending.length) return "";

  return pending
    .map(
      (c) => `
      <div class="ap-checkpoint" data-checkpoint="${c.id}">
        <div class="ap-checkpoint-head">
          <span class="ap-badge review">human review required</span>
          <strong>${esc(c.kind.replace(/_/g, " "))}</strong>
        </div>
        <p class="ap-question">${esc(c.question)}</p>
        <p class="ap-recommendation">${esc(c.recommendation)}</p>

        ${
          c.evidence?.length
            ? `<div class="ap-evidence">
                 <div class="ap-field-label">Evidence</div>
                 <ul>${c.evidence
                   .map(
                     (e) =>
                       `<li><span class="ap-badge ${esc(
                         (e.evidence_class || "").toLowerCase()
                       )}">${esc(e.evidence_class || "")}</span> ${esc(
                         e.claim
                       )} <span class="dim mono">${esc(e.source || "")}</span></li>`
                   )
                   .join("")}</ul>
               </div>`
            : ""
        }
        ${
          c.consequences?.length
            ? `<div class="ap-consequences">
                 <div class="ap-field-label">Before you decide</div>
                 <ul>${c.consequences.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
               </div>`
            : ""
        }

        <form class="ap-decide">
          <label>Your name<input name="decided_by" type="text" required /></label>
          <label>Note<input name="note" type="text" /></label>
          <div class="ap-actions">
            <button type="submit" name="decision" value="approve" class="primary">Approve</button>
            ${
              c.alternatives?.length
                ? `<button type="submit" name="decision" value="alternatives">Request alternatives</button>`
                : ""
            }
            <button type="submit" name="decision" value="reject" class="danger">Reject</button>
          </div>
        </form>
        <div class="ap-decide-result"></div>
      </div>`
    )
    .join("");
}

function renderMap(map) {
  const layers = {};
  for (const node of map.nodes) {
    (layers[node.depth_rank] ||= []).push(node);
  }

  return `<div class="ap-graph live">
    ${Object.keys(layers)
      .map(Number)
      .sort((a, b) => a - b)
      .map(
        (rank, index, all) => `
        <div class="ap-layer">
          <div class="ap-layer-label">wave ${rank + 1}</div>
          <div class="ap-layer-nodes">
            ${layers[rank]
              .map(
                (n) => `
              <button class="ap-node ${STATE_TONE[n.state] || ""}"
                      data-task="${esc(n.task_id)}">
                <div class="ap-node-state">${esc(n.state.replace(/_/g, " "))}</div>
                <div class="ap-node-label">${esc(n.label)}</div>
                ${
                  n.headline
                    ? `<div class="ap-node-headline">${esc(n.headline)}</div>`
                    : ""
                }
                ${
                  n.evidence_class
                    ? `<span class="ap-badge ${esc(
                        n.evidence_class.toLowerCase()
                      )}">${esc(n.evidence_class)}</span>`
                    : ""
                }
              </button>`
              )
              .join("")}
          </div>
        </div>
        ${index < all.length - 1 ? '<div class="ap-layer-arrow">↓</div>' : ""}`
      )
      .join("")}
  </div>`;
}

function renderLegend(map) {
  return `<details class="ap-legend">
    <summary>What the states mean</summary>
    <ul>${map.legend
      .map(
        (l) =>
          `<li><span class="ap-pill ${STATE_TONE[l.state] || ""}">${esc(
            l.state.replace(/_/g, " ")
          )}</span> ${esc(l.meaning)}</li>`
      )
      .join("")}</ul>
  </details>`;
}

function wire(host, runId, map) {
  host.querySelector("#ap-step")?.addEventListener("click", async () => {
    try {
      await apApi.advance(runId, {});
    } catch (error) {
      if (error.status !== 409) {
        host.insertAdjacentHTML(
          "afterbegin",
          notice(esc(error.message), "danger", "⚠")
        );
        return;
      }
    }
    mapView(host);
  });

  const detail = host.querySelector("#ap-node-detail");
  host.querySelectorAll(".ap-node[data-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      detail.innerHTML = loading("Opening…");
      try {
        detail.innerHTML = renderNode(await apApi.task(runId, button.dataset.task));
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) {
        detail.innerHTML = notice(esc(error.message), "danger", "⚠");
      }
    });
  });

  host.querySelectorAll(".ap-checkpoint").forEach((block) => {
    const form = block.querySelector(".ap-decide");
    const result = block.querySelector(".ap-decide-result");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const decision = event.submitter?.value;
      if (!decision) return;
      const data = new FormData(form);
      result.innerHTML = loading("Recording…");
      try {
        await apApi.decide(Number(block.dataset.checkpoint), {
          decision,
          decided_by: data.get("decided_by"),
          note: data.get("note") || null,
        });
        mapView(host);
      } catch (error) {
        result.innerHTML = notice(esc(error.message), "danger", "⚠");
      }
    });
  });
}

function renderNode(task) {
  const why = task.why || {};
  return card(
    `${esc(task.label)} <span class="ap-pill ${
      STATE_TONE[task.state] || ""
    }">${esc(task.state.replace(/_/g, " "))}</span>`,
    `<div class="ap-why">
       <div class="ap-field-label">Why this step?</div>
       <p>${esc(why.answer || why.reason || "No stored basis.")}</p>
     </div>

     ${
       task.error
         ? notice(
             `<strong>No result.</strong> ${esc(task.error)}
              <div class="dim">Failure kind: ${esc(
                task.failure_kind || "unknown"
              )}. Nothing downstream was given a substitute value.</div>`,
             "danger",
             "⚠"
           )
         : ""
     }
     ${
       task.skip_reason
         ? notice(esc(task.skip_reason), "warn", "◌")
         : ""
     }
     ${
       task.confidence
         ? `<p class="ap-uncertainty"><strong>Stated uncertainty:</strong> ${esc(
             task.confidence
           )}</p>`
         : ""
     }

     <div class="ap-provenance dim">
       ${task.tool_used ? `Ran <span class="mono">${esc(task.tool_used)}</span>. ` : ""}
       ${
         task.evidence_class
           ? `Evidence class <span class="ap-badge ${esc(
               task.evidence_class.toLowerCase()
             )}">${esc(task.evidence_class)}</span>. `
           : ""
       }
       ${task.duration_ms != null ? `${task.duration_ms} ms.` : ""}
     </div>

     ${
       task.result && Object.keys(task.result).length
         ? `<details class="ap-result">
              <summary>Result data</summary>
              <pre class="ap-pre">${esc(
                JSON.stringify(task.result, null, 1).slice(0, 6000)
              )}</pre>
            </details>`
         : ""
     }`
  );
}
