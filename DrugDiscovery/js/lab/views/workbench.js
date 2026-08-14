/**
 * Candidate Workbench.
 *
 * An isolated workspace: candidates live in this browser's localStorage under
 * the lab's own key, so nothing here touches the atlas's comparison tray.
 *
 * Exports carry the provenance with them. A CSV of SMILES with no model
 * versions is not a scientific record, and whoever receives it could not check
 * a single number in it.
 */

import { card, empty, esc, notice } from "../../ui.js";
import { labApi } from "../api.js";
import { workbench } from "../store.js";
import { downloadBlob, provBadge, wireProvenance } from "../ui.js";

const COLUMNS = [
  { key: "molecular_weight", label: "MW", digits: 1 },
  { key: "clogp", label: "cLogP", digits: 2 },
  { key: "tpsa", label: "TPSA", digits: 1 },
  { key: "hbd", label: "HBD" },
  { key: "hba", label: "HBA" },
  { key: "rotatable_bonds", label: "RotB" },
  { key: "qed", label: "QED", digits: 3 },
  { key: "cns_mpo", label: "CNS MPO", digits: 2 },
  { key: "synthetic_accessibility", label: "SA", digits: 2 },
  { key: "structural_alerts", label: "Alerts" },
];

export async function workbenchView(root) {
  const render = (items) => {
    if (!items.length) {
      root.innerHTML = empty(
        "No candidates saved. Generate analogues in the Molecule Designer and " +
          "press Save on the ones worth keeping."
      );
      return;
    }

    root.innerHTML = `
      <div class="toolbar mb">
        <span class="dim small">${items.length} candidate(s)</span>
        <span class="spacer"></span>
        <button class="sm" data-export="csv">Export CSV</button>
        <button class="sm" data-export="json">Export JSON</button>
        <button class="sm" data-export="sdf">Export SDF</button>
        <button class="sm" data-export="smi">Export SMILES</button>
        <button class="sm" id="wb-clear">Clear all</button>
      </div>

      ${card(
        "Structures",
        `<div class="cand-grid">
          ${items
            .map(
              (item) => `
            <article class="cand">
              <div class="depict">
                <img loading="lazy" src="${esc(
                  labApi.depictionUrl(item.smiles, 250, 175)
                )}" alt="candidate" />
              </div>
              <div class="body">
                <div class="transform">${esc(
                  item.transformation?.name || item.design_mode || "saved structure"
                )}</div>
                <div class="smiles">${esc(item.smiles)}</div>
                ${
                  item.properties?.bbb
                    ? `<div class="small">BBB ${item.properties.bbb.probability}
                       <span class="dim">(${esc(item.properties.bbb.model)}
                       ${esc(item.properties.bbb.model_version)}${
                         item.properties.bbb.inside_applicability_domain
                           ? ""
                           : ", outside applicability domain"
                       })</span></div>`
                    : `<div class="small dim">No BBB prediction stored for this candidate.</div>`
                }
                <div class="row">
                  <a class="sm" href="#/lab/bbb?smiles=${encodeURIComponent(
                    item.smiles
                  )}">BBB</a>
                  <a class="sm" href="#/lab/molecular3d?smiles=${encodeURIComponent(
                    item.smiles
                  )}">3D</a>
                  <a class="sm" href="#/lab/designer?smiles=${encodeURIComponent(
                    item.smiles
                  )}">Design from</a>
                  <button class="sm" data-remove="${esc(item.inchikey)}">Remove</button>
                </div>
              </div>
            </article>`
            )
            .join("")}
        </div>`
      )}

      ${card(
        "Property matrix",
        `<div class="table-scroll">
          <table class="wb-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Parent</th>
                <th>Transformation</th>
                ${COLUMNS.map((column) => `<th>${esc(column.label)}</th>`).join("")}
                <th>BBB</th>
                <th>Experimental</th>
                <th>Front</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(row).join("")}
            </tbody>
          </table>
        </div>
        <div class="lab-note">
          Columns marked BBB are model predictions with an applicability-domain
          flag; every other column is calculated from the structure. Exports
          carry the model name and version for each prediction, so a number in
          the file can always be traced to the model that produced it.
        </div>`
      )}

      ${card(
        "What leaves this platform",
        `<dl class="kv">
          <dt>CSV</dt><dd>One row per candidate with a provenance header, every
            calculated property, and the BBB model name, version and
            applicability-domain flag.</dd>
          <dt>JSON</dt><dd>The complete stored payload, including the full
            provenance block for every value.</dd>
          <dt>SDF</dt><dd>2D molblocks with every property written as an SD tag,
            plus the export notice.</dd>
          <dt>SMILES</dt><dd>Structures and InChIKeys only, with a header stating
            the versions that produced them.</dd>
        </dl>`
      )}`;

    root.querySelectorAll("[data-remove]").forEach((button) =>
      button.addEventListener("click", () => workbench.remove(button.dataset.remove))
    );
    root.querySelector("#wb-clear")?.addEventListener("click", () => {
      if (confirm("Remove every saved candidate from this workbench?")) {
        workbench.clear();
      }
    });
    root.querySelectorAll("[data-export]").forEach((button) =>
      button.addEventListener("click", async () => {
        const format = button.dataset.export;
        button.disabled = true;
        try {
          const blob = await labApi.exportCandidates(workbench.all(), format);
          downloadBlob(blob, `discovery-lab-candidates.${format}`);
        } catch (error) {
          alert(`Export failed: ${error.message}`);
        } finally {
          button.disabled = false;
        }
      })
    );

    wireProvenance(root);
  };

  workbench.subscribe(render);
}

function row(item) {
  const properties = item.properties || {};
  const bbb = properties.bbb;
  const experimental = bbb?.experimental;

  return `<tr>
    <td class="mono" title="${esc(item.smiles)}">${esc(item.smiles.slice(0, 26))}${
      item.smiles.length > 26 ? "…" : ""
    }</td>
    <td class="mono dim">${esc((item.parent_smiles || "").slice(0, 18))}</td>
    <td>${esc(item.transformation?.name || "—")}</td>
    ${COLUMNS.map((column) => {
      const value = properties[column.key];
      return `<td class="num">${
        value === null || value === undefined
          ? "—"
          : column.digits
            ? Number(value).toFixed(column.digits)
            : value
      }</td>`;
    }).join("")}
    <td class="num" title="${esc(
      bbb ? `${bbb.model} ${bbb.model_version}` : "no prediction stored"
    )}">${
      bbb
        ? `${bbb.probability}${bbb.inside_applicability_domain ? "" : " *"}`
        : "—"
    }</td>
    <td class="num">${
      experimental?.logbb_mean !== undefined && experimental?.logbb_mean !== null
        ? experimental.logbb_mean
        : "—"
    }</td>
    <td class="num">${item.pareto_front ?? "—"}</td>
  </tr>`;
}
