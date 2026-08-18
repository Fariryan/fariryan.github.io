/**
 * The Pareto frontier.
 *
 * Candidates are shown as a set, not a list. There is no rank column and no
 * "best" badge, because none of them is best — each is non-dominated, meaning
 * no other candidate beats it on every objective. Choosing between them is a
 * scientific judgement and the interface must not pre-empt it.
 *
 * The trade-off plot puts two objectives on axes so the shape of the frontier
 * is visible: a curve means you are buying one property with another, and a
 * cluster means the objectives are not actually in tension.
 */

import { esc, loading, notice } from "../../ui.js";
import { mgApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

export async function paretoView(root, params) {
  const runKey = params?.get("run") || currentRun.get();
  if (!runKey) {
    root.innerHTML = needsRun();
    return;
  }

  root.innerHTML = loading("Loading the frontier…");

  const [run, listing, report] = await Promise.all([
    mgApi.getRun(runKey),
    mgApi.candidates(runKey, { frontier_only: true, limit: 100 }),
    mgApi.report(runKey).catch(() => null),
  ]);

  const frontier = listing.candidates;
  const objectives = run.objectives || [];

  root.innerHTML = `
    <div class="mg-run-summary">
      <div>
        <strong>${esc(run.label)}</strong>
        <span class="mono dim small"> ${esc(run.run)}</span>
        <div class="dim small">
          ${run.progress.generations_run} generation(s) ·
          ${run.progress.candidates_evaluated} evaluated ·
          ${run.progress.candidates_rejected} rejected on constraints
        </div>
      </div>
      <div class="spacer"></div>
      <span class="mg-state mg-state-${esc(run.state)}">${esc(run.state)}</span>
    </div>

    ${
      run.stop_reason
        ? `<div class="mg-stop-banner">
             <span class="ico">■</span>
             <div><strong>Stopped: ${esc(
               run.stop_reason.replace(/_/g, " ")
             )}</strong>
             <div class="dim">${esc(run.stop_detail || "")}</div></div>
           </div>`
        : ""
    }

    <div class="mg-caveat">${esc(run.frontier?.note || "")}</div>

    ${objectives.length >= 2 ? tradeoffPlot(frontier, objectives) : ""}

    <section class="card">
      <h3>Frontier candidates <span class="n">${frontier.length}</span></h3>
      <div class="mg-cards">
        ${frontier
          .map(
            (c) => `
          <a class="mg-card" href="#/molgrad/trajectory?run=${encodeURIComponent(
            runKey
          )}&candidate=${encodeURIComponent(c.key)}">
            <div class="mg-card-figure">
              <img loading="lazy" alt="" src="${esc(
                mgApi.depictionUrl(c.smiles, 210, 160)
              )}" />
            </div>
            <div class="mg-card-key mono">${esc(c.key)}
              <span class="dim">gen ${c.generation}</span></div>
            <div class="mg-card-values">
              ${objectives
                .map((o) => {
                  const value = c.objective_values?.[o.property_key];
                  return `<div class="mg-card-value">
                    <span>${esc(o.label)}</span>
                    <span class="mono">${
                      value === null || value === undefined
                        ? '<span class="dim">—</span>'
                        : Number(value).toFixed(2)
                    }</span>
                  </div>`;
                })
                .join("")}
            </div>
            <div class="mg-card-foot">
              <span class="mg-novelty">${esc(
                (c.novelty?.class || "not assessed").replace(/_/g, " ")
              )}</span>
              ${
                c.synthetic_accessibility
                  ? `<span class="dim small">SA ${c.synthetic_accessibility.toFixed(
                      1
                    )}</span>`
                  : ""
              }
            </div>
          </a>`
          )
          .join("")}
      </div>
    </section>

    ${report ? renderReport(report) : ""}`;
}

/**
 * Two objectives on axes, so the shape of the trade-off is visible.
 *
 * Axes are the first two objectives by priority. Both are oriented so that
 * up-and-right is more desirable, which means a minimised objective has its
 * axis inverted — and the axis label says so, because a silently flipped axis
 * is worse than no axis.
 */
function tradeoffPlot(frontier, objectives) {
  const [first, second] = objectives;
  const points = frontier
    .map((c) => ({
      key: c.key,
      x: c.objective_values?.[first.property_key],
      y: c.objective_values?.[second.property_key],
    }))
    .filter((p) => p.x !== null && p.x !== undefined && p.y !== null && p.y !== undefined);

  if (points.length < 2) return "";

  const size = 380;
  const pad = 46;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xLow = Math.min(...xs);
  const xHigh = Math.max(...xs);
  const yLow = Math.min(...ys);
  const yHigh = Math.max(...ys);

  const project = (value, low, high, invert) => {
    const span = high - low || 1;
    const t = (value - low) / span;
    return invert ? 1 - t : t;
  };

  const px = (p) =>
    pad +
    project(p.x, xLow, xHigh, first.direction === "minimise") * (size - pad * 2);
  const py = (p) =>
    size -
    pad -
    project(p.y, yLow, yHigh, second.direction === "minimise") * (size - pad * 2);

  return `
    <section class="card">
      <h3>Trade-off</h3>
      <svg viewBox="0 0 ${size} ${size}" class="mg-tradeoff">
        <line x1="${pad}" y1="${size - pad}" x2="${size - pad}" y2="${
          size - pad
        }" class="mg-axis" />
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${size - pad}" class="mg-axis" />
        ${points
          .map(
            (p) => `<circle cx="${px(p).toFixed(1)}" cy="${py(p).toFixed(1)}" r="6"
              class="mg-tradeoff-dot">
              <title>${esc(p.key)} — ${esc(first.label)} ${p.x.toFixed(2)}, ${esc(
              second.label
            )} ${p.y.toFixed(2)}</title></circle>`
          )
          .join("")}
        <text x="${size / 2}" y="${size - 12}" class="mg-axis-label"
              text-anchor="middle">${esc(first.label)} ${
            first.direction === "minimise" ? "(axis inverted — lower is better)" : "→"
          }</text>
        <text x="14" y="${size / 2}" class="mg-axis-label"
              transform="rotate(-90 14 ${size / 2})" text-anchor="middle">${esc(
            second.label
          )} ${
            second.direction === "minimise" ? "(axis inverted)" : "→"
          }</text>
      </svg>
      <div class="dim small">
        Up and to the right is more desirable on both axes. A curve means you
        are buying one property with the other; a cluster means these two
        objectives are not actually in tension for this series.
      </div>
    </section>`;
}

function renderReport(report) {
  return `
    <section class="card">
      <h3>Scientific output</h3>
      <div class="mg-caveat">${esc(report.caveat)}</div>

      <h4 class="mg-sub">Reproducibility</h4>
      <table class="mg-table">
        <tr><td>Molecular Gradient version</td>
            <td class="mono">${esc(report.reproducibility.molgrad_version)}</td></tr>
        <tr><td>Random seed</td>
            <td class="mono">${esc(String(report.reproducibility.random_seed))}</td></tr>
        <tr><td>Seeds</td>
            <td class="mono small">${(report.reproducibility.seeds || [])
              .map(esc)
              .join("<br />")}</td></tr>
      </table>
      <p class="dim small">${esc(report.reproducibility.note)}</p>

      <h4 class="mg-sub">Next computational test</h4>
      <ul>${report.next_computational_test.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>

      <h4 class="mg-sub">Next experimental test</h4>
      <ul>${report.next_experimental_test.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </section>`;
}
