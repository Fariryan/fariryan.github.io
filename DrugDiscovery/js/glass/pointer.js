/**
 * Pointer-responsive optics.
 *
 * Every specular highlight in the system reads three custom properties —
 * --lg-mx, --lg-my and --lg-hot — and this module is the only thing that
 * writes them. That matters for performance: a design where each glass
 * component installed its own mousemove listener would run hundreds of
 * handlers and hundreds of style writes per frame. Here there is one listener
 * on the document, and at most two elements are written per frame: the
 * surface the pointer just entered and the one it just left.
 *
 * Magnetic attraction is handled in the same pass, for the same reason.
 */

const HOT_SELECTOR = ".lg, .lg-btn, .lg-field";
const MAGNET_SELECTOR = ".lg-magnetic";

/** How far outside its own box a magnetic control still reaches, in px. */
const MAGNET_RANGE = 26;
/** Fraction of the offset from centre that the control travels. */
const MAGNET_PULL = 0.32;
/** Hard cap so a control never separates from its own label. */
const MAGNET_MAX = 7;

let pointerX = 0;
let pointerY = 0;
let queued = false;
let currentHot = null;
let currentMagnet = null;
let enabled = false;

function clearSurface(node) {
  if (!node) return;
  node.style.removeProperty("--lg-mx");
  node.style.removeProperty("--lg-my");
  node.style.removeProperty("--lg-hot");
}

function clearMagnet(node) {
  if (!node) return;
  node.style.removeProperty("--lg-magx");
  node.style.removeProperty("--lg-magy");
}

/**
 * Resolve the glass surface under the pointer.
 *
 * Nested glass is common — a button inside a toolbar inside a panel — and
 * lighting all three at once looks like a bug. The innermost surface wins,
 * which is also the one the pointer is actually addressing.
 */
function surfaceAt(target) {
  if (!(target instanceof Element)) return null;
  return target.closest(HOT_SELECTOR);
}

function frame() {
  queued = false;
  if (!enabled) return;

  const target = document.elementFromPoint(pointerX, pointerY);
  const surface = surfaceAt(target);

  if (surface !== currentHot) {
    clearSurface(currentHot);
    currentHot = surface;
  }

  if (surface) {
    const box = surface.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      const x = ((pointerX - box.left) / box.width) * 100;
      const y = ((pointerY - box.top) / box.height) * 100;
      surface.style.setProperty("--lg-mx", `${x.toFixed(2)}%`);
      surface.style.setProperty("--lg-my", `${y.toFixed(2)}%`);
      surface.style.setProperty("--lg-hot", "1");
    }
  }

  // Ambient position, used by the environment layer and by any surface that
  // is not itself under the pointer but should still shift its highlight
  // slightly as the pointer crosses the screen.
  const root = document.documentElement;
  root.style.setProperty(
    "--lg-px",
    `${((pointerX / window.innerWidth) * 100).toFixed(1)}%`
  );
  root.style.setProperty(
    "--lg-py",
    `${((pointerY / window.innerHeight) * 100).toFixed(1)}%`
  );

  updateMagnet(target);
}

/**
 * Magnetic attraction.
 *
 * A control only attracts once the pointer is genuinely near it, and the pull
 * is capped well below the control's own size, so the effect reads as the
 * button leaning toward the pointer rather than chasing it. Anything larger
 * makes controls hard to hit, which is the opposite of the point.
 */
function updateMagnet(target) {
  let magnet = null;
  if (target instanceof Element) {
    magnet = target.closest(MAGNET_SELECTOR);
  }

  if (!magnet && currentMagnet) {
    // Still within reach of the control just left? Keep pulling, so the
    // release is gradual instead of a snap back at the boundary.
    const box = currentMagnet.getBoundingClientRect();
    const near =
      pointerX > box.left - MAGNET_RANGE &&
      pointerX < box.right + MAGNET_RANGE &&
      pointerY > box.top - MAGNET_RANGE &&
      pointerY < box.bottom + MAGNET_RANGE;
    if (near) magnet = currentMagnet;
  }

  if (magnet !== currentMagnet) {
    clearMagnet(currentMagnet);
    currentMagnet = magnet;
  }
  if (!magnet) return;

  const box = magnet.getBoundingClientRect();
  const dx = pointerX - (box.left + box.width / 2);
  const dy = pointerY - (box.top + box.height / 2);
  const clamp = (value) => Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, value * MAGNET_PULL));
  magnet.style.setProperty("--lg-magx", `${clamp(dx).toFixed(2)}px`);
  magnet.style.setProperty("--lg-magy", `${clamp(dy).toFixed(2)}px`);
}

function onMove(event) {
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (!queued) {
    queued = true;
    requestAnimationFrame(frame);
  }
}

function onLeave() {
  clearSurface(currentHot);
  clearMagnet(currentMagnet);
  currentHot = null;
  currentMagnet = null;
}

/**
 * Start tracking.
 *
 * Skipped entirely for coarse pointers, where there is no hover to respond
 * to, and under reduced motion, where the stylesheet pins the highlights to
 * a fixed angle instead.
 */
export function startPointerOptics() {
  if (enabled) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  enabled = true;
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave, { passive: true });
  window.addEventListener("blur", onLeave, { passive: true });
  // A scroll moves surfaces under a stationary pointer, so the highlight has
  // to be recomputed even though the pointer itself has not moved.
  document.addEventListener(
    "scroll",
    () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(frame);
      }
    },
    { passive: true, capture: true }
  );
}
