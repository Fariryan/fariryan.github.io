/**
 * Property Intelligence shell.
 *
 * Same pattern as Discovery Lab and Chemical Intelligence: one entry point,
 * the stylesheet injected here rather than linked from index.html, and the
 * selected structure held under its own localStorage key so this section
 * never disturbs any other.
 *
 * The structure is a *SMILES*, not an entity id, because this engine profiles
 * molecules that do not exist in any database — which is the whole point of
 * it, and what Phase 3's generated candidates will rely on.
 */

import { esc, loading, notice } from "../ui.js";
import { propApi } from "./api.js";
import { piDisclaimer } from "./ui.js";

export const SECTIONS = [
  {
    key: "profile",
    label: "Property Profile",
    icon: "◈",
    module: () => import("./views/profile.js"),
    view: "profileView",
    lede:
      "A three-level profile for any structure — known drug or molecule nobody has made. Calculations, predictions with their model cards, and measured activity, kept strictly apart.",
  },
  {
    key: "liabilities",
    label: "Liability Map",
    icon: "⚠",
    module: () => import("./views/liabilities.js"),
    view: "liabilitiesView",
    lede:
      "Safety and developability liabilities, with what is predicted, what is merely flagged, and what has no model at all shown as three different things.",
  },
  {
    key: "compare",
    label: "Reference Comparison",
    icon: "⇄",
    module: () => import("./views/compare.js"),
    view: "compareView",
    lede:
      "How a candidate differs from known drugs, with percentages shown only where the property's measurement scale makes one meaningful.",
  },
  {
    key: "models",
    label: "Model Registry",
    icon: "▤",
    module: () => import("./views/models.js"),
    view: "modelsView",
    lede:
      "Every model in the engine, its training data, its measured or published performance, and — for the properties with no model — exactly what would enable one.",
  },
];

const STYLESHEET = "css/propintel.css";
const SUBJECT_KEY = "neuroatlas.propintel.structure";

function ensureStylesheet() {
  if (document.querySelector("link[data-propintel-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.propintelStyle = "true";
  document.head.appendChild(link);
}

const listeners = new Set();

export const structure = {
  get() {
    try {
      return localStorage.getItem(SUBJECT_KEY) || null;
    } catch {
      return null;
    }
  },
  set(smiles) {
    try {
      localStorage.setItem(SUBJECT_KEY, smiles);
    } catch {
      /* a full or disabled localStorage must not break the interface */
    }
    listeners.forEach((listener) => listener(smiles));
  },
  clear() {
    localStorage.removeItem(SUBJECT_KEY);
    listeners.forEach((listener) => listener(null));
  },
  subscribe(listener) {
    listeners.add(listener);
    listener(this.get());
    return () => listeners.delete(listener);
  },
};

/** A handful of real drugs, so the section is usable on first visit. */
export const EXAMPLES = [
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { name: "Diazepam", smiles: "CN1c2ccc(Cl)cc2C(c2ccccc2)=NCC1=O" },
  { name: "Atorvastatin", smiles: "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CC[C@@H](O)C[C@@H](O)CC(=O)O" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Terfenadine", smiles: "CC(C)(C)c1ccc(C(O)CCCN2CCC(C(O)(c3ccccc3)c3ccccc3)CC2)cc1" },
  { name: "Morphine", smiles: "CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5" },
];

export async function propintelView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "profile";
  const definition = SECTIONS.find((s) => s.key === key);

  const fromUrl = params?.get("smiles");
  if (fromUrl) structure.set(fromUrl);

  root.innerHTML = `
    <div class="pi-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/propintel/profile">Property Intelligence</a> › ${esc(
            definition.label
          )}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="pi-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/propintel/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="pi-input"></div>
    <div id="pi-body">${loading("Preparing…")}</div>
    ${piDisclaimer}
  `;

  renderInput(root.querySelector("#pi-input"), key);

  const body = root.querySelector("#pi-body");
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

/** The structure input, shared by every section that needs one. */
function renderInput(host, section) {
  if (!host || section === "models") return;

  const current = structure.get() || "";
  host.innerHTML = `
    <div class="pi-input-row">
      <input id="pi-smiles" class="search-input" type="text" spellcheck="false"
             placeholder="Paste a SMILES — a known drug or a structure nobody has made"
             value="${esc(current)}" />
      <button class="primary" id="pi-run">Profile</button>
    </div>
    <div class="pi-examples">
      <span class="dim small">Try:</span>
      ${EXAMPLES.map(
        (example) =>
          `<button class="pi-example sm" data-smiles="${esc(
            example.smiles
          )}">${esc(example.name)}</button>`
      ).join("")}
    </div>`;

  const input = host.querySelector("#pi-smiles");
  const run = () => {
    const value = input.value.trim();
    if (!value) return;
    structure.set(value);
    // Re-render the active section against the new structure.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  host.querySelector("#pi-run").addEventListener("click", run);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") run();
  });
  host.querySelectorAll(".pi-example").forEach((button) =>
    button.addEventListener("click", () => {
      input.value = button.dataset.smiles;
      run();
    })
  );
}

export function needsStructure() {
  return notice(
    `Paste a SMILES above, or pick one of the examples, to profile it.`,
    "muted",
    "⌬"
  );
}
