/**
 * Molecule Designer.
 *
 * The ranking is Pareto fronts, not a score. Front 1 is the set of candidates
 * that nothing else beats outright; a candidate on front 2 is worse than
 * something on front 1 on every axis you selected. That is a statement the
 * platform can defend, whereas a weighted score would require weights this
 * platform has no business choosing.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { awaitJob, labApi } from "../api.js";
import { needsStructure, needsSubject } from "../router.js";
import { subjectStore, workbench } from "../store.js";
import { jobChip, provBadge, wireProvenance } from "../ui.js";

export async function designerView(root, params) {
  const subject = subjectStore.get();
  if (!subject) {
    root.innerHTML = needsSubject("the Molecule Designer");
    return;
  }

  const vocabulary = await labApi.vocabulary();
  const startingSmiles = params?.get("smiles") || subject.smiles || "";

  root.innerHTML = `
    ${card(
      "Starting point",
      `<div class="toolbar">
        <input class="search-input" id="d-smiles" type="text" spellcheck="false"
               placeholder="SMILES, or open a compound from the atlas"
               value="${esc(startingSmiles)}" style="flex:1;min-width:280px" />
        <select id="d-mode">
          ${vocabulary.design_modes
            .map(
              (mode) =>
                `<option value="${esc(mode.key)}" ${
                  mode.key === "cns" ? "selected" : ""
                }>${esc(mode.label)}</option>`
            )
            .join("")}
        </select>
        <label class="row small">Candidates
          <select id="d-max">
            <option>20</option><option selected>40</option><option>80</option>
          </select>
        </label>
        <label class="row small">Generations
          <select id="d-gens"><option selected>1</option><option>2</option></select>
        </label>
        <button class="sm primary" id="d-run">Generate</button>
      </div>
      <div class="small dim mt" id="d-mode-note"></div>
      <div id="d-parent" class="mt"></div>`
    )}

    ${card(
      "Objectives",
      `<div class="objective-grid" id="d-objectives">
        ${vocabulary.objectives
          .map(
            (objective) => `
          <label class="objective-toggle">
            <input type="checkbox" value="${esc(objective.key)}"
              ${
                ["bbb_probability", "cns_mpo", "tpsa", "hbd", "structural_alerts"].includes(
                  objective.key
                )
                  ? "checked"
                  : ""
              } />
            <span>
              ${esc(objective.label)}
              <span class="dir">${
                objective.direction === "max"
                  ? "higher is better"
                  : objective.direction === "min"
                    ? "lower is better"
                    : `target ${objective.target_range?.join("–")}`
              } · ${esc(objective.source)}</span>
            </span>
          </label>`
          )
          .join("")}
      </div>
      <div class="lab-note">
        Objectives marked <em>predicted</em> come from a model and carry its
        uncertainty; those marked <em>calculated</em> are deterministic
        functions of the structure. An objective whose model is not installed is
        dropped from the ranking and reported, rather than silently defaulted.
      </div>`
    )}

    <div id="d-status" class="mb"></div>
    <div id="d-results"></div>`;

  const modeSelect = root.querySelector("#d-mode");
  const noteHost = root.querySelector("#d-mode-note");
  const setNote = () => {
    const mode = vocabulary.design_modes.find((m) => m.key === modeSelect.value);
    noteHost.textContent = mode?.description || "";
  };
  modeSelect.addEventListener("change", setNote);
  setNote();

  const smilesInput = root.querySelector("#d-smiles");
  const parentHost = root.querySelector("#d-parent");
  const showParent = async () => {
    const smiles = smilesInput.value.trim();
    if (!smiles) {
      parentHost.innerHTML = needsStructure(subject);
      return;
    }
    parentHost.innerHTML = `
      <div class="row">
        <div class="mol-2d" style="max-width:260px">
          <img src="${esc(labApi.depictionUrl(smiles, 260, 190))}" alt="parent structure" />
        </div>
        <div id="d-parent-props" class="small muted"></div>
      </div>`;
    try {
      const profile = await labApi.analyse(smiles);
      const values = profile.descriptor_values;
      parentHost.querySelector("#d-parent-props").innerHTML = `
        <div><strong>${esc(profile.structure.formula)}</strong>
          <span class="dim">${esc(profile.structure.inchikey || "")}</span></div>
        <div>MW ${values.molecular_weight} · cLogP ${values.clogp} ·
             TPSA ${values.tpsa} · HBD ${values.hbd} · HBA ${values.hba}</div>
        <div>CNS MPO ${profile.cns_mpo.value} · alerts ${profile.alerts.count} ·
             SA ${profile.synthetic_accessibility?.value ?? "—"}</div>
        ${
          profile.structure.standardisation_notes?.length
            ? `<div class="dim">${esc(profile.structure.standardisation_notes.join("; "))}</div>`
            : ""
        }`;
    } catch (error) {
      parentHost.querySelector("#d-parent-props").innerHTML = `<span class="dim">${esc(
        error.message
      )}</span>`;
    }
  };

  smilesInput.addEventListener("change", showParent);
  if (startingSmiles) await showParent();
  else parentHost.innerHTML = needsStructure(subject);

  root.querySelector("#d-run").addEventListener("click", () => run(root));
}

async function run(root) {
  const status = root.querySelector("#d-status");
  const results = root.querySelector("#d-results");
  const smiles = root.querySelector("#d-smiles").value.trim();
  if (!smiles) {
    status.innerHTML = notice("Supply a starting structure first.", "warn", "⚠");
    return;
  }

  const objectives = [...root.querySelectorAll("#d-objectives input:checked")].map(
    (input) => input.value
  );

  status.innerHTML = loading("Queueing the design run…");
  results.innerHTML = "";

  try {
    const { job } = await labApi.design({
      smiles,
      mode: root.querySelector("#d-mode").value,
      max_candidates: Number(root.querySelector("#d-max").value),
      generations: Number(root.querySelector("#d-gens").value),
      objectives,
      force: true,
    });

    const finished = await awaitJob(job.id, (update) => {
      status.innerHTML = jobChip(update);
    });

    if (finished.status !== "completed") {
      status.innerHTML = notice(
        `The design run ${esc(finished.status)}: ${esc(finished.error || "no result")}`,
        "danger",
        "⚠"
      );
      return;
    }

    status.innerHTML = jobChip(finished);
    renderResults(results, finished.result, finished);
  } catch (error) {
    status.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function renderResults(host, result, job) {
  const candidates = result.candidates || [];
  if (!candidates.length) {
    host.innerHTML = empty(
      "No transformation in the selected mode applies to this structure. " +
        "That is a statement about the molecule, not a failure: the edit set is " +
        "chemical, so a molecule without the relevant functional groups produces " +
        "no analogues."
    );
    return;
  }

  const objectives = result.objectives || [];
  const dropped = result.objectives_dropped || [];

  host.innerHTML = `
    ${card(
      `Candidates <span class="dim">(${candidates.length})</span>`,
      `<div class="small muted mb">
        ${esc(result.report.generator)} ${esc(result.report.generator_version)} ·
        ${esc(result.report.mode_label)} ·
        transformations applied: ${esc(
          (result.report.transformations_applied || []).join(", ") || "none"
        )}
        ${result.report.truncated ? " · <strong>truncated at the cap</strong>" : ""}
      </div>
      <div class="lab-note mb">${esc(result.report.validity_policy)}</div>
      ${
        dropped.length
          ? `<div class="notice notice-warn"><span class="ico">⚠</span><div>
              Objectives dropped from the ranking: ${esc(
                dropped.map((item) => item.key).join(", ")
              )} — ${esc(dropped[0].reason)}</div></div>`
          : ""
      }
      <div class="cand-grid">
        ${candidates.slice(0, 48).map((candidate) => candidateCard(candidate, objectives)).join("")}
      </div>
      <div class="lab-note">${esc(result.ranking_method)}</div>`
    )}

    ${
      result.trade_offs?.length
        ? card(
            "Trade-offs on the leading front",
            result.trade_offs
              .map(
                (tradeOff) => `
              <div class="finding">
                <div class="small mono dim">A: ${esc(tradeOff.candidate_a)}</div>
                <div class="small mono dim mb">B: ${esc(tradeOff.candidate_b)}</div>
                <div><strong>A is better on:</strong> ${
                  tradeOff.a_better_on.length
                    ? esc(tradeOff.a_better_on.join("; "))
                    : "<span class='dim'>nothing selected</span>"
                }</div>
                <div><strong>A is worse on:</strong> ${
                  tradeOff.a_worse_on.length
                    ? esc(tradeOff.a_worse_on.join("; "))
                    : "<span class='dim'>nothing selected</span>"
                }</div>
                ${
                  tradeOff.equal_on.length
                    ? `<div class="dim small">Equal on: ${esc(tradeOff.equal_on.join(", "))}</div>`
                    : ""
                }
              </div>`
              )
              .join("")
          )
        : ""
    }

    ${card(
      "Reproducibility",
      `<dl class="kv">
        <dt>Job</dt><dd>#${job.id} · ${esc(job.cache_key)}</dd>
        <dt>Parameters</dt><dd class="mono small">${esc(JSON.stringify(job.params))}</dd>
        <dt>Environment</dt><dd class="mono small">${esc(
          JSON.stringify(job.environment)
        )}</dd>
        <dt>Finished</dt><dd>${esc(job.finished_at || "")}</dd>
      </dl>
      <div class="lab-note">
        The same parameters produce the same job cache key, so re-running this
        design returns the stored result instead of recomputing it.
      </div>`
    )}`;

  wireProvenance(host);
  wireSave(host, candidates);
}

function candidateCard(candidate, objectives) {
  const values = candidate.objectives || {};
  const properties = candidate.properties || {};
  const bbb = properties.bbb;

  const rows = objectives
    .slice(0, 6)
    .map((objective) => {
      const value = values[objective.key];
      return `<div class="p"><span class="k">${esc(
        objective.label.length > 16 ? objective.label.slice(0, 15) + "…" : objective.label
      )}</span><span class="v">${value === null || value === undefined ? "—" : value}</span></div>`;
    })
    .join("");

  return `<article class="cand front-${candidate.pareto_front}" data-inchikey="${esc(
    candidate.inchikey
  )}">
    <div class="depict">
      <img loading="lazy" src="${esc(labApi.depictionUrl(candidate.smiles, 250, 175))}"
           alt="candidate structure" />
    </div>
    <div class="body">
      <div class="row-between">
        <span class="front-tag">Front ${candidate.pareto_front}</span>
        ${
          bbb
            ? `<span class="small ${
                bbb.inside_applicability_domain ? "" : "dim"
              }" title="${esc(bbb.model)} ${esc(bbb.model_version)}${
                bbb.inside_applicability_domain ? "" : " — outside applicability domain"
              }">BBB ${bbb.probability}</span>`
            : ""
        }
      </div>
      <div class="transform" title="${esc(candidate.transformation.rationale)}">
        ${esc(candidate.transformation.name)}
      </div>
      <div class="props">${rows}</div>
      <div class="smiles">${esc(candidate.smiles)}</div>
      ${
        properties.alert_names?.length
          ? `<div class="small" style="color:var(--ev-preclinical)">Alerts: ${esc(
              properties.alert_names.slice(0, 2).join(", ")
            )}</div>`
          : ""
      }
      <div class="row">
        <button class="sm" data-save="${esc(candidate.inchikey)}">Save</button>
        <a class="sm" href="#/lab/bbb?smiles=${encodeURIComponent(candidate.smiles)}">BBB</a>
        <a class="sm" href="#/lab/molecular3d?smiles=${encodeURIComponent(
          candidate.smiles
        )}">3D</a>
      </div>
    </div>
  </article>`;
}

function wireSave(host, candidates) {
  const byKey = new Map(candidates.map((candidate) => [candidate.inchikey, candidate]));
  host.querySelectorAll("[data-save]").forEach((button) => {
    const key = button.dataset.save;
    if (workbench.has(key)) {
      button.textContent = "Saved";
      button.disabled = true;
    }
    button.addEventListener("click", () => {
      workbench.add(byKey.get(key));
      button.textContent = "Saved";
      button.disabled = true;
    });
  });
}
