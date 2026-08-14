/**
 * Evidence-status display primitives.
 *
 * One function renders every number in this module: `statusValue()`. It takes
 * a stamped payload from the API and emits the glyph, the value, the units and
 * a hover carrying the full provenance. Because it is the only path, a value
 * cannot reach the screen without its status — which is the whole design.
 *
 * The glyphs come from the server (`/preclinical/vocabulary`) rather than being
 * defined here, so the interface cannot drift from the vocabulary the backend
 * enforces.
 */

import { esc } from "../ui.js";

export const GLYPHS = {
  measured: "●",
  curated: "●",
  derived: "◆",
  predicted: "▲",
  simulated: "◌",
  unknown: "?",
};

export const STATUS_LABELS = {
  measured: "Measured",
  curated: "Curated",
  derived: "Derived",
  predicted: "Predicted",
  simulated: "Simulated",
  unknown: "Unknown",
};

const format = (value, digits = 3) => {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return `${value.length} values`;
  if (typeof value !== "number") return String(value);
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-3)) {
    return value.toExponential(2);
  }
  return Number(value.toFixed(digits)).toString();
};

/** Build the hover text: the evidence record, in words. */
function provenanceTitle(record) {
  const evidence = record.evidence || {};
  const lines = [
    `${STATUS_LABELS[record.status] || record.status}: ${
      record.status_definition || ""
    }`,
  ];
  if (evidence.method) {
    lines.push(`Method: ${evidence.method.name} ${evidence.method.version}`);
    if (evidence.method.equation) lines.push(`Equation: ${evidence.method.equation}`);
    if (evidence.method.reference) lines.push(`Reference: ${evidence.method.reference}`);
  }
  if (evidence.source) lines.push(`Source: ${evidence.source}`);
  if (evidence.source_id) lines.push(`Record: ${evidence.source_id}`);
  if (evidence.species) lines.push(`Species: ${evidence.species}`);
  if (evidence.cell_line) lines.push(`Cell line: ${evidence.cell_line}`);
  if (record.uncertainty?.definition) {
    lines.push(`Uncertainty: ${record.uncertainty.definition}`);
  }
  if (record.applicability_domain) {
    lines.push(
      `Applicability: ${
        record.applicability_domain.inside ? "inside" : "OUTSIDE"
      } the training domain`
    );
  }
  if (evidence.note) lines.push(evidence.note);
  if (evidence.inputs) lines.push(`Inputs: ${JSON.stringify(evidence.inputs)}`);
  return lines.join("\n");
}

/**
 * Render one stamped value.
 *
 * Accepts either a stamped record or a bare value with an explicit status —
 * never a bare value alone, because that is exactly the case where the status
 * would be lost.
 */
export function statusValue(record, { digits = 3, showUnits = true } = {}) {
  if (record === null || record === undefined) {
    return `<span class="st st-unknown"><span class="glyph">?</span><span class="val dim">—</span></span>`;
  }

  const status = record.status || "unknown";
  const glyph = record.glyph || GLYPHS[status] || "?";
  const units = showUnits && record.units ? ` <span class="unit">${esc(record.units)}</span>` : "";
  const warning = record.warning
    ? ` <span style="color:var(--danger);font-size:10px">⚠</span>`
    : "";

  return `<span class="st st-${esc(status)}" title="${esc(provenanceTitle(record))}">
    <span class="glyph">${glyph}</span><span class="val">${esc(
      format(record.value, digits)
    )}</span>${units}${warning}</span>`;
}

/** The legend, shown once per view so the glyphs are never a puzzle. */
export function statusLegend(vocabulary) {
  const statuses = vocabulary?.statuses || Object.keys(GLYPHS).map((key) => ({
    value: key,
    label: STATUS_LABELS[key],
    glyph: GLYPHS[key],
    definition: "",
  }));
  return `<div class="st-legend">
    ${statuses
      .map(
        (entry) => `<span class="item st st-${esc(entry.value)}" title="${esc(
          entry.definition
        )}"><span class="glyph">${entry.glyph}</span>${esc(entry.label)}</span>`
      )
      .join("")}
  </div>`;
}

/** "No measured data available", rendered as the answer it is. */
export function noMeasurement(payload) {
  if (!payload) return "";
  return `<div class="no-data">
    <span class="headline">? ${esc(payload.message || "No measured data available.")}</span>
    ${esc(payload.what || "")}
    ${
      payload.sources_searched?.length
        ? `<div class="searched">Searched: ${esc(
            payload.sources_searched.join(", ")
          )}${payload.query ? ` · query <code>${esc(payload.query)}</code>` : ""}</div>`
        : ""
    }
    ${
      payload.prediction
        ? `<div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--border)">
             <div class="small dim" style="margin-bottom:5px">${esc(
               payload.prediction_note || ""
             )}</div>
             ${statusValue(payload.prediction)}
           </div>`
        : ""
    }
  </div>`;
}

/** A capability that is designed but not built. Distinct from "no data". */
export function notImplemented(payload) {
  if (!payload) return "";
  return `<div class="not-implemented">
    <span class="tag">NOT YET IMPLEMENTED</span>
    <strong>${esc(payload.what || "")}</strong>
    ${payload.needs ? `<div style="margin-top:5px">Needs: ${esc(payload.needs)}</div>` : ""}
  </div>`;
}

/** A capability that could run here but is not installed. */
export function unavailable(payload) {
  if (!payload) return "";
  return `<div class="no-data">
    <span class="headline">${esc(payload.what || "Not available")}</span>
    ${esc(payload.reason || "")}
    ${payload.remedy ? `<div class="searched">To enable: ${esc(payload.remedy)}</div>` : ""}
  </div>`;
}

/**
 * The assumption banner.
 *
 * Printed above any plot whose parameters include an assumption, because a
 * curve drawn from assumed constants and a curve drawn from measurements look
 * identical and mean entirely different things.
 */
export function assumptionBanner(assumptions) {
  const assumed = assumptions?.assumed || [];
  if (!assumed.length) {
    return `<div class="assumption-banner">Every parameter in this run is sourced.</div>`;
  }
  return `<div class="assumption-banner">
    <strong>${assumed.length} assumed parameter${assumed.length > 1 ? "s" : ""}:</strong>
    ${assumed.map((name) => `<code>${esc(name)}</code>`).join(" ")}
    <div style="margin-top:6px">${esc(assumptions.note || "")}</div>
  </div>`;
}

/** A parameter table, with assumed rows visually distinct. */
export function parameterTable(parameters) {
  if (!parameters?.length) return "";
  return `<table class="param-table">
    <tr><th>Parameter</th><th>Value</th><th>Units</th><th>Status</th><th>Source</th></tr>
    ${parameters
      .map(
        (parameter) => `<tr class="${parameter.assumed ? "assumed" : ""}">
          <td>${esc(parameter.name)}</td>
          <td class="num">${esc(format(parameter.value))}</td>
          <td class="dim">${esc(parameter.units || "")}</td>
          <td><span class="st st-${esc(parameter.status)}"><span class="glyph">${
            parameter.glyph
          }</span>${esc(parameter.status_label)}</span></td>
          <td class="dim">${esc(
            parameter.source || parameter.note || (parameter.assumed ? "assumed" : "—")
          )}</td>
        </tr>`
      )
      .join("")}
  </table>`;
}

/**
 * A minimal SVG line plot.
 *
 * Written rather than pulled in: the requirement is one series type with a log
 * option and measured points drawn distinctly from fitted curves, and that is
 * a hundred lines against a charting library's bundle and API surface.
 */
export function linePlot(series, { width = 640, height = 220, xLabel = "", yLabel = "", logX = false } = {}) {
  const pad = { left: 52, right: 14, top: 14, bottom: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const points = series.flatMap((s) => s.points || []);
  if (!points.length) return `<div class="dim small">Nothing to plot.</div>`;

  const xs = points.map((p) => (logX ? Math.log10(Math.max(p.x, 1e-6)) : p.x));
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys) || 1;

  const sx = (x) =>
    pad.left + ((logX ? Math.log10(Math.max(x, 1e-6)) : x) - xMin) / (xMax - xMin || 1) * plotWidth;
  const sy = (y) => pad.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

  const gridlines = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => {
      const y = pad.top + plotHeight * fraction;
      const value = yMax - (yMax - yMin) * fraction;
      return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"
                stroke="var(--border)" stroke-width="1"/>
              <text x="${pad.left - 6}" y="${y + 3}" text-anchor="end"
                fill="var(--text-dim)" font-size="9">${format(value, 2)}</text>`;
    })
    .join("");

  const paths = series
    .map((s) => {
      if (!s.points?.length) return "";
      if (s.kind === "points") {
        return s.points
          .map(
            (p) =>
              `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.5" fill="${
                s.color || "var(--st-measured)"
              }"><title>${esc(String(p.x))}, ${esc(String(p.y))}</title></circle>`
          )
          .join("");
      }
      const d = s.points
        .map((p, index) => `${index === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${s.color || "var(--accent)"}"
                stroke-width="${s.width || 2}" ${
        s.dashed ? 'stroke-dasharray="5 4"' : ""
      }/>`;
    })
    .join("");

  return `<svg class="plot" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    ${gridlines}
    ${paths}
    <text x="${pad.left + plotWidth / 2}" y="${height - 6}" text-anchor="middle"
      fill="var(--text-dim)" font-size="10">${esc(xLabel)}</text>
    <text x="12" y="${pad.top + plotHeight / 2}" text-anchor="middle"
      fill="var(--text-dim)" font-size="10"
      transform="rotate(-90 12 ${pad.top + plotHeight / 2})">${esc(yLabel)}</text>
  </svg>`;
}
