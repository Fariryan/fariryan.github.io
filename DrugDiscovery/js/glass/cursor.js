/**
 * The Liquid Glass cursor.
 *
 * A small lens that sits on the pointer and refracts what is underneath it.
 *
 * It tracks the pointer exactly. An earlier version smoothed the lens with a
 * spring and put a separate dot on the true position, so that the thing you
 * aim with never fell behind your hand — but the dot only existed to
 * compensate for the lag, and a cursor that trails its own hotspot is a
 * cursor that is slightly wrong all the time. Removing the lag removes the
 * need for the dot, the spring, and the animation loop that drove them: the
 * lens is now the pointer rather than a decoration following it.
 *
 * Writes are coalesced to one per frame. A high-polling-rate mouse can fire
 * pointermove far faster than the display refreshes, and there is no value in
 * moving the lens more often than it can be painted. The position written is
 * always the latest one, so this costs no lag — only redundant work.
 *
 * The rules that keep it usable matter more than the effect:
 *
 *   · it never receives pointer events, so nothing under it changes behaviour
 *   · it shrinks over text and form fields so it never covers a glyph, and
 *     hides entirely over canvases, molecule and graph viewers, and for the
 *     whole duration of any drag — an orbit control needs the real cursor
 *     and its real hotspot. It shrinks over text; it does not fade out,
 *     because text is most of the interface and a cursor you cannot see on
 *     most of the interface is not a cursor
 *   · the native cursor is only hidden where the lens is actually standing in
 *     for it, so an I-beam or a grab hand is never lost
 *   · it does not exist on touch devices, under reduced motion, in forced
 *     colours, or at tier 3
 *
 * If any of those conditions is unmet the module simply does not start, and
 * the application is exactly as it was.
 */

import { installLensFilter } from "./filters.js";
import { capability } from "./tiers.js";

/** Where the lens must stand aside entirely and give back the real cursor.
 *
 * Only surfaces the pointer *manipulates*: a molecule you orbit, a graph you
 * pan, a canvas you draw on. There the lens would fight the interaction and
 * the real cursor carries information the lens cannot.
 *
 * Text fields used to be on this list, and that was wrong. A form is mostly
 * fields, so the lens vanished across whole views — half of "the cursor
 * disappears". The I-beam and the lens can coexist: the field keeps its
 * native caret cursor via CSS, which carries the hotspot, and the lens rides
 * along as decoration. It takes no pointer events either way.
 */
const HANDS_OFF = [
  "canvas",
  ".viewer",
  "#graph-canvas",
  ".mol-2d",
  "svg",
  ".lg-no-cursor",
].join(",");

/** Fields: the lens stays, in its small state, over the native caret. */
const FIELDS = "input, textarea, select, option, [contenteditable]";

/** What the lens opens up over. */
const ACTIONABLE = [
  "a",
  "button",
  ".lg-btn",
  ".clickable",
  "[data-nav]",
  ".entity-row",
  ".chip.clickable",
  ".sugg",
  "summary",
  "[role='button']",
  "[role='tab']",
].join(",");

/** Text the lens shrinks over, so it never sits on top of a glyph. It
 *  shrinks; it does not fade out. Fields join it, so the lens over an input
 *  is the same small ring it is over a paragraph. */
const TEXTUAL =
  "p, li, td, th, dd, dt, h1, h2, h3, h4, h5, h6, code, pre, label, " + FIELDS;

let lens = null;
let running = false;

let pointerX = 0;
let pointerY = 0;
let queued = false;

let visible = false;
let dragging = false;

/** Write the latest pointer position. One style write per frame, at most. */
function paint() {
  queued = false;
  lens.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`;
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(paint);
}

function show() {
  if (visible) return;
  visible = true;
  lens.classList.add("is-visible");
  document.documentElement.classList.add("lg-cursor-active");
}

function hide() {
  if (!visible) return;
  visible = false;
  lens.classList.remove("is-visible");
  document.documentElement.classList.remove("lg-cursor-active");
}

function onMove(event) {
  pointerX = event.clientX;
  pointerY = event.clientY;

  const target = event.target;
  const isElement = target instanceof Element;

  // During a drag the real cursor is doing the work — orbiting a protein,
  // selecting text, moving a panel. Stand down until it ends.
  if (dragging || (isElement && target.closest(HANDS_OFF))) {
    hide();
    return;
  }

  show();
  schedule();

  // A field is textual even when it sits inside a label or a button-like
  // wrapper: what the pointer is over is the field.
  const inField = isElement && target.closest(FIELDS);
  const actionable = !inField && isElement && target.closest(ACTIONABLE);
  const textual = !actionable && isElement && target.closest(TEXTUAL);
  lens.classList.toggle("is-hot", Boolean(actionable));
  lens.classList.toggle("is-text", Boolean(textual));
}

function onDown(event) {
  // Only a primary-button press starts a drag; a right-click opens a menu and
  // should not blank the cursor.
  if (event.button === 0) dragging = true;
  lens.classList.add("is-down");
}

function onUp() {
  dragging = false;
  lens.classList.remove("is-down");
}

/** Start the cursor, if this device and this user should have one. */
export function startCursor() {
  if (running || !capability.cursor) return;
  running = true;

  // Three layers, following lucasromerodb's macOS liquid-glass structure:
  //   effect  the backdrop blur, distorted by the lens filter
  //   tint    the faint body of the glass
  //   shine   the rim highlight and the catchlight
  // Separating them matters: the filter must apply to the backdrop layer
  // alone, or it would smear the rim and the catchlight along with it.
  installLensFilter();

  lens = document.createElement("div");
  lens.className = "lg-cursor";
  lens.setAttribute("aria-hidden", "true");
  lens.innerHTML =
    '<div class="lg-cursor-effect"></div>' +
    '<div class="lg-cursor-tint"></div>' +
    '<div class="lg-cursor-shine"></div>';

  document.body.appendChild(lens);

  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerup", onUp, { passive: true });
  document.addEventListener("pointercancel", onUp, { passive: true });
  document.addEventListener("pointerleave", hide, { passive: true });
  window.addEventListener("blur", hide, { passive: true });

  // A keyboard user has no pointer to decorate. The first Tab press stands
  // the lens down until the pointer is used again.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab") hide();
    },
    { passive: true }
  );
}

/** Remove the cursor entirely and restore the native one. */
export function stopCursor() {
  if (!running) return;
  running = false;
  hide();
  document.removeEventListener("pointermove", onMove);
  document.removeEventListener("pointerdown", onDown);
  document.removeEventListener("pointerup", onUp);
  document.removeEventListener("pointercancel", onUp);
  lens?.remove();
  lens = null;
}
