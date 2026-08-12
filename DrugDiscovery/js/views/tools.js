/** Brain viewer, knowledge graph, drug–disease matrix, comparison, admin. */

import { api } from "../api.js";
import { compareStore } from "../compare-store.js";
import {
  card,
  empty,
  entityLink,
  esc,
  evidenceBadge,
  fmt,
  kindBadge,
  loading,
  notice,
  provenanceList,
} from "../ui.js";
import { BrainViewer, NeuronViewer, ROLE_STYLE, loadManifest } from "../viewer-brain.js";
import { GraphViewer, KIND_COLORS } from "../viewer-graph.js";
import { wireNav } from "./entity.js";

let activeBrain = null;
let activeNeuron = null;
let activeGraph = null;

/* ----------------------------------------------------------------- brain */

export async function brainView(root) {
  root.innerHTML = loading("Loading neuroanatomy…");

  let manifest;
  let regions = [];
  try {
    [manifest, regions] = await Promise.all([
      loadManifest(),
      api.brainRegions().then((d) => d.regions).catch(() => []),
    ]);
  } catch (error) {
    root.innerHTML = `
      <div class="page-head"><h2>Neuroanatomy</h2></div>
      ${notice(
        `The 3D atlas assets are not present. Build them with
         <code>python scripts/build_brain_assets.py</code>, which downloads the
         Allen Human Reference Atlas and NeuroMorpho reconstructions.
         <br /><span class="small dim">${esc(error.message)}</span>`,
        "warn",
        "⚠"
      )}`;
    return;
  }

  // Map the platform's ontology-anchored regions onto atlas surfaces via the
  // aliases recorded at build time, so clicking a real mesh opens the record.
  const aliasToRegion = new Map();
  for (const region of regions) {
    aliasToRegion.set(region.name.toLowerCase(), region);
  }
  const structureRegion = (record) => {
    for (const alias of record.aliases || []) {
      const hit = aliasToRegion.get(alias.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };

  const roles = [...new Set(manifest.structures.map((s) => s.role))];
  const defaultVisible = manifest.structures
    .filter((s) => s.role !== "lobe" && s.role !== "white_matter")
    .map((s) => s.acronym);

  root.innerHTML = `
    <div class="page-head">
      <h2>Neuroanatomy</h2>
      <p class="lede">
        Surface meshes from the <strong>Allen Human Reference Atlas (3D)</strong>,
        segmented from a real human specimen. Click a structure to open its
        record.
      </p>
    </div>

    ${notice(
      `<strong>Real atlas geometry.</strong>
       ${esc(manifest.atlas.citation)} ·
       ${esc(manifest.atlas.species)} at
       ${esc(String((manifest.atlas.resolution_um || [])[0] || "500"))} µm.
       ${esc(manifest.atlas.processing)}
       <a href="${esc(manifest.atlas.source_url)}" target="_blank" rel="noopener">Atlas source ↗</a>
       · <a href="https://doi.org/${esc(manifest.atlas.doi)}" target="_blank" rel="noopener">doi:${esc(manifest.atlas.doi)}</a>`,
      "info",
      "🧠"
    )}

    <div class="viewer-toolbar">
      <span class="small dim">View:</span>
      <button class="sm" data-view="lateral">Lateral</button>
      <button class="sm" data-view="medial">Medial</button>
      <button class="sm" data-view="anterior">Anterior</button>
      <button class="sm" data-view="superior">Superior</button>
      <button class="sm" data-view="posterior">Posterior</button>
      <span style="width:10px"></span>
      <span class="small dim">Shell:</span>
      <input type="range" id="opacity" min="0" max="45" value="8" style="width:100px" />
      <span class="spacer"></span>
      <select id="role-filter">
        <option value="">All structures</option>
        ${roles
          .map((r) => `<option value="${esc(r)}">${esc(r.replace(/_/g, " "))}</option>`)
          .join("")}
      </select>
      <button class="sm" id="reset-emph">Clear focus</button>
    </div>

    <!-- The overlay is a sibling, not a child: initialising a viewer clears
         its container, which would detach anything nested inside it. -->
    <div style="position:relative">
      <div class="viewer viewer-tall" id="brain">
        <div class="viewer-loading">Loading atlas surfaces…</div>
      </div>
      <div class="viewer-overlay" id="brain-info">Drag to rotate · scroll to zoom</div>
    </div>

    <div class="graph-legend">
      ${roles
        .map(
          (role) => `
          <div class="item">
            <span class="swatch" style="background:#${(ROLE_STYLE[role]?.color ?? 0x93a4b8)
              .toString(16)
              .padStart(6, "0")}"></span>
            ${esc(role.replace(/_/g, " "))}
          </div>`
        )
        .join("")}
    </div>

    ${card(
      `Atlas structures <span class="dim">(${manifest.structures.length})</span>`,
      `<div class="grid grid-3" style="gap:7px">
         ${manifest.structures
           .map(
             (s) => `
             <span class="chip clickable" data-acronym="${esc(s.acronym)}"
                   title="${esc(s.name)} · ${s.triangles.toLocaleString()} triangles">
               ${esc(s.label)}
             </span>`
           )
           .join("")}
       </div>
       <div class="small dim mt">
         Hover a name to highlight it in the scene; click to focus the camera.
       </div>`
    )}

    ${card(
      "Regions this atlas does not resolve",
      `<p class="small muted" style="margin-top:-4px">
         The platform tracks these regions, but the atlas does not segment them
         as separate surfaces at this resolution. They are listed rather than
         approximated with a substitute shape.
       </p>
       ${(manifest.unsegmented || [])
         .map(
           (u) => `
           <div style="padding:6px 0;border-bottom:1px solid var(--border)">
             <strong>${esc(u.region)}</strong>
             <span class="small dim"> — ${esc(u.note)}</span>
           </div>`
         )
         .join("")}`
    )}

    ${card(
      `Reconstructed cells <span class="dim">(${manifest.neurons.length})</span>`,
      `<p class="small muted" style="margin-top:-4px">
         Digital reconstructions of individual cells traced from real tissue in
         published studies, from
         <a href="${esc(manifest.neuron_source.source_url)}" target="_blank" rel="noopener">NeuroMorpho.org</a>.
         Species is shown for each: several key cell types have no human
         reconstruction, and a mouse neuron is not a human one.
       </p>
       <div class="row mb">
         ${manifest.neurons
           .map(
             (n, i) => `
             <button class="sm ${i === 0 ? "primary" : ""}" data-neuron="${n.id}">
               ${esc(n.label)}
             </button>`
           )
           .join("")}
       </div>
       <div style="position:relative">
         <div class="viewer" id="neuron" style="height:420px">
           <div class="viewer-loading">Loading reconstruction…</div>
         </div>
         <div class="viewer-overlay" id="neuron-legend"></div>
       </div>
       <div class="row mt">
         <button class="sm" id="neuron-rotate">Pause rotation</button>
         <button class="sm" id="neuron-reset">Reset view</button>
       </div>
       <div id="neuron-meta" class="mt"></div>`
    )}`;

  /* -- brain scene ---------------------------------------------------- */
  const host = root.querySelector("#brain");
  const info = root.querySelector("#brain-info");

  activeBrain?.dispose();
  const viewer = new BrainViewer(host);
  activeBrain = viewer;
  viewer.init();

  await viewer.load(manifest);
  viewer.setVisible(defaultVisible);
  viewer.setShellOpacity(0.08);
  viewer.setView("lateral");

  const describe = (record) => {
    const region = structureRegion(record);
    return `<strong>${esc(record.name)}</strong>
      <span class="mono dim">${esc(record.acronym)}</span>
      <span class="dim">· ${record.triangles.toLocaleString()} triangles</span>
      ${region ? `<span class="dim">· click to open ${esc(region.name)}</span>` : ""}`;
  };

  viewer.onStructureHover = (record) => {
    info.innerHTML = record
      ? describe(record)
      : "Drag to rotate · scroll to zoom · click a structure to open its record";
  };
  viewer.onStructureClick = (record) => {
    const region = structureRegion(record);
    if (region) {
      window.location.hash = `#/entity/${region.id}`;
    } else {
      viewer.emphasise(record.acronym);
      viewer.focus(record.acronym);
      info.innerHTML = describe(record);
    }
  };

  root.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => viewer.setView(button.dataset.view))
  );
  root.querySelector("#opacity").addEventListener("input", (event) => {
    viewer.setShellOpacity(Number(event.target.value) / 100);
  });
  root.querySelector("#role-filter").addEventListener("change", (event) => {
    const role = event.target.value;
    viewer.setVisible(
      role
        ? manifest.structures.filter((s) => s.role === role).map((s) => s.acronym)
        : defaultVisible
    );
  });
  root.querySelector("#reset-emph").addEventListener("click", () => {
    viewer.emphasise(null);
    viewer.setVisible(defaultVisible);
  });
  root.querySelectorAll("[data-acronym]").forEach((chip) => {
    chip.addEventListener("mouseenter", () => viewer.emphasise(chip.dataset.acronym));
    chip.addEventListener("click", async () => {
      await viewer.ensureStructure(chip.dataset.acronym);
      const mesh = viewer.meshes.get(chip.dataset.acronym);
      if (mesh) mesh.visible = true;
      viewer.emphasise(chip.dataset.acronym);
      viewer.focus(chip.dataset.acronym);
    });
  });

  /* -- neuron scene --------------------------------------------------- */
  const neuronHost = root.querySelector("#neuron");
  activeNeuron?.dispose();
  const neuronViewer = new NeuronViewer(neuronHost);
  activeNeuron = neuronViewer;
  neuronViewer.init();

  const showNeuron = async (record) => {
    root.querySelectorAll("[data-neuron]").forEach((b) =>
      b.classList.toggle("primary", Number(b.dataset.neuron) === record.id)
    );
    let result;
    try {
      result = await neuronViewer.load(record);
    } catch (error) {
      neuronHost.innerHTML = `<div class="viewer-loading">${esc(error.message)}</div>`;
      return;
    }

    root.querySelector("#neuron-legend").innerHTML = result.types
      .map(
        (t) =>
          `<span style="color:${t.color}">■</span> <span class="dim">${esc(t.label)}</span>`
      )
      .join(" &nbsp; ");

    const isHuman = (record.species || "").toLowerCase() === "human";
    root.querySelector("#neuron-meta").innerHTML = `
      <dl class="kv">
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
        <dt>Relevance</dt><dd>${esc(record.relevance)}</dd>
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
          axon means the tracing stops, not that the cell lacked one.</div>
        </dd>
        <dt>Source publication</dt>
        <dd>${
          record.pmid
            ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(record.pmid)}/" target="_blank" rel="noopener">PMID ${esc(record.pmid)}</a>`
            : '<span class="dim">Not recorded</span>'
        }
        ${
          record.doi
            ? ` · <a href="https://doi.org/${esc(record.doi)}" target="_blank" rel="noopener">doi</a>`
            : ""
        }</dd>
      </dl>`;
  };

  root.querySelectorAll("[data-neuron]").forEach((button) =>
    button.addEventListener("click", () => {
      const record = manifest.neurons.find(
        (n) => n.id === Number(button.dataset.neuron)
      );
      if (record) showNeuron(record);
    })
  );
  root.querySelector("#neuron-rotate").addEventListener("click", (event) => {
    const on = !neuronViewer.autoRotate;
    neuronViewer.setAutoRotate(on);
    event.target.textContent = on ? "Pause rotation" : "Resume rotation";
  });
  root.querySelector("#neuron-reset").addEventListener("click", () =>
    neuronViewer.resetView()
  );

  if (manifest.neurons.length) await showNeuron(manifest.neurons[0]);

  wireNav(root);
}

/* ----------------------------------------------------------------- graph */

export async function graphView(root, id) {
  if (!id) {
    const diseases = await api.entities({ kind: "disease", limit: 40 });
    root.innerHTML = `
      <div class="page-head">
        <h2>Knowledge graph</h2>
        <p class="lede">
          Traverse the relationships between diseases, targets, drugs,
          compounds, pathways, and structures. Edge thickness and style encode
          evidence strength.
        </p>
      </div>
      <div class="card card-flush">
        ${diseases.items
          .map(
            (d) => `
            <div class="entity-row" data-nav="#/graph/${d.id}">
              ${kindBadge("disease")}
              <div class="body"><div class="name">${esc(d.name)}</div></div>
              <div class="right small dim">Explore →</div>
            </div>`
          )
          .join("")}
      </div>`;
    wireNav(root);
    return;
  }

  root.innerHTML = `
    <div class="page-head">
      <h2 id="graph-title">Knowledge graph</h2>
    </div>
    <div class="viewer-toolbar">
      <span class="small dim">Depth:</span>
      <select id="depth">
        <option value="1">1 hop</option>
        <option value="2" selected>2 hops</option>
        <option value="3">3 hops</option>
      </select>
      <span class="small dim">Layout:</span>
      <select id="layout">
        <option value="concentric">Rings by distance</option>
        <option value="cose">Force-directed</option>
        <option value="breadthfirst">Hierarchical</option>
        <option value="circle">Circle</option>
      </select>
      <span class="small dim">Max nodes:</span>
      <select id="maxnodes">
        <option value="40">40</option>
        <option value="60" selected>60</option>
        <option value="120">120</option>
        <option value="250">250</option>
      </select>
      <button class="sm" id="labels">All labels</button>
      <button class="sm" id="edgelabels">Edge labels</button>
      <button class="sm" id="fit">Fit</button>
      <span class="spacer"></span>
      <span class="small dim" id="graph-stats"></span>
    </div>
    <div id="graph-canvas"></div>
    <div class="graph-legend" id="legend"></div>
    <div id="edge-detail" class="mt"></div>`;

  const data = await api.graph(id, { depth: 2, max_nodes: 60 });
  root.querySelector("#graph-title").innerHTML = `Knowledge graph — ${esc(
    data.root.name
  )}`;

  const container = root.querySelector("#graph-canvas");
  activeGraph?.destroy();
  const viewer = new GraphViewer(container);
  activeGraph = viewer;

  const draw = (payload) => {
    viewer.render(payload);
    root.querySelector("#graph-stats").textContent = `${payload.nodes.length} nodes · ${
      payload.edges.length
    } edges${payload.truncated ? " (truncated)" : ""}`;
    const kinds = [...new Set(payload.nodes.map((n) => n.kind))];
    root.querySelector("#legend").innerHTML = kinds
      .map(
        (k) =>
          `<div class="item"><span class="swatch" style="background:${
            KIND_COLORS[k] || "#93a4b8"
          }"></span>${esc(k.replace(/_/g, " "))}</div>`
      )
      .join("") +
      `<div class="item" style="margin-left:14px">
         <span style="width:22px;height:0;border-top:3px solid var(--ev-established)"></span>
         solid = stronger evidence · dashed = weaker
       </div>
       <div class="item">larger = more connected · rings = hops from the centre</div>`;
  };

  draw(data);

  viewer.onNodeTap = (nodeId) => {
    window.location.hash = `#/entity/${nodeId}`;
  };
  viewer.onEdgeTap = (edge) => {
    root.querySelector("#edge-detail").innerHTML = card(
      "Selected relationship",
      `<div class="row">
         <strong>${esc(edge.label)}</strong>
         ${evidenceBadge({
           tone: edge.level,
           label: edge.level.replace(/_/g, " "),
           description: "",
         })}
       </div>`
    );
  };

  const reload = async () => {
    const depth = Number(root.querySelector("#depth").value);
    const maxNodes = Number(root.querySelector("#maxnodes").value);
    container.innerHTML = "";
    draw(await api.graph(id, { depth, max_nodes: maxNodes }));
  };

  root.querySelector("#depth").addEventListener("change", reload);
  root.querySelector("#maxnodes").addEventListener("change", reload);
  root.querySelector("#layout").addEventListener("change", (event) =>
    viewer.setLayout(event.target.value)
  );
  root.querySelector("#fit").addEventListener("click", () => viewer.fit());
  root.querySelector("#labels").addEventListener("click", (event) => {
    const on = !event.target.classList.contains("primary");
    viewer.setAllLabels(on);
    event.target.classList.toggle("primary", on);
  });
  root.querySelector("#edgelabels").addEventListener("click", (event) => {
    const on = !viewer.showEdgeLabels;
    viewer.setEdgeLabels(on);
    event.target.classList.toggle("primary", on);
  });
}

/* ---------------------------------------------------------------- matrix */

export async function matrixView(root) {
  root.innerHTML = loading("Building matrix…");
  const data = await api.matrix({ max_drugs: 40, max_diseases: 20 });

  if (!data.drugs.length) {
    root.innerHTML = `
      <div class="page-head"><h2>Drug–disease matrix</h2></div>
      ${empty("No drug–disease relationships have been ingested yet.")}`;
    return;
  }

  const cellIndex = new Map();
  data.cells.forEach((c) => cellIndex.set(`${c.drug_id}:${c.disease_id}`, c));

  const symbols = {
    APPROVED_FOR: "A",
    OFF_LABEL_USE_IN: "O",
    INVESTIGATED_FOR: "I",
    FAILED_FOR: "✕",
  };

  root.innerHTML = `
    <div class="page-head">
      <h2>Drug–disease matrix</h2>
      <p class="lede">
        Every relationship the graph holds between a therapy and a disease.
        Click a cell to inspect the supporting evidence.
      </p>
    </div>
    ${notice(esc(data.legend.empty_cell_meaning), "warn", "▢")}
    <div class="row mb">
      ${data.legend.predicates
        .map(
          (p) => `
          <span class="chip" title="${esc(p.note)}">
            <span class="mcell mcell-${esc(p.value)}"
                  style="width:15px;height:15px;border-radius:3px">${esc(
                    symbols[p.value] || ""
                  )}</span>
            ${esc(p.label)}
          </span>`
        )
        .join("")}
    </div>
    <div class="card card-flush">
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="corner">Drug ╲ Disease</th>
              ${data.diseases
                .map(
                  (d) =>
                    `<th><div class="rot" data-nav="#/entity/${d.id}">${esc(
                      d.name
                    )}</div></th>`
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${data.drugs
              .map(
                (drug) => `
                <tr>
                  <td class="rowhead truncate" data-nav="#/entity/${drug.id}"
                      title="${esc(drug.name)}">${esc(drug.name)}</td>
                  ${data.diseases
                    .map((disease) => {
                      const cell = cellIndex.get(`${drug.id}:${disease.id}`);
                      if (!cell) return `<td class="cell"></td>`;
                      return `<td class="cell" data-cell="${drug.id}:${disease.id}"
                                  title="${esc(drug.name)} — ${esc(
                        disease.name
                      )}: ${esc(cell.predicate)} (${esc(cell.evidence.label)})">
                                <div class="mcell mcell-${esc(cell.predicate)}">${esc(
                        symbols[cell.predicate] || "•"
                      )}</div>
                              </td>`;
                    })
                    .join("")}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div id="cell-detail" class="mt"></div>`;

  wireNav(root);

  const detail = root.querySelector("#cell-detail");
  root.querySelectorAll("[data-cell]").forEach((td) =>
    td.addEventListener("click", () => {
      const cell = cellIndex.get(td.dataset.cell);
      const drug = data.drugs.find((d) => d.id === cell.drug_id);
      const disease = data.diseases.find((d) => d.id === cell.disease_id);
      detail.innerHTML = card(
        "Relationship detail",
        `<div class="row-between mb">
           <div class="row">
             ${entityLink(drug)} <span class="dim">→</span> ${entityLink(disease)}
           </div>
           ${evidenceBadge(cell.evidence)}
         </div>
         <dl class="kv">
           <dt>Relationship</dt><dd>${esc(cell.predicate.replace(/_/g, " "))}</dd>
           ${
             cell.qualifiers.max_phase_for_indication
               ? `<dt>Max phase for indication</dt><dd>${esc(
                   String(cell.qualifiers.max_phase_for_indication)
                 )}</dd>`
               : ""
           }
           ${
             cell.qualifiers.approval_basis
               ? `<dt>Basis</dt><dd>${esc(cell.qualifiers.approval_basis)}</dd>`
               : ""
           }
           ${
             (cell.qualifiers.nct_ids || []).length
               ? `<dt>Cited trials</dt><dd>${cell.qualifiers.nct_ids
                   .map(
                     (n) =>
                       `<a class="chip" href="https://clinicaltrials.gov/study/${esc(
                         n
                       )}" target="_blank" rel="noopener">${esc(n)}</a>`
                   )
                   .join("")}</dd>`
               : ""
           }
         </dl>`
      );
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    })
  );
}

/* --------------------------------------------------------------- compare */

export async function compareView(root) {
  const items = compareStore.items();

  root.innerHTML = `
    <div class="page-head">
      <h2>Compare therapies</h2>
      <p class="lede">
        Side-by-side comparison of chemistry, targets, mechanism, and clinical
        status. Measurements are grouped by measure type and never merged.
      </p>
    </div>
    <div class="toolbar">
      <span class="dim small">Selected:</span>
      <span id="tray"></span>
      <button class="sm" id="clear">Clear</button>
      <span class="spacer"></span>
      <select id="add-drug"><option value="">Add a drug…</option></select>
    </div>
    <div id="table">${
      items.length < 2
        ? empty("Select at least two therapies to compare.", "⇄")
        : loading()
    }</div>`;

  const drugs = await api.entities({ kind: "drug", limit: 200 });
  const select = root.querySelector("#add-drug");
  drugs.items.forEach((d) => {
    const option = document.createElement("option");
    option.value = d.id;
    option.textContent = d.name;
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    const drug = drugs.items.find((d) => d.id === Number(select.value));
    if (drug) {
      compareStore.add({ id: drug.id, name: drug.name, kind: drug.kind });
      compareView(root);
    }
  });

  const tray = root.querySelector("#tray");
  tray.innerHTML =
    items
      .map(
        (i) =>
          `<span class="chip">${esc(i.name)}
             <span class="clickable" data-remove="${i.id}" title="Remove">✕</span>
           </span>`
      )
      .join("") || '<span class="dim small">none</span>';
  tray.querySelectorAll("[data-remove]").forEach((node) =>
    node.addEventListener("click", () => {
      compareStore.remove(Number(node.dataset.remove));
      compareView(root);
    })
  );
  root.querySelector("#clear").addEventListener("click", () => {
    compareStore.clear();
    compareView(root);
  });

  if (items.length < 2) return;

  const data = await api.compare(items.map((i) => i.id));
  const columns = data.columns;

  const row = (label, render) => `
    <tr>
      <td class="dim" style="min-width:170px">${esc(label)}</td>
      ${columns.map((c) => `<td>${render(c)}</td>`).join("")}
    </tr>`;

  const chem = (c, key, units = "") => {
    const value = c.chemistry?.[key];
    return value === null || value === undefined
      ? '<span class="dim">—</span>'
      : `<span class="mono">${esc(String(value))}${esc(units)}</span>`;
  };

  root.querySelector("#table").innerHTML = `
    ${notice(
      `<strong>Comparison caveats</strong>
       <ul style="margin:6px 0 0;padding-left:18px">
         ${data.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}
       </ul>
       ${
         data.comparability.notes.length
           ? `<div style="margin-top:8px">${data.comparability.notes
               .map((n) => `<div>· ${esc(n)}</div>`)
               .join("")}</div>`
           : ""
       }`,
      "warn",
      "⚖"
    )}
    <div class="card card-flush"><div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th></th>
            ${columns
              .map(
                (c) =>
                  `<th style="min-width:210px">
                     <a href="#/entity/${c.node.id}">${esc(c.node.name)}</a>
                   </th>`
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="dim">Structure</td>
            ${columns
              .map(
                (c) =>
                  `<td>${
                    c.chemistry?.compound_id
                      ? `<div class="mol-2d" style="min-height:150px;padding:5px">
                           <img src="${api.compoundSvgUrl(
                             c.chemistry.compound_id
                           )}" alt="Structure of ${esc(
                          c.node.name
                        )}" style="max-width:100%;height:auto" />
                         </div>`
                      : '<span class="dim">No structure</span>'
                  }</td>`
              )
              .join("")}
          </tr>
          ${row("Modality", (c) => esc((c.modality || "—").replace(/_/g, " ")))}
          ${row("Molecular formula", (c) => chem(c, "formula"))}
          ${row("Molecular weight", (c) => chem(c, "molecular_weight"))}
          ${row("LogP (retrieved)", (c) => chem(c, "xlogp"))}
          ${row("TPSA", (c) => chem(c, "tpsa", " Å²"))}
          ${row("H-bond donors", (c) => chem(c, "h_bond_donors"))}
          ${row("H-bond acceptors", (c) => chem(c, "h_bond_acceptors"))}
          ${row("Rotatable bonds", (c) => chem(c, "rotatable_bonds"))}
          ${row(
            "Targets",
            (c) =>
              c.targets
                .map(
                  (t) =>
                    `<div style="margin-bottom:4px">${entityLink(t.node)}
                       ${t.action ? `<span class="chip">${esc(t.action)}</span>` : ""}
                     </div>`
                )
                .join("") || '<span class="dim">None retrieved</span>'
          )}
          ${row(
            "Highest phase",
            (c) =>
              c.max_phase !== null && c.max_phase !== undefined
                ? `<span class="mono">${c.max_phase}</span>`
                : '<span class="dim">—</span>'
          )}
          ${row(
            "Regulatory record",
            (c) =>
              c.approvals.length
                ? c.approvals
                    .map(
                      (a) =>
                        `<div class="small">${esc(a.jurisdiction)} · ${esc(
                          a.status
                        )} <span class="mono dim">${esc(
                          a.application_number || ""
                        )}</span></div>`
                    )
                    .join("")
                : '<span class="dim">None retrieved</span>'
          )}
          ${row(
            "Indications",
            (c) =>
              c.indications
                .map(
                  (i) =>
                    `<div style="margin-bottom:4px">${entityLink(i.node)}
                       ${evidenceBadge(i.evidence)}</div>`
                )
                .join("") || '<span class="dim">None retrieved</span>'
          )}
          ${row(
            "BBB penetration",
            (c) =>
              c.bbb_penetration
                ? esc(c.bbb_penetration.value)
                : '<span class="dim">Insufficient verified evidence</span>'
          )}
          ${row("Boxed warning", (c) =>
            c.black_box_warning === null || c.black_box_warning === undefined
              ? '<span class="dim">—</span>'
              : c.black_box_warning
              ? '<strong style="color:var(--warning)">Yes</strong>'
              : "No"
          )}
          ${row(
            "Measurements",
            (c) =>
              c.activities.length
                ? c.activities
                    .slice(0, 6)
                    .map(
                      (g) =>
                        `<div class="small" style="margin-bottom:3px">
                           <span class="mono">${esc(g.measure_type)}</span>
                           ${
                             g.value_range
                               ? `${fmt.measure(g.value_range.min, g.value_range.units)}–${fmt.measure(
                                   g.value_range.max,
                                   g.value_range.units
                                 )}`
                               : ""
                           }
                           <span class="dim">vs ${esc(
                             g.target?.name?.slice(0, 28) || "—"
                           )}</span>
                         </div>`
                    )
                    .join("")
                : '<span class="dim">None retrieved</span>'
          )}
        </tbody>
      </table>
    </div></div>`;
}

/* ----------------------------------------------------------------- admin */

export async function adminView(root) {
  root.innerHTML = loading("Running quality control…");
  const [validation, conflicts, runs] = await Promise.all([
    api.validation({ limit: 300 }),
    api.conflicts(),
    api.ingestRuns(),
  ]);

  const counts = validation.counts || {};

  root.innerHTML = `
    <div class="page-head">
      <h2>Scientific review</h2>
      <p class="lede">
        Automated quality control over the database, plus the ingestion log.
        Findings are surfaced for review rather than silently corrected.
      </p>
    </div>

    <div class="grid grid-4 mb">
      <div class="stat">
        <div class="value" style="color:${counts.error ? "var(--danger)" : "var(--ev-established)"}">${
    counts.error || 0
  }</div>
        <div class="label">Errors</div>
      </div>
      <div class="stat">
        <div class="value" style="color:var(--warning)">${counts.warning || 0}</div>
        <div class="label">Warnings</div>
      </div>
      <div class="stat"><div class="value">${counts.info || 0}</div><div class="label">Notices</div></div>
      <div class="stat"><div class="value">${conflicts.total || 0}</div><div class="label">Source conflicts</div></div>
    </div>

    ${card(
      "Findings by rule",
      Object.keys(validation.summary || {}).length
        ? `<table>
             <thead><tr><th>Rule</th><th style="text-align:right">Count</th></tr></thead>
             <tbody>${Object.entries(validation.summary)
               .sort((a, b) => b[1] - a[1])
               .map(
                 ([rule, count]) =>
                   `<tr><td class="mono small">${esc(rule)}</td>
                    <td style="text-align:right" class="mono">${count}</td></tr>`
               )
               .join("")}</tbody>
           </table>`
        : '<span class="dim">No findings — every rule passed.</span>'
    )}

    ${card(
      `Open findings <span class="dim">(${validation.issues.length})</span>`,
      validation.issues.length
        ? `<div class="table-scroll" style="max-height:420px">
             <table>
               <thead><tr><th>Severity</th><th>Rule</th><th>Message</th><th>Entity</th></tr></thead>
               <tbody>${validation.issues
                 .map(
                   (i) => `
                   <tr>
                     <td><span class="chip" style="color:${
                       i.severity === "error"
                         ? "var(--danger)"
                         : i.severity === "warning"
                         ? "var(--warning)"
                         : "var(--text-dim)"
                     }">${esc(i.severity)}</span></td>
                     <td class="mono small">${esc(i.rule)}</td>
                     <td class="small">${esc(i.message)}</td>
                     <td class="small">${i.node ? entityLink(i.node) : "—"}</td>
                   </tr>`
                 )
                 .join("")}</tbody>
             </table>
           </div>`
        : '<span class="dim">Nothing to review.</span>'
    )}

    ${card(
      `Source conflicts <span class="dim">(${conflicts.total})</span>`,
      `<p class="small muted" style="margin-top:-4px">${esc(conflicts.policy)}</p>
       ${
         conflicts.items.length
           ? conflicts.items
               .map(
                 (c) => `
                 <div style="padding:9px 0;border-bottom:1px solid var(--border)">
                   <div class="row">
                     <span class="mono small">${esc(c.field)}</span>
                     ${c.node ? entityLink(c.node) : ""}
                   </div>
                   <div class="mt">
                     ${c.claims
                       .map(
                         (claim) =>
                           `<span class="chip"><strong>${esc(
                             claim.source
                           )}</strong> = ${esc(String(claim.value))}</span>`
                       )
                       .join('<span class="dim"> vs </span>')}
                   </div>
                 </div>`
               )
               .join("")
           : '<span class="dim">No conflicts recorded.</span>'
       }`
    )}

    ${card(
      "Ingestion history",
      `<div class="table-scroll" style="max-height:420px">
         <table>
           <thead><tr>
             <th>Job</th><th>Source</th><th>Status</th><th>Fetched</th>
             <th>Nodes</th><th>Edges</th><th>Rejected</th><th>Finished</th>
           </tr></thead>
           <tbody>${runs
             .map(
               (r) => `
               <tr>
                 <td class="small">${esc(r.job)}</td>
                 <td class="small mono">${esc(r.source)}</td>
                 <td class="small"><span class="chip" style="color:${
                   r.status === "succeeded" ? "var(--ev-established)" : "var(--warning)"
                 }">${esc(r.status)}</span></td>
                 <td class="mono small">${fmt.num(r.records_fetched)}</td>
                 <td class="mono small">${fmt.num(r.nodes_created)}</td>
                 <td class="mono small">${fmt.num(r.edges_created)}</td>
                 <td class="mono small">${
                   r.records_rejected
                     ? `<span style="color:var(--warning)">${r.records_rejected}</span>`
                     : "0"
                 }</td>
                 <td class="small dim">${fmt.date(r.finished_at)}</td>
               </tr>
               ${
                 (r.errors || []).length
                   ? `<tr><td colspan="8" class="small dim" style="padding-left:22px">
                        ${r.errors
                          .slice(0, 4)
                          .map(
                            (e) =>
                              `<div>· <span class="mono">${esc(
                                e.stage
                              )}</span> ${esc(e.identifier)}: ${esc(
                                (e.error || "").slice(0, 160)
                              )}</div>`
                          )
                          .join("")}
                      </td></tr>`
                   : ""
               }`
             )
             .join("")}</tbody>
         </table>
       </div>`
    )}`;
}
