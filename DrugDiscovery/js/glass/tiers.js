/**
 * Capability detection for the Liquid Glass material.
 *
 * The optical effects degrade in three steps, and which step a browser gets
 * is decided once, here, from what it actually supports rather than from what
 * it is called. The tier is written to <html> as a class so the whole
 * stylesheet can branch on it without a single JS-driven style write.
 *
 *   lg-t1  SVG filters work inside backdrop-filter. Full displacement
 *          refraction and chromatic aberration. Chromium today.
 *   lg-t2  backdrop-filter works but url() filters do not. Real optical
 *          glass — layered gradients, bezel shadows, specular rim, blur,
 *          saturation — with no displacement. Safari and Firefox today.
 *   lg-t3  No backdrop-filter, or the user has asked for reduced
 *          transparency. Opaque instrument surfaces with the same geometry.
 *
 * Every tier is a complete, usable interface. Nothing is hidden at t2 or t3
 * that is visible at t1; only the optics change.
 */

const SUPPORTS = typeof CSS !== "undefined" && typeof CSS.supports === "function";

const supports = (prop, value) => {
  if (!SUPPORTS) return false;
  return CSS.supports(prop, value) || CSS.supports(`-webkit-${prop}`, value);
};

/** Does this engine honour an SVG filter reference inside backdrop-filter? */
function supportsFilterBackdrop() {
  // Declaration support is necessary but not sufficient: Firefox parses
  // url() in backdrop-filter and then renders nothing. Gecko is excluded
  // explicitly because there is no feature query that separates the two, and
  // shipping an invisible panel is worse than shipping a tier-2 one.
  if (!supports("backdrop-filter", "url(#x) blur(2px)")) return false;
  const ua = navigator.userAgent;
  if (/\bGecko\/\b/.test(ua) && !/like Gecko/.test(ua)) return false;
  if (/Firefox\//.test(ua)) return false;
  return true;
}

function supportsBlurBackdrop() {
  return supports("backdrop-filter", "blur(4px)");
}

function prefers(query) {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/**
 * Rough device-capability signal, used to decide whether the expensive
 * chromatic filter and the ambient canvas are worth running at all.
 * Deliberately conservative: a wrong "fast" guess costs frame rate on a
 * scientific visualization, a wrong "slow" guess costs a little sparkle.
 */
function looksCapable() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const coarse = prefers("(pointer: coarse)");
  return cores >= 6 && memory >= 4 && !coarse;
}

export const capability = {
  tier: 3,
  chromatic: false,
  cursor: false,
  ambient: false,
  reducedMotion: false,
};

/** Detect, publish on <html>, and return the capability record. */
export function detectTier() {
  const root = document.documentElement;

  const reducedMotion = prefers("(prefers-reduced-motion: reduce)");
  const reducedTransparency = prefers("(prefers-reduced-transparency: reduce)");
  const forcedColors = prefers("(forced-colors: active)");
  const coarse = prefers("(pointer: coarse)") || prefers("(hover: none)");

  let tier = 3;
  if (!reducedTransparency && !forcedColors) {
    if (supportsFilterBackdrop()) tier = 1;
    else if (supportsBlurBackdrop()) tier = 2;
  }

  // An explicit override, for profiling and for anyone who simply wants the
  // quiet version. Read once at boot; nothing else writes it.
  const forced = localStorage.getItem("neuroatlas.glassTier");
  if (forced === "1" || forced === "2" || forced === "3") tier = Number(forced);

  const capable = looksCapable();

  capability.tier = tier;
  capability.reducedMotion = reducedMotion;
  capability.chromatic = tier === 1 && capable && !reducedMotion;
  capability.cursor = tier <= 2 && !coarse && !reducedMotion && !forcedColors;
  capability.ambient = !reducedMotion && !forcedColors && tier <= 2;

  root.classList.remove("lg-t1", "lg-t2", "lg-t3");
  root.classList.add(`lg-t${tier}`);
  root.classList.toggle("lg-coarse", coarse);

  return capability;
}
