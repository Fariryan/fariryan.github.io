/**
 * Liquid Glass — boot.
 *
 * One entry point, imported once by the application shell. Everything it
 * starts is additive: if this module were removed, the application would keep
 * every route, every viewer and every calculation it has, and lose only the
 * optics. That property is deliberate — the scientific layer must never
 * depend on the material layer.
 */

import { refreshAdaptive, startAdaptive } from "./adaptive.js";
import { startCursor } from "./cursor.js";
import { applyOptics } from "./enhance.js";
import { refreshEnvironment, startEnvironment } from "./environment.js";
import { installFilters } from "./filters.js";
import { restorePanels, startPanels } from "./panel.js";
import { startPointerOptics } from "./pointer.js";
import { capability, detectTier } from "./tiers.js";

export { capability } from "./tiers.js";
export { suspendEnvironment, resumeEnvironment } from "./environment.js";

let booted = false;

/** Detect capability, install the material, and start the interactions. */
export function startGlass() {
  if (booted) return capability;
  booted = true;

  detectTier();
  installFilters();
  startEnvironment();
  startPointerOptics();
  startPanels();
  startCursor();
  startAdaptive();
  applyOptics();

  return capability;
}

/**
 * Re-apply everything that depends on the current DOM.
 *
 * The router replaces the whole view subtree on navigation, so the optical
 * budget has to be recomputed, remembered panel geometry reapplied, and the
 * adaptive frosting re-measured against whatever visualization the new route
 * just mounted.
 */
export function refreshGlass() {
  applyOptics();
  restorePanels();
  refreshAdaptive();
}

/** After a theme change: the environment palette follows the theme. */
export function retheme() {
  refreshEnvironment();
}
