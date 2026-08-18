/**
 * The Chemical Neighborhood.
 *
 * Given one molecule, show the chemically similar ones and say honestly what
 * each of them is. The whole design problem here is that a scatter of
 * identical dots invites the reader to conclude that everything on the plot is
 * equally real. It is not: an approved drug and a computational candidate
 * differ by about thirty years of evidence.
 *
 * So the encoding does the work that a caption cannot:
 *
 *   - **Colour** is the class, and the classes are not a gradient. Approved,
 *     withdrawn, clinical, experimental, metabolite and computational each get
 *     their own hue, and the legend is always on screen.
 *   - **Radius** is similarity to the centre, so distance from the middle is
 *     chemical distance and nothing else.
 *   - **Fill** is evidence: classes backed by human data are solid, and a
 *     computational candidate is drawn hollow. A hollow ring reads as
 *     provisional even to someone who never looks at the legend.
 *
 * Rendered as inline SVG rather than through a charting library: the shapes
 * are simple, the vendored libraries are for 3D and graphs, and adding a
 * dependency for forty circles would be the wrong trade.
 */

import { esc, loading, notice } from "../../ui.js";
import { chemApi } from "../api.js";
import { areaLabels, needsSubject, subject } from "../router.js";
import { areaPills, caveat, neighborBadge } from "../ui.js";

/** Class → colour. Semantic, never decorative, never reordered for looks. */
const CLASS_COLOR = {
  approved_drug: "#3fb950",
  withdrawn: "#f85149",
  clinical_candidate: "#4a9eff",
  experimental: "#d29922",
  metabolite: "#a371f7",
  computational_candidate: "#8b949e",
  unknown: "#6b7d92",
};

/** Classes drawn hollow: nothing has been observed about them in a human. */
const HOLLOW = new Set(["computational_candidate", "unknown"]);

export async function neighborhoodView(root, params) {
  const entityId = params?.get("entity") || subject.get()?.entity_id;
  if (!entityId) {
    root.innerHTML = needsSubject("the Chemical Neighborhood");
    return;
  }

  root.innerHTML = loading("Computing the neighbourhood…");
  const labels = await areaLabels();

  let threshold = Number(params?.get("threshold") || 0.35);
  const active = new Set(Object.keys(CLASS_COLOR));

  async function render() {
    root.innerHTML = loading("Computing similarity…");
    let payload;
    try {
      payload = await chemApi.neighborhood({
        entity_id: entityId,
        threshold,
        limit: 120,
      });
    } catch (error) {
      root.innerHTML = notice(esc(error.message), "danger", "⚠");
      return;
    }

    if (payload.error) {
      root.innerHTML = notice(esc(payload.error), "warn", "◌");
      return;
    }

    root.innerHTML = `
      <div class="ci-nb-controls">
        <div class="ci-nb-center">
          <strong>${esc(payload.center?.name || "query structure")}</strong>
          <span class="dim mono">${esc(payload.center?.inchikey || "")}</span>
        </div>
        <div class="spacer"></div>
        <label class="ci-slider">
          Tanimoto ≥ <output id="ci-th">${threshold.toFixed(2)}</output>
          <input type="range" id="ci-threshold" min="0.1" max="0.95" step="0.05"
                 value="${threshold}" />
        </label>
      </div>

      <div class="ci-nb-legend" id="ci-legend">
        ${(payload.legend || [])
          .map(
            (entry) => `
          <button class="ci-legend-item ${active.has(entry.class) ? "on" : ""}"
                  data-class="${esc(entry.class)}"
                  title="${esc(entry.description)}">
            <span class="swatch ${HOLLOW.has(entry.class) ? "hollow" : ""}"
                  style="--c:${CLASS_COLOR[entry.class] || "#888"}"></span>
            ${esc(entry.label)}
            <span class="n">${payload.counts[entry.class] || 0}</span>
          </button>`
          )
          .join("")}
      </div>

      <div class="ci-nb-grid">
        <section class="card ci-nb-plot-card">
          <h3>Similarity map</h3>
          <div id="ci-nb-plot"></div>
          <div class="ci-nb-scan">
            Scanned ${payload.scanned.toLocaleString()} structures ·
            ${payload.matched.toLocaleString()} above threshold ·
            showing ${payload.returned.toLocaleString()}
            ${
              payload.truncated
                ? ` · <strong>truncated</strong>: the fabric holds more
                     structures than one query scans`
                : ""
            }
          </div>
        </section>
        <section class="card ci-nb-list-card">
          <h3>Neighbours</h3>
          <div id="ci-nb-list"></div>
        </section>
      </div>

      ${caveat(payload.note)}
    `;

    const filtered = payload.neighbors.filter((n) => active.has(n.class));
    drawPlot(root.querySelector("#ci-nb-plot"), payload, filtered);
    drawList(root.querySelector("#ci-nb-list"), filtered, labels);

    const slider = root.querySelector("#ci-threshold");
    slider.addEventListener("input", () => {
      root.querySelector("#ci-th").textContent = Number(slider.value).toFixed(2);
    });
    slider.addEventListener("change", () => {
      threshold = Number(slider.value);
      render();
    });

    root.querySelectorAll(".ci-legend-item").forEach((button) =>
      button.addEventListener("click", () => {
        const key = button.dataset.class;
        if (active.has(key)) active.delete(key);
        else active.add(key);
        button.classList.toggle("on", active.has(key));
        const next = payload.neighbors.filter((n) => active.has(n.class));
        drawPlot(root.querySelector("#ci-nb-plot"), payload, next);
        drawList(root.querySelector("#ci-nb-list"), next, labels);
      })
    );
  }

  await render();
}

/**
 * Radial similarity map.
 *
 * Radius encodes 1 − similarity, so the centre is the query and everything
 * else sits at its chemical distance from it. Angle carries no meaning and is
 * assigned by golden-ratio increments to spread the points evenly — stated
 * here and in the caption, because an axis that looks meaningful and is not
 * is worse than no axis.
 */
function drawPlot(host, payload, neighbors) {
  const size = 520;
  const centre = size / 2;
  const maxRadius = centre - 46;
  const golden = Math.PI * (3 - Math.sqrt(5));

  const points = neighbors.map((neighbor, index) => {
    const distance = 1 - neighbor.similarity;
    const span = 1 - (payload.threshold ?? 0);
    const radius =
      span > 0 ? Math.min(distance / span, 1) * maxRadius : maxRadius / 2;
    const angle = index * golden;
    return {
      neighbor,
      x: centre + radius * Math.cos(angle),
      y: centre + radius * Math.sin(angle),
      r: neighbor.shares_scaffold ? 8 : 6,
    };
  });

  host.innerHTML = `
    <svg class="ci-nb-svg" viewBox="0 0 ${size} ${size}"
         role="img" aria-label="Chemical neighbourhood similarity map">
      ${[0.25, 0.5, 0.75, 1]
        .map(
          (fraction) => `
        <circle cx="${centre}" cy="${centre}" r="${maxRadius * fraction}"
                class="ci-nb-ring" />
        <text x="${centre + maxRadius * fraction - 4}" y="${centre - 4}"
              class="ci-nb-ringlabel">${(
                1 -
                fraction * (1 - (payload.threshold ?? 0))
              ).toFixed(2)}</text>`
        )
        .join("")}

      ${points
        .map(
          (point) => `
        <circle class="ci-nb-dot ${
          HOLLOW.has(point.neighbor.class) ? "hollow" : ""
        }"
                cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}"
                r="${point.r}"
                style="--c:${CLASS_COLOR[point.neighbor.class] || "#888"}"
                data-entity="${point.neighbor.entity_id}"
                tabindex="0">
          <title>${esc(point.neighbor.name)} — ${esc(
            point.neighbor.class_label
          )} — Tanimoto ${point.neighbor.similarity.toFixed(3)}${
            point.neighbor.shares_scaffold ? " — same scaffold" : ""
          }</title>
        </circle>`
        )
        .join("")}

      <circle cx="${centre}" cy="${centre}" r="11" class="ci-nb-center-dot" />
      <text x="${centre}" y="${centre + 30}" class="ci-nb-centerlabel">
        ${esc((payload.center?.name || "query").slice(0, 24))}
      </text>
    </svg>
    <div class="ci-nb-axis-note">
      Distance from the centre is <strong>1 − Tanimoto similarity</strong>.
      Angle carries no meaning; points are spread evenly so they do not
      overlap. A larger dot shares the centre's Bemis–Murcko scaffold.
    </div>`;

  host.querySelectorAll(".ci-nb-dot").forEach((node) => {
    const open = () => {
      window.location.hash = `#/chemint/molecule?entity=${node.dataset.entity}`;
    };
    node.addEventListener("click", open);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

function drawList(host, neighbors, labels) {
  if (!neighbors.length) {
    host.innerHTML = `<div class="ci-empty small"><div class="big">◌</div>
      <p>No neighbours at this threshold and filter.</p></div>`;
    return;
  }

  host.innerHTML = `
    <div class="ci-nb-list">
      ${neighbors
        .map(
          (neighbor) => `
        <a class="ci-nb-row" href="#/chemint/molecule?entity=${neighbor.entity_id}">
          <span class="ci-nb-swatch ${HOLLOW.has(neighbor.class) ? "hollow" : ""}"
                style="--c:${CLASS_COLOR[neighbor.class] || "#888"}"></span>
          <span class="ci-nb-sim mono">${neighbor.similarity.toFixed(3)}</span>
          <span class="ci-nb-name">
            ${esc(neighbor.name)}
            ${
              neighbor.shares_scaffold
                ? '<em class="ci-nb-scaffold">same scaffold</em>'
                : ""
            }
            <span class="ci-nb-areas">${areaPills(
              neighbor.therapeutic_areas,
              labels
            )}</span>
          </span>
          <span class="ci-nb-class">${neighborBadge(neighbor)}</span>
        </a>`
        )
        .join("")}
    </div>`;
}
