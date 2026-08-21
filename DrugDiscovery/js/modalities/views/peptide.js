/** Peptides: sequence in, real chemistry out. */

import { esc, loading, notice } from "../../ui.js";
import { modalityApi } from "../api.js";
import { propTable, provBadge, refusalBlock } from "./shared.js";

const EXAMPLES = [
  { name: "Oxytocin", sequence: "CYIQNCPLG", cyclisation: "disulfide",
    pairs: "1,6", modifications: ["c_amide"] },
  { name: "Vasopressin", sequence: "CYFQNCPRG", cyclisation: "disulfide",
    pairs: "1,6", modifications: ["c_amide"] },
  { name: "Somatostatin-14", sequence: "AGCKNFFWKTFTSC", cyclisation: "disulfide",
    pairs: "3,14", modifications: [] },
  { name: "Leu-enkephalin", sequence: "YGGFL", cyclisation: "linear",
    pairs: "", modifications: [] },
];

export async function peptideView(root) {
  let status;
  try { status = await modalityApi.status(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  root.innerHTML = `
    <section class="md9-panel lg-surface lg-d1">
      <div class="md9-grid">
        <div>
          <label for="p-name">Name</label>
          <input id="p-name" type="text" value="Oxytocin" />
          <label for="p-seq">Sequence — one-letter, three-letter or FASTA</label>
          <textarea id="p-seq" rows="3" spellcheck="false">CYIQNCPLG</textarea>
          <div class="md9-examples">
            ${EXAMPLES.map((e, i) => `<button class="md9-pill" data-example="${i}">${esc(e.name)}</button>`).join("")}
          </div>
        </div>
        <div>
          <label for="p-cyc">Cyclisation</label>
          <select id="p-cyc">${Object.entries(status.cyclisations).map(([k, v]) =>
            `<option value="${esc(k)}" title="${esc(v)}">${esc(k.replace(/_/g, " "))}</option>`).join("")}</select>
          <label for="p-pairs">Disulfide pairs — 1-based positions, e.g. <span class="mono">1,6</span></label>
          <input id="p-pairs" type="text" value="1,6" spellcheck="false" />
          <label>Modifications</label>
          <div class="md9-checks">
            ${Object.entries(status.peptide_modifications).map(([k, v]) =>
              `<label class="md9-check" title="${esc(v.effect)}">
                <input type="checkbox" value="${esc(k)}" ${k === "c_amide" ? "checked" : ""} />
                ${esc(v.label)}</label>`).join("")}
          </div>
          <p class="md9-note" id="p-cyc-note">${esc(status.cyclisations.linear)}</p>
        </div>
      </div>
      <div class="md9-actions"><button id="p-go" class="md9-btn">Build and analyse</button></div>
    </section>
    <div id="p-out"></div>`;

  const cyc = root.querySelector("#p-cyc");
  cyc.value = "disulfide";
  const note = root.querySelector("#p-cyc-note");
  note.textContent = status.cyclisations.disulfide;
  cyc.addEventListener("change", () => {
    note.textContent = status.cyclisations[cyc.value] || "";
  });

  root.querySelectorAll("[data-example]").forEach((button) =>
    button.addEventListener("click", () => {
      const example = EXAMPLES[Number(button.dataset.example)];
      root.querySelector("#p-name").value = example.name;
      root.querySelector("#p-seq").value = example.sequence;
      cyc.value = example.cyclisation;
      note.textContent = status.cyclisations[example.cyclisation] || "";
      root.querySelector("#p-pairs").value = example.pairs;
      root.querySelectorAll(".md9-check input").forEach((box) => {
        box.checked = example.modifications.includes(box.value);
      });
    }));

  const out = root.querySelector("#p-out");
  root.querySelector("#p-go").addEventListener("click", async () => {
    out.innerHTML = loading("Building the atomic graph…");
    const pairs = root.querySelector("#p-pairs").value.trim();
    const parsed = pairs
      ? pairs.split(";").map((p) => p.split(",").map((n) => Number(n.trim()))).filter(
          (p) => p.length === 2 && p.every(Number.isFinite))
      : [];
    try {
      out.innerHTML = render(await modalityApi.peptide({
        name: root.querySelector("#p-name").value.trim(),
        sequence: root.querySelector("#p-seq").value.trim(),
        cyclisation: cyc.value,
        disulfide_pairs: parsed,
        modifications: [...root.querySelectorAll(".md9-check input:checked")].map((b) => b.value),
      }));
    } catch (error) {
      out.innerHTML = notice(`<strong>Refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });
}

function render(d) {
  const structure = d.structure || {};
  const sp = d.properties.sequence_properties;
  const graph = d.properties.graph_descriptors;
  return `
    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${esc(d.name || d.sequence)}</h3>
          <span class="mono small">${esc(d.three_letter)}</span></div>
        <span class="md9-rep">${d.length} residues · ${esc(d.cyclisation.replace(/_/g, " "))}</span>
      </header>
      <p class="md9-note">${esc(d.cyclisation_meaning)}</p>
      ${d.modifications.length ? `<div class="md9-mods">${d.modifications.map((m) =>
        `<div><strong>${esc(m.label)}</strong> — ${esc(m.effect)}</div>`).join("")}</div>` : ""}

      <h4>Chemistry performed</h4>
      <ul class="md9-steps">
        ${(structure.applied || []).map((a) => `<li class="ok">${esc(a.step)}${
          a.chemistry ? ` — ${esc(a.chemistry)}` : ""}</li>`).join("")}
        ${(structure.refused || []).map((r) => `<li class="no">${esc(r.step)} — ${esc(r.reason)}</li>`).join("")}
      </ul>
      ${structure.smiles ? `<p class="md9-smiles mono">${esc(structure.smiles)}</p>` : ""}
      ${structure.inchikey ? `<p class="dim small mono">InChIKey ${esc(structure.inchikey)}</p>` : ""}

      <div class="md9-grid">
        <div>
          <h4>Sequence properties ${provBadge(sp.provenance_type)}</h4>
          ${propTable({
            length: sp.length, molecular_weight_da: sp.molecular_weight_da,
            isoelectric_point: sp.isoelectric_point, net_charge_at_ph_7: sp.net_charge_at_ph_7,
            gravy: sp.gravy, aromaticity: sp.aromaticity,
            instability_index: sp.instability_index,
            extinction_coefficient_reduced: sp.extinction_coefficient_reduced,
          })}
          <p class="dim small">${esc(sp.method)}</p>
        </div>
        <div>
          <h4>Graph descriptors ${graph.status === "ok" ? provBadge(graph.provenance_type) : ""}</h4>
          ${graph.status === "ok"
            ? propTable({
                molecular_weight: graph.molecular_weight, heavy_atoms: graph.heavy_atoms,
                clogp: graph.clogp, tpsa: graph.tpsa, hbd: graph.hbd, hba: graph.hba,
                rotatable_bonds: graph.rotatable_bonds, rings: graph.rings,
                fraction_csp3: graph.fraction_csp3,
              })
            : `<p class="md9-caveat">${esc(graph.reason)}</p>`}
        </div>
      </div>

      <p class="md9-caveat">${esc(d.properties.interpretation_boundary)}</p>
      <details class="md9-details">
        <summary>Sequence-property caveats</summary>
        ${Object.entries(sp.caveats).map(([k, v]) =>
          `<p class="md9-caveat"><strong>${esc(k.replace(/_/g, " "))}:</strong> ${esc(
            Array.isArray(v) ? v[0] : v)}</p>`).join("")}
      </details>
    </section>`;
}
