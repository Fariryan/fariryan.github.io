/**
 * In Silico stage: docking and molecular dynamics.
 *
 * Both are real engines behind a job queue. Where an engine is absent the
 * panel says so and offers nothing — there is no illustrative pose and no
 * placeholder trajectory.
 */

import { card, esc, loading, notice } from "../../ui.js";
import { StructureViewer } from "../../viewer-molecule.js";
import { pcApi } from "../api.js";
import { bindJob } from "../../jobstore.js";
import { needsMolecule, subject } from "../router.js";
import { statusValue, unavailable } from "../ui.js";

let viewer = null;

export async function inSilicoView(root, params, status) {
  const molecule = subject.get();
  if (!molecule?.smiles) {
    root.innerHTML = needsMolecule();
    return;
  }

  const docking = status.stages.docking || {};
  const dynamics = status.stages.molecular_dynamics || {};

  root.innerHTML = `
    ${card(
      "Receptor",
      `<div class="toolbar">
        <input class="search-input" id="pc-pdb" type="text" placeholder="PDB ID (e.g. 1M17)"
               value="${esc(params?.get("pdb") || "1M17")}" style="max-width:150px" />
        <input class="search-input" id="pc-ref" type="text" placeholder="Bound ligand HET code (e.g. AQ4)"
               value="${esc(params?.get("ligand") || "AQ4")}" style="max-width:230px" />
        <label class="row small">Exhaustiveness
          <select id="pc-exh"><option>8</option><option>16</option><option>32</option></select>
        </label>
        <span id="pc-dock-control"></span>
      </div>
      <div class="lab-note">
        The search box is centred on the co-crystallised ligand you name, and
        that ligand is removed from the receptor before docking — docking into a
        pocket that still holds its reference ligand scores a site that is not
        there. Without a named ligand or explicit residues, no box is guessed
        and the run declines.
      </div>`
    )}

    <div id="pc-dock-status"></div>
    <div id="pc-dock-result"></div>

    ${card(
      "Molecular dynamics",
      dynamics.available
        ? `<div class="toolbar">
             <label class="row small">Production
               <select id="pc-ps">
                 <option value="50">50 ps</option>
                 <option value="100" selected>100 ps</option>
                 <option value="250">250 ps</option>
                 <option value="500">500 ps</option>
               </select>
             </label>
             <span id="pc-md-control"></span>
             <span class="small dim">${esc(dynamics.engine)} ${esc(
               dynamics.version || ""
             )} · ${esc(dynamics.preferred_platform || "CPU")}</span>
           </div>
           <div class="lab-note">${esc(dynamics.note || "")}</div>
           <div id="pc-md-status"></div>
           <div id="pc-md-result"></div>`
        : unavailable({
            what: "Molecular dynamics",
            reason: dynamics.reason || "OpenMM is not installed.",
            remedy: dynamics.install,
          })
    )}`;

  if (!docking.available) {
    root.querySelector("#pc-dock-result").innerHTML = unavailable({
      what: "Molecular docking",
      reason:
        docking.binary === null
          ? "No AutoDock Vina binary is installed on this server."
          : "Ligand preparation (Meeko) is unavailable.",
      remedy: docking.install,
    });
  }

  // Both stages reattach to whatever is already running for them, so leaving
  // the tab and coming back shows a live run rather than an empty panel.
  bindJob(root, "pc-docking", {
    control: "#pc-dock-control",
    output: "#pc-dock-result",
    runLabel: "Dock",
    disabled: !docking.available,
    start: () => startDocking(root, molecule),
    render: renderDocking,
  });

  if (dynamics.available) {
    bindJob(root, "pc-dynamics", {
      control: "#pc-md-control",
      output: "#pc-md-result",
      runLabel: "Run dynamics",
      start: () => startDynamics(root),
      render: renderDynamics,
    });
  }
}


function startDocking(root, molecule) {
  return pcApi.dock({
    smiles: molecule.smiles,
    pdb_id: root.querySelector("#pc-pdb").value.trim(),
    reference_ligand: root.querySelector("#pc-ref").value.trim() || null,
    exhaustiveness: Number(root.querySelector("#pc-exh").value),
    num_modes: 5,
    force: true,
  });
}


function renderDocking(host, result) {
  if (!result.available) {
    host.innerHTML = unavailable(result);
    return;
  }

  const best = result.poses[0];
  host.innerHTML = card(
    `Docking — ${esc(result.pdb_id)}`,
    `<div class="assumption-banner">
       <strong>This is a docking score, not a binding affinity.</strong>
       ${esc(result.score_meaning.typical_error)}
     </div>
     <div class="row mb">
       <strong style="font-size:16px">${statusValue(best.docking_score)}</strong>
       <span class="dim small">best of ${result.pose_count} poses · ${esc(
         result.box_definition || ""
       )}</span>
     </div>
     <table class="param-table">
       <tr><th>Pose</th><th>Score</th><th>H-bonds</th><th>Hydrophobic</th><th>Ionic</th></tr>
       ${result.poses
         .map(
           (pose) => `<tr>
             <td>${pose.rank}</td>
             <td class="num">${statusValue(pose.docking_score)}</td>
             <td class="num">${pose.interactions.hydrogen_bonds.length}</td>
             <td class="num">${pose.interactions.hydrophobic.length}</td>
             <td class="num">${pose.interactions.ionic.length}</td>
           </tr>`
         )
         .join("")}
     </table>

     <h4 style="margin:16px 0 7px;font-size:13px">Contacts in the best pose</h4>
     <div class="row" style="gap:5px">
       ${best.interactions.contact_residues
         .slice(0, 12)
         .map(
           (residue) =>
             `<span class="chip" title="${residue.contacts} contacts, closest ${residue.min_distance.toFixed(
               2
             )} Å">${esc(residue.residue)}${residue.number}</span>`
         )
         .join("")}
     </div>
     ${
       best.interactions.hydrogen_bonds.length
         ? `<div class="mt small muted">Hydrogen-bond candidates:
            ${best.interactions.hydrogen_bonds
              .slice(0, 5)
              .map((b) => `${esc(b.residue)} (${b.distance} Å)`)
              .join(", ")}</div>`
         : ""
     }
     <div class="lab-note">${esc(best.interactions.caveat)}</div>

     <h4 style="margin:16px 0 7px;font-size:13px">Preparation</h4>
     <div class="small muted">
       Removed solvent: ${esc(
         JSON.stringify(result.receptor_preparation.removed_heteroatoms)
       )}<br />
       Removed reference ligand: ${esc(
         JSON.stringify(result.receptor_preparation.removed_reference_ligand)
       )}<br />
       Ligand: ${esc(result.ligand_preparation.embedding)},
       ${esc(result.ligand_preparation.minimisation)},
       ${result.ligand_preparation.rotatable_bonds} rotatable bonds
     </div>
     <div class="lab-note">
       Reproducibility — engine ${esc(result.reproducibility.engine)}
       ${esc(result.reproducibility.version)}, seed ${result.reproducibility.seed},
       exhaustiveness ${result.reproducibility.exhaustiveness}.
       ${esc(result.reproducibility.note)}
     </div>`
  );
}

function startDynamics(root) {
  return pcApi.dynamics({
    pdb_id: root.querySelector("#pc-pdb").value.trim(),
    picoseconds: Number(root.querySelector("#pc-ps").value),
    equilibration_ps: 10,
    frame_interval_ps: 2,
    force: true,
  });
}


function renderDynamics(host, result) {
  if (!result.available) {
    host.innerHTML = unavailable(result);
    return;
  }

  const trajectory = result.trajectory;
  const analysis = result.analysis;
  const rmsd = analysis.protein_rmsd.value;
  const times = analysis.times_ps;

  import("../ui.js").then(({ linePlot }) => {
    host.innerHTML = `
      <div class="row mb mt">
        <strong>${trajectory.production_ps} ps</strong>
        <span class="dim small">(${trajectory.production_ns} ns) ·
          ${trajectory.frames} frames · ${esc(trajectory.platform)} ·
          ${trajectory.throughput_ps_per_minute} ps/min</span>
      </div>
      ${linePlot(
        [
          {
            points: times.map((t, index) => ({ x: t, y: rmsd[index] })),
            color: "var(--st-simulated)",
          },
        ],
        { xLabel: "time (ps)", yLabel: "Cα RMSD (Å)" }
      )}
      <div class="plot-legend">
        <span><span class="swatch" style="background:var(--st-simulated)"></span>
        heavy-atom RMSD to the first production frame</span>
      </div>
      <table class="param-table mt">
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Final RMSD</td><td class="num">${analysis.rmsd_final} Å</td></tr>
        <tr><td>Mean RMSD</td><td class="num">${analysis.rmsd_mean} Å</td></tr>
        <tr><td>Cα atoms</td><td class="num">${analysis.calpha_count}</td></tr>
        <tr><td>Heavy atoms</td><td class="num">${analysis.heavy_atom_count}</td></tr>
      </table>
      <ul class="small muted mt" style="padding-left:17px">
        ${result.caveats.map((caveat) => `<li>${esc(caveat)}</li>`).join("")}
      </ul>`;
  });
}
