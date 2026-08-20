/** Descriptors, fingerprints, similarity and substructure over a molecule set. */

import { esc, loading, notice } from "../../ui.js";
import { wbApi } from "../api.js";

const SAMPLE = [
  "CC(=O)Oc1ccccc1C(=O)O aspirin",
  "CC(=O)Nc1ccc(O)cc1 paracetamol",
  "CC(C)Cc1ccc(cc1)C(C)C(=O)O ibuprofen",
  "OC(=O)c1ccccc1O salicylic-acid",
  "CN1C=NC2=C1C(=O)N(C)C(=O)N2C caffeine",
  "COc1cc2c(cc1OC)C(=O)C(CC1CCN(Cc3ccccc3)CC1)C2 donepezil",
].join("\n");

export async function chemistryView(root) {
  root.innerHTML = `
    <section class="wb-controls lg-surface lg-d1">
      <div class="wb-control-grid">
        <div>
          <label for="wb-lib">Molecules — SMILES, InChI, molfile or SDF</label>
          <textarea id="wb-lib" rows="7" spellcheck="false">${esc(SAMPLE)}</textarea>
        </div>
        <div class="wb-control-side">
          <label for="wb-fp">Fingerprint</label>
          <select id="wb-fp">
            <option value="morgan" selected>Morgan (circular)</option>
            <option value="rdkit">RDKit topological</option>
            <option value="atom_pair">Atom pair</option>
            <option value="topological_torsion">Topological torsion</option>
          </select>
          <label for="wb-query">Query (SMILES or SMARTS)</label>
          <input id="wb-query" type="text" spellcheck="false"
                 value="CC(=O)Oc1ccccc1C(=O)O" />
          <label for="wb-mode">Search mode</label>
          <select id="wb-mode">
            <option value="similarity" selected>Similarity (nearest neighbours)</option>
            <option value="substructure">Substructure</option>
            <option value="exact">Exact structure</option>
            <option value="scaffold">Shared scaffold</option>
          </select>
        </div>
      </div>
      <div class="wb-actions">
        <button id="wb-desc" class="wb-btn">Descriptors</button>
        <button id="wb-fp-go" class="wb-btn-quiet">Fingerprints</button>
        <button id="wb-search" class="wb-btn-quiet">Search</button>
      </div>
    </section>
    <div id="wb-chem-out"></div>`;

  const out = root.querySelector("#wb-chem-out");
  const library = () => root.querySelector("#wb-lib").value;

  const run = async (label, fn, render) => {
    out.innerHTML = loading(label);
    try {
      render(out, await fn());
    } catch (error) {
      out.innerHTML = notice(
        `<strong>${esc(label)} failed.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  };

  root.querySelector("#wb-desc").addEventListener("click", () =>
    run("Computing descriptors…", () => wbApi.descriptors({ molecules: library() }), renderDescriptors)
  );

  root.querySelector("#wb-fp-go").addEventListener("click", () =>
    run(
      "Computing fingerprints…",
      () => wbApi.fingerprints({ molecules: library(), kind: root.querySelector("#wb-fp").value }),
      renderFingerprints
    )
  );

  root.querySelector("#wb-search").addEventListener("click", () => {
    const mode = root.querySelector("#wb-mode").value;
    const query = root.querySelector("#wb-query").value;
    const kind = root.querySelector("#wb-fp").value;
    if (mode === "similarity") {
      run("Searching…", () => wbApi.similarity({ query, library: library(), kind }), renderSearch);
    } else {
      run("Searching…", () => wbApi.substructure({ query, library: library(), mode }), renderSearch);
    }
  });
}

function renderDescriptors(host, result) {
  const first = result.molecules[0]?.descriptors || {};
  const keys = Object.keys(first);
  host.innerHTML = `
    <section class="wb-out lg-surface lg-d1">
      <header class="wb-pane-head">
        <h3>${result.count} molecule${result.count === 1 ? "" : "s"}</h3>
        <span class="wb-badge-calc">calculated · ${esc(result.provenance.software)} ${esc(
          result.provenance.version
        )}</span>
      </header>
      <div class="wb-scroll">
        <table class="wb-table">
          <thead><tr><th>Molecule</th>${keys
            .map((k) => `<th class="num">${esc((first[k]?.label || k).toString())}</th>`)
            .join("")}</tr></thead>
          <tbody>
            ${result.molecules
              .map(
                (m) => `<tr>
                  <td><strong>${esc(m.name || m.canonical_smiles.slice(0, 22))}</strong>
                      <div class="mono small dim">${esc(m.formula)}</div></td>
                  ${keys
                    .map((k) => {
                      const v = m.descriptors[k];
                      const value = v && typeof v === "object" ? v.value : v;
                      return `<td class="num mono">${
                        value === null || value === undefined ? "—" : esc(String(value))
                      }</td>`;
                    })
                    .join("")}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <p class="wb-note">${esc(result.provenance.note)}</p>
    </section>`;
}

function renderFingerprints(host, result) {
  host.innerHTML = `
    <section class="wb-out lg-surface lg-d1">
      <header class="wb-pane-head"><h3>${esc(result.kind)} fingerprints</h3></header>
      <table class="wb-table">
        <thead><tr><th>Molecule</th><th class="num">Bits set</th><th class="num">Density</th><th>Parameters</th></tr></thead>
        <tbody>
          ${result.molecules
            .map(
              (m) => `<tr>
                <td>${esc(m.name || m.canonical_smiles.slice(0, 30))}</td>
                <td class="num mono">${m.fingerprint.bits_set}</td>
                <td class="num mono">${m.fingerprint.density}</td>
                <td class="mono small dim">${esc(JSON.stringify(m.fingerprint.parameters))}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <p class="wb-note">${esc(result.molecules[0]?.fingerprint.comparability_note || "")}</p>
    </section>`;
}

function renderSearch(host, result) {
  const config = result.configuration;
  host.innerHTML = `
    <section class="wb-out lg-surface lg-d1">
      <header class="wb-pane-head">
        <h3>${result.hit_count} hit${result.hit_count === 1 ? "" : "s"} of ${
          result.library_size
        }</h3>
        <span class="dim small">query read as <code>${esc(result.query.parsed_as)}</code>${
          result.mode ? ` · mode ${esc(result.mode)}` : ""
        }</span>
      </header>
      ${
        result.hits.length
          ? `<table class="wb-table">
              <thead><tr><th>Molecule</th><th class="num">Score</th><th>Detail</th></tr></thead>
              <tbody>
                ${result.hits
                  .map(
                    (h) => `<tr>
                      <td><strong>${esc(h.name || "—")}</strong>
                          <div class="mono small dim">${esc(h.smiles)}</div></td>
                      <td class="num mono">${h.score !== undefined ? h.score : "—"}</td>
                      <td class="small dim">${
                        h.match_count ? `${h.match_count} match(es)` : ""
                      }</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : `<p class="dim">Nothing matched.</p>`
      }
      ${
        config
          ? `<p class="wb-note"><strong>${esc(config.fingerprint)}</strong>
               ${esc(JSON.stringify(config.parameters))} · ${esc(config.metric)}.
               ${esc(config.interpretation)}</p>`
          : ""
      }
    </section>`;
}
