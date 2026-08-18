/**
 * The property profile — radar, descriptors, and the full ADMET table.
 *
 * The radar is drawn as inline SVG. Two of its decisions carry the weight:
 *
 * An axis with no value is drawn as a **gap in the polygon**, not as a point
 * at the centre. A point at the centre reads as "scored zero — this is bad";
 * a gap reads as "not scored — we don't know". Those are entirely different
 * statements and the shape must not conflate them.
 *
 * Axis labels are **tinted by the confidence** of the prediction behind them,
 * so a shape held up by three heuristics does not look as solid as one held
 * up by measured models.
 */

import { esc, loading, notice } from "../../ui.js";
import { propApi } from "../api.js";
import { needsStructure, structure } from "../router.js";
import { confidenceChip, formatValue, whyPanel } from "../ui.js";

const DOMAIN_LABELS = {
  physicochemical: "Physicochemical",
  absorption: "Absorption",
  distribution: "Distribution",
  metabolism: "Metabolism",
  excretion: "Excretion",
  toxicity: "Toxicity",
  interference: "Assay interference",
};

export async function profileView(root, params) {
  const smiles = structure.get();
  if (!smiles) {
    root.innerHTML = needsStructure();
    return;
  }

  root.innerHTML = loading("Profiling the structure…");

  let profile;
  try {
    profile = await propApi.profile(smiles, true);
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const chart = await propApi.radar(smiles).catch(() => null);
  const level1 = profile.level1 || {};
  const descriptors = level1.descriptors || {};

  root.innerHTML = `
    <div class="pi-summary">
      <div class="pi-summary-structure">
        <div class="pi-formula mono">${esc(descriptors.molecular_formula || "")}</div>
        <div class="pi-smiles mono">${esc(
          profile.structure.canonical_smiles || ""
        )}</div>
        <div class="dim small">${esc(profile.structure.inchikey || "")}</div>
      </div>
      <div class="spacer"></div>
      <div class="pi-summary-meta dim small">
        engine ${esc(profile.engine_version)} ·
        descriptors ${esc(profile.descriptor_version)} ·
        ${esc(level1.toolkit || "")} ·
        ${profile.duration_ms} ms
      </div>
    </div>

    <div class="pi-uncertainty-banner">
      <span class="ico">◈</span>
      <div>
        <strong>${esc(profile.uncertainty.headline)}</strong>
        <div class="dim small">${esc(profile.uncertainty.note)}</div>
      </div>
    </div>

    ${renderConsensus(profile.consensus)}

    <div class="pi-grid">
      <section class="card">
        <h3>Property radar</h3>
        <div id="pi-radar"></div>
      </section>
      <section class="card">
        <h3>Deterministic chemistry <span class="pi-computed">COMPUTED</span></h3>
        ${renderDescriptors(level1)}
      </section>
    </div>

    <section class="card">
      <h3>Predicted properties</h3>
      <p class="dim small">${esc(profile.levels.level2)}</p>
      <div id="pi-predictions"></div>
    </section>

    ${renderActivity(profile.activity)}
  `;

  if (chart) drawRadar(root.querySelector("#pi-radar"), chart);
  renderPredictions(root.querySelector("#pi-predictions"), profile);
}

/* ---------------------------------------------------------------- radar */

function drawRadar(host, chart) {
  const axes = chart.axes || [];
  if (!axes.length) {
    host.innerHTML = '<div class="dim">No radar axes available.</div>';
    return;
  }

  const size = 460;
  const centre = size / 2;
  const radius = centre - 76;
  const step = (Math.PI * 2) / axes.length;

  const point = (index, value) => {
    const angle = index * step - Math.PI / 2;
    return [
      centre + radius * value * Math.cos(angle),
      centre + radius * value * Math.sin(angle),
    ];
  };

  // Only scored axes contribute vertices. A missing axis leaves a gap rather
  // than pulling the polygon to the centre, because "unknown" and "zero" are
  // different claims and the shape must not merge them.
  const scored = axes
    .map((axis, index) => ({ axis, index }))
    .filter(({ axis }) => axis.value !== null && axis.value !== undefined);

  const polygon = scored
    .map(({ axis, index }) => point(index, axis.value).map((n) => n.toFixed(1)).join(","))
    .join(" ");

  const confidenceTone = (confidence) =>
    !confidence
      ? "computed"
      : String(confidence).toLowerCase().replace(/_/g, "-");

  host.innerHTML = `
    <svg class="pi-radar" viewBox="0 0 ${size} ${size}" role="img"
         aria-label="Property radar">
      ${[0.25, 0.5, 0.75, 1]
        .map(
          (ring) =>
            `<circle cx="${centre}" cy="${centre}" r="${(radius * ring).toFixed(
              1
            )}" class="pi-radar-ring" />`
        )
        .join("")}

      ${axes
        .map((axis, index) => {
          const [x, y] = point(index, 1);
          return `<line x1="${centre}" y1="${centre}" x2="${x.toFixed(
            1
          )}" y2="${y.toFixed(1)}" class="pi-radar-spoke" />`;
        })
        .join("")}

      ${
        scored.length >= 3
          ? `<polygon points="${polygon}" class="pi-radar-shape" />`
          : ""
      }

      ${scored
        .map(({ axis, index }) => {
          const [x, y] = point(index, axis.value);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(
            1
          )}" r="4" class="pi-radar-dot pi-radar-${confidenceTone(
            axis.confidence
          )}"><title>${esc(axis.label)}: ${axis.raw ?? "—"}</title></circle>`;
        })
        .join("")}

      ${axes
        .map((axis, index) => {
          const [x, y] = point(index, 1.2);
          const missing = axis.value === null || axis.value === undefined;
          return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"
            class="pi-radar-label pi-radar-${confidenceTone(axis.confidence)}
                   ${missing ? "missing" : ""}"
            text-anchor="middle">${esc(axis.label)}${
            missing ? " (not scored)" : ""
          }</text>`;
        })
        .join("")}
    </svg>
    <div class="pi-radar-note">${esc(chart.note)}</div>
    ${
      chart.missing_axes?.length
        ? `<div class="pi-radar-missing">Not scored: ${chart.missing_axes
            .map(esc)
            .join(", ")} — drawn as gaps, not as zero.</div>`
        : ""
    }`;
}

/* ---------------------------------------------------------- descriptors */

function renderDescriptors(level1) {
  const d = level1.descriptors || {};
  const rows = [
    ["Molecular weight", `${d.molecular_weight?.toFixed(2)} Da`],
    ["Exact mass", `${d.exact_mass?.toFixed(4)} Da`],
    ["clogP", d.clogp?.toFixed(2)],
    ["TPSA", `${d.tpsa?.toFixed(1)} Å²`],
    ["H-bond donors", d.hbd],
    ["H-bond acceptors", d.hba],
    ["Rotatable bonds", d.rotatable_bonds],
    ["Rings / aromatic", `${d.rings} / ${d.aromatic_rings}`],
    ["Fraction sp³", d.fraction_csp3?.toFixed(3)],
    ["Formal charge", d.formal_charge],
    ["Stereocentres", `${d.defined_stereocentres} defined, ${d.undefined_stereocentres} undefined`],
    ["QED", d.qed?.toFixed(3)],
  ];

  const sa = level1.synthetic_accessibility || {};
  const alerts = level1.structural_alerts || {};

  return `
    <table class="pi-table">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td>${esc(label)}</td><td class="mono">${esc(
              String(value ?? "—")
            )}</td></tr>`
        )
        .join("")}
      ${
        sa.available
          ? `<tr><td>Synthetic accessibility</td>
             <td class="mono" title="${esc(sa.note || "")}">${sa.score} / 10</td></tr>`
          : ""
      }
    </table>

    <h4 class="pi-sub">Rule sets</h4>
    <div class="pi-rules">
      ${Object.entries(level1.rule_sets || {})
        .filter(([key]) => key !== "note")
        .map(
          ([, rule]) => `
        <div class="pi-rule ${rule.passed ? "pass" : "fail"}"
             title="${esc(rule.citation || "")}">
          <span class="pi-rule-name">${esc(rule.name)}</span>
          <span class="pi-rule-result">${
            rule.passed
              ? "no violations"
              : `${rule.violations} violation${rule.violations === 1 ? "" : "s"}`
          }</span>
          ${
            rule.violated?.length
              ? `<div class="dim small">${rule.violated.map(esc).join(", ")}</div>`
              : ""
          }
        </div>`
        )
        .join("")}
    </div>
    <p class="dim small">${esc(level1.rule_sets?.note || "")}</p>

    <h4 class="pi-sub">Structural alerts <span class="n">${alerts.count ?? 0}</span></h4>
    ${
      alerts.count
        ? `<div class="pi-alerts">${(alerts.alerts || [])
            .slice(0, 12)
            .map(
              (alert) =>
                `<span class="pi-alert" title="${esc(alert.reference || "")}">
                   <em>${esc(alert.catalog)}</em> ${esc(alert.description)}
                 </span>`
            )
            .join("")}</div>`
        : '<p class="dim small">No catalogued structural alert matched.</p>'
    }
    <p class="dim small">${esc(alerts.note || "")}</p>`;
}

/* --------------------------------------------------------- predictions */

function renderPredictions(host, profile) {
  const predictions = profile.predictions || {};
  const byDomain = profile.predictions_by_domain || {};

  host.innerHTML = Object.entries(byDomain)
    .map(([domain, keys]) => {
      const made = keys.filter((k) => predictions[k]?.is_prediction);
      const absent = keys.filter((k) => !predictions[k]?.is_prediction);

      return `
        <div class="pi-domain">
          <h4 class="pi-sub">${esc(DOMAIN_LABELS[domain] || domain)}
            <span class="n">${made.length} predicted${
              absent.length ? `, ${absent.length} no model` : ""
            }</span>
          </h4>

          ${
            made.length
              ? made
                  .map((key) => {
                    const entry = predictions[key];
                    return `
                <div class="pi-prediction">
                  <div class="pi-prediction-head">
                    <span class="pi-prop">${esc(entry.property_label)}</span>
                    <span class="pi-value">${formatValue(entry)}</span>
                    ${confidenceChip(
                      entry.confidence,
                      entry.confidence_description
                    )}
                  </div>
                  ${whyPanel(entry)}
                </div>`;
                  })
                  .join("")
              : ""
          }

          ${
            absent.length
              ? `<div class="pi-absent">
                   ${absent
                     .map((key) => {
                       const entry = predictions[key];
                       return `<details class="pi-nomodel-row">
                         <summary>
                           <span class="pi-prop">${esc(entry.property_label)}</span>
                           <span class="pi-nomodel">no model installed</span>
                         </summary>
                         <div class="pi-nomodel-body">
                           <p>${esc(entry.reason)}</p>
                           ${
                             entry.remedy
                               ? `<p class="dim"><strong>What would enable it:</strong>
                                  ${esc(entry.remedy)}</p>`
                               : ""
                           }
                         </div>
                       </details>`;
                     })
                     .join("")}
                 </div>`
              : ""
          }
        </div>`;
    })
    .join("");
}

/* --------------------------------------------------------- consensus */

function renderConsensus(consensus) {
  if (!consensus?.length) return "";
  return consensus
    .map(
      (entry) => `
    <div class="pi-consensus ${entry.agree ? "agree" : "disagree"}">
      <span class="ico">${entry.agree ? "✓" : "⚠"}</span>
      <div>
        <strong>${esc(entry.question)}</strong>
        <div>${esc(entry.explanation)}</div>
        <div class="dim small">${esc(entry.note)}</div>
      </div>
    </div>`
    )
    .join("");
}

/* ---------------------------------------------------------- activity */

function renderActivity(activity) {
  if (!activity) return "";
  const experimental = activity.experimental_binding || {};

  return `
    <section class="card">
      <h3>Activity</h3>
      <p class="dim small">${esc(activity.separation_note)}</p>

      <h4 class="pi-sub">Measured binding
        <span class="pi-measured">MEASURED</span></h4>
      ${
        experimental.found && experimental.targets?.length
          ? `<table class="pi-table">
               <thead><tr><th>Target</th><th>Type</th><th>Value</th>
                 <th>Species</th><th>Assay</th></tr></thead>
               <tbody>
                 ${experimental.targets
                   .slice(0, 12)
                   .flatMap((group) =>
                     group.measurements.slice(0, 3).map(
                       (m) => `<tr>
                         <td>${esc(group.target)}</td>
                         <td>${esc(m.measure_type)}</td>
                         <td class="mono">${esc(
                           `${m.relation && m.relation !== "=" ? m.relation : ""}${
                             m.value ?? "—"
                           } ${m.units || ""}`
                         )}</td>
                         <td>${esc(m.species || "—")}</td>
                         <td class="dim small">${esc(
                           (m.assay || "not recorded").slice(0, 90)
                         )}</td>
                       </tr>`
                     )
                   )
                   .join("")}
               </tbody>
             </table>
             <p class="dim small">${esc(experimental.note || "")}</p>`
          : `<p class="dim">${esc(
              experimental.reason ||
                "No measured activity is held for this structure."
            )}</p>`
      }

      <h4 class="pi-sub">Docking</h4>
      <p class="dim">${esc(
        activity.docking.reason || "Docking results available."
      )}</p>
      <div class="pi-caveat">${esc(activity.docking.warning)}</div>

      <h4 class="pi-sub">Predicted affinity</h4>
      <p class="dim">${esc(
        activity.predicted_affinity.reason || "Predictions available."
      )}</p>
    </section>`;
}
