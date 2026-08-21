/** Modality shell. */
import { esc, loading, notice } from "../ui.js";
const STYLESHEET = "css/modalities.css";

export const SECTIONS = [
  { key: "overview", label: "Modalities", icon: "◫",
    module: () => import("./views/overview.js"), view: "overviewView",
    lede: "Five modalities, each with its own representation — and, for each, the properties this platform refuses to compute because they would be meaningless. What a tool declines to calculate says more than what it calculates." },
  { key: "peptide", label: "Peptides", icon: "⌇",
    module: () => import("./views/peptide.js"), view: "peptideView",
    lede: "Sequence, cyclisation and modifications performed as real chemistry on the atomic graph — so a cyclised peptide is a different molecule, not a linear one wearing a label." },
  { key: "biologic", label: "Biologics", icon: "⑂",
    module: () => import("./views/biologic.js"), view: "biologicView",
    lede: "Proteins and antibodies as chains and domains. CDRs located from framework motifs, liability motifs flagged as motifs, and every small-molecule descriptor refused." },
  { key: "interface", label: "Interfaces", icon: "◑",
    module: () => import("./views/interface.js"), view: "interfaceView",
    lede: "Protein-protein interfaces computed from deposited coordinates. Contacts and buried surface are geometry; hotspots are a hypothesis, and the difference is stated on every one." },
  { key: "degrader", label: "Degraders", icon: "⚯",
    module: () => import("./views/degrader.js"), view: "degraderView",
    lede: "Target ligand — linker — E3 ligand, assembled into one real molecule and explored conformationally. No degradation efficiency is predicted, because none can be." },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-modalities-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = STYLESHEET;
  link.dataset.modalitiesStyle = "true";
  document.head.appendChild(link);
}

export async function modalitiesView(root, section, params) {
  ensureStylesheet();
  const key = SECTIONS.some((s) => s.key === section) ? section : "overview";
  const definition = SECTIONS.find((s) => s.key === key);
  root.innerHTML = `
    <div class="md9-head">
      <div>
        <div class="breadcrumbs"><a href="#/modalities/overview">Modalities</a> › ${esc(definition.label)}</div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="md9-tabs">
      ${SECTIONS.map((s) => `<a href="#/modalities/${s.key}" class="${s.key === key ? "active" : ""}">
        <span class="ico">${s.icon}</span>${esc(s.label)}</a>`).join("")}
    </nav>
    <div id="md9-body">${loading("Preparing…")}</div>`;
  const body = root.querySelector("#md9-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(`<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(error.message)}`, "danger", "⚠");
    console.error(error);
  }
}
