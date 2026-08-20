/**
 * Shared rendering for the therapeutic-area module.
 *
 * The one idea this file exists to enforce: a section's *status* is part of
 * its content. The backend distinguishes four outcomes and the interface
 * shows all four differently, because collapsing them is how a platform ends
 * up implying it checked something it never checked.
 *
 *   ok              the source answered and had content
 *   empty           the source answered and has nothing — a finding
 *   unavailable     the source could not be reached — we do not know
 *   not_configured  no provider exists for this on this deployment
 *
 * "Empty" and "unavailable" look different on purpose. A disease with no
 * recorded trials is a fact about the disease; a trial lookup that failed is a
 * fact about the network, and rendering them identically would turn the second
 * into a false version of the first.
 */

import { esc } from "../ui.js";

export const STATUS_META = {
  ok: { label: "Retrieved", glyph: "●", tone: "ok" },
  empty: { label: "Nothing recorded", glyph: "○", tone: "empty" },
  unavailable: { label: "Unavailable", glyph: "⚠", tone: "unavailable" },
  not_configured: { label: "Not configured", glyph: "◌", tone: "not-configured" },
};

export function statusChip(status, count) {
  const meta = STATUS_META[status] || STATUS_META.not_configured;
  const n =
    status === "ok" && Number.isFinite(count) ? ` <span class="ta-n">${count}</span>` : "";
  return `<span class="ta-status ta-status-${meta.tone}" title="${esc(meta.label)}">
    <span class="ta-glyph">${meta.glyph}</span>${esc(meta.label)}${n}</span>`;
}

/**
 * The classification badge for an area.
 *
 * Shown everywhere an area is named, because "this area is a real branch of a
 * public disease ontology" and "this area is a label we chose" are different
 * claims and the scientist is entitled to know which one they are looking at.
 */
export function groundingBadge(area) {
  const map = {
    ontology_root: {
      label: "Ontology root",
      tone: "root",
      title:
        "This area is one of the Open Targets Platform's own therapeutic-area roots. Membership is a fact about the ontology.",
    },
    ontology_term: {
      label: "Ontology term",
      tone: "term",
      title:
        "A real ontology term exists for this area, but it is not one of Open Targets' therapeutic-area roots. Membership is decided by ontology ancestry.",
    },
    user_defined: {
      label: "User-defined",
      tone: "user",
      title:
        "No ontology branch corresponds to this area. Membership is by explicit selection.",
    },
  };
  const meta = map[area.classification] || map.user_defined;
  return `<span class="ta-ground ta-ground-${meta.tone}" title="${esc(meta.title)}">${esc(
    meta.label
  )}</span>`;
}

/** One provenance record, in the platform's existing compact style. */
export function provenanceLine(record) {
  const url = record.source_url
    ? `<a href="${esc(record.source_url)}" target="_blank" rel="noopener noreferrer">source ↗</a>`
    : "";
  const when = record.retrieved_at
    ? new Date(record.retrieved_at).toISOString().slice(0, 16).replace("T", " ")
    : "—";
  return `
    <li>
      <span class="ta-prov-type ta-prov-${esc(record.provenance_type || "unknown")}">${esc(
        record.provenance_type || "unknown"
      )}</span>
      <strong>${esc(record.source || "unknown source")}</strong>
      <span class="dim">· ${esc(record.method || "")}</span>
      <span class="dim mono small">· ${esc(when)} · ${esc(record.licence || "licence unstated")}</span>
      ${url}
      ${record.note ? `<div class="ta-prov-note">${esc(record.note)}</div>` : ""}
    </li>`;
}

export function provenanceBlock(records) {
  if (!records || !records.length) return "";
  return `
    <details class="ta-prov">
      <summary>Provenance · ${records.length} source${records.length === 1 ? "" : "s"}</summary>
      <ul>${records.map(provenanceLine).join("")}</ul>
    </details>`;
}

/**
 * A workspace section wrapper.
 *
 * Non-OK sections render their note prominently rather than as small print:
 * the reason a section is empty is usually more informative than the section
 * would have been.
 */
export function section(kind, title, blurb, data, bodyHtml) {
  const status = data?.status || "not_configured";
  const body =
    status === "ok"
      ? bodyHtml
      : `<div class="ta-section-note ta-note-${esc(status)}">
           ${esc(data?.note || "No further detail was recorded.")}
         </div>`;
  return `
    <section class="ta-section lg-surface lg-d1" id="ta-section-${esc(kind)}">
      <header class="ta-section-head">
        <div>
          <h3>${esc(title)}</h3>
          <p class="ta-blurb">${esc(blurb)}</p>
        </div>
        ${statusChip(status, data?.item_count)}
      </header>
      <div class="ta-section-body">${body}</div>
      ${provenanceBlock(data?.provenance)}
    </section>`;
}

/** Evidence-level badge reusing the atlas's existing tone variables. */
export function evidenceTag(level) {
  const tones = {
    established: "established",
    strong: "strong",
    clinical_trial: "trial",
    preliminary: "preliminary",
    preclinical: "preclinical",
    hypothesized: "hypothesis",
    unknown: "unknown",
  };
  const tone = tones[level] || "unknown";
  const label = String(level || "unknown").replace(/_/g, " ");
  return `<span class="ta-ev ta-ev-${tone}">${esc(label)}</span>`;
}

export const areasDisclaimer = `
  <p class="ta-disclaimer">
    Evidence is retrieved from Open Targets, Reactome, RCSB PDB and this
    deployment's own atlas, and every section names its sources above. An
    association score aggregates evidence — it is not a causal claim and not a
    measure of druggability. For research and education only; not medical advice.
  </p>`;
