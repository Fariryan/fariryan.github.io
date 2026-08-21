/** Targeted degraders: three components, one molecule, no degradation score. */

import { esc, loading, notice } from "../../ui.js";
import { modalityApi } from "../api.js";
import { barChart, propTable, provBadge, refusalBlock } from "./shared.js";

const WARHEADS = [
  { label: "JQ1 (BRD4)", smiles: "Cc1sc2c(c1C)C(c1ccc(Cl)cc1)=N[C@@H](CC(=O)OC(C)(C)C)c1nnc(C)n1-2",
    target: "BRD4 bromodomain" },
  { label: "Dasatinib (ABL/SRC)", smiles: "Cc1nc(Nc2ncc(s2)C(=O)Nc2c(C)cccc2Cl)cc(n1)N1CCN(CCO)CC1",
    target: "ABL1 / SRC kinases" },
  { label: "Ibrutinib-like (BTK)", smiles: "Nc1ncnc2c1c(-c1ccc(Oc3ccccc3)cc1)nn2C1CCCNC1",
    target: "BTK" },
];

export async function degraderView(root) {
  let status;
  try { status = await modalityApi.status(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  root.innerHTML = `
    <section class="md9-panel lg-surface lg-d1">
      <div class="md9-ternary">
        <div class="md9-part" style="--kind:var(--ev-established)">
          <span class="md9-part-role">target ligand</span>
          <label for="d-target">Warhead SMILES</label>
          <textarea id="d-target" rows="3" spellcheck="false">${esc(WARHEADS[0].smiles)}</textarea>
          <div class="md9-examples">
            ${WARHEADS.map((w, i) => `<button class="md9-pill" data-warhead="${i}">${esc(w.label)}</button>`).join("")}
          </div>
        </div>
        <div class="md9-join">—</div>
        <div class="md9-part" style="--kind:var(--warning)">
          <span class="md9-part-role">linker</span>
          <label for="d-family">Family</label>
          <select id="d-family">${Object.entries(status.linker_families).map(([k, v]) =>
            `<option value="${esc(k)}" title="${esc(v.description)}">${esc(v.label)} (${esc(v.rigidity)})</option>`).join("")}</select>
          <label for="d-units">Units</label>
          <input id="d-units" type="number" value="3" min="1" max="12" />
          <p class="md9-note" id="d-family-note">${esc(status.linker_families.peg.description)}</p>
        </div>
        <div class="md9-join">—</div>
        <div class="md9-part" style="--kind:var(--ev-clinical)">
          <span class="md9-part-role">E3 ligase ligand</span>
          <label for="d-e3">Recruiter</label>
          <select id="d-e3">${Object.entries(status.e3_ligands).map(([k, v]) =>
            `<option value="${esc(k)}" title="${esc(v.note)}">${esc(v.label)}</option>`).join("")}</select>
          <p class="md9-note" id="d-e3-note">${esc(status.e3_ligands.vhl_vh032.note)}</p>
        </div>
      </div>
      <div class="md9-actions">
        <button id="d-series" class="md9-btn ghost">Enumerate a linker series</button>
        <button id="d-go" class="md9-btn">Assemble and explore</button>
      </div>
    </section>
    <div id="d-out"></div>`;

  const family = root.querySelector("#d-family");
  const familyNote = root.querySelector("#d-family-note");
  family.addEventListener("change", () => {
    familyNote.textContent = status.linker_families[family.value]?.description || "";
  });
  const e3 = root.querySelector("#d-e3");
  const e3Note = root.querySelector("#d-e3-note");
  e3.addEventListener("change", () => {
    e3Note.textContent = status.e3_ligands[e3.value]?.note || "";
  });
  e3.value = "crbn_thalidomide";
  e3Note.textContent = status.e3_ligands.crbn_thalidomide.note;

  root.querySelectorAll("[data-warhead]").forEach((button) =>
    button.addEventListener("click", () => {
      root.querySelector("#d-target").value = WARHEADS[Number(button.dataset.warhead)].smiles;
    }));

  const out = root.querySelector("#d-out");
  const payload = () => ({
    target_ligand: root.querySelector("#d-target").value.trim(),
    e3_key: e3.value,
    linker_family: family.value,
    linker_units: Number(root.querySelector("#d-units").value),
  });

  root.querySelector("#d-go").addEventListener("click", async () => {
    out.innerHTML = loading("Assembling and embedding conformers…");
    try { out.innerHTML = render(await modalityApi.degrader({ ...payload(), conformers: 24 })); }
    catch (error) {
      out.innerHTML = notice(`<strong>Refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });

  root.querySelector("#d-series").addEventListener("click", async () => {
    out.innerHTML = loading("Walking the linker series…");
    try {
      const data = await modalityApi.linkers({
        target_ligand: payload().target_ligand, e3_key: payload().e3_key,
        families: Object.keys(status.linker_families), unit_range: [1, 4],
      });
      out.innerHTML = renderSeries(data);
    } catch (error) { out.innerHTML = notice(esc(error.message), "warn", "⚠"); }
  });
}

function render(d) {
  const c = d.components;
  const a = d.assembly;
  const p = d.properties;
  const conf = d.conformers;
  return `
    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${esc(d.name)}</h3><span class="dim small">${esc(d.status)}</span></div>
      </header>
      <p class="md9-note">${esc(d.mechanism)}</p>

      <h4>Components</h4>
      <div class="md9-scroll"><table class="md9-table">
        <thead><tr><th>Part</th><th class="num">Heavy atoms</th><th class="num">MW</th><th>SMILES</th><th>Role</th></tr></thead>
        <tbody>${(a.parts || []).map((part) => {
          const meta = c[part.part] || {};
          return `<tr>
            <td>${esc(part.part.replace(/_/g, " "))}${meta.label ? ` <span class="dim small">${esc(meta.label)}</span>` : ""}</td>
            <td class="num mono">${part.heavy_atoms}</td>
            <td class="num mono">${part.molecular_weight}</td>
            <td class="mono small">${esc(part.smiles)}</td>
            <td class="small dim">${esc(meta.role || "")}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>

      ${a.joins?.length ? `
        <h4>How it was assembled</h4>
        <ul class="md9-steps">
          ${a.joins.map((j) => `<li class="ok">${esc(j.joined.replace(/_/g, " "))} → linker atom ${j.linker_atom}, via ${esc(j.ligand_attachment)}</li>`).join("")}
        </ul>
        <p class="md9-caveat">${esc(a.attachment_note || "")}</p>` : ""}
      ${a.smiles ? `<p class="md9-smiles mono">${esc(a.smiles)}</p>` : ""}

      ${p.status === "unavailable" ? `<p class="md9-caveat">${esc(p.reason)}</p>` : `
        <h4>Assembled properties ${provBadge(p.provenance_type)}</h4>
        ${propTable({
          molecular_weight: p.molecular_weight, heavy_atoms: p.heavy_atoms,
          clogp: p.clogp, tpsa: p.tpsa, hbd: p.hbd, hba: p.hba,
          rotatable_bonds: p.rotatable_bonds, rings: p.rings,
          aromatic_rings: p.aromatic_rings, fraction_csp3: p.fraction_csp3,
        })}
        <p class="md9-caveat">${esc(p.beyond_rule_of_five)}</p>`}

      ${conf.status === "ok" ? `
        <h4>Conformational reach ${provBadge(conf.provenance_type)}</h4>
        <div class="md9-stats">
          <div><b>${conf.end_to_end_distance_angstrom.min}</b><span>Å minimum</span></div>
          <div><b>${conf.end_to_end_distance_angstrom.mean}</b><span>Å mean</span></div>
          <div><b>${conf.end_to_end_distance_angstrom.max}</b><span>Å maximum</span></div>
          <div><b>${conf.end_to_end_distance_angstrom.span}</b><span>Å range</span></div>
          <div><b>${conf.conformers}</b><span>conformers</span></div>
        </div>
        <p class="dim small">${esc(conf.embedding)}${conf.force_field ? `, minimised with ${esc(conf.force_field)}` : ""} · seed ${conf.seed} · measured between the two heavy atoms ${conf.measured_between.bonds_apart} bonds apart</p>
        <p class="md9-caveat">${esc(conf.statement)}</p>`
        : `<p class="md9-caveat">${esc(conf.reason || "no conformers")}</p>`}

      ${refusalBlock(d.not_computed.map((n) => ({
        key: n.property, status: "unavailable", detail: n.why })),
        "What is deliberately not computed")}
      <p class="md9-caveat"><strong>Ternary-complex evidence: ${esc(d.ternary_evidence.status.replace(/_/g, " "))}.</strong> ${esc(d.ternary_evidence.note)}</p>
    </section>`;
}

function renderSeries(d) {
  const byFamily = {};
  for (const entry of d.series) (byFamily[entry.family] ||= []).push(entry);
  return `
    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${d.count} linkers</h3>
          <span class="dim small">${Object.keys(byFamily).length} famil${Object.keys(byFamily).length === 1 ? "y" : "ies"}, ${d.unit_range[0]}–${d.unit_range[1]} units</span></div>
      </header>
      <div class="md9-scroll"><table class="md9-table">
        <thead><tr><th>Family</th><th>Rigidity</th><th class="num">Units</th><th>Linker</th>
          <th class="num">MW</th><th class="num">cLogP</th><th class="num">TPSA</th>
          <th class="num">Rot. bonds</th></tr></thead>
        <tbody>${d.series.map((s) => `
          <tr>
            <td>${esc(s.family_label)}</td>
            <td><span class="md9-chip">${esc(s.rigidity)}</span></td>
            <td class="num mono">${s.units}</td>
            <td class="mono small">${esc(s.linker_smiles)}</td>
            <td class="num mono">${s.properties.molecular_weight}</td>
            <td class="num mono">${s.properties.clogp}</td>
            <td class="num mono">${s.properties.tpsa}</td>
            <td class="num mono">${s.properties.rotatable_bonds}</td>
          </tr>`).join("")}</tbody>
      </table></div>
      ${d.failures.length ? `<p class="md9-caveat">${d.failures.length} combination(s) could not be assembled: ${
        d.failures.slice(0, 3).map((f) => esc(`${f.family}×${f.units}`)).join(", ")}</p>` : ""}
      <p class="md9-caveat"><strong>${esc(d.no_ranking)}</strong></p>
    </section>`;
}
