/**
 * Dashboard.
 *
 * Every number here is computed from the database at request time. Nothing is
 * hard-coded, so an empty database reads as empty rather than as a populated
 * platform.
 */

import { api } from "../api.js";
import {
  card,
  disclaimer,
  empty,
  esc,
  evidenceBadge,
  fmt,
  loading,
  notice,
  statTile,
} from "../ui.js";

export async function dashboardView(root) {
  root.innerHTML = loading("Reading database…");
  const [stats, evidenceLevels] = await Promise.all([
    api.stats(),
    api.evidenceLevels(),
  ]);

  const e = stats.entities || {};
  const total = stats.total_entities || 0;

  if (!total) {
    root.innerHTML = `
      <div class="page-head"><h2>Drug Discovery</h2></div>
      ${notice(
        `The database is empty. Run the ingestion job to populate it from the
         configured scientific sources:
         <br /><code>python -m app.ingest.run --full</code>`,
        "warn",
        "⚠"
      )}
      ${empty("No entities have been ingested yet.")}`;
    return;
  }

  const evidenceRows = Object.entries(stats.evidence_distribution || {})
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, value]) => {
      const share = (value.count / (stats.total_relationships || 1)) * 100;
      return `
        <div class="row" style="margin-bottom:9px">
          <div style="min-width:190px">${evidenceBadge(value)}</div>
          <div style="flex:1;background:var(--bg-hover);border-radius:4px;height:9px;overflow:hidden">
            <div style="width:${share.toFixed(1)}%;height:100%;background:var(--ev-${esc(
              value.tone
            )});opacity:.8"></div>
          </div>
          <div class="mono small dim" style="width:96px;text-align:right">
            ${fmt.num(value.count)} · ${share.toFixed(1)}%
          </div>
        </div>`;
    })
    .join("");

  const relationshipRows = Object.entries(stats.relationships || {})
    .sort((a, b) => b[1] - a[1])
    .map(
      ([predicate, count]) => `
        <tr>
          <td class="mono small">${esc(predicate)}</td>
          <td style="text-align:right" class="mono">${fmt.num(count)}</td>
        </tr>`
    )
    .join("");

  const familyRows = (stats.disease_families || [])
    .map(
      (f) => `
      <div class="entity-row" data-nav="#/diseases?family=${esc(f.key)}">
        <div class="body">
          <div class="name">${esc(f.label)}</div>
          <div class="meta">${esc(f.key)}</div>
        </div>
        <div class="right mono">${f.count}</div>
      </div>`
    )
    .join("");

  root.innerHTML = `
    <div class="page-head">
      <h2>Neurological therapeutics atlas</h2>
      <p class="lede">
        An interconnected view of neurological disease biology and the
        therapeutics aimed at it — diseases, molecular targets, drugs, chemical
        structures, pathways, structures, trials, and the literature, joined
        into one graph in which every relationship carries its evidence level
        and its source.
      </p>
    </div>

    <div class="grid grid-4 mb">
      ${statTile(e.disease || 0, "Diseases", "ontology-anchored")}
      ${statTile(e.drug || 0, "Therapeutic entities", "approved &amp; investigational")}
      ${statTile(
        stats.small_molecules_with_structure || 0,
        "Small molecules",
        "with a validated structure"
      )}
      ${statTile(e.target || 0, "Molecular targets", "reviewed protein records")}
      ${statTile(e.pathway || 0, "Pathways", "curated membership")}
      ${statTile(
        stats.experimental_structures || 0,
        "PDB structures",
        "experimentally determined"
      )}
      ${statTile(e.trial || 0, "Clinical trials", "registry records")}
      ${statTile(e.publication || 0, "Publications", "retrieved citations")}
    </div>

    <div class="grid grid-2">
      ${card(
        "Evidence composition",
        `<p class="small muted" style="margin-top:-4px">
           Every relationship in the graph is graded. This is the distribution
           across all ${fmt.num(stats.total_relationships)} of them.
         </p>${evidenceRows}`
      )}
      ${card(
        "Provenance coverage",
        `<div class="grid grid-3" style="gap:10px">
           ${statTile(stats.total_relationships || 0, "Relationships")}
           ${statTile(stats.provenance_records || 0, "Source records")}
           ${statTile(stats.measurements || 0, "Measurements")}
         </div>
         <div class="notice notice-muted" style="margin-top:14px;margin-bottom:0">
           <span class="ico">🔗</span>
           <div>
             Every relationship shown anywhere in this platform is backed by at
             least one retrieved source record. Relationships without provenance
             are treated as defects and are reported under
             <a href="#/admin">scientific review</a>.
           </div>
         </div>`
      )}
    </div>

    <div class="grid grid-2">
      ${card(
        "Disease families",
        `<div style="margin:0 -18px -16px">${familyRows || empty("No diseases ingested.")}</div>`
      )}
      ${card(
        "Relationship types",
        `<div class="table-scroll" style="max-height:330px">
           <table><thead><tr><th>Predicate</th><th style="text-align:right">Count</th></tr></thead>
           <tbody>${relationshipRows}</tbody></table>
         </div>`
      )}
    </div>

    ${card(
      "Evidence vocabulary",
      `<p class="small muted" style="margin-top:-4px">
         What each badge means. These are applied consistently across every
         page; hovering a badge anywhere shows the same definition.
       </p>
       <div class="grid grid-2" style="gap:9px">
         ${evidenceLevels
           .map(
             (level) => `
             <div class="row" style="align-items:flex-start;gap:11px">
               <div style="min-width:180px">${evidenceBadge(level)}</div>
               <div class="small muted" style="flex:1">${esc(level.description)}</div>
             </div>`
           )
           .join("")}
       </div>`
    )}

    ${
      stats.last_ingest
        ? notice(
            `Most recent ingestion: <strong>${esc(stats.last_ingest.job)}</strong>
             from <strong>${esc(stats.last_ingest.source)}</strong> —
             ${esc(stats.last_ingest.status)}
             ${stats.last_ingest.finished_at ? `(${fmt.date(stats.last_ingest.finished_at)})` : ""}.
             <a href="#/admin">View ingestion history and quality control</a>.`,
            "muted",
            "⟳"
          )
        : ""
    }

    ${disclaimer}`;
}
