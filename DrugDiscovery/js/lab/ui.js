/**
 * Discovery Lab display primitives.
 *
 * These render the things that keep a computed number honest: a provenance
 * badge that opens its full record, a confidence chip that states its own
 * criteria, an unavailable panel that says what is missing and why. They are
 * defined once, here, for the same reason the atlas defines its evidence badge
 * once — a prediction must never be able to look like a measurement.
 */

import { esc, fmt } from "../ui.js";

export const PROVENANCE_LABELS = {
  experimental: "Experimental",
  database: "Database",
  calculated: "Calculated",
  predicted: "Predicted",
  literature: "Literature",
  text_derived: "Text-derived",
  llm_extracted: "LLM-extracted",
  llm_hypothesized: "LLM-hypothesised",
  computed_inference: "Computed",
};

let badgeSequence = 0;

/**
 * A provenance badge. Clicking it reveals the full record beneath.
 *
 * The detail is rendered inline rather than in a tooltip so it can be read,
 * copied and screenshotted with the value it describes.
 */
export function provBadge(provenance, { inline = true } = {}) {
  if (!provenance) return "";
  const kind = provenance.class || provenance.kind || "computed_inference";
  const id = `prov-${++badgeSequence}`;
  const label = PROVENANCE_LABELS[kind] || kind;

  const rows = [];
  if (provenance.description) rows.push(["What this means", provenance.description]);
  if (provenance.method) {
    rows.push(["Method", `${provenance.method.name} ${provenance.method.version}`]);
    if (provenance.method.input_representation) {
      rows.push(["Input", provenance.method.input_representation]);
    }
    if (provenance.method.reference) {
      rows.push([
        "Reference",
        `<a href="${esc(provenance.method.reference)}" target="_blank" rel="noopener">${esc(
          provenance.method.reference
        )}</a>`,
      ]);
    }
  }
  if (provenance.source) rows.push(["Source", provenance.source]);
  if (provenance.source_id) rows.push(["Record", provenance.source_id]);
  if (provenance.source_url) {
    rows.push([
      "Link",
      `<a href="${esc(provenance.source_url)}" target="_blank" rel="noopener">${esc(
        provenance.source_url
      )}</a>`,
    ]);
  }
  if (provenance.computed_at) rows.push(["Computed", fmt.date(provenance.computed_at)]);
  if (provenance.retrieved_at) rows.push(["Retrieved", fmt.date(provenance.retrieved_at)]);
  if (provenance.note) rows.push(["Note", provenance.note]);
  if (provenance.providers?.length) {
    rows.push(["Providers", provenance.providers.join(", ")]);
  }

  const detail = rows.length
    ? `<div class="prov-detail hidden" id="${id}"><dl>${rows
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v.startsWith("<a") ? v : esc(v)}</dd>`)
        .join("")}</dl></div>`
    : "";

  const badge = `<span class="prov-badge prov-${esc(kind)}" data-prov="${id}"
    title="Click for the full provenance record">${esc(label)}</span>`;

  return inline ? badge + detail : { badge, detail };
}

/** Wire every provenance badge inside a container to its detail block. */
export function wireProvenance(root) {
  root.querySelectorAll("[data-prov]").forEach((badge) => {
    badge.style.cursor = "pointer";
    badge.addEventListener("click", (event) => {
      event.stopPropagation();
      root.querySelector(`#${badge.dataset.prov}`)?.classList.toggle("hidden");
    });
  });
}

export function confidenceChip(confidence) {
  if (!confidence) return "";
  const because = (confidence.because || []).join(" · ");
  return `<span class="conf conf-${esc(confidence.level)}"
    title="${esc(confidence.criteria || "")}${because ? "\n\nBecause: " + esc(because) : ""}"
    >${esc(confidence.label)}</span>`;
}

export function relationshipChip(relationship) {
  if (!relationship) return "";
  return `<span class="rel-class" title="${esc(relationship.description || "")}">${esc(
    relationship.label
  )}</span>`;
}

/** The panel shown where a value would be, when it could not be produced. */
export function unavailablePanel(payload) {
  if (!payload) return "";
  return `<div class="unavailable">
    <span class="what">${esc(payload.what || "Not available")}</span>
    ${esc(payload.reason || "")}
    ${payload.remedy ? `<div class="remedy">To enable: ${esc(payload.remedy)}</div>` : ""}
  </div>`;
}

/** True when a payload is an explicit unavailable marker rather than a value. */
export const isUnavailable = (payload) =>
  payload && payload.available === false;

export function recordTypeChip(card) {
  const tone = card.record_type_tone || "unknown";
  return `<span class="rec-type rec-${esc(tone)}">${esc(
    card.record_type_label || card.record_type
  )}</span>`;
}

/** A statistic tile grid, used for coverage and readouts. */
export function tiles(items, className = "coverage") {
  return `<div class="${className}">${items
    .map(
      (item) => `
      <div class="cell${item.bad ? " bad" : ""}" ${
        item.title ? `title="${esc(item.title)}"` : ""
      }>
        <div class="v">${
          typeof item.value === "number" ? fmt.num(item.value) : esc(item.value)
        }</div>
        <div class="k">${esc(item.label)}</div>
      </div>`
    )
    .join("")}</div>`;
}

/** The "Why?" disclosure that carries a full reasoning trace. */
export function whyPanel(why) {
  if (!why) return "";
  const section = (title, items, className = "") =>
    items?.length
      ? `<h5>${esc(title)}</h5><ul class="${className}">${items
          .map((item) => `<li>${esc(typeof item === "string" ? item : JSON.stringify(item))}</li>`)
          .join("")}</ul>`
      : "";

  const records = (why.supporting_records || [])
    .map((record) => {
      if (record.title) {
        const links = [];
        if (record.pmid) {
          links.push(
            `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(record.pmid)}/" target="_blank" rel="noopener">PMID ${esc(record.pmid)}</a>`
          );
        }
        if (record.doi) {
          links.push(
            `<a href="https://doi.org/${esc(record.doi)}" target="_blank" rel="noopener">doi</a>`
          );
        }
        return `<li>${esc(record.title)} <span class="dim">${esc(
          record.date || ""
        )}</span> ${links.join(" · ")}</li>`;
      }
      if (record.measure_type) {
        return `<li>${esc(record.measure_type)} ${esc(
          String(record.best_reported_value ?? "—")
        )} ${esc(record.units || "")} — <span class="dim">${esc(
          record.note || ""
        )}</span></li>`;
      }
      return `<li>${esc(JSON.stringify(record))}</li>`;
    })
    .join("");

  return `<div class="why-panel">
    ${section("Observations", why.observations)}
    ${records ? `<h5>Records counted</h5><ul>${records}</ul>` : ""}
    ${section("Sources searched", why.sources)}
    ${section("Counter-evidence", why.counter_evidence, "counter")}
    ${section("Missing evidence", why.missing_evidence, "missing")}
    ${section("Assumptions", why.assumptions)}
    ${section("Not checked", why.not_checked, "missing")}
  </div>`;
}

/** Attach "Why?" toggles inside a container. */
export function wireWhy(root) {
  root.querySelectorAll("[data-why]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = root.querySelector(`#${button.dataset.why}`);
      if (!panel) return;
      const open = panel.classList.toggle("hidden");
      button.textContent = open ? "Why?" : "Hide reasoning";
    });
  });
}

export const labDisclaimer = `
  <div class="lab-disclaimer">
    <strong>Discovery Lab produces computational output.</strong>
    Predictions carry model uncertainty, generated molecules have not been made,
    and generated hypotheses have not been tested. Nothing here is medical
    advice or a clinical recommendation, and every result needs experimental
    validation before it means anything. Where a model or service is not
    installed, the interface says so rather than showing a plausible number.
  </div>`;

/** A short job status chip, used while a background job runs. */
export function jobChip(job) {
  if (!job) return "";
  const percent = Math.round((job.progress || 0) * 100);
  const stage = job.stage || job.status;
  return `<span class="job-chip ${esc(job.status)}">
    <span class="dot"></span>${esc(stage)}${
      job.status === "running" ? ` · ${percent}%` : ""
    }</span>`;
}

/** Trigger a file download from a blob, for candidate exports. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
