/**
 * Shared rendering for the knowledge layer.
 *
 * The status vocabulary is the same four the rest of the platform uses, for
 * the same reason: "the source has nothing" and "the source could not be
 * reached" are different facts, and a reader who cannot tell them apart will
 * read a gap as a finding.
 */

import { esc } from "../ui.js";

export const KIND_GLYPH = {
  disease: "◈",
  gene: "⌁",
  protein: "⬡",
  target: "🎯",
  pathway: "⇄",
  structure: "⬢",
  compound: "⌬",
  drug: "💊",
  assay: "▦",
  trial: "🔬",
  publication: "📄",
};

export const KIND_COLOR = {
  disease: "--kb-disease",
  gene: "--kb-gene",
  protein: "--kb-protein",
  target: "--kb-target",
  pathway: "--kb-pathway",
  structure: "--kb-structure",
  compound: "--kb-compound",
  drug: "--kb-drug",
  assay: "--kb-assay",
  trial: "--kb-trial",
  publication: "--kb-publication",
};

const STATUS_META = {
  ok: { label: "Retrieved", glyph: "●", tone: "ok" },
  empty: { label: "Nothing recorded", glyph: "○", tone: "empty" },
  unavailable: { label: "Unavailable", glyph: "⚠", tone: "unavailable" },
  not_configured: { label: "Not configured", glyph: "◌", tone: "not-configured" },
};

export function statusChip(status, count) {
  const meta = STATUS_META[status] || STATUS_META.not_configured;
  const n = Number.isFinite(count) && status === "ok" ? ` <b>${count}</b>` : "";
  return `<span class="kb-status kb-status-${meta.tone}"><span class="kb-glyph">${
    meta.glyph
  }</span>${esc(meta.label)}${n}</span>`;
}

/** One provenance record. */
export function provenanceLine(record) {
  const when = record.retrieved_at
    ? new Date(record.retrieved_at).toISOString().slice(0, 16).replace("T", " ")
    : "—";
  const link = record.source_url
    ? `<a href="${esc(record.source_url)}" target="_blank" rel="noopener noreferrer">source ↗</a>`
    : "";
  return `
    <li>
      <span class="kb-prov-type kb-prov-${esc(record.provenance_type || "unknown")}">${esc(
        record.provenance_type || "unknown"
      )}</span>
      <strong>${esc(record.source || "unknown")}</strong>
      <span class="dim">· ${esc(record.method || "")}</span>
      <span class="dim mono small">· ${esc(when)} · ${esc(record.licence || "licence unstated")}</span>
      ${link}
      ${record.note ? `<div class="kb-prov-note">${esc(record.note)}</div>` : ""}
    </li>`;
}

export function provenanceBlock(records, label = "Provenance") {
  if (!records || !records.length) return "";
  return `
    <details class="kb-prov">
      <summary>${esc(label)} · ${records.length} record${records.length === 1 ? "" : "s"}</summary>
      <ul>${records.map(provenanceLine).join("")}</ul>
    </details>`;
}

/** An identifier, rendered as a resolvable chip. */
export function identifierChip(identifier) {
  const inner = `<span class="kb-id-ns">${esc(identifier.label || identifier.namespace)}</span>
    <span class="mono">${esc(identifier.local)}</span>`;
  return identifier.url
    ? `<a class="kb-id" href="${esc(identifier.url)}" target="_blank" rel="noopener noreferrer"
         title="${esc(identifier.authority || "")}">${inner} <span class="dim">↗</span></a>`
    : `<span class="kb-id">${inner}</span>`;
}

export const kbDisclaimer = `
  <p class="kb-disclaimer">
    Every node and every edge in this graph was asserted by a named source, and
    each carries the endpoint, licence and retrieval time it came from. An
    association score aggregates evidence — it is not a causal claim. A trial
    registration is not a result. Retrieved literature is retained so a citation
    shown here stays checkable; nothing in this layer generates a publication
    record. Research and education only; not medical advice.
  </p>`;
