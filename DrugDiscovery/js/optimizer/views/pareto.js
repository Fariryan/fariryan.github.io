/** The trade-off surface: a scatter over any two objectives, and a parallel-
 *  coordinates plot for all of them at once.
 *
 *  Both are drawn as inline SVG. Plotly.js was evaluated for this view — it is
 *  MIT, and its 3D scatter would give rotation and hover for free — but it is
 *  ~3.5 MB minified, this repository already vendors three.js for 3D, and a
 *  Pareto front with four or more objectives is better read as parallel
 *  coordinates than as a 3D scatter with two encodings stacked on top.
 */

import { esc, notice } from "../../ui.js";
import { optimizerApi } from "../api.js";
import { STATE_GLYPH, withRun } from "./shared.js";

export async function paretoView(root, params) {
  await withRun(root, params, render);
}

async function render(host, runId) {
  const data = await optimizerApi.pareto(runId);
  const objectives = data.objectives || [];
  if (objectives.length < 2) {
    host.innerHTML = notice("A trade-off surface needs at least two objectives.", "info", "◌");
    return;
  }

  const scored = data.population.filter((p) =>
    objectives.every((o) => p.objectives?.[o.key] != null));

  host.innerHTML = `
    <section class="opt-panel lg-surface lg-d1">
      <header class="opt-panel-head">
        <div><h3>Pareto front</h3>
          <span class="dim small">${data.front_size} non-dominated of ${data.population.length} evaluated</span></div>
        <div class="opt-crosscheck ${data.cross_check?.agree ? "agree" : "disagree"}">
          ${data.cross_check?.status === "ok"
            ? `${data.cross_check.agree ? "✓" : "⚠"} own ${data.cross_check.own_front_size} · Optuna NSGA-II ${data.cross_check.optuna_front_size}`
            : esc(data.cross_check?.status || "not checked")}
        </div>
      </header>
      <p class="opt-note">${esc(data.cross_check?.note || "")}</p>

      <div class="opt-axes">
        <label for="opt-x">x</label>
        <select id="opt-x">${objectives.map((o, i) =>
          `<option value="${esc(o.key)}" ${i === 0 ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>
        <label for="opt-y">y</label>
        <select id="opt-y">${objectives.map((o, i) =>
          `<option value="${esc(o.key)}" ${i === 1 ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>
        <span class="opt-legend">
          <span class="opt-key front">★ on the front</span>
          <span class="opt-key dominated">○ dominated</span>
          <span class="opt-key size">point size = synthetic accessibility (larger = harder)</span>
        </span>
      </div>
      <div id="opt-scatter" class="opt-scroll"></div>

      <h4>All objectives at once</h4>
      <p class="opt-note">Parallel coordinates. Each line is one candidate; each axis is one objective, oriented so that <strong>up is better</strong>. A line that stays high across every axis would dominate — the fact that the front's lines cross is exactly what a trade-off looks like.</p>
      <div id="opt-parallel" class="opt-scroll"></div>

      <p class="opt-caveat">${esc(data.no_weighted_score)}</p>
    </section>

    <section class="opt-panel lg-surface lg-d1">
      <h3>The front</h3>
      <div class="opt-scroll">
        <table class="opt-table">
          <thead><tr><th>Label</th><th class="num">Gen</th>
            ${objectives.map((o) => `<th class="num">${esc(o.key.replace(/_/g, " "))}</th>`).join("")}
            <th>SMILES</th></tr></thead>
          <tbody>${data.front.map((c) => `
            <tr>
              <td class="mono small">${STATE_GLYPH.front} ${esc(c.label)}</td>
              <td class="num mono">${c.generation}</td>
              ${objectives.map((o) => `<td class="num mono">${
                c.objectives?.[o.key] == null ? "—" : Number(c.objectives[o.key]).toFixed(3)}</td>`).join("")}
              <td class="mono small">${esc(c.smiles)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </section>`;

  const frontIds = new Set(data.front.map((c) => c.smiles));
  const xSel = host.querySelector("#opt-x");
  const ySel = host.querySelector("#opt-y");
  const draw = () => {
    host.querySelector("#opt-scatter").innerHTML =
      scatter(scored, frontIds, xSel.value, ySel.value, objectives);
  };
  xSel.addEventListener("change", draw);
  ySel.addEventListener("change", draw);
  draw();

  host.querySelector("#opt-parallel").innerHTML =
    parallel(scored, frontIds, objectives);
}

function scatter(points, frontIds, xKey, yKey, objectives) {
  if (!points.length) return `<p class="dim">No candidate has a value for every objective.</p>`;
  const w = 700, h = 380, pad = 58;
  const xs = points.map((p) => Number(p.objectives[xKey]));
  const ys = points.map((p) => Number(p.objectives[yKey]));
  const sas = points.map((p) => Number(p.synthesis?.value ?? 3));
  const xr = [Math.min(...xs), Math.max(...xs)];
  const yr = [Math.min(...ys), Math.max(...ys)];
  const sr = [Math.min(...sas), Math.max(...sas)];
  const sx = (v) => pad + ((v - xr[0]) / (xr[1] - xr[0] || 1)) * (w - pad * 1.5);
  const sy = (v) => h - pad - ((v - yr[0]) / (yr[1] - yr[0] || 1)) * (h - pad * 1.4);
  const sz = (v) => 3 + ((v - sr[0]) / (sr[1] - sr[0] || 1)) * 6;

  const label = (key) => objectives.find((o) => o.key === key)?.label || key;
  const dir = (key) => objectives.find((o) => o.key === key)?.direction || "";

  return `
    <svg viewBox="0 0 ${w} ${h}" class="opt-plot" role="img" aria-label="Pareto scatter">
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad * 0.5}" y2="${h - pad}" class="opt-axis" />
      <line x1="${pad}" y1="${pad * 0.4}" x2="${pad}" y2="${h - pad}" class="opt-axis" />
      ${points.map((p) => {
        const on = frontIds.has(p.smiles);
        return `<circle cx="${sx(Number(p.objectives[xKey])).toFixed(1)}"
          cy="${sy(Number(p.objectives[yKey])).toFixed(1)}"
          r="${sz(Number(p.synthesis?.value ?? 3)).toFixed(1)}"
          class="opt-pt ${on ? "front" : "dom"}"><title>${esc(p.label)} — ${esc(p.smiles)}
${esc(xKey)} ${Number(p.objectives[xKey]).toFixed(3)}
${esc(yKey)} ${Number(p.objectives[yKey]).toFixed(3)}
SA ${p.synthesis?.value ?? "—"}</title></circle>`;
      }).join("")}
      <text x="${w / 2}" y="${h - 12}" class="opt-axis-label">${esc(label(xKey))} (${esc(dir(xKey))})</text>
      <text x="14" y="${h / 2}" class="opt-axis-label" transform="rotate(-90 14 ${h / 2})">${esc(label(yKey))} (${esc(dir(yKey))})</text>
      <text x="${pad}" y="${h - pad + 16}" class="opt-tick">${xr[0].toFixed(2)}</text>
      <text x="${w - pad * 0.8}" y="${h - pad + 16}" class="opt-tick">${xr[1].toFixed(2)}</text>
      <text x="${pad - 6}" y="${h - pad}" class="opt-tick end">${yr[0].toFixed(2)}</text>
      <text x="${pad - 6}" y="${pad * 0.7}" class="opt-tick end">${yr[1].toFixed(2)}</text>
    </svg>`;
}

function parallel(points, frontIds, objectives) {
  if (!points.length) return "";
  const w = 700, h = 320, padX = 70, padY = 44;
  const step = (w - padX * 2) / Math.max(objectives.length - 1, 1);

  const ranges = objectives.map((o) => {
    const values = points.map((p) => Number(p.objectives[o.key]));
    return [Math.min(...values), Math.max(...values)];
  });

  // Every axis is oriented so up is better, which is what makes crossing
  // lines readable as trade-offs rather than as noise.
  const place = (index, value) => {
    const [min, max] = ranges[index];
    const span = max - min || 1;
    let fraction = (value - min) / span;
    if (objectives[index].direction === "minimise") fraction = 1 - fraction;
    return h - padY - fraction * (h - padY * 2);
  };

  return `
    <svg viewBox="0 0 ${w} ${h}" class="opt-plot" role="img" aria-label="Parallel coordinates">
      ${objectives.map((o, i) => `
        <line x1="${padX + i * step}" y1="${padY}" x2="${padX + i * step}" y2="${h - padY}" class="opt-axis" />
        <text x="${padX + i * step}" y="${padY - 12}" class="opt-axis-label">${esc(o.key.replace(/_/g, " "))}</text>
        <text x="${padX + i * step}" y="${padY - 2}" class="opt-tick mid">${ranges[i][o.direction === "minimise" ? 0 : 1].toFixed(2)}</text>
        <text x="${padX + i * step}" y="${h - padY + 14}" class="opt-tick mid">${ranges[i][o.direction === "minimise" ? 1 : 0].toFixed(2)}</text>`).join("")}
      ${points.map((p) => {
        const on = frontIds.has(p.smiles);
        const d = objectives.map((o, i) =>
          `${i ? "L" : "M"}${(padX + i * step).toFixed(1)},${place(i, Number(p.objectives[o.key])).toFixed(1)}`).join(" ");
        return `<path d="${d}" class="opt-pc ${on ? "front" : "dom"}" fill="none"><title>${esc(p.label)}</title></path>`;
      }).join("")}
    </svg>`;
}
