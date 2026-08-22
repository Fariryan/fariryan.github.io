/** The coordinated workspace.
 *
 *  One structure, one viewer, several panels. Every panel writes into the same
 *  selection state and the viewer is the only thing that renders it, so a
 *  pocket clicked in the Pockets panel and a strand clicked in the Structure
 *  panel cannot disagree about what is being looked at.
 *
 *  The viewer is the platform's existing StructureViewer, extended in place.
 *  No second viewer exists.
 */

import { esc, loading, notice } from "../ui.js";
import { StructureViewer } from "../viewer-molecule.js";
import { psiApi } from "./api.js";

const EXAMPLES = [
  { pdb: "1IEP", label: "1IEP — ABL1 kinase with imatinib" },
  { pdb: "1BRS", label: "1BRS — barnase/barstar complex" },
  { pdb: "4HHB", label: "4HHB — haemoglobin" },
  { pdb: "3PTB", label: "3PTB — trypsin with benzamidine" },
];

const EVIDENCE = {
  experimental: { label: "experimental", detail: "A laboratory measurement." },
  database: { label: "database", detail: "A curated record retrieved from an external database." },
  calculated: { label: "calculated", detail: "Deterministic computation from the coordinates." },
  predicted: { label: "predicted", detail: "A model's output, with uncertainty." },
  llm_hypothesized: { label: "LLM", detail: "Proposed by a language model. Never evidence in itself." },
};

const badge = (kind) =>
  `<span class="psi-ev psi-ev-${esc(kind || "calculated")}" title="${
    esc((EVIDENCE[kind] || {}).detail || "")}">${
    esc((EVIDENCE[kind] || {}).label || kind || "calculated")}</span>`;

/** Everything the workspace knows. One object; the panels read it, the viewer
 *  renders from it. */
const state = {
  pdbId: null,
  coordinates: null,
  viewer: null,
  analyses: {},
  active: null,
  status: null,
};

export async function workspaceView(root, params) {
  try { state.status = await psiApi.status(); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  const engines = state.status.engines.adapters;
  root.innerHTML = `
    <section class="psi-bar lg-surface lg-d1">
      <div class="psi-bar-input">
        <label for="psi-pdb">PDB identifier</label>
        <input id="psi-pdb" type="text" maxlength="4" spellcheck="false"
          value="${esc(params?.get("pdb") || "1IEP")}" />
      </div>
      <div class="psi-examples">
        ${EXAMPLES.map((e, i) => `<button class="psi-pill" data-example="${i}">${esc(e.label)}</button>`).join("")}
      </div>
      <div class="psi-bar-actions">
        <button id="psi-open" class="psi-btn">Open structure</button>
      </div>
    </section>

    <section class="psi-engines lg-surface lg-d1">
      ${Object.entries(engines).map(([key, a]) => `
        <div class="psi-engine psi-engine-${esc(a.state)}" title="${esc(a.reason || a.name)}">
          <span class="psi-dot"></span>
          <span class="psi-engine-name">${esc(a.name)}</span>
          <span class="psi-engine-meta">${esc(a.version || a.state.replace(/_/g, " "))}</span>
        </div>`).join("")}
    </section>
    <div id="psi-engine-detail"></div>

    <div class="psi-layout">
      <div class="psi-viewer-wrap lg-surface lg-d1">
        <div class="psi-viewer-head">
          <strong id="psi-title">No structure open</strong>
          <div class="psi-viewer-tools">
            <button class="psi-chip" data-style="cartoon">Cartoon</button>
            <button class="psi-chip" data-style="ss">Secondary structure</button>
            <button class="psi-chip" data-style="chain">Chains</button>
            <button class="psi-chip" data-colour="hydrophobicity">Hydrophobicity</button>
            <button class="psi-chip" data-colour="accessibility">Accessibility</button>
            <button class="psi-chip" data-colour="ligandability">Ligandability</button>
            <button class="psi-chip" data-action="surface">Surface</button>
            <button class="psi-chip" data-action="reset">Reset</button>
          </div>
        </div>
        <div id="psi-viewer" class="psi-viewer"></div>
        <p class="psi-selection" id="psi-selection">Nothing selected.</p>
      </div>

      <aside class="psi-panels" id="psi-panels">
        <p class="dim small">Open a structure to analyse it.</p>
      </aside>
    </div>`;

  root.querySelectorAll("[data-example]").forEach((button) =>
    button.addEventListener("click", () => {
      root.querySelector("#psi-pdb").value = EXAMPLES[Number(button.dataset.example)].pdb;
    }));

  root.querySelector("#psi-open").addEventListener("click", () =>
    open(root, root.querySelector("#psi-pdb").value.trim()));

  root.querySelector("#psi-engine-detail").innerHTML = renderEngineDetail(state.status);

  wireViewerTools(root);
  await open(root, root.querySelector("#psi-pdb").value.trim());
}

function renderEngineDetail(status) {
  const engines = status.engines.adapters;
  const absent = Object.entries(engines).filter(([, a]) => a.state !== "ready");
  const notIntegrated = status.engines.not_integrated || [];
  if (!absent.length && !notIntegrated.length) return "";
  return `
    <details class="psi-details lg-surface lg-d1">
      <summary>${absent.length} engine${absent.length === 1 ? "" : "s"} not running here,
        ${notIntegrated.length} considered and not integrated</summary>
      <p class="psi-note">${esc(status.engines.contract)}</p>
      ${absent.map(([key, a]) => `
        <div class="psi-absent">
          <div class="psi-absent-head">
            <strong>${esc(a.name)}</strong>
            <span class="psi-chip small">${esc(a.licence)}</span>
            ${a.weights_licence ? `<span class="psi-chip small">weights: ${esc(a.weights_licence)}</span>` : ""}
          </div>
          <p><strong>Would produce:</strong> ${esc(a.capabilities?.would_produce || "")}</p>
          <p><strong>Why not here:</strong> ${esc(a.reason || "")}</p>
          ${a.remedy ? `<p class="mono small">${esc(a.remedy)}</p>` : ""}
        </div>`).join("")}
      ${notIntegrated.map((n) => `
        <div class="psi-absent">
          <div class="psi-absent-head">
            <strong>${esc(n.name)}</strong>
            <span class="psi-chip small">${esc(n.licence)}</span>
            <span class="psi-chip small">considered for ${esc(n.considered_for)}</span>
          </div>
          <p>${esc(n.decision)}</p>
        </div>`).join("")}
    </details>`;
}

/* ------------------------------------------------------------------ open */

async function open(root, pdbId) {
  if (!pdbId || pdbId.length !== 4) return;
  const panels = root.querySelector("#psi-panels");
  panels.innerHTML = loading("Fetching coordinates…");
  state.pdbId = pdbId.toUpperCase();
  state.analyses = {};

  try {
    const bundle = await psiApi.coordinates(state.pdbId);
    state.coordinates = bundle.coordinates;
    root.querySelector("#psi-title").textContent =
      `${bundle.pdb_id} · ${bundle.structure_sha256.slice(0, 12)}…`;

    if (!state.viewer) {
      state.viewer = new StructureViewer(root.querySelector("#psi-viewer"));
    }
    state.viewer.loadText(state.coordinates);
  } catch (error) {
    panels.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  panels.innerHTML = loading("Analysing…");
  const kinds = [
    "structure", "secondary_structure", "surface_properties",
    "binding_pockets", "interaction_sites", "structural_matches",
    "function_predictions", "affinity", "mutation_effects",
  ];
  const results = await Promise.all(kinds.map(async (kind) => {
    try { return await psiApi.analysis(state.pdbId, kind, kind === "structural_matches" ? { limit: 12 } : {}); }
    catch (error) { return { kind, state: "failed", summary: { error: error.message } }; }
  }));
  results.forEach((r) => { state.analyses[r.kind] = r; });

  renderPanels(root);
}

/* --------------------------------------------------------------- panels */

function renderPanels(root) {
  const panels = root.querySelector("#psi-panels");
  panels.innerHTML = [
    structurePanel(), secondaryPanel(), surfacePanel(), pocketsPanel(),
    interfacePanel(), matchesPanel(), ligandPanel(), absentPanel(),
  ].join("");
  wirePanels(root);
}

function panel(id, title, evidence, body, meta = "") {
  return `
    <section class="psi-panel lg-surface lg-d1" id="psi-${id}">
      <header class="psi-panel-head">
        <div><h3>${esc(title)}</h3>${meta ? `<span class="dim small">${meta}</span>` : ""}</div>
        ${evidence ? badge(evidence) : ""}
      </header>
      ${body}
    </section>`;
}

function structurePanel() {
  const a = state.analyses.structure;
  if (!a || a.state !== "ok") return panel("structure", "Structure", null,
    `<p class="psi-caveat">${esc(a?.summary?.error || "unavailable")}</p>`);
  const d = a.result;
  const e = d.experimental || {};
  return panel("structure", "Structure", a.provenance?.class,
    `<table class="psi-props"><tbody>
      <tr><th>Title</th><td>${esc((d.header || {}).title || "—")}</td></tr>
      <tr><th>Method</th><td class="mono">${esc(e.method || "—")}</td></tr>
      <tr><th>Resolution</th><td class="mono">${e.resolution_angstrom ?? "—"} Å</td></tr>
      <tr><th>Chains</th><td class="mono">${(d.chains || []).map((c) => `${c.chain} (${c.residue_count})`).join(", ")}</td></tr>
      <tr><th>Atoms</th><td class="mono">${d.atom_count}</td></tr>
     </tbody></table>
     ${(d.candidate_ligands || []).length ? `
       <h4>Co-crystallised ligands</h4>
       <div class="psi-chips">${d.candidate_ligands.map((l) =>
         `<button class="psi-chip" data-ligand="${esc(l.residue_name)}">${esc(l.residue_name)} · ${l.atom_count} atoms</button>`).join("")}</div>
       <p class="psi-note">These are observed in the crystal. Clicking one frames it in the viewer.</p>` : ""}
     ${e.resolution_note ? `<p class="psi-caveat">${esc(e.resolution_note)}</p>` : ""}`);
}

function secondaryPanel() {
  const a = state.analyses.secondary_structure;
  if (!a || a.state !== "ok") return panel("secondary", "Secondary structure", null,
    `<p class="psi-caveat">${esc(a?.summary?.error || "unavailable")}</p>`);
  const c = a.result.composition;
  const segments = (a.result.segments || []).filter((s) => s.group !== "loop" && s.length >= 3);
  return panel("secondary", "Secondary structure", a.provenance?.class,
    `<div class="psi-bars">
      ${[["helix", c.helix_percent], ["sheet", c.sheet_percent], ["loop", c.loop_percent]].map(
        ([k, v]) => `<div class="psi-bar-row">
          <span class="psi-bar-label">${k}</span>
          <span class="psi-bar-track"><span class="psi-bar-fill psi-fill-${k}" style="width:${v}%"></span></span>
          <span class="psi-bar-value mono">${v}%</span></div>`).join("")}
     </div>
     <h4>Elements — click to highlight</h4>
     <div class="psi-segments">
       ${segments.map((s, i) => `
         <button class="psi-seg psi-seg-${esc(s.group)}" data-segment="${i}">
           <span class="psi-seg-label">${esc(s.label)}</span>
           <span class="mono">${esc(s.chain)} ${s.start}–${s.end}</span>
           <span class="dim small">${s.length}</span>
         </button>`).join("")}
     </div>
     <p class="psi-caveat">${esc(a.result.caveats.function)}</p>`,
    `${c.total_residues} residues · ${segments.length} elements`);
}

function surfacePanel() {
  const a = state.analyses.surface_properties;
  if (!a || a.state !== "ok") return panel("surface", "Surface properties", null,
    `<p class="psi-caveat">${esc(a?.summary?.error || "unavailable")}</p>`);
  const s = a.result.summary;
  const comp = a.result.surface_composition;
  const patches = Object.entries(a.result.patches.by_chemistry)
    .flatMap(([kind, list]) => list.map((p) => ({ ...p, kind })))
    .sort((x, y) => y.surface_area_angstrom2 - x.surface_area_angstrom2)
    .slice(0, 10);
  return panel("surface", "Surface properties", a.provenance?.class,
    `<div class="psi-stats">
       <div><b>${s.exposed}</b><span>exposed</span></div>
       <div><b>${s.buried}</b><span>buried</span></div>
       <div><b>${s.percent_exposed}%</b><span>of residues</span></div>
       <div><b>${Math.round(s.total_sasa_angstrom2)}</b><span>Å² total</span></div>
     </div>
     <h4>Surface composition</h4>
     <div class="psi-bars">
       ${Object.entries(comp).filter(([, v]) => v.exposed_residues).map(([k, v]) =>
         `<div class="psi-bar-row" title="${esc(v.meaning)}">
            <span class="psi-bar-label">${esc(k)}</span>
            <span class="psi-bar-track"><span class="psi-bar-fill psi-fill-${esc(k)}" style="width:${v.percent_of_surface}%"></span></span>
            <span class="psi-bar-value mono">${v.percent_of_surface}%</span></div>`).join("")}
     </div>
     ${patches.length ? `<h4>Exposed patches — click to highlight</h4>
       <div class="psi-segments">
         ${patches.map((p, i) => `
           <button class="psi-seg psi-seg-${esc(p.kind)}" data-patch="${i}">
             <span class="psi-seg-label">${esc(p.kind)}</span>
             <span class="mono">${esc(p.chain)} ${p.start}–${p.end}</span>
             <span class="dim small">${Math.round(p.surface_area_angstrom2)} Å²</span>
           </button>`).join("")}
       </div>` : `<p class="psi-note">${esc(a.result.patches.note)}</p>`}
     <p class="psi-caveat">${esc(a.result.caveats.relative_accessibility)}</p>`,
    `probe ${a.result.method.probe_radius_angstrom} Å`);
}

function pocketsPanel() {
  const a = state.analyses.binding_pockets;
  if (!a) return "";
  if (a.state !== "ok") {
    return panel("pockets", "Binding pockets", null,
      `<p class="psi-caveat"><strong>${esc(a.summary?.engine || "P2Rank")} is not running here.</strong>
        ${esc(a.summary?.reason || "")}</p>
       ${a.summary?.remedy ? `<p class="mono small">${esc(a.summary.remedy)}</p>` : ""}`);
  }
  const pockets = a.result.pockets || [];
  return panel("pockets", "Binding pockets", a.provenance?.class,
    `<div class="psi-scroll"><table class="psi-table">
      <thead><tr><th>Rank</th><th class="num">Score</th><th class="num">Probability</th>
        <th class="num">Residues</th><th>Centre</th></tr></thead>
      <tbody>${pockets.map((p, i) => `
        <tr class="clickable" data-pocket="${i}">
          <td class="mono">${p.rank}</td>
          <td class="num mono">${p.score}</td>
          <td class="num mono"><span class="psi-score" style="--v:${p.probability}">${p.probability}</span></td>
          <td class="num mono">${p.residue_count}</td>
          <td class="mono small">${p.center.x.toFixed(1)}, ${p.center.y.toFixed(1)}, ${p.center.z.toFixed(1)}</td>
        </tr>`).join("")}</tbody>
     </table></div>
     <p class="psi-note">Click a pocket to frame it in the viewer and enable docking into it.</p>
     <p class="psi-caveat">${esc(a.result.score_meaning.probability)} ${esc(a.result.score_meaning.not_an_affinity)}</p>`,
    `${pockets.length} pockets · ${esc(a.engine)} ${esc(a.engine_version || "")}`);
}

function interfacePanel() {
  const a = state.analyses.interaction_sites;
  if (!a) return "";
  if (a.state !== "ok") {
    return panel("interfaces", "Interaction sites", null,
      `<p class="psi-caveat">${esc(a.result?.reason || a.result?.what || "No observed interface in this structure.")}
        ${esc(a.result?.remedy || "")}</p>`);
  }
  const list = a.result.interfaces || [];
  return panel("interfaces", "Interaction sites", a.provenance?.class,
    `<div class="psi-scroll"><table class="psi-table">
      <thead><tr><th>Chains</th><th class="num">Residues</th><th class="num">Contacts</th>
        <th class="num">Å² / side</th><th>Assessment</th></tr></thead>
      <tbody>${list.map((f, i) => `
        <tr class="clickable" data-interface="${i}">
          <td class="mono">${esc(f.chains.join(" – "))}</td>
          <td class="num mono">${f.interface_residues}</td>
          <td class="num mono">${f.contacts}</td>
          <td class="num mono">${f.interface_area_angstrom2}</td>
          <td class="small">${esc(f.significance.replace(/_/g, " "))}</td>
        </tr>`).join("")}</tbody>
     </table></div>
     <p class="psi-caveat">Interfaces observed between chains of this structure — computed from
       deposited coordinates, not predicted. Where a monomer might bind a partner it was not
       crystallised with is a different question, and needs an engine not configured here.</p>`,
    `${list.length} observed`);
}

function matchesPanel() {
  const a = state.analyses.structural_matches;
  if (!a) return "";
  if (a.state !== "ok") {
    return panel("matches", "Structural matches", null,
      `<p class="psi-caveat">${esc(a.summary?.reason || "unavailable")}</p>`);
  }
  const matches = (a.result.matches || []).slice(1, 11);
  return panel("matches", "Structural matches", a.provenance?.class,
    `<div class="psi-scroll"><table class="psi-table">
      <thead><tr><th>Entry</th><th class="num">Score</th><th class="num">Å</th><th>Title</th></tr></thead>
      <tbody>${matches.map((m) => `
        <tr>
          <td><a href="${esc(m.url)}" target="_blank" rel="noopener" class="mono">${esc(m.pdb_id)}</a></td>
          <td class="num mono">${m.score.toFixed(3)}</td>
          <td class="num mono">${m.resolution_angstrom ?? "—"}</td>
          <td class="small dim">${esc((m.title || "").slice(0, 70))}</td>
        </tr>`).join("")}</tbody>
     </table></div>
     <p class="psi-caveat">${esc(a.provenance?.note || "")}</p>`,
    `${a.summary.matches} of ${a.summary.total_available}`);
}

function ligandPanel() {
  const pockets = state.analyses.binding_pockets;
  const ready = pockets?.state === "ok";
  const dockingReady = state.status.engines.adapters &&
    (state.status.reused?.docking || "").includes("Vina");
  return panel("ligand", "Ligand binding", "predicted",
    `${ready ? `
      <p class="psi-note">Docks with the platform's existing engine —
        ${esc(state.status.reused.docking)} — into the pocket selected above.
        No second docking engine was added.</p>
      <label for="psi-smiles">Molecule (SMILES)</label>
      <textarea id="psi-smiles" rows="2" spellcheck="false">Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1</textarea>
      <div class="psi-actions">
        <button id="psi-dock" class="psi-btn" disabled>Select a pocket first</button>
      </div>
      <div id="psi-dock-out"></div>`
      : `<p class="psi-caveat">Pocket detection is not available, so there is no
          detected site to dock into.</p>`}`);
}

function absentPanel() {
  const absent = ["function_predictions", "affinity", "mutation_effects"]
    .map((k) => state.analyses[k]).filter((a) => a && a.state === "not_configured");
  if (!absent.length) return "";
  return panel("absent", "Not computed here", null,
    absent.map((a) => `
      <div class="psi-absent">
        <div class="psi-absent-head">
          <strong>${esc(a.summary.engine)}</strong>
          <span class="psi-chip small">${esc(a.summary.licence)}</span>
        </div>
        <p><strong>Would produce:</strong> ${esc(a.result?.what || "")}</p>
        <p><strong>Why not:</strong> ${esc(a.summary.reason || "")}</p>
        ${a.summary.remedy ? `<p class="mono small">${esc(a.summary.remedy)}</p>` : ""}
      </div>`).join("") +
    `<p class="psi-caveat">Nothing is shown for these because nothing was computed.
      An empty panel with a stated reason is the truthful state; a plausible number
      would not be.</p>`);
}

/* --------------------------------------------------------------- wiring */

function say(text) {
  const host = document.querySelector("#psi-selection");
  if (host) host.textContent = text;
}

function wirePanels(root) {
  const secondary = state.analyses.secondary_structure;
  const segments = (secondary?.result?.segments || [])
    .filter((s) => s.group !== "loop" && s.length >= 3);
  root.querySelectorAll("[data-segment]").forEach((button) =>
    button.addEventListener("click", () => {
      const segment = segments[Number(button.dataset.segment)];
      state.viewer?.clearHighlights();
      state.viewer?.highlightSegment(segment, {
        color: segment.group === "helix" ? "#3ee08f" : "#f5a524",
        label: `${segment.label} ${segment.chain} ${segment.start}–${segment.end}`,
      });
      say(`${segment.label}, chain ${segment.chain}, residues ${segment.start}–${segment.end}`);
      mark(root, button);
    }));

  const surfaceAnalysis = state.analyses.surface_properties;
  const patches = Object.entries(surfaceAnalysis?.result?.patches?.by_chemistry || {})
    .flatMap(([kind, list]) => list.map((p) => ({ ...p, kind })))
    .sort((x, y) => y.surface_area_angstrom2 - x.surface_area_angstrom2).slice(0, 10);
  root.querySelectorAll("[data-patch]").forEach((button) =>
    button.addEventListener("click", () => {
      const patch = patches[Number(button.dataset.patch)];
      const residues = [];
      for (let i = patch.start; i <= patch.end; i += 1) residues.push(i);
      state.viewer?.clearHighlights();
      state.viewer?.highlightResidues({ chain: patch.chain, residues },
        { color: "#e03154", label: `${patch.kind} patch` });
      say(`${patch.kind} patch, chain ${patch.chain}, ${patch.residues.join(" ")}`);
      mark(root, button);
    }));

  const pockets = state.analyses.binding_pockets?.result?.pockets || [];
  root.querySelectorAll("[data-pocket]").forEach((row) =>
    row.addEventListener("click", () => {
      const pocket = pockets[Number(row.dataset.pocket)];
      state.active = { kind: "pocket", pocket };
      state.viewer?.clearHighlights();
      state.viewer?.showPocket(pocket);
      say(`Pocket ${pocket.rank} — probability ${pocket.probability}, ${pocket.residue_count} residues`);
      root.querySelectorAll("[data-pocket]").forEach((r) => r.classList.remove("selected"));
      row.classList.add("selected");
      const dock = root.querySelector("#psi-dock");
      if (dock) { dock.disabled = false; dock.textContent = `Dock into pocket ${pocket.rank}`; }
    }));

  const interfaces = state.analyses.interaction_sites?.result?.interfaces || [];
  root.querySelectorAll("[data-interface]").forEach((row) =>
    row.addEventListener("click", async () => {
      const entry = interfaces[Number(row.dataset.interface)];
      state.viewer?.clearHighlights();
      // Colour both chains of the interface so the contact face is visible.
      state.viewer?.highlightResidues(
        entry.chains.map((chain) => ({ chain })), { color: "#8ab4ff", zoom: true });
      say(`Interface ${entry.chains.join("–")} — ${entry.interface_residues} residues, ${entry.interface_area_angstrom2} Å² per side`);
      mark(root, row);
    }));

  root.querySelectorAll("[data-ligand]").forEach((button) =>
    button.addEventListener("click", () => {
      state.viewer?.clearHighlights();
      state.viewer?.focusBindingSite?.();
      state.viewer.ligandIds = [button.dataset.ligand];
      state.viewer?.applyStyle();
      state.viewer?.focusBindingSite();
      say(`Co-crystallised ligand ${button.dataset.ligand} and the residues within 5 Å`);
      mark(root, button);
    }));

  const dock = root.querySelector("#psi-dock");
  if (dock) dock.addEventListener("click", () => runDocking(root));
}

function mark(root, element) {
  root.querySelectorAll(".psi-seg, .psi-chip[data-ligand], tr.clickable")
    .forEach((n) => n.classList.remove("selected"));
  element.classList.add("selected");
}

async function runDocking(root) {
  const out = root.querySelector("#psi-dock-out");
  const button = root.querySelector("#psi-dock");
  const smiles = root.querySelector("#psi-smiles").value.trim();
  if (!state.active?.pocket || !smiles) return;
  button.disabled = true;
  out.innerHTML = loading("Docking with AutoDock Vina…");
  try {
    const result = await psiApi.dock({
      pdb_id: state.pdbId, smiles,
      center: state.active.pocket.center,
    });
    state.viewer?.clearPoses();
    const best = result.poses[0];
    if (best?.pdbqt) state.viewer?.addPose(best.pdbqt, "pdbqt");
    out.innerHTML = `
      <table class="psi-table">
        <thead><tr><th>Pose</th><th class="num">${esc(result.provenance.score_meaning.name)}</th></tr></thead>
        <tbody>${result.poses.map((p) => `
          <tr><td class="mono">${p.rank}</td>
            <td class="num mono">${p.score} ${esc(result.provenance.score_meaning.units)}</td></tr>`).join("")}</tbody>
      </table>
      <p class="psi-note">${esc(result.engine)} ${esc(result.engine_version || "")} ·
        box ${result.site.size_angstrom} Å on the pocket centre. The top pose is shown in the viewer.</p>
      <p class="psi-caveat">${esc(result.provenance.statement)}</p>`;
    say(`Docked pose in pocket ${state.active.pocket.rank} — ${best.score} kcal/mol`);
  } catch (error) {
    out.innerHTML = notice(esc(error.message), "warn", "⚠");
  } finally {
    button.disabled = false;
  }
}

function wireViewerTools(root) {
  root.querySelectorAll("[data-style]").forEach((button) =>
    button.addEventListener("click", () => {
      state.viewer?.setStyleMode(button.dataset.style);
      say(`Style: ${button.dataset.style}`);
    }));

  root.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.action === "surface") state.viewer?.toggleSurface();
      if (button.dataset.action === "reset") {
        state.viewer?.reset();
        state.active = null;
        say("Nothing selected.");
      }
    }));

  root.querySelectorAll("[data-colour]").forEach((button) =>
    button.addEventListener("click", () => colourBy(button.dataset.colour)));
}

/** Colour the structure by a computed per-residue property.
 *
 *  Three views of one structure, from analyses already loaded — not three
 *  viewers, and nothing recomputed. */
function colourBy(property) {
  const surfaceAnalysis = state.analyses.surface_properties;
  const pocketAnalysis = state.analyses.binding_pockets;
  const values = {};
  let ramp;

  if (property === "hydrophobicity") {
    if (surfaceAnalysis?.state !== "ok") return;
    surfaceAnalysis.result.residues.forEach((r) => {
      // Kyte-Doolittle runs -4.5..4.5; normalise for the ramp.
      values[`${r.chain}:${r.number}`] = ((r.hydropathy ?? 0) + 4.5) / 9;
    });
    ramp = (v) => blend("#4a8fd4", "#e0a03a", v);
    say("Coloured by Kyte-Doolittle hydropathy: blue polar, orange apolar.");
  } else if (property === "accessibility") {
    if (surfaceAnalysis?.state !== "ok") return;
    surfaceAnalysis.result.residues.forEach((r) => {
      values[`${r.chain}:${r.number}`] = Math.min(r.relative_accessibility ?? 0, 1);
    });
    ramp = (v) => blend("#243b4a", "#6ee7c0", v);
    say("Coloured by relative solvent accessibility: dark buried, light exposed.");
  } else if (property === "ligandability") {
    if (pocketAnalysis?.state !== "ok") return;
    (pocketAnalysis.result.residue_scores || []).forEach((r) => {
      values[`${r.chain}:${r.number}`] = Math.min(r.probability ?? 0, 1);
    });
    ramp = (v) => blend("#2c3f4c", "#e03154", v);
    say("Coloured by P2Rank per-residue ligandability. A model output, not a measurement.");
  } else return;

  state.viewer?.clearHighlights();
  state.viewer?.colorByResidue(values, ramp);
}

function blend(from, to, t) {
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(from), [r2, g2, b2] = parse(to);
  const clamp = Math.max(0, Math.min(1, t));
  const hex = (n) => Math.round(n).toString(16).padStart(2, "0");
  return `#${hex(r1 + (r2 - r1) * clamp)}${hex(g1 + (g2 - g1) * clamp)}${hex(b1 + (b2 - b1) * clamp)}`;
}
