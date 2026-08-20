/**
 * Therapeutic-area shell.
 *
 * One entry point for both sections, following exactly the pattern Discovery
 * Lab and Chemical Intelligence established: the stylesheet is injected here
 * rather than linked from index.html, so adding this whole section required no
 * change to the page shell and no relaxation of the Content-Security-Policy.
 */

import { esc, loading, notice } from "../ui.js";

const STYLESHEET = "css/areas.css";

export const SECTIONS = [
  {
    key: "select",
    label: "Select Area",
    icon: "◈",
    module: () => import("./views/select.js"),
    view: "selectView",
    lede:
      "Choose the therapeutic area, then the disease. One shared discovery engine serves every area — the area configures it, it does not fork it.",
  },
  {
    key: "workspace",
    label: "Disease Workspace",
    icon: "▤",
    module: () => import("./views/workspace.js"),
    view: "workspaceView",
    lede:
      "Every line of evidence retrieved for one disease, each section carrying the source it came from and the status of that retrieval.",
  },
];

function ensureStylesheet() {
  if (document.querySelector("link[data-areas-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.areasStyle = "true";
  document.head.appendChild(link);
}

/**
 * @param {HTMLElement} root
 * @param {string} section      section key from the hash route
 * @param {URLSearchParams} params
 */
export async function areasView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "select";
  const definition = SECTIONS.find((s) => s.key === key);

  root.innerHTML = `
    <div class="ta-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/areas/select">Therapeutic Areas</a> › ${esc(definition.label)}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="ta-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/areas/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="ta-body">${loading("Preparing…")}</div>
  `;

  const body = root.querySelector("#ta-body");
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

export { ensureStylesheet };
