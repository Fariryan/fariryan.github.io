/** Chemical Gradient Optimizer shell. */
import { esc, loading, notice } from "../ui.js";
const STYLESHEET = "css/optimizer.css";

export const SECTIONS = [
  { key: "design", label: "Design Run", icon: "◇",
    module: () => import("./views/design.js"), view: "designView",
    lede: "Start from a real molecule, declare what you are optimising and what you will not cross, and preview exactly which transformations would be applied before committing to a search." },
  { key: "candidates", label: "Candidates", icon: "▦",
    module: () => import("./views/candidates.js"), view: "candidatesView",
    lede: "Every structure the search produced, including the ones it rejected — each with its descriptors, its predictions, its provenance and the transformation that made it." },
  { key: "pareto", label: "Pareto Front", icon: "◈",
    module: () => import("./views/pareto.js"), view: "paretoView",
    lede: "The trade-off surface. No objective is collapsed into a single score, so there is no one best candidate — there is a front, and the choice between its members is yours." },
  { key: "lineage", label: "Lineage", icon: "⑂",
    module: () => import("./views/lineage.js"), view: "lineageView",
    lede: "The evolution tree. Click any edge to see the structural change, why it was made, what each objective was before and after, and what the move cost." },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-optimizer-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = STYLESHEET;
  link.dataset.optimizerStyle = "true";
  document.head.appendChild(link);
}

export async function optimizerView(root, section, params) {
  ensureStylesheet();
  const key = SECTIONS.some((s) => s.key === section) ? section : "design";
  const definition = SECTIONS.find((s) => s.key === key);
  root.innerHTML = `
    <div class="opt-head">
      <div>
        <div class="breadcrumbs"><a href="#/optimizer/design">Chemical Gradient Optimizer</a> › ${esc(definition.label)}</div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="opt-tabs">
      ${SECTIONS.map((s) => `<a href="#/optimizer/${s.key}" class="${s.key === key ? "active" : ""}">
        <span class="ico">${s.icon}</span>${esc(s.label)}</a>`).join("")}
    </nav>
    <div id="opt-body">${loading("Preparing…")}</div>`;
  const body = root.querySelector("#opt-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(`<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(error.message)}`, "danger", "⚠");
    console.error(error);
  }
}
