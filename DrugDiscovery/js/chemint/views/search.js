/**
 * Search across the fabric.
 *
 * The interface shows *how the query was read* — as a name, an identifier, an
 * InChIKey or a structure — and which route matched each result. A user who
 * pastes a SMILES and gets name matches deserves to know their structure was
 * not understood, rather than being left to wonder why the answers look odd.
 *
 * When nothing matches, the empty state says the compound has not been
 * ingested yet and offers to fetch it. It never says "not found", because the
 * fabric does not know whether a molecule exists — only whether it holds it.
 */

import { esc, loading, notice } from "../../ui.js";
import { chemApi } from "../api.js";
import { areaLabels, subject } from "../router.js";
import { areaPills, coverageNote, neighborBadge } from "../ui.js";

export async function searchView(root, params) {
  const initial = params?.get("q") || "";
  const labels = await areaLabels();

  let status = null;
  try {
    status = await chemApi.status();
  } catch {
    /* the panel below reports it; search still works */
  }

  root.innerHTML = `
    <div class="ci-search-bar">
      <input id="ci-q" class="search-input" type="search" autocomplete="off"
             spellcheck="false"
             placeholder="Name, brand, ChEMBL ID, PubChem CID, InChIKey, or SMILES…"
             value="${esc(initial)}" />
      <button class="primary" id="ci-go">Search</button>
    </div>
    <div id="ci-reading"></div>
    <div id="ci-results"></div>
    ${
      status
        ? `<section class="card ci-coverage-card">
             <h3>What this fabric currently holds</h3>
             <div class="ci-stat-row">
               ${statTile(status.totals.entities, "entities")}
               ${statTile(status.totals.substances, "substances")}
               ${statTile(status.totals.activities, "measurements")}
               ${statTile(status.totals.claims, "claims")}
               ${statTile(status.totals.scaffolds, "scaffolds")}
             </div>
             <h4 class="ci-sub">Therapeutic areas represented</h4>
             <div class="ci-areas">
               ${(status.therapeutic_areas || [])
                 .map(
                   (a) =>
                     `<a class="ci-area ci-area-link" href="#/chemint/search?area=${esc(
                       a.key
                     )}">${esc(a.label)} <span class="n">${a.count}</span></a>`
                 )
                 .join("") || '<span class="dim">nothing ingested yet</span>'}
             </div>
             ${coverageNote(status.coverage)}
           </section>`
        : ""
    }
  `;

  const input = root.querySelector("#ci-q");
  const reading = root.querySelector("#ci-reading");
  const results = root.querySelector("#ci-results");

  async function run(query, extra = {}) {
    if (!query || !query.trim()) {
      reading.innerHTML = "";
      results.innerHTML = "";
      return;
    }
    results.innerHTML = loading("Searching the fabric…");
    try {
      const payload = await chemApi.search(query.trim(), { limit: 50, ...extra });
      renderReading(reading, payload.interpretation);
      renderResults(results, payload, labels);
    } catch (error) {
      results.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  }

  root.querySelector("#ci-go").addEventListener("click", () => run(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") run(input.value);
  });

  // An area link arrives as ?area=…; browse that area rather than searching.
  const area = params?.get("area");
  if (area) {
    results.innerHTML = loading(`Loading ${esc(labels[area] || area)}…`);
    try {
      const payload = await chemApi.browse({
        entity_type: "molecule",
        therapeutic_area: area,
        limit: 200,
      });
      renderResults(
        results,
        {
          results: payload.results.map((r) => ({ ...r, matched_by: "therapeutic area" })),
          total: payload.results.length,
          routes: ["therapeutic area"],
        },
        labels,
        `Molecules tagged ${labels[area] || area}`
      );
    } catch (error) {
      results.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
    return;
  }

  if (initial) run(initial);
  else input.focus();
}

function statTile(value, label) {
  return `<div class="ci-stat">
    <div class="value">${Number(value || 0).toLocaleString()}</div>
    <div class="label">${esc(label)}</div>
  </div>`;
}

/** Show how the query was interpreted. */
function renderReading(host, interpretation) {
  if (!interpretation || interpretation.kind === "empty") {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `
    <div class="ci-reading">
      <span class="ci-reading-kind">${esc(interpretation.kind)}</span>
      <span>${esc(interpretation.note || "")}</span>
      ${
        interpretation.normalized &&
        interpretation.normalized !== interpretation.kind
          ? `<span class="mono dim">${esc(
              String(interpretation.normalized).slice(0, 90)
            )}</span>`
          : ""
      }
    </div>`;
}

function renderResults(host, payload, labels, heading = null) {
  if (!payload.results || !payload.results.length) {
    host.innerHTML = `
      <div class="ci-empty">
        <div class="big">◌</div>
        <p><strong>Nothing in the fabric matched.</strong></p>
        <p class="dim">${esc(
          payload.note ||
            "This compound has not been ingested yet. That is not the same " +
              "as saying it does not exist or that nothing is known about it."
        )}</p>
        <button class="primary" id="ci-request">Fetch it from the sources</button>
        <div id="ci-request-result"></div>
      </div>`;

    host.querySelector("#ci-request")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const target = host.querySelector("#ci-request-result");
      button.disabled = true;
      button.textContent = "Queueing…";
      try {
        const outcome = await chemApi.ingest(payload.query);
        target.innerHTML = notice(
          `${esc(String(outcome.queued))} job(s) queued. ${esc(outcome.note)}`,
          "info",
          "◷"
        );
      } catch (error) {
        target.innerHTML = notice(esc(error.message), "danger", "⚠");
      } finally {
        button.textContent = "Queued";
      }
    });
    return;
  }

  host.innerHTML = `
    <section class="card">
      <h3>${esc(heading || `${payload.total} result${payload.total === 1 ? "" : "s"}`)}
        ${
          payload.routes && payload.routes.length
            ? `<span class="spacer"></span><span class="dim small">matched by ${esc(
                payload.routes.join(", ")
              )}</span>`
            : ""
        }
      </h3>
      <div class="ci-results">
        ${payload.results
          .map((row) => {
            const substance = row.substance || {};
            return `
              <a class="ci-result" href="#/chemint/molecule?entity=${row.entity_id}"
                 data-entity="${row.entity_id}">
                <div class="ci-result-figure">
                  ${
                    substance.smiles
                      ? `<img loading="lazy" alt="" src="${esc(
                          chemApi.depictionUrl(row.entity_id, 200, 150)
                        )}" />`
                      : `<span class="ci-nostructure" title="${esc(
                          "No small-molecule structure — a product, a biologic, " +
                            "or a compound whose structure was never disclosed."
                        )}">no structure</span>`
                  }
                </div>
                <div class="ci-result-body">
                  <div class="ci-result-name">${esc(row.name)}</div>
                  <div class="ci-result-meta">
                    <span class="mono">${esc(row.primary_id)}</span>
                    ${
                      substance.formula
                        ? ` · ${esc(substance.formula)}`
                        : ""
                    }
                    ${
                      substance.molecular_weight
                        ? ` · ${Number(substance.molecular_weight).toFixed(2)} Da`
                        : ""
                    }
                  </div>
                  <div class="ci-result-areas">
                    ${areaPills(row.therapeutic_areas, labels)}
                  </div>
                </div>
                <div class="ci-result-right">
                  ${
                    substance.class
                      ? neighborBadge({
                          class: substance.class,
                          class_tone: substance.class,
                          class_label: substance.class.replace(/_/g, " "),
                        })
                      : ""
                  }
                  <div class="dim small">${esc(row.matched_by || "")}</div>
                </div>
              </a>`;
          })
          .join("")}
      </div>
      ${
        payload.truncated
          ? `<div class="dim small">Showing the first ${payload.results.length} of ${payload.total}.</div>`
          : ""
      }
    </section>`;

  host.querySelectorAll(".ci-result").forEach((node) =>
    node.addEventListener("click", () => {
      const row = payload.results.find(
        (r) => String(r.entity_id) === node.dataset.entity
      );
      if (row) {
        subject.set({
          entity_id: row.entity_id,
          name: row.name,
          entity_type: row.entity_type,
          inchikey: row.substance?.inchikey || null,
          smiles: row.substance?.smiles || null,
        });
      }
    })
  );
}
