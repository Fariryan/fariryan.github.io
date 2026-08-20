/** Simulations: submit, watch the real stage, read the analysis. */

import { esc, loading, notice } from "../../ui.js";
import { mdApi } from "../api.js";

const LIVE = new Set(["queued","preparing","minimizing","equilibrating_nvt",
                      "equilibrating_npt","production","analyzing"]);
const GLYPH = { queued:"○", preparing:"◐", minimizing:"◑", equilibrating_nvt:"◒",
  equilibrating_npt:"◓", production:"●", analyzing:"◔", complete:"●",
  failed:"⚠", cancelled:"◌" };

let timer = null;

export async function runsView(root, params) {
  if (timer) { clearInterval(timer); timer = null; }
  let status;
  try { status = await mdApi.status(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  const engine = status.engine;
  root.innerHTML = `
    <section class="md-engine lg-surface lg-d1 ${engine.available ? "" : "absent"}">
      <header class="md-engine-head">
        <div><strong>${esc(engine.engine)}</strong>
          <span class="mono small dim">${esc(engine.version || "")}</span>
          <span class="md-badge">${esc(engine.licence || "")}</span></div>
        <span class="md-state md-state-${engine.available ? "complete" : "failed"}">
          ${engine.available ? `● ${esc(engine.preferred_platform)}` : "⚠ unavailable"}</span>
      </header>
      ${engine.small_molecule_parameterization?.available ? "" :
        `<p class="md-caveat">${esc(engine.small_molecule_parameterization?.reason || "")}</p>`}
    </section>

    <section class="md-controls lg-surface lg-d1">
      <div class="md-grid">
        <div>
          <label for="md-pdb">Structure (PDB entry)</label>
          <input id="md-pdb" type="search" value="1L2Y" spellcheck="false" />
          <label for="md-ff">Force field</label>
          <select id="md-ff">${status.parameters.force_fields
            .map((f) => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join("")}</select>
          <label for="md-water">Water model</label>
          <select id="md-water">${status.parameters.water_models
            .map((w) => `<option value="${esc(w.key)}">${esc(w.label)}</option>`).join("")}</select>
        </div>
        <div>
          <div class="md-triple">
            <div><label for="md-nvt">NVT ps</label><input id="md-nvt" type="number" value="4" step="1" /></div>
            <div><label for="md-npt">NPT ps</label><input id="md-npt" type="number" value="4" step="1" /></div>
            <div><label for="md-prod">Production ps</label><input id="md-prod" type="number" value="20" step="1" /></div>
          </div>
          <div class="md-triple">
            <div><label for="md-temp">Temperature K</label><input id="md-temp" type="number" value="300" step="1" /></div>
            <div><label for="md-dt">Timestep fs</label><input id="md-dt" type="number" value="2" step="0.5" /></div>
            <div><label for="md-seed">Seed</label><input id="md-seed" type="number" value="42" /></div>
          </div>
          <label for="md-interval">Frame interval ps</label>
          <input id="md-interval" type="number" value="2" step="0.5" />
        </div>
      </div>
      <div class="md-actions">
        <button id="md-run" class="md-btn" ${engine.available ? "" : "disabled"}>Run simulation</button>
      </div>
      <p class="md-note">
        Runs asynchronously through the real stages. A 2 fs timestep requires
        bonds to hydrogen to be constrained; combinations that would heat the
        system are refused rather than warned about.
      </p>
    </section>

    <div id="md-submit-out"></div>
    <div class="md-layout">
      <aside id="md-list" class="md-list lg-surface lg-d1">${loading("Loading…")}</aside>
      <div id="md-detail" class="md-detail"></div>
    </div>`;

  const listHost = root.querySelector("#md-list");
  const detailHost = root.querySelector("#md-detail");
  let selected = params?.get("id") ? Number(params.get("id")) : null;

  root.querySelector("#md-run").addEventListener("click", async () => {
    const out = root.querySelector("#md-submit-out");
    out.innerHTML = loading("Submitting…");
    try {
      const run = await mdApi.submit({
        pdb_id: root.querySelector("#md-pdb").value.trim(),
        parameters: {
          force_field: root.querySelector("#md-ff").value,
          water_model: root.querySelector("#md-water").value,
          nvt_ps: Number(root.querySelector("#md-nvt").value),
          npt_ps: Number(root.querySelector("#md-npt").value),
          production_ps: Number(root.querySelector("#md-prod").value),
          temperature_kelvin: Number(root.querySelector("#md-temp").value),
          timestep_fs: Number(root.querySelector("#md-dt").value),
          output_interval_ps: Number(root.querySelector("#md-interval").value),
          seed: Number(root.querySelector("#md-seed").value),
        },
      });
      out.innerHTML = `<div class="md-submitted lg-surface lg-d1">
        <strong>Run ${run.id} submitted.</strong>
        <p class="md-note">${esc(run.estimated_note)}</p></div>`;
      selected = run.id;
      await refresh();
      start();
    } catch (error) {
      out.innerHTML = notice(`<strong>Refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });

  async function refresh() {
    try {
      const data = await mdApi.runs(30);
      listHost.innerHTML = data.runs.length ? data.runs.map((r) => `
        <button class="md-list-item ${r.id === selected ? "active" : ""}" data-id="${r.id}">
          <div class="md-list-top">
            <span class="md-state md-state-${esc(r.status)}">${GLYPH[r.status] || "•"} ${esc(r.status.replace(/_/g," "))}</span>
            <span class="mono small dim">#${r.id}</span>
          </div>
          <div class="md-list-name">${esc(r.name)}</div>
          <div class="md-bar"><div style="width:${((r.progress||0)*100).toFixed(0)}%"></div></div>
          ${r.stage_message ? `<div class="md-list-meta">${esc(r.stage_message)}</div>` : ""}
        </button>`).join("") : `<p class="dim">No simulations yet.</p>`;
      listHost.querySelectorAll(".md-list-item").forEach((b) =>
        b.addEventListener("click", () => { selected = Number(b.dataset.id); refresh(); }));
      if (selected === null && data.runs.length) selected = data.runs[0].id;
      if (selected !== null) detailHost.innerHTML = renderDetail(await mdApi.run(selected));
    } catch (error) {
      listHost.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    timer = setInterval(async () => {
      const live = [...root.querySelectorAll(".md-state")].some((el) =>
        [...LIVE].some((s) => el.classList.contains(`md-state-${s}`)));
      if (!live) { clearInterval(timer); timer = null; return; }
      await refresh();
    }, 4000);
  }

  await refresh();
  start();
}

function renderDetail(run) {
  const p = run.parameters || {};
  const s = run.system || {};
  const a = run.analysis || {};

  return `
    <section class="md-out lg-surface lg-d1">
      <header class="md-engine-head">
        <div><h3>${esc(run.name)}</h3>
          <span class="dim small">${esc(run.engine)} ${esc(run.engine_version||"")} · ${esc(run.platform||"")}</span></div>
        <span class="md-state md-state-${esc(run.status)}">${GLYPH[run.status]||"•"} ${esc(run.status.replace(/_/g," "))}</span>
      </header>

      ${run.error ? `<p class="md-error">${esc(run.failed_stage ? run.failed_stage+": " : "")}${esc(run.error)}</p>` : ""}
      ${(run.warnings||[]).length ? `<div class="md-warnings">${run.warnings.map((w)=>`<div>⚠ ${esc(w)}</div>`).join("")}</div>` : ""}

      <h4>System</h4>
      <table class="md-props"><tbody>
        <tr><th>Atoms</th><td class="mono">${s.atoms ?? "—"} total · ${s.solute_atoms ?? "—"} solute · ${s.water_molecules ?? "—"} waters · ${s.ions ?? "—"} ions</td></tr>
        <tr><th>Constraints</th><td class="mono">${s.constraints ?? "—"}</td></tr>
        <tr><th>Input hash</th><td class="mono small">${esc((run.input_sha256||"").slice(0,32))}…</td></tr>
      </tbody></table>

      <h4>Parameters</h4>
      <table class="md-props"><tbody>
        <tr><th>Force field / water</th><td class="mono">${esc(p.force_field||"")} · ${esc(p.water_model||"")}</td></tr>
        <tr><th>Integrator</th><td class="mono">${esc(p.integrator||"")}, ${p.timestep_fs} fs, ${esc(p.constraints||"")}</td></tr>
        <tr><th>Thermostat</th><td class="mono">${p.temperature_kelvin} K, friction ${p.friction_per_ps}/ps</td></tr>
        <tr><th>Barostat</th><td class="mono">${p.pressure_bar} bar</td></tr>
        <tr><th>Schedule</th><td class="mono">NVT ${p.equilibration?.nvt_ps} · NPT ${p.equilibration?.npt_ps} · production ${p.production_ps} ps</td></tr>
        <tr><th>Seed</th><td class="mono">${p.seed}</td></tr>
      </tbody></table>

      ${(run.stages||[]).length ? `<h4>Stages</h4>
        <table class="md-table">
          <thead><tr><th>Stage</th><th class="num">Seconds</th><th>Detail</th></tr></thead>
          <tbody>${run.stages.map((st) => {
            const extra = Object.entries(st).filter(([k]) => !["stage","seconds","note","storage_note"].includes(k))
              .map(([k,v]) => `${k.replace(/_/g," ")} ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
            return `<tr><td class="mono small">${esc(st.stage)}</td>
              <td class="num mono">${st.seconds}</td>
              <td class="small dim">${esc(extra.slice(0,140))}</td></tr>`;
          }).join("")}</tbody>
        </table>` : ""}

      ${a.rmsd?.status === "ok" ? `
        <h4>Trajectory analysis</h4>
        ${plot(a.rmsd.series, "time_ps", "rmsd_angstrom", "RMSD (Å)")}
        <table class="md-props"><tbody>
          <tr><th>RMSD (2nd half)</th><td class="mono">${a.rmsd.mean_second_half} ± ${a.rmsd.sd_second_half} Å</td></tr>
          <tr><th>RMSF</th><td class="mono">mean ${a.rmsf?.mean_angstrom} Å, max ${a.rmsf?.max_angstrom} Å</td></tr>
          <tr><th>Radius of gyration</th><td class="mono">${a.radius_of_gyration?.mean_angstrom} ± ${a.radius_of_gyration?.sd_angstrom} Å</td></tr>
          <tr><th>Temperature</th><td class="mono">${a.energy?.temperature?.mean} ± ${a.energy?.temperature?.sd} K</td></tr>
          <tr><th>Potential energy</th><td class="mono">${a.energy?.potential_energy_kj_mol?.mean} ± ${a.energy?.potential_energy_kj_mol?.sd} kJ/mol</td></tr>
          ${a.energy?.box_volume_nm3 ? `<tr><th>Box volume</th><td class="mono">${a.energy.box_volume_nm3.mean} nm³</td></tr>` : ""}
          <tr><th>Contacts</th><td class="mono">${a.contacts?.persistent_count ?? "—"} persistent pairs</td></tr>
          <tr><th>SASA</th><td class="dim small">${esc(a.sasa?.note || "")}</td></tr>
        </tbody></table>
        <p class="md-note">${esc(a.rmsd.interpretation)}</p>
        <p class="md-caveat">${esc(a.contacts?.caveat || "")}</p>` : ""}
    </section>`;
}

function plot(series, xKey, yKey, label) {
  if (!series?.length) return "";
  const w = 560, h = 170, pad = 34;
  const xs = series.map((d) => d[xKey]), ys = series.map((d) => d[yKey]);
  const xr = [Math.min(...xs), Math.max(...xs)], yr = [Math.min(...ys), Math.max(...ys)];
  const sx = (v) => pad + ((v - xr[0]) / (xr[1] - xr[0] || 1)) * (w - pad * 1.4);
  const sy = (v) => h - pad - ((v - yr[0]) / (yr[1] - yr[0] || 1)) * (h - pad * 1.5);
  const path = series.map((d, i) => `${i ? "L" : "M"}${sx(d[xKey]).toFixed(1)},${sy(d[yKey]).toFixed(1)}`).join(" ");
  return `
    <div class="md-scroll"><svg viewBox="0 0 ${w} ${h}" class="md-plot" role="img" aria-label="${esc(label)}">
      <line x1="${pad}" y1="${h-pad}" x2="${w-pad*0.4}" y2="${h-pad}" class="md-axis" />
      <line x1="${pad}" y1="${pad*0.5}" x2="${pad}" y2="${h-pad}" class="md-axis" />
      <path d="${path}" class="md-line" fill="none" />
      <text x="${w/2}" y="${h-6}" class="md-axis-label">time (ps)</text>
      <text x="9" y="${h/2}" class="md-axis-label" transform="rotate(-90 9 ${h/2})">${esc(label)}</text>
      <text x="${pad+4}" y="${pad*0.9}" class="md-axis-label" style="text-anchor:start">${yr[1].toFixed(2)}</text>
      <text x="${pad+4}" y="${h-pad-4}" class="md-axis-label" style="text-anchor:start">${yr[0].toFixed(2)}</text>
    </svg></div>`;
}
