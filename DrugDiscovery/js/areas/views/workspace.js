/**
 * The disease workspace.
 *
 * One renderer for every therapeutic area and every disease. There is no
 * branch on area anywhere in this file, which is the frontend half of the
 * phase's central rule: glioblastoma under Neuroscience and heart failure
 * under Cardiovascular render through exactly these functions.
 *
 * What the area changes is the specialization strip — which area-relevant
 * property panels are surfaced, and which of those are actually backed by a
 * configured model. Everything else is identical.
 */

import { esc, loading, notice } from "../../ui.js";
import { areasApi } from "../api.js";
import { selection } from "../store.js";
import {
  areasDisclaimer,
  evidenceTag,
  groundingBadge,
  section,
  statusChip,
} from "../ui.js";

export async function workspaceView(root, params) {
  const stored = selection.get();
  const areaKey = params?.get("area") || stored?.area;
  const disease = params?.get("disease") || stored?.disease;

  if (!areaKey || !disease) {
    root.innerHTML = notice(
      `No disease selected. <a href="#/areas/select">Choose a therapeutic area and disease</a> to open a workspace.`,
      "info",
      "◈"
    );
    return;
  }

  root.innerHTML = `
    <div class="ta-building">
      ${loading(`Building the workspace for ${esc(disease)}…`)}
      <p class="ta-building-note">
        Querying Open Targets, Reactome, RCSB PDB and the local atlas. Sections
        appear together; one unreachable source degrades its own section only.
      </p>
    </div>`;

  let workspace;
  try {
    workspace = await areasApi.openWorkspace(areaKey, disease);
  } catch (error) {
    root.innerHTML = notice(
      `<strong>The workspace could not be built.</strong><br />${esc(error.message)}
       <br /><a href="#/areas/select">Choose another disease</a>.`,
      "danger",
      "⚠"
    );
    return;
  }

  render(root, workspace, areaKey);
}

function render(root, ws, areaKey) {
  const s = ws.sections || {};
  root.innerHTML = `
    ${renderHeader(ws)}
    ${renderSpecialization(ws)}
    <div class="ta-sections">
      ${renderDescription(s.description)}
      ${renderTargets(s.targets)}
      ${renderGenes(s.genes)}
      ${renderPathways(s.pathways)}
      ${renderMechanisms(s.mechanisms)}
      ${renderTissues(s.tissues)}
      ${renderKnownDrugs(s.known_drugs)}
      ${renderCompounds(s.compounds)}
      ${renderTrials(s.trials)}
      ${renderLiterature(s.literature)}
      ${renderStructures(s.structures)}
    </div>
    ${areasDisclaimer}`;

  root.querySelector("#ta-rebuild")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Rebuilding…";
    try {
      const fresh = await areasApi.openWorkspace(areaKey, ws.disease.id, { force: true });
      render(root, fresh, areaKey);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Rebuild";
      console.error(error);
    }
  });
}

function renderHeader(ws) {
  const d = ws.disease || {};
  const summary = ws.section_summary || {};

  const basis =
    d.identity_basis === "ontology"
      ? `<span class="ta-ground ta-ground-root" title="Resolved against a real disease ontology.">Ontology term</span>`
      : `<span class="ta-ground ta-ground-user" title="No ontology term matched this name. It is shown as supplied.">User-supplied</span>`;

  const alsoIn = (d.related_area_keys || []).filter((k) => k !== ws.area);
  const crossLinks = alsoIn.length
    ? `<div class="ta-crosslinks">
         <span class="dim small">This disease is also classified under</span>
         ${alsoIn
           .map(
             (k) =>
               `<a class="ta-crosslink" href="#/areas/workspace?area=${encodeURIComponent(
                 k
               )}&disease=${encodeURIComponent(d.id)}">${esc(k.replace(/_/g, " "))}</a>`
           )
           .join("")}
         <span class="dim small">— the same workspace, built by the same engine.</span>
       </div>`
    : "";

  const ontologyAreas = (d.ontology_areas || [])
    .map((a) => `<span class="ta-onto">${esc(a.name)} <span class="mono small dim">${esc(a.id)}</span></span>`)
    .join("");

  return `
    <header class="ta-ws-head lg-surface lg-d2">
      <div class="ta-ws-head-main">
        <div class="breadcrumbs">
          <a href="#/areas/select">Therapeutic Areas</a> ›
          <a href="#/areas/select?area=${encodeURIComponent(ws.area)}">${esc(ws.area_name)}</a> ›
          Workspace
        </div>
        <h2 class="ta-ws-title">${esc(d.name || d.id)}</h2>
        <div class="ta-ws-ids">
          <span class="mono">${esc(d.id)}</span>
          ${basis}
        </div>
        ${ontologyAreas ? `<div class="ta-ontos">${ontologyAreas}</div>` : ""}
        ${crossLinks}
      </div>
      <div class="ta-ws-meter">
        <div class="ta-meter-row"><span class="ta-status ta-status-ok"><span class="ta-glyph">●</span>Retrieved</span><b>${
          summary.ok || 0
        }</b></div>
        <div class="ta-meter-row"><span class="ta-status ta-status-empty"><span class="ta-glyph">○</span>Nothing recorded</span><b>${
          summary.empty || 0
        }</b></div>
        <div class="ta-meter-row"><span class="ta-status ta-status-unavailable"><span class="ta-glyph">⚠</span>Unavailable</span><b>${
          summary.unavailable || 0
        }</b></div>
        <div class="ta-meter-row"><span class="ta-status ta-status-not-configured"><span class="ta-glyph">◌</span>Not configured</span><b>${
          summary.not_configured || 0
        }</b></div>
        <button id="ta-rebuild" class="ta-rebuild lg-interactive">Rebuild</button>
        <div class="dim small mono">built ${esc((ws.built_at || "").slice(0, 16).replace("T", " "))}</div>
      </div>
    </header>`;
}

function renderSpecialization(ws) {
  const spec = ws.specialization;
  if (!spec || !spec.panels?.length) {
    return `
      <div class="ta-spec-strip ta-spec-generic">
        <span class="ta-spec-glyph">◇</span>
        <div>
          <strong>Shared discovery engine, unextended.</strong>
          This area adds no area-specific property panels. Every shared
          capability — ${esc((spec?.shared_modules || []).slice(0, 5).join(", "))} —
          is available here exactly as in every other area.
        </div>
      </div>`;
  }

  return `
    <div class="ta-spec-strip">
      <div class="ta-spec-head">
        <span class="ta-spec-glyph">◆</span>
        <div>
          <strong>${esc(spec.label)}</strong>
          <span class="dim small">
            ${spec.panel_counts.available} of ${spec.panel_counts.declared} panels backed by a
            configured model. Docking, dynamics, descriptors and the job system are
            shared, not duplicated here.
          </span>
        </div>
      </div>
      <div class="ta-panels">
        ${spec.panels
          .map(
            (p) => `
          <div class="ta-panel ${p.available ? (p.complete ? "ok" : "partial") : "absent"}">
            <div class="ta-panel-top">
              <strong>${esc(p.label)}</strong>
              <span class="ta-panel-flag">${
                p.complete ? "available" : p.available ? "partial" : "no model"
              }</span>
            </div>
            <p class="ta-panel-why">${esc(p.rationale)}</p>
            ${
              p.missing_models?.length
                ? `<p class="ta-panel-missing">Missing: ${esc(
                    p.missing_models.join(", ")
                  )}. ${esc(p.unavailable_reason || "")}</p>`
                : ""
            }
          </div>`
          )
          .join("")}
      </div>
    </div>`;
}

/* ------------------------------------------------------------- sections */

function renderDescription(data) {
  const body = data?.payload?.description
    ? `<p class="ta-desc">${esc(data.payload.description)}</p>`
    : `<p class="dim">No description text.</p>`;
  return section(
    "description",
    "Disease",
    "The ontology's own description of this disease.",
    data,
    body
  );
}

function renderTargets(data) {
  const rows = data?.payload?.targets || [];
  const body = `
    <p class="ta-caveat">${esc(data?.payload?.score_meaning || "")}</p>
    <table class="ta-table">
      <thead><tr>
        <th>Target</th><th>Name</th><th class="num">Association</th>
        <th>Strongest evidence</th><th>Evidence composition</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (t) => `
          <tr>
            <td><strong class="mono">${esc(t.symbol || "—")}</strong>
                <div class="mono small dim">${esc(t.ensembl_id || "")}</div></td>
            <td>${esc(t.name || "")}</td>
            <td class="num mono">${
              t.association_score == null ? "—" : t.association_score.toFixed(3)
            }</td>
            <td>${evidenceTag(t.evidence_level)}</td>
            <td class="ta-datatypes">${(t.datatype_scores || [])
              .filter((d) => d.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 4)
              .map(
                (d) =>
                  `<span class="ta-dt">${esc(
                    String(d.id).replace(/_/g, " ")
                  )} <b>${d.score.toFixed(2)}</b></span>`
              )
              .join("")}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    ${
      data?.payload?.total
        ? `<p class="dim small">Showing the top ${rows.length} of ${data.payload.total} associated targets, ranked by association score.</p>`
        : ""
    }`;
  return section(
    "targets",
    "Targets",
    "Disease–target associations, graded by the kind of evidence behind each.",
    data,
    body
  );
}

function renderGenes(data) {
  const genes = data?.payload?.genes || [];
  const body = `<div class="ta-chips">${genes
    .map(
      (g) =>
        `<span class="ta-chip"><strong class="mono">${esc(
          g.symbol || "—"
        )}</strong><span class="mono small dim">${esc(g.ensembl_id)}</span></span>`
    )
    .join("")}</div>`;
  return section(
    "genes",
    "Genes",
    "Derived from the targets above — the same records, by their Ensembl identifiers.",
    data,
    body
  );
}

function renderPathways(data) {
  const rows = data?.payload?.pathways || [];
  const body = `
    <p class="ta-caveat">${esc(data?.payload?.membership_note || "")}</p>
    <table class="ta-table">
      <thead><tr><th>Pathway</th><th>Reactome</th><th>Via targets</th></tr></thead>
      <tbody>
        ${rows
          .slice(0, 40)
          .map(
            (p) => `
          <tr>
            <td>${esc(p.name || "—")}</td>
            <td><a class="mono small" href="https://reactome.org/content/detail/${esc(
              p.reactome_id
            )}" target="_blank" rel="noopener noreferrer">${esc(p.reactome_id)} ↗</a></td>
            <td>${(p.via_targets || [])
              .map((t) => `<span class="ta-dt mono">${esc(t)}</span>`)
              .join("")}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  return section(
    "pathways",
    "Pathways",
    "Curated Reactome membership for the leading associated targets.",
    data,
    body
  );
}

function renderMechanisms(data) {
  const body = `<p class="dim">This deployment's atlas holds a mechanism cascade for this disease.
    <a href="#/mechanism">Open the mechanism explorer</a>.</p>`;
  return section(
    "mechanisms",
    "Mechanisms",
    "The atlas's own disease mechanism cascade, where this disease has been ingested.",
    data,
    body
  );
}

function renderTissues(data) {
  const targets = data?.payload?.targets || [];
  const body = `
    <p class="ta-caveat">${esc(data?.payload?.interpretation || "")}</p>
    ${targets
      .map(
        (t) => `
      <div class="ta-tissue-block">
        <strong class="mono">${esc(t.symbol)}</strong>
        <div class="ta-chips">
          ${(t.tissues || [])
            .map(
              (x) =>
                `<span class="ta-chip">${esc(
                  x.tissue || x.name || "—"
                )} <b class="mono">${
                  x.median == null ? "—" : Number(x.median).toFixed(1)
                }</b></span>`
            )
            .join("")}
        </div>
      </div>`
      )
      .join("")}`;
  return section(
    "tissues",
    "Tissues",
    "Baseline expression of the leading targets — where the target is, not where the disease is.",
    data,
    body
  );
}

function renderKnownDrugs(data) {
  const drugs = data?.payload?.drugs || [];
  const body = `
    <table class="ta-table">
      <thead><tr><th>Drug</th><th>Type</th><th>Stage reached</th><th>Evidence</th><th>Mechanism</th></tr></thead>
      <tbody>
        ${drugs
          .map(
            (d) => `
          <tr>
            <td><strong>${esc(d.name || "—")}</strong>
                <div class="mono small dim">${esc(d.chembl_id || "")}</div></td>
            <td>${esc(d.drug_type || "—")}</td>
            <td class="mono small">${esc(
              String(d.max_clinical_stage || "—").replace(/_/g, " ")
            )}</td>
            <td>${evidenceTag(d.evidence_level)}</td>
            <td class="small">${(d.mechanisms || [])
              .slice(0, 2)
              .map(
                (m) =>
                  `${esc(m.mechanism_of_action || "")}${
                    m.action_type ? ` <span class="dim">(${esc(m.action_type)})</span>` : ""
                  }`
              )
              .join("<br />")}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  return section(
    "known_drugs",
    "Known drugs & clinical candidates",
    "Compounds recorded against this disease, with the clinical stage each reached.",
    data,
    body
  );
}

function renderCompounds(data) {
  const rows = data?.payload?.compounds || [];
  const body = `<div class="ta-chips">${rows
    .map(
      (c) =>
        `<a class="ta-chip lg-interactive" href="#/entity/${esc(c.node_id)}">${esc(
          c.name || "—"
        )} ${evidenceTag(c.evidence_level)}</a>`
    )
    .join("")}</div>`;
  return section(
    "compounds",
    "Compounds in this atlas",
    "Compounds and drugs this deployment has ingested and linked to the disease.",
    data,
    body
  );
}

function renderTrials(data) {
  const rows = data?.payload?.trials || data?.payload || [];
  const list = Array.isArray(rows) ? rows : rows.trials || [];
  const body = `
    <table class="ta-table">
      <thead><tr><th>NCT</th><th>Title</th><th>Phase</th><th>Status</th></tr></thead>
      <tbody>
        ${list
          .slice(0, 25)
          .map(
            (t) => `
          <tr>
            <td><a class="mono small" href="https://clinicaltrials.gov/study/${esc(
              t.nct_id
            )}" target="_blank" rel="noopener noreferrer">${esc(t.nct_id)} ↗</a></td>
            <td class="small">${esc(t.title || "")}</td>
            <td class="mono small">${esc(t.phase || "—")}</td>
            <td class="small">${esc(t.status || "—")}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  return section(
    "trials",
    "Clinical trials",
    "Registry records this deployment holds for the disease.",
    data,
    body
  );
}

function renderLiterature(data) {
  const rows = data?.payload?.publications || [];
  const body = `
    <ul class="ta-papers">
      ${rows
        .slice(0, 25)
        .map(
          (p) => `
        <li>
          <span class="ta-paper-title">${esc(p.title || "—")}</span>
          <span class="dim small">${esc(p.journal || "")} ${esc(p.year || "")}</span>
          ${
            p.pmid
              ? `<a class="mono small" href="https://pubmed.ncbi.nlm.nih.gov/${esc(
                  p.pmid
                )}/" target="_blank" rel="noopener noreferrer">PMID ${esc(p.pmid)} ↗</a>`
              : ""
          }
        </li>`
        )
        .join("")}
    </ul>`;
  return section(
    "literature",
    "Literature",
    "Publications linked to this disease in the atlas graph.",
    data,
    body
  );
}

function renderStructures(data) {
  const rows = data?.payload?.structures || [];
  const body = `<div class="ta-chips">${rows
    .map(
      (s) =>
        `<a class="ta-chip lg-interactive" href="https://www.rcsb.org/structure/${esc(
          s.pdb_id
        )}" target="_blank" rel="noopener noreferrer">
          <strong class="mono">${esc(s.pdb_id)}</strong>
          <span class="small dim">${esc(s.target_symbol || "")}</span></a>`
    )
    .join("")}</div>`;
  return section(
    "structures",
    "Experimental structures",
    "PDB entries whose polymer entities map to the leading targets.",
    data,
    body
  );
}
