/**
 * The model registry.
 *
 * The lifecycle state is the headline, because it is the thing a reader most
 * needs and most often assumes. A model in 'development' being used for a
 * decision is a finding; a model in 'production' with no calibration data is
 * also a finding. Both are shown rather than smoothed over.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { entApi } from "../api.js";

const STATUS_TONE = {
  development: "",
  validated: "ok",
  production: "info",
  deprecated: "warn",
  retired: "danger",
};

export async function modelsView(host) {
  host.innerHTML = loading("Loading the registry…");

  let data;
  try {
    data = await entApi.models();
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!data.models.length) {
    host.innerHTML = empty("No model is registered yet.");
    return;
  }

  host.innerHTML = `
    <div class="ent-stats small">
      ${Object.entries(data.by_status)
        .map(
          ([status, n]) =>
            `<div><span class="v">${n}</span><span class="l">${esc(
              status
            )}</span></div>`
        )
        .join("")}
    </div>
    ${notice(esc(data.note), "info", "ℹ")}
    <div class="ent-models">
      ${data.models.map(renderModel).join("")}
    </div>
  `;
}

function renderModel(m) {
  const perf = Object.entries(m.performance || {}).filter(
    ([, v]) => typeof v === "number"
  );

  return card(
    `${esc(m.name)} <span class="ent-pill ${
      STATUS_TONE[m.status] || ""
    }">${esc(m.status)}</span>`,
    `<div class="ent-model-key mono">${esc(m.model_key)} @ ${esc(m.version)}</div>

     <div class="ent-field">
       <div class="ent-field-label">Context of use</div>
       <p>${esc(m.context_of_use)}</p>
     </div>

     ${
       perf.length
         ? `<div class="ent-field">
              <div class="ent-field-label">Measured performance</div>
              <table class="ent-table compact">
                ${perf
                  .map(
                    ([k, v]) =>
                      `<tr><td class="mono">${esc(k)}</td><td>${v}</td></tr>`
                  )
                  .join("")}
              </table>
            </div>`
         : `<p class="dim">No numeric performance is recorded. This model
              cannot be promoted to validated until it is.</p>`
     }

     ${
       m.validation_data?.held_out
         ? `<p class="dim">Validated on held-out data (n = ${esc(
             String(m.validation_data.n ?? "unrecorded")
           )}).</p>`
         : `<p class="ent-warn-inline">No held-out validation data is
              recorded. Performance measured on training data is
              resubstitution, not validation.</p>`
     }

     ${
       m.limitations?.length
         ? `<div class="ent-field">
              <div class="ent-field-label">Limitations</div>
              <ul>${m.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
            </div>`
         : ""
     }

     ${
       m.status_changed_by
         ? `<div class="dim">Moved to <strong>${esc(
             m.status
           )}</strong> by ${esc(m.status_changed_by)}${
             m.status_rationale ? ` — ${esc(m.status_rationale)}` : ""
           }</div>`
         : `<div class="dim">Never transitioned; still in its initial state.</div>`
     }`,
    "ent-model"
  );
}
