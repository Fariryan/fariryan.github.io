/**
 * The Liquid Glass cursor.
 *
 * A small lens that travels with the pointer and genuinely refracts what is
 * underneath it, plus a dot that sits on the true pointer position. The lens
 * lags; the dot does not. That separation is deliberate — it is what makes
 * the inertia read as weight rather than as input lag, because the thing you
 * are aiming with never falls behind your hand.
 *
 * The rules that keep it usable are more important than the effect:
 *
 *   · it never receives pointer events, so nothing under it changes behaviour
 *   · it hides over text, inputs, canvases, molecule and graph viewers, and
 *     for the whole duration of any drag — an orbit control or a text
 *     selection needs the real cursor and its real hotspot
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

/** Where the lens must stand aside and give back the real cursor. */
const HANDS_OFF = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable]",
  "canvas",
  ".viewer",
  "#graph-canvas",
  ".mol-2d",
  "svg",
  ".lg-no-cursor",
].join(",");

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

/** Text the lens shrinks over, so it never sits on top of a glyph. */
const TEXTUAL = "p, li, td, th, dd, dt, h1, h2, h3, h4, h5, h6, code, pre, label";

let lens = null;
let dot = null;
let running = false;

// True pointer position, and the lens's own lagging position.
let targetX = 0;
let targetY = 0;
let lensX = 0;
let lensY = 0;
let velocityX = 0;
let velocityY = 0;

let visible = false;
let dragging = false;
let frameHandle = 0;
let idleFrames = 0;
let lastFrame = 0;

/* The spring, in the same terms the reference component states it:
   stiffness 300, damping 26, unit mass. That works out to a natural frequency
   of about 17 rad/s and a damping ratio near 0.75 — snappy, and just
   underdamped enough that the lens overshoots slightly and settles rather
   than gliding to a stop. Integrated semi-implicitly against real elapsed
   time, so the feel does not change with frame rate. */
const STIFFNESS = 300;
const DAMPING = 26;

function tick(now) {
  frameHandle = 0;

  // Clamped so a backgrounded tab returning does not fling the lens.
  const dt = Math.min((now - lastFrame) / 1000 || 0.016, 0.05);
  lastFrame = now;

  const dx = targetX - lensX;
  const dy = targetY - lensY;

  velocityX += (STIFFNESS * dx - DAMPING * velocityX) * dt;
  velocityY += (STIFFNESS * dy - DAMPING * velocityY) * dt;
  lensX += velocityX * dt;
  lensY += velocityY * dt;

  lens.style.transform = `translate3d(${lensX.toFixed(2)}px, ${lensY.toFixed(2)}px, 0)`;

  // Settle and stop. A cursor that keeps a rAF loop alive while the pointer
  // is still is a permanent tax on every visualization on the page.
  const moving = Math.abs(dx) + Math.abs(dy) + (Math.abs(velocityX) + Math.abs(velocityY)) * 0.02;
  if (moving < 0.05) {
    idleFrames += 1;
    lensX = targetX;
    lensY = targetY;
    if (idleFrames > 2) return;
  } else {
    idleFrames = 0;
  }
  frameHandle = requestAnimationFrame(tick);
}

function wake() {
  if (!frameHandle) {
    idleFrames = 0;
    lastFrame = performance.now();
    frameHandle = requestAnimationFrame(tick);
  }
}

function show() {
  if (visible) return;
  visible = true;
  lens.classList.add("is-visible");
  dot.classList.add("is-visible");
  document.documentElement.classList.add("lg-cursor-active");
}

function hide() {
  if (!visible) return;
  visible = false;
  lens.classList.remove("is-visible");
  dot.classList.remove("is-visible");
  document.documentElement.classList.remove("lg-cursor-active");
}

function onMove(event) {
  targetX = event.clientX;
  targetY = event.clientY;

  // The dot is never smoothed: it must land exactly where the pointer is.
  dot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;

  const target = event.target;
  const isElement = target instanceof Element;

  // During a drag the real cursor is doing the work — orbiting a protein,
  // selecting text, moving a panel. Stand down until it ends.
  if (dragging || (isElement && target.closest(HANDS_OFF))) {
    hide();
    lensX = targetX;
    lensY = targetY;
    velocityX = 0;
    velocityY = 0;
    return;
  }

  show();
  wake();

  const actionable = isElement && target.closest(ACTIONABLE);
  const textual = !actionable && isElement && target.closest(TEXTUAL);
  lens.classList.toggle("is-hot", Boolean(actionable));
  lens.classList.toggle("is-text", Boolean(textual));
  dot.classList.toggle("is-hot", Boolean(actionable));
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
  wake();
}

/** Start the cursor, if this device and this user should have one. */
export function startCursor() {
  if (running || !capability.cursor) return;
  running = true;

  // Four layers, following lucasromerodb's macOS liquid-glass structure:
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

  dot = document.createElement("div");
  dot.className = "lg-cursor-dot";
  dot.setAttribute("aria-hidden", "true");

  document.body.append(lens, dot);

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
  dot?.remove();
  lens = null;
  dot = null;
  if (frameHandle) cancelAnimationFrame(frameHandle);
  frameHandle = 0;
}
