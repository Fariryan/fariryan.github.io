/**
 * The decision timeline — the campaign's memory.
 *
 * This page exists to answer one question six months later: *why did we
 * abandon that candidate?* So every entry carries its reasoning, and a
 * decision carries what was rejected alongside what was chosen. A record of
 * conclusions without their alternatives cannot answer "why not the other
 * thing?".
 *
 * Two distinctions are drawn visually rather than only in text: whether an
 * entry came from a person or a model, and whether a number in an entry
 * traces to a tool call. Both are load-bearing.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { ddApi } from "../api.js";
import { currentCampaign, needsCampaign } from "../router.js";

export async function timelineView(host) {
  const key = currentCampaign.get();
  if (!key) {
    host.innerHTML = needsCampaign();
    return;
  }

  host.innerHTML = loading("Loading the campaign's memory…");
  let data;
  try {
    data = await ddApi.timeline(key);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!data.events.length) {
    host.innerHTML = empty(
      "Nothing has happened in this campaign yet. Run a stage under Campaigns."
    );
    return;
  }

  host.innerHTML = `
    <p class="dim">${esc(data.note)}</p>
    <ol class="dd-timeline">
      ${data.events.map(renderEvent).join("")}
    </ol>
  `;

  host.querySelectorAll(".dd-tool-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.nextElementSibling;
      const open = panel.hasAttribute("hidden");
      panel.toggleAttribute("hidden", !open);
      button.textContent = open
        ? "Hide the tool calls"
        : `Show the ${button.dataset.count} tool call(s) behind this`;
    });
  });
}

function renderEvent(event) {
  if (event.type === "decision") return renderDecision(event);
  if (event.type === "approval") return renderApproval(event);
  return renderAgentRun(event);
}

function renderAgentRun(event) {
  const provenance = event.llm_provenance || {};
  const unsourced = event.unsourced_numbers || [];

  return `
    <li class="dd-event agent">
      <div class="dd-event-head">
        <span class="dd-badge agent">agent</span>
        <strong>${esc(event.agent)}</strong>
        <span class="mono dim">${esc(event.stage)} · cycle ${event.cycle}</span>
        <span class="spacer"></span>
        <time class="dim">${esc(event.at || "")}</time>
      </div>

      ${
        event.degraded
          ? notice(
              "No language model was reachable, so this agent's reasoning step " +
                "was not performed. Its tool calls, and every calculation they " +
                "produced, ran normally.",
              "warn",
              "◌"
            )
          : ""
      }
      ${event.error ? notice(esc(event.error), "danger", "⚠") : ""}

      ${
        unsourced.length
          ? notice(
              `<strong>${unsourced.length} number(s) in this agent's prose match no
               tool output:</strong> ${esc(unsourced.join(", "))}. They are shown
               because hiding them would teach nobody, and they are not results.`,
              "danger",
              "⚠"
            )
          : ""
      }

      ${
        event.reasoning
          ? `<div class="dd-reasoning">
               <div class="dd-reasoning-label">Reasoning — a language model's
                 words over the tool output below, not evidence</div>
               <p>${esc(event.reasoning)}</p>
             </div>`
          : ""
      }

      ${
        event.uncertainty
          ? `<p class="dd-uncertainty"><strong>Stated uncertainty:</strong>
             ${esc(event.uncertainty)}</p>`
          : ""
      }

      ${renderToolCalls(event.tool_calls || [])}

      <div class="dd-provenance dim">
        ${
          provenance.provider
            ? `Produced by <span class="mono">${esc(
                provenance.provider
              )}</span>${
                provenance.resolved_model
                  ? ` / <span class="mono">${esc(provenance.resolved_model)}</span>`
                  : ""
              }${
                provenance.is_measurement === false
                  ? " — a language model, not a measurement"
                  : ""
              }`
            : "No model was used for this step."
        }
      </div>
    </li>`;
}

function renderToolCalls(calls) {
  if (!calls.length) {
    return `<p class="dim">No scientific engine was called at this step.</p>`;
  }
  const rows = calls
    .map(
      (call) => `
      <tr class="${call.ok === false ? "failed" : ""}">
        <td class="mono">${esc(call.tool)}</td>
        <td>${esc(call.result_summary || "")}</td>
        <td class="mono">${
          call.produced_numbers?.length
            ? esc(
                call.produced_numbers.slice(0, 6).join(", ") +
                  (call.produced_numbers.length > 6
                    ? ` … ${call.produced_numbers.length} total`
                    : "")
              )
            : "—"
        }</td>
      </tr>`
    )
    .join("");

  return `
    <button class="link dd-tool-toggle" data-count="${calls.length}">
      Show the ${calls.length} tool call(s) behind this
    </button>
    <div class="dd-tool-calls" hidden>
      <table class="dd-table">
        <thead><tr><th>Engine</th><th>Returned</th><th>Numbers it produced</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="dim">Every figure this agent may legitimately state appears in
        the right-hand column. That is what makes a numeric claim traceable to
        the engine that computed it.</p>
    </div>`;
}

function renderDecision(event) {
  return `
    <li class="dd-event decision ${event.by_human ? "human" : ""}">
      <div class="dd-event-head">
        <span class="dd-badge decision">${
          event.by_human ? "human decision" : "AI decision"
        }</span>
        <strong>${esc(event.kind)}</strong>
        <span class="mono dim">${esc(event.subject)} · cycle ${event.cycle}</span>
        <span class="spacer"></span>
        <time class="dim">${esc(event.at || "")}</time>
      </div>
      <p>${esc(event.summary)}</p>
      <p class="dd-rationale"><strong>Why:</strong> ${esc(event.rationale)}</p>
      ${
        event.alternatives_rejected?.length
          ? `<div class="dd-rejected">
               <strong>What was rejected, and why:</strong>
               <ul>${event.alternatives_rejected
                 .map(
                   (alt) =>
                     `<li>${esc(
                       typeof alt === "string"
                         ? alt
                         : `${alt.option || ""} — ${alt.reason || ""}`
                     )}</li>`
                 )
                 .join("")}</ul>
             </div>`
          : `<p class="dim">No alternatives were recorded against this decision.</p>`
      }
      <div class="dim">Decided by <strong>${esc(event.decided_by)}</strong></div>
    </li>`;
}

function renderApproval(event) {
  const tone =
    event.state === "approved"
      ? "ok"
      : event.state === "rejected"
      ? "danger"
      : "warn";
  return `
    <li class="dd-event approval">
      <div class="dd-event-head">
        <span class="dd-badge approval">gate</span>
        <strong>${esc(event.kind)}</strong>
        <span class="dd-pill ${tone}">${esc(event.state)}</span>
        <span class="mono dim">${esc(event.subject)}</span>
        <span class="spacer"></span>
        <time class="dim">${esc(event.at || "")}</time>
      </div>
      <p>${esc(event.recommendation)}</p>
      ${
        event.decided_by
          ? `<div class="dim">Decided by <strong>${esc(
              event.decided_by
            )}</strong>${
              event.reviewer_note ? ` — ${esc(event.reviewer_note)}` : ""
            }</div>`
          : `<div class="dim">Awaiting a human decision.</div>`
      }
    </li>`;
}
