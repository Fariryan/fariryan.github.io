/**
 * Workbench shell.
 *
 * Same pattern as every module since Discovery Lab. The stylesheet and the
 * vendored editor are loaded here rather than from index.html, so adding this
 * section needed no change to the page shell and no relaxation of the CSP.
 */

import { esc, loading, notice } from "../ui.js";

const STYLESHEET = "css/workbench.css";

export const SECTIONS = [
  {
    key: "editor",
    label: "Molecule Editor",
    icon: "✎",
    module: () => import("./views/editor.js"),
    view: "editorView",
    lede:
      "Draw or paste a structure, then hand it to RDKit on the server for canonicalisation and properties. The editor proposes; RDKit decides.",
  },
  {
    key: "chemistry",
    label: "Chemistry",
    icon: "⌬",
    module: () => import("./views/chemistry.js"),
    view: "chemistryView",
    lede:
      "Descriptors, fingerprints, similarity and substructure search over a set of molecules. Every value is calculated by RDKit and labelled as such.",
  },
  {
    key: "structures",
    label: "Structures",
    icon: "⬢",
    module: () => import("./views/structures.js"),
    view: "structuresView",
    lede:
      "Retrieve a PDB entry, inspect its chains and ligands, extract a binding site, and repair it with PDBFixer — with every modification logged.",
  },
  {
    key: "space",
    label: "Chemical Space",
    icon: "◈",
    module: () => import("./views/space.js"),
    view: "spaceView",
    lede:
      "PCA, Butina clustering, the similarity matrix and the scaffold distribution of a molecule set.",
  },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-workbench-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.workbenchStyle = "true";
  document.head.appendChild(link);
}

export async function workbenchView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "editor";
  const definition = SECTIONS.find((s) => s.key === key);

  root.innerHTML = `
    <div class="wb-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/workbench/editor">Workbench</a> › ${esc(definition.label)}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="wb-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/workbench/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="wb-body">${loading("Preparing…")}</div>
  `;

  const body = root.querySelector("#wb-body");
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
