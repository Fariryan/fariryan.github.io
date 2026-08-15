/**
 * Chemical Space.
 *
 * The campaign's molecules, positioned by structure. Everything on this page
 * comes from the server: coordinates from the stored embedding, statuses from
 * the candidate rows, diversity from the fingerprint calculation. The view
 * draws; it does not compute.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { labApi } from "../../lab/api.js";
import { activeCampaign, discApi } from "../api.js";
import { ChemicalSpace, legend } from "../space3d.js";

let viewer = null;

export async function chemistryView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = loading("Computing the campaign's chemical space…");

  try {
    const space = await discApi.chemicalSpace(campaign.code);

    if (!space.available) {
      root.innerHTML = notice(
        `<strong>No chemical space yet.</strong><br />${esc(space.reason || "")}`,
        "muted",
        "◌"
      );
      return;
    }

    const generations = Math.max(...space.points.map((p) => p.generation), 0);
    const projection = space.projection || {};
    const diversity = space.diversity || {};

    root.innerHTML = `
      ${card(
        "Chemical space",
        `<div class="space-wrap">
          <div class="space-stage" id="space-stage"></div>
          <div class="space-side">
            <div class="space-legend">${legend()}</div>
            <div class="space-readout" id="space-readout">
              <span class="dim small">Click a molecule.</span>
            </div>
          </div>
        </div>
        <div class="toolbar mt">
          <label class="row small">Generations shown
            <input type="range" id="space-gen" min="0" max="${generations}"
                   value="${generations}" style="width:180px" />
            <span id="space-gen-value">all (${generations})</span>
          </label>
          <span class="spacer"></span>
          <span class="small dim">${space.points.length} molecules</span>
        </div>
        <div class="lab-note">
          Position is structure: a PCA over Morgan fingerprints, fitted once for
          this campaign so a molecule does not move when its neighbours change.
          These three components capture
          <strong>${((projection.total_explained || 0) * 100).toFixed(0)}%</strong>
          of the variance — the rest is lost in the projection, so points that
          look adjacent may be further apart than they appear.
          ${esc(space.scaling || "")}
        </div>`
      )}

      ${card(
        "Diversity",
        `<div class="disc-tiles">
          <div class="disc-tile">
            <div class="disc-tile-value">${diversity.mean_similarity ?? "—"}</div>
            <div class="disc-tile-label">Mean pairwise similarity</div>
            <div class="disc-tile-hint">Rising means the search is converging</div>
          </div>
          <div class="disc-tile">
            <div class="disc-tile-value">${diversity.clusters ?? "—"}</div>
            <div class="disc-tile-label">Clusters</div>
            <div class="disc-tile-hint">Leader clustering at 0.6 Tanimoto</div>
          </div>
          <div class="disc-tile">
            <div class="disc-tile-value">${diversity.distinct_scaffolds ?? "—"}</div>
            <div class="disc-tile-label">Distinct scaffolds</div>
            <div class="disc-tile-hint">Bemis–Murcko</div>
          </div>
        </div>
        <div class="lab-note">${esc(diversity.note || "")}</div>`
      )}`;

    const stage = root.querySelector("#space-stage");
    viewer?.destroy();
    viewer = new ChemicalSpace(stage);
    viewer.init();
    viewer.setPoints(space.points);

    const readout = root.querySelector("#space-readout");
    viewer.onSelect = (point) => {
      readout.innerHTML = `
        <div class="disc-code">${esc(point.code)}</div>
        <div class="mol-2d small">
          <img src="${esc(labApi.depictionUrl(point.smiles, 190, 140))}"
               alt="${esc(point.code)}" loading="lazy" />
        </div>
        <dl class="kv small">
          <dt>Generation</dt><dd>${point.generation}</dd>
          <dt>Status</dt><dd>${esc(point.status)}</dd>
          <dt>Front</dt><dd>${point.pareto_rank ?? "—"}</dd>
          ${point.seed_origin ? `<dt>Seed</dt><dd>${esc(point.seed_origin)}</dd>` : ""}
        </dl>
        <a class="sm" href="#/discovery/design?candidate=${point.id}">Open candidate →</a>`;
    };

    const slider = root.querySelector("#space-gen");
    const value = root.querySelector("#space-gen-value");
    slider.addEventListener("input", () => {
      const generation = Number(slider.value);
      value.textContent =
        generation === generations ? `all (${generations})` : `0–${generation}`;
      viewer.setGeneration(generation);
    });
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}
