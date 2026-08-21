/** Proteins and antibodies: chains, CDRs, liabilities — and no descriptors. */

import { esc, loading, notice } from "../../ui.js";
import { modalityApi } from "../api.js";
import { propTable, provBadge, refusalBlock } from "./shared.js";

const EXAMPLES = {
  trastuzumab: {
    label: "Trastuzumab (Fv) — anti-HER2",
    modality: "antibody", format: "igg", target: "ERBB2 (HER2)",
    heavy: "EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKNTAYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS",
    light: "DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK",
  },
  pembrolizumab: {
    label: "Pembrolizumab (Fv) — anti-PD-1",
    modality: "antibody", format: "igg", target: "PDCD1 (PD-1)",
    heavy: "QVQLVQSGVEVKKPGASVKVSCKASGYTFTNYYMYWVRQAPGQGLEWMGGINPSNGGTNFNEKFKNRVTLTTDSSTTTAYMELKSLQFDDTAVYYCARRDYRFDMGFDYWGQGTTVTVSS",
    light: "EIVLTQSPATLSLSPGERATLSCRASKGVSTSGYSYLHWYQQKPGQAPRLLIYLASYLESGVPARFSGSGSGTDFTLTISSLEPEDFAVYYCQHSRDLPLTFGGGTKVEIK",
  },
  insulin: {
    label: "Insulin (A and B chains) — protein hormone",
    modality: "protein", protein_class: "hormone", target: "INSR",
    heavy: "GIVEQCCTSICSLYQLENYCN",
    light: "FVNQHLCGSHLVEALYLVCGERGFFYTPKT",
  },
};

export async function biologicView(root) {
  let status;
  try { status = await modalityApi.status(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  root.innerHTML = `
    <section class="md9-panel lg-surface lg-d1">
      <div class="md9-examples">
        ${Object.entries(EXAMPLES).map(([k, v]) =>
          `<button class="md9-pill" data-example="${esc(k)}">${esc(v.label)}</button>`).join("")}
      </div>
      <div class="md9-grid">
        <div>
          <label for="b-modality">Modality</label>
          <select id="b-modality">
            <option value="antibody">Antibody</option>
            <option value="protein">Protein</option>
          </select>
          <label for="b-name">Name</label>
          <input id="b-name" type="text" value="Trastuzumab (Fv)" />
          <label for="b-target">Target</label>
          <input id="b-target" type="text" value="ERBB2 (HER2)" />
          <label for="b-subtype">Format / class</label>
          <select id="b-subtype">
            ${Object.entries(status.antibody_formats).map(([k, v]) =>
              `<option value="${esc(k)}" data-for="antibody" title="${esc(v)}">${esc(k)}</option>`).join("")}
            ${Object.entries(status.protein_classes).map(([k, v]) =>
              `<option value="${esc(k)}" data-for="protein" title="${esc(v)}" hidden>${esc(k.replace(/_/g, " "))}</option>`).join("")}
          </select>
        </div>
        <div>
          <label for="b-heavy">Heavy chain <span class="dim">(or first chain)</span></label>
          <textarea id="b-heavy" rows="4" spellcheck="false">${esc(EXAMPLES.trastuzumab.heavy)}</textarea>
          <label for="b-light">Light chain <span class="dim">(or second chain, optional)</span></label>
          <textarea id="b-light" rows="4" spellcheck="false">${esc(EXAMPLES.trastuzumab.light)}</textarea>
        </div>
      </div>
      <div class="md9-actions"><button id="b-go" class="md9-btn">Analyse</button></div>
    </section>
    <div id="b-out"></div>`;

  const modality = root.querySelector("#b-modality");
  const subtype = root.querySelector("#b-subtype");
  const syncSubtype = () => {
    [...subtype.options].forEach((option) => {
      option.hidden = option.dataset.for !== modality.value;
    });
    const first = [...subtype.options].find((o) => !o.hidden);
    if (first) subtype.value = first.value;
  };
  modality.addEventListener("change", syncSubtype);

  root.querySelectorAll("[data-example]").forEach((button) =>
    button.addEventListener("click", () => {
      const example = EXAMPLES[button.dataset.example];
      modality.value = example.modality;
      syncSubtype();
      subtype.value = example.format || example.protein_class;
      root.querySelector("#b-name").value = example.label.split(" —")[0];
      root.querySelector("#b-target").value = example.target;
      root.querySelector("#b-heavy").value = example.heavy;
      root.querySelector("#b-light").value = example.light;
    }));

  const out = root.querySelector("#b-out");
  root.querySelector("#b-go").addEventListener("click", async () => {
    out.innerHTML = loading("Analysing chains…");
    const heavy = root.querySelector("#b-heavy").value.trim();
    const light = root.querySelector("#b-light").value.trim();
    const payload = {
      modality: modality.value,
      name: root.querySelector("#b-name").value.trim(),
      target: root.querySelector("#b-target").value.trim() || null,
    };
    if (modality.value === "antibody") {
      Object.assign(payload, {
        heavy_chain: heavy, light_chain: light || null, format: subtype.value,
      });
    } else {
      payload.chains = [{ name: "A", sequence: heavy }];
      if (light) payload.chains.push({ name: "B", sequence: light });
      payload.protein_class = subtype.value;
    }
    try { out.innerHTML = render(await modalityApi.biologic(payload)); }
    catch (error) {
      out.innerHTML = notice(`<strong>Refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });
}

function render(d) {
  return `
    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${esc(d.name)}</h3>
          <span class="dim small">${esc(d.subtype || "")} · ${esc(d.target || "no target stated")}</span></div>
        <span class="md9-rep">${esc(d.representation.replace(/_/g, " "))}</span>
      </header>
      ${d.subtype_meaning ? `<p class="md9-note">${esc(d.subtype_meaning)}</p>` : ""}
      ${d.mechanism ? `<p class="md9-note">${esc(d.mechanism)}</p>` : ""}

      <h4>Chains ${provBadge("calculated")}</h4>
      <div class="md9-scroll"><table class="md9-table">
        <thead><tr><th>Chain</th><th class="num">Residues</th><th class="num">MW (Da)</th>
          <th class="num">pI</th><th class="num">GRAVY</th><th class="num">Cys</th>
          <th class="num">ε (reduced)</th></tr></thead>
        <tbody>${d.chain_properties.map((c) => `
          <tr><td>${esc(c.chain)} <span class="dim small">${esc(c.role)}</span></td>
            <td class="num mono">${c.length}</td>
            <td class="num mono">${c.molecular_weight_da}</td>
            <td class="num mono">${c.isoelectric_point}</td>
            <td class="num mono">${c.gravy}</td>
            <td class="num mono">${c.cysteine_count}</td>
            <td class="num mono">${c.extinction_coefficient_reduced}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="md9-note"><strong>Assembled mass ${d.assembled_mass_da} Da.</strong> ${esc(d.assembled_mass_note)}</p>

      ${(d.cdrs || []).length ? `
        <h4>Complementarity-determining regions ${provBadge("inferred")}</h4>
        ${d.cdrs.map((a) => `
          <div class="md9-cdrblock">
            <div class="md9-cdrblock-head">${esc(a.role)} chain
              <span class="dim small">${esc(a.definition)}</span></div>
            ${a.cdrs.length ? `<div class="md9-cdrs">${a.cdrs.map((c) => `
              <div class="md9-cdr">
                <span class="md9-cdr-name">${esc(c.name)}</span>
                <span class="mono">${esc(c.sequence)}</span>
                <span class="dim small">${c.start}–${c.end} · ${c.length} aa</span>
              </div>`).join("")}</div>` : ""}
            ${a.not_located.length ? `<p class="md9-caveat">Not located: ${a.not_located.map(esc).join(", ")}. ${esc(a.incomplete_note || "")}</p>` : ""}
            <p class="md9-caveat">${esc(a.statement)}</p>
          </div>`).join("")}` : ""}

      <h4>Sequence liability motifs ${provBadge("inferred")}</h4>
      ${d.liabilities.map((l) => `
        <div class="md9-liab">
          <div class="md9-cdrblock-head">chain ${esc(l.chain)}</div>
          <div class="md9-chips">${l.motifs.map((m) =>
            `<span class="md9-chip" title="${esc(m.note)}"><b>${esc(m.motif)}</b> ${esc(
              m.liability.replace(/_/g, " "))} ×${m.count}</span>`).join("") || '<span class="dim small">none found</span>'}</div>
        </div>`).join("")}
      <p class="md9-caveat">${esc(d.liabilities[0]?.statement || "")}</p>

      ${refusalBlock(d.refused_properties)}
      <p class="md9-caveat">${esc(d.representation_note)}</p>
    </section>`;
}
