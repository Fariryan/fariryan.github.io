/**
 * Entity pages: disease, drug, compound, target, pathway, trial, publication.
 *
 * Tabs are assembled per kind. Two rules hold throughout:
 *   - a value that was not retrieved renders as "Insufficient verified
 *     evidence", never as a blank, a zero, or an inferred value;
 *   - every relationship shows its evidence badge next to it, and its sources
 *     are one click away in the Evidence tab.
 */

import { api } from "../api.js";
import {
  card,
  disclaimer,
  empty,
  entityLink,
  entityRow,
  esc,
  evidenceBadge,
  fmt,
  kindBadge,
  loading,
  notice,
  provenanceList,
  structureBanner,
  tabs,
} from "../ui.js";
import { MoleculeViewer, StructureViewer } from "../viewer-molecule.js";
import { compareStore } from "../compare-store.js";

export async function entityView(root, id) {
  root.innerHTML = loading();
  const entity = await api.entity(id);

  const header = `
    <div class="breadcrumbs">
      <a href="#/">Dashboard</a> ›
      <a href="#/${pluralFor(entity.kind)}">${esc(pluralLabel(entity.kind))}</a> ›
      <span>${esc(entity.name)}</span>
    </div>
    <div class="page-head">
      <h2>${kindBadge(entity.kind)} ${esc(entity.name)}</h2>
      <p class="lede">${
        entity.description_full
          ? esc(entity.description_full)
          : '<span class="dim">No source-supplied description was retrieved for this entity.</span>'
      }</p>
      ${
        entity.description_source
          ? `<div class="small dim" style="margin-top:6px">
               Description supplied verbatim by <strong>${esc(
                 entity.description_source
               )}</strong>. Not authored by this platform.
             </div>`
          : ""
      }
      <div class="row" style="margin-top:11px">
        <button class="sm" id="add-compare">＋ Add to comparison</button>
        <a class="btn sm" href="#/graph/${entity.id}">◈ View in knowledge graph</a>
        ${
          entity.kind === "drug"
            ? `<a class="btn sm" href="#/mechanism/${entity.id}">⇣ Mechanism cascade</a>`
            : ""
        }
      </div>
    </div>`;

  root.innerHTML = header + '<div id="tabhost"></div>' + disclaimer;

  root.querySelector("#add-compare").addEventListener("click", (event) => {
    compareStore.add({ id: entity.id, name: entity.name, kind: entity.kind });
    event.target.textContent = "✓ Added to comparison";
    event.target.disabled = true;
  });

  const host = root.querySelector("#tabhost");
  const tabList = buildTabs(entity);
  tabs(host, tabList, (tab, panel) => tab.render(panel, entity));
}

/* ------------------------------------------------------------------ tabs */

function buildTabs(entity) {
  const list = [{ label: "Overview", render: renderOverview }];
  const rel = entity.relationships || [];

  const byPredicate = (...predicates) =>
    rel.filter((r) => predicates.includes(r.predicate));

  if (entity.kind === "disease") {
    const targets = byPredicate("ASSOCIATED_WITH");
    const treatments = byPredicate("APPROVED_FOR", "INVESTIGATED_FOR", "OFF_LABEL_USE_IN");
    list.push(
      { label: "Molecular biology", count: targets.length, render: renderDiseaseBiology },
      { label: "Treatments", count: treatments.length, render: renderTreatments },
      { label: "Pathways", render: renderDiseasePathways },
      { label: "Brain regions", render: renderRegions },
      { label: "Trials", count: (entity.trials || []).length, render: renderTrials }
    );
  }

  if (entity.kind === "drug") {
    list.push(
      { label: "Chemical structure", render: renderChemistry },
      { label: "3D molecule", render: render3D },
      { label: "Targets", count: byPredicate("TARGETS").length, render: renderTargets },
      { label: "Mechanism", render: renderMechanismTab },
      { label: "Pharmacology", count: (entity.activities || []).length, render: renderPharmacology },
      { label: "Clinical uses", render: renderClinicalUses },
      { label: "Safety", render: renderSafety }
    );
  }

  if (entity.kind === "compound") {
    list.push(
      { label: "Chemical structure", render: renderChemistry },
      { label: "3D molecule", render: render3D },
      { label: "Measurements", count: (entity.activities || []).length, render: renderPharmacology }
    );
  }

  if (entity.kind === "target") {
    list.push(
      { label: "Protein", render: renderProtein },
      { label: "3D structures", count: byPredicate("HAS_STRUCTURE").length, render: renderStructures },
      { label: "Ligands", count: rel.filter((r) => r.predicate === "TARGETS").length, render: renderLigands },
      { label: "Pathways", count: byPredicate("PARTICIPATES_IN").length, render: renderPathways },
      { label: "Diseases", count: byPredicate("ASSOCIATED_WITH").length, render: renderTargetDiseases }
    );
  }

  if (entity.kind === "structure") {
    list.push({ label: "3D structure", render: renderStructureViewer });
  }

  if (entity.kind === "pathway") {
    list.push({ label: "Participants", render: renderPathwayMembers });
  }

  list.push(
    { label: "Relationships", count: rel.length, render: renderRelationships },
    { label: "Evidence", count: (entity.publications || []).length, render: renderEvidence }
  );
  return list;
}

/* -------------------------------------------------------------- overview */

function renderOverview(panel, entity) {
  const detail = entity.detail || {};
  const rows = [];

  const push = (label, value) => rows.push([label, value]);

  push("Identifier", `<span class="mono">${esc(entity.primary_id)}</span>`);

  if (entity.kind === "disease") {
    push("Family", esc(detail.disease_family || "—"));
    push(
      "Therapeutic areas",
      (detail.therapeutic_areas || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("") ||
        '<span class="dim">Not recorded</span>'
    );
    push("Associated targets", fmt.num(detail.associated_target_count));
    push("Drug relationships", fmt.num(detail.known_drug_count));
    push("Registered trials", fmt.num(detail.trial_count));
  }

  if (entity.kind === "drug") {
    push("Modality", esc((detail.modality || "").replace(/_/g, " ") || "—"));
    push(
      "Highest development phase",
      detail.max_phase !== null && detail.max_phase !== undefined
        ? `${detail.max_phase}${
            detail.max_phase >= 4
              ? ' <span class="small dim">(phase 4 reached — see Clinical uses for the regulatory record)</span>'
              : ""
          }`
        : '<span class="dim">Insufficient verified evidence</span>'
    );
    push("ATC codes", (detail.atc_codes || []).join(", ") || '<span class="dim">Not recorded</span>');
    push(
      "Routes recorded",
      [
        detail.oral ? "oral" : null,
        detail.parenteral ? "parenteral" : null,
        detail.topical ? "topical" : null,
      ]
        .filter(Boolean)
        .join(", ") || '<span class="dim">Not recorded</span>'
    );
    push(
      "Blood–brain barrier",
      detail.bbb_penetration
        ? `${esc(detail.bbb_penetration)} ${evidenceBadge({
            tone: detail.bbb_evidence_level || "unknown",
            label: detail.bbb_evidence_level || "unknown",
            description: detail.bbb_statement || "",
          })}`
        : `<span class="dim">Insufficient verified evidence.</span>
           <div class="small dim" style="margin-top:3px">
             CNS penetration is asserted only from an explicit source statement.
             It is never inferred from physicochemical properties.
           </div>`
    );
    push("Withdrawn", boolLabel(detail.withdrawn));
    push("Boxed warning", boolLabel(detail.black_box_warning));
  }

  if (entity.kind === "target") {
    push("Gene symbol", esc(detail.gene_symbol || "—"));
    push(
      "UniProt",
      detail.uniprot_accession
        ? `<a href="https://www.uniprot.org/uniprotkb/${esc(
            detail.uniprot_accession
          )}" target="_blank" rel="noopener" class="mono">${esc(detail.uniprot_accession)}</a>`
        : "—"
    );
    push("Organism", esc(detail.organism || "—"));
    push("Length", detail.sequence_length ? `${fmt.num(detail.sequence_length)} aa` : "—");
    push("Mass", detail.mass_da ? `${fmt.num(detail.mass_da)} Da` : "—");
    push("Target class", esc(detail.target_class || "—"));
  }

  if (entity.kind === "compound") {
    push("Formula", `<span class="mono">${esc(detail.molecular_formula || "—")}</span>`);
    push("Molecular weight", detail.molecular_weight ? `${detail.molecular_weight} g/mol` : "—");
    push("InChIKey", `<span class="mono">${esc(detail.inchikey || "—")}</span>`);
  }

  if (entity.kind === "pathway") {
    push("Stable ID", `<span class="mono">${esc(detail.stable_id || "—")}</span>`);
    push("Ontology", esc(detail.ontology || "—"));
    push("Species", esc(detail.species || "—"));
    if (detail.diagram_url) {
      push(
        "Diagram",
        `<a href="${esc(detail.diagram_url)}" target="_blank" rel="noopener">Open in Reactome ↗</a>`
      );
    }
  }

  const identifiers = (entity.identifiers || [])
    .map(
      (x) =>
        `<span class="chip"><span class="dim">${esc(x.namespace)}</span>
         <span class="mono">${esc(x.identifier)}</span></span>`
    )
    .join("");

  const synonyms = (entity.synonyms || [])
    .slice(0, 40)
    .map(
      (s) =>
        `<span class="chip" title="${esc(s.type || "synonym")} · ${esc(
          s.source || ""
        )}">${esc(s.value)}</span>`
    )
    .join("");

  const conflicts = (entity.conflicts || []).length
    ? notice(
        `<strong>Sources disagree on ${entity.conflicts.length} value(s).</strong>
         Both claims are shown; the platform does not choose between
         authoritative sources.
         <div style="margin-top:8px">
           ${entity.conflicts
             .map(
               (c) => `
               <div style="margin-bottom:6px">
                 <span class="mono small">${esc(c.field)}</span>:
                 ${c.claims
                   .map(
                     (claim) =>
                       `<span class="chip">${esc(claim.source)} = ${esc(
                         String(claim.value)
                       )}</span>`
                   )
                   .join(" vs ")}
               </div>`
             )
             .join("")}
         </div>`,
        "warn",
        "⚖"
      )
    : "";

  panel.innerHTML = `
    ${conflicts}
    <div class="grid grid-2">
      ${card(
        "Key facts",
        `<dl class="kv">${rows
          .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`)
          .join("")}</dl>`
      )}
      ${card(
        "Identifiers",
        identifiers || '<span class="dim">No cross-references recorded.</span>'
      )}
    </div>
    ${synonyms ? card(`Synonyms &amp; names`, synonyms) : ""}
    ${
      entity.kind === "drug" && entity.compound
        ? card(
            "Active compound",
            entityRow(entity.compound, `<span class="mono small">${esc(
              entity.compound.detail?.molecular_formula || ""
            )}</span>`)
          )
        : ""
    }`;

  wireNav(panel);
}

const boolLabel = (value) =>
  value === null || value === undefined
    ? '<span class="dim">Not recorded</span>'
    : value
    ? '<strong style="color:var(--warning)">Yes</strong>'
    : "No";

/* ------------------------------------------------------------- chemistry */

async function renderChemistry(panel, entity) {
  const compound = entity.kind === "compound" ? entity : entity.compound;
  if (!compound) {
    panel.innerHTML = empty("No chemical structure is linked to this entity.", "⌬");
    return;
  }

  panel.innerHTML = loading("Analysing structure…");
  const chemistry = await api.compoundChemistry(compound.id);
  const retrieved = chemistry.retrieved_properties || {};
  const computed = chemistry.computed_properties || {};

  const propRow = (label, retrievedValue, computedValue, units = "") => {
    const hasRetrieved = retrievedValue !== null && retrievedValue !== undefined;
    const hasComputed = computedValue !== null && computedValue !== undefined;
    return `<tr>
      <td>${esc(label)}</td>
      <td class="mono">${
        hasRetrieved ? esc(String(retrievedValue)) + esc(units) : '<span class="dim">—</span>'
      }</td>
      <td class="mono dim">${
        hasComputed ? esc(String(computedValue)) + esc(units) : "—"
      }</td>
    </tr>`;
  };

  const groups = (chemistry.functional_groups || [])
    .map(
      (g, i) => `
      <span class="chip clickable" data-group="${i}"
            title="SMARTS: ${esc(g.smarts)} · ${esc(g.method)}">
        ${esc(g.name)}${g.count > 1 ? ` ×${g.count}` : ""}
      </span>`
    )
    .join("");

  const stereo = (chemistry.stereocenters || [])
    .map(
      (s) =>
        `<span class="chip">atom ${s.atom_index} (${esc(s.symbol)}) —
         ${s.defined ? esc(s.chirality) : '<span style="color:var(--warning)">undefined</span>'}</span>`
    )
    .join("");

  panel.innerHTML = `
    <div class="grid grid-2">
      <div>
        ${card(
          "2D structure",
          `<div class="mol-2d" id="svg-host">${loading("Rendering…")}</div>
           <div class="small dim" style="margin-top:9px">
             Rendered server-side by RDKit directly from the stored structure,
             so the depiction always matches the recorded SMILES.
           </div>`
        )}
        ${card(
          "Structure identifiers",
          `<dl class="kv">
             <dt>Formula</dt><dd class="mono">${fmt.orUnknown(retrieved.molecular_formula || entity.detail?.molecular_formula)}</dd>
             <dt>InChIKey</dt><dd class="mono">${fmt.orUnknown(compound.detail?.inchikey)}</dd>
             <dt>Canonical SMILES</dt><dd class="mono small" style="word-break:break-all">${fmt.orUnknown(chemistry.smiles)}</dd>
           </dl>`
        )}
      </div>
      <div>
        ${card(
          "Physicochemical properties",
          `<table>
             <thead><tr>
               <th>Property</th>
               <th>Retrieved${
                 retrieved.source ? ` <span class="dim">(${esc(retrieved.source)})</span>` : ""
               }</th>
               <th>Computed <span class="dim">(RDKit)</span></th>
             </tr></thead>
             <tbody>
               ${propRow("Molecular weight", retrieved.molecular_weight, computed.molecular_weight)}
               ${propRow("Exact mass", retrieved.exact_mass, computed.exact_mass)}
               ${propRow("LogP", retrieved.xlogp, computed.clogp)}
               ${propRow("TPSA", retrieved.tpsa, computed.tpsa, " Å²")}
               ${propRow("H-bond donors", retrieved.h_bond_donors, computed.hbd)}
               ${propRow("H-bond acceptors", retrieved.h_bond_acceptors, computed.hba)}
               ${propRow("Rotatable bonds", retrieved.rotatable_bonds, computed.rotatable_bonds)}
               ${propRow("Heavy atoms", retrieved.heavy_atom_count, computed.heavy_atoms)}
               ${propRow("Formal charge", retrieved.formal_charge, computed.formal_charge)}
               ${propRow("Rings", null, computed.rings)}
               ${propRow("Aromatic rings", null, computed.aromatic_rings)}
             </tbody>
           </table>
           <div class="notice notice-muted" style="margin:12px 0 0">
             <span class="ico">🧮</span>
             <div>${esc(chemistry.computed_note)}
             A computed LogP is an estimate from the structure, not a measured
             partition coefficient, and the two columns are never merged.</div>
           </div>`
        )}
        ${card(
          "Functional groups",
          groups
            ? `${groups}
               <div class="small dim" style="margin-top:9px">
                 Detected by SMARTS substructure matching. Hover a group to see
                 the exact pattern used.
               </div>`
            : '<span class="dim">No catalogued functional groups matched.</span>'
        )}
        ${card(
          "Stereochemistry",
          stereo || '<span class="dim">No stereocentres detected.</span>'
        )}
        ${
          (chemistry.validation?.messages || []).length
            ? notice(
                `<strong>Structure validation notes</strong><ul style="margin:6px 0 0;padding-left:18px">
                   ${chemistry.validation.messages.map((m) => `<li>${esc(m)}</li>`).join("")}
                 </ul>`,
                chemistry.validation.validated ? "warn" : "danger",
                "⚗"
              )
            : notice("Structure parsed and validated against its source metadata by RDKit.", "muted", "✓")
        }
      </div>
    </div>`;

  const svgHost = panel.querySelector("#svg-host");
  fetch(api.compoundSvgUrl(compound.id))
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error("no depiction"))))
    .then((svg) => {
      svgHost.innerHTML = svg;
    })
    .catch(() => {
      svgHost.innerHTML = '<span class="dim">No depictable structure.</span>';
    });
}

/* --------------------------------------------------------------- 3D view */

async function render3D(panel, entity) {
  const compound = entity.kind === "compound" ? entity : entity.compound;
  if (!compound) {
    panel.innerHTML = empty("No chemical structure is linked to this entity.", "⬢");
    return;
  }

  const chemistry = await api.compoundChemistry(compound.id);
  const provenance = chemistry.conformer || {};

  panel.innerHTML = `
    ${structureBanner(provenance)}
    ${
      chemistry.conformer_note
        ? `<div class="small dim mb">${esc(chemistry.conformer_note)}</div>`
        : ""
    }
    <div class="viewer-toolbar">
      <span class="small dim">Style:</span>
      <button class="sm" data-style="stick">Stick</button>
      <button class="sm" data-style="ball">Ball &amp; stick</button>
      <button class="sm" data-style="sphere">Space-filling</button>
      <button class="sm" data-style="line">Line</button>
      <button class="sm" data-style="surface">Surface</button>
      <span style="width:12px"></span>
      <button class="sm" id="labels">Atom labels</button>
      <button class="sm" id="measure">Measure distance</button>
      <button class="sm" id="reset">Reset</button>
    </div>
    <div class="viewer viewer-tall" id="mol3d">
      <div class="viewer-loading">Loading 3D conformer…</div>
      <div class="viewer-overlay" id="mol-info">
        Drag to rotate · scroll to zoom · right-drag to pan
      </div>
    </div>
    ${
      (chemistry.functional_groups || []).length
        ? card(
            "Highlight a functional group",
            (chemistry.functional_groups || [])
              .map(
                (g, i) =>
                  `<span class="chip clickable" data-fg="${i}" title="${esc(g.smarts)}">${esc(
                    g.name
                  )}</span>`
              )
              .join("") +
              `<button class="sm" id="clear-fg" style="margin-left:8px">Clear</button>`
          )
        : ""
    }`;

  const host = panel.querySelector("#mol3d");
  const info = panel.querySelector("#mol-info");
  const viewer = new MoleculeViewer(host);

  try {
    await viewer.loadSdf(api.compoundSdfUrl(compound.id));
  } catch {
    host.innerHTML =
      '<div class="viewer-loading">No 3D conformer is stored for this compound.</div>';
    return;
  }

  viewer.onAtomPick = (atom) => {
    info.innerHTML = `Atom <strong>${esc(atom.elem)}${atom.serial}</strong> ·
      x ${atom.x.toFixed(2)} y ${atom.y.toFixed(2)} z ${atom.z.toFixed(2)} ·
      bonds: ${atom.bonds ? atom.bonds.length : "—"}`;
  };
  viewer.onMeasure = (distance, a, b) => {
    info.innerHTML = `Distance <strong>${distance.toFixed(3)} Å</strong>
      between ${esc(a.elem)}${a.serial} and ${esc(b.elem)}${b.serial}`;
  };

  panel.querySelectorAll("[data-style]").forEach((button) =>
    button.addEventListener("click", () => viewer.setStyleMode(button.dataset.style))
  );
  panel.querySelector("#labels").addEventListener("click", (e) => {
    e.target.classList.toggle("primary", viewer.toggleLabels());
  });
  panel.querySelector("#measure").addEventListener("click", (e) => {
    const on = viewer.toggleMeasure();
    e.target.classList.toggle("primary", on);
    info.textContent = on
      ? "Measure mode: click two atoms to measure the distance between them."
      : "Drag to rotate · scroll to zoom · right-drag to pan";
  });
  panel.querySelector("#reset").addEventListener("click", () => viewer.reset());

  panel.querySelectorAll("[data-fg]").forEach((chip) =>
    chip.addEventListener("click", () => {
      const group = chemistry.functional_groups[Number(chip.dataset.fg)];
      viewer.clearHighlights();
      viewer.highlightAtoms(group.atom_indices.flat());
      info.innerHTML = `Highlighted <strong>${esc(group.name)}</strong> —
        matched by SMARTS <span class="mono">${esc(group.smarts)}</span>`;
    })
  );
  panel.querySelector("#clear-fg")?.addEventListener("click", () => {
    viewer.clearHighlights();
  });
}

/* -------------------------------------------------------------- targets */

function renderTargets(panel, entity) {
  const targets = (entity.relationships || []).filter((r) => r.predicate === "TARGETS");
  if (!targets.length) {
    panel.innerHTML = empty("No curated molecular target was retrieved for this drug.");
    return;
  }

  panel.innerHTML = targets
    .map(
      (t) => `
      <section class="card">
        <div class="row-between" style="margin-bottom:9px">
          <div class="row">
            ${kindBadge("target")}
            <strong>${entityLink(t.node)}</strong>
            ${
              t.qualifiers.action_type
                ? `<span class="chip">${esc(t.qualifiers.action_type)}</span>`
                : ""
            }
          </div>
          ${evidenceBadge(t.evidence)}
        </div>
        ${t.statement ? `<p style="margin:0 0 9px">${esc(t.statement)}</p>` : ""}
        <div class="row small dim">
          ${
            t.qualifiers.direct_interaction
              ? "<span>Direct molecular interaction</span>"
              : "<span>Interaction not flagged as direct</span>"
          }
          <span>·</span>
          <span>${t.source_count} source record(s)</span>
        </div>
        <details style="margin-top:9px">
          <summary class="small muted clickable">Show source records</summary>
          <div style="margin-top:9px">${provenanceList(t.provenance)}</div>
        </details>
      </section>`
    )
    .join("");
}

/* ---------------------------------------------------------- pharmacology */

function renderPharmacology(panel, entity) {
  const groups = entity.activities || [];
  if (!groups.length) {
    panel.innerHTML = empty(
      "No quantitative bioactivity measurements were retrieved for this compound."
    );
    return;
  }

  panel.innerHTML = `
    ${notice(
      `Measurements are grouped by target <em>and</em> measure type. Ki, Kd,
       IC50, and EC50 are different quantities determined under different
       conditions — they are never merged into a single ranking, and values
       from different assays or species are not directly comparable even within
       one measure type.`,
      "info",
      "📐"
    )}
    ${groups
      .map(
        (group) => `
        <section class="card">
          <div class="row-between" style="margin-bottom:10px">
            <div class="row">
              <strong class="mono">${esc(group.measure_type)}</strong>
              <span class="dim">vs</span>
              ${group.target ? entityLink(group.target) : '<span class="dim">unspecified target</span>'}
            </div>
            <span class="small dim">${group.count} measurement(s)</span>
          </div>
          <div class="table-scroll" style="max-height:340px">
            <table>
              <thead><tr>
                <th>Value</th><th>Assay</th><th>Organism</th><th>Source</th>
              </tr></thead>
              <tbody>
                ${group.measurements
                  .map(
                    (m) => `
                    <tr>
                      <td class="mono nowrap"><strong>${fmt.measure(
                        m.value,
                        m.units,
                        m.relation
                      )}</strong>${
                        m.p_standard
                          ? `<div class="small dim">p${esc(
                              group.measure_type
                            )} ${m.p_standard}</div>`
                          : ""
                      }</td>
                      <td class="small">${
                        m.assay_description
                          ? esc(m.assay_description.slice(0, 190))
                          : '<span class="dim">Not described</span>'
                      }
                        ${
                          m.assay_id
                            ? `<div class="mono small dim">${esc(m.assay_id)}</div>`
                            : ""
                        }
                      </td>
                      <td class="small">${
                        m.organism
                          ? esc(m.organism)
                          : '<span class="dim">Not stated</span>'
                      }</td>
                      <td class="small">${
                        m.provenance?.url
                          ? `<a href="${esc(m.provenance.url)}" target="_blank" rel="noopener">${esc(
                              m.provenance.source_name || "source"
                            )}</a>`
                          : '<span class="dim">—</span>'
                      }</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>`
      )
      .join("")}`;
}

/* -------------------------------------------------------- clinical / safety */

function renderClinicalUses(panel, entity) {
  const approvals = entity.approvals || [];
  const uses = (entity.relationships || []).filter((r) =>
    ["APPROVED_FOR", "INVESTIGATED_FOR", "OFF_LABEL_USE_IN", "FAILED_FOR"].includes(
      r.predicate
    )
  );

  panel.innerHTML = `
    ${card(
      "Regulatory records",
      approvals.length
        ? `<table>
             <thead><tr><th>Jurisdiction</th><th>Status</th><th>Application</th><th>Sponsor</th><th>First approval</th></tr></thead>
             <tbody>${approvals
               .map(
                 (a) => `
                 <tr>
                   <td><strong>${esc(a.jurisdiction)}</strong></td>
                   <td>${esc(a.status)}</td>
                   <td class="mono small">${esc(a.application_number || "—")}</td>
                   <td class="small">${esc(a.sponsor || "—")}</td>
                   <td class="small">${esc(a.approval_date || "—")}</td>
                 </tr>`
               )
               .join("")}</tbody>
           </table>
           ${notice(
             `Regulatory records are retrieved from the regulator's own dataset.
              They establish that a product is approved; for the exact approved
              wording of an indication, consult the product label.`,
             "muted",
             "🏛"
           )}`
        : `<div class="gap-note">
             No regulatory approval record was retrieved for this drug. That is
             not evidence of non-approval — it means no matching record was
             found in the sources currently ingested.
           </div>`
    )}
    ${card(
      "Disease relationships",
      uses.length
        ? uses
            .map(
              (u) => `
              <div class="entity-row" data-nav="#/entity/${u.node.id}">
                <div class="body">
                  <div class="name">${esc(u.node.name)}</div>
                  <div class="meta">
                    ${esc(u.predicate.replace(/_/g, " ").toLowerCase())}
                    ${
                      u.qualifiers.max_phase_for_indication
                        ? ` · max phase ${u.qualifiers.max_phase_for_indication}`
                        : ""
                    }
                    ${
                      u.qualifiers.max_clinical_stage
                        ? ` · ${esc(String(u.qualifiers.max_clinical_stage).replace(/_/g, " ").toLowerCase())}`
                        : ""
                    }
                  </div>
                  ${
                    u.qualifiers.approval_basis
                      ? `<div class="small dim" style="margin-top:4px">${esc(
                          u.qualifiers.approval_basis
                        )}</div>`
                      : ""
                  }
                </div>
                <div class="right">${evidenceBadge(u.evidence)}</div>
              </div>`
            )
            .join("")
        : '<span class="dim">No disease relationship was retrieved.</span>'
    )}`;
  wireNav(panel);
}

function renderSafety(panel, entity) {
  const label = (entity.attributes || {}).fda_label || {};
  const source = (entity.attributes || {}).fda_label_source;
  const detail = entity.detail || {};

  const section = (title, text) =>
    text
      ? card(
          title,
          `<div style="white-space:pre-wrap;font-size:13px;max-height:420px;overflow:auto">${esc(
            text
          )}</div>`
        )
      : "";

  const hasLabel = Object.keys(label).length > 0;

  panel.innerHTML = `
    ${
      detail.black_box_warning
        ? notice(
            "This product carries a boxed warning according to its ChEMBL record.",
            "danger",
            "⚠"
          )
        : ""
    }
    ${
      detail.withdrawn
        ? notice(
            `Recorded as withdrawn. ${esc(detail.withdrawn_reason || "")}`,
            "danger",
            "⛔"
          )
        : ""
    }
    ${
      hasLabel
        ? notice(
            `The text below is reproduced verbatim from the US structured
             product label. It is regulatory text, not a summary written by
             this platform.
             ${
               source
                 ? ` <a href="${esc(source)}" target="_blank" rel="noopener">View the full label ↗</a>`
                 : ""
             }`,
            "info",
            "📋"
          )
        : `<div class="gap-note">
             No product-label text was retrieved for this drug. Safety
             information is therefore not available here; consult the approved
             label.
           </div>`
    }
    ${section("Boxed warning", label.boxed_warning)}
    ${section("Indications and usage", label.indications_and_usage)}
    ${section("Contraindications", label.contraindications)}
    ${section("Warnings and precautions", label.warnings_and_cautions)}
    ${section("Adverse reactions", label.adverse_reactions)}
    ${section("Drug interactions", label.drug_interactions)}`;
}

function renderMechanismTab(panel, entity) {
  panel.innerHTML = `<div class="row-between mb">
      <span class="muted">The full cascade with evidence at each stage.</span>
      <a class="btn sm" href="#/mechanism/${entity.id}">Open mechanism explorer →</a>
    </div><div id="mech">${loading()}</div>`;

  import("./mechanism.js").then((module) =>
    module.renderCascadeInto(panel.querySelector("#mech"), entity.id)
  );
}

/* --------------------------------------------------------------- disease */

function renderDiseaseBiology(panel, entity) {
  const associations = (entity.relationships || []).filter(
    (r) => r.predicate === "ASSOCIATED_WITH"
  );
  if (!associations.length) {
    panel.innerHTML = empty("No target associations were retrieved for this disease.");
    return;
  }

  panel.innerHTML = `
    ${notice(
      `These are <strong>associations</strong>, aggregated by Open Targets from
       genetic, clinical, animal-model, and text-mined evidence. An association
       is not a demonstrated causal mechanism, and the evidence composition
       behind each one is shown below.`,
      "info",
      "🧬"
    )}
    <div class="card card-flush">
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Target</th><th>Evidence</th><th>Score</th><th>Evidence composition</th>
          </tr></thead>
          <tbody>
            ${associations
              .map((a) => {
                const scores = a.qualifiers.datatype_scores || {};
                const chips = Object.entries(scores)
                  .sort((x, y) => y[1] - x[1])
                  .map(
                    ([key, value]) =>
                      `<span class="chip" title="${esc(key)} evidence score">${esc(
                        key.replace(/_/g, " ")
                      )} ${Number(value).toFixed(2)}</span>`
                  )
                  .join("");
                return `<tr>
                  <td><strong>${entityLink(a.node)}</strong></td>
                  <td>${evidenceBadge(a.evidence)}</td>
                  <td class="mono">${
                    a.qualifiers.overall_score
                      ? Number(a.qualifiers.overall_score).toFixed(3)
                      : "—"
                  }</td>
                  <td>${chips || '<span class="dim">—</span>'}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderTreatments(panel, entity) {
  const treatments = (entity.relationships || []).filter((r) =>
    ["APPROVED_FOR", "INVESTIGATED_FOR", "OFF_LABEL_USE_IN", "FAILED_FOR"].includes(
      r.predicate
    )
  );
  if (!treatments.length) {
    panel.innerHTML = empty("No therapeutic relationships were retrieved.");
    return;
  }

  const groups = {
    APPROVED_FOR: { label: "Approved", items: [] },
    OFF_LABEL_USE_IN: { label: "Off-label use", items: [] },
    INVESTIGATED_FOR: { label: "Investigational", items: [] },
    FAILED_FOR: { label: "Failed or discontinued", items: [] },
  };
  treatments.forEach((t) => groups[t.predicate]?.items.push(t));

  panel.innerHTML = Object.values(groups)
    .filter((g) => g.items.length)
    .map((g) =>
      card(
        `${esc(g.label)} <span class="dim">(${g.items.length})</span>`,
        g.items
          .map(
            (t) => `
            <div class="entity-row" data-nav="#/entity/${t.node.id}">
              ${kindBadge(t.node.kind)}
              <div class="body">
                <div class="name">${esc(t.node.name)}</div>
                <div class="meta">${esc(t.node.subtitle || "")}</div>
              </div>
              <div class="right">${evidenceBadge(t.evidence)}</div>
            </div>`
          )
          .join("")
      )
    )
    .join("") +
    notice(
      `"Investigational" means the therapy has been studied clinically for this
       disease. It is not an approval and does not imply demonstrated benefit.`,
      "muted",
      "ℹ"
    );
  wireNav(panel);
}

async function renderDiseasePathways(panel, entity) {
  panel.innerHTML = loading("Assembling pathway map…");
  const map = await api.diseaseMechanism(entity.id);
  if (!map.targets.length) {
    panel.innerHTML = empty("No target-pathway links were retrieved.");
    return;
  }

  panel.innerHTML = map.targets
    .filter((t) => t.pathways.length)
    .map(
      (t) => `
      <section class="card">
        <div class="row-between" style="margin-bottom:9px">
          <strong>${entityLink(t.target)}</strong>
          ${evidenceBadge(t.association.evidence)}
        </div>
        <div>${t.pathways
          .map(
            (p) =>
              `<span class="chip clickable" data-nav="#/entity/${p.id}">${esc(p.name)}</span>`
          )
          .join("")}</div>
      </section>`
    )
    .join("") ||
    empty("No pathway memberships were retrieved for the associated targets.");
  wireNav(panel);
}

function renderRegions(panel) {
  panel.innerHTML = `
    ${notice(
      `Regional involvement is only shown where a source record states it.
       This platform does not infer which brain regions a disease affects, so
       an empty list here means no such record was ingested — not that no
       region is involved.`,
      "warn",
      "🧠"
    )}
    ${empty(
      "No region-level association records are present in the current ingestion set.",
      "🧠"
    )}
    <div class="row" style="justify-content:center">
      <a class="btn" href="#/brain">Open the 3D brain viewer</a>
    </div>`;
}

function renderTrials(panel, entity) {
  const trials = entity.trials || [];
  if (!trials.length) {
    panel.innerHTML = empty("No registered trials were retrieved for this disease.");
    return;
  }
  panel.innerHTML = `
    ${notice(
      `Registration records a study's existence and design. It does not report
       results and does not demonstrate efficacy.`,
      "muted",
      "🔬"
    )}
    <div class="card card-flush"><div class="table-scroll">
      <table>
        <thead><tr><th>NCT</th><th>Title</th><th>Phase</th><th>Status</th><th>N</th><th>Design</th></tr></thead>
        <tbody>${trials
          .map(
            (t) => `
            <tr>
              <td class="mono small"><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(
                t.nct_id
              )}</a></td>
              <td class="small">${esc(t.title)}</td>
              <td class="small nowrap">${esc(t.phase || "—")}</td>
              <td class="small nowrap">${esc(t.status || "—")}</td>
              <td class="mono small">${t.enrollment ?? "—"}${
                t.enrollment_type === "ESTIMATED" ? '<span class="dim"> est</span>' : ""
              }</td>
              <td class="small">${esc(
                [t.allocation, t.masking].filter(Boolean).join(" · ") || "—"
              )}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>
    </div></div>`;
}

/* ---------------------------------------------------------------- target */

function renderProtein(panel, entity) {
  const detail = entity.detail || {};
  const functions = detail.function_comments || [];
  const features = detail.features || [];
  const locations = detail.subcellular_locations || [];
  const go = detail.go_terms || [];

  panel.innerHTML = `
    ${card(
      "Function",
      functions.length
        ? functions
            .map(
              (f) => `
              <div style="margin-bottom:12px">
                <p style="margin:0 0 5px">${esc(f.text)}</p>
                <div class="row small dim">
                  ${evidenceBadge({
                    tone: f.evidence_level,
                    label: f.evidence_level,
                    description: `UniProt evidence codes: ${(f.eco_codes || []).join(", ")}`,
                  })}
                  ${
                    (f.pmids || []).length
                      ? `<span>· cited in ${f.pmids
                          .map(
                            (p) =>
                              `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(
                                p
                              )}/" target="_blank" rel="noopener">PMID ${esc(p)}</a>`
                          )
                          .join(", ")}</span>`
                      : ""
                  }
                </div>
              </div>`
            )
            .join("")
        : '<span class="dim">No function annotation was retrieved.</span>'
    )}
    <div class="grid grid-2">
      ${card(
        "Subcellular location",
        locations.length
          ? locations.map((l) => `<span class="chip">${esc(l.location)}</span>`).join("")
          : '<span class="dim">Not recorded</span>'
      )}
      ${card(
        "Sequence",
        detail.sequence
          ? `<div class="mono small" style="word-break:break-all;max-height:170px;overflow:auto;line-height:1.7">${esc(
              detail.sequence
            )}</div>
             <div class="small dim mt">${fmt.num(detail.sequence_length)} residues · ${fmt.num(
              detail.mass_da
            )} Da</div>`
          : '<span class="dim">No sequence retrieved</span>'
      )}
    </div>
    ${card(
      `Sequence features <span class="dim">(${features.length})</span>`,
      features.length
        ? `<div class="table-scroll" style="max-height:330px"><table>
             <thead><tr><th>Type</th><th>Position</th><th>Description</th><th>Ligand</th></tr></thead>
             <tbody>${features
               .map(
                 (f) => `<tr>
                   <td class="small nowrap">${esc(f.type)}</td>
                   <td class="mono small">${f.start ?? "—"}${
                     f.end && f.end !== f.start ? `–${f.end}` : ""
                   }</td>
                   <td class="small">${esc(f.description || "—")}</td>
                   <td class="small">${esc(f.ligand || "—")}</td>
                 </tr>`
               )
               .join("")}</tbody>
           </table></div>`
        : '<span class="dim">No features retrieved</span>'
    )}
    ${card(
      `Gene Ontology <span class="dim">(${go.length})</span>`,
      go.length
        ? go
            .slice(0, 60)
            .map(
              (g) =>
                `<span class="chip" title="${esc(g.id)} · evidence ${esc(
                  g.evidence_code || "?"
                )}">${esc(g.aspect || "")}${g.aspect ? ":" : ""} ${esc(g.term)}</span>`
            )
            .join("")
        : '<span class="dim">No GO annotations retrieved</span>'
    )}`;
}

async function renderStructures(panel, entity) {
  const structures = (entity.relationships || []).filter(
    (r) => r.predicate === "HAS_STRUCTURE"
  );
  if (!structures.length) {
    panel.innerHTML = empty("No experimental structures were retrieved for this target.");
    return;
  }

  panel.innerHTML = `
    <div class="row mb">
      <span class="muted">Select a structure:</span>
      <select id="struct-select">
        ${structures
          .map(
            (s) =>
              `<option value="${s.node.id}" data-pdb="${esc(
                s.qualifiers.method || ""
              )}">${esc(s.node.name.slice(0, 90))}</option>`
          )
          .join("")}
      </select>
    </div>
    <div id="struct-host">${loading()}</div>`;

  const select = panel.querySelector("#struct-select");
  const host = panel.querySelector("#struct-host");

  const show = async (nodeId) => {
    host.innerHTML = loading("Loading structure…");
    const structure = await api.entity(nodeId);
    host.innerHTML = "";
    await renderStructureViewer(host, structure);
  };

  select.addEventListener("change", () => show(Number(select.value)));
  await show(Number(select.value));
}

async function renderStructureViewer(panel, entity) {
  const detail = entity.detail || {};
  const provenance = entity.structure_provenance || {};
  const citation = detail.citation || {};

  panel.innerHTML = `
    ${structureBanner(provenance)}
    <div class="viewer-toolbar">
      <span class="small dim">Style:</span>
      <button class="sm" data-style="cartoon">Cartoon</button>
      <button class="sm" data-style="chain">By chain</button>
      <button class="sm" data-style="stick">Stick</button>
      <button class="sm" data-style="sphere">Space-filling</button>
      <span style="width:12px"></span>
      <button class="sm" id="ligand">Toggle ligands</button>
      <button class="sm" id="surface">Surface</button>
      <button class="sm" id="pocket">Focus binding site</button>
      <button class="sm" id="reset">Reset</button>
    </div>
    <div class="viewer viewer-tall" id="struct3d">
      <div class="viewer-loading">Loading coordinates from RCSB…</div>
      <div class="viewer-overlay" id="struct-info"></div>
    </div>
    <div class="grid grid-2 mt">
      ${card(
        "Experimental detail",
        `<dl class="kv">
           <dt>PDB ID</dt><dd class="mono">
             <a href="https://www.rcsb.org/structure/${esc(detail.pdb_id || "")}"
                target="_blank" rel="noopener">${esc(detail.pdb_id || "—")}</a></dd>
           <dt>Method</dt><dd>${fmt.orUnknown(detail.experimental_method)}</dd>
           <dt>Resolution</dt><dd>${
             detail.resolution_angstrom
               ? `${detail.resolution_angstrom.toFixed(2)} Å`
               : '<span class="dim">Not applicable / not reported</span>'
           }</dd>
           <dt>R-free</dt><dd>${
             detail.r_free ? detail.r_free.toFixed(3) : '<span class="dim">—</span>'
           }</dd>
           <dt>Released</dt><dd>${fmt.date(detail.release_date)}</dd>
           <dt>Bound ligands</dt><dd>${
             (detail.ligand_ids || []).length
               ? detail.ligand_ids
                   .map(
                     (l) =>
                       `<span class="chip" title="${esc(l.formula || "")}"><span class="mono">${esc(
                         l.id
                       )}</span> ${esc((l.name || "").slice(0, 40))}</span>`
                   )
                   .join("")
               : '<span class="dim">None reported</span>'
           }</dd>
         </dl>`
      )}
      ${card(
        "Primary citation",
        citation.title
          ? `<div style="font-weight:560;margin-bottom:5px">${esc(citation.title)}</div>
             <div class="small dim">${esc(citation.journal || "")} ${
              citation.year ? `· ${citation.year}` : ""
            }</div>
             <div class="mt">
               ${
                 citation.pmid
                   ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(
                       citation.pmid
                     )}/" target="_blank" rel="noopener">PMID ${esc(citation.pmid)}</a>`
                   : ""
               }
               ${
                 citation.doi
                   ? ` · <a href="https://doi.org/${esc(citation.doi)}" target="_blank" rel="noopener">doi</a>`
                   : ""
               }
             </div>`
          : '<span class="dim">No primary citation recorded</span>'
      )}
    </div>`;

  const host = panel.querySelector("#struct3d");
  const info = panel.querySelector("#struct-info");
  const viewer = new StructureViewer(host);

  if (!detail.pdb_id) {
    host.innerHTML = '<div class="viewer-loading">No PDB identifier recorded.</div>';
    return;
  }

  try {
    await viewer.load(detail.pdb_id, detail.ligand_ids || []);
    info.textContent = `${detail.pdb_id} · drag to rotate, scroll to zoom`;
  } catch (error) {
    host.innerHTML = `<div class="viewer-loading">Could not load coordinates (${esc(
      error.message
    )}).</div>`;
    return;
  }

  panel.querySelectorAll("[data-style]").forEach((button) =>
    button.addEventListener("click", () => viewer.setStyleMode(button.dataset.style))
  );
  panel.querySelector("#ligand").addEventListener("click", (e) =>
    e.target.classList.toggle("primary", viewer.toggleLigand())
  );
  panel.querySelector("#surface").addEventListener("click", (e) =>
    e.target.classList.toggle("primary", viewer.toggleSurface())
  );
  panel.querySelector("#pocket").addEventListener("click", () => {
    const ok = viewer.focusBindingSite();
    info.textContent = ok
      ? "Binding site: residues within 5 Å of the bound ligand are shown as sticks. This is the observed crystallographic environment, not a predicted pose."
      : "No bound ligand is present in this structure.";
  });
  panel.querySelector("#reset").addEventListener("click", () => viewer.reset());
}

function renderLigands(panel, entity) {
  const ligands = (entity.relationships || []).filter(
    (r) => r.predicate === "TARGETS" && r.direction === "in"
  );
  panel.innerHTML = ligands.length
    ? ligands
        .map((l) =>
          entityRow(
            l.node,
            `${
              l.qualifiers.action_type
                ? `<span class="chip">${esc(l.qualifiers.action_type)}</span>`
                : ""
            } ${evidenceBadge(l.evidence)}`
          )
        )
        .join("")
    : empty("No drugs targeting this protein were retrieved.");
  wireNav(panel);
}

function renderPathways(panel, entity) {
  const pathways = (entity.relationships || []).filter(
    (r) => r.predicate === "PARTICIPATES_IN"
  );
  panel.innerHTML = pathways.length
    ? pathways.map((p) => entityRow(p.node, evidenceBadge(p.evidence))).join("")
    : empty("No pathway memberships were retrieved.");
  wireNav(panel);
}

function renderTargetDiseases(panel, entity) {
  const diseases = (entity.relationships || []).filter(
    (r) => r.predicate === "ASSOCIATED_WITH"
  );
  panel.innerHTML = diseases.length
    ? diseases
        .map((d) =>
          entityRow(
            d.node,
            `${
              d.qualifiers.overall_score
                ? `<span class="mono small dim">${Number(d.qualifiers.overall_score).toFixed(
                    3
                  )}</span> `
                : ""
            }${evidenceBadge(d.evidence)}`
          )
        )
        .join("")
    : empty("No disease associations were retrieved.");
  wireNav(panel);
}

function renderPathwayMembers(panel, entity) {
  const members = (entity.relationships || []).filter(
    (r) => r.predicate === "PARTICIPATES_IN"
  );
  panel.innerHTML = `
    ${
      entity.detail?.summary
        ? card(
            "Reactome summary",
            `<p style="margin:0">${esc(entity.detail.summary)}</p>
             <div class="small dim mt">Text supplied verbatim by Reactome.</div>`
          )
        : ""
    }
    ${
      members.length
        ? card(
            `Participating proteins <span class="dim">(${members.length})</span>`,
            members.map((m) => entityRow(m.node, evidenceBadge(m.evidence))).join("")
          )
        : empty("No participants retrieved.")
    }`;
  wireNav(panel);
}

/* --------------------------------------------------- relationships/evidence */

function renderRelationships(panel, entity) {
  const relationships = entity.relationships || [];
  if (!relationships.length) {
    panel.innerHTML = empty("This entity has no recorded relationships.");
    return;
  }

  const grouped = {};
  relationships.forEach((r) => {
    (grouped[r.predicate] ||= []).push(r);
  });

  panel.innerHTML = Object.entries(grouped)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([predicate, items]) =>
      card(
        `${esc(predicate.replace(/_/g, " "))} <span class="dim">(${items.length})</span>`,
        items
          .map(
            (r) => `
            <div class="entity-row" data-nav="#/entity/${r.node.id}">
              ${kindBadge(r.node.kind)}
              <div class="body">
                <div class="name">${
                  r.direction === "in" ? "← " : ""
                }${esc(r.node.name)}</div>
                <div class="meta">${esc(r.statement || r.node.subtitle || "")}</div>
              </div>
              <div class="right">${evidenceBadge(r.evidence)}
                <div class="small dim">${r.source_count || 0} source(s)</div>
              </div>
            </div>`
          )
          .join("")
      )
    )
    .join("");
  wireNav(panel);
}

function renderEvidence(panel, entity) {
  const publications = entity.publications || [];

  panel.innerHTML = `
    ${card(
      "Provenance for this record",
      provenanceList(entity.provenance)
    )}
    ${card(
      `Literature <span class="dim">(${publications.length})</span>`,
      publications.length
        ? publications
            .map(
              (p) => `
              <div class="pub-item">
                <div class="title">${esc(p.title)}</div>
                <div class="meta">
                  <span>${esc(p.journal || "—")}</span>
                  <span>${p.year || "—"}</span>
                  ${p.study_design ? `<span class="chip">${esc(p.study_design)}</span>` : ""}
                  ${
                    p.species_context && p.species_context !== "unknown"
                      ? `<span class="chip">${esc(p.species_context)}</span>`
                      : ""
                  }
                  <a href="${esc(p.url)}" target="_blank" rel="noopener">PMID ${esc(p.pmid)}</a>
                  ${
                    p.doi
                      ? `<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">doi</a>`
                      : ""
                  }
                </div>
                <div class="small dim" style="margin-top:4px">
                  ${esc((p.authors || []).slice(0, 6).join(", "))}${
                (p.authors || []).length > 6 ? " et al." : ""
              }
                </div>
                ${
                  p.abstract
                    ? `<div class="abstract clickable" title="Click to expand">${esc(
                        p.abstract
                      )}</div>`
                    : ""
                }
              </div>`
            )
            .join("")
        : `<div class="gap-note">
             No publications were retrieved for this entity. Citations appear
             here only when a PubMed record was actually fetched — they are
             never generated.
           </div>`
    )}
    ${
      (entity.relationships || []).length
        ? card(
            "Relationship sources",
            (entity.relationships || [])
              .filter((r) => (r.provenance || []).length)
              .slice(0, 40)
              .map(
                (r) => `
                <details style="margin-bottom:9px">
                  <summary class="clickable">
                    <span class="small">${esc(r.predicate.replace(/_/g, " "))} →
                    <strong>${esc(r.node.name)}</strong></span>
                    ${evidenceBadge(r.evidence)}
                  </summary>
                  <div style="margin-top:9px">${provenanceList(r.provenance, {
                    compact: true,
                  })}</div>
                </details>`
              )
              .join("")
          )
        : ""
    }`;

  panel.querySelectorAll(".abstract").forEach((node) =>
    node.addEventListener("click", () => node.classList.toggle("open"))
  );
}

/* --------------------------------------------------------------- helpers */

export function wireNav(scope) {
  scope.querySelectorAll("[data-nav]").forEach((node) => {
    if (node.dataset.navWired) return;
    node.dataset.navWired = "1";
    node.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      window.location.hash = node.dataset.nav;
    });
  });
}

const PLURALS = {
  disease: "diseases",
  drug: "drugs",
  compound: "molecules",
  target: "targets",
  gene: "targets",
  pathway: "pathways",
  structure: "structures",
  trial: "trials",
  publication: "publications",
  brain_region: "brain",
  cell_type: "cells",
};

const pluralFor = (kind) => PLURALS[kind] || "search";
const pluralLabel = (kind) => {
  const value = pluralFor(kind);
  return value.charAt(0).toUpperCase() + value.slice(1);
};
