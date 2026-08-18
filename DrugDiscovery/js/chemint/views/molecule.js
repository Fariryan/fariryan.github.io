/**
 * The molecule dossier.
 *
 * Everything the fabric holds about one substance, in the order a reader
 * needs it: what it is, what it looks like, what it does, what it is used
 * for, what has been measured, and where every one of those came from.
 *
 * Two presentation rules are load-bearing here.
 *
 * The **salt banner** sits above the properties, not below them. When a record
 * is a salt form, its molecular weight is the salt's, and a reader comparing
 * that number against a literature value for the free base will conclude the
 * fabric is wrong. Saying so first costs one line and prevents that entirely.
 *
 * **Measured and computed properties are never interleaved.** They are shown
 * in separate groups with the method on each, because a clogP and a
 * shake-flask logP disagree by design and merging them would be choosing one
 * on the reader's behalf.
 */

import { esc, loading, notice, tabs } from "../../ui.js";
import { MoleculeViewer, viewerToolbar } from "../../viewer-molecule.js";
import { chemApi } from "../api.js";
import { areaLabels, needsSubject, subject } from "../router.js";
import {
  areaPills,
  bindCopy,
  caveat,
  classBadge,
  copyable,
  field,
  measure,
  mono,
  neighborBadge,
  provenanceCard,
} from "../ui.js";

export async function moleculeView(root, params) {
  const entityId = params?.get("entity") || subject.get()?.entity_id;
  if (!entityId) {
    root.innerHTML = needsSubject("the molecule dossier");
    return;
  }

  root.innerHTML = loading("Assembling the dossier…");

  const [dossier, labels] = await Promise.all([
    chemApi.substance(Number(entityId)),
    areaLabels(),
  ]);

  const { entity, identity, clinical } = dossier;

  root.innerHTML = `
    <div class="ci-mol-head">
      <div class="ci-mol-title">
        <h3>${esc(entity.name)}</h3>
        <div class="ci-mol-sub">
          ${
            identity
              ? neighborBadge({
                  class: identity.class,
                  class_tone: identity.class_display?.tone || identity.class,
                  class_label: identity.class_display?.label || identity.class,
                  class_description: identity.class_display?.description,
                })
              : ""
          }
          <span class="ci-kind">${esc(
            (identity?.substance_kind || entity.entity_type).replace(/_/g, " ")
          )}</span>
        </div>
        <div class="ci-mol-areas">${areaPills(entity.therapeutic_areas, labels, {
          limit: 6,
          approved: entity.attributes?.approved_areas || [],
        })}</div>
        ${
          entity.attributes?.indication_counts
            ? `<div class="ci-mol-indcount dim small">
                 ${entity.attributes.indication_counts.approved} approved
                 indication(s), ${entity.attributes.indication_counts.studied}
                 further studied. Areas are ordered by how many indications
                 support each; approved areas are marked.
               </div>`
            : ""
        }
      </div>
      <div class="spacer"></div>
      <div class="ci-mol-actions">
        <a class="sm" href="#/chemint/neighborhood?entity=${entity.entity_id}">Neighborhood</a>
        <a class="sm" href="#/chemint/scaffolds?entity=${entity.entity_id}">Scaffold family</a>
        <a class="sm" href="#/chemint/evidence?entity=${entity.entity_id}">Evidence</a>
      </div>
    </div>

    ${
      identity?.salt?.is_salt
        ? `<div class="ci-banner ci-banner-salt">
             <span class="ico">⚗</span>
             <div>
               <strong>This record is a salt form${
                 identity.salt.component
                   ? ` (${esc(identity.salt.component)})`
                   : ""
               }.</strong>
               The molecular weight below is the salt's, not the free base's.
               ${
                 identity.salt.parent
                   ? `The parent molecular entity is
                      <a href="#/chemint/molecule?entity=${identity.salt.parent.entity_id}">${esc(
                       identity.salt.parent.name
                     )}</a>.`
                   : "No parent entity has been linked yet."
               }
             </div>
           </div>`
        : ""
    }

    ${
      identity && identity.stereochemistry?.undefined > 0
        ? `<div class="ci-banner ci-banner-stereo">
             <span class="ico">◑</span>
             <div>
               <strong>Stereochemistry is not fully specified.</strong>
               ${identity.stereochemistry.undefined} centre(s) are undefined,
               so this record describes a stereochemically unspecified
               structure rather than a single isomer.
             </div>
           </div>`
        : ""
    }

    ${
      identity && !identity.structure_valid
        ? `<div class="ci-banner ci-banner-warn">
             <span class="ico">⚠</span>
             <div>
               <strong>No usable structure.</strong>
               ${esc(identity.structure_note || "The supplied structure could not be parsed.")}
               The record is kept because a source reported this substance;
               nothing has been guessed in place of the missing structure.
             </div>
           </div>`
        : ""
    }

    ${
      dossier.quality_issues?.length
        ? `<div class="ci-banner ci-banner-quality">
             <span class="ico">◉</span>
             <div>
               <strong>Recorded data-quality findings.</strong>
               <ul>${dossier.quality_issues
                 .map(
                   (issue) =>
                     `<li><span class="mono">${esc(issue.code)}</span> — ${esc(
                       issue.message
                     )}</li>`
                 )
                 .join("")}</ul>
               These are reported, not corrected: a disagreement between
               sources is itself information.
             </div>
           </div>`
        : ""
    }

    <div class="ci-mol-grid">
      <section class="card ci-structure-card">
        <h3>Structure</h3>
        <div class="ci-structure-tabs" id="ci-structure"></div>
      </section>
      <section class="card">
        <h3>Identity</h3>
        <dl class="ci-fields" id="ci-identity"></dl>
      </section>
    </div>

    <div id="ci-mol-body"></div>
  `;

  renderStructure(root.querySelector("#ci-structure"), dossier);
  renderIdentity(root.querySelector("#ci-identity"), dossier);
  renderBody(root.querySelector("#ci-mol-body"), dossier, labels);

  bindCopy(root);
}

/* --------------------------------------------------------------- structure */

function renderStructure(host, dossier) {
  const { entity, identity } = dossier;
  if (!identity || !identity.isomeric_smiles) {
    host.innerHTML = `<div class="ci-empty small">
      <div class="big">⌬</div>
      <p>No small-molecule structure.</p>
      <p class="dim">This is a ${esc(
        (identity?.substance_kind || entity.entity_type).replace(/_/g, " ")
      )}, which legitimately has none — a marketed product, a biologic, or a
      compound whose structure was never disclosed.</p>
    </div>`;
    return;
  }

  tabs(
    host,
    [{ label: "2D" }, { label: "3D" }],
    (tab, panel) => {
      if (tab.label === "2D") {
        panel.innerHTML = `
          <div class="ci-depiction">
            <img alt="2D structure of ${esc(entity.name)}"
                 src="${esc(chemApi.depictionUrl(entity.entity_id, 520, 400))}" />
          </div>
          <div class="ci-struct-note">
            Depiction generated locally by RDKit from the stored structure.
          </div>`;
        return;
      }

      panel.innerHTML = `
        <div class="struct-banner struct-computed_conformer">
          <span class="label">Computed 3D conformer</span>
          <span class="warn">One low-energy conformer generated from the 2D
            structure. It is not an experimentally observed geometry and not a
            bound pose.</span>
        </div>
        ${viewerToolbar([
          { action: "style", value: "stick", label: "Stick" },
          { action: "style", value: "ball", label: "Ball &amp; stick" },
          { action: "style", value: "sphere", label: "Spacefill" },
          { action: "style", value: "surface", label: "Surface" },
          { action: "reset", label: "Reset" },
        ])}
        <div class="ci-viewer" id="ci-viewer3d">
          <div class="viewer-loading">Generating a conformer…</div>
        </div>`;

      const container = panel.querySelector("#ci-viewer3d");
      const viewer = new MoleculeViewer(container, { computed: true });
      viewer
        .loadSdf(chemApi.conformerUrl(entity.entity_id))
        .catch((error) => {
          container.innerHTML = `<div class="viewer-loading">${esc(
            error.message
          )}</div>`;
        });

      panel.querySelectorAll("[data-action]").forEach((button) =>
        button.addEventListener("click", () => {
          if (button.dataset.action === "style") {
            viewer.setStyleMode(button.dataset.value);
          } else {
            viewer.reset();
          }
        })
      );
    },
    0
  );
}

/* ---------------------------------------------------------------- identity */

function renderIdentity(host, dossier) {
  const { identity, clinical, identifiers, synonyms } = dossier;
  if (!identity) {
    host.innerHTML = '<div class="dim">No chemical identity recorded.</div>';
    return;
  }

  const developmentNames = [
    ...(synonyms.development_code || []),
    ...(synonyms.research_code || []),
  ];

  host.innerHTML = [
    field("Molecular formula", esc(identity.molecular_formula || "")),
    field(
      "Molecular weight",
      identity.molecular_weight
        ? `${Number(identity.molecular_weight).toFixed(3)} Da`
        : null,
      identity.salt?.is_salt ? "salt form" : ""
    ),
    field(
      "Exact mass",
      identity.exact_mass ? `${Number(identity.exact_mass).toFixed(4)} Da` : null
    ),
    field("Formal charge", identity.formal_charge ?? null),
    field("Heavy atoms", identity.heavy_atom_count ?? null),
    field("InChIKey", copyable(identity.inchikey)),
    field("Isomeric SMILES", copyable(identity.isomeric_smiles)),
    field("Canonical SMILES", copyable(identity.canonical_smiles)),
    field("InChI", identity.inchi ? copyable(identity.inchi) : null),
    field(
      "Stereocentres",
      `${identity.stereochemistry.defined} defined, ${identity.stereochemistry.undefined} undefined`
    ),
    field("Murcko scaffold", mono(identity.scaffold.murcko)),
    field("Rings", `${identity.scaffold.ring_count ?? 0} (${identity.scaffold.aromatic_ring_count ?? 0} aromatic)`),
    clinical
      ? field(
          "Approval status",
          clinical.approval_status
            ? esc(clinical.approval_status)
            : null,
          clinical.max_phase !== null && clinical.max_phase !== undefined
            ? `max phase ${clinical.max_phase}`
            : ""
        )
      : "",
    clinical?.is_withdrawn
      ? field(
          "Withdrawn",
          `Yes${clinical.withdrawn_year ? ` (${clinical.withdrawn_year})` : ""}`,
          clinical.withdrawn_reason || ""
        )
      : "",
    clinical?.first_approval_year
      ? field("First approval", clinical.first_approval_year)
      : "",
    clinical?.modality ? field("Modality", esc(clinical.modality.replace(/_/g, " "))) : "",
    developmentNames.length
      ? field("Development codes", developmentNames.map(esc).join(", "))
      : "",
    (synonyms.brand || []).length
      ? field("Brand names", (synonyms.brand || []).slice(0, 14).map(esc).join(", "))
      : "",
    field(
      "Registry identifiers",
      Object.entries(identifiers || {})
        .filter(([namespace]) => namespace !== "smiles")
        .map(
          ([namespace, values]) =>
            `<span class="ci-xref"><em>${esc(namespace)}</em> ${values
              .slice(0, 3)
              .map(esc)
              .join(", ")}</span>`
        )
        .join("") || null
    ),
    field(
      "Normalised by",
      `pipeline ${esc(identity.normalization_version)}${
        identity.normalized_at
          ? ` on ${esc(identity.normalized_at.slice(0, 10))}`
          : ""
      }`
    ),
  ].join("");
}

/* -------------------------------------------------------------------- body */

function renderBody(host, dossier, labels) {
  const sections = [
    { label: "Targets & mechanisms", count: dossier.pharmacology.length },
    { label: "Indications", count: dossier.therapeutics.length },
    { label: "Measurements", count: dossier.activities.total },
    {
      label: "Properties",
      count: dossier.properties.groups.reduce(
        (sum, g) => sum + g.properties.length,
        0
      ),
    },
    { label: "Claims", count: dossier.claims.length },
    { label: "Related forms", count: dossier.chemical_relations.length + dossier.related_forms.length },
    { label: "Literature" },
    { label: "Safety" },
    { label: "Provenance", count: dossier.provenance.length },
  ];

  tabs(host, sections, async (tab, panel) => {
    switch (tab.label) {
      case "Targets & mechanisms":
        panel.innerHTML = relationTable(dossier.pharmacology, "target");
        break;
      case "Indications":
        panel.innerHTML = indicationTable(dossier.therapeutics);
        break;
      case "Measurements":
        panel.innerHTML = activityBlocks(dossier.activities);
        break;
      case "Properties":
        panel.innerHTML = propertyBlocks(dossier.properties);
        break;
      case "Claims":
        panel.innerHTML = claimList(dossier.claims);
        break;
      case "Related forms":
        panel.innerHTML = relatedForms(dossier);
        break;
      case "Literature":
        panel.innerHTML = loading("Loading literature…");
        panel.innerHTML = literatureList(
          await chemApi.literature(dossier.entity.entity_id)
        );
        break;
      case "Safety":
        panel.innerHTML = loading("Loading safety information…");
        panel.innerHTML = safetyBlocks(
          await chemApi.safety(dossier.entity.entity_id)
        );
        break;
      case "Provenance":
        panel.innerHTML = provenanceBlocks(dossier);
        break;
    }
    bindCopy(panel);
  });
}

function relationTable(rows, objectLabel) {
  if (!rows.length) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No ${esc(objectLabel)} relationships recorded yet.</p></div>`;
  }
  return `
    <table class="ci-table">
      <thead><tr>
        <th>${esc(objectLabel)}</th><th>Relation</th><th>Action</th>
        <th>Evidence</th><th>Source</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td><strong>${esc(row.object.name)}</strong>
              <div class="dim small mono">${esc(row.object.primary_id)}</div></td>
            <td>${esc(row.relation)}</td>
            <td>${esc(row.qualifiers?.action_type || "—")}</td>
            <td>${classBadge(row.evidence_class)}</td>
            <td>${(row.provenance || [])
              .slice(0, 2)
              .map(
                (p) =>
                  `<a href="${esc(p.url || "#")}" target="_blank" rel="noopener">${esc(
                    p.source
                  )}</a>`
              )
              .join(" · ")}</td>
          </tr>
          ${
            row.statement
              ? `<tr class="ci-statement"><td colspan="5">${esc(
                  row.statement
                )}</td></tr>`
              : ""
          }`
          )
          .join("")}
      </tbody>
    </table>`;
}

function indicationTable(rows) {
  if (!rows.length) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No indications recorded yet.</p></div>`;
  }

  const approved = rows.filter((r) => r.qualifiers?.approved);
  const studied = rows.filter((r) => !r.qualifiers?.approved);

  const block = (title, list, note) =>
    list.length
      ? `<h4 class="ci-sub">${esc(title)} <span class="n">${list.length}</span></h4>
         ${note ? caveat(note) : ""}
         <div class="ci-chips">
           ${list
             .map(
               (row) =>
                 `<span class="ci-chip" title="${esc(row.statement || "")}">
                    ${esc(row.object.name)}
                    <em>phase ${esc(
                      String(row.qualifiers?.max_phase_for_indication ?? "?")
                    )}</em>
                  </span>`
             )
             .join("")}
         </div>`
      : "";

  return (
    block("Approved indications", approved) +
    block(
      "Studied, not approved",
      studied,
      "These indications were investigated. A phase reached is a record of " +
        "how far development went, not evidence that the drug worked."
    )
  );
}

function activityBlocks(activities) {
  if (!activities.total) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No measurements recorded yet.</p></div>`;
  }
  return `
    ${caveat(activities.note)}
    ${activities.by_target
      .slice(0, 30)
      .map(
        (group) => `
        <div class="ci-activity-group">
          <h4 class="ci-sub">
            ${
              group.target
                ? esc(group.target.name)
                : '<span class="dim">target not recorded</span>'
            }
            <span class="n">${group.measurements.length}</span>
          </h4>
          <table class="ci-table compact">
            <thead><tr>
              <th>Type</th><th>Value</th><th>pX</th><th>Species</th>
              <th>Assay</th><th>Evidence</th>
            </tr></thead>
            <tbody>
              ${group.measurements
                .slice(0, 25)
                .map(
                  (m) => `
                <tr class="${m.data_validity_comment ? "ci-flagged" : ""}">
                  <td>${esc(m.measure_type)}</td>
                  <td class="mono">${measure(m.value, m.units, m.relation)}</td>
                  <td>${m.p_value_standard ? Number(m.p_value_standard).toFixed(2) : "—"}</td>
                  <td>${esc(m.species || "—")}</td>
                  <td class="ci-assay">${esc(
                    (m.assay?.description || "not recorded").slice(0, 120)
                  )}</td>
                  <td>${classBadge(m.evidence_class)}</td>
                </tr>
                ${
                  m.data_validity_comment
                    ? `<tr class="ci-statement"><td colspan="6">
                         <strong>Source flagged this value:</strong> ${esc(
                           m.data_validity_comment
                         )}</td></tr>`
                    : ""
                }`
                )
                .join("")}
            </tbody>
          </table>
        </div>`
      )
      .join("")}`;
}

function propertyBlocks(properties) {
  if (!properties.groups.length) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No properties recorded yet.</p></div>`;
  }
  return `
    ${caveat(properties.note)}
    ${properties.groups
      .map(
        (group) => `
        <div class="ci-prop-group">
          <h4 class="ci-sub">${classBadge(group.evidence_class)}
            <span class="n">${group.properties.length}</span></h4>
          <table class="ci-table compact">
            <thead><tr><th>Property</th><th>Value</th><th>Method</th></tr></thead>
            <tbody>
              ${group.properties
                .map(
                  (p) => `
                <tr>
                  <td>${esc(p.name.replace(/_/g, " "))}</td>
                  <td class="mono">${
                    p.value_num !== null && p.value_num !== undefined
                      ? measure(p.value_num, p.units, p.relation)
                      : esc((p.value_text || "").slice(0, 300))
                  }</td>
                  <td class="dim small">${esc(p.method || "—")}${
                    p.method_version ? ` ${esc(p.method_version)}` : ""
                  }</td>
                </tr>
                ${
                  p.note
                    ? `<tr class="ci-statement"><td colspan="3">${esc(
                        p.note
                      )}</td></tr>`
                    : ""
                }`
                )
                .join("")}
            </tbody>
          </table>
        </div>`
      )
      .join("")}`;
}

function claimList(claims) {
  if (!claims.length) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No claims recorded yet.</p></div>`;
  }
  return `
    <div class="ci-claims">
      ${claims
        .slice(0, 60)
        .map(
          (claim) => `
        <div class="ci-claim ${claim.status === "DISPUTED" ? "disputed" : ""}">
          <div class="ci-claim-head">
            <span class="ci-claim-type">${esc(claim.claim_type)}</span>
            ${classBadge(claim.evidence_class)}
            ${
              claim.status === "DISPUTED"
                ? '<span class="ci-disputed">disputed</span>'
                : ""
            }
            <span class="spacer"></span>
            <span class="dim small">
              ${claim.support_count} supporting · ${claim.contradict_count} contradicting
            </span>
          </div>
          <div class="ci-claim-statement">${esc(claim.statement)}</div>
          <div class="ci-claim-conditions">
            ${[
              claim.conditions.species && `species: ${claim.conditions.species}`,
              claim.conditions.tissue && `tissue: ${claim.conditions.tissue}`,
              claim.conditions.cell && `cell: ${claim.conditions.cell}`,
              claim.conditions.method && `method: ${claim.conditions.method}`,
              claim.measurement &&
                `${claim.measurement.type} ${claim.measurement.relation || ""}${claim.measurement.value} ${claim.measurement.units || ""}`,
            ]
              .filter(Boolean)
              .map((bit) => `<span>${esc(bit)}</span>`)
              .join("")}
          </div>
        </div>`
        )
        .join("")}
    </div>`;
}

function relatedForms(dossier) {
  const outbound = dossier.chemical_relations || [];
  const inbound = dossier.related_forms || [];
  if (!outbound.length && !inbound.length) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No other chemical forms of this substance are recorded.</p>
      <p class="dim">Salts, stereoisomers, metabolites and marketed products
      appear here once they have been ingested.</p></div>`;
  }
  return `
    ${caveat(
      "A salt, a free base, a stereoisomer and a marketed product are " +
        "different things that share a name. They are separate records here " +
        "and each keeps its own identity."
    )}
    <table class="ci-table">
      <thead><tr><th>Relation</th><th>Substance</th><th>Detail</th></tr></thead>
      <tbody>
        ${outbound
          .map(
            (row) => `<tr>
              <td>${esc(row.relation)}</td>
              <td><a href="#/chemint/molecule?entity=${row.object.entity_id}">${esc(
              row.object.name
            )}</a></td>
              <td class="dim small">${esc(
                row.qualifiers?.salt_component || row.statement || "—"
              )}</td>
            </tr>`
          )
          .join("")}
        ${inbound
          .map(
            (row) => `<tr>
              <td>${esc(row.relation)} (inbound)</td>
              <td><a href="#/chemint/molecule?entity=${row.subject.entity_id}">${esc(
              row.subject.name
            )}</a></td>
              <td class="dim small">${esc(
                row.qualifiers?.salt_component || "—"
              )}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function literatureList(payload) {
  if (!payload.total) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No literature linked to this substance yet.</p></div>`;
  }
  return `
    <table class="ci-table">
      <thead><tr><th>Title</th><th>Journal</th><th>Year</th><th>Design</th></tr></thead>
      <tbody>
        ${payload.publications
          .map(
            (p) => `<tr>
              <td>${esc(p.title)}
                <div class="dim small mono">${esc(p.primary_id)}</div></td>
              <td>${esc(p.journal || "—")}</td>
              <td>${esc(String(p.year || "—"))}</td>
              <td>${esc(p.study_design || "—")}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function safetyBlocks(payload) {
  const hasAnything =
    payload.boxed_warning ||
    payload.label_sections?.length ||
    payload.adverse_event_reports?.length;

  if (!hasAnything) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No safety information ingested for this substance yet.</p></div>`;
  }

  return `
    ${
      payload.boxed_warning
        ? `<div class="ci-banner ci-banner-warn">
             <span class="ico">⚠</span>
             <div><strong>Boxed warning.</strong>
               <div class="ci-label-text">${esc(
                 payload.boxed_warning.text || ""
               )}</div></div>
           </div>`
        : ""
    }
    ${
      payload.label_sections?.length
        ? `<h4 class="ci-sub">Product label</h4>
           ${caveat(payload.label_note)}
           ${payload.label_sections
             .map(
               (section) => `
               <details class="ci-label-section">
                 <summary>${esc(section.section)}</summary>
                 <div class="ci-label-text">${esc(section.text || "")}</div>
               </details>`
             )
             .join("")}`
        : ""
    }
    ${
      payload.adverse_event_reports?.length
        ? `<h4 class="ci-sub">Adverse-event reports</h4>
           ${caveat(payload.adverse_event_note)}
           <table class="ci-table compact">
             <thead><tr><th>Reported term</th><th>Reports</th></tr></thead>
             <tbody>
               ${payload.adverse_event_reports
                 .map(
                   (row) =>
                     `<tr><td>${esc(row.term)}</td>
                      <td class="mono">${Number(
                        row.report_count
                      ).toLocaleString()}</td></tr>`
                 )
                 .join("")}
             </tbody>
           </table>`
        : ""
    }`;
}

function provenanceBlocks(dossier) {
  const records = [
    ...(dossier.provenance || []),
    ...((dossier.identity && dossier.identity.provenance) || []),
  ];
  if (!records.length) {
    return `<div class="ci-empty small"><div class="big">◌</div>
      <p>No provenance recorded — which is a bug, not a weak fact.</p></div>`;
  }
  return `
    ${caveat(
      "Every row in the fabric cites the retrieval that produced it: which " +
        "source, which record, on which date, from which release, under which " +
        "licence, normalised by which pipeline version."
    )}
    <div class="ci-prov-grid">
      ${records.map(provenanceCard).join("")}
    </div>`;
}
