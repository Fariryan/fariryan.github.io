/**
 * Shared display primitives for Chemical Intelligence.
 *
 * The evidence-class badge is the important one. The atlas already has an
 * evidence badge, and it answers a different question — *how strong* a
 * statement is. This one answers *what produced it*. They must not look
 * interchangeable, because a reader who conflates "measured" with
 * "established" has been misled by the interface rather than by the data.
 */

import { esc } from "../ui.js";

/** Badge for an evidence class, carrying its definition on hover. */
export function classBadge(evidenceClass) {
  if (!evidenceClass) return "";
  const value =
    typeof evidenceClass === "string" ? { value: evidenceClass } : evidenceClass;
  return `<span class="ci-class ci-class-${esc(
    value.tone || value.value
  )}" title="${esc(value.description || "")}">${esc(
    value.label || value.value
  )}</span>`;
}

/** Badge for what a neighbour is: approved drug, candidate, computational. */
export function neighborBadge(row) {
  return `<span class="ci-neighbor ci-neighbor-${esc(
    row.class_tone || row.class
  )}" title="${esc(row.class_description || "")}">${esc(
    row.class_label || row.class
  )}</span>`;
}

/**
 * Pills for the therapeutic areas an entity touches.
 *
 * The list arrives ordered by how many indications support each area, so the
 * leading pills are what the drug is mostly for and the tail is where it has
 * also been trialled. Only the leading few are shown by default: a drug like
 * aspirin genuinely has phase-4 trials in fourteen specialities, and printing
 * all fourteen at equal weight says nothing about what it is actually for.
 *
 * @param {string[]} areas   ordered, strongest first
 * @param {object} labels    key → display label
 * @param {object} options   `limit`, and `approved` to mark approved areas
 */
export function areaPills(areas, labels = {}, options = {}) {
  if (!areas || !areas.length) {
    return '<span class="dim">no therapeutic area recorded</span>';
  }

  const limit = options.limit ?? 4;
  const approved = new Set(options.approved || []);
  const shown = areas.slice(0, limit);
  const hidden = areas.slice(limit);

  const pill = (area) =>
    `<span class="ci-area${approved.has(area) ? " approved" : ""}"
           data-area="${esc(area)}"${
      approved.has(area) ? ' title="Approved in this area"' : ""
    }>${esc(labels[area] || area.replace(/_/g, " "))}</span>`;

  return (
    shown.map(pill).join("") +
    (hidden.length
      ? `<details class="ci-area-more">
           <summary>+${hidden.length} more</summary>
           <div>${hidden.map(pill).join("")}</div>
         </details>`
      : "")
  );
}

/**
 * One provenance record, rendered so the whole chain is visible.
 *
 * Source, record id, retrieval date, release version, licence and
 * normalisation version are all shown. That is the full set the fabric
 * promises to keep, and showing a subset would make the promise unverifiable.
 */
export function provenanceCard(record) {
  const bits = [];
  if (record.record_id) {
    bits.push(`record <span class="mono">${esc(record.record_id)}</span>`);
  }
  if (record.record_type) bits.push(esc(record.record_type));
  if (record.retrieved_at) {
    bits.push(`retrieved ${esc(String(record.retrieved_at).slice(0, 10))}`);
  }
  if (record.source_version) bits.push(`release ${esc(record.source_version)}`);
  if (record.normalization_version) {
    bits.push(`normaliser ${esc(record.normalization_version)}`);
  }

  return `
    <div class="ci-prov">
      <div class="head">
        <strong>${esc(record.source_name || record.source)}</strong>
        ${classBadge(record.evidence_class)}
      </div>
      <div class="meta">${bits.join(" · ")}</div>
      ${
        record.field
          ? `<div class="meta">supports field <span class="mono">${esc(
              record.field
            )}</span></div>`
          : ""
      }
      ${record.note ? `<div class="meta">${esc(record.note)}</div>` : ""}
      <div class="links">
        ${
          record.url
            ? `<a href="${esc(record.url)}" target="_blank" rel="noopener">source record ↗</a>`
            : ""
        }
        ${
          record.license
            ? `<span class="dim small">${esc(record.license)}${
                record.license_url
                  ? ` · <a href="${esc(
                      record.license_url
                    )}" target="_blank" rel="noopener">terms ↗</a>`
                  : ""
              }</span>`
            : ""
        }
      </div>
    </div>`;
}

/** A caveat block. Used wherever a number needs a sentence beside it. */
export const caveat = (text) =>
  `<div class="ci-caveat">${esc(text)}</div>`;

/** A statement of what the fabric does and does not contain. */
export const coverageNote = (text) =>
  `<div class="ci-coverage"><span class="ico">◈</span><div>${esc(text)}</div></div>`;

export const ciDisclaimer = `
  <div class="disclaimer">
    <strong>Scientific research and education only.</strong>
    Every statement on this page is attributed to the source record it came
    from, with the date it was retrieved and the licence it carries. Computed
    and predicted values are labelled as such and are never presented as
    measurements. Nothing here is medical advice, and none of it is a
    substitute for the approved product label.
  </div>`;

/** Format a number for display, preserving a censoring relation. */
export function measure(value, units, relation) {
  if (value === null || value === undefined) return "—";
  const magnitude = Math.abs(value);
  const rendered =
    magnitude >= 10000 || (magnitude < 0.01 && magnitude > 0)
      ? Number(value).toExponential(2)
      : Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const rel = relation && relation !== "=" ? `${esc(relation)} ` : "";
  return `${rel}${rendered}${units ? ` ${esc(units)}` : ""}`;
}

/** Definition-list row, the dossier's basic unit. */
export const field = (label, value, extra = "") =>
  `<div class="ci-field">
     <dt>${esc(label)}</dt>
     <dd>${value ?? '<span class="dim">not recorded</span>'}${
       extra ? `<span class="ci-field-extra">${extra}</span>` : ""
     }</dd>
   </div>`;

export const mono = (value) =>
  value
    ? `<span class="mono ci-mono">${esc(value)}</span>`
    : '<span class="dim">not recorded</span>';

/** Copy-to-clipboard affordance for an identifier. */
export function copyable(value) {
  if (!value) return '<span class="dim">not recorded</span>';
  return `<span class="ci-copy" data-copy="${esc(value)}" title="Copy">
    <span class="mono">${esc(value)}</span><span class="ico">⧉</span></span>`;
}

/** Wire up every copyable in a container. */
export function bindCopy(root) {
  root.querySelectorAll("[data-copy]").forEach((node) =>
    node.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(node.dataset.copy);
        node.classList.add("copied");
        setTimeout(() => node.classList.remove("copied"), 1200);
      } catch {
        /* clipboard access denied; the value is visible and selectable */
      }
    })
  );
}
