/**
 * Display primitives for the Property Intelligence Engine.
 *
 * The confidence chip and the "why does the system think this?" panel are the
 * two that matter. Every predicted number in this section is rendered with a
 * confidence chip beside it and a why-panel behind it — not as a courtesy,
 * but because a number without its provenance is the exact failure mode the
 * engine is built to avoid, and the interface is the last place that can
 * still get it wrong.
 */

import { esc } from "../ui.js";

/** Confidence chip. Out-of-domain is styled as an absence, not a low score. */
export function confidenceChip(confidence, description = "") {
  if (!confidence) return "";
  const tone = String(confidence).toLowerCase().replace(/_/g, "-");
  const label = String(confidence)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
  return `<span class="pi-conf pi-conf-${esc(tone)}" title="${esc(
    description
  )}">${esc(label)}</span>`;
}

/** Badge marking how well characterised the model behind a value is. */
export function validationChip(status, isValidated) {
  if (!status) return "";
  const label =
    {
      validated: "Validated here",
      published: "Published figures",
      heuristic: "Heuristic — no accuracy claim",
      experimental: "Uncharacterised",
      unvalidated: "Unvalidated",
    }[status] || status;
  return `<span class="pi-val pi-val-${esc(status)}">${esc(label)}</span>`;
}

/** Risk band pill for ordinal properties. */
export function bandPill(band) {
  if (!band) return '<span class="dim">—</span>';
  const key = String(band).toLowerCase().replace(/\s+/g, "-");
  return `<span class="pi-band pi-band-${esc(key)}">${esc(band)}</span>`;
}

/** Format a predicted value with its units, or the reason there is none. */
export function formatValue(entry) {
  if (!entry) return '<span class="dim">—</span>';
  if (!entry.is_prediction) {
    return `<span class="pi-nomodel" title="${esc(
      entry.reason || ""
    )}">no model</span>`;
  }
  if (entry.value === null || entry.value === undefined) {
    // The refusal is the result. It must not look like a missing field.
    return `<span class="pi-outside" title="${esc(
      entry.confidence_description || ""
    )}">not scored</span>`;
  }
  if (entry.kind === "categorical_risk") return bandPill(entry.value);
  if (typeof entry.value === "number") {
    const rendered =
      Math.abs(entry.value) >= 1000 || (Math.abs(entry.value) < 0.01 && entry.value !== 0)
        ? entry.value.toExponential(2)
        : entry.value.toFixed(2);
    return `<span class="mono">${esc(rendered)}${
      entry.units ? ` <em>${esc(entry.units)}</em>` : ""
    }</span>`;
  }
  return esc(String(entry.value));
}

/**
 * The expandable "why does the system think this?" panel.
 *
 * Collapsed by default so a profile is readable, and containing the full
 * chain when opened: the reasoning, the drivers, the applicability
 * assessment, the model, its training data with citation, its measured or
 * published performance, and its limitations.
 */
export function whyPanel(entry) {
  if (!entry || !entry.is_prediction) return "";
  const model = entry.model || {};
  const training = model.training_data || {};
  const validation = model.validation || {};
  const applicability = entry.applicability || {};

  const metrics = Object.entries({
    RMSE: validation.rmse,
    MAE: validation.mae,
    "R²": validation.r2,
    AUROC: validation.auroc,
    AUPRC: validation.auprc,
    "Balanced accuracy": validation.balanced_accuracy,
    Sensitivity: validation.sensitivity,
    Specificity: validation.specificity,
    MCC: validation.mcc,
    "Brier score": validation.brier,
  }).filter(([, value]) => value !== null && value !== undefined);

  return `
    <details class="pi-why">
      <summary>Why does the system think this?</summary>
      <div class="pi-why-body">

        <h5>Reasoning</h5>
        <ol class="pi-reasoning">
          ${(entry.rationale || []).map((line) => `<li>${esc(line)}</li>`).join("")}
        </ol>

        ${
          Object.keys(entry.drivers || {}).length
            ? `<h5>What drove it</h5>
               <table class="pi-drivers">
                 ${Object.entries(entry.drivers)
                   .filter(([, v]) => typeof v !== "object")
                   .map(
                     ([k, v]) =>
                       `<tr><td>${esc(k.replace(/_/g, " "))}</td>
                        <td class="mono">${esc(String(v))}</td></tr>`
                   )
                   .join("")}
               </table>`
            : ""
        }

        <h5>Applicability to this molecule</h5>
        ${
          applicability && Object.keys(applicability).length
            ? `<p class="${
                applicability.in_domain ? "pi-in-domain" : "pi-out-domain"
              }">
                 ${
                   applicability.in_domain
                     ? "Inside the model's domain"
                     : "Outside the model's domain"
                 }
                 (coverage ${((applicability.score ?? 0) * 100).toFixed(0)}%)
               </p>
               <ul>${(applicability.reasons || [])
                 .map((r) => `<li>${esc(r)}</li>`)
                 .join("")}</ul>`
            : '<p class="dim">Not characterised.</p>'
        }

        <h5>Model</h5>
        <table class="pi-modeltable">
          <tr><td>Name</td><td>${esc(model.name || "—")}</td></tr>
          <tr><td>Version</td><td class="mono">${esc(model.version || "—")}</td></tr>
          <tr><td>Method</td><td>${esc(model.method || "—")}</td></tr>
          <tr><td>Status</td><td>${validationChip(
            model.validation_status,
            model.is_validated
          )}</td></tr>
        </table>

        <h5>Training data</h5>
        <table class="pi-modeltable">
          <tr><td>Source</td><td>${esc(training.source || "—")}</td></tr>
          ${
            training.compounds
              ? `<tr><td>Compounds</td><td>${Number(
                  training.compounds
                ).toLocaleString()}</td></tr>`
              : ""
          }
          ${
            training.citation
              ? `<tr><td>Citation</td><td>${esc(training.citation)}</td></tr>`
              : ""
          }
          ${
            training.doi
              ? `<tr><td>DOI</td><td><a href="https://doi.org/${esc(
                  training.doi
                )}" target="_blank" rel="noopener">${esc(training.doi)}</a></td></tr>`
              : ""
          }
          ${
            training.license
              ? `<tr><td>Licence</td><td>${esc(training.license)}</td></tr>`
              : ""
          }
        </table>

        <h5>Measured performance</h5>
        ${
          validation.measured
            ? `<p class="dim small">${esc(validation.split || "")}${
                validation.sample_size
                  ? ` · n = ${Number(validation.sample_size).toLocaleString()}`
                  : ""
              }</p>
               <table class="pi-modeltable">
                 ${metrics
                   .map(
                     ([k, v]) =>
                       `<tr><td>${esc(k)}</td><td class="mono">${Number(
                         v
                       ).toFixed(3)}</td></tr>`
                   )
                   .join("")}
               </table>
               ${
                 validation.calibration_note
                   ? `<p class="dim small">${esc(validation.calibration_note)}</p>`
                   : ""
               }`
            : `<p class="pi-unmeasured">No performance was measured for this
               model. That is why it is not described as validated.</p>`
        }

        ${
          entry.uncertainty_basis
            ? `<h5>Uncertainty</h5>
               <p>${
                 entry.uncertainty !== null && entry.uncertainty !== undefined
                   ? `± ${esc(String(entry.uncertainty))}${
                       entry.units ? ` ${esc(entry.units)}` : ""
                     }. `
                   : ""
               }${esc(entry.uncertainty_basis)}</p>`
            : ""
        }

        <h5>Known limitations</h5>
        <ul class="pi-limitations">
          ${(model.limitations || [])
            .map((limitation) => `<li>${esc(limitation)}</li>`)
            .join("")}
        </ul>

        <p class="pi-integrity">
          This is a prediction, not a measurement.
        </p>
      </div>
    </details>`;
}

export const piDisclaimer = `
  <div class="disclaimer">
    <strong>Predictions, not measurements.</strong>
    Everything in this section except values shown under measured activity is
    calculated or predicted. Each prediction names the model that produced it,
    that model's training data, its measured or published performance, and its
    known limitations. Properties with no defensible model are reported as
    having none rather than being estimated. Research and education only; not
    medical advice.
  </div>`;
