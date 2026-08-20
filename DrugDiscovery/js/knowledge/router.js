/**
 * Knowledge-layer shell.
 *
 * Same pattern as every module since Discovery Lab: one entry point, the
 * stylesheet injected here rather than linked from index.html, so adding this
 * section required no change to the page shell and no relaxation of the CSP.
 */

import { esc, loading, notice } from "../ui.js";

const STYLESHEET = "css/knowledge.css";

export const SECTIONS = [
  {
    key: "graph",
    label: "Knowledge Graph",
    icon: "⁘",
    module: () => import("./views/graph.js"),
    view: "graphView",
    lede:
      "Disease, gene, protein, target, pathway, structure, trial and publication, connected across sources. Every edge names the provider that asserted it; clicking a node opens its evidence.",
  },
  {
    key: "literature",
    label: "Literature Intelligence",
    icon: "📄",
    module: () => import("./views/literature.js"),
    view: "literatureView",
    lede:
      "Date-windowed retrieval from Europe PMC, retained with full metadata so a citation shown here stays checkable, and validated against Crossref on request.",
  },
  {
    key: "identifiers",
    label: "Identifiers",
    icon: "⌗",
    module: () => import("./views/identifiers.js"),
    view: "identifiersView",
    lede:
      "The namespaces this platform stores, and what any identifier you paste actually is. A display name is never an identity.",
  },
  {
    key: "sources",
    label: "Providers",
    icon: "🗄",
    module: () => import("./views/sources.js"),
    view: "sourcesView",
    lede:
      "The eight provider interfaces, their adapters, and whether each can currently run on this deployment.",
  },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-knowledge-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.knowledgeStyle = "true";
  document.head.appendChild(link);
}

export async function knowledgeView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "graph";
  const definition = SECTIONS.find((s) => s.key === key);

  root.innerHTML = `
    <div class="kb-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/knowledge/graph">Knowledge</a> › ${esc(definition.label)}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="kb-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/knowledge/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="kb-body">${loading("Preparing…")}</div>
  `;

  const body = root.querySelector("#kb-body");
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
