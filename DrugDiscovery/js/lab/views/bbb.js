/**
 * BBB Lab.
 *
 * Ordering is the argument: measured data first, model prediction second,
 * physicochemical heuristics third. That is the order of evidential strength,
 * and rendering it any other way would invite a reader to weigh a CNS MPO
 * score against a measured logBB.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { labApi } from "../api.js";
import { needsStructure, needsSubject } from "../router.js";
import { subjectStore, workbench } from "../store.js";
import { provBadge, tiles, unavailablePanel, wireProvenance } from "../ui.js";
import { BbbAnimation } from "../bbb-animation.js";

const animations = new Set();

export async function bbbView(root, params) {
  const subject = subjectStore.get();
  if (!subject) {
    root.innerHTML = needsSubject("the BBB Lab");
    return;
  }

  // Structures come from the subject, from the workbench, or from a SMILES the
  // user types — the lab must work on a designed molecule that has no entity.
  const typed = params?.get("smiles");
  const initial = typed || subject.smiles;

  root.innerHTML = `
    <div class="toolbar mb">
      <input class="search-input" id="bbb-smiles" type="text" spellcheck="false"
             placeholder="SMILES to assess" value="${esc(initial || "")}"
             style="flex:1;min-width:260px" />
      <button class="sm primary" id="bbb-run">Assess</button>
      <select id="bbb-compare-pick"><option value="">Compare with…</option></select>
    </div>
    <div id="bbb-body"></div>`;

  const saved = workbench.all();
  const picker = root.querySelector("#bbb-compare-pick");
  saved.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.smiles;
    option.textContent = `${item.transformation?.name || "candidate"} — ${item.smiles.slice(0, 28)}`;
    picker.appendChild(option);
  });

  const body = root.querySelector("#bbb-body");

  const run = async () => {
    const smiles = root.querySelector("#bbb-smiles").value.trim();
    if (!smiles) {
      body.innerHTML = needsStructure(subject);
      return;
    }
    const comparison = picker.value;
    await render(body, smiles, comparison);
  };

  root.querySelector("#bbb-run").addEventListener("click", run);
  picker.addEventListener("change", run);
  root.querySelector("#bbb-smiles").addEventListener("keydown", (event) => {
    if (event.key === "Enter") run();
  });

  if (initial) await run();
  else body.innerHTML = needsStructure(subject);
}

async function render(body, smiles, comparisonSmiles) {
  stopAll();
  body.innerHTML = loading("Running the assessment…");

  let assessments;
  try {
    assessments = comparisonSmiles
      ? await Promise.all([labApi.bbb(smiles), labApi.bbb(comparisonSmiles)])
      : [await labApi.bbb(smiles)];
  } catch (error) {
    body.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  body.innerHTML = `<div class="${
    assessments.length > 1 ? "compare-strip" : ""
  }" id="bbb-panels"></div>`;

  const host = body.querySelector("#bbb-panels");
  assessments.forEach((assessment, index) => {
    const section = document.createElement("div");
    section.innerHTML = panel(assessment, index);
    host.appendChild(section);

    const canvas = section.querySelector("canvas");
    if (canvas && assessment.animation?.available) {
      const animation = new BbbAnimation(canvas, assessment.animation);
      animations.add(animation);
      animation.start();

      section.querySelector("[data-anim-toggle]")?.addEventListener("click", (event) => {
        if (animation.running) {
          animation.stop();
          event.target.textContent = "Resume";
        } else {
          animation.start();
          event.target.textContent = "Pause";
        }
      });
      section.querySelector("[data-anim-reset]")?.addEventListener("click", () => {
        animation.reset();
      });
    }
  });

  wireProvenance(body);
}

function panel(assessment, index) {
  const prediction = assessment.prediction || {};
  const experimental = assessment.experimental;
  const animation = assessment.animation || {};
  const heuristics = assessment.heuristics || {};
  const descriptors = heuristics.descriptors || {};
  const predicted = "value" in prediction;

  const domain = predicted
    ? prediction.uncertainty?.applicability_domain || {}
    : {};
  const performance = predicted
    ? prediction.uncertainty?.held_out_performance || {}
    : {};

  return `
    <section class="card">
      <h3>Assessment ${index === 0 ? "" : "(comparison)"}
        <span class="spacer"></span>
        <span class="mono small dim">${esc(
          assessment.structure.canonical_smiles.slice(0, 40)
        )}${assessment.structure.canonical_smiles.length > 40 ? "…" : ""}</span>
      </h3>

      ${
        experimental
          ? `<div class="notice notice-info" style="margin-bottom:12px">
              <span class="ico">✓</span>
              <div>
                <strong>Experimental data found.</strong>
                ${esc(experimental.value.compound_name || "This compound")} is
                classified <strong>${esc(experimental.value.classification || "—")}</strong>
                ${
                  experimental.value.logbb_mean !== null &&
                  experimental.value.logbb_mean !== undefined
                    ? `with a measured logBB of <strong>${experimental.value.logbb_mean}</strong>
                       (${experimental.value.measurements} measurement(s))`
                    : ""
                }.
                Match: ${esc(experimental.value.match)}.
                ${provBadge(experimental.provenance)}
                <div class="lab-note">${esc(experimental.provenance.note)}
                ${
                  experimental.references?.length
                    ? `<br />References: ${esc(experimental.references.slice(0, 3).join("; "))}`
                    : ""
                }</div>
              </div>
            </div>`
          : `<div class="notice notice-muted" style="margin-bottom:12px">
              <span class="ico">◌</span>
              <div>No measured blood–brain-barrier value was found for this exact
              structure in the curated experimental set. The prediction below is
              therefore the estimate, not a check on a measurement.</div>
            </div>`
      }

      ${
        predicted
          ? `
        <div class="row mb">
          <strong style="font-size:15px">${esc(prediction.value.class)}</strong>
          ${provBadge(prediction.provenance)}
          ${
            domain.inside_domain === false
              ? '<span class="rec-type rec-preliminary">Outside applicability domain</span>'
              : '<span class="rec-type rec-established">Inside applicability domain</span>'
          }
        </div>
        <div class="prob-bar mb">
          <span style="width:${(prediction.value.probability_bbb_positive * 100).toFixed(1)}%"></span>
        </div>
        <div class="small dim mb">
          Probability of the BBB+ class:
          <strong>${prediction.value.probability_bbb_positive}</strong> —
          ${esc(prediction.value.decision_band)}.
        </div>

        <div class="bbb-stage">
          <canvas></canvas>
          <div class="bbb-legend">
            <span><span class="sw" style="background:var(--text)"></span>compound</span>
            <span><span class="sw" style="background:var(--ev-established)"></span>crossed</span>
            <span><span class="sw" style="background:var(--ev-preliminary)"></span>stalled</span>
            ${
              animation.efflux_flag?.flagged
                ? '<span><span class="sw" style="background:var(--danger)"></span>returned (efflux flag)</span>'
                : ""
            }
          </div>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="sm" data-anim-toggle>Pause</button>
          <button class="sm" data-anim-reset>Re-draw</button>
          <span class="spacer"></span>
          <span class="small dim">${
            Math.round((prediction.value.probability_bbb_positive || 0) * 26)
          } of 26 particles cross, matching the predicted probability</span>
        </div>
        <div class="lab-note">${esc(animation.disclaimer)}</div>

        ${tiles(
          [
            { value: prediction.value.probability_bbb_positive, label: "BBB probability" },
            { value: heuristics.cns_mpo?.value ?? "—", label: "CNS MPO (0–6)" },
            { value: descriptors.tpsa ?? "—", label: "TPSA Å²" },
            { value: descriptors.clogp ?? "—", label: "cLogP" },
            { value: descriptors.molecular_weight ?? "—", label: "MW Da" },
            { value: descriptors.hbd ?? "—", label: "HBD" },
            {
              value: domain.nearest_training_similarity ?? "—",
              label: "Nearest training",
              title: domain.definition,
            },
            {
              value: experimental ? "yes" : "no",
              label: "Experimental",
            },
          ],
          "bbb-readout"
        )}

        <div class="prov-detail" style="margin-top:12px">
          <dl>
            <dt>Model</dt><dd>${esc(prediction.provenance.method.name)} ${esc(
              prediction.provenance.method.version
            )}</dd>
            <dt>Input representation</dt><dd>${esc(
              prediction.provenance.method.input_representation
            )}</dd>
            <dt>Training data</dt><dd>${esc(prediction.training_data.source)} —
              ${prediction.training_data.compounds} compounds
              (${prediction.training_data.positives} BBB+,
               ${prediction.training_data.negatives} BBB−),
               ${esc(prediction.training_data.license)}</dd>
            <dt>Citation</dt><dd>${esc(prediction.training_data.citation)}</dd>
            <dt>Held-out performance</dt><dd>
              ${esc(performance.split || "")}:
              ROC-AUC ${performance.roc_auc?.mean ?? "—"} ± ${performance.roc_auc?.sd ?? "—"},
              balanced accuracy ${performance.balanced_accuracy?.mean ?? "—"},
              sensitivity ${performance.sensitivity?.mean ?? "—"},
              specificity ${performance.specificity?.mean ?? "—"},
              Brier ${performance.brier_score?.mean ?? "—"}
            </dd>
            <dt>Applicability domain</dt><dd>${esc(domain.definition || "")}<br />
              ${esc(domain.interpretation || "")}</dd>
            <dt>What it predicts</dt><dd>${esc(prediction.provenance.note)}</dd>
          </dl>
        </div>`
          : unavailablePanel(prediction)
      }

      ${
        animation.efflux_flag?.available
          ? `<div class="lab-note">
              <strong>Efflux flag:</strong>
              ${animation.efflux_flag.flagged ? "raised" : "not raised"}.
              ${
                animation.efflux_flag.criteria_met?.length
                  ? esc(animation.efflux_flag.criteria_met.join("; ")) + ". "
                  : ""
              }
              ${esc(animation.efflux_flag.basis)}
            </div>`
          : ""
      }

      <h4 style="margin:18px 0 8px;font-size:13px">Physicochemical context</h4>
      <div class="small muted">${esc(heuristics.note || "")}</div>
      ${
        heuristics.cns_mpo
          ? `<div class="prov-detail" style="margin-top:9px">
              <div class="row mb"><strong>CNS MPO ${heuristics.cns_mpo.value} / 6</strong>
              ${provBadge(heuristics.cns_mpo.provenance)}</div>
              <table style="width:100%;font-size:11.5px">
                <tr><th style="text-align:left">Component</th><th style="text-align:right">Value</th>
                    <th style="text-align:right">Desirability</th><th></th></tr>
                ${heuristics.cns_mpo.components
                  .map(
                    (component) => `<tr>
                      <td>${esc(component.name)}</td>
                      <td style="text-align:right">${esc(String(component.value ?? "—"))}</td>
                      <td style="text-align:right">${component.desirability}</td>
                      <td class="dim">${
                        component.estimated
                          ? `estimated — ${esc(component.estimation_note || "")}`
                          : ""
                      }</td>
                    </tr>`
                  )
                  .join("")}
              </table>
            </div>`
          : ""
      }
      <div class="lab-note">${esc(assessment.hierarchy)}</div>
    </section>`;
}

function stopAll() {
  animations.forEach((animation) => animation.destroy());
  animations.clear();
}
