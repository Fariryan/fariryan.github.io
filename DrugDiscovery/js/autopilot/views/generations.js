/**
 * GENERATION VIEWER — one optimisation edit, everything synchronised.
 *
 * The panels all describe the same change: the 2D before and after with the
 * edited atoms highlighted, a 3D conformer of the result, the rationale the
 * optimiser recorded, what the edit did to each property, whether the change
 * has precedent, and how confident the engine was.
 *
 * Stepping is by *edit*, not by candidate. The edit is the unit a chemist
 * reads, and it is what the optimiser actually recorded a rationale for.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { apApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

let viewer = null;

export async function generationsView(host) {
  const runId = currentRun.get();
  if (!runId) {
    host.innerHTML = needsRun();
    return;
  }

  host.innerHTML = loading("Loading optimisation steps…");
  let index;
  try {
    index = await apApi.generations(runId);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!index.available) {
    host.innerHTML = notice(esc(index.reason), "muted", "◌");
    return;
  }

  host.innerHTML = `
    <div class="ap-stepper">
      <button class="sm" id="ap-prev">← Previous</button>
      <input type="range" id="ap-slider" min="0" max="${index.total_steps - 1}" value="0" />
      <button class="sm" id="ap-next">Next →</button>
      <span class="dim" id="ap-step-label"></span>
    </div>
    <p class="dim">${esc(index.note)}</p>
    <div id="ap-generation"></div>
  `;

  let step = 0;
  const slider = host.querySelector("#ap-slider");
  const label = host.querySelector("#ap-step-label");
  const panel = host.querySelector("#ap-generation");

  const show = async () => {
    slider.value = String(step);
    label.textContent = `step ${step + 1} of ${index.total_steps}`;
    panel.innerHTML = loading("Rendering…");
    try {
      const detail = await apApi.generation(runId, step);
      if (!detail.available) {
        panel.innerHTML = notice(esc(detail.reason), "warn", "⚠");
        return;
      }
      panel.innerHTML = renderStep(detail);
      mount3d(panel, detail);
    } catch (error) {
      panel.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  };

  host.querySelector("#ap-prev").addEventListener("click", () => {
    if (step > 0) {
      step -= 1;
      show();
    }
  });
  host.querySelector("#ap-next").addEventListener("click", () => {
    if (step < index.total_steps - 1) {
      step += 1;
      show();
    }
  });
  slider.addEventListener("input", () => {
    step = Number(slider.value);
    show();
  });

  await show();
}

function renderStep(d) {
  return `
    <div class="ap-gen-head">
      <span class="ap-pill">generation ${d.generation}</span>
      <strong>${esc(d.change.summary || "Edit")}</strong>
      ${d.child.on_frontier ? '<span class="ap-pill done">on the frontier</span>' : ""}
      ${
        d.outcome.abandon_reason
          ? `<span class="ap-pill failed">abandoned: ${esc(
              d.outcome.abandon_reason
            )}</span>`
          : ""
      }
    </div>

    <div class="ap-gen-grid">
      <div class="ap-gen-structures">
        ${
          d.parent
            ? `<figure class="ap-struct">
                 <figcaption>before — ${esc(d.parent.candidate_key)}</figcaption>
                 ${d.parent.svg || '<div class="dim">not depictable</div>'}
               </figure>
               <div class="ap-arrow">→</div>`
            : '<div class="dim">seed structure — no parent</div>'
        }
        <figure class="ap-struct changed">
          <figcaption>after — ${esc(d.child.candidate_key)}
            ${
              d.child.changed_atoms?.length
                ? `<span class="dim">${d.child.changed_atoms.length} atom(s) changed, highlighted</span>`
                : ""
            }
          </figcaption>
          ${d.child.svg || '<div class="dim">not depictable</div>'}
        </figure>
      </div>

      <div class="ap-gen-3d">
        <div class="ap-field-label">3D — computed conformer</div>
        <div id="ap-3d" class="ap-3d-canvas"></div>
        <p class="dim">${esc(d.conformer_note || "")}</p>
      </div>
    </div>

    <div class="ap-gen-panels">
      <div>
        <div class="ap-field-label">Change</div>
        <p><strong>${esc(d.change.summary || "—")}</strong></p>
        ${
          d.change.transformation
            ? `<p class="dim mono">${esc(d.change.transformation)}</p>`
            : ""
        }
        <div class="ap-field-label">Rationale</div>
        <p>${esc(d.change.rationale || "None recorded.")}</p>
        ${
          d.change.targeted_property
            ? `<p class="dim">Targeting <strong>${esc(
                d.change.targeted_property
              )}</strong>.</p>`
            : ""
        }
      </div>

      <div>
        <div class="ap-field-label">Property effect</div>
        ${renderEffect("improved", d.property_effect.improved)}
        ${renderEffect("worsened", d.property_effect.worsened)}
        ${renderEffect("unchanged", d.property_effect.unchanged)}
        <p class="dim">${esc(d.property_effect.note)}</p>
      </div>

      <div>
        <div class="ap-field-label">Known precedent</div>
        <p>${
          d.precedent.has_precedent
            ? "Related compounds carrying this change were found."
            : "No related compound carrying this change was found."
        }</p>
        <p class="dim">${esc(d.precedent.note)}</p>

        <div class="ap-field-label">Confidence</div>
        <p>${esc(d.confidence || "not stated")}</p>
        ${
          d.confidence_note
            ? `<p class="dim">${esc(d.confidence_note)}</p>`
            : ""
        }
      </div>
    </div>

    ${
      d.outcome.abandon_detail
        ? notice(
            `<strong>Why this branch was abandoned.</strong> ${esc(
              d.outcome.abandon_detail
            )}`,
            "warn",
            "◌"
          )
        : ""
    }`;
}

/**
 * One group of property changes.
 *
 * The optimiser records each delta with its measurement scale, and the
 * display honours it: a logarithmic property gets a fold change and never a
 * percentage, because a percentage on a log scale is meaningless. Where the
 * engine deliberately left `percent` null, nothing is invented to fill it.
 */
function renderEffect(kind, values) {
  const items = Array.isArray(values)
    ? values
    : Object.entries(values || {}).map(([property, value]) => ({ property, absolute: value }));
  if (!items.length) return "";

  const tone = kind === "improved" ? "done" : kind === "worsened" ? "warn" : "";
  return `<div class="ap-effect-group">
    <span class="ap-pill ${tone}">${kind}</span>
    <table class="ap-table compact">
      <tbody>${items
        .map(
          (item) => `<tr>
            <td>${esc(item.label || item.property || "")}</td>
            <td class="mono">${formatDelta(item)}</td>
            <td class="dim">${esc(item.direction || item.scale || "")}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table>
  </div>`;
}

function formatDelta(item) {
  const from = item.reference;
  const to = item.candidate;
  const parts = [];
  if (from !== undefined && to !== undefined && from !== null && to !== null) {
    parts.push(`${esc(String(from))} → ${esc(String(to))}`);
  }
  // Fold for logarithmic scales, percent only where the engine supplied one.
  if (item.fold != null) {
    parts.push(`${Number(item.fold).toFixed(2)}× `);
  } else if (item.percent != null) {
    parts.push(`${Number(item.percent) > 0 ? "+" : ""}${Number(item.percent).toFixed(1)}%`);
  } else if (item.absolute != null && typeof item.absolute === "number") {
    parts.push(`${item.absolute > 0 ? "+" : ""}${item.absolute.toFixed(3)}`);
  }
  return parts.join("  ") || "—";
}

/**
 * 3D rendering reuses the vendored 3Dmol.js the Preclinical and Molecular
 * Gradient tabs already use, so a structure looks the same wherever it is
 * shown. When the library is unavailable the panel says so rather than
 * failing silently.
 */
async function mount3d(host, detail) {
  const mount = host.querySelector("#ap-3d");
  if (!mount) return;
  if (!detail.conformer_sdf) {
    mount.innerHTML = `<div class="dim">No conformer could be generated.</div>`;
    return;
  }

  const library = window.$3Dmol;
  if (!library) {
    mount.innerHTML =
      `<div class="dim">The 3D viewer library is not loaded on this page.
       The structure is available as SDF through the API.</div>`;
    return;
  }

  try {
    viewer = library.createViewer(mount, { backgroundColor: "transparent" });
    viewer.addModel(detail.conformer_sdf, "sdf");
    viewer.setStyle({}, { stick: { radius: 0.15 }, sphere: { scale: 0.22 } });

    // The atoms the edit changed are highlighted in 3D as well as in 2D, so
    // the two panels are reading the same thing.
    for (const index of detail.child.changed_atoms || []) {
      viewer.setStyle(
        { serial: index },
        { stick: { radius: 0.2, color: "0x3fb950" }, sphere: { scale: 0.32, color: "0x3fb950" } }
      );
    }
    viewer.zoomTo();
    viewer.render();
    viewer.spin("y", 0.4);
  } catch (error) {
    mount.innerHTML = `<div class="dim">3D rendering failed: ${esc(
      error.message
    )}</div>`;
  }
}
