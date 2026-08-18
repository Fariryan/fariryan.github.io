/**
 * Campaigns: start one, pick one, drive the loop.
 *
 * The advance control is deliberately a step, not a "run": the campaign moves
 * a stage or three at a time and stops at any gate. There is no button that
 * runs a whole campaign unattended, because the gates exist to be hit.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { ddApi } from "../api.js";
import { currentCampaign } from "../router.js";

export async function campaignsView(host) {
  host.innerHTML = loading("Loading campaigns…");

  let status;
  let list;
  try {
    [status, list] = await Promise.all([
      ddApi.status(),
      ddApi.listCampaigns(50),
    ]);
  } catch (error) {
    host.innerHTML = notice(
      `<strong>The Director is unavailable.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  host.innerHTML = `
    ${renderProviderBanner(status)}
    <div class="dd-grid">
      <div>${renderNewCampaign()}</div>
      <div>${renderCampaignList(list)}</div>
    </div>
    <div id="dd-selected"></div>
  `;

  wireNewCampaign(host);
  wireList(host);
  renderSelected(host.querySelector("#dd-selected"));
}

function renderProviderBanner(status) {
  const providers = status.providers || {};
  const rows = (providers.providers || [])
    .map(
      (p) => `<li>
        <span class="dd-dot ${p.available ? "ok" : "off"}"></span>
        <strong>${esc(p.name)}</strong>
        <span class="dim">(${esc(p.deployment)})</span>
        ${
          p.available
            ? ""
            : `<span class="dim"> — ${esc(p.unavailable_reason || "unavailable")}</span>`
        }
      </li>`
    )
    .join("");

  const degraded = providers.degraded;
  return `
    <div class="dd-provider ${degraded ? "warn" : ""}">
      <div class="hd">
        <strong>Reasoning provider:</strong>
        <span class="mono">${esc(providers.active_name || "none")}</span>
        ${degraded ? '<span class="dd-pill warn">degraded</span>' : ""}
      </div>
      <ul class="dd-provider-list">${rows}</ul>
      <p class="dim">${esc(providers.note || "")}</p>
    </div>
  `;
}

function renderNewCampaign() {
  return card(
    "Start a campaign",
    `
    <form id="dd-new" class="dd-form">
      <label>Brief
        <textarea name="brief" rows="5" required
          placeholder="Describe the research problem in your own words. For example: find a brain-penetrant inhibitor of LRRK2 with better solubility than the current clinical compounds."></textarea>
      </label>
      <div class="dd-form-row">
        <label>Disease <span class="dim">optional</span>
          <input name="disease" type="text" />
        </label>
        <label>Target <span class="dim">optional</span>
          <input name="target" type="text" />
        </label>
      </div>
      <button type="submit" class="primary">Create campaign</button>
      <p class="dim">
        Your brief is stored word for word. The structured objectives the
        Director derives from it are an interpretation, and the campaign will
        ask you to approve them before acting on them.
      </p>
    </form>
    <div id="dd-new-result"></div>
  `
  );
}

function renderCampaignList(list) {
  if (!list.campaigns?.length) {
    return card("Campaigns", empty("No campaign has been started yet."));
  }
  const rows = list.campaigns
    .map(
      (c) => `
      <tr data-campaign="${esc(c.campaign)}">
        <td><button class="link dd-pick" data-key="${esc(c.campaign)}">${esc(
          c.campaign
        )}</button><div class="dim">${esc(c.name)}</div></td>
        <td>${esc(c.disease || "—")}</td>
        <td>${esc(c.target || "—")}</td>
        <td><span class="dd-pill ${stateTone(c.state)}">${esc(
          c.state
        )}</span></td>
        <td class="mono">${esc(c.current_stage)}</td>
        <td>${c.cycle}</td>
      </tr>`
    )
    .join("");

  return card(
    "Campaigns",
    `<div class="table-wrap"><table class="dd-table">
      <thead><tr>
        <th>Campaign</th><th>Disease</th><th>Target</th>
        <th>State</th><th>Stage</th><th>Cycle</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`
  );
}

function stateTone(state) {
  if (state === "awaiting_approval") return "warn";
  if (state === "completed") return "ok";
  if (state === "active") return "info";
  return "";
}

function wireNewCampaign(host) {
  const form = host.querySelector("#dd-new");
  const result = host.querySelector("#dd-new-result");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    result.innerHTML = loading("Creating…");
    try {
      const created = await ddApi.createCampaign({
        brief: data.get("brief"),
        disease: data.get("disease") || null,
        target: data.get("target") || null,
      });
      currentCampaign.set(created.campaign);
      result.innerHTML = notice(
        `<strong>${esc(created.campaign)} created.</strong> ${esc(
          created.note
        )}`,
        "ok",
        "✓"
      );
      renderSelected(host.querySelector("#dd-selected"));
    } catch (error) {
      result.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

function wireList(host) {
  host.querySelectorAll(".dd-pick").forEach((button) => {
    button.addEventListener("click", () => {
      currentCampaign.set(button.dataset.key);
      renderSelected(host.querySelector("#dd-selected"));
    });
  });
}

async function renderSelected(host) {
  if (!host) return;
  const key = currentCampaign.get();
  if (!key) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = loading("Loading campaign…");
  let campaign;
  try {
    campaign = await ddApi.getCampaign(key);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = card(
    `${campaign.campaign} — ${campaign.name}`,
    `
    <div class="dd-stats">
      <div><span class="v">${esc(campaign.current_stage)}</span><span class="l">stage</span></div>
      <div><span class="v">${campaign.cycle}</span><span class="l">cycle</span></div>
      <div><span class="v">${campaign.evidence_count}</span><span class="l">evidence rows</span></div>
      <div><span class="v">${campaign.hypotheses.length}</span><span class="l">hypotheses</span></div>
    </div>

    <p class="dd-brief"><strong>Brief, verbatim:</strong> ${esc(campaign.brief)}</p>

    ${
      campaign.blocked_because
        ? notice(
            `<strong>The loop is blocked.</strong> ${esc(
              campaign.blocked_because
            )}`,
            "warn",
            "⏸"
          )
        : ""
    }

    ${renderObjectives(campaign)}

    <div class="dd-actions">
      <button class="primary" id="dd-advance-1">Run next stage</button>
      <button id="dd-advance-3">Run up to 3 stages</button>
      <a class="btn" href="#/director/timeline">Open timeline</a>
      ${
        campaign.pending_approvals.length
          ? `<a class="btn warn" href="#/director/review">${campaign.pending_approvals.length} awaiting review</a>`
          : ""
      }
    </div>
    <div id="dd-advance-result"></div>
  `
  );

  const result = host.querySelector("#dd-advance-result");
  const run = async (stages) => {
    result.innerHTML = loading(
      `Running ${stages === 1 ? "one stage" : `up to ${stages} stages`}…`
    );
    try {
      const outcome = await ddApi.advance(key, stages);
      result.innerHTML = renderAdvanceOutcome(outcome);
      renderSelected(host);
    } catch (error) {
      result.innerHTML = notice(esc(error.message), "warn", "⏸");
    }
  };
  host.querySelector("#dd-advance-1")?.addEventListener("click", () => run(1));
  host.querySelector("#dd-advance-3")?.addEventListener("click", () => run(3));
}

function renderObjectives(campaign) {
  if (!campaign.objectives?.length) {
    return `<p class="dim">No objectives have been derived yet. They appear
      after the campaign's first stage and require approval before the
      optimiser runs.</p>`;
  }
  return `
    <div class="dd-objectives">
      <strong>Derived objectives</strong>
      <span class="dim"> — an interpretation of the brief, pending approval</span>
      <ul>
        ${campaign.objectives
          .map(
            (o) =>
              `<li><span class="mono">${esc(o.property_key)}</span> —
               ${esc(o.direction)}${
                o.threshold != null
                  ? ` past <span class="mono">${esc(String(o.threshold))}</span>`
                  : ""
              }</li>`
          )
          .join("")}
      </ul>
    </div>`;
}

function renderAdvanceOutcome(outcome) {
  const stages = (outcome.stages_run || [])
    .map((stage) => {
      const agents = (stage.agents || [])
        .map(
          (a) => `<li>
            <strong>${esc(a.name)}</strong>
            ${a.degraded ? '<span class="dd-pill warn">no model</span>' : ""}
            ${
              a.unsourced_numbers?.length
                ? `<span class="dd-pill danger">${a.unsourced_numbers.length} unsourced number(s)</span>`
                : ""
            }
            ${a.error ? `<span class="dd-pill danger">error</span>` : ""}
            <div class="dim">${a.tool_calls} tool call(s)${
            a.uncertainty ? ` — ${esc(a.uncertainty)}` : ""
          }</div>
          </li>`
        )
        .join("");
      return `<li><span class="mono">${esc(
        stage.stage
      )}</span><ul class="dd-agent-lines">${agents}</ul></li>`;
    })
    .join("");

  return `
    <div class="dd-outcome">
      <strong>Ran ${outcome.stages_run.length} stage(s).</strong>
      Now at <span class="mono">${esc(outcome.current_stage)}</span>,
      cycle ${outcome.cycle}, state <span class="mono">${esc(
    outcome.state
  )}</span>.
      ${
        outcome.degraded
          ? '<span class="dd-pill warn">no language model — reasoning steps were skipped, calculations were not</span>'
          : ""
      }
      <ul class="dd-stage-lines">${stages}</ul>
      ${
        outcome.stopped_because
          ? notice(esc(outcome.stopped_because), "warn", "⏸")
          : ""
      }
    </div>`;
}
