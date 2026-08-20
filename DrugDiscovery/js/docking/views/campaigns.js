/**
 * Campaigns: live progress, ranked results, poses, contacts, 3D complex.
 *
 * The one labelling rule this view exists to enforce: the number is a
 * **docking score**, never a "binding affinity". It appears under that name in
 * every table, and the caveat travels with the ranking.
 */

import { esc, loading, notice } from "../../ui.js";
import { dkApi } from "../api.js";

const LIVE = new Set(["queued", "preparing", "running", "analyzing"]);

const STATE_GLYPH = {
  queued: "○", preparing: "◐", running: "◑", analyzing: "◒",
  complete: "●", failed: "⚠", cancelled: "◌",
};

let timer = null;

export async function campaignsView(root, params) {
  if (timer) { clearInterval(timer); timer = null; }

  const preselect = params?.get("id");
  root.innerHTML = `
    <div class="dk-layout">
      <aside id="dk-list" class="dk-list lg-surface lg-d1">${loading("Loading…")}</aside>
      <div id="dk-detail" class="dk-detail"></div>
    </div>`;

  const listHost = root.querySelector("#dk-list");
  const detailHost = root.querySelector("#dk-detail");
  let selected = preselect ? Number(preselect) : null;

  async function refreshList() {
    try {
      const data = await dkApi.campaigns(40);
      if (!data.campaigns.length) {
        listHost.innerHTML = `<p class="dim">No campaigns yet. <a href="#/docking/run">Run one</a>.</p>`;
        return;
      }
      listHost.innerHTML = data.campaigns
        .map(
          (c) => `
        <button class="dk-list-item ${c.id === selected ? "active" : ""}" data-id="${c.id}">
          <div class="dk-list-top">
            <span class="dk-state dk-state-${esc(c.status)}">${STATE_GLYPH[c.status] || "•"} ${esc(c.status)}</span>
            <span class="mono small dim">#${c.id}</span>
          </div>
          <div class="dk-list-name">${esc(c.name)}</div>
          <div class="dk-list-meta">
            ${c.progress.completed}/${c.progress.total} done${
              c.progress.failed ? ` · ${c.progress.failed} failed` : ""
            }
          </div>
          <div class="dk-bar"><div style="width:${c.progress.percent}%"></div></div>
        </button>`
        )
        .join("");
      listHost.querySelectorAll(".dk-list-item").forEach((b) =>
        b.addEventListener("click", () => { selected = Number(b.dataset.id); refreshAll(); })
      );
      if (selected === null && data.campaigns.length) selected = data.campaigns[0].id;
    } catch (error) {
      listHost.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  }

  async function refreshDetail() {
    if (selected === null) return;
    try {
      const [campaign, ranking] = await Promise.all([
        dkApi.campaign(selected),
        dkApi.ranking(selected),
      ]);
      renderDetail(detailHost, campaign, ranking);
    } catch (error) {
      detailHost.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  }

  async function refreshAll() { await refreshList(); await refreshDetail(); }

  await refreshAll();

  // Poll only while something is actually running.
  timer = setInterval(async () => {
    const anyLive = [...root.querySelectorAll(".dk-state")].some((el) =>
      [...LIVE].some((s) => el.classList.contains(`dk-state-${s}`))
    );
    if (!anyLive) { clearInterval(timer); timer = null; return; }
    await refreshAll();
  }, 5000);
}

function renderDetail(host, campaign, ranking) {
  const site = campaign.binding_site || {};
  const params = campaign.parameters || {};

  host.innerHTML = `
    <section class="dk-summary lg-surface lg-d1">
      <header class="dk-summary-head">
        <div>
          <h3>${esc(campaign.name)}</h3>
          <span class="dim small">${esc(campaign.engine)} ${esc(campaign.engine_version || "")}</span>
        </div>
        <span class="dk-state dk-state-${esc(campaign.status)}">
          ${STATE_GLYPH[campaign.status] || "•"} ${esc(campaign.status)}
        </span>
      </header>

      <table class="dk-props"><tbody>
        <tr><th>Receptor</th><td class="mono">${esc(campaign.pdb_id || "—")}
          <span class="dim small">sha256 ${esc((campaign.receptor_sha256 || "").slice(0, 16))}…</span></td></tr>
        <tr><th>Box centre</th><td class="mono">${site.center_x}, ${site.center_y}, ${site.center_z}</td></tr>
        <tr><th>Box size</th><td class="mono">${site.size_x} × ${site.size_y} × ${site.size_z} Å
          <span class="dim small">${site.volume_angstrom3} Å³</span></td></tr>
        <tr><th>Site origin</th><td>${esc(site.origin || "—")}</td></tr>
        <tr><th>Parameters</th><td class="mono">exhaustiveness ${params.exhaustiveness} ·
          ${params.num_modes} poses · energy range ${params.energy_range} · seed ${params.seed}</td></tr>
      </tbody></table>
      ${site.origin_detail ? `<p class="dk-note">${esc(site.origin_detail)}</p>` : ""}
      ${campaign.error ? `<p class="dk-error">${esc(campaign.error)}</p>` : ""}
    </section>

    <section class="dk-results lg-surface lg-d1">
      <header class="dk-summary-head">
        <h3>Ranked by docking score</h3>
        <span class="dim small">${ranking.ranked.length} scored${
          ranking.unranked.length ? ` · ${ranking.unranked.length} not scored` : ""
        }</span>
      </header>
      <table class="dk-table">
        <thead><tr>
          <th>#</th><th>Ligand</th>
          <th class="num">Docking score</th><th class="num">Poses</th>
          <th class="num">Runtime</th><th></th>
        </tr></thead>
        <tbody>
          ${ranking.ranked
            .map(
              (r) => `<tr>
                <td class="mono">${r.position}</td>
                <td><strong>${esc(r.ligand_label || "—")}</strong>
                    <div class="mono small dim">${esc((r.ligand_smiles || "").slice(0, 46))}</div></td>
                <td class="num mono dk-score">${r.best_score} <span class="dim">kcal/mol</span></td>
                <td class="num mono">${r.pose_count}</td>
                <td class="num mono small">${r.runtime_seconds ?? "—"}s</td>
                <td><button class="dk-btn-quiet" data-run="${r.run_id}">Poses</button></td>
              </tr>`
            )
            .join("")}
          ${ranking.unranked
            .map(
              (r) => `<tr class="dk-row-warn">
                <td>—</td>
                <td><strong>${esc(r.ligand_label || "—")}</strong></td>
                <td colspan="4" class="small">${esc(r.status)}${
                  r.error ? ` · ${esc(r.error.slice(0, 90))}` : ""
                }</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <p class="dk-caveat">${esc(ranking.ranking_caveat)}</p>
      <p class="dk-note"><strong>${esc(ranking.score_meaning.name)}</strong> —
        ${esc(ranking.score_meaning.statement)}</p>
    </section>

    <div id="dk-poses"></div>`;

  host.querySelectorAll("[data-run]").forEach((b) =>
    b.addEventListener("click", () => showRun(host.querySelector("#dk-poses"), Number(b.dataset.run)))
  );
}

async function showRun(host, runId) {
  host.innerHTML = loading("Loading poses…");
  let run;
  try {
    run = await dkApi.run(runId);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = `
    <section class="dk-poses lg-surface lg-d1">
      <header class="dk-summary-head">
        <div>
          <h3>${esc(run.ligand_label || "Ligand")}</h3>
          <span class="mono small dim">${esc((run.ligand_smiles || "").slice(0, 70))}</span>
        </div>
        <span class="dk-state dk-state-${esc(run.status)}">${esc(run.status)}</span>
      </header>

      <table class="dk-table">
        <thead><tr>
          <th>Rank</th><th class="num">Docking score</th>
          <th class="num">RMSD lb</th><th class="num">RMSD ub</th>
          <th class="num">vs reference</th><th>Contacts</th><th></th>
        </tr></thead>
        <tbody>
          ${run.poses
            .map((p) => {
              const ix = p.interactions || {};
              const contacts = (ix.contact_residues || []).length;
              const hb = (ix.hydrogen_bonds || []).length;
              const ref = p.reference_rmsd;
              return `<tr>
                <td class="mono">${p.rank}</td>
                <td class="num mono dk-score">${p.docking_score}</td>
                <td class="num mono small">${p.rmsd_lower_bound ?? "—"}</td>
                <td class="num mono small">${p.rmsd_upper_bound ?? "—"}</td>
                <td class="num mono ${ref !== null && ref !== undefined && ref < 2 ? "dk-good" : ""}">${
                  ref !== null && ref !== undefined ? `${ref} Å` : "—"
                }</td>
                <td class="small">${contacts} residues · ${hb} candidate H-bond${hb === 1 ? "" : "s"}</td>
                <td><button class="dk-btn-quiet" data-pose="${p.rank}">View</button></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      ${
        run.poses.some((p) => p.reference_rmsd !== null && p.reference_rmsd !== undefined)
          ? `<p class="dk-note"><strong>vs reference</strong> is the heavy-atom RMSD to the
               crystallographic ligand this box was built on — a redocking control.
               Below 2 Å is conventionally "the pose was reproduced". The value is
               symmetry-unaware, so it is an upper bound on the true error: it can
               overstate, never understate.</p>`
          : ""
      }
      <div id="dk-pose-detail"></div>
    </section>`;

  host.querySelectorAll("[data-pose]").forEach((b) =>
    b.addEventListener("click", () =>
      showPose(host.querySelector("#dk-pose-detail"), run, Number(b.dataset.pose))
    )
  );

  if (run.poses.length) showPose(host.querySelector("#dk-pose-detail"), run, run.poses[0].rank);
}

function showPose(host, run, rank) {
  const pose = run.poses.find((p) => p.rank === rank);
  if (!pose) return;
  const ix = pose.interactions || {};

  const table = (title, rows, columns) =>
    rows?.length
      ? `<div class="dk-ix">
           <h4>${esc(title)} <span class="dim">${rows.length}</span></h4>
           <table class="dk-table">
             <thead><tr>${columns.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
             <tbody>${rows
               .slice(0, 12)
               .map(
                 (r) =>
                   `<tr>${columns
                     .map((c) => `<td class="small mono">${esc(String(r[c[1]] ?? "—"))}</td>`)
                     .join("")}</tr>`
               )
               .join("")}</tbody>
           </table>
         </div>`
      : "";

  host.innerHTML = `
    <div class="dk-pose-detail">
      <h4>Pose ${pose.rank} · <span class="dk-score">${pose.docking_score} kcal/mol</span></h4>
      ${table("Candidate hydrogen bonds", ix.hydrogen_bonds, [
        ["Residue", "residue"], ["Receptor atom", "receptor_atom"],
        ["Ligand atom", "ligand_atom"], ["Distance Å", "distance"],
      ])}
      ${table("Hydrophobic contacts", ix.hydrophobic, [
        ["Residue", "residue"], ["Receptor atom", "receptor_atom"],
        ["Ligand atom", "ligand_atom"], ["Distance Å", "distance"],
      ])}
      ${table("Residues near the ligand", ix.contact_residues, [
        ["Residue", "residue"], ["Number", "number"], ["Chain", "chain"],
        ["Contacts", "contacts"], ["Min distance Å", "min_distance"],
      ])}
      ${ix.caveat ? `<p class="dk-caveat">${esc(ix.caveat)}</p>` : ""}
    </div>`;
}
