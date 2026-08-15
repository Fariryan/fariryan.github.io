/**
 * Campaigns: create one, or pick up an existing one.
 *
 * The creation form asks for a research goal and objectives before anything
 * else, because a campaign without them cannot judge whether any molecule is
 * an answer to anything — and the backend refuses one, so asking here is
 * honest rather than decorative.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { activeCampaign, discApi } from "../api.js";

export async function campaignsView(root) {
  root.innerHTML = loading("Loading campaigns…");

  const [status, listing] = await Promise.all([
    discApi.status(),
    discApi.campaigns({ limit: 50 }),
  ]);

  const objectives = status.objectives;
  const tiers = Object.keys(status.budget_tiers);

  root.innerHTML = `
    ${card(
      "New campaign",
      `<div class="disc-form">
        <label>Disease
          <input class="search-input" id="c-disease" placeholder="e.g. glioblastoma" />
        </label>
        <label>Subtype <span class="dim">(optional)</span>
          <input class="search-input" id="c-subtype" placeholder="e.g. EGFR-amplified" />
        </label>
        <label class="wide">Research goal
          <input class="search-input" id="c-goal"
                 placeholder="e.g. Identify brain-penetrant small-molecule candidates against a mechanistically justified vulnerability." />
        </label>
        <label>Compute budget
          <select id="c-budget">
            ${tiers.map((t) => `<option value="${esc(t)}" ${t === "standard" ? "selected" : ""}>${esc(t)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="disc-objectives">
        <div class="small dim mb">Objectives — what this campaign optimises for. Trade-offs stay visible; there is no single score.</div>
        ${objectives
          .map(
            (o) => `<label class="disc-objective">
              <input type="checkbox" value="${esc(o.key)}"
                     ${["target_activity", "bbb", "herg"].includes(o.key) ? "checked" : ""} />
              <span>${esc(o.label)}</span>
              <span class="dim small">${o.direction === "maximise" ? "↑ maximise" : "↓ minimise"}</span>
            </label>`
          )
          .join("")}
      </div>
      <div class="row mt">
        <button class="sm primary" id="c-create">Create campaign</button>
        <span id="c-status" class="small"></span>
      </div>`
    )}
    <div id="c-list"></div>`;

  renderList(root, listing);

  root.querySelector("#c-create").addEventListener("click", async () => {
    const statusHost = root.querySelector("#c-status");
    const disease = root.querySelector("#c-disease").value.trim();
    const goal = root.querySelector("#c-goal").value.trim();

    if (!disease || !goal) {
      statusHost.innerHTML = `<span class="dim">A disease and a research goal are both required.</span>`;
      return;
    }

    statusHost.innerHTML = "Creating…";
    try {
      const created = await discApi.createCampaign({
        disease_name: disease,
        subtype: root.querySelector("#c-subtype").value.trim() || null,
        research_goal: goal,
        budget_tier: root.querySelector("#c-budget").value,
        objectives: [...root.querySelectorAll(".disc-objective input:checked")].map(
          (input) => ({ key: input.value })
        ),
      });
      activeCampaign.set(created);
      window.location.hash = "#/discovery/overview";
    } catch (error) {
      statusHost.innerHTML = `<span class="danger">${esc(error.message)}</span>`;
    }
  });
}

function renderList(root, listing) {
  const host = root.querySelector("#c-list");
  if (!listing.count) {
    host.innerHTML = empty("No campaigns yet. Create one above to begin.");
    return;
  }

  const current = activeCampaign.get();
  host.innerHTML = card(
    `Campaigns (${listing.count})`,
    `<div class="disc-campaign-list">
      ${listing.campaigns
        .map((campaign) => {
          const summary = campaign.summary || {};
          return `<button class="disc-campaign-card ${
            current && current.id === campaign.id ? "active" : ""
          }" data-id="${campaign.id}">
            <div class="row">
              <span class="disc-campaign-code">${esc(campaign.code)}</span>
              <span class="disc-state">${esc(campaign.state.replace(/_/g, " "))}</span>
              <span class="spacer"></span>
              <span class="dim small">gen ${campaign.current_generation}</span>
            </div>
            <div class="disc-campaign-title">${esc(campaign.title)}</div>
            <div class="small dim">${esc(campaign.disease.name)}${
              campaign.disease.subtype ? ` · ${esc(campaign.disease.subtype)}` : ""
            }</div>
            <div class="disc-counts">
              <span>${summary.hypotheses ?? 0} hypotheses</span>
              <span>${summary.candidates ?? 0} candidates</span>
              <span>${summary.decisions ?? 0} decisions</span>
              ${summary.candidates_rejected
                ? `<span class="dim">${summary.candidates_rejected} rejected, kept</span>`
                : ""}
            </div>
          </button>`;
        })
        .join("")}
    </div>`
  );

  host.querySelectorAll("[data-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const campaign = listing.campaigns.find(
        (c) => String(c.id) === button.dataset.id
      );
      activeCampaign.set(campaign);
      window.location.hash = "#/discovery/overview";
    })
  );
}
