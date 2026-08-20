/**
 * Therapeutic-area selection, and disease entry.
 *
 * This is the first important decision the scientist makes, so it is given the
 * weight of one: a full-width grid of areas, each stating what delimits it,
 * followed by disease search against a real ontology and a manual-entry route
 * for anything the ontology has not caught up with.
 *
 * Selecting an area does not put the platform into a mode. Every existing view
 * — the atlas, the brain viewer, Discovery Lab, the preclinical stages — keeps
 * working exactly as before whether or not an area was ever chosen.
 */

import { esc, loading, notice } from "../../ui.js";
import { areasApi } from "../api.js";
import { selection } from "../store.js";
import { groundingBadge } from "../ui.js";

export async function selectView(root, params) {
  root.innerHTML = loading("Reading the therapeutic-area registry…");

  let registry;
  try {
    registry = await areasApi.list();
  } catch (error) {
    root.innerHTML = notice(
      `<strong>The therapeutic-area registry could not be read.</strong><br />${esc(
        error.message
      )}`,
      "danger",
      "⚠"
    );
    return;
  }

  const current = selection.get();
  const preselect = params?.get("area") || current?.area || null;

  root.innerHTML = `
    <div class="ta-select">
      ${renderAreaGrid(registry, preselect)}
      ${renderDiseasePanel(registry, preselect)}
    </div>`;

  wireAreaGrid(root, registry);
  wireDiseasePanel(root);
}

/* ------------------------------------------------------------------ areas */

function renderAreaGrid(registry, preselect) {
  const counts = registry.classification_counts || {};
  return `
    <section class="ta-picker lg-surface lg-d2">
      <header class="ta-picker-head">
        <div>
          <h3 class="ta-picker-title">Select therapeutic area</h3>
          <p class="ta-picker-sub">
            ${registry.count} areas, one shared discovery engine. The badge on each
            says what delimits it: ${counts.ontology_root || 0} map to an Open Targets
            therapeutic-area root, ${counts.ontology_term || 0} to a narrower ontology
            term, ${counts.user_defined || 0} are membership by selection.
          </p>
        </div>
      </header>
      <div class="ta-grid" role="listbox" aria-label="Therapeutic areas">
        ${registry.areas.map((a) => areaTile(a, a.key === preselect)).join("")}
      </div>
    </section>`;
}

function areaTile(area, active) {
  const spec =
    area.specialization !== "generic"
      ? `<span class="ta-spec" title="This area extends the shared engine with area-relevant property panels.">${esc(
          area.specialization
        )} specialization</span>`
      : "";
  return `
    <button
      class="ta-tile lg-interactive ta-accent-${esc(area.accent)} ${active ? "active" : ""}"
      data-area="${esc(area.key)}"
      role="option"
      aria-selected="${active ? "true" : "false"}"
    >
      <span class="ta-tile-top">
        <span class="ta-tile-name">${esc(area.name)}</span>
        ${groundingBadge(area)}
      </span>
      <span class="ta-tile-scope">${esc(area.scope || "")}</span>
      ${spec}
    </button>`;
}

function wireAreaGrid(root, registry) {
  root.querySelectorAll(".ta-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const key = tile.dataset.area;
      const area = registry.areas.find((a) => a.key === key);
      if (!area) return;

      root.querySelectorAll(".ta-tile").forEach((t) => {
        t.classList.toggle("active", t === tile);
        t.setAttribute("aria-selected", t === tile ? "true" : "false");
      });

      const existing = selection.get();
      selection.set({ area: area.key, area_name: area.name, disease: existing?.disease || null });

      const panel = root.querySelector("#ta-disease-panel");
      if (panel) {
        panel.outerHTML = renderDiseasePanel(registry, area.key);
        wireDiseasePanel(root);
      }
      root.querySelector("#ta-disease-input")?.focus();
    });
  });
}

/* --------------------------------------------------------------- diseases */

function renderDiseasePanel(registry, areaKey) {
  const area = registry.areas.find((a) => a.key === areaKey);

  if (!area) {
    return `
      <section class="ta-disease lg-surface lg-d1" id="ta-disease-panel">
        <div class="ta-disease-idle">
          <span class="ta-idle-glyph">◈</span>
          <p>Choose a therapeutic area above to search for a disease within it.</p>
        </div>
      </section>`;
  }

  const examples = (area.examples || []).length
    ? `<div class="ta-examples">
         <span class="ta-examples-label">Entry points</span>
         ${area.examples
           .map(
             (name) =>
               `<button class="ta-example lg-interactive" data-disease="${esc(name)}">${esc(
                 name
               )}</button>`
           )
           .join("")}
       </div>`
    : `<p class="ta-note-inline">
         This area has no preset entry points — it is defined by what you choose.
         Search or type any disease below.
       </p>`;

  const grounding = area.classification_note
    ? `<div class="ta-grounding-note">
         <strong>How this area is delimited.</strong> ${esc(area.classification_note)}
       </div>`
    : `<div class="ta-grounding-note">
         <strong>How this area is delimited.</strong> Membership follows the Open
         Targets therapeutic-area root ${esc((area.ontology_roots || []).join(", "))},
         so a disease belongs to it because the ontology says so.
       </div>`;

  return `
    <section class="ta-disease lg-surface lg-d1 ta-accent-${esc(area.accent)}" id="ta-disease-panel">
      <header class="ta-disease-head">
        <div>
          <h3>${esc(area.name)}</h3>
          <p class="ta-picker-sub">${esc(area.scope || "")}</p>
        </div>
        ${groundingBadge(area)}
      </header>

      ${grounding}
      ${examples}

      <div class="ta-search-row">
        <label class="ta-search-label" for="ta-disease-input">Disease</label>
        <div class="ta-search-field">
          <span class="ta-search-icon">⌕</span>
          <input
            id="ta-disease-input"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search a disease, paste an ontology ID (MONDO_0018177), or type any name…"
            aria-label="Disease search"
          />
        </div>
        <button id="ta-open" class="ta-open lg-interactive" data-area="${esc(area.key)}">
          Open workspace
        </button>
      </div>

      <div id="ta-suggestions" class="ta-suggestions" role="listbox"></div>
      <div id="ta-open-status" class="ta-open-status"></div>

      <p class="ta-manual-note">
        A name that matches no ontology term still opens a workspace. It is
        labelled <em>user-supplied</em> throughout, and never presented as an
        ontology term it is not.
      </p>
    </section>`;
}

function wireDiseasePanel(root) {
  const input = root.querySelector("#ta-disease-input");
  const suggestions = root.querySelector("#ta-suggestions");
  const openButton = root.querySelector("#ta-open");
  if (!input || !openButton) return;

  const areaKey = openButton.dataset.area;

  root.querySelectorAll(".ta-example").forEach((button) => {
    button.addEventListener("click", () => {
      input.value = button.dataset.disease;
      open(areaKey, input.value, root);
    });
  });

  let timer = null;
  let sequence = 0;

  input.addEventListener("input", () => {
    const query = input.value.trim();
    clearTimeout(timer);
    if (query.length < 3) {
      suggestions.innerHTML = "";
      return;
    }
    // Debounced: Open Targets is a public API and a request per keystroke
    // would be both slow and rude.
    timer = setTimeout(async () => {
      const mine = ++sequence;
      suggestions.innerHTML = `<div class="ta-suggest-loading">Searching the disease ontology…</div>`;
      try {
        const result = await areasApi.searchDiseases(query, 8);
        if (mine !== sequence) return; // a later keystroke already won
        renderSuggestions(suggestions, result, areaKey, root);
      } catch (error) {
        if (mine !== sequence) return;
        suggestions.innerHTML = `<div class="ta-suggest-error">Disease search is unavailable: ${esc(
          error.message
        )}. You can still type a name and open a workspace.</div>`;
      }
    }, 320);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      open(areaKey, input.value.trim(), root);
    }
  });

  openButton.addEventListener("click", () => open(areaKey, input.value.trim(), root));
}

function renderSuggestions(host, result, areaKey, root) {
  if (result.status === "unavailable" || result.status === "not_configured") {
    host.innerHTML = `<div class="ta-suggest-error">${esc(
      result.note || "Disease search is unavailable."
    )}</div>`;
    return;
  }
  if (!result.results?.length) {
    host.innerHTML = `<div class="ta-suggest-empty">${esc(
      result.note || "No disease matched."
    )} You can still open a workspace under the name you typed.</div>`;
    return;
  }
  host.innerHTML = result.results
    .map(
      (row) => `
      <button class="ta-suggest lg-interactive" data-id="${esc(row.id)}" role="option">
        <span class="ta-suggest-name">${esc(row.name || row.id)}</span>
        <span class="mono small dim">${esc(row.id)}</span>
      </button>`
    )
    .join("");

  host.querySelectorAll(".ta-suggest").forEach((button) => {
    button.addEventListener("click", () => open(areaKey, button.dataset.id, root));
  });
}

function open(areaKey, disease, root) {
  if (!disease) {
    const status = root.querySelector("#ta-open-status");
    if (status) {
      status.innerHTML = `<div class="ta-suggest-error">Enter or choose a disease first.</div>`;
    }
    return;
  }
  const existing = selection.get();
  selection.set({
    area: areaKey,
    area_name: existing?.area === areaKey ? existing.area_name : areaKey,
    disease,
  });
  window.location.hash = `#/areas/workspace?area=${encodeURIComponent(
    areaKey
  )}&disease=${encodeURIComponent(disease)}`;
}
