/** Molecular-dynamics shell. */
import { esc, loading, notice } from "../ui.js";
const STYLESHEET = "css/md.css";

export const SECTIONS = [
  { key: "runs", label: "Simulations", icon: "◉",
    module: () => import("./views/runs.js"), view: "runsView",
    lede: "Staged OpenMM simulations — preparation, solvation, minimisation, NVT, NPT, production — with every parameter, the energy trace and the trajectory analysis." },
  { key: "free-energy", label: "Free Energy", icon: "⇌",
    module: () => import("./views/freeenergy.js"), view: "freeEnergyView",
    lede: "Alchemical transformation networks. Whether a ΔΔG can actually be computed on this deployment is stated plainly; none is ever estimated." },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-md-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = STYLESHEET;
  link.dataset.mdStyle = "true";
  document.head.appendChild(link);
}

export async function mdView(root, section, params) {
  ensureStylesheet();
  const key = SECTIONS.some((s) => s.key === section) ? section : "runs";
  const definition = SECTIONS.find((s) => s.key === key);
  root.innerHTML = `
    <div class="md-head">
      <div>
        <div class="breadcrumbs"><a href="#/md/runs">Molecular Dynamics</a> › ${esc(definition.label)}</div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="md-tabs">
      ${SECTIONS.map((s) => `<a href="#/md/${s.key}" class="${s.key === key ? "active" : ""}">
        <span class="ico">${s.icon}</span>${esc(s.label)}</a>`).join("")}
    </nav>
    <div id="md-body">${loading("Preparing…")}</div>`;
  const body = root.querySelector("#md-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(`<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(error.message)}`, "danger", "⚠");
    console.error(error);
  }
}
