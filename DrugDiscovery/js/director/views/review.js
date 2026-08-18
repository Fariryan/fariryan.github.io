/**
 * The review queue — where a person decides.
 *
 * Each item states what the AI recommends, why, and what the reviewer should
 * weigh before deciding. The considerations are not decoration: they carry
 * the caveats that would otherwise be lost between the agent that produced
 * the recommendation and the person acting on it.
 *
 * Approving is not the same as agreeing that something is true. The wording
 * here says so, because a gate whose meaning is unclear gets clicked through.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { ddApi } from "../api.js";
import { currentCampaign, needsCampaign } from "../router.js";

export async function reviewView(host) {
  const key = currentCampaign.get();
  if (!key) {
    host.innerHTML = needsCampaign();
    return;
  }

  host.innerHTML = loading("Loading the review queue…");
  let approvals;
  let actions;
  try {
    [approvals, actions] = await Promise.all([
      ddApi.approvals(key),
      ddApi.nextActions(key),
    ]);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const pending = approvals.approvals.filter((a) => a.state === "pending");
  const decided = approvals.approvals.filter((a) => a.state !== "pending");

  host.innerHTML = `
    <p class="dim">${esc(approvals.note)}</p>
    ${
      pending.length
        ? pending.map(renderPending).join("")
        : card("Awaiting review", empty("Nothing is waiting on a decision."))
    }
    ${renderNextActions(actions)}
    ${decided.length ? renderDecided(decided) : ""}
  `;

  wireDecisions(host, key);
}

function renderPending(approval) {
  return card(
    `${approval.kind.replace(/_/g, " ")} <span class="dd-pill warn">pending</span>`,
    `
    <p class="dd-recommendation">${esc(approval.recommendation)}</p>

    ${
      approval.rationale
        ? `<div class="dd-reasoning">
             <div class="dd-reasoning-label">The reasoning behind it — a
               language model's, not a measurement</div>
             <p>${esc(approval.rationale)}</p>
           </div>`
        : ""
    }

    ${
      approval.considerations?.length
        ? `<div class="dd-considerations">
             <strong>Before you decide</strong>
             <ul>${approval.considerations
               .map((c) => `<li>${esc(c)}</li>`)
               .join("")}</ul>
           </div>`
        : ""
    }

    <form class="dd-decide" data-approval="${approval.id}">
      <label>Your name
        <input name="decided_by" type="text" required
          placeholder="Who is deciding?" />
      </label>
      <label>Note <span class="dim">optional, but this is what a reader sees later</span>
        <textarea name="note" rows="2"></textarea>
      </label>
      <div class="dd-decide-buttons">
        <button type="submit" value="approved" name="state" class="primary">Approve</button>
        <button type="submit" value="rejected" name="state" class="danger">Reject</button>
        <button type="submit" value="deferred" name="state">Defer</button>
      </div>
      <p class="dim">Approving makes this the campaign's working assumption.
        It does not make it true, and later evidence may overturn it.</p>
    </form>
    <div class="dd-decide-result"></div>
  `,
    "dd-approval"
  );
}

function renderNextActions(actions) {
  if (!actions.actions?.length) {
    return card(
      "What to test next",
      empty("No next action has been proposed yet.")
    );
  }

  const rows = actions.actions
    .map(
      (a) => `
      <tr class="${a.status === "superseded" ? "superseded" : ""}">
        <td>${esc(a.proposal)}<div class="dim">${esc(a.rationale)}</div></td>
        <td class="mono">${esc(a.action_type)}</td>
        <td>
          ${
            a.expected_information_gain != null
              ? `<div class="dd-gain">
                   <span style="width:${Math.round(
                     a.expected_information_gain * 100
                   )}%"></span>
                 </div>
                 <span class="mono">${a.expected_information_gain.toFixed(2)}</span>`
              : "—"
          }
          <div class="dim">${esc(a.information_gain_basis || "")}</div>
        </td>
        <td>${esc(a.cost_estimate || "not estimated")}</td>
        <td>${esc(a.status)}</td>
      </tr>`
    )
    .join("");

  return card(
    "What to test next",
    `<div class="table-wrap"><table class="dd-table">
       <thead><tr>
         <th>Proposal</th><th>Type</th><th>Information gain</th>
         <th>Cost</th><th>Status</th>
       </tr></thead>
       <tbody>${rows}</tbody>
     </table></div>
     <p class="dim">${esc(actions.note)}</p>`
  );
}

function renderDecided(decided) {
  const rows = decided
    .map(
      (a) => `
      <tr>
        <td>${esc(a.kind)}</td>
        <td>${esc(a.subject)}</td>
        <td><span class="dd-pill ${
          a.state === "approved" ? "ok" : a.state === "rejected" ? "danger" : ""
        }">${esc(a.state)}</span></td>
        <td>${esc(a.decided_by || "—")}</td>
        <td>${esc(a.reviewer_note || "—")}</td>
      </tr>`
    )
    .join("");

  return card(
    "Already decided",
    `<div class="table-wrap"><table class="dd-table">
       <thead><tr><th>Gate</th><th>Subject</th><th>Decision</th>
         <th>By</th><th>Note</th></tr></thead>
       <tbody>${rows}</tbody>
     </table></div>`
  );
}

function wireDecisions(host, key) {
  host.querySelectorAll(".dd-decide").forEach((form) => {
    const result = form.parentElement.querySelector(".dd-decide-result");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const state = event.submitter?.value;
      if (!state) return;

      const data = new FormData(form);
      result.innerHTML = loading("Recording…");
      try {
        await ddApi.decide(Number(form.dataset.approval), {
          state,
          decided_by: data.get("decided_by"),
          note: data.get("note") || null,
        });
        reviewView(host);
      } catch (error) {
        result.innerHTML = notice(esc(error.message), "danger", "⚠");
      }
    });
  });
}
