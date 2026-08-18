/**
 * The model registry.
 *
 * Shows every model the engine has, grouped by how well characterised it is,
 * and — in the same view, at the same weight — every property it deliberately
 * does not model.
 *
 * Putting those two lists on one page is the point. A registry that showed
 * only what exists would let a reader assume the rest was covered.
 */

import { esc, loading, notice } from "../../ui.js";
import { propApi } from "../api.js";

const STATUS_ORDER = ["validated", "published", "heuristic", "experimental", "unvalidated"];

const STATUS_HEADINGS = {
  validated: "Validated here",
  published: "Published performance",
  heuristic: "Heuristics — no accuracy claim",
  experimental: "Uncharacterised",
  unvalidated: "Unvalidated",
};

const STATUS_NOTES = {
  validated:
    "Held-out performance measured on this platform, with a stated sample size and split.",
  published:
    "Performance as reported by the model's original authors. Those figures describe the authors' test set, not the molecules you are looking at.",
  heuristic:
    "A documented rule with no performance claim attached. Lipinski's rule of five is enormously useful and has no AUROC; inventing one would be worse than saying so.",
  experimental: "Implemented and running; performance not yet characterised.",
  unvalidated: "No performance evidence of any kind.",
};

export async function modelsView(root) {
  root.innerHTML = loading("Loading the registry…");

  let registry;
  try {
    registry = await propApi.models();
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const counts = registry.counts || {};
  const byStatus = {};
  for (const model of registry.implemented || []) {
    (byStatus[model.validation_status] ||= []).push(model);
  }

  root.innerHTML = `
    <div class="pi-registry-summary">
      ${[
        ["implemented", "models implemented"],
        ["validated_here", "validated here"],
        ["published_only", "published figures"],
        ["heuristic", "heuristics"],
        ["declared_unavailable", "properties with no model"],
      ]
        .map(
          ([key, label]) => `
        <div class="pi-registry-count">
          <div class="value">${counts[key] ?? 0}</div>
          <div class="label">${esc(label)}</div>
        </div>`
        )
        .join("")}
    </div>

    <div class="pi-caveat">${esc(registry.note)}</div>

    ${STATUS_ORDER.filter((status) => byStatus[status]?.length)
      .map(
        (status) => `
      <section class="card">
        <h3>${esc(STATUS_HEADINGS[status])}
          <span class="n">${byStatus[status].length}</span></h3>
        <p class="dim small">${esc(STATUS_NOTES[status])}</p>
        ${byStatus[status].map(renderModel).join("")}
      </section>`
      )
      .join("")}

    <section class="card pi-unavailable-section">
      <h3>Properties with no model
        <span class="n">${(registry.declared_unavailable || []).length}</span></h3>
      <p class="dim small">
        Each of these was considered and rejected on the same ground: no model
        that could be defended. An invented number for a safety endpoint is
        not a conservative default — it is a fabricated signal.
      </p>
      <table class="pi-table">
        <thead><tr><th>Property</th><th>Why not</th><th>What would enable it</th></tr></thead>
        <tbody>
          ${(registry.declared_unavailable || [])
            .map(
              (entry) => `
            <tr>
              <td><strong>${esc(entry.label)}</strong>
                  <div class="dim small">${esc(entry.domain)}</div></td>
              <td>${esc(entry.reason)}</td>
              <td class="dim small">${esc(entry.remedy)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`;
}

function renderModel(model) {
  const training = model.training_data || {};
  const validation = model.validation || {};

  const metrics = Object.entries({
    RMSE: validation.rmse,
    "R²": validation.r2,
    AUROC: validation.auroc,
    "Bal. acc.": validation.balanced_accuracy,
    Sensitivity: validation.sensitivity,
    Specificity: validation.specificity,
    MCC: validation.mcc,
    Brier: validation.brier,
  }).filter(([, value]) => value !== null && value !== undefined);

  return `
    <details class="pi-model">
      <summary>
        <span class="pi-model-name">${esc(model.name)}</span>
        <span class="mono dim">${esc(model.version)}</span>
        <span class="pi-model-prop">${esc(model.property_label)}</span>
        ${
          model.available
            ? ""
            : '<span class="pi-nomodel">unavailable on this deployment</span>'
        }
      </summary>
      <div class="pi-model-body">
        <p>${esc(model.method)}</p>

        <table class="pi-modeltable">
          <tr><td>Property</td><td>${esc(model.property_label)}</td></tr>
          <tr><td>Domain</td><td>${esc(model.domain)}</td></tr>
          <tr><td>Output</td><td>${esc(model.kind)}${
            model.units ? ` (${esc(model.units)})` : ""
          }</td></tr>
          <tr><td>Training source</td><td>${esc(training.source || "—")}</td></tr>
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
          <tr><td>Max confidence</td><td>${esc(
            String(model.max_confidence).replace(/_/g, " ").toLowerCase()
          )}</td></tr>
        </table>

        ${
          metrics.length
            ? `<h5>Performance <span class="dim small">${esc(
                validation.split || ""
              )}${
                validation.sample_size
                  ? ` · n = ${Number(validation.sample_size).toLocaleString()}`
                  : ""
              }</span></h5>
               <div class="pi-metrics">
                 ${metrics
                   .map(
                     ([k, v]) =>
                       `<span class="pi-metric"><em>${esc(k)}</em>
                        ${Number(v).toFixed(3)}</span>`
                   )
                   .join("")}
               </div>
               ${
                 validation.calibration_note
                   ? `<p class="dim small">${esc(validation.calibration_note)}</p>`
                   : ""
               }`
            : `<p class="pi-unmeasured">No performance measured. This is why
               the model is not described as validated.</p>`
        }

        <h5>Limitations</h5>
        <ul class="pi-limitations">
          ${(model.limitations || []).map((l) => `<li>${esc(l)}</li>`).join("")}
        </ul>

        ${
          model.applicability?.note
            ? `<h5>Applicability domain</h5>
               <p class="dim small">${esc(model.applicability.note)}</p>`
            : ""
        }
      </div>
    </details>`;
}
