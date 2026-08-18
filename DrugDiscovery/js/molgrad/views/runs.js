/**
 * Configuring and driving an optimisation run.
 *
 * The objective builder is the important part of this view. Objectives are
 * added individually, each with its own direction and threshold, and there is
 * deliberately **no weight field** — the interface cannot offer one, because
 * the optimiser does not have one. Priority orders the display and breaks
 * exact ties; it is labelled as such.
 */

import { esc, loading, notice } from "../../ui.js";
import { mgApi } from "../api.js";
import { currentRun } from "../router.js";

/** Objectives offered by default, with sensible directions and thresholds. */
const OFFERED = [
  { property_key: "logs", label: "Aqueous solubility", direction: "maximise", threshold: -4.0 },
  { property_key: "cns_mpo", label: "CNS desirability", direction: "maximise", threshold: 4.0 },
  { property_key: "herg", label: "hERG liability", direction: "minimise", threshold: 0.5 },
  { property_key: "pgp_substrate", label: "P-gp efflux", direction: "minimise", threshold: 0.5 },
  { property_key: "ames", label: "Ames alert", direction: "minimise", threshold: 0.5 },
  { property_key: "reactive_metabolite", label: "Reactive metabolite risk", direction: "minimise", threshold: 0.5 },
  { property_key: "bioavailability", label: "Oral bioavailability score", direction: "maximise", threshold: 0.5 },
  { property_key: "qed", label: "Drug-likeness (QED)", direction: "maximise", threshold: 0.5 },
  { property_key: "molecular_weight", label: "Molecular weight", direction: "minimise", threshold: 500 },
  { property_key: "sa_score", label: "Synthetic accessibility", direction: "minimise", threshold: 4.0 },
];

const EXAMPLES = [
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { name: "Donepezil", smiles: "COc1cc2CC(CC3CCN(Cc4ccccc4)CC3)C(=O)c2cc1OC" },
  { name: "Atorvastatin", smiles: "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CC[C@@H](O)C[C@@H](O)CC(=O)O" },
];

export async function runsView(root) {
  root.innerHTML = loading("Loading runs…");

  const [runs, engines] = await Promise.all([
    mgApi.listRuns(),
    mgApi.engines().catch(() => null),
  ]);

  root.innerHTML = `
    <section class="card">
      <h3>New run</h3>
      <div class="mg-field">
        <label>Seed structure</label>
        <input id="mg-seed" class="search-input" type="text" spellcheck="false"
               placeholder="Paste a SMILES — an approved drug, a lead, or a generated structure" />
        <div class="mg-examples">
          ${EXAMPLES.map(
            (e) =>
              `<button class="sm mg-example" data-smiles="${esc(e.smiles)}">${esc(
                e.name
              )}</button>`
          ).join("")}
        </div>
      </div>

      <div class="mg-field-row">
        <div class="mg-field">
          <label>Label</label>
          <input id="mg-label" class="search-input" type="text" value="Untitled run" />
        </div>
        <div class="mg-field">
          <label>Disease context <em>(provenance only)</em></label>
          <input id="mg-disease" class="search-input" type="text" placeholder="e.g. glioblastoma" />
        </div>
        <div class="mg-field">
          <label>Target <em>(provenance only)</em></label>
          <input id="mg-target" class="search-input" type="text" placeholder="e.g. ABL1" />
        </div>
      </div>

      <h4 class="mg-sub">Objectives</h4>
      <div class="mg-caveat">
        Each objective is optimised separately. There is no weight field
        because the optimiser has no weighted score — candidates are compared
        by Pareto dominance, and the result is a set of trade-offs rather than
        a ranking. Priority orders the display and breaks exact ties only.
      </div>
      <div class="mg-objectives" id="mg-objectives">
        ${OFFERED.map(
          (o, index) => `
          <label class="mg-objective">
            <input type="checkbox" data-index="${index}"
                   ${index < 3 ? "checked" : ""} />
            <span class="mg-obj-label">${esc(o.label)}</span>
            <span class="mg-obj-direction mg-${esc(o.direction)}">${esc(
              o.direction
            )}</span>
            <span class="mono dim small">threshold ${o.threshold}</span>
          </label>`
        ).join("")}
      </div>

      <h4 class="mg-sub">Budget</h4>
      <div class="mg-field-row">
        <div class="mg-field">
          <label>Generations</label>
          <input id="mg-generations" class="search-input" type="number" value="4" min="1" max="20" />
        </div>
        <div class="mg-field">
          <label>Population</label>
          <input id="mg-population" class="search-input" type="number" value="16" min="4" max="60" />
        </div>
        <div class="mg-field">
          <label>Candidate ceiling</label>
          <input id="mg-ceiling" class="search-input" type="number" value="120" min="10" max="1000" />
        </div>
        <div class="mg-field">
          <label>Random seed <em>(for reproducibility)</em></label>
          <input id="mg-seed-value" class="search-input" type="number" value="42" />
        </div>
      </div>

      <button class="primary" id="mg-create">Configure run</button>
      <div id="mg-create-result"></div>
    </section>

    ${
      engines
        ? `<section class="card">
             <h3>Optimisation strategies <span class="n">${engines.counts.available} available</span></h3>
             <div class="mg-caveat">${esc(engines.gradient_note)}</div>
             ${engines.engines
               .map(
                 (e) => `
               <details class="mg-engine ${e.available ? "" : "gated"}">
                 <summary>
                   <span class="mg-engine-name">${esc(e.name)}</span>
                   <span class="mono dim">${esc(e.version)}</span>
                   ${
                     e.available
                       ? ""
                       : `<span class="mg-gated">unavailable</span>`
                   }
                 </summary>
                 <div class="mg-engine-body">
                   <p>${esc(e.description)}</p>
                   ${
                     e.unavailable_reason
                       ? `<p class="dim">${esc(e.unavailable_reason)}</p>`
                       : ""
                   }
                   <h5>Strengths</h5>
                   <ul>${e.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
                   <h5>Limitations</h5>
                   <ul>${e.limitations.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
                 </div>
               </details>`
               )
               .join("")}

             <h4 class="mg-sub">Declared, not implemented
               <span class="n">${engines.declared_unimplemented.length}</span></h4>
             <table class="mg-table">
               <thead><tr><th>Strategy</th><th>Why not</th><th>Would need</th></tr></thead>
               <tbody>
                 ${engines.declared_unimplemented
                   .map(
                     (e) => `<tr>
                       <td><strong>${esc(e.name)}</strong></td>
                       <td>${esc(e.reason)}</td>
                       <td class="dim small">${esc(e.would_need)}</td>
                     </tr>`
                   )
                   .join("")}
               </tbody>
             </table>
           </section>`
        : ""
    }

    <section class="card">
      <h3>Existing runs <span class="n">${runs.total}</span></h3>
      ${
        runs.runs.length
          ? `<table class="mg-table">
               <thead><tr>
                 <th>Run</th><th>Label</th><th>State</th>
                 <th>Generations</th><th>Evaluated</th><th>Stopped because</th>
               </tr></thead>
               <tbody>
                 ${runs.runs
                   .map(
                     (r) => `<tr class="mg-run-row" data-run="${esc(r.run)}">
                       <td class="mono small">${esc(r.run)}</td>
                       <td>${esc(r.label)}</td>
                       <td><span class="mg-state mg-state-${esc(r.state)}">${esc(
                         r.state
                       )}</span></td>
                       <td>${r.generations_run}</td>
                       <td>${r.candidates_evaluated}</td>
                       <td class="dim small">${esc(
                         (r.stop_reason || "—").replace(/_/g, " ")
                       )}</td>
                     </tr>`
                   )
                   .join("")}
               </tbody>
             </table>`
          : `<div class="mg-empty"><div class="big">▤</div>
             <p>No runs yet. Configure one above.</p></div>`
      }
    </section>`;

  root.querySelectorAll(".mg-example").forEach((button) =>
    button.addEventListener("click", () => {
      root.querySelector("#mg-seed").value = button.dataset.smiles;
    })
  );

  root.querySelectorAll(".mg-run-row").forEach((row) =>
    row.addEventListener("click", () => {
      currentRun.set(row.dataset.run);
      window.location.hash = `#/molgrad/pareto?run=${encodeURIComponent(
        row.dataset.run
      )}`;
    })
  );

  root.querySelector("#mg-create").addEventListener("click", async () => {
    const target = root.querySelector("#mg-create-result");
    const seed = root.querySelector("#mg-seed").value.trim();
    if (!seed) {
      target.innerHTML = notice("Paste a seed structure first.", "muted", "◌");
      return;
    }

    const objectives = [...root.querySelectorAll("#mg-objectives input:checked")].map(
      (node) => OFFERED[Number(node.dataset.index)]
    );
    if (!objectives.length) {
      target.innerHTML = notice(
        "Select at least one objective. An optimisation with none has nothing to optimise toward.",
        "muted",
        "◌"
      );
      return;
    }

    target.innerHTML = loading("Profiling the seed and configuring…");
    try {
      const created = await mgApi.createRun({
        label: root.querySelector("#mg-label").value || "Untitled run",
        disease: root.querySelector("#mg-disease").value || null,
        target: root.querySelector("#mg-target").value || null,
        seeds: [seed],
        objectives: objectives.map((o, index) => ({ ...o, priority: index + 1 })),
        max_generations: Number(root.querySelector("#mg-generations").value),
        population_size: Number(root.querySelector("#mg-population").value),
        max_candidates: Number(root.querySelector("#mg-ceiling").value),
        random_seed: Number(root.querySelector("#mg-seed-value").value),
      });

      currentRun.set(created.run);
      target.innerHTML = `
        <div class="mg-created">
          <div><strong>${esc(created.run)}</strong> configured with
            ${created.seeds_placed} seed placed and
            ${created.objectives.length} objectives.</div>
          <button class="primary" id="mg-run-now">Run generations</button>
          <div id="mg-progress"></div>
        </div>`;

      target.querySelector("#mg-run-now").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const progress = target.querySelector("#mg-progress");
        button.disabled = true;
        button.textContent = "Running…";

        try {
          // Advance in bounded steps so the interface can show progress and
          // the request never hangs.
          let outcome = null;
          for (let step = 0; step < 6; step += 1) {
            outcome = await mgApi.advance(created.run, 1);
            progress.innerHTML = renderProgress(outcome);
            if (outcome.stop_reason) break;
          }
          progress.innerHTML =
            renderProgress(outcome) +
            `<a class="primary" href="#/molgrad/pareto?run=${encodeURIComponent(
              created.run
            )}">See the Pareto frontier</a>`;
        } catch (error) {
          progress.innerHTML = notice(esc(error.message), "danger", "⚠");
        } finally {
          button.textContent = "Done";
        }
      });
    } catch (error) {
      target.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

function renderProgress(outcome) {
  if (!outcome) return "";
  return `
    <div class="mg-progress">
      <div>
        <strong>${esc(outcome.state)}</strong> ·
        ${outcome.generations_run} generation(s) ·
        ${outcome.candidates_evaluated} candidates evaluated
      </div>
      ${
        outcome.stop_reason
          ? `<div class="mg-stop">
               <strong>Stopped: ${esc(outcome.stop_reason.replace(/_/g, " "))}</strong>
               <div class="dim small">${esc(outcome.stop_detail || "")}</div>
             </div>`
          : ""
      }
      ${(outcome.history || [])
        .map(
          (h) => `<div class="mg-gen-line">
            gen ${h.generation}: ${h.proposed} proposed, ${h.accepted} accepted,
            ${h.rejected} rejected on constraints, ${h.duplicates} already seen ·
            frontier ${h.frontier_size}
            ${
              Object.keys(h.engine_contributions || {}).length
                ? ` · engines: ${Object.entries(h.engine_contributions)
                    .map(([k, v]) => `${esc(k)} ${v}`)
                    .join(", ")}`
                : ""
            }
          </div>`
        )
        .join("")}
    </div>`;
}
