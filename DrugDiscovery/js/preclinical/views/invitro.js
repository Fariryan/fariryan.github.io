/**
 * In Vitro stage.
 *
 * Two clearly separated halves, in this order:
 *   1. REAL EXPERIMENTAL DATA — measured activity for this exact molecule on
 *      this exact cell model, or an explicit statement that none exists;
 *   2. PREDICTED / SIMULATED EXPERIMENT — the mechanistic culture simulation,
 *      rendered in the 3D plate.
 *
 * They are never merged, and the simulation never borrows a number from the
 * measured half without the provenance travelling with it.
 */

import { card, esc, loading, notice } from "../../ui.js";
import { pcApi } from "../api.js";
import { needsMolecule, subject } from "../router.js";
import {
  assumptionBanner,
  linePlot,
  noMeasurement,
  notImplemented,
  parameterTable,
  statusValue,
} from "../ui.js";
import { PlateViewer, wellLabel } from "../three/plate.js";

let plate = null;
const CONCENTRATIONS = [0, 0.01, 0.1, 1, 10, 100];

export async function inVitroView(root, params, status) {
  const molecule = subject.get();
  if (!molecule?.smiles) {
    root.innerHTML = needsMolecule();
    return;
  }

  root.innerHTML = `
    ${card(
      "Disease and cell model",
      `<div class="toolbar">
        <input class="search-input" id="pc-disease" type="text"
               placeholder="Disease (e.g. glioblastoma)"
               value="${esc(params?.get("disease") || "glioblastoma")}"
               style="max-width:260px" />
        <button class="sm" id="pc-find-models">Find cell models</button>
        <select id="pc-model" style="min-width:220px"><option>—</option></select>
      </div>
      <div id="pc-model-detail"></div>`
    )}
    <div id="pc-measured"></div>
    <div id="pc-sim"></div>`;

  root.querySelector("#pc-find-models").addEventListener("click", () => findModels(root));
  root.querySelector("#pc-model").addEventListener("change", () => selectModel(root, molecule));
  await findModels(root);
}

async function findModels(root) {
  const host = root.querySelector("#pc-model-detail");
  const select = root.querySelector("#pc-model");
  host.innerHTML = loading("Searching Cell Model Passports…");

  try {
    const result = await pcApi.cellModels({
      disease: root.querySelector("#pc-disease").value.trim(),
      limit: 40,
    });
    if (!result.available || !result.models?.length) {
      host.innerHTML = notice(
        result.reason || "No cell model matched that disease.",
        "warn",
        "◌"
      );
      return;
    }

    select.innerHTML = result.models
      .map(
        (model) =>
          `<option value="${esc(model.model_id)}">${esc(model.name)} — ${esc(
            model.cancer_type
          )}${model.data_available.drug_response ? " · drug data" : ""}</option>`
      )
      .join("");

    host.innerHTML = `<div class="small muted">
        ${result.total_matched} model(s) matched via ${result.match_terms
          .map((term) => `<code>${esc(term)}</code>`)
          .join(", ")} — ${esc(result.match_basis)}.
      </div>
      <div class="lab-note">${esc(result.caveat)}</div>`;

    root._models = result.models;
    await selectModel(root, subject.get());
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

async function selectModel(root, molecule) {
  const models = root._models || [];
  const model = models.find(
    (entry) => entry.model_id === root.querySelector("#pc-model").value
  );
  if (!model) return;

  root.querySelector("#pc-model-detail").insertAdjacentHTML(
    "beforeend",
    ""
  );

  // ---- half 1: measured ------------------------------------------------
  const measuredHost = root.querySelector("#pc-measured");
  measuredHost.innerHTML = card(
    "Real experimental data",
    `<dl class="kv">
       <dt>Model</dt><dd>${esc(model.name)} <span class="dim">(${esc(
         model.model_id
       )})</span></dd>
       <dt>Cancer type</dt><dd>${esc(model.cancer_type_detail || model.cancer_type)}</dd>
       <dt>Tissue</dt><dd>${esc(model.tissue || "—")}</dd>
       <dt>Ploidy</dt><dd>${model.ploidy ?? "—"}</dd>
       <dt>Mutational burden</dt><dd>${
         model.mutational_burden_per_mb ?? "—"
       } /Mb</dd>
       <dt>Growth</dt><dd>${esc(model.growth_properties || "—")}</dd>
       <dt>Selected because</dt><dd>${esc(model.selection_rationale)}</dd>
       <dt>Source</dt><dd><a href="${esc(model.url)}" target="_blank"
         rel="noopener">Cell Model Passports ↗</a></dd>
     </dl>
     <div id="pc-assay" class="mt"></div>`
  );

  const assayHost = root.querySelector("#pc-assay");
  try {
    const measured = await pcApi.measuredInVitro({
      smiles: molecule.smiles,
      cell_line: model.name,
    });
    assayHost.innerHTML =
      measured.implemented === false
        ? notImplemented(measured)
        : noMeasurement(measured);
  } catch (error) {
    assayHost.innerHTML = notice(esc(error.message), "warn", "⚠");
  }

  // ---- half 2: simulated ----------------------------------------------
  renderSimulationControls(root, model);
}

function renderSimulationControls(root, model) {
  root.querySelector("#pc-sim").innerHTML = card(
    "Predicted / simulated experiment",
    `<div class="assumption-banner">
       <strong>This half is a simulation.</strong> Cell Model Passports does not
       publish growth rates, so the doubling time and carrying capacity below
       are <em>your stated assumptions</em>, not measurements for
       ${esc(model.name)}. Every curve inherits them.
     </div>
     <div class="toolbar">
       <label class="row small">Format
         <select id="pc-format">
           <option>6</option><option>24</option><option selected>96</option><option>384</option>
         </select>
       </label>
       <label class="row small">Doubling time (h)
         <input class="search-input" id="pc-td" type="number" value="26" style="width:80px" />
       </label>
       <label class="row small">Seed cells
         <input class="search-input" id="pc-n0" type="number" value="2000" style="width:90px" />
       </label>
       <label class="row small">IC50 (µM)
         <input class="search-input" id="pc-ic50" type="number" value="2.5" step="0.1" style="width:80px" />
       </label>
       <label class="row small">Duration (h)
         <input class="search-input" id="pc-dur" type="number" value="72" style="width:75px" />
       </label>
       <button class="sm primary" id="pc-run-sim">Run simulation</button>
     </div>
     <div id="pc-sim-status"></div>
     <div id="pc-sim-result"></div>`
  );

  root.querySelector("#pc-run-sim").addEventListener("click", () => runSimulation(root, model));
}

async function runSimulation(root, model) {
  const statusHost = root.querySelector("#pc-sim-status");
  const host = root.querySelector("#pc-sim-result");
  statusHost.innerHTML = loading("Solving the growth model…");

  const duration = Number(root.querySelector("#pc-dur").value);
  const interval = 6;

  try {
    const result = await pcApi.simulate({
      mode: "monolayer",
      duration_h: duration,
      interval_h: interval,
      concentrations: CONCENTRATIONS,
      initial_count: {
        value: Number(root.querySelector("#pc-n0").value),
        status: "derived",
        note: "seeding density, chosen for this run",
      },
      doubling_time_h: {
        value: Number(root.querySelector("#pc-td").value),
        status: "predicted",
        note: `assumed; no growth rate is published for ${model.name}`,
      },
      carrying_capacity: {
        value: Number(root.querySelector("#pc-n0").value) * 60,
        status: "predicted",
        note: "assumed as 60× the seeding density",
      },
      ic50: {
        value: Number(root.querySelector("#pc-ic50").value),
        status: "predicted",
        note: "entered for this run; not a measurement for this pair",
      },
    });

    statusHost.innerHTML = "";
    renderSimulation(host, result, model, root);
  } catch (error) {
    statusHost.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function renderSimulation(host, result, model, root) {
  const times = result.times_h;
  const curves = result.curves;
  const format = Number(root.querySelector("#pc-format").value);

  host.innerHTML = `
    ${assumptionBanner(curves[0].assumptions)}
    <div class="grid grid-2">
      <div>
        <h4 style="font-size:13px;margin:0 0 8px">Growth over time</h4>
        ${linePlot(
          curves.map((curve, index) => ({
            points: times.map((t, i) => ({ x: t, y: curve.count.value[i] })),
            color: `hsl(${200 - index * 28}, 65%, 55%)`,
          })),
          { xLabel: "time (h)", yLabel: "cells" }
        )}
        <div class="plot-legend">
          ${curves
            .map(
              (curve, index) =>
                `<span><span class="swatch" style="background:hsl(${
                  200 - index * 28
                },65%,55%)"></span>${curve.concentration} µM</span>`
            )
            .join("")}
        </div>
      </div>
      <div>
        <h4 style="font-size:13px;margin:0 0 8px">Dose–response at ${
          times[times.length - 1]
        } h</h4>
        ${linePlot(
          [
            {
              points: curves
                .filter((c) => c.concentration > 0)
                .map((c) => ({ x: c.concentration, y: c.effect_fraction })),
              color: "var(--st-simulated)",
            },
          ],
          { xLabel: "concentration (µM, log)", yLabel: "effect", logX: true }
        )}
        <div class="plot-legend">
          <span><span class="swatch" style="background:var(--st-simulated)"></span>
            simulated Hill response</span>
        </div>
        <div class="lab-note">
          ${
            result.dose_response?.anchored_to_measurement
              ? "Anchored to a measured IC50."
              : "The IC50 is an entered assumption, so the position of this curve on the concentration axis is assumed."
          }
        </div>
      </div>
    </div>

    <h4 style="font-size:13px;margin:18px 0 8px">
      3D digital-twin visualisation
      <span class="dim small">— mechanistic simulation, not microscopy</span>
    </h4>
    <!-- The HUD is a sibling, not a child: PlateViewer.init() clears its
         container, which would detach anything nested inside it. -->
    <div style="position:relative">
      <div class="plate-stage" id="pc-plate"></div>
      <div class="plate-hud" id="pc-hud">Click a well to enter it</div>
    </div>
    <div class="plate-controls">
      <button class="sm" id="pc-exit" style="display:none">← Back to plate</button>
      <div class="timeline-scrub">
        <input type="range" id="pc-time" min="0" max="${times.length - 1}" value="0" />
      </div>
      <span class="small dim" id="pc-time-label">0 h</span>
    </div>
    <div class="lab-note">
      Well colour is the simulated viability at the selected hour, and the
      number of cells drawn inside a well is proportional to the simulated
      count. Both come from the solver above — nothing here is an animation
      keyframe, and no rendered cell corresponds to an imaged cell.
    </div>

    ${card("Parameters", parameterTable(curves[0].assumptions.parameters))}`;

  mountPlate(host, result, format, times);
}

function mountPlate(host, result, format, times) {
  const container = host.querySelector("#pc-plate");
  const hud = host.querySelector("#pc-hud");
  const slider = host.querySelector("#pc-time");
  const label = host.querySelector("#pc-time-label");
  const exit = host.querySelector("#pc-exit");

  const spec = { 6: [2, 3], 24: [4, 6], 96: [8, 12], 384: [16, 24] }[format];
  const [rows, cols] = spec;

  // Replicates across the plate: each concentration occupies whole columns, so
  // the layout reads as an experiment rather than as decoration.
  const wells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const curve = result.curves[Math.floor((col / cols) * result.curves.length)];
      const control = curve.concentration === 0;
      const maxCount = Math.max(...result.curves.map((c) => Math.max(...c.count.value)));
      wells.push({
        row,
        col,
        label: wellLabel(row, col),
        concentration: curve.concentration,
        isControl: control,
        maxCount,
        series: times.map((time, index) => {
          const count = curve.count.value[index];
          const controlCount = result.curves[0].count.value[index] || 1;
          return {
            time_h: time,
            count,
            viability: Math.max(0, Math.min(1, count / controlCount)),
          };
        }),
      });
    }
  }

  plate?.destroy();
  plate = new PlateViewer(container, {
    format,
    onWellSelect: (index, well) => {
      plate.enterWell(index);
      plate.setTime(Number(slider.value));
      exit.style.display = "";
      updateHud(well, Number(slider.value));
    },
  });
  plate.init();
  plate.buildPlate(wells);
  plate.setTime(0);

  const updateHud = (well, index) => {
    const point = well.series[index];
    hud.innerHTML = `<div class="well-id">${esc(well.label)}</div>
      ${well.concentration} µM${well.isControl ? " (vehicle control)" : ""}<br />
      ${Math.round(point.count).toLocaleString()} cells ·
      viability ${(point.viability * 100).toFixed(0)}%<br />
      <span class="dim">t = ${point.time_h} h · ◌ simulated</span>`;
  };

  slider.addEventListener("input", () => {
    const index = Number(slider.value);
    plate.setTime(index);
    label.textContent = `${times[index]} h`;
    if (plate.selectedWell !== null) {
      updateHud(wells[plate.selectedWell], index);
    }
  });

  exit.addEventListener("click", () => {
    plate.exitWell();
    exit.style.display = "none";
    hud.textContent = "Click a well to enter it";
  });

  window.addEventListener("resize", () => plate?.resize());
}
