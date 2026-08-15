/**
 * Molecule stage.
 *
 * Structure in, validated, canonicalised, described. Reuses Discovery Lab's
 * chemistry endpoints rather than duplicating the descriptor code — the
 * numbers must be identical in both places or one of them is wrong.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { labApi } from "../../lab/api.js";
import { pcApi } from "../api.js";
import { subject } from "../router.js";
import { statusValue } from "../ui.js";

//: How many library hits to show at once. Enough to browse, few enough that
//: the panel does not become the page.
const LIBRARY_PAGE = 40;

export async function moleculeView(root, params) {
  const current = subject.get();
  const initial = params?.get("smiles") || current?.smiles || "";

  root.innerHTML = `
    ${card(
      "Molecule input",
      `<div class="toolbar">
        <input class="search-input" id="pc-smiles" type="text" spellcheck="false"
               placeholder="SMILES, or paste a structure" value="${esc(initial)}"
               style="flex:1;min-width:300px" />
        <button class="sm primary" id="pc-analyse">Validate &amp; analyse</button>
      </div>
      <div class="toolbar mt">
        <input class="search-input" id="pc-library-q" type="text"
               placeholder="…or search this platform's compound library by name, synonym or InChIKey"
               style="flex:1;min-width:300px" />
        <span class="small dim" id="pc-library-count"></span>
      </div>
      <div id="pc-library"></div>
      <div class="lab-note">
        The structure is parsed, sanitised, reduced to its largest fragment and
        canonicalised by RDKit. Salts and solvates are removed and the removal
        is reported — the descriptors below describe the parent molecule.
      </div>`
    )}
    <div id="pc-mol-result"></div>`;

  const input = root.querySelector("#pc-smiles");
  const host = root.querySelector("#pc-mol-result");

  const library = root.querySelector("#pc-library");
  const librarySearch = root.querySelector("#pc-library-q");
  const libraryCount = root.querySelector("#pc-library-count");

  /**
   * The platform's own catalogued structures, rather than a handful of
   * hard-coded examples. A catalogued compound arrives with an InChIKey and a
   * node id, so every downstream result stays attached to the entity the rest
   * of the platform knows — which a pasted SMILES never is.
   */
  const loadLibrary = async (query) => {
    library.innerHTML = loading("Searching the compound library…");
    try {
      const found = await pcApi.molecules({ q: query || undefined, limit: LIBRARY_PAGE });
      libraryCount.textContent = query
        ? `${found.count} of ${found.library_size} compounds`
        : `${found.library_size} compounds with a curated structure`;
      library.innerHTML = renderLibrary(found);
      library.querySelectorAll("[data-smiles]").forEach((button) =>
        button.addEventListener("click", () => {
          input.value = button.dataset.smiles;
          analyse({
            node_id: Number(button.dataset.node) || null,
            name: button.dataset.name,
          });
        })
      );
    } catch (error) {
      library.innerHTML = notice(
        `The compound library could not be read: ${esc(error.message)}`,
        "warn",
        "⚠"
      );
    }
  };

  let debounce;
  librarySearch.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => loadLibrary(librarySearch.value.trim()), 250);
  });

  const analyse = async (catalogued = null) => {
    const smiles = input.value.trim();
    if (!smiles) {
      host.innerHTML = notice("Enter a structure first.", "warn", "⚠");
      return;
    }
    host.innerHTML = loading("Validating the structure…");
    try {
      const profile = await labApi.analyse(smiles);
      subject.set({
        // Identity from the catalogue when it came from there, so the rest of
        // the laboratory can name the compound rather than echo a string.
        node_id: catalogued?.node_id ?? null,
        name: catalogued?.name ?? null,
        smiles: profile.structure.canonical_smiles,
        inchikey: profile.structure.inchikey,
        formula: profile.structure.formula,
        molecular_weight: profile.descriptor_values.molecular_weight,
      });
      host.innerHTML = render(profile);
    } catch (error) {
      host.innerHTML = notice(
        `<strong>Invalid structure.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  };

  root.querySelector("#pc-analyse").addEventListener("click", analyse);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") analyse();
  });

  if (initial) await analyse();
  else host.innerHTML = empty("Enter a structure, or pick one from the library below.");

  await loadLibrary("");
}

function renderLibrary(found) {
  if (!found.compounds.length) {
    return empty(
      found.query
        ? `Nothing in the platform's ${found.library_size} catalogued structures ` +
            `matches “${esc(found.query)}”. Paste a SMILES above to work on a ` +
            `compound the database does not hold.`
        : "The compound library is empty."
    );
  }

  return `<div class="pc-library">
      ${found.compounds
        .map(
          (compound) => `
        <button class="pc-library-item" data-smiles="${esc(compound.smiles)}"
                data-node="${compound.node_id}" data-name="${esc(compound.name)}"
                title="${esc(compound.inchikey || "")}">
          <span class="pc-library-name">${esc(compound.name)}</span>
          <span class="pc-library-meta">
            ${esc(compound.formula || "—")}
            ${compound.molecular_weight ? ` · ${compound.molecular_weight.toFixed(1)} Da` : ""}
            ${compound.has_stereochemistry ? " · stereo" : ""}
          </span>
        </button>`
        )
        .join("")}
    </div>
    <div class="lab-note">${esc(found.note)}</div>`;
}

/** Wrap a raw calculated number so it renders with its status glyph. */
const calc = (value, units, label) => ({
  value,
  units,
  status: "derived",
  glyph: "◆",
  status_label: "Derived",
  status_definition:
    "Calculated deterministically from the structure by RDKit. Reproducible from the same input, but not a measurement.",
  evidence: { method: { name: "RDKit", version: "descriptor" }, note: label },
});

function render(profile) {
  const values = profile.descriptor_values;
  const rows = [
    ["Molecular formula", profile.structure.formula, ""],
    ["Exact mass", calc(values.exact_mass, "Da"), ""],
    ["Average molecular weight", calc(values.molecular_weight, "Da"), ""],
    ["cLogP", calc(values.clogp, ""), "Crippen estimate, not a measured logP"],
    ["TPSA", calc(values.tpsa, "Å²"), ""],
    ["H-bond donors", calc(values.hbd, ""), ""],
    ["H-bond acceptors", calc(values.hba, ""), ""],
    ["Rotatable bonds", calc(values.rotatable_bonds, ""), ""],
    ["Rings", calc(values.rings, ""), ""],
    ["Aromatic rings", calc(values.aromatic_rings, ""), ""],
    ["Fraction Csp3", calc(values.fraction_csp3, ""), ""],
    ["Formal charge", calc(values.formal_charge, ""), ""],
    ["Heavy atoms", calc(values.heavy_atoms, ""), ""],
    ["Molar refractivity", calc(values.molar_refractivity, "cm³/mol"), ""],
    ["QED", calc(values.qed, ""), "Quantitative estimate of drug-likeness"],
    ["Stereocentres", calc(values.stereocenters, ""), ""],
  ];

  const ruleSets = profile.rule_sets || {};

  return `
    <div class="grid grid-2">
      ${card(
        "Structure",
        `<div class="mol-2d">
          <img src="${esc(labApi.depictionUrl(profile.structure.canonical_smiles, 420, 300))}"
               alt="structure" />
        </div>
        <dl class="kv mt">
          <dt>Canonical SMILES</dt><dd class="mono small">${esc(
            profile.structure.canonical_smiles
          )}</dd>
          <dt>InChIKey</dt><dd class="mono small">${esc(
            profile.structure.inchikey || "—"
          )}</dd>
          <dt>Formula</dt><dd>${esc(profile.structure.formula)}</dd>
        </dl>
        ${
          profile.structure.standardisation_notes?.length
            ? `<div class="assumption-banner"><strong>Standardisation:</strong>
               ${esc(profile.structure.standardisation_notes.join("; "))}</div>`
            : ""
        }`
      )}
      ${card(
        "Calculated descriptors",
        `<table class="param-table">
          ${rows
            .map(
              ([label, value, note]) => `<tr>
                <td>${esc(label)}</td>
                <td class="num">${
                  typeof value === "string" ? esc(value) : statusValue(value)
                }</td>
                <td class="dim small">${esc(note)}</td>
              </tr>`
            )
            .join("")}
        </table>`
      )}
    </div>

    ${card(
      "Rule sets and alerts",
      `<div class="grid grid-3">
        ${Object.entries(ruleSets)
          .map(
            ([, block]) => `<div>
              <div style="font-weight:620">${esc(block.label)}</div>
              <div class="small ${block.passed ? "" : "muted"}">
                ${block.violations} violation${block.violations === 1 ? "" : "s"}
                ${
                  block.failed_terms?.length
                    ? `<br /><span class="dim">${esc(block.failed_terms.join(", "))}</span>`
                    : ""
                }
              </div>
            </div>`
          )
          .join("")}
      </div>
      <div class="mt">
        <strong>Structural alerts:</strong> ${profile.alerts.count}
        ${
          profile.alerts.value.length
            ? `<span class="dim small"> — ${esc(
                profile.alerts.value.slice(0, 4).map((h) => h.name).join(", ")
              )}</span>`
            : `<span class="dim small"> — none matched</span>`
        }
      </div>
      <div class="lab-note">${esc(profile.alerts.provenance.note)}</div>`
    )}

    ${notice(
      `Structure accepted. Continue to
       <a href="#/preclinical/insilico">In Silico</a> for docking and dynamics,
       or <a href="#/preclinical/invitro">In Vitro</a> for cell models.`,
      "info",
      "→"
    )}`;
}
