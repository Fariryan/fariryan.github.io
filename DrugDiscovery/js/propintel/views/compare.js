/**
 * Reference comparison.
 *
 * Finds comparators in the Chemical Intelligence fabric, then shows how the
 * candidate differs. The delta rendering is where the care goes: a percentage
 * appears only where the property has a true zero, and the reason is shown on
 * hover for every delta so the choice is never mysterious.
 */

import { esc, loading, notice } from "../../ui.js";
import { propApi } from "../api.js";
import { needsStructure, structure } from "../router.js";

export async function compareView(root) {
  const smiles = structure.get();
  if (!smiles) {
    root.innerHTML = needsStructure();
    return;
  }

  root.innerHTML = loading("Finding reference compounds…");

  let references;
  try {
    references = await propApi.references(smiles, { limit: 6, threshold: 0.25 });
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!references.available) {
    root.innerHTML = notice(esc(references.reason), "warn", "◌");
    return;
  }

  const groups = references.groups || {};
  const candidates = Object.entries(groups).flatMap(([klass, entries]) =>
    entries.slice(0, 3).map((entry) => ({ ...entry, klass }))
  );

  if (!candidates.length) {
    root.innerHTML = `
      <div class="pi-empty">
        <div class="big">◌</div>
        <p><strong>No reference compound was close enough to compare.</strong></p>
        <p class="dim">Nothing in the fabric reaches the similarity threshold.
        That means this structure sits in chemical territory the fabric has not
        ingested, not that it is unprecedented.</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <section class="card">
      <h3>Nearest known compounds</h3>
      <p class="dim small">${esc(references.note)}</p>
      <div class="pi-refs">
        ${candidates
          .map(
            (entry) => `
          <label class="pi-ref">
            <input type="checkbox" value="${esc(entry.smiles)}"
                   data-name="${esc(entry.name)}"
                   ${entry.klass === "approved_drug" ? "checked" : ""} />
            <span class="pi-ref-name">${esc(entry.name)}</span>
            <span class="pi-ref-class pi-band-${esc(entry.class)}">${esc(
              entry.class_label
            )}</span>
            <span class="mono dim">${entry.similarity.toFixed(3)}</span>
          </label>`
          )
          .join("")}
      </div>
      <button class="primary" id="pi-compare-run">Compare against selected</button>
    </section>
    <div id="pi-compare-result"></div>`;

  const host = root.querySelector("#pi-compare-result");
  root.querySelector("#pi-compare-run").addEventListener("click", async () => {
    const selected = [...root.querySelectorAll(".pi-ref input:checked")].map(
      (node) => ({ smiles: node.value, name: node.dataset.name })
    );
    if (!selected.length) {
      host.innerHTML = notice("Select at least one reference.", "muted", "◌");
      return;
    }

    host.innerHTML = loading("Computing deltas…");
    try {
      const result = await propApi.compare(smiles, selected.slice(0, 6));
      host.innerHTML = renderComparisons(result);
    } catch (error) {
      host.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });

  // Comparing against the approved drugs is the default question, so run it.
  root.querySelector("#pi-compare-run").click();
}

function renderComparisons(result) {
  return `
    <div class="pi-caveat">${esc(result.scale_note)}</div>
    ${(result.comparisons || [])
      .map((comparison) =>
        comparison.error
          ? `<section class="card"><h3>${esc(comparison.reference)}</h3>
             <p class="dim">${esc(comparison.error)}</p></section>`
          : `
        <section class="card">
          <h3>vs ${esc(comparison.reference)}</h3>
          <p class="dim small">${esc(comparison.summary)}</p>
          <div class="pi-deltas">
            ${(comparison.deltas || [])
              .map(
                (delta) => `
              <div class="pi-delta pi-delta-${esc(delta.direction)}"
                   title="${esc(delta.explanation)}">
                <span class="pi-delta-label">${esc(delta.label)}</span>
                <span class="pi-delta-value">${esc(delta.display)}</span>
                <span class="pi-delta-scale">${esc(delta.scale)}</span>
              </div>`
              )
              .join("")}
          </div>
        </section>`
      )
      .join("")}`;
}
