/**
 * The scientific validation dashboard.
 *
 * Everything on this page is computed from predictions the platform made and
 * results that came back. When there is not enough data, the page says so
 * instead of showing a number — a percentage from eleven points reads as
 * authoritative and is not.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { entApi } from "../api.js";

export async function validationView(host) {
  host.innerHTML = loading("Loading validation data…");

  let data;
  try {
    data = await entApi.validation();
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (data.empty) {
    host.innerHTML = `
      ${notice(esc(data.empty_note), "info", "◌")}
      ${renderProduction(data)}
    `;
    return;
  }

  host.innerHTML = `
    ${renderConfirmation(data.experimental_confirmation)}
    ${renderOutOfDomain(data.out_of_domain)}
    ${renderProduction(data)}
    ${data.per_model.map(renderModel).join("")}
    ${renderDisagreement(data.model_disagreement)}
  `;
}

function renderConfirmation(c) {
  return card(
    "Experimental confirmation",
    `<div class="ent-stats small">
       <div><span class="v">${c.predictions_made}</span><span class="l">predictions made</span></div>
       <div><span class="v">${c.predictions_tested}</span><span class="l">tested</span></div>
       <div><span class="v">${c.still_outstanding}</span><span class="l">still untested</span></div>
       <div><span class="v">${
         c.confirmation_rate != null
           ? (c.confirmation_rate * 100).toFixed(1) + "%"
           : "—"
       }</span><span class="l">tested share</span></div>
     </div>
     <p class="dim">${esc(c.note)}</p>`
  );
}

function renderOutOfDomain(o) {
  return card(
    "Out-of-domain inputs",
    `<div class="ent-stats small">
       <div><span class="v">${o.count}</span><span class="l">predictions</span></div>
       <div><span class="v">${
         o.share != null ? (o.share * 100).toFixed(1) + "%" : "—"
       }</span><span class="l">of all predictions</span></div>
     </div>
     <p class="dim">${esc(o.note)}</p>`
  );
}

function renderProduction(data) {
  const models = data.models_in_production || [];
  if (!models.length) {
    return card(
      "Models in production",
      empty(
        "No model is in production. A model reaches production only after " +
          "an attributed human validated it on held-out data."
      )
    );
  }
  return card(
    "Models in production",
    models
      .map(
        (m) => `<div class="ent-prod-model">
          <strong>${esc(m.name)}</strong>
          <span class="mono dim">${esc(m.model_key)}@${esc(m.version)}</span>
          <p class="dim">${esc(m.context_of_use)}</p>
        </div>`
      )
      .join("")
  );
}

function renderModel(m) {
  return card(
    `${esc(m.model_key)}`,
    `<div class="ent-stats small">
       <div><span class="v">${m.n_predictions}</span><span class="l">predictions</span></div>
       <div><span class="v">${m.n_observed}</span><span class="l">observed</span></div>
     </div>
     ${renderMetrics(m.metrics)}
     ${renderCalibration(m.calibration)}
     ${renderDrift(m.drift)}
     ${renderFailures(m.worst_failures)}`
  );
}

function renderMetrics(metrics) {
  if (!metrics?.reportable) {
    return `<p class="dim"><strong>Accuracy not reported.</strong> ${esc(
      metrics?.reason || ""
    )}</p>`;
  }
  const entries = Object.entries(metrics).filter(
    ([k, v]) => typeof v === "number" && k !== "n"
  );
  return `<div class="ent-field">
    <div class="ent-field-label">Accuracy (n = ${metrics.n})</div>
    <table class="ent-table compact">
      ${entries
        .map(([k, v]) => `<tr><td class="mono">${esc(k)}</td><td>${v}</td></tr>`)
        .join("")}
    </table></div>`;
}

function renderCalibration(cal) {
  if (!cal?.reportable) {
    return `<p class="dim"><strong>Calibration not reported.</strong> ${esc(
      cal?.reason || ""
    )}</p>`;
  }
  const rows = Object.entries(cal.bands || {})
    .map(
      ([band, v]) =>
        `<tr><td>${esc(band)}</td><td>${v.n}</td><td>${(
          v.agreement_rate * 100
        ).toFixed(1)}%</td></tr>`
    )
    .join("");
  return `<div class="ent-field">
    <div class="ent-field-label">Calibration</div>
    <table class="ent-table compact">
      <thead><tr><th>Confidence band</th><th>n</th><th>Agreement</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="${
      cal.confidence_tracks_accuracy === false ? "ent-warn-inline" : "dim"
    }">${esc(cal.interpretation)}</p></div>`;
}

function renderDrift(drift) {
  if (!drift?.reportable) {
    return `<p class="dim"><strong>Drift not reported.</strong> ${esc(
      drift?.reason || ""
    )}</p>`;
  }
  const rows = Object.entries(drift.delta || {})
    .map(
      ([metric, v]) =>
        `<tr><td class="mono">${esc(metric)}</td><td>${v.earlier}</td>
         <td>${v.recent}</td><td>${v.change > 0 ? "+" : ""}${v.change}</td></tr>`
    )
    .join("");
  return `<div class="ent-field">
    <div class="ent-field-label">Drift over ${drift.window_days} days</div>
    <table class="ent-table compact">
      <thead><tr><th>Metric</th><th>Earlier</th><th>Recent</th><th>Change</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="${drift.drifting ? "ent-warn-inline" : "dim"}">${esc(
    drift.interpretation
  )}</p></div>`;
}

function renderFailures(failures) {
  if (!failures?.length) return "";
  return `<div class="ent-field">
    <div class="ent-field-label">Worst failures</div>
    <table class="ent-table compact">
      <thead><tr><th>Subject</th><th>Predicted</th><th>Observed</th>
        <th>Error</th><th>Band</th></tr></thead>
      <tbody>${failures
        .map(
          (f) => `<tr class="${f.out_of_domain ? "ent-ood" : ""}">
            <td class="mono">${esc(f.subject_id)}</td>
            <td>${f.predicted}</td><td>${f.observed}</td>
            <td>${f.error}</td><td>${esc(f.confidence_band || "—")}</td>
          </tr>`
        )
        .join("")}</tbody></table>
    <p class="dim">A summary statistic hides the failure mode. These are the
      specific predictions that went most wrong.</p></div>`;
}

function renderDisagreement(d) {
  if (!d?.count) {
    return card("Model disagreement", empty("No two models disagree."));
  }
  return card(
    `Model disagreement — ${d.count}`,
    `<ul>${d.conflicts
      .map(
        (c) =>
          `<li><span class="mono">${esc(c.subject_id)}</span> ·
           ${esc(c.property_key)}:
           ${c.predictions
             .map(
               (p) =>
                 `<code>${esc(p.model_key)}=${esc(
                   String(p.label ?? p.value)
                 )}</code>`
             )
             .join(" vs ")}</li>`
      )
      .join("")}</ul>
     <p class="dim">${esc(d.note)}</p>`
  );
}
