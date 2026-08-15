/**
 * Research Radar.
 *
 * The coverage panel comes first, above the results, on purpose: a reader
 * should know what was searched and what came back before they read a single
 * paper card. Putting it below would let the results imply completeness the
 * search never had.
 */

import { card, empty, esc, fmt, loading, notice } from "../../ui.js";
import { bindJob } from "../../jobstore.js";
import { labApi } from "../api.js";
import { needsSubject } from "../router.js";
import { subjectStore } from "../store.js";
import {
  confidenceChip,
  provBadge,
  recordTypeChip,
  relationshipChip,
  tiles,
  wireProvenance,
  wireWhy,
} from "../ui.js";

const TABS = [
  { key: "papers", label: "Papers" },
  { key: "new", label: "What's new?" },
  { key: "chemistry", label: "Recent chemistry" },
  { key: "entities", label: "Entities" },
  { key: "timeline", label: "Timeline" },
  { key: "contradictions", label: "Contradictions" },
  { key: "coverage", label: "Coverage" },
];

export async function radarView(root, params) {
  const subject = subjectStore.get();
  if (!subject) {
    root.innerHTML = needsSubject("Research Radar");
    return;
  }

  root.innerHTML = loading(`Loading the index for ${subject.label}…`);

  let literature;
  try {
    literature = await labApi.literature(subject, { limit: 25 });
  } catch (error) {
    root.innerHTML = notice(
      `Could not read the literature index: ${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  const coverage = literature.coverage;
  const tab = params?.get("tab") || "papers";

  root.innerHTML = `
    <div class="row-between mb">
      <div class="row">
        ${coverage.synchronised
          ? `<span class="dim small">Last synchronised
               ${esc(fmt.date(coverage.last_synchronised))} ·
               window ${esc(coverage.window.start)} → ${esc(coverage.window.end)}</span>`
          : `<span class="dim small">Not yet synchronised</span>`}
      </div>
      <div class="row">
        <span id="radar-refresh"></span>
      </div>
    </div>

    <div id="radar-coverage" class="mb"></div>

    <div class="tabs" id="radar-tabs">
      ${TABS.map(
        (t) =>
          `<button data-tab="${t.key}" class="${t.key === tab ? "active" : ""}">${esc(
            t.label
          )}</button>`
      ).join("")}
    </div>
    <div class="tab-panel" id="radar-panel"></div>`;

  renderCoverageStrip(root.querySelector("#radar-coverage"), coverage);

  const panel = root.querySelector("#radar-panel");
  const show = (key) => {
    root
      .querySelectorAll("#radar-tabs button")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === key));
    renderTab(panel, key, subject, literature);
  };

  root.querySelector("#radar-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (button) show(button.dataset.tab);
  });

  // Per subject: a scan started for one entity must not appear to belong to
  // the next one the user opens.
  bindJob(root, `lab-radar:${subject.id}`, {
    control: "#radar-refresh",
    output: "#radar-job",
    runLabel: "Refresh research",
    start: () =>
      labApi.refreshLiterature({
        node_id: subject.id,
        months: 6,
        cap: 200,
        detect_novelty: true,
        force: true,
      }),
    render: (host, _result, job) => applyScan(host, job),
  });

  show(tab);
}

/* ------------------------------------------------------------- refresh */

/**
 * A finished scan changes what every panel on this page should show, so the
 * view is re-rendered from the refreshed cache rather than patched in place.
 *
 * Once per job: the re-render re-binds the slot, which paints the same
 * completed job again, and re-rendering on that would never terminate.
 */
const applied = new Set();

function applyScan(host, job) {
  if (applied.has(job.id)) return;
  applied.add(job.id);
  host.innerHTML = "";
  labApi.clearCache();
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/* ------------------------------------------------------------ coverage */

function renderCoverageStrip(host, coverage) {
  if (!coverage.synchronised) {
    host.innerHTML = notice(
      `${esc(coverage.message)} Press <strong>Refresh research</strong> to
       retrieve the rolling six-month window for this entity.`,
      "muted",
      "◎"
    );
    return;
  }

  const composition = coverage.composition || {};
  host.innerHTML = tiles([
    { value: coverage.records_indexed, label: "Records indexed" },
    { value: composition.peer_reviewed ?? 0, label: "Peer-reviewed" },
    { value: composition.preprints ?? 0, label: "Preprints" },
    { value: composition.open_access ?? 0, label: "Open access" },
    { value: composition.abstract_available ?? 0, label: "With abstract" },
    {
      value: coverage.duplicates_removed,
      label: "Duplicates removed",
      title: "Records returned by more than one provider, merged into one.",
    },
    {
      value: (coverage.failed_sources || []).length,
      label: "Failed sources",
      bad: (coverage.failed_sources || []).length > 0,
      title: (coverage.failed_sources || []).join(", "),
    },
  ]);
}

/* ---------------------------------------------------------------- tabs */

async function renderTab(panel, key, subject, literature) {
  panel.innerHTML = loading();

  try {
    if (key === "papers") return renderPapers(panel, subject, literature);
    if (key === "new") return await renderNovelty(panel, subject);
    if (key === "chemistry") return await renderChemistry(panel, subject);
    if (key === "entities") return await renderEntities(panel, subject);
    if (key === "timeline") return await renderTimeline(panel, subject);
    if (key === "contradictions") return await renderContradictions(panel, subject);
    if (key === "coverage") return renderCoverageDetail(panel, literature.coverage);
  } catch (error) {
    panel.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function paperCard(item) {
  const entities = [
    ...(item.entities?.targets || []),
    ...(item.entities?.diseases || []),
    ...(item.entities?.drugs || []),
    ...(item.entities?.compounds || []),
  ].slice(0, 10);

  return `<article class="paper-card" data-paper="${item.id}">
    <div class="title">${esc(item.title)}</div>
    <div class="meta">
      ${recordTypeChip(item)}
      ${item.is_preprint ? '<span class="rec-type rec-preliminary">Not peer reviewed</span>' : ""}
      <span>${esc(item.publication_date || item.year || "date not stated")}</span>
      ${item.journal ? `<span>${esc(item.journal)}</span>` : ""}
      ${item.open_access ? '<span class="ok">Open access</span>' : ""}
      ${
        item.independent_providers > 1
          ? `<span title="Returned by ${esc(item.providers.join(", "))}">${
              item.independent_providers
            } providers</span>`
          : ""
      }
      ${
        item.citation_count !== null && item.citation_count !== undefined
          ? `<span>${item.citation_count} citations</span>`
          : ""
      }
      ${provBadge({ class: "literature", providers: item.providers, retrieved_at: item.provenance?.retrieved_at })}
    </div>
    ${item.abstract_snippet ? `<div class="snippet">${esc(item.abstract_snippet)}…</div>` : ""}
    ${
      entities.length
        ? `<div class="ents">${entities
            .map(
              (entity) =>
                `<span class="chip${entity.in_platform ? " clickable" : ""}" ${
                  entity.node ? `data-nav="#/entity/${entity.node.id}"` : ""
                } title="${esc(entity.extraction_method)} · ${entity.occurrences} mention(s)">${esc(
                  entity.normalized_name || entity.surface_form
                )}</span>`
            )
            .join("")}</div>`
        : ""
    }
    <div class="row" style="margin-top:9px">
      ${(item.links || [])
        .map(
          (link) =>
            `<a class="small" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(
              link.label
            )}</a>`
        )
        .join(" · ")}
      <span class="spacer"></span>
      <button class="sm" data-detail="${item.id}">Full card</button>
    </div>
    <div class="hidden" id="paper-detail-${item.id}"></div>
  </article>`;
}

function renderPapers(panel, subject, literature) {
  if (!literature.items.length) {
    panel.innerHTML = empty(
      literature.coverage.synchronised
        ? "No records are indexed for this entity yet."
        : "Nothing has been retrieved for this entity yet."
    );
    return;
  }

  panel.innerHTML = `
    <div class="toolbar mb">
      <input class="search-input" id="paper-filter" type="search"
             placeholder="Filter these records…" style="max-width:320px" />
      <select id="type-filter">
        <option value="">All record types</option>
        <option value="peer_reviewed">Peer-reviewed</option>
        <option value="preprint">Preprints</option>
        <option value="review">Reviews</option>
        <option value="clinical_study">Clinical studies</option>
      </select>
      <label class="row small"><input type="checkbox" id="oa-filter" /> Open access only</label>
      <span class="spacer"></span>
      <span class="dim small">${literature.total} record(s)</span>
    </div>
    <div id="paper-list">${literature.items.map(paperCard).join("")}</div>`;

  wireProvenance(panel);
  wirePaperDetails(panel);
  wireNav(panel);

  const rerun = async () => {
    const list = panel.querySelector("#paper-list");
    list.innerHTML = loading();
    const data = await labApi.literature(subject, {
      limit: 40,
      search: panel.querySelector("#paper-filter").value.trim() || undefined,
      record_types: panel.querySelector("#type-filter").value || undefined,
      open_access: panel.querySelector("#oa-filter").checked || undefined,
    });
    list.innerHTML = data.items.length
      ? data.items.map(paperCard).join("")
      : empty("No records match these filters.");
    wireProvenance(panel);
    wirePaperDetails(panel);
    wireNav(panel);
  };

  let timer;
  panel.querySelector("#paper-filter").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(rerun, 350);
  });
  panel.querySelector("#type-filter").addEventListener("change", rerun);
  panel.querySelector("#oa-filter").addEventListener("change", rerun);
}

function wirePaperDetails(panel) {
  panel.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      const host = panel.querySelector(`#paper-detail-${button.dataset.detail}`);
      if (!host.classList.contains("hidden")) {
        host.classList.add("hidden");
        button.textContent = "Full card";
        return;
      }
      host.classList.remove("hidden");
      button.textContent = "Hide";
      host.innerHTML = loading();
      try {
        const detail = await labApi.paper(Number(button.dataset.detail));
        host.innerHTML = fullCard(detail);
        wireProvenance(host);
      } catch (error) {
        host.innerHTML = notice(esc(error.message), "danger", "⚠");
      }
    });
  });
}

function fullCard(detail) {
  const section = (title, value) =>
    value
      ? `<h5 style="margin:11px 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim)">${esc(
          title
        )}</h5><div class="small muted">${esc(value)}</div>`
      : "";

  const entityGroup = (label, items) =>
    items?.length
      ? `<div style="margin-bottom:6px"><span class="dim small">${esc(label)}:</span>
         ${items
           .map(
             (item) =>
               `<span class="chip${item.node ? " clickable" : ""}" ${
                 item.node ? `data-nav="#/entity/${item.node.id}"` : ""
               }>${esc(item.normalized_name || item.surface_form)}</span>`
           )
           .join(" ")}</div>`
      : "";

  return `<div class="prov-detail" style="border-style:solid">
    ${detail.abstract ? `<div class="small" style="line-height:1.6">${esc(detail.abstract)}</div>` : `<div class="dim small">No abstract was supplied by any provider for this record.</div>`}
    ${section("Primary findings", detail.primary_findings)}
    ${section("Conclusions", detail.conclusions)}
    ${section("Limitations stated by the authors", detail.limitations)}
    ${
      !detail.limitations
        ? `<div class="dim small" style="margin-top:6px">No limitations section is present in this abstract. None is inferred.</div>`
        : ""
    }
    ${section("Methods", detail.methods_text)}
    <h5 style="margin:12px 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim)">Entities</h5>
    ${entityGroup("Diseases", detail.entities?.diseases)}
    ${entityGroup("Targets / genes", [
      ...(detail.entities?.targets || []),
      ...(detail.entities?.genes || []),
    ])}
    ${entityGroup("Drugs / compounds", [
      ...(detail.entities?.drugs || []),
      ...(detail.entities?.compounds || []),
    ])}
    ${entityGroup("Pathways", detail.entities?.pathways)}
    ${entityGroup("Cell types", detail.entities?.cell_types)}
    ${entityGroup("Model systems", detail.entities?.species)}
    ${entityGroup("Methods", detail.entities?.methods)}
    ${
      detail.assertions?.length
        ? `<h5 style="margin:12px 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim)">Extracted statements</h5>
           ${detail.assertions
             .slice(0, 6)
             .map(
               (assertion) => `<div class="quote">
                 <strong>${esc(assertion.subject)}</strong>
                 ${esc(assertion.polarity.replace("_", " "))}
                 <strong>${esc(assertion.object)}</strong>
                 <span class="dim">· ${esc(assertion.study_context)}</span>
                 ${provBadge({ class: "text_derived", note: assertion.provenance?.note })}
                 <div class="small dim" style="margin-top:3px">“${esc(assertion.sentence)}”</div>
               </div>`
             )
             .join("")}`
        : ""
    }
    <div class="lab-note">
      Human involvement: ${detail.human_involvement ? "indicated by the record" : "not indicated"}.
      Model systems detected: ${
        detail.model_systems?.length ? esc(detail.model_systems.join(", ")) : "none stated"
      }.
      ${detail.license ? `Licence: ${esc(detail.license)}.` : ""}
    </div>
  </div>`;
}

/* ------------------------------------------------------------- novelty */

async function renderNovelty(panel, subject) {
  const data = await labApi.novelty(subject, { limit: 40 });
  if (!data.findings.length) {
    panel.innerHTML =
      empty("No novelty findings have been computed for this entity yet.") +
      `<div class="lab-note">${esc(data.method)}</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="lab-note mb">${esc(data.method)}</div>
    ${data.findings
      .map(
        (finding, index) => `
      <div class="finding">
        <div class="top">
          <span class="headline">${esc(finding.headline)}</span>
          <span class="rule-tag">${esc(finding.type_label)}</span>
          ${confidenceChip(finding.confidence)}
          ${relationshipChip(finding.relationship_class)}
          ${
            finding.independently_replicated
              ? '<span class="rec-type rec-established">Replicated</span>'
              : '<span class="rec-type rec-unknown">Not replicated</span>'
          }
          ${provBadge(finding.provenance)}
        </div>
        <div class="statement">${esc(finding.what_is_new)}</div>
        <div class="small dim">
          Compared with: ${esc(finding.compared_with.prior_source)} records before
          ${esc(finding.compared_with.prior_window.end)} —
          ${
            finding.compared_with.prior_hit_count === null
              ? "check could not be completed"
              : `${finding.compared_with.prior_hit_count} prior record(s)`
          }.
          The platform graph has ${esc(finding.compared_with.platform_graph)}.
        </div>
        ${
          finding.supporting_sentences?.length
            ? `<div class="quote">“${esc(finding.supporting_sentences[0])}”</div>`
            : ""
        }
        <div class="row" style="margin-top:8px">
          <button class="sm" data-why="novelty-why-${index}">Why?</button>
          <span class="spacer"></span>
          <span class="small dim">${finding.supporting_papers.length} supporting record(s)</span>
        </div>
        <div class="hidden" id="novelty-why-${index}">
          <div class="why-panel">
            <h5>Query used for the prior-literature check</h5>
            <ul><li><code>${esc(finding.compared_with.prior_query)}</code></li></ul>
            <h5>Supporting records</h5>
            <ul>${finding.supporting_papers
              .map(
                (paper) =>
                  `<li>${esc(paper.title)} <span class="dim">${esc(
                    paper.date || ""
                  )}${paper.is_preprint ? " · preprint" : ""}</span>${
                    paper.pmid
                      ? ` <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(
                          paper.pmid
                        )}/" target="_blank" rel="noopener">PMID</a>`
                      : ""
                  }</li>`
              )
              .join("")}</ul>
            <h5>Replication</h5>
            <ul class="missing"><li>${esc(finding.replication_note)}</li></ul>
          </div>
        </div>
      </div>`
      )
      .join("")}`;

  wireProvenance(panel);
  wireWhy(panel);
}

/* ----------------------------------------------------------- chemistry */

async function renderChemistry(panel, subject) {
  const data = await labApi.recentChemistry(subject, { limit: 40 });
  if (!data.items.length) {
    panel.innerHTML = empty(
      "No record in the retrieved window reports new chemical matter."
    );
    return;
  }

  panel.innerHTML = data.items
    .map(
      (item) => `
    <div class="finding">
      <div class="top">
        <span class="headline">${esc(item.title)}</span>
        ${item.is_preprint ? '<span class="rec-type rec-preliminary">Preprint</span>' : ""}
        ${provBadge(item.provenance)}
      </div>
      <div class="small dim">${esc(item.date || "")} ${
        item.journal ? "· " + esc(item.journal) : ""
      }</div>
      ${
        item.modalities.length
          ? `<div class="row" style="margin-top:7px">${item.modalities
              .map((m) => `<span class="chip">${esc(m)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${
        item.compounds.length
          ? `<div class="ents">${item.compounds
              .map(
                (compound) =>
                  `<span class="chip${compound.node ? " clickable" : ""}" ${
                    compound.node ? `data-nav="#/entity/${compound.node.id}"` : ""
                  } title="${
                    compound.structure_available
                      ? "Structure available in the platform"
                      : "No resolvable structure — none is shown"
                  }">${esc(compound.name)}${compound.structure_available ? " ⌬" : ""}</span>`
              )
              .join("")}</div>`
          : `<div class="dim small" style="margin-top:6px">No compound in this record resolved to a structure the platform holds.</div>`
      }
      <div class="lab-note">Matched on: ${esc(
        item.matched_cues.join(", ")
      )}. ${esc(item.structure_note)}</div>
      <div class="row" style="margin-top:7px">
        ${
          item.pmid
            ? `<a class="small" href="https://pubmed.ncbi.nlm.nih.gov/${esc(
                item.pmid
              )}/" target="_blank" rel="noopener">PMID ${esc(item.pmid)}</a>`
            : ""
        }
        ${
          item.doi
            ? `<a class="small" href="https://doi.org/${esc(
                item.doi
              )}" target="_blank" rel="noopener">doi:${esc(item.doi)}</a>`
            : ""
        }
      </div>
    </div>`
    )
    .join("");

  wireProvenance(panel);
  wireNav(panel);
}

/* ------------------------------------------------------------ entities */

async function renderEntities(panel, subject) {
  const data = await labApi.entityFrequency(subject, { limit: 60 });
  if (!data.items.length) {
    panel.innerHTML = empty("No entities have been extracted for this topic yet.");
    return;
  }

  const groups = {};
  for (const item of data.items) {
    (groups[item.entity_type] ||= []).push(item);
  }

  panel.innerHTML = `
    <div class="lab-note mb">${esc(data.note)}</div>
    <div class="grid grid-2">
      ${Object.entries(groups)
        .map(
          ([type, items]) => `
        <section class="card">
          <h3>${esc(type.replace("_", " "))} <span class="dim">(${items.length})</span></h3>
          ${items
            .map(
              (item) => `<div class="entity-row" ${
                item.node ? `data-nav="#/entity/${item.node.id}"` : ""
              }>
                <div class="body">
                  <div class="name">${esc(item.name)}</div>
                  <div class="meta">${
                    item.in_platform
                      ? "in the curated graph"
                      : "not in the curated graph"
                  }</div>
                </div>
                <div class="right">${item.papers} paper(s)</div>
              </div>`
            )
            .join("")}
        </section>`
        )
        .join("")}
    </div>`;

  wireNav(panel);
}

/* ------------------------------------------------------------ timeline */

async function renderTimeline(panel, subject) {
  const data = await labApi.timeline(subject, { months: 24 });
  const series = data.series || [];
  if (!series.length) {
    panel.innerHTML = empty("No dated records are indexed for this entity.");
    return;
  }

  const peak = Math.max(...series.map((bucket) => bucket.total), 1);
  panel.innerHTML = `
    ${card(
      "Publication activity in the indexed corpus",
      `<div class="timeline-bars">
        ${series
          .map((bucket) => {
            const height = (value) => Math.round((value / peak) * 100);
            return `<div class="bar" title="${esc(bucket.month)}: ${bucket.total} record(s)">
              ${bucket.preprints ? `<div class="seg pre" style="height:${height(bucket.preprints)}px"></div>` : ""}
              ${bucket.clinical ? `<div class="seg cli" style="height:${height(bucket.clinical)}px"></div>` : ""}
              ${bucket.reviews ? `<div class="seg rev" style="height:${height(bucket.reviews)}px"></div>` : ""}
              ${bucket.peer_reviewed ? `<div class="seg pr" style="height:${height(bucket.peer_reviewed)}px"></div>` : ""}
              <div class="lbl">${esc(bucket.month)}</div>
            </div>`;
          })
          .join("")}
      </div>
      <div class="graph-legend">
        <div class="item"><span class="swatch" style="background:var(--ev-strong)"></span>Peer-reviewed</div>
        <div class="item"><span class="swatch" style="background:var(--ev-trial)"></span>Reviews</div>
        <div class="item"><span class="swatch" style="background:var(--ev-established)"></span>Clinical</div>
        <div class="item"><span class="swatch" style="background:var(--ev-preliminary)"></span>Preprints</div>
      </div>
      <div class="lab-note">${esc(data.note)}</div>`
    )}
    ${card(
      "Notable records by month",
      series
        .slice()
        .reverse()
        .slice(0, 8)
        .map(
          (bucket) => `<div style="margin-bottom:12px">
            <div class="row-between">
              <strong>${esc(bucket.month)}</strong>
              <span class="dim small">${bucket.total} record(s)</span>
            </div>
            ${bucket.highlights
              .map(
                (highlight) =>
                  `<div class="small muted" style="padding:3px 0">${esc(
                    highlight.title
                  )} <span class="dim">${esc(highlight.date)}</span></div>`
              )
              .join("")}
          </div>`
        )
        .join("")
    )}`;
}

/* ------------------------------------------------------ contradictions */

async function renderContradictions(panel, subject) {
  const data = await labApi.contradictions(subject, { limit: 30 });
  if (!data.findings.length) {
    panel.innerHTML =
      empty("No contradictory statements were detected in the retrieved records.") +
      `<div class="lab-note">Contradiction detection compares directional
       statements extracted from abstracts. Silence here means none were found
       in this corpus, not that the literature agrees.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="lab-note mb">${esc(data.policy)}</div>
    ${data.findings
      .map(
        (finding, index) => `
      <div class="finding">
        <div class="top">
          <span class="headline">${esc(finding.headline)}</span>
          ${confidenceChip(finding.confidence)}
          ${provBadge(finding.provenance)}
        </div>
        <div class="side-by-side">
          ${finding.sides
            .map(
              (side) => `
            <div class="side ${esc(side.polarity)}">
              <div class="side-head">${esc(side.label)} · ${side.count} record(s)</div>
              ${side.records
                .map(
                  (record) => `<div style="margin-bottom:9px">
                    <div class="small">${esc(record.title)}</div>
                    <div class="meta small dim">
                      ${esc(record.date || "")} ·
                      ${esc(record.record_type)} ·
                      ${esc(record.study_context)}
                      ${record.is_preprint ? " · preprint" : ""}
                    </div>
                    <div class="quote">“${esc(record.sentence)}”</div>
                  </div>`
                )
                .join("")}
            </div>`
            )
            .join("")}
        </div>
        <div class="row" style="margin-top:9px">
          <button class="sm" data-why="contra-why-${index}">Why?</button>
        </div>
        <div class="hidden" id="contra-why-${index}">
          <div class="why-panel">
            <h5>Differences to check</h5>
            <ul>${finding.differences_to_check
              .map(
                (difference) =>
                  `<li><strong>${esc(difference.label)}</strong>: ${esc(
                    Object.entries(difference.by_side || {})
                      .map(([side, values]) => `${side} → ${values.join(", ")}`)
                      .join(" | ") || difference.note || ""
                  )}</li>`
              )
              .join("")}</ul>
            <h5>Resolution</h5>
            <ul class="missing"><li>${esc(finding.resolution_note)}</li></ul>
            <h5>Extraction caveat</h5>
            <ul class="missing"><li>${esc(finding.extraction_caveat)}</li></ul>
          </div>
        </div>
      </div>`
      )
      .join("")}`;

  wireProvenance(panel);
  wireWhy(panel);
}

/* ----------------------------------------------------- coverage detail */

function renderCoverageDetail(panel, coverage) {
  if (!coverage.synchronised) {
    panel.innerHTML = notice(esc(coverage.message), "muted", "◎");
    return;
  }

  const composition = coverage.composition || {};
  panel.innerHTML = `
    ${card(
      "What was searched",
      `<dl class="kv">
        <dt>Date range</dt><dd>${esc(coverage.window.start)} → ${esc(coverage.window.end)}</dd>
        <dt>Last synchronised</dt><dd>${esc(fmt.date(coverage.last_synchronised))}</dd>
        <dt>Sources searched</dt><dd>${esc((coverage.sources_searched || []).join(", "))}</dd>
        <dt>Records retrieved</dt><dd>${coverage.records_retrieved}</dd>
        <dt>New this run</dt><dd>${coverage.records_new}</dd>
        <dt>Duplicates removed</dt><dd>${coverage.duplicates_removed}</dd>
      </dl>
      <div class="lab-note">${esc(coverage.limits)}</div>`
    )}
    ${card(
      "Per provider",
      (coverage.providers || [])
        .map(
          (provider) => `
        <div class="provider-row">
          <span class="pname">${esc(provider.provider)}</span>
          <span class="${provider.error ? "fail" : "ok"}">${
            provider.error ? "failed" : "ok"
          }</span>
          <span class="small dim">
            ${
              provider.hit_count === null || provider.hit_count === undefined
                ? "hit count not reported"
                : `${fmt.num(provider.hit_count)} matched`
            }
            · ${provider.retrieved} retrieved
            · ${provider.complete ? "complete" : "truncated"}
          </span>
          <span class="q">${esc((provider.queries || []).join(" ; "))}</span>
          ${provider.error ? `<span class="fail small">${esc(provider.error)}</span>` : ""}
        </div>`
        )
        .join("")
    )}
    ${card(
      "Composition of what was retrieved",
      tiles([
        { value: composition.peer_reviewed ?? 0, label: "Peer-reviewed" },
        { value: composition.preprints ?? 0, label: "Preprints" },
        { value: composition.abstract_available ?? 0, label: "Abstract available" },
        { value: composition.abstract_only ?? 0, label: "Abstract only" },
        { value: composition.full_text_available ?? 0, label: "Full text linked" },
        { value: composition.open_access ?? 0, label: "Open access" },
        {
          value: composition.corroborated_by_two_providers ?? 0,
          label: "Two providers",
          title: "Records returned independently by more than one provider.",
        },
      ]) +
        `<div class="lab-note">
          Stored content is metadata and abstracts. Full text is linked, not
          copied, unless a record is open access and its licence permits reuse.
        </div>`
    )}`;
}

/* ------------------------------------------------------------ plumbing */

function wireNav(root) {
  root.querySelectorAll("[data-nav]").forEach((element) => {
    element.style.cursor = "pointer";
    element.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      window.location.hash = element.dataset.nav;
    });
  });
}
