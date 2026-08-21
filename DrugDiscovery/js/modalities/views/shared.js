/** Pieces the modality views share. */
import { esc } from "../../ui.js";

export const MODALITY_COLOR = {
  small_molecule: "var(--ev-established)",
  peptide: "var(--accent)",
  protein: "var(--ev-strong)",
  antibody: "var(--ev-clinical)",
  targeted_degrader: "var(--warning)",
};

export const PROV_LABEL = {
  experimental: "measured",
  database: "retrieved",
  calculated: "calculated",
  predicted: "predicted",
  inferred: "inferred",
  derived: "derived",
  llm_hypothesis: "hypothesis",
};

export const provBadge = (kind) =>
  `<span class="md9-prov md9-prov-${esc(kind || "calculated")}">${
    esc(PROV_LABEL[kind] || kind || "calculated")}</span>`;

export function propTable(entries) {
  const rows = Object.entries(entries || {})
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => `<tr><th>${esc(k.replace(/_/g, " "))}</th>
      <td class="mono">${esc(String(v))}</td></tr>`).join("");
  return rows ? `<table class="md9-props"><tbody>${rows}</tbody></table>` : "";
}

export function refusalBlock(refusals, heading = "Not computed, and why") {
  if (!refusals?.length) return "";
  return `
    <h4>${esc(heading)}</h4>
    <div class="md9-refusals">
      ${refusals.map((r) => `
        <div class="md9-refusal md9-refusal-${esc(r.status || "refused")}">
          <div class="md9-refusal-head">
            <strong>${esc((r.key || r.property || "").replace(/_/g, " "))}</strong>
            <span class="md9-status">${esc(r.status || "refused")}</span>
          </div>
          <p>${esc(r.detail || r.reason || r.why || "")}</p>
        </div>`).join("")}
    </div>`;
}

/** A simple horizontal bar chart for a numeric series. */
export function barChart(rows, { valueKey, labelKey, unit = "" }) {
  if (!rows?.length) return "";
  const max = Math.max(...rows.map((r) => Number(r[valueKey]) || 0));
  return `
    <div class="md9-bars">
      ${rows.map((r) => {
        const value = Number(r[valueKey]) || 0;
        return `<div class="md9-bar-row">
          <span class="md9-bar-label">${esc(String(r[labelKey]))}</span>
          <span class="md9-bar-track"><span class="md9-bar-fill" style="width:${
            max ? (value / max) * 100 : 0}%"></span></span>
          <span class="md9-bar-value mono">${value}${esc(unit)}</span>
        </div>`;
      }).join("")}
    </div>`;
}
