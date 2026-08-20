/**
 * The therapeutic-area entry panel, rendered at the top of the dashboard.
 *
 * This is the first important decision a scientist makes, so it sits above
 * everything else on the first page. It is deliberately a *separate module*
 * from the dashboard: if the area layer is switched off with AREAS_ENABLED=0,
 * or its API cannot be reached, this renders nothing at all and the dashboard
 * below it is exactly the page it was before this phase.
 *
 * The panel's title is a styled div rather than a heading element. That is not
 * an oversight: the dashboard's first heading is "Neurological therapeutics
 * atlas", the rendered-state baseline records it, and inserting a heading
 * above it would register as a heading change in the regression probe for no
 * benefit. The section carries an aria-label so it is still announced as a
 * named region.
 */

import { esc } from "../ui.js";
import { areasApi } from "./api.js";
import { selection } from "./store.js";

/** How many areas the dashboard shows before deferring to the full picker. */
const PREVIEW = 12;

export async function renderAreaEntry(host) {
  if (!host) return;

  let registry;
  try {
    registry = await areasApi.list();
  } catch {
    // The layer is off, or unreachable. The dashboard stands on its own.
    host.innerHTML = "";
    return;
  }
  if (!registry?.areas?.length) {
    host.innerHTML = "";
    return;
  }

  const current = selection.get();
  const resume =
    current?.area && current?.disease
      ? `<div class="ta-entry-resume">
           <span>Last opened</span>
           <a href="#/areas/workspace?area=${encodeURIComponent(
             current.area
           )}&disease=${encodeURIComponent(current.disease)}">
             ${esc(current.disease)} · ${esc(current.area_name || current.area)}
           </a>
         </div>`
      : "";

  const counts = registry.classification_counts || {};

  host.innerHTML = `
    <section class="ta-entry lg-surface lg-d2" aria-label="Select therapeutic area">
      <header class="ta-entry-head">
        <div>
          <div class="ta-entry-title">Select therapeutic area</div>
          <p class="ta-entry-sub">
            One shared discovery engine, ${registry.count} therapeutic areas.
            The area configures the engine — it does not fork it, and every
            capability below is the same in all of them.
            ${counts.ontology_root || 0} areas map to an Open Targets
            therapeutic-area root; the rest say plainly what delimits them.
          </p>
        </div>
      </header>

      <div class="ta-entry-grid">
        ${registry.areas
          .slice(0, PREVIEW)
          .map(
            (a) => `
          <a class="ta-entry-tile ta-accent-${esc(a.accent)}"
             href="#/areas/select?area=${encodeURIComponent(a.key)}"
             title="${esc(a.scope || a.name)}">${esc(a.name)}</a>`
          )
          .join("")}
      </div>

      <a class="ta-entry-more" href="#/areas/select">
        All ${registry.count} areas, disease search and manual entry →
      </a>
      ${resume}
    </section>`;
}
