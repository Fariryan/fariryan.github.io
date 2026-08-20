/** Chemical space: PCA, clustering, similarity matrix, scaffold distribution. */

import { esc, loading, notice } from "../../ui.js";
import { wbApi } from "../api.js";

const SAMPLE = [
  "CC(=O)Oc1ccccc1C(=O)O aspirin",
  "OC(=O)c1ccccc1O salicylic-acid",
  "CC(=O)Nc1ccc(O)cc1 paracetamol",
  "CC(C)Cc1ccc(cc1)C(C)C(=O)O ibuprofen",
  "CC(C)(C)NCC(O)c1ccc(O)c(CO)c1 salbutamol",
  "CN1C=NC2=C1C(=O)N(C)C(=O)N2C caffeine",
  "Cn1cnc2c1c(=O)[nH]c(=O)n2C theophylline",
  "COc1cc2c(cc1OC)C(=O)C(CC1CCN(Cc3ccccc3)CC1)C2 donepezil",
  "CN1CCC[C@H]1c1cccnc1 nicotine",
  "CC(N)Cc1ccccc1 amphetamine",
].join("\n");

export async function spaceView(root) {
  root.innerHTML = `
    <section class="wb-controls lg-surface lg-d1">
      <label for="wb-space-lib">Molecule set</label>
      <textarea id="wb-space-lib" rows="8" spellcheck="false">${esc(SAMPLE)}</textarea>
      <div class="wb-actions">
        <button id="wb-pca" class="wb-btn">PCA</button>
        <button id="wb-cluster" class="wb-btn-quiet">Cluster</button>
        <button id="wb-matrix" class="wb-btn-quiet">Similarity matrix</button>
        <button id="wb-scaf" class="wb-btn-quiet">Scaffolds</button>
      </div>
    </section>
    <div id="wb-space-out"></div>`;

  const out = root.querySelector("#wb-space-out");
  const lib = () => root.querySelector("#wb-space-lib").value;

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

  root.querySelector("#wb-pca").addEventListener("click", () =>
    run("Projecting…", () => wbApi.pca({ molecules: lib() }), renderPca)
  );
  root.querySelector("#wb-cluster").addEventListener("click", () =>
    run("Clustering…", () => wbApi.cluster({ molecules: lib(), threshold: 0.4 }), renderCluster)
  );
  root.querySelector("#wb-matrix").addEventListener("click", () =>
    run("Computing…", () => wbApi.matrix({ molecules: lib() }), renderMatrix)
  );
  root.querySelector("#wb-scaf").addEventListener("click", () =>
    run("Decomposing…", () => wbApi.scaffolds({ molecules: lib() }), (h, r) =>
      renderScaffolds(h, r.distribution)
    )
  );
}

function renderPca(host, result) {
  if (result.status !== "ok") {
    host.innerHTML = notice(esc(result.note), "warn", "◌");
    return;
  }
  const points = result.points;
  const xs = points.map((p) => p.coordinates[0]);
  const ys = points.map((p) => p.coordinates[1]);
  const pad = 26;
  const w = 620;
  const h = 380;
  const sx = (v) =>
    pad + ((v - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1)) * (w - pad * 2);
  const sy = (v) =>
    h - pad - ((v - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys) || 1)) * (h - pad * 2);

  host.innerHTML = `
    <section class="wb-out lg-surface lg-d1">
      <header class="wb-pane-head">
        <h3>PCA — ${(result.cumulative_variance * 100).toFixed(1)}% of variance in two components</h3>
        <span class="dim small">${esc(result.fingerprint)} · ${result.informative_bits} informative bits</span>
      </header>
      <div class="wb-scroll">
        <svg viewBox="0 0 ${w} ${h}" class="wb-plot" role="img" aria-label="PCA of chemical space">
          <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="wb-axis" />
          <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" class="wb-axis" />
          ${points
            .map(
              (p) => `<g>
                <circle cx="${sx(p.coordinates[0]).toFixed(1)}" cy="${sy(p.coordinates[1]).toFixed(1)}" r="5" class="wb-dot" />
                <text x="${(sx(p.coordinates[0]) + 8).toFixed(1)}" y="${(sy(p.coordinates[1]) + 3).toFixed(1)}" class="wb-dot-label">${esc(
                  (p.name || p.smiles).slice(0, 16)
                )}</text>
              </g>`
            )
            .join("")}
          <text x="${w / 2}" y="${h - 6}" class="wb-axis-label">PC1 · ${(
            result.explained_variance_ratio[0] * 100
          ).toFixed(1)}%</text>
          <text x="10" y="${h / 2}" class="wb-axis-label" transform="rotate(-90 10 ${h / 2})">PC2 · ${(
            result.explained_variance_ratio[1] * 100
          ).toFixed(1)}%</text>
        </svg>
      </div>
      <p class="wb-note">${esc(result.interpretation)}</p>
    </section>`;
}

function renderCluster(host, result) {
  host.innerHTML = `
    <section class="wb-out lg-surface lg-d1">
      <header class="wb-pane-head">
        <h3>${result.cluster_count} clusters at Tanimoto ≥ ${result.similarity_threshold}</h3>
        <span class="dim small">${esc(result.method)} · ${esc(result.software)}</span>
      </header>
      <div class="wb-clusters">
        ${result.clusters
          .map(
            (c) => `<div class="wb-cluster">
              <div class="wb-cluster-head">
                <strong>Cluster ${c.rank + 1}</strong>
                <span class="dim small">${c.size} member${c.size === 1 ? "" : "s"} · centroid ${esc(
                  c.centroid.name || c.centroid.smiles.slice(0, 20)
                )}</span>
              </div>
              <div class="wb-chips">${c.members
                .map((m) => `<span class="wb-chip">${esc(m.name || m.smiles.slice(0, 18))}</span>`)
                .join("")}</div>
            </div>`
          )
          .join("")}
      </div>
      <p class="wb-note">${esc(result.interpretation)}</p>
    </section>`;
}

function renderMatrix(host, result) {
  const labels = result.labels;
  host.innerHTML = `
    <section class="wb-out lg-surface lg-d1">
      <header class="wb-pane-head">
        <h3>Similarity matrix</h3>
        <span class="dim small">${esc(result.fingerprint)} · ${esc(result.metric)} · mean ${
          result.summary.mean
        }</span>
      </header>
      <div class="wb-scroll">
        <table class="wb-matrix">
          <thead><tr><th></th>${labels
            .map((l) => `<th><span>${esc((l.name || l.smiles).slice(0, 12))}</span></th>`)
            .join("")}</tr></thead>
          <tbody>
            ${result.matrix
              .map(
                (row, i) => `<tr>
                  <th>${esc((labels[i].name || labels[i].smiles).slice(0, 16))}</th>
                  ${row
                    .map(
                      (v) =>
                        `<td style="background:rgba(62,224,143,${(v * 0.72).toFixed(
                          3
                        )})" title="${v}">${v.toFixed(2)}</td>`
                    )
                    .join("")}
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <p class="wb-note">${esc(result.note)}</p>
    </section>`;
}

function renderScaffolds(host, result) {
  host.innerHTML = `
    <section class="wb-out lg-surface lg-d1">
      <header class="wb-pane-head">
        <h3>${result.distinct_scaffolds} frameworks across ${result.molecules} molecules</h3>
        <span class="dim small">diversity ${result.scaffold_diversity}${
          result.acyclic ? ` · ${result.acyclic} acyclic` : ""
        }</span>
      </header>
      <table class="wb-table">
        <thead><tr><th>Scaffold</th><th class="num">Count</th><th class="num">Share</th><th>Members</th></tr></thead>
        <tbody>
          ${result.scaffolds
            .map(
              (s) => `<tr>
                <td class="mono small">${esc(s.scaffold)}</td>
                <td class="num mono">${s.count}</td>
                <td class="num mono">${(s.share * 100).toFixed(0)}%</td>
                <td class="small dim">${esc(
                  s.members.map((m) => m.name || m.smiles.slice(0, 14)).join(", ")
                )}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <p class="wb-note">${esc(result.interpretation)}</p>
    </section>`;
}
