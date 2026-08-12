/**
 * Mechanism explorer.
 *
 * Renders the drug → target → pathway → outcome cascade. Gaps are drawn as
 * first-class stages with a dashed marker, because an unlabelled break in the
 * chain would read as "nothing happens here" rather than "not established".
 */

import { api } from "../api.js";
import {
  card,
  empty,
  entityLink,
  esc,
  evidenceBadge,
  loading,
  notice,
  provenanceList,
} from "../ui.js";
import { NeuronViewer, loadManifest } from "../viewer-brain.js";
import { wireNav } from "./entity.js";

export async function mechanismView(root, id) {
  root.innerHTML = loading("Building mechanism cascade…");
  if (!id) {
    root.innerHTML = await pickerMarkup();
    wirePicker(root);
    return;
  }
  root.innerHTML = `
    <div class="breadcrumbs">
      <a href="#/">Dashboard</a> › <a href="#/drugs">Drugs</a> › Mechanism
    </div>
    <div id="host">${loading()}</div>`;
  await renderCascadeInto(root.querySelector("#host"), id, { full: true });
}

export async function renderCascadeInto(host, drugId, { full = false } = {}) {
  host.innerHTML = loading("Building cascade…");
  let data;
  try {
    data = await api.mechanism(drugId);
  } catch (error) {
    host.innerHTML = empty(`Could not build a cascade: ${error.message}`);
    return;
  }

  const known = data.completeness.known_stages;
  const total = data.completeness.total_stages;

  host.innerHTML = `
    ${
      full
        ? `<div class="page-head">
             <h2>Mechanism of ${esc(data.drug.name)}</h2>
             <p class="lede">
               From administration to clinical outcome. Each stage is shown only
               where a retrieved source record supports it.
             </p>
           </div>`
        : ""
    }
    ${notice(
      `<strong>${known} of ${total} stages have supporting records.</strong>
       ${esc(data.completeness.note)}`,
      known === total ? "info" : "muted",
      "⇣"
    )}
    <div class="cascade">
      ${data.stages.map(stageMarkup).join("")}
    </div>`;

  wireNav(host);
}

function stageMarkup(stage) {
  if (!stage.known) {
    return `
      <div class="cascade-stage gap">
        <div class="dot"></div>
        <div class="cascade-head">
          <span class="title dim">${esc(stage.label)}</span>
          <span class="scope-tag scope-${esc(stage.scope)}">${esc(
            stage.scope.replace(/_/g, " ")
          )}</span>
          ${evidenceBadge(stage.evidence)}
        </div>
        <div class="gap-note">
          ${esc(stage.reason)}
          ${
            stage.context?.descriptors
              ? `<div style="margin-top:8px">
                   ${Object.entries(stage.context.descriptors)
                     .filter(([, v]) => v !== null && v !== undefined)
                     .map(
                       ([k, v]) =>
                         `<span class="chip">${esc(k.replace(/_/g, " "))}: ${esc(
                           String(v)
                         )}</span>`
                     )
                     .join("")}
                   <div class="small" style="margin-top:6px;color:var(--warning)">
                     ${esc(stage.context.caveat)}
                   </div>
                 </div>`
              : ""
          }
        </div>
      </div>`;
  }

  return `
    <div class="cascade-stage known">
      <div class="dot"></div>
      <div class="cascade-head">
        <span class="title">${esc(stage.label)}</span>
        <span class="scope-tag scope-${esc(stage.scope)}">${esc(
          stage.scope.replace(/_/g, " ")
        )}</span>
        ${evidenceBadge(stage.evidence)}
        <span class="small dim">${esc(stage.summary || "")}</span>
      </div>
      ${
        stage.caveat
          ? `<div class="small" style="color:var(--warning);margin-bottom:7px">${esc(
              stage.caveat
            )}</div>`
          : ""
      }
      <div class="cascade-items">
        ${(stage.items || [])
          .map(
            (item) => `
            <div class="cascade-item">
              <div class="head">
                <span class="name">${
                  item.node
                    ? `<a href="#/entity/${item.node.id}">${esc(item.title)}</a>`
                    : esc(item.title)
                }</span>
                ${item.action ? `<span class="chip">${esc(item.action)}</span>` : ""}
                ${item.gene_symbol ? `<span class="chip">${esc(item.gene_symbol)}</span>` : ""}
                ${item.evidence ? evidenceBadge(item.evidence) : ""}
              </div>
              ${item.detail ? `<div class="muted">${esc(item.detail)}</div>` : ""}
              ${
                item.via
                  ? `<div class="small dim">via ${esc(item.via)}</div>`
                  : ""
              }
              ${
                (item.provenance || []).length
                  ? `<details style="margin-top:6px">
                       <summary class="small dim clickable">${
                         item.provenance.length
                       } source record(s)</summary>
                       <div style="margin-top:7px">${provenanceList(item.provenance, {
                         compact: true,
                       })}</div>
                     </details>`
                  : ""
              }
            </div>`
          )
          .join("")}
      </div>
    </div>`;
}

async function pickerMarkup() {
  const drugs = await api.entities({ kind: "drug", limit: 200 });
  return `
    <div class="page-head">
      <h2>Mechanism explorer</h2>
      <p class="lede">
        Trace a therapy from administration through target engagement and
        downstream signalling to clinical outcome — with the evidence for each
        step, and explicit gaps where no verified record exists.
      </p>
    </div>
    <div class="card card-flush">
      ${drugs.items
        .map(
          (d) => `
          <div class="entity-row" data-nav="#/mechanism/${d.id}">
            <div class="body">
              <div class="name">${esc(d.name)}</div>
              <div class="meta">${esc(d.subtitle || "")}</div>
            </div>
            <div class="right small dim">View cascade →</div>
          </div>`
        )
        .join("")}
    </div>`;
}

function wirePicker(root) {
  wireNav(root);
}

/* ------------------------------------------------------- cellular view */

let activeCellViewer = null;

/**
 * CNS cell types, each shown as the real reconstruction of that cell.
 *
 * Every model is a digital tracing of an individual cell from a published
 * study (NeuroMorpho.org), rendered from its own SWC branch structure and
 * soma. Cell types with no reconstruction in the archive say so; none is
 * drawn as a stand-in.
 */
export async function cellsView(root) {
  root.innerHTML = loading("Loading cell models…");

  let manifest = null;
  let cells = [];
  let diseaseNote = "";
  try {
    const [brain, cellData] = await Promise.all([
      loadManifest().catch(() => null),
      api.cells().catch(() => ({ cell_types: [] })),
    ]);
    manifest = brain;
    cells = cellData.cell_types || [];
    diseaseNote = cellData.note || "";
  } catch {
    cells = [];
  }

  if (!manifest) {
    root.innerHTML = `
      <div class="page-head"><h2>Nervous-system cells</h2></div>
      ${notice(
        `The cell reconstruction assets are not present. Build them with
         <code>python scripts/build_brain_assets.py</code>.`,
        "warn",
        "⚠"
      )}`;
    return;
  }

  // Which reconstruction stands for which ontology cell type.
  const modelFor = new Map();
  for (const neuron of manifest.neurons || []) {
    for (const type of neuron.cell_types || []) {
      modelFor.set(type.toLowerCase(), neuron);
    }
  }
  const missing = new Map(
    (manifest.no_reconstruction || []).map((m) => [m.cell_type.toLowerCase(), m])
  );

  // Order the CNS cell types so the ones with a model come first.
  const withModel = cells.filter((c) => modelFor.has(c.name.toLowerCase()));
  const withoutModel = cells.filter((c) => !modelFor.has(c.name.toLowerCase()));

  // Reconstructions that do not map onto one of the tracked cell types are
  // still real CNS cells worth showing, so they are offered separately.
  const mapped = new Set(withModel.map((c) => modelFor.get(c.name.toLowerCase()).id));
  const extra = (manifest.neurons || []).filter((n) => !mapped.has(n.id));

  root.innerHTML = `
    <div class="page-head">
      <h2>Nervous-system cells</h2>
      <p class="lede">
        The cell types of the central nervous system, each shown as a real
        traced reconstruction of that cell, with the marker genes that tie it
        into the molecular graph and the diseases those markers reach.
      </p>
    </div>

    ${notice(
      `<strong>Real traced morphologies.</strong> Each model is a digital
       reconstruction of an individual cell from a published study, from
       <a href="${esc(manifest.neuron_source.source_url)}" target="_blank" rel="noopener">NeuroMorpho.org</a>.
       Branch topology and soma are exactly as traced. Species is shown for
       every cell: most CNS cell types have no human reconstruction, and a
       mouse cell is not a human one.`,
      "info",
      "⌁"
    )}

    <div class="card">
      <div class="small dim mb">CNS cell type</div>
      <div class="row mb" id="cell-picker">
        ${withModel
          .map(
            (c, i) => `
            <button class="sm ${i === 0 ? "primary" : ""}"
                    data-model="${modelFor.get(c.name.toLowerCase()).id}"
                    data-cellname="${esc(c.name)}">
              ${esc(c.name)}
            </button>`
          )
          .join("")}
        ${extra
          .map(
            (n) => `
            <button class="sm" data-model="${n.id}" data-cellname="${esc(n.label)}">
              ${esc(n.label)}
            </button>`
          )
          .join("")}
      </div>

      <div style="position:relative">
        <div class="viewer viewer-tall" id="cell3d">
          <div class="viewer-loading">Loading reconstruction…</div>
        </div>
        <div class="viewer-overlay" id="cell-legend"></div>
      </div>

      <div class="row mt">
        <button class="sm" id="cell-rotate">Pause rotation</button>
        <button class="sm" id="cell-reset">Reset view</button>
        <span class="spacer"></span>
        <span class="small dim">Drag to rotate · scroll to zoom</span>
      </div>
      <div id="cell-meta" class="mt"></div>
    </div>

    ${diseaseNote ? notice(esc(diseaseNote), "muted", "🔗") : ""}

    <h3 style="margin:26px 0 12px;font-size:14px">
      CNS cell types <span class="dim">(${cells.length})</span>
    </h3>
    <div class="grid grid-2">
      ${[...withModel, ...withoutModel]
        .map((cell) => {
          const key = cell.name.toLowerCase();
          const model = modelFor.get(key);
          const gap = missing.get(key);
          return `
          <section class="card">
            <div class="row-between" style="margin-bottom:9px">
              <strong class="clickable" data-nav="#/entity/${cell.id}">${esc(cell.name)}</strong>
              <span class="chip">${esc(cell.lineage || "—")}</span>
            </div>
            ${
              cell.description
                ? `<p class="small muted" style="margin:0 0 10px">${esc(
                    cell.description.slice(0, 260)
                  )}</p>`
                : '<p class="small dim">No ontology definition retrieved.</p>'
            }
            <div class="row" style="margin-bottom:9px">
              ${
                model
                  ? `<button class="sm" data-model="${model.id}"
                             data-cellname="${esc(cell.name)}">
                       ⌁ View 3D reconstruction
                     </button>
                     <span class="small dim">${esc(model.label)} ·
                       <span style="color:${
                         (model.species || "").toLowerCase() === "human"
                           ? "var(--ev-established)"
                           : "var(--ev-preclinical)"
                       }">${esc(model.species)}</span>
                     </span>`
                  : `<span class="gap-note" style="flex:1">
                       ${
                         gap
                           ? esc(gap.note)
                           : "No traced reconstruction of this cell type is available."
                       }
                     </span>`
              }
            </div>
            <div class="small dim mb">Marker genes</div>
            <div>
              ${(cell.markers || []).length
                ? cell.markers
                    .map((m) =>
                      m.node
                        ? `<a class="chip clickable" href="#/entity/${m.node.id}"
                             title="In the graph as ${esc(m.node.name)}">${esc(m.symbol)}</a>`
                        : `<span class="chip dim" title="Not ingested as a target">${esc(m.symbol)}</span>`
                    )
                    .join("")
                : '<span class="dim small">None recorded</span>'}
            </div>
            ${
              (cell.diseases || []).length
                ? `<div class="small dim mt mb">Diseases reached through these markers</div>
                   <div>
                     ${cell.diseases
                       .map(
                         (d) => `
                         <span class="chip clickable" data-nav="#/entity/${d.disease.id}"
                               title="via ${esc(d.via.join(", "))}">
                           ${esc(d.disease.name)}
                         </span>`
                       )
                       .join("")}
                   </div>`
                : ""
            }
            <div class="small dim mt"><span class="mono">${esc(cell.cl_id || "")}</span></div>
          </section>`;
        })
        .join("")}
    </div>`;

  /* -- 3D reconstruction ---------------------------------------------- */
  const host = root.querySelector("#cell3d");
  activeCellViewer?.dispose();
  const viewer = new NeuronViewer(host);
  activeCellViewer = viewer;
  viewer.init();

  const show = async (record, cellName) => {
    root.querySelectorAll("#cell-picker [data-model]").forEach((b) =>
      b.classList.toggle("primary", Number(b.dataset.model) === record.id)
    );

    let result;
    try {
      result = await viewer.load(record);
    } catch (error) {
      host.innerHTML = `<div class="viewer-loading">${esc(error.message)}</div>`;
      return;
    }

    root.querySelector("#cell-legend").innerHTML = result.types
      .map(
        (t) =>
          `<span style="color:${t.color}">■</span> <span class="dim">${esc(t.label)}</span>`
      )
      .join(" &nbsp; ");

    const isHuman = (record.species || "").toLowerCase() === "human";
    root.querySelector("#cell-meta").innerHTML = `
      <dl class="kv">
        ${
          cellName && cellName !== record.label
            ? `<dt>Shown for</dt>
               <dd><strong>${esc(cellName)}</strong>
                 <div class="small dim">Represented by the reconstruction below,
                 which is an example of this cell type rather than a definition
                 of it.</div></dd>`
            : ""
        }
        <dt>Reconstruction</dt>
        <dd><a href="${esc(record.url)}" target="_blank" rel="noopener">${esc(record.neuron_name)}</a>
            <span class="dim small">· ${esc(record.archive)} archive</span></dd>
        <dt>Species</dt>
        <dd>${
          isHuman
            ? `<strong style="color:var(--ev-established)">${esc(record.species)}</strong>`
            : `<strong style="color:var(--ev-preclinical)">${esc(record.species)}</strong>
               <span class="small dim">— not a human cell; shown because no
               human reconstruction of this type was available</span>`
        }</dd>
        <dt>Brain region</dt><dd>${esc((record.brain_region || []).join(", "))}</dd>
        <dt>Cell type</dt><dd>${esc((record.cell_type || []).join(", "))}</dd>
        <dt>Why it matters</dt><dd>${esc(record.relevance)}</dd>
        <dt>Cell body</dt>
        <dd>${
          record.soma?.traced
            ? `${esc(record.soma.representation)}
               <div class="small dim">Reconstructed from the ${record.soma.points}
               soma point(s) in the tracing, not substituted with a generic shape.</div>`
            : `<span class="dim">Not traced</span>
               <div class="small dim">This reconstruction records no cell body,
               so none is drawn.</div>`
        }</dd>
        <dt>Traced points</dt>
        <dd class="mono">${record.points.toLocaleString()} ·
            ${result.segments.toLocaleString()} segments ·
            spans ~${Math.round(record.extent_um)} µm</dd>
        <dt>Completeness</dt>
        <dd>${
          record.physical_integrity
            ? esc(record.physical_integrity)
            : '<span class="dim">Not stated</span>'
        }
          <div class="small dim">As recorded by the depositor. An incomplete
          axon means the tracing stops there, not that the cell lacked one.</div>
        </dd>
        <dt>Source publication</dt>
        <dd>${
          record.pmid
            ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(record.pmid)}/" target="_blank" rel="noopener">PMID ${esc(record.pmid)}</a>`
            : '<span class="dim">Not recorded</span>'
        }${
      record.doi
        ? ` · <a href="https://doi.org/${esc(record.doi)}" target="_blank" rel="noopener">doi</a>`
        : ""
    }</dd>
      </dl>`;
  };

  root.querySelectorAll("[data-model]").forEach((button) =>
    button.addEventListener("click", () => {
      const record = (manifest.neurons || []).find(
        (n) => n.id === Number(button.dataset.model)
      );
      if (!record) return;
      show(record, button.dataset.cellname);
      host.scrollIntoView({ behavior: "smooth", block: "center" });
    })
  );
  root.querySelector("#cell-rotate").addEventListener("click", (event) => {
    const on = !viewer.autoRotate;
    viewer.setAutoRotate(on);
    event.target.textContent = on ? "Pause rotation" : "Resume rotation";
  });
  root.querySelector("#cell-reset").addEventListener("click", () =>
    viewer.resetView()
  );

  const first = withModel[0];
  if (first) {
    await show(modelFor.get(first.name.toLowerCase()), first.name);
  } else if ((manifest.neurons || []).length) {
    await show(manifest.neurons[0], null);
  }

  wireNav(root);
}
