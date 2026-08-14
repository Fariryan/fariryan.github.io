/**
 * Discovery Lab shell.
 *
 * One entry point for every lab section. The shell owns three things the
 * sections share: the selected subject, the sub-navigation, and the stylesheet
 * — which is injected here rather than linked from index.html, so adding
 * Discovery Lab required no change to the atlas's page shell at all.
 */

import { esc, loading, notice } from "../ui.js";
import { labApi } from "./api.js";
import { subjectStore, workbench } from "./store.js";
import { labDisclaimer } from "./ui.js";

export const SECTIONS = [
  {
    key: "radar",
    label: "Research Radar",
    icon: "◎",
    module: () => import("./views/radar.js"),
    view: "radarView",
    lede: "Literature published in the rolling six-month window, with what is new in it and what the search actually covered.",
  },
  {
    key: "graph",
    label: "Evidence Graph",
    icon: "⁘",
    module: () => import("./views/graph.js"),
    view: "graphView",
    lede: "Curated relationships and literature-derived statements in one graph, each edge carrying its own provenance.",
  },
  {
    key: "designer",
    label: "Molecule Designer",
    icon: "⚗",
    module: () => import("./views/designer.js"),
    view: "designerView",
    lede: "Named medicinal-chemistry transformations, real descriptors, and multi-objective ranking that shows the trade-off instead of hiding it.",
  },
  {
    key: "molecular3d",
    label: "3D Molecular Lab",
    icon: "⬢",
    module: () => import("./views/mol3d.js"),
    view: "mol3dView",
    lede: "Conformer ensembles generated with ETKDG and minimised, with energies and RMSD.",
  },
  {
    key: "bbb",
    label: "BBB Lab",
    icon: "◐",
    module: () => import("./views/bbb.js"),
    view: "bbbView",
    lede: "Measured blood–brain-barrier data where it exists, a trained classifier where it does not, and an animation driven by those numbers.",
  },
  {
    key: "target",
    label: "Target & Binding Lab",
    icon: "🎯",
    module: () => import("./views/target.js"),
    view: "targetView",
    lede: "Experimental structures, structures released inside the window, predicted models, and observed ligands.",
  },
  {
    key: "gaps",
    label: "Gap Finder",
    icon: "◌",
    module: () => import("./views/gaps.js"),
    view: "gapsView",
    lede: "Where the evidence runs out — each finding with the full reasoning trace behind it.",
  },
  {
    key: "workbench",
    label: "Candidate Workbench",
    icon: "▤",
    module: () => import("./views/workbench.js"),
    view: "workbenchView",
    lede: "Saved candidates, compared across every computed property, exportable with their provenance.",
  },
];

const STYLESHEET = "css/lab.css";

/** Inject the lab stylesheet once, relative so it works under any base path. */
function ensureStylesheet() {
  if (document.querySelector(`link[data-lab-style]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.labStyle = "true";
  document.head.appendChild(link);
}

let cachedStatus = null;

export async function labStatus() {
  if (!cachedStatus) cachedStatus = await labApi.status();
  return cachedStatus;
}

/**
 * Render one lab section.
 *
 * @param {HTMLElement} root  the atlas's content element
 * @param {string} section    section key from the hash route
 * @param {URLSearchParams} params
 */
export async function labView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "radar";
  const definition = SECTIONS.find((s) => s.key === key);

  // A node id in the URL always wins: it is what makes "Open in Discovery Lab"
  // from an entity page land on that entity rather than on whatever was last
  // selected.
  const nodeId = params?.get("node");
  if (nodeId) {
    const current = subjectStore.get();
    if (!current || String(current.id) !== String(nodeId)) {
      try {
        const context = await labApi.context(Number(nodeId));
        subjectStore.set({
          id: context.node.id,
          label: context.node.name,
          kind: context.node.kind,
          smiles: context.chemistry.smiles,
          compound_node_id: context.chemistry.compound_node_id,
        });
      } catch (error) {
        console.warn("could not resolve lab subject", error);
      }
    }
  }

  root.innerHTML = `
    <div class="lab-head">
      <div>
        <div class="breadcrumbs"><a href="#/lab/radar">Discovery Lab</a> › ${esc(
          definition.label
        )}</div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
      <div class="spacer"></div>
      <div id="lab-subject-host"></div>
    </div>
    <nav class="lab-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/lab/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="lab-body">${loading("Preparing the lab…")}</div>
    ${labDisclaimer}
  `;

  renderSubjectPicker(root.querySelector("#lab-subject-host"));

  const body = root.querySelector("#lab-body");
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

/**
 * The subject selector shown in every section.
 *
 * Every lab section works on one entity at a time, and which entity it is must
 * be visible at all times — a property panel with no visible subject is how a
 * screenshot ends up attributed to the wrong molecule.
 */
function renderSubjectPicker(host) {
  if (!host) return;

  const render = (subject) => {
    host.innerHTML = `
      <div class="lab-subject">
        <div class="who">
          ${
            subject
              ? `<div class="name">${esc(subject.label)}</div>
                 <div class="sub">${esc(subject.kind || "entity")}${
                   subject.smiles ? " · structure available" : ""
                 }</div>`
              : `<div class="name dim">No subject selected</div>
                 <div class="sub">Search for a disease, target, drug or compound</div>`
          }
        </div>
        <button class="sm" id="lab-pick">${subject ? "Change" : "Select"}</button>
        ${subject ? `<a class="sm" href="#/entity/${subject.id}" title="Open the atlas record">↗</a>` : ""}
      </div>
      <div id="lab-pick-box" class="hidden" style="position:relative"></div>`;

    host.querySelector("#lab-pick").addEventListener("click", () => openPicker(host));
  };

  subjectStore.subscribe(render);
}

function openPicker(host) {
  const box = host.querySelector("#lab-pick-box");
  box.classList.remove("hidden");
  box.innerHTML = `
    <input class="search-input" id="lab-search" type="search" autocomplete="off"
           placeholder="Search entities in this platform…" style="width:100%;margin-top:8px" />
    <div class="suggestions" id="lab-suggestions" style="position:static;margin-top:4px"></div>`;

  const input = box.querySelector("#lab-search");
  const suggestions = box.querySelector("#lab-suggestions");
  input.focus();

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) {
      suggestions.innerHTML = "";
      return;
    }
    timer = setTimeout(async () => {
      try {
        const hits = await labApi.suggest(query, 10);
        suggestions.innerHTML = hits.length
          ? hits
              .map(
                (hit) => `<div class="sugg" data-id="${hit.id}" data-kind="${esc(
                  hit.kind
                )}" data-name="${esc(hit.name)}">
                  <div class="body">
                    <div class="title">${esc(hit.name)}</div>
                    <div class="sub">${esc(hit.kind)}${
                      hit.subtitle ? " · " + esc(hit.subtitle) : ""
                    }</div>
                  </div></div>`
              )
              .join("")
          : `<div class="sugg"><div class="body"><div class="sub">Nothing matched.</div></div></div>`;

        suggestions.querySelectorAll("[data-id]").forEach((row) =>
          row.addEventListener("click", async () => {
            const context = await labApi.context(Number(row.dataset.id));
            subjectStore.set({
              id: context.node.id,
              label: context.node.name,
              kind: context.node.kind,
              smiles: context.chemistry.smiles,
              compound_node_id: context.chemistry.compound_node_id,
            });
            box.classList.add("hidden");
            // Re-render the active section against the new subject.
            window.dispatchEvent(new HashChangeEvent("hashchange"));
          })
        );
      } catch {
        suggestions.innerHTML = "";
      }
    }, 160);
  });
}

/** Shared empty state: no subject chosen yet. */
export function needsSubject(what = "this section") {
  return notice(
    `Select a subject to use ${esc(what)}. Use the selector above, or open any
     disease, drug, target or compound in the atlas and choose
     <strong>Open in Discovery Lab</strong>.`,
    "muted",
    "◎"
  );
}

/** Shared empty state: subject has no structure. */
export function needsStructure(subject) {
  return notice(
    `<strong>${esc(subject?.label || "This entity")}</strong> has no chemical
     structure in the platform, so structure-based tools cannot run on it.
     Select a compound or a small-molecule drug instead.`,
    "muted",
    "⌬"
  );
}

export { workbench };
