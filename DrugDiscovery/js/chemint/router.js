/**
 * Chemical Intelligence shell.
 *
 * One entry point for every section, following exactly the pattern Discovery
 * Lab established: the stylesheet is injected here rather than linked from
 * index.html, so adding this whole section required no change to the page
 * shell at all.
 *
 * The selected molecule lives in localStorage under its own key, so this
 * section never touches the atlas's comparison tray or the lab's subject.
 */

import { esc, loading, notice } from "../ui.js";
import { chemApi } from "./api.js";
import { ciDisclaimer } from "./ui.js";

export const SECTIONS = [
  {
    key: "search",
    label: "Search",
    icon: "⌕",
    module: () => import("./views/search.js"),
    view: "searchView",
    lede:
      "Find any ingested molecule by name, brand, registry identifier, InChIKey or structure — across every therapeutic area, not only neuroscience.",
  },
  {
    key: "molecule",
    label: "Molecule",
    icon: "⌬",
    module: () => import("./views/molecule.js"),
    view: "moleculeView",
    lede:
      "One substance in full: identity, structure in 2D and 3D, targets, mechanisms, indications, assays, properties, clinical status and provenance.",
  },
  {
    key: "neighborhood",
    label: "Chemical Neighborhood",
    icon: "◎",
    module: () => import("./views/neighborhood.js"),
    view: "neighborhoodView",
    lede:
      "Chemically similar compounds, each labelled with what it actually is — approved drug, clinical candidate, experimental compound, metabolite, or computational candidate.",
  },
  {
    key: "scaffolds",
    label: "Scaffolds",
    icon: "⬡",
    module: () => import("./views/scaffolds.js"),
    view: "scaffoldsView",
    lede:
      "Chemical series by Bemis–Murcko scaffold. A scaffold is a chemical fact, so its members routinely span therapeutic areas.",
  },
  {
    key: "evidence",
    label: "Evidence",
    icon: "⚖",
    module: () => import("./views/evidence.js"),
    view: "evidenceView",
    lede:
      "Claims with their supporting and contradicting evidence, classified by what produced each one rather than by how much it is believed.",
  },
  {
    key: "sources",
    label: "Sources & Coverage",
    icon: "🗄",
    module: () => import("./views/sources.js"),
    view: "sourcesView",
    lede:
      "Every source, its licence, its refresh strategy, and — where a source is not freely available — exactly why not and what would enable it.",
  },
];

const STYLESHEET = "css/chemint.css";
const SUBJECT_KEY = "neuroatlas.chemint.subject";

/** Inject the stylesheet once, relatively so it works under any base path. */
function ensureStylesheet() {
  if (document.querySelector("link[data-chemint-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.chemintStyle = "true";
  document.head.appendChild(link);
}

/* ------------------------------------------------------------- subject */

const listeners = new Set();

export const subject = {
  get() {
    try {
      const raw = localStorage.getItem(SUBJECT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem(SUBJECT_KEY, JSON.stringify(value));
    } catch {
      /* a full or disabled localStorage must not break the interface */
    }
    listeners.forEach((listener) => listener(value));
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

let cachedVocabulary = null;

export async function vocabulary() {
  if (!cachedVocabulary) cachedVocabulary = await chemApi.vocabulary();
  return cachedVocabulary;
}

/** Therapeutic-area key → label, from the server's own vocabulary. */
export async function areaLabels() {
  const vocab = await vocabulary();
  return Object.fromEntries(
    (vocab.therapeutic_areas || []).map((a) => [a.key, a.label])
  );
}

/* -------------------------------------------------------------- routing */

/**
 * Render one Chemical Intelligence section.
 *
 * @param {HTMLElement} root    the atlas's content element
 * @param {string} section      section key from the hash route
 * @param {URLSearchParams} params
 */
export async function chemintView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "search";
  const definition = SECTIONS.find((s) => s.key === key);

  // An entity id in the URL always wins, so a link from anywhere lands on the
  // molecule it names rather than on whatever was last selected.
  const entityId = params?.get("entity");
  if (entityId) {
    const current = subject.get();
    if (!current || String(current.entity_id) !== String(entityId)) {
      try {
        const dossier = await chemApi.substance(Number(entityId));
        subject.set({
          entity_id: dossier.entity.entity_id,
          name: dossier.entity.name,
          entity_type: dossier.entity.entity_type,
          inchikey: dossier.identity?.inchikey || null,
          smiles: dossier.identity?.isomeric_smiles || null,
        });
      } catch (error) {
        console.warn("could not resolve chemint subject", error);
      }
    }
  }

  root.innerHTML = `
    <div class="ci-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/chemint/search">Chemical Intelligence</a> › ${esc(
            definition.label
          )}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
      <div class="spacer"></div>
      <div id="ci-subject-host"></div>
    </div>
    <nav class="ci-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/chemint/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="ci-body">${loading("Preparing…")}</div>
    ${ciDisclaimer}
  `;

  renderSubjectChip(root.querySelector("#ci-subject-host"));

  const body = root.querySelector("#ci-body");
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

/** The selected molecule, visible in every section. */
function renderSubjectChip(host) {
  if (!host) return;

  subject.subscribe((value) => {
    host.innerHTML = value
      ? `<div class="ci-subject">
           <div class="who">
             <div class="name">${esc(value.name)}</div>
             <div class="sub">${esc(value.entity_type || "molecule")}${
               value.inchikey ? ` · ${esc(value.inchikey)}` : ""
             }</div>
           </div>
           <a class="sm" href="#/chemint/molecule?entity=${esc(
             String(value.entity_id)
           )}">Open</a>
           <button class="sm" id="ci-clear-subject">Clear</button>
         </div>`
      : `<div class="ci-subject">
           <div class="who">
             <div class="name dim">No molecule selected</div>
             <div class="sub">Search for one to begin</div>
           </div>
         </div>`;

    host
      .querySelector("#ci-clear-subject")
      ?.addEventListener("click", () => subject.clear());
  });
}

/** Shared empty state: nothing selected yet. */
export function needsSubject(what = "this view") {
  return notice(
    `Select a molecule to use ${esc(what)}. Use
     <a href="#/chemint/search">Search</a> to find one.`,
    "muted",
    "⌬"
  );
}
