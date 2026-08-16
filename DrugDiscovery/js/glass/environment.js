/**
 * The ambient field behind the workspace.
 *
 * Glass with nothing behind it is a grey rectangle: refraction, specular
 * response and adaptive frosting are all only visible because something is
 * moving back there. This draws that something.
 *
 * It is decoration and it says so — slow, low-contrast, no discrete marks, no
 * axes, nothing that could be read as a measurement. Whenever a real
 * visualization is on screen it is the visualization the glass refracts; the
 * field is only what fills the space around it.
 *
 * Cost is the whole design constraint. The canvas renders at a fraction of
 * device resolution and is upscaled, the frame rate is capped well below
 * display refresh, and the loop stops outright when the tab is hidden or when
 * a scientific view asks for the GPU.
 */

import { capability } from "./tiers.js";

/**
 * Whether to draw the generated blob field.
 *
 * Off: the environment is an image (see `.lg-env` in glass.css). Set true to
 * fall back to the procedural field — the two are not meant to run together.
 */
const USE_GENERATED_FIELD = false;

/** Backing-store scale. The field has no detail finer than this. */
const RESOLUTION = 0.28;
/** Frames per second. Movement only has to be perceptible, not smooth. */
const FPS = 24;

let canvas = null;
let context = null;
let host = null;
let blobs = [];
let raf = 0;
let lastFrame = 0;
let paused = false;
let suspendCount = 0;
let width = 0;
let height = 0;

/** Read the environment palette from CSS so the field follows the theme. */
function palette() {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--lg-env-accent").trim() || "53, 198, 216";
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return { accent, light };
}

function seed() {
  const { accent, light } = palette();
  const alpha = light ? 0.11 : 0.3;

  blobs = [
    { hue: accent, r: 0.55, a: alpha * 0.9, x: 0.18, y: 0.2, sx: 0.000031, sy: 0.000019 },
    { hue: "120, 150, 255", r: 0.48, a: alpha * 0.75, x: 0.82, y: 0.28, sx: -0.000024, sy: 0.000027 },
    { hue: "170, 120, 255", r: 0.42, a: alpha * 0.55, x: 0.6, y: 0.85, sx: 0.000018, sy: -0.000022 },
    { hue: accent, r: 0.36, a: alpha * 0.5, x: 0.05, y: 0.78, sx: 0.000027, sy: -0.000015 },
  ];
}

function resize() {
  if (!canvas) return;
  width = Math.max(1, Math.round(window.innerWidth * RESOLUTION));
  height = Math.max(1, Math.round(window.innerHeight * RESOLUTION));
  canvas.width = width;
  canvas.height = height;
}

function draw(time) {
  raf = 0;
  if (paused || suspendCount > 0) return;

  if (time - lastFrame >= 1000 / FPS) {
    lastFrame = time;

    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";

    for (const blob of blobs) {
      // Drift, and turn around at the edges rather than wrapping: a blob
      // that jumps across the screen is a visible glitch behind a pane.
      blob.x += blob.sx * (time - (blob.t || time));
      blob.y += blob.sy * (time - (blob.t || time));
      blob.t = time;
      if (blob.x < -0.2 || blob.x > 1.2) blob.sx *= -1;
      if (blob.y < -0.2 || blob.y > 1.2) blob.sy *= -1;

      const cx = blob.x * width;
      const cy = blob.y * height;
      const radius = blob.r * Math.max(width, height);
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(${blob.hue}, ${blob.a})`);
      gradient.addColorStop(0.55, `rgba(${blob.hue}, ${blob.a * 0.3})`);
      gradient.addColorStop(1, `rgba(${blob.hue}, 0)`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.globalCompositeOperation = "source-over";
  }

  raf = requestAnimationFrame(draw);
}

function start() {
  if (!raf && !paused && suspendCount === 0) raf = requestAnimationFrame(draw);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/**
 * Suspend the field while something expensive is on screen.
 *
 * Reference counted, because two viewers can be mounted at once and the
 * second one finishing must not restart the field under the first.
 */
export function suspendEnvironment() {
  suspendCount += 1;
  stop();
}

export function resumeEnvironment() {
  suspendCount = Math.max(0, suspendCount - 1);
  if (suspendCount === 0) start();
}

/** Rebuild the palette after a theme change. */
export function refreshEnvironment() {
  if (!canvas) return;
  seed();
}

/**
 * Install the field.
 *
 * The static gradient layer is installed regardless — it costs nothing and it
 * is what gives the glass its colour. Only the moving canvas is conditional.
 */
export function startEnvironment() {
  if (host) return;

  host = document.createElement("div");
  host.className = "lg-env";
  host.setAttribute("aria-hidden", "true");
  document.body.prepend(host);

  // The field is now a real image — a molecular scene with bright particles,
  // hexagonal structure and dot lattices, which is far better material for a
  // bezel to refract than anything this module was drawing. The generated
  // blob layer is therefore off: painting soft gradients on top of it would
  // only wash out the detail the glass is meant to bend.
  //
  // The module and its suspend/resume API stay, because the viewers call them
  // and because the layer is worth having back if the image is ever removed.
  if (!capability.ambient || !USE_GENERATED_FIELD) return;

  canvas = document.createElement("canvas");
  context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    canvas = null;
    return;
  }
  host.appendChild(canvas);

  seed();
  resize();

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    paused = document.hidden;
    if (paused) stop();
    else start();
  });

  start();
}
