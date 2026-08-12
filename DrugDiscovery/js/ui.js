/**
 * DOM helpers and the shared scientific-display primitives.
 *
 * Evidence badges, provenance blocks, and structure-provenance banners are
 * defined once here. That matters: these are the elements that stop a
 * preclinical finding from being displayed like an approved indication, so
 * they must look and behave identically everywhere they appear.
 */

/** Escape text for safe interpolation into HTML. */
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const el = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
};

export const fmt = {
  num(value, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  },
  /** Format a measured value, preserving a censoring relation such as ">". */
  measure(value, units, relation) {
    if (value === null || value === undefined) return "—";
    const magnitude = Math.abs(value);
    const rendered =
      magnitude >= 10000 || (magnitude < 0.01 && magnitude > 0)
        ? Number(value).toExponential(2)
        : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const rel = relation && relation !== "=" ? esc(relation) + " " : "";
    return `${rel}${rendered}${units ? " " + esc(units) : ""}`;
  },
  date(value) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? esc(value)
      : parsed.toISOString().slice(0, 10);
  },
  /** "Insufficient verified evidence" rather than a blank or a zero. */
  orUnknown(value) {
    if (value === null || value === undefined || value === "") {
      return '<span class="dim">Insufficient verified evidence</span>';
    }
    return esc(value);
  },
};

export const KIND_LABELS = {
  disease: "Disease",
  drug: "Drug",
  compound: "Compound",
  target: "Target",
  gene: "Gene",
  pathway: "Pathway",
  brain_region: "Region",
  cell_type: "Cell type",
  structure: "Structure",
  trial: "Trial",
  publication: "Paper",
  biomarker: "Biomarker",
  phenotype: "Phenotype",
};

export const kindBadge = (kind) =>
  `<span class="kind-badge kind-${esc(kind)}">${esc(
    KIND_LABELS[kind] || kind
  )}</span>`;

/**
 * Evidence badge. The title attribute carries the full definition so the
 * meaning of a level is always one hover away.
 */
export function evidenceBadge(evidence) {
  if (!evidence) return "";
  return `<span class="ev ev-${esc(evidence.tone)}" title="${esc(
    evidence.description || ""
  )}">${esc(evidence.label)}</span>`;
}

/** Link to an entity page. */
export const entityLink = (node, extraClass = "") => {
  if (!node) return '<span class="dim">—</span>';
  return `<a class="${extraClass}" href="#/entity/${node.id}">${esc(
    node.name
  )}</a>`;
};

export function entityRow(node, right = "") {
  return `
    <div class="entity-row" data-nav="#/entity/${node.id}">
      ${kindBadge(node.kind)}
      <div class="body">
        <div class="name">${esc(node.name)}</div>
        <div class="meta">${esc(node.subtitle || node.primary_id || "")}</div>
      </div>
      <div class="right">${right}</div>
    </div>`;
}

/** Render provenance records as an auditable list. */
export function provenanceList(records, { compact = false } = {}) {
  if (!records || !records.length) {
    return `<div class="gap-note">No source record is attached to this statement.</div>`;
  }
  return records
    .map((p) => {
      const bits = [];
      if (p.record_id) bits.push(`record <span class="mono">${esc(p.record_id)}</span>`);
      if (p.evidence_type) bits.push(esc(p.evidence_type.replace(/_/g, " ")));
      if (p.species && p.species !== "unknown") bits.push(`species: ${esc(p.species)}`);
      if (p.retrieved_at) bits.push(`retrieved ${fmt.date(p.retrieved_at)}`);
      if (p.confidence !== null && p.confidence !== undefined) {
        bits.push(`source score ${Number(p.confidence).toFixed(2)}`);
      }

      const links = [];
      if (p.url) links.push(`<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.source_name || "source")}</a>`);
      if (p.pmid) {
        links.push(
          `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(p.pmid)}/" target="_blank" rel="noopener">PMID ${esc(p.pmid)}</a>`
        );
      }
      if (p.doi) {
        links.push(`<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">doi:${esc(p.doi)}</a>`);
      }

      return `
        <div class="prov">
          <div class="src">${esc(p.source_name || p.source_key || "Unknown source")}
            ${p.license ? `<span class="dim small">· ${esc(p.license)}</span>` : ""}
          </div>
          <div class="meta">${bits.join(" · ")}</div>
          ${p.experimental_context && !compact
            ? `<div class="meta">${esc(p.experimental_context.slice(0, 300))}</div>`
            : ""}
          ${p.note && !compact ? `<div class="meta">${esc(p.note)}</div>` : ""}
          <div>${links.join(" · ")}</div>
        </div>`;
    })
    .join("");
}

/**
 * Banner describing how a set of 3D coordinates was produced.
 *
 * Deliberately loud for anything non-experimental. A docking pose or a
 * generated conformer must never be mistaken for an observed structure.
 */
export function structureBanner(provenance) {
  if (!provenance || !provenance.kind) {
    return `<div class="struct-banner struct-illustrative">
      <span class="label">No structure</span>
      <span class="warn">${esc(provenance?.warning || "No coordinates available.")}</span>
    </div>`;
  }
  return `<div class="struct-banner struct-${esc(provenance.kind)}">
    <span class="label">${esc(provenance.label)}</span>
    ${provenance.warning ? `<span class="warn">${esc(provenance.warning)}</span>` : ""}
  </div>`;
}

export const notice = (text, tone = "info", icon = "ℹ") =>
  `<div class="notice notice-${tone}"><span class="ico">${icon}</span><div>${text}</div></div>`;

export const empty = (message, icon = "◌") =>
  `<div class="empty"><div class="big">${icon}</div>${esc(message)}</div>`;

export const loading = (message = "Loading…") =>
  `<div class="loading"><span class="spinner"></span> ${esc(message)}</div>`;

export function card(title, body, extra = "") {
  return `<section class="card">
    ${title ? `<h3>${title}${extra ? `<span class="spacer"></span>${extra}` : ""}</h3>` : ""}
    ${body}
  </section>`;
}

export function statTile(value, label, sub = "") {
  return `<div class="stat">
    <div class="value">${typeof value === "number" ? fmt.num(value) : esc(value)}</div>
    <div class="label">${esc(label)}</div>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
  </div>`;
}

/** Tab strip with a callback per tab. */
export function tabs(container, items, onSelect, initial = 0) {
  const strip = el(
    `<div class="tabs">${items
      .map(
        (t, i) =>
          `<button data-i="${i}" class="${i === initial ? "active" : ""}">${esc(
            t.label
          )}${t.count !== undefined ? `<span class="n">${t.count}</span>` : ""}</button>`
      )
      .join("")}</div>`
  );
  const panel = el('<div class="tab-panel"></div>');
  container.appendChild(strip);
  container.appendChild(panel);

  const select = (index) => {
    strip.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.i) === index)
    );
    panel.innerHTML = "";
    onSelect(items[index], panel, index);
  };

  strip.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) select(Number(button.dataset.i));
  });

  select(initial);
  return { select, panel };
}

export const disclaimer = `
  <div class="disclaimer">
    <strong>Scientific research and education only.</strong>
    This platform does not provide medical advice, diagnosis, or treatment
    recommendations, and must not be used to make decisions about any person's
    care. Regulatory status, indications, and safety information are summarised
    from source records and are not a substitute for the approved product label
    or professional judgement. Every displayed claim links to the source record
    it came from; where no verified record exists, the interface says so rather
    than filling the gap.
  </div>`;
