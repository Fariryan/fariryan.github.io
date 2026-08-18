/**
 * Discovery Director shell.
 *
 * The same pattern as every added section: one entry point, the stylesheet
 * injected here rather than linked from index.html, and the selected campaign
 * held under its own localStorage key.
 */

import { esc, loading, notice } from "../ui.js";

export const SECTIONS = [
  {
    key: "campaigns",
    label: "Campaigns",
    icon: "▤",
    module: () => import("./views/campaigns.js"),
    view: "campaignsView",
    lede:
      "Start a campaign from a plain-language brief, or reopen one. The brief is kept verbatim; what the Director makes of it is an interpretation you approve.",
  },
  {
    key: "timeline",
    label: "Decision Timeline",
    icon: "⇢",
    module: () => import("./views/timeline.js"),
    view: "timelineView",
    lede:
      "Everything that happened, in order, with the reasoning attached. This is the campaign's memory — it outlives any conversation.",
  },
  {
    key: "hypotheses",
    label: "Hypotheses",
    icon: "◈",
    module: () => import("./views/hypotheses.js"),
    view: "hypothesesView",
    lede:
      "Falsifiable propositions scored on nine separate axes, each with the Critic's attempt to overturn it.",
  },
  {
    key: "review",
    label: "Review Queue",
    icon: "⚖",
    module: () => import("./views/review.js"),
    view: "reviewView",
    lede:
      "Decisions the AI recommends and a human makes. A pending item blocks the campaign in the backend, not only here.",
  },
  {
    key: "agents",
    label: "Agents & Audit",
    icon: "⁘",
    module: () => import("./views/agents.js"),
    view: "agentsView",
    lede:
      "What each specialist is allowed to do, and the provenance audit that checks whether it did.",
  },
];

const STYLESHEET = "css/director.css";
const CAMPAIGN_KEY = "neuroatlas.director.campaign";

function ensureStylesheet() {
  if (document.querySelector("link[data-director-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.directorStyle = "true";
  document.head.appendChild(link);
}

const listeners = new Set();

export const currentCampaign = {
  get() {
    try {
      return localStorage.getItem(CAMPAIGN_KEY) || null;
    } catch {
      return null;
    }
  },
  set(key) {
    try {
      localStorage.setItem(CAMPAIGN_KEY, key);
    } catch {
      /* a full or disabled localStorage must not break the interface */
    }
    listeners.forEach((listener) => listener(key));
  },
  clear() {
    try {
      localStorage.removeItem(CAMPAIGN_KEY);
    } catch {
      /* as above */
    }
    listeners.forEach((listener) => listener(null));
  },
  subscribe(listener) {
    listeners.add(listener);
    listener(this.get());
    return () => listeners.delete(listener);
  },
};

export async function directorView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "campaigns";
  const definition = SECTIONS.find((s) => s.key === key);

  const fromUrl = params?.get("campaign");
  if (fromUrl) currentCampaign.set(fromUrl);

  root.innerHTML = `
    <div class="dd-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/director/campaigns">Discovery Director</a> › ${esc(
            definition.label
          )}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
      <div class="spacer"></div>
      <div id="dd-campaign-chip"></div>
    </div>
    <nav class="dd-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/director/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="dd-body">${loading("Preparing…")}</div>
    <div class="disclaimer">
      <strong>The Director orchestrates; it does not calculate.</strong>
      Every number in a campaign comes from the chemical fabric, the property
      engine or the optimiser, and each is recorded as a tool call you can
      inspect. Agent prose is a language model's reasoning over that output —
      it is not evidence, and figures in it that no tool produced are flagged
      rather than shown as results. Research and education only; not medical
      advice.
    </div>
  `;

  renderCampaignChip(root.querySelector("#dd-campaign-chip"));

  const body = root.querySelector("#dd-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(
      `<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(
        error.message
      )}`,
      "danger",
      "⚠"
    );
    console.error(error);
  }
}

function renderCampaignChip(host) {
  if (!host) return;
  currentCampaign.subscribe((key) => {
    host.innerHTML = key
      ? `<div class="dd-campaign-chip">
           <div class="who">
             <div class="name mono">${esc(key)}</div>
             <div class="sub">selected campaign</div>
           </div>
           <button class="sm" id="dd-clear-campaign">Clear</button>
         </div>`
      : `<div class="dd-campaign-chip">
           <div class="who">
             <div class="name dim">No campaign selected</div>
             <div class="sub">Start one under Campaigns</div>
           </div>
         </div>`;
    host
      .querySelector("#dd-clear-campaign")
      ?.addEventListener("click", () => currentCampaign.clear());
  });
}

export function needsCampaign() {
  return notice(
    `Select or start a campaign under <a href="#/director/campaigns">Campaigns</a> first.`,
    "muted",
    "▤"
  );
}
