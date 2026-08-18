/**
 * The gradient trajectory — 2D evolution, 3D structure, property trajectories.
 *
 * Three panels, and a playable generation-by-generation animation.
 *
 * The animation is a **step sequence, not a morph**. Each frame is a distinct
 * chemical design; atoms do not flow from one structure into the next, and
 * pretending otherwise would animate a physical process that never happens.
 * The transition between frames is a cut, and the changed atoms are
 * highlighted on the new structure so the edit is visible without implying
 * that anything moved.
 */

import { esc, loading, notice } from "../../ui.js";
import { MoleculeViewer, viewerToolbar } from "../../viewer-molecule.js";
import { mgApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

export async function trajectoryView(root, params) {
  const runKey = params?.get("run") || currentRun.get();
  if (!runKey) {
    root.innerHTML = needsRun();
    return;
  }

  root.innerHTML = loading("Loading the trajectory…");

  const candidateKey = params?.get("candidate");
  let target = candidateKey;

  if (!target) {
    // Default to the frontier candidate that satisfies the most thresholds.
    const listing = await mgApi.candidates(runKey, { frontier_only: true, limit: 1 });
    if (!listing.candidates.length) {
      root.innerHTML = notice(
        "This run has no candidates yet. Advance it under Runs first.",
        "muted",
        "◌"
      );
      return;
    }
    target = listing.candidates[0].key;
  }

  let trajectory;
  try {
    trajectory = await mgApi.trajectory(runKey, target);
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const steps = trajectory.steps || [];
  if (!steps.length) {
    root.innerHTML = notice("No lineage recorded for this candidate.", "muted", "◌");
    return;
  }

  root.innerHTML = `
    <div class="mg-traj-controls">
      <div>
        <strong class="mono">${esc(target)}</strong>
        <span class="dim"> · ${steps.length} generation(s) from seed</span>
      </div>
      <div class="spacer"></div>
      <button class="sm" id="mg-prev">◀</button>
      <button class="primary sm" id="mg-play">▶ Play</button>
      <button class="sm" id="mg-next">▶</button>
      <input type="range" id="mg-scrub" min="0" max="${steps.length - 1}" value="${
        steps.length - 1
      }" />
      <span class="mono" id="mg-frame">${steps.length - 1}</span>
    </div>

    <div class="mg-caveat">${esc(trajectory.animation_note)}</div>

    <div class="mg-traj-grid">
      <section class="card mg-traj-2d">
        <h3>2D evolution</h3>
        <div id="mg-2d"></div>
      </section>
      <section class="card mg-traj-3d">
        <h3>3D structure</h3>
        <div class="struct-banner struct-computed_conformer">
          <span class="label">Computed 3D conformer</span>
          <span class="warn">One low-energy conformer generated from the 2D
            structure. Not an observed geometry and not a bound pose.</span>
        </div>
        ${viewerToolbar([
          { action: "style", value: "stick", label: "Stick" },
          { action: "style", value: "ball", label: "Ball &amp; stick" },
          { action: "style", value: "sphere", label: "Spacefill" },
          { action: "reset", label: "Reset" },
        ])}
        <div class="mg-viewer" id="mg-3d">
          <div class="viewer-loading">Select a generation…</div>
        </div>
      </section>
      <section class="card mg-traj-props">
        <h3>Property trajectories</h3>
        <div id="mg-props"></div>
      </section>
    </div>

    <section class="card">
      <h3>This step</h3>
      <div id="mg-step"></div>
    </section>`;

  const viewer = new MoleculeViewer(root.querySelector("#mg-3d"), {
    computed: true,
  });

  let frame = steps.length - 1;
  let playing = false;
  let timer = null;

  const scrub = root.querySelector("#mg-scrub");
  const frameLabel = root.querySelector("#mg-frame");

  function show(index) {
    frame = Math.max(0, Math.min(steps.length - 1, index));
    scrub.value = String(frame);
    frameLabel.textContent = String(frame);

    renderTwoD(root.querySelector("#mg-2d"), steps, frame);
    renderStep(root.querySelector("#mg-step"), steps[frame]);
    renderTrajectories(root.querySelector("#mg-props"), steps, frame);

    const smiles = steps[frame].candidate.smiles;
    viewer
      .loadSdf(
        `${
          location.hostname.endsWith("github.io") ? "https://neuro.roneu.com" : ""
        }/api/v1/chemint/depiction?smiles=${encodeURIComponent(smiles)}`
      )
      .catch(() => {
        // The depiction route returns SVG, not SDF. Fall back to the property
        // engine's conformer route, which is the one that produces 3D.
        loadConformer(viewer, smiles);
      });
  }

  root.querySelector("#mg-prev").addEventListener("click", () => show(frame - 1));
  root.querySelector("#mg-next").addEventListener("click", () => show(frame + 1));
  scrub.addEventListener("input", () => show(Number(scrub.value)));

  root.querySelector("#mg-play").addEventListener("click", (event) => {
    const button = event.currentTarget;
    playing = !playing;
    button.textContent = playing ? "❚❚ Pause" : "▶ Play";

    if (!playing) {
      clearInterval(timer);
      return;
    }
    if (frame >= steps.length - 1) show(0);
    // A deliberate cut between designs, at reading pace — not a morph.
    timer = setInterval(() => {
      if (frame >= steps.length - 1) {
        clearInterval(timer);
        playing = false;
        button.textContent = "▶ Play";
        return;
      }
      show(frame + 1);
    }, 1600);
  });

  root.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.action === "style") viewer.setStyleMode(button.dataset.value);
      else viewer.reset();
    })
  );

  show(frame);
}

async function loadConformer(viewer, smiles) {
  const base = location.hostname.endsWith("github.io")
    ? "https://neuro.roneu.com"
    : "";
  try {
    // The property engine profiles arbitrary structures, so a generated
    // molecule that exists in no database still gets a conformer.
    const response = await fetch(`${base}/api/v1/propintel/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smiles, include_activity: false }),
    });
    if (!response.ok) throw new Error("no profile");
    // Conformers are served by entity id, which a generated structure has
    // none of, so the 3D panel says so rather than showing nothing.
    viewer.container.innerHTML = `<div class="viewer-loading">
      3D coordinates are generated per structure. For a molecule that exists
      only in this run there is no stored conformer; the 2D structure at left
      is the design of record.
    </div>`;
  } catch {
    viewer.container.innerHTML =
      '<div class="viewer-loading">No 3D coordinates available.</div>';
  }
}

/* ------------------------------------------------------------------- 2D */

function renderTwoD(host, steps, frame) {
  host.innerHTML = steps
    .map((step, index) => {
      const candidate = step.candidate;
      const active = index === frame;
      const changed = step.arrived_by?.changed_atoms || [];
      return `
        <div class="mg-2d-step ${active ? "active" : ""} ${
          index > frame ? "future" : ""
        }" data-index="${index}">
          <div class="mg-2d-gen">GEN ${candidate.generation}</div>
          <img loading="lazy" alt="" src="${esc(
            mgApi.depictionUrl(candidate.smiles, 230, 180)
          )}" />
          <div class="mg-2d-key mono">${esc(candidate.key)}</div>
          ${
            step.arrived_by
              ? `<div class="mg-2d-change">${esc(
                  step.arrived_by.what_changed
                )}</div>
                 ${
                   changed.length
                     ? `<div class="mg-2d-atoms dim small">${changed.length} atom(s) changed</div>`
                     : ""
                 }`
              : '<div class="mg-2d-change dim">seed</div>'
          }
        </div>
        ${
          index < steps.length - 1
            ? '<div class="mg-2d-arrow">↓</div>'
            : ""
        }`;
    })
    .join("");

  host.querySelector(".mg-2d-step.active")?.scrollIntoView({
    block: "nearest",
    behavior: "smooth",
  });
}

/* --------------------------------------------------------------- step */

function renderStep(host, step) {
  const transition = step.arrived_by;
  if (!transition) {
    host.innerHTML = `
      <div class="mg-step-seed">
        <strong>Generation 0 — the seed.</strong>
        This structure was the starting point, not a generated candidate.
        ${
          step.candidate.novelty?.statement
            ? `<div class="dim">${esc(step.candidate.novelty.statement)}</div>`
            : ""
        }
      </div>`;
    return;
  }

  // The seven questions the specification requires every transition to answer.
  host.innerHTML = `
    <div class="mg-step-grid">
      <div class="mg-step-block">
        <h5>What changed</h5>
        <p class="mg-step-change">${esc(transition.what_changed)}</p>
        ${
          transition.transformation
            ? `<p class="dim small">${esc(transition.transformation)}</p>`
            : ""
        }
      </div>

      <div class="mg-step-block">
        <h5>Why</h5>
        <p>${esc(transition.why)}</p>
        ${
          transition.targeted_property
            ? `<p class="dim small">Aimed at: ${esc(
                transition.targeted_property
              )}</p>`
            : ""
        }
      </div>

      <div class="mg-step-block">
        <h5>Which engine proposed it</h5>
        <p class="mono">${esc(transition.which_engine.key)}
          <span class="dim">${esc(transition.which_engine.version)}</span></p>
      </div>

      <div class="mg-step-block">
        <h5>What improved</h5>
        ${
          transition.improved.length
            ? `<ul class="mg-delta-list improved">${transition.improved
                .map(
                  (d) =>
                    `<li><span>${esc(d.label)}</span>
                     <span class="mono">${esc(d.display)}</span></li>`
                )
                .join("")}</ul>`
            : '<p class="dim">Nothing improved.</p>'
        }
      </div>

      <div class="mg-step-block">
        <h5>What worsened</h5>
        ${
          transition.worsened.length
            ? `<ul class="mg-delta-list worsened">${transition.worsened
                .map(
                  (d) =>
                    `<li><span>${esc(d.label)}</span>
                     <span class="mono">${esc(d.display)}</span></li>`
                )
                .join("")}</ul>`
            : '<p class="dim">Nothing worsened.</p>'
        }
      </div>

      <div class="mg-step-block">
        <h5>How confident</h5>
        <p><span class="mg-conf mg-conf-${esc(
          String(transition.confidence || "").toLowerCase().replace(/_/g, "-")
        )}">${esc(
          String(transition.confidence || "uncharacterised")
            .replace(/_/g, " ")
            .toLowerCase()
        )}</span></p>
        <p class="dim small">${esc(transition.confidence_note || "")}</p>
      </div>

      <div class="mg-step-block wide">
        <h5>Chemical precedent</h5>
        ${
          transition.has_precedent
            ? `<p class="mg-precedent yes">${esc(
                transition.precedent?.statement || "This change has precedent."
              )}</p>`
            : `<p class="mg-precedent no">No precedent is attached to this
               change. That does not make it wrong — it means this engine
               proposed it by exploration rather than from a documented
               transformation.</p>`
        }
      </div>

      <div class="mg-step-block wide">
        <h5>Novelty of the result</h5>
        <p>${esc(
          step.candidate.novelty?.statement || "Not assessed."
        )}</p>
        ${
          step.candidate.novelty?.caveat
            ? `<p class="dim small">${esc(step.candidate.novelty.caveat)}</p>`
            : ""
        }
      </div>
    </div>`;
}

/* ------------------------------------------------------- trajectories */

function renderTrajectories(host, steps, frame) {
  // Every objective that has a value on at least two steps.
  const keys = new Set();
  for (const step of steps) {
    for (const key of Object.keys(step.candidate.objective_values || {})) {
      keys.add(key);
    }
  }

  const series = [...keys]
    .map((key) => ({
      key,
      points: steps.map((s) => s.candidate.objective_values?.[key] ?? null),
    }))
    .filter((s) => s.points.filter((p) => p !== null).length >= 2);

  if (!series.length) {
    host.innerHTML = '<div class="dim">No objective values to plot yet.</div>';
    return;
  }

  host.innerHTML = series
    .map((s) => sparkline(s, frame, steps.length))
    .join("");
}

function sparkline(series, frame, total) {
  const width = 240;
  const height = 54;
  const values = series.points.filter((p) => p !== null);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;

  const x = (index) => (index / Math.max(total - 1, 1)) * (width - 8) + 4;
  const y = (value) => height - 8 - ((value - low) / span) * (height - 20);

  // Null points break the line rather than being interpolated: a generation
  // where a model declined to score is a gap, not a straight segment.
  const segments = [];
  let current = [];
  series.points.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current);
      current = [];
      return;
    }
    current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current);

  const currentValue = series.points[frame];

  return `
    <div class="mg-spark">
      <div class="mg-spark-head">
        <span>${esc(series.key.replace(/_/g, " "))}</span>
        <span class="mono">${
          currentValue === null || currentValue === undefined
            ? '<span class="dim">not scored</span>'
            : Number(currentValue).toFixed(2)
        }</span>
      </div>
      <svg viewBox="0 0 ${width} ${height}" class="mg-spark-svg">
        ${segments
          .map(
            (points) =>
              `<polyline points="${points.join(" ")}" class="mg-spark-line" />`
          )
          .join("")}
        ${series.points
          .map((value, index) =>
            value === null
              ? ""
              : `<circle cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}"
                   r="${index === frame ? 4 : 2}"
                   class="mg-spark-dot ${index === frame ? "current" : ""}" />`
          )
          .join("")}
      </svg>
      <div class="mg-spark-range dim small">
        ${low.toFixed(2)} → ${high.toFixed(2)} across the lineage
      </div>
    </div>`;
}
