/**
 * Applying the expensive optics selectively.
 *
 * Displacement refraction is a full SVG filter pass over everything behind a
 * surface, and the cost scales with the surface's area and with how many of
 * them are on screen. A dashboard with forty cards that each ran the filter
 * would spend its entire frame budget refracting, which is exactly the
 * failure mode this design has to avoid — the glass exists to sit over
 * scientific visualization, and the visualization has first claim on the GPU.
 *
 * So the policy is explicit and countable:
 *
 *   · shell chrome — the command bar, the navigation rail, the dock — always
 *     refracts. It is a fixed, small set and it is what the eye reads as the
 *     material of the application
 *   · content panes refract only while there are few enough of them to stay
 *     within budget; past that threshold they fall back to the tier-2 optics,
 *     which at content-pane scale are very hard to tell apart
 *   · a handful of hero surfaces get chromatic aberration, hard-capped
 *
 * Everything below the threshold looks the same either way; what changes is
 * whether a heavy page still hits frame rate.
 */

import { capability } from "./tiers.js";

/** Above this many candidate panes, content stops paying for displacement.
 *
 * Measured rather than guessed: on the dashboard — the densest route in the
 * application, sixteen panes over a live ambient field — displacement stays
 * within frame budget on desktop hardware, and the list views that exceed
 * this are long scrolling tables where the effect is barely visible anyway. */
const REFRACT_BUDGET = 22;
/** Hard cap on simultaneous chromatic surfaces. Three passes each. */
const CHROMATIC_BUDGET = 3;

/** Surfaces that always refract, however busy the page is. */
const CHROME = ".lg-rail, .lg-commandbar, .lg-dock, .lg-inspector, .suggestions, .gate";

/** Content surfaces that refract when there is budget for it. */
const CONTENT = ".card, .stat, .lg-panel, .viewer-overlay";

/** Surfaces that carry chromatic aberration, in priority order. */
const HERO = [".lg-commandbar", ".lg-inspector.is-active", ".lg-rail"];

/** Panes whose frosting adapts to what is behind them. */
const ADAPTIVE = ".lg-rail, .lg-commandbar, .lg-dock, .lg-inspector, .lg-panel, .viewer-overlay";

/**
 * Re-apply the optical budget to the current document.
 *
 * Called after every route render. Cheap: three querySelectorAll passes and a
 * class toggle each, no layout reads.
 */
export function applyOptics(root = document) {
  if (capability.tier !== 1) return;

  root.querySelectorAll(CHROME).forEach((node) => node.classList.add("lg-refract"));

  const panes = [...root.querySelectorAll(CONTENT)];
  const affordable = panes.length <= REFRACT_BUDGET;
  panes.forEach((node) => node.classList.toggle("lg-refract", affordable));

  if (capability.chromatic) {
    let spent = 0;
    for (const selector of HERO) {
      for (const node of root.querySelectorAll(selector)) {
        if (spent >= CHROMATIC_BUDGET) break;
        node.classList.add("lg-chromatic");
        spent += 1;
      }
    }
  }

  root
    .querySelectorAll(ADAPTIVE)
    .forEach((node) => node.setAttribute("data-lg-adaptive", "overlap"));
}
