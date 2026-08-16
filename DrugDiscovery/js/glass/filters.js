/**
 * The refraction filters.
 *
 * This is the part that makes the material glass rather than a blurred
 * rectangle. Each filter carries a displacement map generated from the signed
 * distance field of a rounded rectangle, so the amount and direction of the
 * bend at every point matches the surface a real bezelled pane would have:
 *
 *   · dead flat through the middle — you read straight through the pane
 *   · rising sharply through the bezel, strongest right at the rim
 *   · pointing inward along the surface normal, including around the corners,
 *     which is where refraction is most visible and where a gradient-based
 *     fake gives itself away
 *
 * The maps are bitmaps generated once at boot and reused. There are five of
 * them for the entire application — panel, chromatic panel, pill, round, and
 * the cursor lens — because the cost of an SVG filter is paid per painted
 * element, and a design system that generated one per component would spend
 * the whole frame budget on decoration. Everything else stretches one of
 * these five.
 */

import { capability } from "./tiers.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * Encode a rounded-rectangle lens into a displacement map.
 *
 * feDisplacementMap samples the source at
 *   x + scale * (R/255 - 0.5),  y + scale * (G/255 - 0.5)
 * so a red/green pair of 128 means "no displacement here". Writing an inward
 * offset means the pane pulls the surroundings in under its own rim, which is
 * what a convex edge does to what is behind it.
 *
 * @param {object} options
 * @param {number} options.width    map width in pixels
 * @param {number} options.height   map height in pixels
 * @param {number} options.radius   corner radius, in map pixels
 * @param {number} options.bezel    width of the curved edge band, in map pixels
 * @param {number} options.strength peak displacement, 0..1 of the encodable range
 * @param {number} [options.magnify] uniform inward pull across the whole face,
 *   which reads as magnification. 0 for panels, small and positive for the
 *   cursor lens.
 * @returns {string} a data: URL for a PNG
 */
function buildDisplacementMap({
  width,
  height,
  radius,
  bezel,
  strength,
  magnify = 0,
}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: false });
  const image = context.createImageData(width, height);
  const data = image.data;

  const halfW = width / 2;
  const halfH = height / 2;
  // Inset the corner radius so the distance field is measured from the true
  // rounded outline rather than from the bounding box.
  const innerW = Math.max(halfW - radius, 0);
  const innerH = Math.max(halfH - radius, 0);

  for (let y = 0; y < height; y += 1) {
    const py = y + 0.5 - halfH;
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5 - halfW;

      // Signed distance to the rounded rectangle, negative inside.
      const qx = Math.abs(px) - innerW;
      const qy = Math.abs(py) - innerH;
      const outerX = Math.max(qx, 0);
      const outerY = Math.max(qy, 0);
      const outer = Math.hypot(outerX, outerY);
      const inner = Math.min(Math.max(qx, qy), 0);
      const signed = outer + inner - radius;

      // Outward unit normal of the outline at this point.
      let nx;
      let ny;
      if (qx > 0 && qy > 0) {
        const length = outer || 1;
        nx = (outerX / length) * Math.sign(px || 1);
        ny = (outerY / length) * Math.sign(py || 1);
      } else if (qx > qy) {
        nx = Math.sign(px || 1);
        ny = 0;
      } else {
        nx = 0;
        ny = Math.sign(py || 1);
      }

      // Depth into the pane, measured inward from the rim.
      const depth = -signed;

      // -- the bezel term: refraction at the edge ---------------------------
      // The surface is a quarter-circle in cross-section, so the slope — and
      // therefore the refraction — is t / sqrt(1 - t²), with t = 1 at the rim
      // and 0 at the inner edge of the bezel. That diverges at the rim exactly
      // as a real edge does, so it is clamped; the clamp is what stops the
      // outermost pixel row smearing into a band. It acts along the surface
      // normal, which is what turns the corners correctly.
      let bezelTerm = 0;
      if (depth >= 0 && depth < bezel) {
        const t = 1 - depth / bezel;
        const slope = t / Math.sqrt(Math.max(1 - t * t, 1e-3));
        bezelTerm = Math.min(slope, 3) / 3;
      }

      // -- the magnification term -------------------------------------------
      // This has to be *proportional to the distance from the centre*, and
      // radial rather than normal. To magnify by M, the sample point must come
      // from r/M, so the inward offset is r·(1 − 1/M): zero in the middle,
      // greatest at the edge. A constant offset — which is what this used to
      // apply — is not magnification at all: it pushes every pixel inward by
      // the same amount, which pinches the image and leaves the centre wrong.
      // Named for what it is rather than `radius`, which is already the
      // corner-radius parameter of this function.
      const centreDistance = Math.hypot(px, py);
      const reach = Math.min(halfW, halfH) || 1;
      const u = Math.min(centreDistance / reach, 1);
      const radialX = centreDistance > 0.0001 ? px / centreDistance : 0;
      const radialY = centreDistance > 0.0001 ? py / centreDistance : 0;

      // Inward is the negative of the outward direction, in both terms.
      let dx = 0;
      let dy = 0;
      if (depth >= 0) {
        dx = -(nx * bezelTerm + radialX * magnify * u) * strength;
        dy = -(ny * bezelTerm + radialY * magnify * u) * strength;
      }

      const index = (y * width + x) * 4;
      data[index] = Math.max(0, Math.min(255, Math.round(128 + dx * 127)));
      data[index + 1] = Math.max(0, Math.min(255, Math.round(128 + dy * 127)));
      data[index + 2] = 128;
      data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

const element = (name, attributes) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
};

/** feImage referencing a generated map, filling the whole filter region. */
function mapImage(href, result) {
  const node = element("feImage", {
    result,
    x: "0%",
    y: "0%",
    width: "100%",
    height: "100%",
    preserveAspectRatio: "none",
    href,
  });
  // Older WebKit only honours the xlink form; setting both is harmless.
  node.setAttributeNS(XLINK_NS, "xlink:href", href);
  return node;
}

/** A filter with a single displacement pass. */
function simpleFilter(id, href, scale) {
  const filter = element("filter", {
    id,
    x: "0%",
    y: "0%",
    width: "100%",
    height: "100%",
    filterUnits: "objectBoundingBox",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  filter.appendChild(mapImage(href, "map"));
  filter.appendChild(
    element("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "map",
      scale,
      xChannelSelector: "R",
      yChannelSelector: "G",
    })
  );
  return filter;
}

/**
 * A filter that splits the channels.
 *
 * Three displacement passes at slightly different scales, each contributing
 * one colour channel, recombined additively. Longer wavelengths bend less, so
 * red gets the smallest scale and blue the largest — the same ordering as the
 * fringe on a real lens. The spread is small on purpose: enough to colour the
 * rim, not enough to fringe text read through the middle of the pane.
 */
function chromaticFilter(id, href, scale, spread) {
  const filter = element("filter", {
    id,
    x: "0%",
    y: "0%",
    width: "100%",
    height: "100%",
    filterUnits: "objectBoundingBox",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  filter.appendChild(mapImage(href, "map"));

  const channels = [
    ["R", scale * (1 - spread), "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
    ["G", scale, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
    ["B", scale * (1 + spread), "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"],
  ];

  channels.forEach(([name, channelScale, matrix]) => {
    filter.appendChild(
      element("feDisplacementMap", {
        in: "SourceGraphic",
        in2: "map",
        scale: channelScale,
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: `d${name}`,
      })
    );
    filter.appendChild(
      element("feColorMatrix", {
        in: `d${name}`,
        type: "matrix",
        values: matrix,
        result: `c${name}`,
      })
    );
  });

  filter.appendChild(
    element("feBlend", { in: "cR", in2: "cG", mode: "screen", result: "rg" })
  );
  filter.appendChild(element("feBlend", { in: "rg", in2: "cB", mode: "screen" }));
  return filter;
}

let installed = false;

/**
 * Generate the maps and install the filter definitions.
 *
 * Only called at tier 1; at tiers 2 and 3 nothing in the stylesheet references
 * these ids, so generating them would be pure cost.
 */
export function installFilters() {
  if (installed || capability.tier !== 1) return;
  installed = true;

  // Maps are generated at modest resolution. They are stretched to the
  // element, and a displacement map is a low-frequency field, so resolution
  // buys nothing beyond this while costing generation time at boot.
  const panelMap = buildDisplacementMap({
    width: 320,
    height: 200,
    radius: 26,
    bezel: 22,
    strength: 0.62,
  });
  const pillMap = buildDisplacementMap({
    width: 200,
    height: 72,
    radius: 36,
    bezel: 16,
    strength: 0.78,
  });
  const roundMap = buildDisplacementMap({
    width: 128,
    height: 128,
    radius: 64,
    bezel: 26,
    strength: 0.8,
  });
  // The cursor is the one surface that is genuinely a lens rather than a pane,
  // so it carries real magnification as well as an edge. `magnify` here is the
  // inward pull at the rim as a fraction of the encodable range; with the
  // filter scale below it works out to roughly 1.3x through the middle, which
  // is enough to be unmistakably a lens without making text under it unreadable.
  const lensMap = buildDisplacementMap({
    width: 256,
    height: 256,
    radius: 128,
    bezel: 52,
    strength: 1,
    magnify: 0.62,
  });

  const svg = element("svg", {
    "aria-hidden": "true",
    focusable: "false",
    width: 0,
    height: 0,
  });
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.pointerEvents = "none";
  svg.style.overflow = "hidden";

  const defs = element("defs", {});
  defs.appendChild(simpleFilter("lg-refract", panelMap, 34));
  defs.appendChild(simpleFilter("lg-refract-pill", pillMap, 22));
  defs.appendChild(simpleFilter("lg-refract-round", roundMap, 20));
  // A much larger scale than the panes use: this one is meant to be looked
  // through, not past.
  defs.appendChild(simpleFilter("lg-cursor-lens", lensMap, 62));

  if (capability.chromatic) {
    defs.appendChild(chromaticFilter("lg-refract-chroma", panelMap, 38, 0.16));
  } else {
    // Keep the id valid so `.lg-chromatic` still refracts; it simply does not
    // pay for the extra two passes on a device that cannot spare them.
    defs.appendChild(simpleFilter("lg-refract-chroma", panelMap, 34));
  }

  svg.appendChild(defs);
  document.body.appendChild(svg);
}

/**
 * The cursor lens filter.
 *
 * Installed separately from the panel filters because it is used differently:
 * it is referenced by `filter`, not `backdrop-filter`.
 *
 * That distinction is the whole reason this exists. `backdrop-filter: url(…)`
 * is Chromium-only — Firefox parses it and paints nothing, Safari ignores it.
 * But an element that carries `backdrop-filter: blur(…)` has that blurred
 * backdrop composited into its own rendering, so a plain `filter: url(…)` on
 * the *same element* distorts the backdrop after the fact. `filter` with an
 * SVG reference is supported everywhere. The lens therefore works at tier 2 as
 * well as tier 1, which the previous implementation did not.
 *
 * Technique from lucasromerodb's macOS liquid-glass pen; the chromatic split
 * and the lens profile are ours.
 */
export function installLensFilter() {
  if (document.getElementById("lg-lens")) return;

  // A circular lens: magnification proportional to radius, a sharp bezel at
  // the rim. Generated at the same resolution as the panel maps.
  const lensMap = buildDisplacementMap({
    width: 256,
    height: 256,
    radius: 128,
    bezel: 52,
    strength: 1,
    magnify: 0.62,
  });

  const svg = element("svg", { "aria-hidden": "true", focusable: "false", width: 0, height: 0 });
  svg.style.cssText = "position:absolute;width:0;height:0;pointer-events:none;overflow:hidden";
  const defs = element("defs", {});

  // Longer wavelengths bend less, so red takes the smallest scale and blue the
  // largest — the ordering of a real lens's fringe. Recombined additively with
  // arithmetic composites rather than screen blends, which keeps the midtones
  // from lifting.
  const filter = element("filter", {
    id: "lg-lens",
    x: "0%",
    y: "0%",
    width: "100%",
    height: "100%",
    filterUnits: "objectBoundingBox",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  filter.appendChild(mapImage(lensMap, "map"));

  // feDisplacementMap `scale` is in pixels of displacement, so it has to track
  // the lens diameter: at a 12px lens the previous 58–70 would have displaced
  // further than the lens is wide and turned it into noise. These are the same
  // values scaled by 12/62, which keeps the magnification and the chromatic
  // ratio identical at the smaller size.
  const CHANNELS = [
    ["R", 11, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
    ["G", 12.5, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
    ["B", 14, "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"],
  ];
  CHANNELS.forEach(([name, scale, matrix]) => {
    filter.appendChild(
      element("feDisplacementMap", {
        in: "SourceGraphic",
        in2: "map",
        scale,
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: `d${name}`,
      })
    );
    filter.appendChild(
      element("feColorMatrix", { in: `d${name}`, type: "matrix", values: matrix, result: `c${name}` })
    );
  });
  filter.appendChild(
    element("feComposite", {
      in: "cR",
      in2: "cG",
      operator: "arithmetic",
      k1: 0, k2: 1, k3: 1, k4: 0,
      result: "rg",
    })
  );
  filter.appendChild(
    element("feComposite", {
      in: "rg",
      in2: "cB",
      operator: "arithmetic",
      k1: 0, k2: 1, k3: 1, k4: 0,
    })
  );

  defs.appendChild(filter);
  svg.appendChild(defs);
  document.body.appendChild(svg);
}
