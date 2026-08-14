/**
 * In Vivo Mouse stage.
 *
 * Compartmental PK feeding target occupancy feeding an Emax response. The
 * service refuses to run without provenance on every parameter, so this form
 * makes the status of each input explicit rather than hiding defaults.
 */

import { card, esc, loading, notice } from "../../ui.js";
import { pcApi } from "../api.js";
import { needsMolecule, subject } from "../router.js";
import { assumptionBanner, linePlot, notImplemented, parameterTable, statusValue } from "../ui.js";

export async function inVivoView(root, params, status) {
  const molecule = subject.get();
  if (!molecule?.smiles) {
    root.innerHTML = needsMolecule();
    return;
  }

  root.innerHTML = `
    ${card("Mouse disease model", `<div id="pc-mouse-model">${loading()}</div>`)}
    ${card(
      "Pharmacokinetics",
      `<div class="assumption-banner">
        Every parameter below must carry a status. Where you have a measured
        value, say so and cite it; where you do not, mark it predicted and it
        will be listed as an assumption above every curve it affects.
      </div>
      <div class="toolbar">
        <label class="row small">Route
          <select id="pk-route"><option value="iv">IV bolus</option><option value="oral">Oral</option></select>
        </label>
        <label class="row small">Dose (mg/kg)
          <input class="search-input" id="pk-dose" type="number" value="50" style="width:80px" />
        </label>
        <label class="row small">V (L/kg)
          <input class="search-input" id="pk-v" type="number" value="2.1" step="0.1" style="width:75px" />
        </label>
        <label class="row small">CL (L/h/kg)
          <input class="search-input" id="pk-cl" type="number" value="1.4" step="0.1" style="width:80px" />
        </label>
        <label class="row small">ka (1/h)
          <input class="search-input" id="pk-ka" type="number" value="1.2" step="0.1" style="width:70px" />
        </label>
        <label class="row small">fu
          <input class="search-input" id="pk-fu" type="number" value="0.08" step="0.01" style="width:70px" />
        </label>
        <label class="row small">Kd (nM)
          <input class="search-input" id="pk-kd" type="number" value="12" step="1" style="width:70px" />
        </label>
        <button class="sm primary" id="pk-run">Simulate</button>
      </div>
      <div id="pk-status"></div>
      <div id="pk-result"></div>`
    )}`;

  try {
    const models = await pcApi.mouseModels({});
    root.querySelector("#pc-mouse-model").innerHTML =
      models.implemented === false
        ? notImplemented(models)
        : `<div class="small muted">${esc(JSON.stringify(models).slice(0, 300))}</div>`;
  } catch (error) {
    root.querySelector("#pc-mouse-model").innerHTML = notice(esc(error.message), "warn", "⚠");
  }

  root.querySelector("#pk-run").addEventListener("click", () => run(root, molecule));
}

async function run(root, molecule) {
  const statusHost = root.querySelector("#pk-status");
  const host = root.querySelector("#pk-result");
  statusHost.innerHTML = loading("Solving…");

  const number = (id) => Number(root.querySelector(id).value);
  const assumed = (value, note) => ({ value, status: "predicted", note });

  try {
    const result = await pcApi.pkpd({
      route: root.querySelector("#pk-route").value,
      duration_h: 24,
      points: 97,
      dose_mg_per_kg: { value: number("#pk-dose"), status: "derived", note: "study design" },
      volume_l_per_kg: assumed(number("#pk-v"), "entered; mark as measured if you have a source"),
      clearance_l_per_h_per_kg: assumed(number("#pk-cl"), "entered"),
      absorption_ka_per_h: assumed(number("#pk-ka"), "entered"),
      bioavailability: assumed(0.35, "entered"),
      fraction_unbound: assumed(number("#pk-fu"), "entered"),
      kd_nm: assumed(number("#pk-kd"), "entered"),
      molecular_weight: molecule.molecular_weight || 393.4,
      pd: { e0: 0, emax: 1, ec50: 0.5, hill: 1.5 },
    });

    statusHost.innerHTML = "";
    render(host, result);
  } catch (error) {
    statusHost.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function render(host, result) {
  const times = result.times_h;
  const concentration = result.concentration.value;
  const occupancy = result.target_occupancy?.occupancy?.value;
  const effect = result.pharmacodynamics?.value;

  host.innerHTML = `
    ${assumptionBanner({
      assumed: result.parameters.assumed_parameters,
      note: result.parameters.assumption_note,
    })}
    <div class="row mb">
      <span>C<sub>max</sub> ${statusValue(result.summary.cmax)}</span>
      <span>t<sub>max</sub> ${statusValue(result.summary.tmax_h)}</span>
      <span>AUC ${statusValue(result.summary.auc_0_t)}</span>
      <span class="dim small">t½ ${result.summary.half_life_h} h · ${esc(result.model)}</span>
    </div>
    ${linePlot(
      [
        {
          points: times.map((t, i) => ({ x: t, y: concentration[i] })),
          color: "var(--st-simulated)",
        },
        ...(occupancy
          ? [
              {
                points: times.map((t, i) => ({
                  x: t,
                  y: occupancy[i] * Math.max(...concentration),
                })),
                color: "var(--ev-established)",
                dashed: true,
              },
            ]
          : []),
      ],
      { xLabel: "time (h)", yLabel: "plasma concentration (mg/L)" }
    )}
    <div class="plot-legend">
      <span><span class="swatch" style="background:var(--st-simulated)"></span>plasma concentration</span>
      ${
        occupancy
          ? `<span><span class="swatch" style="background:var(--ev-established)"></span>
             target occupancy (scaled), peak ${(
               result.target_occupancy.peak_occupancy * 100
             ).toFixed(1)}%</span>`
          : ""
      }
    </div>
    ${
      effect
        ? `<div class="mt small muted">Peak predicted effect:
           ${(Math.max(...effect) * 100).toFixed(1)}% of Emax</div>`
        : ""
    }
    ${
      result.target_occupancy
        ? `<ul class="small muted mt" style="padding-left:17px">
             ${result.target_occupancy.assumptions
               .map((assumption) => `<li>${esc(assumption)}</li>`)
               .join("")}
           </ul>`
        : ""
    }
    ${card("Parameters", parameterTable(result.parameters.parameters))}`;
}
