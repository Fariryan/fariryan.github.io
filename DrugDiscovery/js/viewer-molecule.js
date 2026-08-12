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
    this.viewer = window.$3Dmol.createViewer(this.container, {
      backgroundColor: isLight ? "#ffffff" : "#0d141d",
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
    this.viewer = window.$3Dmol.createViewer(this.container, {
      backgroundColor: isLight ? "#ffffff" : "#0d141d",
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
