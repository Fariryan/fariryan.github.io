/**
 * Target & Binding Lab.
 *
 * Three sources of structure, never mixed: experimental entries already
 * indexed, experimental entries released inside the rolling window (fetched
 * live, which is what makes a new structure a detectable event), and an
 * AlphaFold model. The predicted model renders behind the atlas's amber
 * predicted-structure banner and carries its pLDDT.
 *
 * Ligands shown here were co-crystallised: their binding modes were observed.
 * Docking, if no engine is configured, says so and shows nothing.
 */

import { card, empty, esc, fmt, loading, notice, structureBanner } from "../../ui.js";
import { StructureViewer, viewerToolbar } from "../../viewer-molecule.js";
import { labApi } from "../api.js";
import { needsSubject } from "../router.js";
import { subjectStore } from "../store.js";
import { provBadge, unavailablePanel, wireProvenance } from "../ui.js";

let viewer = null;

export async function targetView(root, params) {
  const subject = subjectStore.get();
  if (!subject) {
    root.innerHTML = needsSubject("the Target & Binding Lab");
    return;
  }
  if (subject.kind !== "target") {
    root.innerHTML = notice(
      `<strong>${esc(subject.label)}</strong> is a ${esc(subject.kind)}, and the
       structural panels apply to protein targets. Select a target — the Gap
       Finder lists the targets associated with a disease, and each one opens
       here.`,
      "muted",
      "🎯"
    );
    return;
  }

  root.innerHTML = loading(`Retrieving structures for ${subject.label}…`);

  let panel;
  try {
    panel = await labApi.targetStructures(subject.id, 6);
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const indexed = panel.indexed_structures || [];
  const recent = panel.recent_structures || {};
  const predicted = panel.predicted_structure || {};

  root.innerHTML = `
    ${card(
      "Target",
      `<dl class="kv">
        <dt>Protein</dt><dd>${esc(panel.target.name)}</dd>
        <dt>Gene symbol</dt><dd>${esc(panel.target.gene_symbol || "—")}</dd>
        <dt>UniProt</dt><dd>${
          panel.target.uniprot
            ? `<a href="https://www.uniprot.org/uniprotkb/${esc(
                panel.target.uniprot
              )}" target="_blank" rel="noopener">${esc(panel.target.uniprot)}</a>`
            : "—"
        }</dd>
        <dt>Organism</dt><dd>${esc(panel.target.organism || "—")}</dd>
        <dt>Class</dt><dd>${esc(panel.target.target_class || "—")}</dd>
        <dt>Sequence length</dt><dd>${panel.target.sequence_length ?? "—"}</dd>
      </dl>`
    )}

    ${card(
      `Structures released in the window
       <span class="dim">(${esc(panel.window.start)} → ${esc(panel.window.end)})</span>`,
      recent.available
        ? `<div class="row mb">
            <strong>${recent.released_in_window}</strong>
            <span class="dim">of ${recent.total_structures} total structures for this
            accession were released inside the window</span>
          </div>
          ${
            (recent.entries || []).length
              ? (recent.entries || []).map(structureRow).join("")
              : `<div class="dim small">No structure for this accession was released
                 inside the window. The count above comes from the provider at
                 request time.</div>`
          }
          <div class="lab-note">${esc(recent.note)}<br />
            Queries: <span class="mono small">${esc(
              (recent.queries || []).join(" · ")
            )}</span></div>`
        : unavailablePanel(recent)
    )}

    ${card(
      `Experimental structures indexed <span class="dim">(${indexed.length})</span>`,
      indexed.length
        ? `<div id="t-structure-list">${indexed.map(structureRow).join("")}</div>
           <div class="viewer-toolbar mt">
             <span class="small dim">Viewing:</span>
             <select id="t-pdb">
               ${indexed
                 .filter((entry) => entry.pdb_id)
                 .map(
                   (entry) =>
                     `<option value="${esc(entry.pdb_id)}">${esc(entry.pdb_id)} — ${esc(
                       (entry.title || "").slice(0, 48)
                     )}</option>`
                 )
                 .join("")}
             </select>
             <button class="sm" data-action="style" data-value="cartoon">Cartoon</button>
             <button class="sm" data-action="style" data-value="chain">Chains</button>
             <button class="sm" data-action="style" data-value="stick">Sticks</button>
             <button class="sm" data-action="surface">Surface</button>
             <button class="sm" data-action="ligand">Ligands</button>
             <button class="sm" data-action="site">Binding site</button>
             <button class="sm" data-action="reset">Reset</button>
           </div>
           ${structureBanner({
             kind: "experimental",
             label: "Experimental structure",
             warning: null,
           })}
           <div class="viewer viewer-tall" id="t-viewer">
             <div class="viewer-loading">Loading coordinates from RCSB…</div>
           </div>
           <div class="lab-note" id="t-viewer-note"></div>`
        : empty("No experimental structure for this target is indexed here.")
    )}

    ${card(
      "Predicted model",
      predicted.available
        ? `${structureBanner(predicted.provenance)}
           <dl class="kv mt">
             <dt>Model</dt><dd>${esc(predicted.model_id || "—")}</dd>
             <dt>Method</dt><dd>${esc(predicted.tool || "AlphaFold")} · version ${esc(
               String(predicted.version || "—")
             )}</dd>
             <dt>Mean pLDDT</dt><dd>${predicted.mean_plddt ?? "—"}</dd>
             <dt>Confidence bands</dt><dd>
               very high ${pct(predicted.plddt_fractions?.very_high)} ·
               confident ${pct(predicted.plddt_fractions?.confident)} ·
               low ${pct(predicted.plddt_fractions?.low)} ·
               very low ${pct(predicted.plddt_fractions?.very_low)}
             </dd>
             <dt>Created</dt><dd>${esc(fmt.date(predicted.created))}</dd>
             <dt>Source</dt><dd><a href="${esc(
               predicted.page_url
             )}" target="_blank" rel="noopener">AlphaFold DB entry</a></dd>
           </dl>
           <div class="lab-note">${esc(predicted.confidence_note)}</div>`
        : unavailablePanel(predicted)
    )}

    ${card(
      `Observed ligands <span class="dim">(${(panel.observed_ligands || []).length})</span>`,
      (panel.observed_ligands || []).length
        ? `<div class="row" style="gap:6px">
            ${(panel.observed_ligands || [])
              .map(
                (ligand) =>
                  `<span class="chip" title="${esc(
                    ligand.name || ""
                  )} — in ${esc((ligand.structures || []).join(", "))}">
                    ${esc(ligand.id)}</span>`
              )
              .join("")}
          </div>
          <div class="lab-note">${esc(panel.ligand_note)}</div>`
        : empty("No co-crystallised ligand appears in the retrieved structures.")
    )}

    ${card("Docking", `<div id="t-docking">${loading("Checking for a docking engine…")}</div>`)}

    ${card(
      `Annotated sites <span class="dim">(${(panel.binding_features || []).length})</span>`,
      (panel.binding_features || []).length
        ? `<table class="wb-table">
            <tr><th>Type</th><th>Position</th><th>Description</th><th>Evidence</th></tr>
            ${(panel.binding_features || [])
              .map(
                (feature) => `<tr>
                  <td>${esc(feature.type || "")}</td>
                  <td>${esc(String(feature.location || feature.position || ""))}</td>
                  <td>${esc(feature.description || "")}</td>
                  <td class="dim small">${esc(
                    (feature.evidence || []).join(", ") || ""
                  )}</td>
                </tr>`
              )
              .join("")}
          </table>
          <div class="lab-note">
            Sequence features are UniProt annotations, carried with the evidence
            codes UniProt assigns them.
          </div>`
        : empty("UniProt records no binding or active-site feature for this protein.")
    )}`;

  wireProvenance(root);
  if (indexed.some((entry) => entry.pdb_id)) mountViewer(root, indexed);
  loadDocking(root);
}

const pct = (value) =>
  value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;

function structureRow(entry) {
  const citation = entry.citation || {};
  return `<div class="entity-row">
    <div class="body">
      <div class="name">${esc(entry.pdb_id || "")} — ${esc(
        (entry.title || "").slice(0, 90)
      )}</div>
      <div class="meta">
        ${esc(entry.method || "method not stated")}
        ${entry.resolution ? ` · ${entry.resolution} Å` : ""}
        ${entry.r_free ? ` · R-free ${entry.r_free}` : ""}
        ${entry.released ? ` · released ${esc(String(entry.released).slice(0, 10))}` : ""}
        ${
          (entry.ligands || []).length
            ? ` · ligands: ${esc(
                (entry.ligands || [])
                  .map((ligand) => (typeof ligand === "string" ? ligand : ligand.id))
                  .join(", ")
              )}`
            : " · no bound ligand"
        }
      </div>
      ${
        citation.title
          ? `<div class="meta">${esc(citation.title)}${
              citation.journal ? ` · ${esc(citation.journal)}` : ""
            }${citation.year ? ` (${citation.year})` : ""}</div>`
          : ""
      }
    </div>
    <div class="right">
      ${provBadge({ class: entry.data_class || "database", source: entry.source })}
      ${
        entry.url
          ? `<div><a class="small" href="${esc(
              entry.url
            )}" target="_blank" rel="noopener">RCSB ↗</a></div>`
          : ""
      }
    </div>
  </div>`;
}

function mountViewer(root, indexed) {
  const host = root.querySelector("#t-viewer");
  const select = root.querySelector("#t-pdb");
  const note = root.querySelector("#t-viewer-note");
  if (!host || !select) return;

  viewer = new StructureViewer(host);
  if (!viewer.init()) return;

  const byId = new Map(
    indexed.filter((entry) => entry.pdb_id).map((entry) => [entry.pdb_id, entry])
  );

  const load = async (pdbId) => {
    const entry = byId.get(pdbId);
    host.innerHTML = '<div class="viewer-loading">Loading coordinates…</div>';
    try {
      await viewer.load(
        pdbId,
        (entry.ligands || []).map((ligand) =>
          typeof ligand === "string" ? ligand : ligand.id
        )
      );
      note.textContent =
        `Coordinates streamed from RCSB for ${pdbId}. ` +
        `${entry.method || "Method not stated"}` +
        (entry.resolution ? ` at ${entry.resolution} Å.` : ".") +
        " Ligand positions shown are as deposited: an observed binding mode, not a computed pose.";
    } catch (error) {
      host.innerHTML = `<div class="viewer-loading">${esc(error.message)}</div>`;
    }
  };

  select.addEventListener("change", () => load(select.value));
  load(select.value);

  root.querySelectorAll(".viewer-toolbar button").forEach((button) => {
    button.addEventListener("click", () => {
      const { action, value } = button.dataset;
      if (action === "style") viewer.setStyleMode(value);
      else if (action === "surface") viewer.toggleSurface();
      else if (action === "ligand") viewer.toggleLigand();
      else if (action === "site") {
        if (!viewer.focusBindingSite()) {
          note.textContent =
            "This entry has no bound ligand, so there is no binding site to focus on.";
        }
      } else if (action === "reset") viewer.reset();
    });
  });
}

async function loadDocking(root) {
  const host = root.querySelector("#t-docking");
  try {
    const result = await labApi.docking({ smiles: "", pdb_id: "" });
    const engine = result.engine;
    const interpretation = result.interpretation;

    host.innerHTML = engine.available
      ? `<div class="small">Engines detected: ${esc(
          engine.engines.map((item) => item.name).join(", ")
        )}</div>
        ${unavailablePanel(result.result)}`
      : `${unavailablePanel(result.result)}
        <div class="lab-note">${esc(engine.note)}</div>`;

    host.innerHTML += `
      <div class="prov-detail" style="margin-top:10px">
        <dl>
          <dt>What a docking score is</dt><dd>${esc(interpretation.what_it_is)}</dd>
          <dt>What it is not</dt><dd>${esc(interpretation.what_it_is_not.join(" "))}</dd>
          <dt>Typical error</dt><dd>${esc(interpretation.typical_error)}</dd>
        </dl>
      </div>`;
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "warn", "⚠");
  }
}
