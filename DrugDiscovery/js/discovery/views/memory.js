/**
 * Research Memory.
 *
 * Two records, side by side: what happened, and what reasoned about it.
 *
 * The reasoning log includes failed calls. That is the point of it — "no
 * hypothesis was proposed" and "the model returned unparseable output twice"
 * are different answers to the same question, and only one of them is in the
 * timeline.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { activeCampaign, discApi } from "../api.js";

export async function memoryView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = loading("Reading the campaign record…");

  try {
    const [timeline, runs] = await Promise.all([
      discApi.timeline(campaign.code),
      discApi.llmRuns(campaign.code, { limit: 60 }),
    ]);

    root.innerHTML = `
      ${card(
        `Timeline (${timeline.count})`,
        timeline.count
          ? `<div class="disc-timeline">
              ${timeline.events
                .map(
                  (event) => `
                <div class="disc-event">
                  <div class="disc-event-time">${esc(event.at.replace("T", " ").slice(0, 19))}</div>
                  <div class="disc-event-dot"></div>
                  <div class="disc-event-body">
                    <div class="disc-event-kind">${esc(event.kind.replace(/_/g, " "))}</div>
                    <div>${esc(event.summary)}</div>
                    ${
                      event.generation !== null
                        ? `<span class="dim small">generation ${event.generation}</span>`
                        : ""
                    }
                  </div>
                </div>`
                )
                .join("")}
             </div>
             <div class="lab-note">${esc(timeline.note)}</div>`
          : empty("Nothing recorded yet.")
      )}

      ${card(
        `Reasoning calls (${runs.count})`,
        runs.count
          ? `<div style="overflow-x:auto">
              <table class="disc-table">
                <tr>
                  <th>Task</th><th>Prompt</th><th>Requested</th><th>Resolved</th>
                  <th>Status</th><th class="num">ms</th><th>When</th>
                </tr>
                ${runs.runs
                  .map(
                    (run) => `<tr class="${run.status === "ok" ? "" : "failed-run"}">
                      <td>${esc(run.task.replace(/_/g, " "))}</td>
                      <td class="dim">${esc(run.prompt_version)}</td>
                      <td class="mono small">${esc(run.requested_model)}</td>
                      <td class="mono small">${esc(run.resolved_model || "—")}</td>
                      <td>${
                        run.status === "ok"
                          ? `<span class="dim">ok</span>`
                          : `<span class="danger" title="${esc(run.error || "")}">${esc(run.status)}</span>`
                      }</td>
                      <td class="num">${run.latency_ms ?? "—"}</td>
                      <td class="dim small">${esc((run.at || "").replace("T", " ").slice(0, 19))}</td>
                    </tr>`
                  )
                  .join("")}
              </table>
             </div>
             <div class="lab-note">${esc(runs.note)}</div>`
          : empty("No reasoning calls recorded.")
      )}`;
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}
