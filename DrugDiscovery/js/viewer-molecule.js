/**
 * Molecular and macromolecular 3D viewer (3Dmol.js).
 *
 * Handles two distinct cases that must never look alike:
 *   - small-molecule conformers (computed geometry, from our own API);
 *   - experimental PDB structures (streamed from RCSB).
 *
 * Styling reflects that difference, and the caller is expected to render a
 * provenance banner above the viewer.
 */

import { esc } from "./ui.js";

const ELEMENT_COLORS = {
  C: 0x909090, N: 0x3050f8, O: 0xff0d0d, S: 0xffff30, P: 0xff8000,
  F: 0x90e050, Cl: 0x1ff01f, Br: 0xa62929, I: 0x940094, H: 0xe8e8e8,
};

/** Small-molecule viewer over an SDF payload. */
export class MoleculeViewer {
  constructor(container, { computed = true } = {}) {
    this.container = container;
    this.computed = computed;
    this.viewer = null;
    this.style = "stick";
    this.showLabels = false;
    this.measuring = false;
    this.selected = [];
    this.model = null;
  }

  init() {
    if (!window.$3Dmol) {
      this.container.innerHTML =
        '<div class="viewer-loading">3D library unavailable.</div>';
      return false;
    }
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    // Mostly transparent rather than a flat fill, so the workspace behind the
    // viewer shows through its glass frame the way the atlas viewers already
    // do. Some opacity is kept: at zero, thin cartoon ribbons lose contrast
    // against a light region of the environment.
    this.viewer = window.$3Dmol.createViewer(this.container, {
      backgroundColor: isLight ? "#ffffff" : "#080f18",
      backgroundAlpha: isLight ? 0.72 : 0.55,
    });
    return true;
  }

  async loadSdf(url) {
    if (!this.viewer && !this.init()) return;
    this.container.querySelector(".viewer-loading")?.remove();

    const response = await fetch(url);
    if (!response.ok) throw new Error("No 3D coordinates available");
    const sdf = await response.text();

    this.viewer.clear();
    this.model = this.viewer.addModel(sdf, "sdf");
    this.applyStyle();
    this.viewer.zoomTo();
    this.viewer.render();
    this.attachPicking();
  }

  applyStyle() {
    if (!this.viewer) return;
    this.viewer.setStyle({}, {});

    const styles = {
      stick: { stick: { radius: 0.14, colorscheme: "Jmol" } },
      ball: {
        stick: { radius: 0.09, colorscheme: "Jmol" },
        sphere: { scale: 0.26, colorscheme: "Jmol" },
      },
      sphere: { sphere: { scale: 0.95, colorscheme: "Jmol" } },
      line: { line: { linewidth: 2.5, colorscheme: "Jmol" } },
    };
    this.viewer.setStyle({}, styles[this.style] || styles.stick);

    if (this.style === "surface") {
      this.viewer.setStyle({}, styles.stick);
      this.viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
        opacity: 0.72,
        color: "#35c6d8",
      });
    } else {
      this.viewer.removeAllSurfaces();
    }

    this.viewer.removeAllLabels();
    if (this.showLabels) {
      this.model?.selectedAtoms({}).forEach((atom) => {
        this.viewer.addLabel(`${atom.elem}${atom.serial}`, {
          position: { x: atom.x, y: atom.y, z: atom.z },
          fontSize: 10,
          fontColor: "white",
          backgroundColor: "black",
          backgroundOpacity: 0.55,
          inFront: true,
        });
      });
    }
    this.viewer.render();
  }

  /** Click-to-select atoms, with distance readout between two picks. */
  attachPicking() {
    if (!this.viewer) return;
    this.viewer.setClickable({}, true, (atom) => {
      if (!atom) return;
      if (!this.measuring) {
        this.onAtomPick?.(atom);
        return;
      }
      this.selected.push(atom);
      this.viewer.addSphere({
        center: { x: atom.x, y: atom.y, z: atom.z },
        radius: 0.28,
        color: "#35c6d8",
      });
      if (this.selected.length === 2) {
        const [a, b] = this.selected;
        const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        this.viewer.addLine({
          start: { x: a.x, y: a.y, z: a.z },
          end: { x: b.x, y: b.y, z: b.z },
          color: "#35c6d8",
          dashed: true,
        });
        this.viewer.addLabel(`${distance.toFixed(2)} Å`, {
          position: {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            z: (a.z + b.z) / 2,
          },
          fontSize: 12,
          backgroundColor: "#35c6d8",
          fontColor: "#04161a",
        });
        this.onMeasure?.(distance, a, b);
        this.selected = [];
      }
      this.viewer.render();
    });
  }

  /** Highlight a matched functional group by atom index. */
  highlightAtoms(indices, color = "#ffd166") {
    if (!this.viewer || !indices?.length) return;
    // SDF atom serials are 1-based; RDKit atom indices are 0-based.
    const serials = indices.map((i) => i + 1);
    this.viewer.setStyle(
      { serial: serials },
      { stick: { radius: 0.26, color }, sphere: { scale: 0.36, color } }
    );
    this.viewer.render();
  }

  clearHighlights() {
    this.applyStyle();
  }

  setStyleMode(mode) {
    this.style = mode;
    this.applyStyle();
  }

  toggleLabels() {
    this.showLabels = !this.showLabels;
    this.applyStyle();
    return this.showLabels;
  }

  toggleMeasure() {
    this.measuring = !this.measuring;
    this.selected = [];
    if (!this.measuring) this.applyStyle();
    return this.measuring;
  }

  reset() {
    this.selected = [];
    this.applyStyle();
    this.viewer?.zoomTo();
    this.viewer?.render();
  }

  resize() {
    this.viewer?.resize();
    this.viewer?.render();
  }
}

/** Experimental macromolecular structure viewer, streamed from RCSB. */
export class StructureViewer {
  constructor(container) {
    this.container = container;
    this.viewer = null;
    this.style = "cartoon";
    this.showLigand = true;
    this.showSurface = false;
    this.ligandIds = [];
  }

  init() {
    if (!window.$3Dmol) {
      this.container.innerHTML =
        '<div class="viewer-loading">3D library unavailable.</div>';
      return false;
    }
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";
    // Mostly transparent rather than a flat fill, so the workspace behind the
    // viewer shows through its glass frame the way the atlas viewers already
    // do. Some opacity is kept: at zero, thin cartoon ribbons lose contrast
    // against a light region of the environment.
    this.viewer = window.$3Dmol.createViewer(this.container, {
      backgroundColor: isLight ? "#ffffff" : "#080f18",
      backgroundAlpha: isLight ? 0.72 : 0.55,
    });
    return true;
  }

  async load(pdbId, ligandIds = []) {
    if (!this.viewer && !this.init()) return;
    this.ligandIds = (ligandIds || [])
      .map((l) => (typeof l === "string" ? l : l.id))
      .filter(Boolean);

    // Plain PDB format keeps this dependency-light; mmCIF/BinaryCIF would need
    // a heavier parser than the viewer ships with.
    const response = await fetch(
      `https://files.rcsb.org/download/${pdbId.toUpperCase()}.pdb`
    );
    if (!response.ok) throw new Error(`Could not load structure ${pdbId}`);
    const text = await response.text();

    this.container.querySelector(".viewer-loading")?.remove();
    this.viewer.clear();
    this.viewer.addModel(text, "pdb");
    this.applyStyle();
    this.viewer.zoomTo();
    this.viewer.render();
  }

  applyStyle() {
    if (!this.viewer) return;
    this.viewer.setStyle({}, {});
    this.viewer.removeAllSurfaces();

    const base = {
      cartoon: { cartoon: { colorscheme: "spectrum" } },
      chain: { cartoon: { colorscheme: "chain" } },
      ss: { cartoon: { color: "spectrum", style: "oval" } },
      stick: { stick: { radius: 0.12, colorscheme: "Jmol" } },
      sphere: { sphere: { scale: 0.7, colorscheme: "Jmol" } },
      line: { line: { colorscheme: "Jmol" } },
    };
    this.viewer.setStyle({ hetflag: false }, base[this.style] || base.cartoon);

    if (this.showLigand) {
      // Bound ligands drawn distinctly so the binding site reads at a glance.
      this.viewer.setStyle(
        { hetflag: true, not: { resn: ["HOH", "WAT"] } },
        { stick: { radius: 0.22, colorscheme: "greenCarbon" } }
      );
      if (this.ligandIds.length) {
        this.viewer.addStyle(
          { resn: this.ligandIds },
          { sphere: { scale: 0.32, colorscheme: "greenCarbon" } }
        );
      }
    }

    if (this.showSurface) {
      this.viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
        opacity: 0.62,
        color: "#5a7fa0",
      }, { hetflag: false });
    }

    this.viewer.render();
  }

  /** Zoom to a ligand and show the residues contacting it. */
  focusBindingSite() {
    if (!this.viewer || !this.ligandIds.length) return false;
    const selection = { resn: this.ligandIds };
    this.viewer.zoomTo(selection);
    this.viewer.addStyle(
      { within: { distance: 5, sel: selection }, hetflag: false },
      { stick: { radius: 0.15, colorscheme: "Jmol" } }
    );
    this.viewer.render();
    return true;
  }

  /* -------------------------------------------------------------------
     Structure Intelligence extensions.

     The viewer already drew a protein. What it could not do was let another
     panel point at part of one — and every coordinated-panel requirement in
     the Structure Intelligence workspace is that: click a pocket, highlight
     the pocket; click a strand, highlight the strand.

     These are additions to the existing class rather than a second viewer.
     3Dmol.js already supports selection by chain, residue and secondary
     structure, and per-atom surface colouring; none of it was reachable
     from outside. The style modes, the ligand toggle and the surface toggle
     behave exactly as they did.
     ------------------------------------------------------------------- */

  /** Load coordinates already in hand, rather than fetching by identifier.
   *
   *  The workspace fetches through the backend so a structure and the
   *  analyses computed on it are provably the same bytes. */
  loadText(pdbText, ligandIds = []) {
    if (!this.viewer && !this.init()) return false;
    this.ligandIds = (ligandIds || [])
      .map((l) => (typeof l === "string" ? l : l.id))
      .filter(Boolean);
    this.container.querySelector(".viewer-loading")?.remove();
    this.viewer.clear();
    this.viewer.addModel(pdbText, "pdb");
    this.overlays = [];
    this.applyStyle();
    this.viewer.zoomTo();
    this.viewer.render();
    return true;
  }

  /** Clear every highlight and shape this module added, leaving the base
   *  style untouched. */
  clearHighlights() {
    if (!this.viewer) return;
    (this.overlays || []).forEach((shape) => {
      try { this.viewer.removeShape(shape); } catch { /* already gone */ }
    });
    this.overlays = [];
    this.viewer.removeAllLabels();
    this.applyStyle();
  }

  /** Highlight residues and, optionally, frame them.
   *
   *  `spec` is {chain, residues:[numbers]} or a list of those — the shape the
   *  backend's selections already use, so a panel passes a stored selection
   *  through unchanged. */
  highlightResidues(spec, { color = "#e03154", zoom = true, label = null } = {}) {
    if (!this.viewer) return false;
    const groups = Array.isArray(spec) ? spec : [spec];
    const selections = groups
      .map((g) => {
        const selection = {};
        if (g.chain) selection.chain = g.chain;
        if (g.residues?.length) selection.resi = g.residues;
        return Object.keys(selection).length ? selection : null;
      })
      .filter(Boolean);
    if (!selections.length) return false;

    selections.forEach((selection) => {
      this.viewer.addStyle(selection, {
        stick: { radius: 0.22, color },
        cartoon: { color },
      });
    });

    if (label) {
      const first = selections[0];
      this.viewer.addLabel(label, {
        backgroundColor: color, backgroundOpacity: 0.75,
        fontColor: "#ffffff", fontSize: 11,
      }, first);
    }
    if (zoom) this.viewer.zoomTo(selections.length === 1 ? selections[0] : {});
    this.viewer.render();
    return true;
  }

  /** Highlight a secondary-structure element by its residue range. */
  highlightSegment(segment, options = {}) {
    const residues = [];
    for (let i = segment.start; i <= segment.end; i += 1) residues.push(i);
    return this.highlightResidues(
      { chain: segment.chain, residues },
      { color: options.color || "#3ee08f", label: options.label ?? null,
        zoom: options.zoom !== false }
    );
  }

  /** Show a pocket: a translucent sphere on its centre, its residues drawn,
   *  and the camera framed on it. */
  showPocket(pocket, { color = "#e03154", zoom = true } = {}) {
    if (!this.viewer || !pocket?.center) return false;
    const { x, y, z } = pocket.center;
    // A radius from the residue count, so a large pocket reads as large.
    // It is an indication of extent, not a measured boundary.
    const radius = Math.min(4 + Math.cbrt(pocket.residue_count || 8) * 2.2, 14);
    const sphere = this.viewer.addSphere({
      center: { x, y, z }, radius,
      color, alpha: 0.22, wireframe: false,
    });
    this.overlays = [...(this.overlays || []), sphere];

    const byChain = {};
    (pocket.residues || []).forEach((r) => {
      (byChain[r.chain] ||= []).push(r.number);
    });
    Object.entries(byChain).forEach(([chain, residues]) => {
      this.viewer.addStyle({ chain, resi: residues }, {
        stick: { radius: 0.2, color },
      });
    });

    if (zoom) this.viewer.zoomTo({ sphere: { center: { x, y, z }, radius } });
    this.viewer.render();
    return true;
  }

  /** Colour the whole structure by a per-residue property.
   *
   *  `values` is a map "CHAIN:NUMBER" -> number in 0..1, and `ramp` turns one
   *  into a colour. Used for hydrophobicity, accessibility and ligandability,
   *  which are three views of the same structure rather than three viewers. */
  colorByResidue(values, ramp) {
    if (!this.viewer) return false;
    this.viewer.setStyle({}, {});
    this.viewer.removeAllSurfaces();
    this.viewer.setStyle({ hetflag: false }, {
      cartoon: {
        colorfunc: (atom) => {
          const key = `${atom.chain}:${atom.resi}`;
          const value = values[key];
          return value === undefined ? "#6b7f8c" : ramp(value);
        },
      },
    });
    if (this.showLigand) {
      this.viewer.setStyle({ hetflag: true, not: { resn: ["HOH", "WAT"] } },
        { stick: { radius: 0.22, colorscheme: "greenCarbon" } });
    }
    this.viewer.render();
    return true;
  }

  /** A molecular surface coloured by a per-residue property. */
  surfaceByResidue(values, ramp, { opacity = 0.85 } = {}) {
    if (!this.viewer) return false;
    this.viewer.removeAllSurfaces();
    this.viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
      opacity,
      colorfunc: (atom) => {
        const value = values[`${atom.chain}:${atom.resi}`];
        return value === undefined ? "#6b7f8c" : ramp(value);
      },
    }, { hetflag: false });
    this.viewer.render();
    return true;
  }

  /** Add a docked pose to the protein already loaded.
   *
   *  The pose appears in this viewer rather than a separate one, which is
   *  the whole point: a ligand is only interpretable inside its site. */
  addPose(text, format = "pdb", { color = "#f5a524", zoom = true } = {}) {
    if (!this.viewer) return false;
    const model = this.viewer.addModel(text, format);
    model.setStyle({}, { stick: { radius: 0.25, color } });
    this.poseModels = [...(this.poseModels || []), model];
    if (zoom) this.viewer.zoomTo({ model });
    this.viewer.render();
    return true;
  }

  /** Remove every docked pose, leaving the protein as it was. */
  clearPoses() {
    if (!this.viewer) return;
    (this.poseModels || []).forEach((model) => {
      try { this.viewer.removeModel(model); } catch { /* already gone */ }
    });
    this.poseModels = [];
    this.viewer.render();
  }

  /** Report what the viewer is showing, for a panel that needs to stay in
   *  step with it. */
  state() {
    return {
      style: this.style,
      ligand: this.showLigand,
      surface: this.showSurface,
      overlays: (this.overlays || []).length,
      poses: (this.poseModels || []).length,
    };
  }

  setStyleMode(mode) {
    this.style = mode;
    this.applyStyle();
  }
  toggleLigand() {
    this.showLigand = !this.showLigand;
    this.applyStyle();
    return this.showLigand;
  }
  toggleSurface() {
    this.showSurface = !this.showSurface;
    this.applyStyle();
    return this.showSurface;
  }
  reset() {
    this.clearHighlights();
    this.clearPoses();
    this.applyStyle();
    this.viewer?.zoomTo();
    this.viewer?.render();
  }
  resize() {
    this.viewer?.resize();
    this.viewer?.render();
  }
}

export const viewerToolbar = (buttons) =>
  `<div class="viewer-toolbar">${buttons
    .map(
      (b) =>
        `<button class="sm" data-action="${esc(b.action)}"${
          b.value ? ` data-value="${esc(b.value)}"` : ""
        }>${esc(b.label)}</button>`
    )
    .join("")}</div>`;

export { ELEMENT_COLORS };
