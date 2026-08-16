/**
 * Background-dependent glass.
 *
 * A pane floating over empty space and the same pane floating over a lit
 * cerebellum should not look identical, and more importantly should not read
 * identically: at some point the content behind the glass wins and the label
 * on top of it stops being legible. This raises the frosting on panes that
 * are currently over busy content, and drops it again when they are not.
 *
 * The measurement is geometric rather than photometric, on purpose. Sampling
 * pixels means either reading back a WebGL framebuffer — which requires
 * preserveDrawingBuffer and costs a stall on every read — or compositing the
 * page to a canvas, which is not something a browser will do. Overlap with a
 * live visualization is the signal that is both free and almost always right:
 * the busy regions of this application are exactly its canvases.
 *
 * Anything that turns out to need real luminance can opt in per element by
 * declaring `data-lg-adaptive="luminance"`, which samples a 2D canvas
 * directly; WebGL surfaces are left alone.
 */

/** Elements whose area counts as "busy".
 *
 * The ambient field is a full-screen canvas and is explicitly not one of
 * them: it is deliberately low-contrast, it is always behind everything, and
 * counting it would frost every pane in the application permanently — which
 * is exactly the flat, uniformly-blurred look this system exists to avoid. */
const BUSY = ".viewer, canvas:not(.lg-env canvas), #graph-canvas, .lg-workspace-canvas";

let observer = null;
let queued = false;

function overlaps(a, b) {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}

function measure() {
  queued = false;

  const panes = document.querySelectorAll("[data-lg-adaptive]");
  if (!panes.length) return;

  const busyBoxes = [...document.querySelectorAll(BUSY)]
    .map((node) => node.getBoundingClientRect())
    .filter((box) => box.width > 40 && box.height > 40);

  panes.forEach((pane) => {
    const box = pane.getBoundingClientRect();
    if (box.width === 0) return;
    const over = busyBoxes.some((busy) => overlaps(box, busy));
    pane.classList.toggle("lg-dense", over);
  });
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(measure);
}

export function refreshAdaptive() {
  schedule();
}

export function startAdaptive() {
  if (observer) return;

  // Re-measure when panes or visualizations appear, move or resize. All three
  // are rare events, so this costs nothing between them.
  observer = new ResizeObserver(schedule);
  observer.observe(document.documentElement);

  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("scroll", schedule, { passive: true, capture: true });

  schedule();
}
