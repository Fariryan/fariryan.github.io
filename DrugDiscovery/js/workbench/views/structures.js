/**
 * Structures: retrieve, inspect, extract a ligand, prepare, and view in 3D.
 *
 * The 3D view uses the **existing** vendored 3Dmol.js viewer rather than
 * adding Mol*. The phase brief asks that Mol* be evaluated; the evaluation is
 * in docs/phase3-workbench.md and its conclusion is that 3Dmol.js already
 * provides every rendering mode the brief lists — cartoon, ribbon, sticks,
 * spheres, surface, ligand highlighting, residue selection, labels — and that
 * adding a second macromolecular engine would roughly double an already
 * 4.8 MB vendored payload published to GitHub Pages, for capability the
 * platform has. The existing viewer is extended here, not replaced, which is
 * also what the brief requires.
 */

import { esc, loading, notice } from "../../ui.js";
import { wbApi } from "../api.js";

const STYLES = [
  { key: "cartoon", label: "Cartoon" },
  { key: "ribbon", label: "Ribbon" },
  { key: "stick", label: "Sticks" },
  { key: "sphere", label: "Spheres" },
  { key: "surface", label: "Surface" },
];

export async function structuresView(root, params) {
  const preset = params?.get("pdb") || "1IEP";

  root.innerHTML = `
    <section class="wb-controls lg-surface lg-d1">
      <div class="wb-control-row">
        <label for="wb-pdb">PDB entry</label>
        <input id="wb-pdb" type="search" spellcheck="false" value="${esc(preset)}"
               placeholder="A PDB identifier (1IEP) or a UniProt accession (P00519)" />
        <button id="wb-fetch" class="wb-btn">Inspect</button>
      </div>
      <p class="wb-note">
        Retrieved from RCSB at request time. Nothing is cached, so what you see
        is the entry as it stands today.
      </p>
    </section>

    <div id="wb-struct-status"></div>
    <div class="wb-struct-layout">
      <div id="wb-struct-info" class="wb-struct-info"></div>
      <div id="wb-struct-view" class="wb-struct-view lg-surface lg-d1"></div>
    </div>
    <div id="wb-prep-out"></div>`;

  const statusHost = root.querySelector("#wb-struct-status");
  const infoHost = root.querySelector("#wb-struct-info");
  const viewHost = root.querySelector("#wb-struct-view");
  const prepHost = root.querySelector("#wb-prep-out");
  const input = root.querySelector("#wb-pdb");

  let currentPdbId = null;
  let viewer = null;

  async function fetchStructure() {
    const value = input.value.trim();
    if (!value) return;
    statusHost.innerHTML = loading(`Retrieving ${esc(value)} from RCSB…`);
    infoHost.innerHTML = "";
    prepHost.innerHTML = "";
    try {
      const info = await wbApi.inspect(value);
      currentPdbId = info.pdb_id;
      statusHost.innerHTML = "";
      renderInfo(info);
      await renderViewer(info);
    } catch (error) {
      statusHost.innerHTML = notice(
        `<strong>Could not retrieve that structure.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  }

  function renderInfo(info) {
    const experimental = info.experimental || {};
    infoHost.innerHTML = `
      <section class="wb-out lg-surface lg-d1">
        <header class="wb-pane-head">
          <h3>${esc(info.pdb_id)}</h3>
          <span class="dim small">${esc(experimental.method || "method not stated")}${
            experimental.resolution_angstrom
              ? ` · ${experimental.resolution_angstrom} Å`
              : ""
          }</span>
        </header>
        ${
          info.header?.title
            ? `<p class="wb-struct-title">${esc(info.header.title)}</p>`
            : ""
        }
        ${
          experimental.resolution_note
            ? `<p class="wb-note">${esc(experimental.resolution_note)}</p>`
            : ""
        }

        <h4>Chains</h4>
        <div class="wb-chips">
          ${info.chains
            .map(
              (c) =>
                `<span class="wb-chip">${esc(c.chain)} <b>${c.residue_count}</b> residues</span>`
            )
            .join("")}
        </div>

        <h4>Heteroatoms</h4>
        <table class="wb-table">
          <thead><tr><th>Residue</th><th>Class</th><th class="num">Atoms</th><th class="num">Copies</th><th></th></tr></thead>
          <tbody>
            ${info.heteroatoms
              .slice(0, 14)
              .map(
                (h) => `<tr>
                  <td class="mono">${esc(h.residue_name)}</td>
                  <td><span class="wb-class wb-class-${esc(h.classification)}">${esc(
                    h.classification
                  )}</span></td>
                  <td class="num mono">${h.atom_count}</td>
                  <td class="num mono">${h.copies}</td>
                  <td>${
                    h.is_candidate_ligand
                      ? `<button class="wb-btn-quiet" data-ligand="${esc(
                          h.residue_name
                        )}">Binding site</button>`
                      : ""
                  }</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
        <p class="wb-note">${esc(info.classification_policy)}</p>

        <div class="wb-actions">
          <button id="wb-prepare" class="wb-btn">Prepare with PDBFixer</button>
        </div>
      </section>`;

    infoHost.querySelectorAll("[data-ligand]").forEach((button) => {
      button.addEventListener("click", () => showLigand(button.dataset.ligand));
    });
    infoHost.querySelector("#wb-prepare")?.addEventListener("click", prepare);
  }

  async function showLigand(residueName) {
    prepHost.innerHTML = loading(`Extracting ${esc(residueName)}…`);
    try {
      const ligand = await wbApi.ligand(currentPdbId, residueName);
      prepHost.innerHTML = `
        <section class="wb-out lg-surface lg-d1">
          <header class="wb-pane-head">
            <h3>Binding site — ${esc(ligand.residue_name)}</h3>
            <span class="dim small">copy ${esc(ligand.copy)} · ${ligand.atom_count} atoms</span>
          </header>
          <table class="wb-props"><tbody>
            <tr><th>Centre (x, y, z)</th><td class="mono">${ligand.centroid
              .map((v) => v.toFixed(3))
              .join(", ")} Å</td></tr>
            <tr><th>Extent</th><td class="mono">${ligand.extent_angstrom
              .map((v) => v.toFixed(1))
              .join(" × ")} Å</td></tr>
            <tr><th>Inferred SMILES</th><td class="mono small">${esc(
              (ligand.inferred_smiles || "—").slice(0, 120)
            )}</td></tr>
          </tbody></table>
          ${
            ligand.copy_note
              ? `<p class="wb-warn-note">${esc(ligand.copy_note)}</p>`
              : ""
          }
          <p class="wb-warn-note">${esc(ligand.structure_caveat || "")}</p>
          <p class="wb-note">${esc(ligand.centroid_note)}</p>
        </section>`;
      if (viewer) highlightLigand(residueName);
    } catch (error) {
      prepHost.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  }

  async function prepare() {
    prepHost.innerHTML = loading("PDBFixer is repairing the structure…");
    try {
      const result = await wbApi.prepare(currentPdbId, {
        add_missing_atoms: true,
        add_hydrogens: true,
        ph: 7.4,
        keep_heterogens: "none",
      });
      prepHost.innerHTML = `
        <section class="wb-out lg-surface lg-d1">
          <header class="wb-pane-head">
            <h3>Prepared — ${result.modification_count} modification${
              result.modification_count === 1 ? "" : "s"
            }</h3>
            <span class="dim small">${esc(result.tool)}${
              result.tool_version ? ` ${esc(result.tool_version)}` : ""
            }</span>
          </header>
          <table class="wb-props"><tbody>
            <tr><th>Original</th><td class="mono small">${esc(
              result.original_sha256.slice(0, 24)
            )}… · ${result.original_atom_count} atoms</td></tr>
            <tr><th>Prepared</th><td class="mono small">${esc(
              result.prepared_sha256.slice(0, 24)
            )}… · ${result.prepared_atom_count} atoms</td></tr>
          </tbody></table>

          <h4>Modification log</h4>
          <table class="wb-table">
            <thead><tr><th>Change</th><th class="num">Count</th><th>Detail</th></tr></thead>
            <tbody>
              ${result.modifications
                .map(
                  (m) => `<tr>
                    <td class="mono small">${esc(m.kind)}</td>
                    <td class="num mono">${m.count}</td>
                    <td class="small dim">${esc(m.detail)}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
          ${
            result.warnings?.length
              ? `<div class="wb-notes">${result.warnings
                  .map((w) => `<div>⚠ ${esc(w)}</div>`)
                  .join("")}</div>`
              : ""
          }
          <p class="wb-warn-note">${esc(result.provenance_note)}</p>
        </section>`;
    } catch (error) {
      prepHost.innerHTML = notice(
        `<strong>Preparation failed.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  }

  async function renderViewer(info) {
    if (!window.$3Dmol) {
      viewHost.innerHTML = notice(
        "The 3D viewer library did not load. Everything above is unaffected.",
        "warn",
        "⚠"
      );
      return;
    }
    viewHost.innerHTML = `
      <div class="wb-view-controls">
        ${STYLES.map(
          (s) =>
            `<button class="wb-btn-quiet" data-style="${esc(s.key)}">${esc(s.label)}</button>`
        ).join("")}
        <button class="wb-btn-quiet" data-style="reset">Reset</button>
      </div>
      <div id="wb-3d" class="wb-3d">${loading("Loading coordinates…")}</div>`;

    try {
      const file = await wbApi.download(info.pdb_id);
      const host = viewHost.querySelector("#wb-3d");
      host.innerHTML = "";
      viewer = window.$3Dmol.createViewer(host, { backgroundColor: "rgb(4,17,11)" });
      viewer.addModel(file.content, "pdb");
      applyStyle("cartoon");
      viewer.zoomTo();
      viewer.render();

      viewHost.querySelectorAll("[data-style]").forEach((button) => {
        button.addEventListener("click", () => applyStyle(button.dataset.style));
      });
    } catch (error) {
      viewHost.querySelector("#wb-3d").innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  }

  function applyStyle(style) {
    if (!viewer) return;
    viewer.setStyle({}, {});
    viewer.removeAllSurfaces();
    if (style === "surface") {
      viewer.setStyle({}, { cartoon: { color: "spectrum", opacity: 0.7 } });
      viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
        opacity: 0.65,
        color: "white",
      });
    } else if (style === "ribbon") {
      viewer.setStyle({}, { cartoon: { style: "trace", color: "spectrum" } });
    } else if (style === "reset") {
      viewer.setStyle({}, { cartoon: { color: "spectrum" } });
      viewer.zoomTo();
    } else if (style === "cartoon") {
      viewer.setStyle({}, { cartoon: { color: "spectrum" } });
    } else {
      viewer.setStyle({}, { [style]: { colorscheme: "default" } });
    }
    // Heteroatoms always drawn as sticks: a cartoon hides the very thing a
    // binding-site question is about.
    viewer.setStyle({ hetflag: true }, { stick: { radius: 0.22, colorscheme: "greenCarbon" } });
    viewer.render();
  }

  function highlightLigand(residueName) {
    if (!viewer) return;
    viewer.setStyle({ resn: residueName }, {
      stick: { radius: 0.32, colorscheme: "orangeCarbon" },
      sphere: { radius: 0.42 },
    });
    viewer.zoomTo({ resn: residueName });
    viewer.render();
  }

  root.querySelector("#wb-fetch").addEventListener("click", fetchStructure);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      fetchStructure();
    }
  });

  fetchStructure();
}
