/** Predict with promoted models; show withheld endpoints rather than hiding them. */

import { esc, loading, notice } from "../../ui.js";
import { qsApi } from "../api.js";

export async function predictView(root) {
  root.innerHTML = `
    <section class="qs-controls lg-surface lg-d1">
      <label for="qs-smiles">Molecule (SMILES)</label>
      <div class="qs-row">
        <input id="qs-smiles" type="text" spellcheck="false"
               value="CN1CCN(Cc2ccc(cc2)C(=O)Nc2ccc(C)c(Nc3nccc(n3)-c3cccnc3)c2)CC1" />
        <button id="qs-go" class="qs-btn">Predict</button>
      </div>
    </section>
    <div id="qs-pred-out"></div>`;

  const out = root.querySelector("#qs-pred-out");

  root.querySelector("#qs-go").addEventListener("click", async () => {
    const smiles = root.querySelector("#qs-smiles").value.trim();
    if (!smiles) return;
    out.innerHTML = loading("Predicting…");
    try {
      const result = await qsApi.predict({ smiles });
      out.innerHTML = `
        ${result.predictions.length ? result.predictions.map(card).join("")
          : `<p class="dim">No model is currently exposed as an endpoint.</p>`}
        ${result.withheld_endpoints?.length ? `
          <section class="qs-card lg-surface lg-d1">
            <h3>Withheld endpoints <span class="dim">${result.withheld_endpoints.length}</span></h3>
            <p class="qs-note">${esc(result.note)}</p>
            <table class="qs-table">
              <thead><tr><th>Endpoint</th><th>Model</th><th class="num">Headline</th><th>Failed</th></tr></thead>
              <tbody>${result.withheld_endpoints.map((w) => `<tr class="qs-row-withheld">
                <td>${esc(w.endpoint)}</td>
                <td class="small mono">${esc(w.model)}</td>
                <td class="num mono">${w.headline?.value ?? "—"}</td>
                <td class="small dim">${esc((w.reason || []).join("; "))}</td></tr>`).join("")}
              </tbody>
            </table>
          </section>` : ""}`;
    } catch (error) {
      out.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

function card(p) {
  if (p.status !== "ok") {
    return `<section class="qs-card lg-surface lg-d1">
      <h3>${esc(p.endpoint)}</h3>
      <p class="qs-warn">${esc(p.reason || p.status)}</p></section>`;
  }
  const ad = p.applicability_domain || {};
  return `
    <section class="qs-card lg-surface lg-d1">
      <header class="qs-card-head">
        <div><h3>${esc(p.endpoint)}</h3>
          <div class="qs-value">${p.value}${p.units ? ` <span class="dim">${esc(p.units)}</span>` : ""}</div></div>
        <span class="qs-badge qs-badge-pred">${esc(p.badge)}</span>
      </header>
      <table class="qs-props"><tbody>
        <tr><th>Model</th><td>${esc(p.model.name)} <span class="dim">v${esc(p.model.version)}</span></td></tr>
        <tr><th>Algorithm</th><td>${esc(p.model.algorithm)}</td></tr>
        <tr><th>Dataset</th><td>${esc(p.dataset.name)} · ${p.dataset.size} compounds · ${esc(p.dataset.licence)}</td></tr>
        <tr><th>Validation</th><td class="mono">${esc(p.validation.metric)} ${p.validation.value}
          on ${p.validation.test_size} held-out (${esc(p.validation.split)} split)</td></tr>
        <tr><th>Uncertainty</th><td class="mono">${
          p.uncertainty?.ensemble_spread
            ? `ensemble sd ${p.uncertainty.ensemble_spread.std}, 90% ${JSON.stringify(p.uncertainty.ensemble_spread.interval_90)}`
            : "no ensemble to interrogate"}</td></tr>
        <tr><th>Applicability</th><td>
          <span class="qs-badge qs-ad-${esc(ad.status)}">${esc(ad.status)}</span>
          <div class="dim small">${esc(ad.note || "")}</div></td></tr>
      </tbody></table>
      <p class="qs-note">${esc(p.caveat)}</p>
    </section>`;
}
