/**
 * Free energy.
 *
 * When the toolkit is absent this view's job is to say so precisely — and to
 * still be useful, because a transformation network is a design decision that
 * can be reviewed before any calculation is possible. Every edge shows a null
 * ΔΔG, never an estimate.
 */

import { esc, loading, notice } from "../../ui.js";
import { mdApi } from "../api.js";

export async function freeEnergyView(root) {
  root.innerHTML = loading("Checking the free-energy engine…");
  let status;
  try { status = await mdApi.freeEnergyStatus(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  const collision = status.pypi_name_collision;
  root.innerHTML = `
    <section class="md-engine lg-surface lg-d1 ${status.available ? "" : "absent"}">
      <header class="md-engine-head">
        <div><strong>${esc(status.tool)}</strong>
          <span class="dim small">${esc(status.licence)}</span></div>
        <span class="md-state md-state-${status.available ? "complete" : "failed"}">
          ${status.available ? "● available" : "⚠ not available"}</span>
      </header>
      ${status.available ? "" : `
        <p class="md-note">${esc(status.reason)}</p>
        <table class="md-props"><tbody>
          <tr><th>Distribution</th><td>${esc(status.distribution)}</td></tr>
          <tr><th>Install</th><td class="mono">${esc(status.install)}</td></tr>
          <tr><th>Project</th><td class="mono small">${esc(status.source)}</td></tr>
        </tbody></table>
        ${collision ? `<div class="md-collision">
          <strong>⚠ Package-name collision</strong>
          <p>${esc(collision.warning)}</p>
          <p class="mono small dim">PyPI <code>openfe</code> → ${esc(collision.pypi_project)}<br />
             Correct project → ${esc(collision.correct_project)}</p>
        </div>` : ""}
        <p class="md-caveat">${esc(status.consequence)}</p>
        <h4>What would be required</h4>
        <ul class="md-list">${(status.what_would_be_required || [])
          .map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`}
    </section>

    <section class="md-controls lg-surface lg-d1">
      <label for="md-fe-ligands">Ligand series — one SMILES per line, optional name</label>
      <textarea id="md-fe-ligands" rows="5" spellcheck="false">CC(=O)Oc1ccccc1C(=O)O aspirin
OC(=O)c1ccccc1O salicylic-acid
OC(=O)c1ccc(C)cc1 p-toluic-acid
OC(=O)c1ccc(Cl)cc1 p-chlorobenzoic</textarea>
      <div class="md-actions"><button id="md-plan" class="md-btn">Plan network</button></div>
      <p class="md-note">
        Consecutive ligands are connected, then the series is closed into a
        cycle. Cycle closure is the only internal consistency check an RBFE
        campaign has, which is why a network without cycles is a weaker design.
      </p>
    </section>
    <div id="md-fe-out"></div>`;

  root.querySelector("#md-plan").addEventListener("click", async () => {
    const out = root.querySelector("#md-fe-out");
    const lines = root.querySelector("#md-fe-ligands").value
      .split("\n").map((l) => l.trim()).filter(Boolean)
      .map((l) => { const [s, ...rest] = l.split(/\s+/); return { smiles: s, label: rest.join(" ") || null }; });
    if (lines.length < 2) { out.innerHTML = notice("At least two ligands are needed.", "warn", "⚠"); return; }

    const transformations = [];
    for (let i = 0; i < lines.length - 1; i++) {
      transformations.push({ ligand_a: lines[i].smiles, ligand_b: lines[i + 1].smiles,
                             label_a: lines[i].label, label_b: lines[i + 1].label });
    }
    if (lines.length > 2) {
      transformations.push({ ligand_a: lines[lines.length - 1].smiles, ligand_b: lines[0].smiles,
                             label_a: lines[lines.length - 1].label, label_b: lines[0].label });
    }

    out.innerHTML = loading("Planning…");
    try {
      const network = await mdApi.planNetwork(transformations);
      out.innerHTML = renderNetwork(network);
    } catch (error) {
      out.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

function renderNetwork(network) {
  const nodes = network.nodes;
  const w = 560, h = 320, cx = w / 2, cy = h / 2, r = 110;
  const positions = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  const byLigand = Object.fromEntries(positions.map((p) => [p.ligand, p]));

  return `
    <section class="md-out lg-surface lg-d1">
      <header class="md-engine-head">
        <h3>${network.node_count} ligands, ${network.edge_count} transformations</h3>
        <span class="md-state md-state-queued">${esc(network.status.replace(/_/g, " "))}</span>
      </header>

      <div class="md-scroll">
        <svg viewBox="0 0 ${w} ${h}" class="md-network" role="img" aria-label="Transformation network">
          ${network.edges.map((e) => {
            const a = byLigand[e.ligand_a], b = byLigand[e.ligand_b];
            if (!a || !b) return "";
            return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}"
                          x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="md-edge" />`;
          }).join("")}
          ${positions.map((p) => `
            <g>
              <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="9" class="md-node" />
              <text x="${p.x.toFixed(1)}" y="${(p.y - 15).toFixed(1)}" class="md-node-label">${
                esc((p.label || p.ligand).slice(0, 18))}</text>
            </g>`).join("")}
        </svg>
      </div>

      <table class="md-table">
        <thead><tr><th>A</th><th>B</th><th class="num">ΔΔG</th><th class="num">Uncertainty</th>
          <th class="num">Replicates</th><th>Convergence</th><th>Status</th></tr></thead>
        <tbody>
          ${network.edges.map((e) => `<tr>
            <td class="small">${esc(e.label_a || e.ligand_a.slice(0, 18))}</td>
            <td class="small">${esc(e.label_b || e.ligand_b.slice(0, 18))}</td>
            <td class="num mono">—</td><td class="num mono">—</td>
            <td class="num mono">${e.replicates}</td><td class="mono">—</td>
            <td><span class="md-state md-state-queued">${esc(e.status.replace(/_/g, " "))}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>

      <p class="md-caveat">${esc(network.note)}</p>
      <p class="md-note">${esc(network.design_guidance)}</p>
      ${network.isolated_nodes?.length
        ? `<p class="md-caveat">Isolated ligands with no transformation: ${
            esc(network.isolated_nodes.join(", "))}</p>` : ""}
    </section>`;
}
