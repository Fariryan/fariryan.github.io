/** Docking shell. Same additive pattern as every module since Discovery Lab. */

import { esc, loading, notice } from "../ui.js";

const STYLESHEET = "css/docking.css";

export const SECTIONS = [
  {
    key: "run",
    label: "Dock & Screen",
    icon: "⊕",
    module: () => import("./views/run.js"),
    view: "runView",
    lede:
      "Choose a receptor, define the binding site, and dock one ligand or many. Screening runs asynchronously — the campaign id comes back immediately.",
  },
  {
    key: "campaigns",
    label: "Campaigns",
    icon: "▤",
    module: () => import("./views/campaigns.js"),
    view: "campaignsView",
    lede:
      "Every campaign this deployment has run, with its receptor, its box, its parameters and its seed — the things a docking score needs in order to be reproducible.",
  },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-docking-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.dockingStyle = "true";
  document.head.appendChild(link);
}

export async function dockingView(root, section, params) {
  ensureStylesheet();
  const key = SECTIONS.some((s) => s.key === section) ? section : "run";
  const definition = SECTIONS.find((s) => s.key === key);

  root.innerHTML = `
    <div class="dk-head">
      <div>
        <div class="breadcrumbs"><a href="#/docking/run">Docking</a> › ${esc(definition.label)}</div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="dk-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/docking/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="dk-body">${loading("Preparing…")}</div>`;

  const body = root.querySelector("#dk-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(
      `<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    console.error(error);
  }
}
