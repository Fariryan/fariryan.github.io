/**
 * Molecule stage.
 *
 * Structure in, validated, canonicalised, described. Reuses Discovery Lab's
 * chemistry endpoints rather than duplicating the descriptor code — the
 * numbers must be identical in both places or one of them is wrong.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { labApi } from "../../lab/api.js";
import { subject } from "../router.js";
import { statusValue } from "../ui.js";

const EXAMPLES = [
  { label: "Erlotinib", smiles: "COCCOc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC" },
  { label: "Temozolomide", smiles: "CN1C(=O)N2C=NC(C(N)=O)=C2N=N1" },
  { label: "Donepezil", smiles: "COc1cc2CC(CC3CCN(Cc4ccccc4)CC3)C(=O)c2cc1OC" },
];

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
      <div class="row mt">
        <span class="small dim">Examples:</span>
        ${EXAMPLES.map(
          (e) =>
            `<button class="sm" data-example="${esc(e.smiles)}">${esc(e.label)}</button>`
        ).join("")}
      </div>
      <div class="lab-note">
        The structure is parsed, sanitised, reduced to its largest fragment and
        canonicalised by RDKit. Salts and solvates are removed and the removal
        is reported — the descriptors below describe the parent molecule.
      </div>`
    )}
    <div id="pc-mol-result"></div>`;

  const input = root.querySelector("#pc-smiles");
  const host = root.querySelector("#pc-mol-result");

  root.querySelectorAll("[data-example]").forEach((button) =>
    button.addEventListener("click", () => {
      input.value = button.dataset.example;
      analyse();
    })
  );

  const analyse = async () => {
    const smiles = input.value.trim();
    if (!smiles) {
      host.innerHTML = notice("Enter a structure first.", "warn", "⚠");
      return;
    }
    host.innerHTML = loading("Validating the structure…");
    try {
      const profile = await labApi.analyse(smiles);
      subject.set({
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
  else host.innerHTML = empty("Enter a structure to begin.");
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
