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
    ${card(
      "Mouse disease model",
      `<div class="toolbar">
        <input class="search-input" id="mm-q" type="text" spellcheck="false"
               placeholder="Disease — e.g. glioblastoma, Alzheimer disease, Huntington disease"
               style="flex:1;min-width:280px" />
        <input class="search-input" id="mm-targets" type="text" spellcheck="false"
               placeholder="Target gene symbols (optional)" style="width:210px" />
        <button class="sm primary" id="mm-run">Find models</button>
      </div>
      <div id="pc-mouse-model"></div>`
    )}
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

  const modelHost = root.querySelector("#pc-mouse-model");
  const findModels = async () => {
    const query = root.querySelector("#mm-q").value.trim();
    if (!query) {
      modelHost.innerHTML = notice(
        "Name a disease to search MGI's curated genotype annotations.",
        "muted",
        "◎"
      );
      return;
    }
    modelHost.innerHTML = loading("Searching MGI…");
    try {
      const found = await pcApi.mouseModels({
        q: query,
        targets: root.querySelector("#mm-targets").value.trim() || undefined,
        limit: 25,
      });
      modelHost.innerHTML =
        found.implemented === false ? notImplemented(found) : renderModels(found);
    } catch (error) {
      modelHost.innerHTML = notice(esc(error.message), "warn", "⚠");
    }
  };

  root.querySelector("#mm-run").addEventListener("click", findModels);
  root.querySelector("#mm-q").addEventListener("keydown", (event) => {
    if (event.key === "Enter") findModels();
  });
  modelHost.innerHTML = notice(
    "Name a disease to search MGI's curated genotype annotations.",
    "muted",
    "◎"
  );

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


/* ------------------------------------------------------- mouse disease models */

/**
 * MGI's curated genotypes for a disease.
 *
 * Two things are rendered deliberately rather than conveniently. Genotypes MGI
 * annotated as *not* modelling the disease stay in the table, marked; and the
 * selection criteria are printed with their weights, because a rank whose
 * basis is hidden is a recommendation dressed up as a result.
 */
function renderModels(found) {
  if (found.available === false) {
    return notice(
      `<strong>Mouse-model evidence is unavailable.</strong><br />${esc(found.reason || "")}`,
      "warn",
      "⚠"
    );
  }

  if (found.matched === false) {
    return notice(
      `<strong>No matching Disease Ontology term.</strong><br />${esc(found.reason || "")}`,
      "muted",
      "◎"
    );
  }

  if (!found.models?.length) {
    return notice(
      `<strong>MGI curates no mouse model for this disease.</strong><br />${esc(
        found.reason || ""
      )}`,
      "muted",
      "◎"
    );
  }

  const matched = (found.matches || [])
    .map(
      (match) =>
        `<span class="chip">${esc(match.do_term)} <span class="dim">(${esc(
          match.match_type
        )})</span></span>`
    )
    .join(" ");

  const rows = found.models
    .map((model) => {
      const width = Math.round(model.selection_score * 46);
      return `<tr class="${model.not_model ? "not-model" : ""}">
        <td class="mm-genotype">
          ${esc(model.allele_pairs)}
          ${model.not_model ? ` <span class="mm-not-badge">not a model</span>` : ""}
        </td>
        <td>${esc(model.marker_symbol || "—")}</td>
        <td>${esc(model.zygosity)} · ${esc(model.allele_kind)}</td>
        <td>${
          model.background_stated
            ? esc(model.strain_background)
            : `<span class="dim">not specified</span>`
        }</td>
        <td class="num">${model.reference_count ?? "—"}</td>
        <td>${
          model.obtainable
            ? `${model.repository_ids.length} stock${
                model.repository_ids.length === 1 ? "" : "s"
              }`
            : `<span class="dim">none listed</span>`
        }</td>
        <td class="num" title="${esc(
          Object.entries(model.selection_components)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ")
        )}">
          <span class="mm-score-bar" style="width:${width}px"></span>
          ${model.selection_score.toFixed(2)}
        </td>
        <td>${
          model.url
            ? `<a href="${esc(model.url)}" target="_blank" rel="noopener">MGI</a>`
            : "—"
        }</td>
      </tr>`;
    })
    .join("");

  const criteria = found.selection.criteria
    .map(
      (criterion) =>
        `<li><strong>${esc(criterion.label)}</strong>
          <span class="dim">(weight ${criterion.weight})</span> —
          ${esc(criterion.evidence_of)}</li>`
    )
    .join("");

  return `
    <div class="row mb">
      <span class="small dim">Matched:</span> ${matched}
      <span class="spacer"></span>
      <span class="small dim">${found.count} genotype${
        found.count === 1 ? "" : "s"
      }${found.not_model_count ? `, ${found.not_model_count} annotated as non-models` : ""}</span>
    </div>

    <div style="overflow-x:auto">
      <table class="mm-table">
        <tr>
          <th>Genotype</th><th>Gene</th><th>Zygosity · allele</th>
          <th>Background</th><th class="num">Refs</th><th>Repository</th>
          <th class="num">Rank</th><th></th>
        </tr>
        ${rows}
      </table>
    </div>

    <details class="mt">
      <summary class="small">How this ranking was computed</summary>
      <ul class="mm-criteria mt">${criteria}</ul>
      <div class="lab-note">${esc(found.selection.disclaimer)}</div>
    </details>

    <ul class="small muted mt" style="padding-left:17px">
      ${found.caveats.map((caveat) => `<li>${esc(caveat)}</li>`).join("")}
    </ul>

    <div class="lab-note">
      ${esc(found.source.name)} · ${esc(found.source.curation)}
      ${
        found.cache_age_hours != null
          ? ` Report cached ${Math.round(found.cache_age_hours)} h ago.`
          : ""
      }
    </div>`;
}
