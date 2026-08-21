/** Protein-protein interfaces, computed from deposited coordinates. */

import { esc, loading, notice } from "../../ui.js";
import { modalityApi } from "../api.js";
import { barChart, propTable, provBadge } from "./shared.js";

const EXAMPLES = [
  { pdb: "1BRS", label: "1BRS — barnase / barstar", a: "A", b: "D" },
  { pdb: "1N8Z", label: "1N8Z — trastuzumab Fab / HER2", a: "B", b: "C" },
  { pdb: "3HFM", label: "3HFM — antibody HyHEL-10 / lysozyme", a: "H", b: "Y" },
];

export async function interfaceView(root, params) {
  root.innerHTML = `
    <section class="md9-panel lg-surface lg-d1">
      <div class="md9-examples">
        ${EXAMPLES.map((e, i) => `<button class="md9-pill" data-example="${i}">${esc(e.label)}</button>`).join("")}
      </div>
      <div class="md9-inline">
        <div><label for="i-pdb">PDB identifier</label>
          <input id="i-pdb" type="text" value="${esc(params?.get("pdb") || "1BRS")}" maxlength="4" spellcheck="false" /></div>
        <div><label for="i-a">Chain A</label><input id="i-a" type="text" value="A" maxlength="2" /></div>
        <div><label for="i-b">Chain B</label><input id="i-b" type="text" value="D" maxlength="2" /></div>
        <div><label for="i-cut">Contact cutoff (Å)</label>
          <input id="i-cut" type="number" value="4.5" step="0.1" min="3" max="8" /></div>
      </div>
      <div class="md9-actions">
        <button id="i-scan" class="md9-btn ghost">Scan every chain pair</button>
        <button id="i-go" class="md9-btn">Analyse this interface</button>
      </div>
    </section>
    <div id="i-out"></div>`;

  root.querySelectorAll("[data-example]").forEach((button) =>
    button.addEventListener("click", () => {
      const example = EXAMPLES[Number(button.dataset.example)];
      root.querySelector("#i-pdb").value = example.pdb;
      root.querySelector("#i-a").value = example.a;
      root.querySelector("#i-b").value = example.b;
    }));

  const out = root.querySelector("#i-out");

  root.querySelector("#i-scan").addEventListener("click", async () => {
    out.innerHTML = loading("Downloading the structure and scanning every chain pair…");
    try {
      const data = await modalityApi.structureInterfaces(
        root.querySelector("#i-pdb").value.trim());
      out.innerHTML = renderScan(data, root);
      out.querySelectorAll("[data-pair]").forEach((row) =>
        row.addEventListener("click", () => {
          const [a, b] = row.dataset.pair.split(",");
          root.querySelector("#i-a").value = a;
          root.querySelector("#i-b").value = b;
          root.querySelector("#i-go").click();
        }));
    } catch (error) { out.innerHTML = notice(esc(error.message), "warn", "⚠"); }
  });

  root.querySelector("#i-go").addEventListener("click", async () => {
    out.innerHTML = loading("Computing contacts and solvent-accessible surface…");
    try {
      out.innerHTML = render(await modalityApi.interface({
        pdb_id: root.querySelector("#i-pdb").value.trim(),
        chain_a: root.querySelector("#i-a").value.trim() || null,
        chain_b: root.querySelector("#i-b").value.trim() || null,
        cutoff: Number(root.querySelector("#i-cut").value),
      }));
    } catch (error) {
      out.innerHTML = notice(`<strong>Refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });
}

function renderScan(d) {
  if (d.status !== "ok") {
    return notice(esc(d.reason || "no interface found"), "info", "◌");
  }
  return `
    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${d.count} interface${d.count === 1 ? "" : "s"} in ${esc(d.pdb_id || "")}</h3>
          <span class="dim small">chains ${d.chains.map(esc).join(", ")}</span></div>
      </header>
      <p class="md9-note">${esc(d.note)}</p>
      <div class="md9-scroll"><table class="md9-table">
        <thead><tr><th>Chains</th><th class="num">Interface residues</th><th class="num">Contacts</th>
          <th class="num">Area (Å² / side)</th><th>Assessment</th><th class="num">Hotspot candidates</th></tr></thead>
        <tbody>${d.interfaces.map((i) => `
          <tr data-pair="${esc(i.chains.join(","))}" class="clickable">
            <td class="mono">${esc(i.chains.join(" – "))}</td>
            <td class="num mono">${i.interface_residues}</td>
            <td class="num mono">${i.contacts}</td>
            <td class="num mono">${i.interface_area_angstrom2}</td>
            <td><span class="md9-sig md9-sig-${esc(i.significance)}">${esc(i.significance.replace(/_/g, " "))}</span></td>
            <td class="num mono">${i.hotspot_candidates}</td>
          </tr>`).join("")}</tbody>
      </table></div>
    </section>`;
}

function render(d) {
  if (d.status !== "ok") {
    return notice(esc(d.reason || "no interface"), "info", "◌");
  }
  const b = d.buried_surface;
  const sig = d.biological_significance;
  const e = d.electrostatics;
  return `
    <section class="md9-panel lg-surface lg-d1">
      <header class="md9-panel-head">
        <div><h3>${esc(d.pdb_id || "structure")} · chains ${esc(d.chains.join(" – "))}</h3>
          <span class="dim small">${d.interface_residue_count} interface residues · ${d.contact_count} contacts within ${d.cutoff_angstrom} Å</span></div>
        <span class="md9-sig md9-sig-${esc(sig.verdict)}">${esc(sig.verdict.replace(/_/g, " "))}</span>
      </header>

      <div class="md9-stats">
        <div><b>${b.interface_area_angstrom2}</b><span>Å² buried per side</span></div>
        <div><b>${d.interface_residue_count}</b><span>interface residues</span></div>
        <div><b>${d.contact_count}</b><span>heavy-atom contacts</span></div>
        <div><b>${d.salt_bridges.length}</b><span>salt bridges</span></div>
        <div><b>${d.hotspots.candidates.length}</b><span>hotspot candidates</span></div>
      </div>
      <p class="md9-note"><strong>${esc(sig.verdict.replace(/_/g, " "))}.</strong> ${esc(sig.note)}</p>
      <p class="md9-caveat">${esc(sig.caveat)}</p>
      ${b.note ? `<p class="md9-caveat">${esc(b.note)}</p>` : ""}

      <h4>Contacts ${provBadge("calculated")}</h4>
      ${barChart(Object.entries(d.contact_breakdown).map(([k, v]) => ({ kind: k, n: v })),
                 { valueKey: "n", labelKey: "kind" })}

      <h4>Interface residues ${provBadge("calculated")}</h4>
      <div class="md9-scroll"><table class="md9-table">
        <thead><tr><th>Chain</th><th>Residue</th><th class="num">Contacts</th>
          <th class="num">Closest (Å)</th><th class="num">Buried (Å²)</th>
          <th class="num">Relative burial</th><th>Partners</th></tr></thead>
        <tbody>${d.interface_residues.map((r) => `
          <tr>
            <td class="mono">${esc(r.chain)}</td>
            <td class="mono">${esc(r.name)}${r.number}</td>
            <td class="num mono">${r.contacts}</td>
            <td class="num mono">${r.min_distance_angstrom}</td>
            <td class="num mono">${r.buried_area_angstrom2}</td>
            <td class="num mono">${r.relative_burial ?? "—"}</td>
            <td class="small dim">${r.partners.slice(0, 4).map(esc).join(", ")}</td>
          </tr>`).join("")}</tbody>
      </table></div>

      <h4>Candidate hotspots ${provBadge(d.hotspots.provenance_type)}</h4>
      ${d.hotspots.candidates.length ? `
        <div class="md9-scroll"><table class="md9-table">
          <thead><tr><th>Chain</th><th>Residue</th><th class="num">Score</th>
            <th class="num">Relative burial</th><th class="num">Buried (Å²)</th>
            <th class="num">Residue enrichment</th><th class="num">Contacts</th></tr></thead>
          <tbody>${d.hotspots.candidates.map((h) => `
            <tr>
              <td class="mono">${esc(h.chain)}</td><td class="mono">${esc(h.residue)}</td>
              <td class="num mono"><span class="md9-score" style="--v:${h.score}">${h.score}</span></td>
              <td class="num mono">${h.relative_burial}</td>
              <td class="num mono">${h.buried_area_angstrom2}</td>
              <td class="num mono">${h.residue_enrichment}</td>
              <td class="num mono">${h.contacts}</td>
            </tr>`).join("")}</tbody>
        </table></div>` : `<p class="dim small">No residue reached the ${d.hotspots.threshold} threshold.</p>`}
      <p class="md9-note">${esc(d.hotspots.method)}</p>
      <p class="md9-caveat"><strong>${esc(d.hotspots.statement)}</strong></p>

      <h4>Electrostatic context ${provBadge(e.provenance_type)}</h4>
      <div class="md9-grid">
        ${Object.entries(e.per_side).map(([chain, side]) => `
          <div><h5>chain ${esc(chain)}</h5>${propTable(side)}</div>`).join("")}
      </div>
      <p class="md9-note">Charge complementary: <strong>${e.charge_complementary ? "yes" : "no"}</strong> · ${e.salt_bridge_count} salt bridge${e.salt_bridge_count === 1 ? "" : "s"}</p>
      ${d.salt_bridges.length ? `<div class="md9-chips">${d.salt_bridges.slice(0, 12).map((s) =>
        `<span class="md9-chip mono" title="${esc(s.note)}">${esc(s.a)} ↔ ${esc(s.b)} · ${s.distance_angstrom} Å</span>`).join("")}</div>` : ""}
      <p class="md9-caveat">${esc(e.statement)}</p>

      <p class="md9-caveat"><strong>${esc(d.provenance.statement)}</strong><br />
        <span class="dim small">${esc(d.provenance.computed_from)} · ${esc(d.provenance.software)}</span></p>
    </section>`;
}
