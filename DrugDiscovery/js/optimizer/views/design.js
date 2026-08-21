/** Design a run: seed, objectives, constraints, strategy — and preview first. */

import { esc, loading, notice } from "../../ui.js";
import { optimizerApi } from "../api.js";

const SEEDS = [
  { name: "Donepezil", smiles: "COc1cc2c(cc1OC)C(=O)C(CC1CCN(Cc3ccccc3)CC1)C2" },
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Celecoxib", smiles: "Cc1ccc(-c2cc(C(F)(F)F)nn2-c2ccc(S(N)(=O)=O)cc2)cc1" },
];

export async function designView(root, params) {
  let status;
  try { status = await optimizerApi.status(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  const objectives = status.objectives.objectives;
  const constraints = status.objectives.defaults.constraints;

  root.innerHTML = `
    <section class="opt-repertoire lg-surface lg-d1">
      <header class="opt-panel-head">
        <div><strong>${status.transformations.total} transformations across ${Object.keys(status.transformations.by_category).length} categories</strong>
          <p class="opt-note">${esc(status.transformations.note)}</p></div>
      </header>
      <div class="opt-chips">
        ${Object.entries(status.transformations.by_category).map(([key, n]) =>
          `<span class="opt-chip"><b>${n}</b> ${esc(key.replace(/_/g, " "))}</span>`).join("")}
      </div>
      <div class="opt-availability">
        <div class="opt-avail ${status.docking.available ? "yes" : "no"}">
          <span class="opt-dot"></span>Docking · ${esc(status.docking.engine || "unavailable")}
          ${status.docking.version ? `<span class="mono small dim">${esc(status.docking.version)}</span>` : ""}</div>
        <div class="opt-avail no">
          <span class="opt-dot"></span>Retrosynthesis · ${esc(status.retrosynthesis.status.replace(/_/g, " "))}</div>
        <div class="opt-avail no">
          <span class="opt-dot"></span>Learned generation · not enabled</div>
      </div>
      <details class="opt-details">
        <summary>Why retrosynthesis and learned generation are off</summary>
        <p class="opt-caveat"><strong>Retrosynthesis.</strong> ${esc(status.retrosynthesis.blocking_reason)}
          ${esc(status.retrosynthesis.not_a_substitute)}</p>
        <p class="opt-caveat"><strong>Learned generation.</strong> ${esc(status.generation.learned_generation.reason)}
          ${esc(status.generation.learned_generation.if_enabled_later)}</p>
      </details>
    </section>

    <section class="opt-form lg-surface lg-d1">
      <div class="opt-grid">
        <div>
          <label for="opt-seed">Seed structure (SMILES)</label>
          <textarea id="opt-seed" rows="3" spellcheck="false">${esc(SEEDS[0].smiles)}</textarea>
          <div class="opt-seed-picks">
            ${SEEDS.map((s, i) => `<button class="opt-pill" data-smiles="${esc(s.smiles)}" data-name="${esc(s.name)}">${esc(s.name)}</button>`).join("")}
          </div>
          <label for="opt-name">Run name</label>
          <input id="opt-name" type="text" value="Donepezil — solubility and hERG under CNS penetration" />
          <div class="opt-triple">
            <div><label for="opt-strategy">Strategy</label>
              <select id="opt-strategy">${status.strategies.map((s) =>
                `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join("")}</select></div>
            <div><label for="opt-gens">Generations</label>
              <input id="opt-gens" type="number" value="3" min="1" max="${status.limits.max_generations}" /></div>
            <div><label for="opt-seedn">Random seed</label>
              <input id="opt-seedn" type="number" value="42" /></div>
          </div>
          <div class="opt-triple">
            <div><label for="opt-children">Children / parent</label>
              <input id="opt-children" type="number" value="12" min="1" max="${status.limits.max_children_per_parent}" /></div>
            <div><label for="opt-pop">Population</label>
              <input id="opt-pop" type="number" value="10" min="1" max="${status.limits.max_population}" /></div>
            <div><label for="opt-req">Required SMARTS</label>
              <input id="opt-req" type="text" placeholder="optional" spellcheck="false" /></div>
          </div>
          <p class="opt-note" id="opt-strategy-note">${esc(status.strategies[0].description)}</p>
        </div>
        <div>
          <label>Objectives — direction, never a weighted score</label>
          <div class="opt-objectives" id="opt-objectives">
            ${objectives.map((o) => `
              <label class="opt-obj ${o.requires ? "needs" : ""}">
                <input type="checkbox" value="${esc(o.key)}" data-dir="${esc(o.default_direction)}"
                  ${["bbb","logs","herg","synthetic_accessibility"].includes(o.key) ? "checked" : ""}
                  ${o.requires && !status.docking.available ? "disabled" : ""} />
                <span class="opt-obj-body">
                  <span class="opt-obj-label">${esc(o.label)}</span>
                  <span class="opt-obj-meta">
                    <span class="opt-dir opt-dir-${esc(o.default_direction)}">${o.default_direction === "maximise" ? "↑ max" : o.default_direction === "minimise" ? "↓ min" : "◎ target"}</span>
                    <span class="opt-src opt-src-${esc(o.source)}">${esc(o.source)}</span>
                    ${o.requires ? `<span class="opt-req-tag">needs ${esc(o.requires)}</span>` : ""}
                  </span>
                </span>
                <input class="opt-threshold" type="number" step="0.1" placeholder="threshold"
                  value="${{bbb:0.8,logs:-3.5,herg:0.5,synthetic_accessibility:3.5}[o.key] ?? ""}" />
              </label>`).join("")}
          </div>
          <label>Constraints — gates, not penalties</label>
          <table class="opt-constraints"><tbody>
            ${constraints.map((c) => `
              <tr data-key="${esc(c.key)}">
                <th>${esc(c.label)}<span class="dim small"> ${esc(c.units || "")}</span></th>
                <td><input class="opt-cmin" type="number" step="0.1" placeholder="min" value="${c.minimum ?? ""}" /></td>
                <td><input class="opt-cmax" type="number" step="0.1" placeholder="max" value="${c.maximum ?? ""}" /></td>
              </tr>`).join("")}
          </tbody></table>
          <p class="opt-caveat">${esc(status.objectives.defaults.note)}</p>
        </div>
      </div>
      <div class="opt-actions">
        <button id="opt-preview" class="opt-btn ghost">Preview transformations</button>
        <button id="opt-run" class="opt-btn">Start run</button>
      </div>
      <p class="opt-note">${esc(status.objectives.separation_of_concerns)}</p>
    </section>

    <div id="opt-out"></div>`;

  const strategySelect = root.querySelector("#opt-strategy");
  strategySelect.addEventListener("change", () => {
    const chosen = status.strategies.find((s) => s.key === strategySelect.value);
    root.querySelector("#opt-strategy-note").textContent = chosen
      ? chosen.description + (chosen.uses_surrogate
          ? ` A surrogate needs at least ${chosen.minimum_training_points} evaluated candidates; below that it says so and falls back to beam for that generation.`
          : "")
      : "";
  });

  root.querySelectorAll(".opt-pill").forEach((button) =>
    button.addEventListener("click", () => {
      root.querySelector("#opt-seed").value = button.dataset.smiles;
      root.querySelector("#opt-name").value = `${button.dataset.name} — optimisation`;
    }));

  function collect() {
    const objectivesOut = [...root.querySelectorAll("#opt-objectives input[type=checkbox]:checked")]
      .map((box) => {
        const threshold = box.closest(".opt-obj").querySelector(".opt-threshold").value;
        return { key: box.value, direction: box.dataset.dir,
                 ...(threshold === "" ? {} : { threshold: Number(threshold) }) };
      });
    const constraintsOut = [...root.querySelectorAll(".opt-constraints tr")].map((row) => {
      const min = row.querySelector(".opt-cmin").value;
      const max = row.querySelector(".opt-cmax").value;
      if (min === "" && max === "") return null;
      return { key: row.dataset.key,
               ...(min === "" ? {} : { minimum: Number(min) }),
               ...(max === "" ? {} : { maximum: Number(max) }) };
    }).filter(Boolean);
    const required = root.querySelector("#opt-req").value.trim();
    return {
      name: root.querySelector("#opt-name").value.trim() || "Optimisation",
      seed_smiles: root.querySelector("#opt-seed").value.trim(),
      strategy: strategySelect.value,
      generations: Number(root.querySelector("#opt-gens").value),
      children_per_parent: Number(root.querySelector("#opt-children").value),
      population_size: Number(root.querySelector("#opt-pop").value),
      random_seed: Number(root.querySelector("#opt-seedn").value),
      objectives: objectivesOut,
      constraints: constraintsOut,
      ...(required ? { required_smarts: [required] } : {}),
    };
  }

  const out = root.querySelector("#opt-out");

  root.querySelector("#opt-preview").addEventListener("click", async () => {
    out.innerHTML = loading("Applying every transformation that matches…");
    try {
      const body = await optimizerApi.preview(root.querySelector("#opt-seed").value.trim(), 30);
      out.innerHTML = renderPreview(body);
    } catch (error) {
      out.innerHTML = notice(esc(error.message), "warn", "⚠");
    }
  });

  root.querySelector("#opt-run").addEventListener("click", async () => {
    out.innerHTML = loading("Submitting…");
    try {
      const run = await optimizerApi.submit(collect());
      out.innerHTML = `<div class="opt-submitted lg-surface lg-d1">
        <strong>Run ${run.id} started.</strong>
        <p class="opt-note">${esc(run.note)}</p>
        <p><a class="opt-btn ghost" href="#/optimizer/candidates?run=${run.id}">Watch it →</a></p></div>`;
    } catch (error) {
      out.innerHTML = notice(`<strong>Refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });
}

function renderPreview(body) {
  const d = body.seed_descriptors || {};
  return `
    <section class="opt-preview lg-surface lg-d1">
      <header class="opt-panel-head">
        <div><h3>${body.proposed} children this seed would produce</h3>
          <span class="mono small dim">${esc(body.seed)}</span></div>
        <div class="opt-seedprops">
          <span>MW <b>${d.molecular_weight ?? "—"}</b></span>
          <span>cLogP <b>${d.clogp ?? "—"}</b></span>
          <span>TPSA <b>${d.tpsa ?? "—"}</b></span>
          <span>SA <b>${body.seed_synthesis?.value ?? "—"}</b></span>
        </div>
      </header>
      ${Object.entries(body.by_category).map(([category, entries]) => `
        <div class="opt-preview-group">
          <h4>${esc(category.replace(/_/g, " "))} <span class="dim">${entries.length}</span></h4>
          <table class="opt-table">
            <thead><tr><th>Transformation</th><th>Product</th><th>Why, and what it costs</th></tr></thead>
            <tbody>${entries.map((e) => `
              <tr>
                <td class="small">${esc(e.transformation)}</td>
                <td class="mono small">${esc(e.smiles)}</td>
                <td class="small dim">${esc(e.rationale)}<br /><em>${esc(e.tradeoff)}</em></td>
              </tr>`).join("")}</tbody>
          </table>
        </div>`).join("")}
      <p class="opt-caveat">${esc(body.note)}</p>
    </section>`;
}
