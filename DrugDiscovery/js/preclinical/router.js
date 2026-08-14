/**
 * Preclinical laboratory shell.
 *
 * The pipeline strip at the top is the navigation: a molecule moves left to
 * right through it, and each stage shows whether this deployment can actually
 * perform it. A stage that is not installed says so there, before the user
 * spends time configuring a run that cannot execute.
 */

import { esc, loading, notice } from "../ui.js";
import { pcApi } from "./api.js";
import { statusLegend } from "./ui.js";

export const SECTIONS = [
  {
    key: "molecule",
    label: "Molecule",
    module: () => import("./views/molecule.js"),
    view: "moleculeView",
    lede: "Structure in, validated and canonicalised, with real RDKit descriptors and identity resolved against PubChem and ChEMBL.",
  },
  {
    key: "insilico",
    label: "In Silico",
    module: () => import("./views/insilico.js"),
    view: "inSilicoView",
    lede: "Target, experimental or predicted structure, real AutoDock Vina docking, and real OpenMM dynamics.",
  },
  {
    key: "invitro",
    label: "In Vitro",
    module: () => import("./views/invitro.js"),
    view: "inVitroView",
    lede: "Disease-matched cell models, measured activity where it exists, and a mechanistic culture simulation in a 3D plate.",
  },
  {
    key: "invivo",
    label: "In Vivo Mouse",
    module: () => import("./views/invivo.js"),
    view: "inVivoView",
    lede: "Compartmental PK, target occupancy, Emax pharmacodynamics and tumour growth — every parameter carrying its provenance.",
  },
];

//: The pipeline as the brief describes it, mapped onto the capability keys the
//: status endpoint reports. Shown even for stages that are not built, because
//: the shape of the whole pipeline is information.
const PIPELINE = [
  { key: "molecule", label: "Molecule" },
  { key: "target", label: "Target" },
  { key: "structure", label: "Structure" },
  { key: "docking", label: "Docking" },
  { key: "molecular_dynamics", label: "Dynamics" },
  { key: "adme", label: "ADME" },
  { key: "bbb", label: "BBB" },
  { key: "cell_model", label: "Cell model" },
  { key: "in_vitro_measured", label: "Measured" },
  { key: "in_vitro_simulation", label: "Simulation" },
  { key: "mouse_model", label: "Mouse model" },
  { key: "mouse_pkpd", label: "Mouse PK/PD" },
];

/**
 * Inject both stylesheets this module needs.
 *
 * `lab.css` as well as its own: the preclinical views reuse Discovery Lab's
 * primitives — the tab strip, the note and disclaimer blocks, the job chip —
 * and already import its API client, so the dependency is real rather than
 * incidental. Duplicating those rules here would let the two drift.
 */
function ensureStylesheet() {
  for (const [href, marker] of [
    ["css/lab.css", "labStyle"],
    ["css/preclinical.css", "preclinicalStyle"],
  ]) {
    if (document.querySelector(`link[data-${marker.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}]`)) {
      continue;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset[marker] = "true";
    document.head.appendChild(link);
  }
}

let cachedStatus = null;

export async function preclinicalStatus() {
  if (!cachedStatus) cachedStatus = await pcApi.status();
  return cachedStatus;
}

export async function preclinicalView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "molecule";
  const definition = SECTIONS.find((s) => s.key === key);

  root.innerHTML = `
    <div class="page-head">
      <div class="breadcrumbs">
        <a href="#/preclinical/molecule">In Silico · In Vitro · In Vivo Mouse</a> ›
        ${esc(definition.label)}
      </div>
      <h2>${esc(definition.label)}</h2>
      <p class="lede">${esc(definition.lede)}</p>
    </div>
    <div id="pc-pipeline"></div>
    <nav class="lab-tabs">
      ${SECTIONS.map(
        (s) =>
          `<a href="#/preclinical/${s.key}" class="${s.key === key ? "active" : ""}">${esc(
            s.label
          )}</a>`
      ).join("")}
    </nav>
    <div id="pc-legend" class="mb"></div>
    <div id="pc-body">${loading("Checking what this server can compute…")}</div>
    <div class="lab-disclaimer">
      <strong>Nothing here is an experiment.</strong>
      Docking scores are scoring-function values, not binding affinities.
      Trajectories are short and their length is stated. Simulations are exactly
      as good as the parameters they were given, and assumed parameters are
      listed above every curve. Where a measurement does not exist, this
      interface says so rather than showing a number.
    </div>`;

  const body = root.querySelector("#pc-body");

  let status;
  try {
    status = await preclinicalStatus();
  } catch (error) {
    body.innerHTML = notice(
      `The preclinical API is not reachable: ${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  renderPipeline(root.querySelector("#pc-pipeline"), status);
  root.querySelector("#pc-legend").innerHTML = statusLegend(
    status.evidence_vocabulary
  );

  try {
    const module = await definition.module();
    await module[definition.view](body, params, status);
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

function renderPipeline(host, status) {
  const stages = status.stages || {};
  host.innerHTML = `<div class="pipeline">
    ${PIPELINE.map((entry) => {
      const stage = stages[entry.key] || {};
      let cls = "off";
      let state = "unavailable";
      if (stage.available) {
        cls = "ok";
        state = "ready";
      } else if (stage.implemented === false) {
        cls = "todo";
        state = "not built";
      }
      return `<div class="stage ${cls}" title="${esc(
        stage.note || stage.reason || stage.needs || ""
      )}">
        <div class="name">${esc(entry.label)}</div>
        <div class="state">${state}</div>
      </div>`;
    }).join("")}
  </div>`;
}

/** Shared: the molecule the whole pipeline is working on. */
const SUBJECT_KEY = "neuroatlas.preclinical.subject";

export const subject = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SUBJECT_KEY) || "null");
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem(SUBJECT_KEY, JSON.stringify(value));
    } catch {
      /* storage disabled; the session simply does not persist */
    }
  },
};

export function needsMolecule() {
  return notice(
    `Enter a molecule in the <a href="#/preclinical/molecule">Molecule</a>
     stage first — every stage after it works on that structure.`,
    "muted",
    "⌬"
  );
}
