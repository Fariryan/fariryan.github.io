/** Paginated browse views for each entity kind. */

import { api } from "../api.js";
import {
  empty,
  esc,
  evidenceBadge,
  fmt,
  kindBadge,
  loading,
  notice,
} from "../ui.js";
import { wireNav } from "./entity.js";

const CONFIG = {
  diseases: {
    kind: "disease",
    title: "Diseases",
    lede: "Neurological and neuropsychiatric diseases, anchored to MONDO ontology terms. Definitions are reproduced verbatim from the ontology.",
  },
  drugs: {
    kind: "drug",
    title: "Therapeutic entities",
    lede: "Approved and investigational therapies. Development phase and approval status come from ChEMBL and drug regulators respectively — they are different claims and are shown separately.",
  },
  molecules: {
    kind: "compound",
    title: "Chemical compounds",
    lede: "Small molecules with validated structures, physicochemical properties, and 3D conformers.",
  },
  targets: {
    kind: "target",
    title: "Molecular targets",
    lede: "Protein targets backed by reviewed UniProt records, with sequence features, GO annotations, and experimental structures.",
  },
};

export async function listView(root, route, params) {
  const config = CONFIG[route];
  const page = Number(params.get("page") || 0);
  const query = params.get("q") || "";
  const family = params.get("family") || "";
  const limit = 50;

  root.innerHTML = `
    <div class="page-head">
      <h2>${esc(config.title)}</h2>
      <p class="lede">${esc(config.lede)}</p>
    </div>
    <div class="toolbar">
      <input type="search" id="filter" placeholder="Filter by name…"
             value="${esc(query)}" style="min-width:260px" />
      ${
        route === "diseases"
          ? `<select id="family">
               <option value="">All families</option>
             </select>`
          : ""
      }
      <span class="spacer"></span>
      <span class="dim small" id="count"></span>
    </div>
    <div id="list">${loading()}</div>
    <div class="row" style="justify-content:center;margin-top:18px" id="pager"></div>`;

  const listHost = root.querySelector("#list");

  if (route === "diseases") {
    const stats = await api.stats();
    const select = root.querySelector("#family");
    (stats.disease_families || []).forEach((f) => {
      const option = document.createElement("option");
      option.value = f.key;
      option.textContent = `${f.label} (${f.count})`;
      if (f.key === family) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      window.location.hash = `#/diseases${
        select.value ? `?family=${select.value}` : ""
      }`;
    });
  }

  const data = await api.entities({
    kind: config.kind,
    q: query,
    family,
    limit,
    offset: page * limit,
  });

  root.querySelector("#count").textContent = `${fmt.num(data.total)} entities`;

  if (!data.items.length) {
    listHost.innerHTML = empty("No entities match this filter.");
    return;
  }

  listHost.innerHTML = `<div class="card card-flush">${data.items
    .map((item) => row(item, config.kind))
    .join("")}</div>`;
  wireNav(listHost);

  const pages = Math.ceil(data.total / limit);
  if (pages > 1) {
    const pager = root.querySelector("#pager");
    const base = `#/${route}?${query ? `q=${encodeURIComponent(query)}&` : ""}${
      family ? `family=${family}&` : ""
    }`;
    pager.innerHTML = `
      <button class="sm" ${page === 0 ? "disabled" : ""} data-page="${page - 1}">← Previous</button>
      <span class="small dim">Page ${page + 1} of ${pages}</span>
      <button class="sm" ${page >= pages - 1 ? "disabled" : ""} data-page="${page + 1}">Next →</button>`;
    pager.querySelectorAll("[data-page]").forEach((button) =>
      button.addEventListener("click", () => {
        window.location.hash = `${base}page=${button.dataset.page}`;
      })
    );
  }

  const filter = root.querySelector("#filter");
  let timer;
  filter.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      window.location.hash = `#/${route}?q=${encodeURIComponent(filter.value)}${
        family ? `&family=${family}` : ""
      }`;
    }, 320);
  });
}

function row(item, kind) {
  const d = item.detail || {};
  let right = "";

  if (kind === "disease") {
    right = `<span class="mono small">${d.targets || 0} targets · ${
      d.drugs || 0
    } drugs · ${d.trials || 0} trials</span>`;
  } else if (kind === "drug") {
    const phase =
      d.max_phase !== null && d.max_phase !== undefined
        ? d.max_phase >= 4
          ? '<span class="chip">phase 4 reached</span>'
          : `<span class="chip">max phase ${d.max_phase}</span>`
        : "";
    right = `${d.withdrawn ? '<span class="chip" style="color:var(--danger)">withdrawn</span>' : ""}
             ${d.black_box_warning ? '<span class="chip" style="color:var(--warning)">boxed warning</span>' : ""}
             ${phase}`;
  } else if (kind === "target") {
    right = `<span class="mono small dim">${esc(d.uniprot || "")}</span>`;
  } else if (kind === "compound") {
    right = `<span class="mono small dim">${esc(d.formula || "")}${
      d.mw ? ` · ${d.mw}` : ""
    }</span>`;
  }

  return `
    <div class="entity-row" data-nav="#/entity/${item.id}">
      ${kindBadge(item.kind)}
      <div class="body">
        <div class="name">${esc(item.name)}</div>
        <div class="meta">${esc(item.subtitle || item.description || item.primary_id)}</div>
      </div>
      <div class="right">${right}</div>
    </div>`;
}

/* ---------------------------------------------------------------- search */

export async function searchView(root, params) {
  const query = params.get("q") || "";
  root.innerHTML = `
    <div class="page-head">
      <h2>Search results</h2>
      <p class="lede">Results for “${esc(query)}”</p>
    </div>
    <div id="results">${loading()}</div>`;

  if (!query) {
    root.querySelector("#results").innerHTML = empty("Enter a search term.");
    return;
  }

  const data = await api.search(query, { limit: 80 });
  const host = root.querySelector("#results");

  if (!data.total) {
    host.innerHTML = empty(`Nothing matched “${query}”.`, "⌕");
    return;
  }

  host.innerHTML = Object.entries(data.grouped)
    .map(
      ([kind, items]) => `
      <section class="card card-flush">
        <div style="padding:11px 14px;border-bottom:1px solid var(--border)">
          ${kindBadge(kind)} <span class="dim small">${items.length} result(s)</span>
        </div>
        ${items
          .map(
            (item) => `
            <div class="entity-row" data-nav="#/entity/${item.id}">
              <div class="body">
                <div class="name">${esc(item.title)}</div>
                <div class="meta">${esc(item.subtitle || "")}</div>
              </div>
              <div class="right small dim">${esc(item.match_type)}</div>
            </div>`
          )
          .join("")}
      </section>`
    )
    .join("");
  wireNav(host);
}

/* -------------------------------------------------------------- pathways */

export async function pathwaysView(root, params) {
  const query = params.get("q") || "";
  root.innerHTML = `
    <div class="page-head">
      <h2>Pathways</h2>
      <p class="lede">
        Curated biological pathways from Reactome. Membership means a target
        protein participates in the pathway — it does not by itself establish
        that a drug acting on that target modulates the pathway in patients.
      </p>
    </div>
    <div class="toolbar">
      <input type="search" id="filter" placeholder="Filter pathways…" value="${esc(
        query
      )}" style="min-width:280px" />
    </div>
    <div id="list">${loading()}</div>`;

  const data = await api.pathways({ q: query, limit: 120 });
  const host = root.querySelector("#list");

  host.innerHTML = data.items.length
    ? `<div class="card card-flush">${data.items
        .map(
          (p) => `
          <div class="entity-row" data-nav="#/entity/${p.id}">
            ${kindBadge("pathway")}
            <div class="body">
              <div class="name">${esc(p.name)}</div>
              <div class="meta">${esc((p.summary || "").slice(0, 160))}</div>
            </div>
            <div class="right">
              <span class="mono small">${p.member_count} protein(s)</span>
              <div class="small dim mono">${esc(p.stable_id || "")}</div>
            </div>
          </div>`
        )
        .join("")}</div>`
    : empty("No pathways matched.");
  wireNav(host);

  let timer;
  root.querySelector("#filter").addEventListener("input", (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      window.location.hash = `#/pathways?q=${encodeURIComponent(event.target.value)}`;
    }, 320);
  });
}

/* ---------------------------------------------------- trials & literature */

export async function trialsView(root) {
  root.innerHTML = `
    <div class="page-head">
      <h2>Clinical trials</h2>
      <p class="lede">
        Study records from ClinicalTrials.gov. Design fields are shown so a
        reader can judge a study rather than take its existence as a result.
      </p>
    </div>
    <div id="list">${loading()}</div>`;

  const data = await api.trials({ limit: 150 });
  root.querySelector("#list").innerHTML = `
    ${notice(esc(data.caveat), "warn", "🔬")}
    <div class="card card-flush"><div class="table-scroll">
      <table>
        <thead><tr>
          <th>NCT</th><th>Title</th><th>Phase</th><th>Status</th>
          <th>Enrolment</th><th>Allocation</th><th>Masking</th><th>Results</th>
        </tr></thead>
        <tbody>${data.items
          .map(
            (t) => `
            <tr>
              <td class="mono small nowrap">
                <a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.nct_id)}</a>
              </td>
              <td class="small">${esc(t.title)}</td>
              <td class="small nowrap">${esc(t.phase || "—")}</td>
              <td class="small nowrap">${esc(t.status || "—")}</td>
              <td class="mono small">${t.enrollment ?? "—"}</td>
              <td class="small">${esc(t.allocation || "—")}</td>
              <td class="small">${esc(t.masking || "—")}</td>
              <td class="small">${
                t.has_results
                  ? '<span style="color:var(--ev-established)">posted</span>'
                  : '<span class="dim">none posted</span>'
              }</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>
    </div></div>`;
}

export async function publicationsView(root, params) {
  const design = params.get("design") || "";
  root.innerHTML = `
    <div class="page-head">
      <h2>Publications</h2>
      <p class="lede">
        Citations retrieved from PubMed. Every field is copied from the source
        record — no citation is ever composed or completed by a model.
      </p>
    </div>
    <div class="toolbar">
      <select id="design"><option value="">All study designs</option></select>
      <span class="spacer"></span><span class="dim small" id="count"></span>
    </div>
    <div id="list">${loading()}</div>`;

  const data = await api.publications({ design, limit: 150 });
  root.querySelector("#count").textContent = `${fmt.num(data.total)} publications`;

  const select = root.querySelector("#design");
  (data.designs || []).filter(Boolean).forEach((d) => {
    const option = document.createElement("option");
    option.value = d;
    option.textContent = d;
    if (d === design) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    window.location.hash = `#/publications${
      select.value ? `?design=${encodeURIComponent(select.value)}` : ""
    }`;
  });

  root.querySelector("#list").innerHTML = data.items.length
    ? `<div class="card">${data.items
        .map(
          (p) => `
          <div class="pub-item">
            <div class="title clickable" data-nav="#/entity/${p.node_id}">${esc(p.title)}</div>
            <div class="meta">
              <span>${esc(p.journal || "—")}</span><span>${p.year || "—"}</span>
              ${p.study_design ? `<span class="chip">${esc(p.study_design)}</span>` : ""}
              ${
                p.species_context && p.species_context !== "unknown"
                  ? `<span class="chip">${esc(p.species_context)}</span>`
                  : ""
              }
              <a href="${esc(p.url)}" target="_blank" rel="noopener">PMID ${esc(p.pmid)}</a>
            </div>
            <div class="small dim" style="margin-top:3px">${esc(
              (p.authors || []).slice(0, 6).join(", ")
            )}</div>
          </div>`
        )
        .join("")}</div>`
    : empty("No publications matched.");
  wireNav(root.querySelector("#list"));
}

/* --------------------------------------------------------------- sources */

export async function sourcesView(root) {
  root.innerHTML = loading();
  const data = await api.sources();

  root.innerHTML = `
    <div class="page-head">
      <h2>Data sources &amp; licensing</h2>
      <p class="lede">
        Every fact in this platform traces to one of these sources. Licence
        terms are recorded alongside the data and shown here so you can tell
        what you may do with anything you export.
      </p>
    </div>
    <div class="grid grid-2">
      ${data.active
        .map(
          (s) => `
          <section class="card">
            <div class="row-between" style="margin-bottom:7px">
              <strong>${esc(s.name)}</strong>
              <span class="chip">${esc(s.license || "licence not recorded")}</span>
            </div>
            <p class="small muted" style="margin:0 0 9px">${esc(s.description || "")}</p>
            <div class="small dim">${esc(s.attribution || "")}</div>
            <div class="mt row">
              ${
                s.homepage
                  ? `<a class="small" href="${esc(s.homepage)}" target="_blank" rel="noopener">Homepage ↗</a>`
                  : ""
              }
              ${
                s.license_url
                  ? `<a class="small" href="${esc(s.license_url)}" target="_blank" rel="noopener">Licence ↗</a>`
                  : ""
              }
            </div>
          </section>`
        )
        .join("")}
    </div>

    <h3 style="margin:26px 0 12px;font-size:14px">Sources not currently ingested</h3>
    ${notice(
      `The architecture supports these, but they are not part of the default
       ingestion pass. They are listed so the platform's coverage is not
       overstated.`,
      "muted",
      "◌"
    )}
    <div class="card card-flush">
      <table>
        <thead><tr><th>Source</th><th>Status</th><th>Note</th></tr></thead>
        <tbody>${data.planned
          .map(
            (p) => `
            <tr>
              <td><strong>${esc(p.name)}</strong></td>
              <td class="small nowrap"><span class="chip">${esc(p.status)}</span></td>
              <td class="small muted">${esc(p.note)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>
    </div>`;
}
