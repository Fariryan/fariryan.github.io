/**
 * The 3D chemical-space view.
 *
 * Every point is a molecule, and its position is its structure: coordinates
 * come from a PCA over Morgan fingerprints fitted once per campaign, computed
 * on the server and stored on the candidate row. Nothing here invents a
 * position, and nothing here animates a molecule along a path it did not take
 * — a generation change moves the camera and the visible set, never the points.
 *
 * The projection's explained variance is shown on the panel because it is the
 * honest caveat: at ~65% of variance in three components, two points that look
 * adjacent may be further apart in the real space than they appear.
 *
 * Instanced rendering: one geometry, one draw call, up to tens of thousands of
 * molecules. A campaign with 20 candidates does not need it; a campaign with
 * 20,000 does, and the view should not need rewriting between the two.
 */

import * as THREE from "../../vendor/three.module.js";
import { OrbitControls } from "../../vendor/OrbitControls.js";

/**
 * How each kind of point is drawn.
 *
 * Colour is never the only channel — size and opacity carry the same
 * distinction — because a reader with colour-vision deficiency must be able to
 * tell a Pareto candidate from a rejected one.
 */
const STYLES = {
  seed:       { color: 0x22c55e, size: 1.7, opacity: 1.0,  label: "Seed (known ligand)" },
  pareto:     { color: 0xf59e0b, size: 2.1, opacity: 1.0,  label: "Pareto front" },
  selected:   { color: 0x3b82f6, size: 1.6, opacity: 0.95, label: "Selected for evaluation" },
  docked:     { color: 0x8b5cf6, size: 1.8, opacity: 1.0,  label: "Structurally evaluated" },
  candidate:  { color: 0x94a3b8, size: 1.1, opacity: 0.75, label: "Candidate" },
  rejected:   { color: 0xef4444, size: 0.8, opacity: 0.30, label: "Rejected (kept)" },
};

function styleFor(point) {
  if (point.status === "rejected") return "rejected";
  if (point.generation === 0) return "seed";
  if (point.status === "docked" || point.status === "preclinical") return "docked";
  if (point.pareto_rank === 1) return "pareto";
  if (point.status === "selected") return "selected";
  return "candidate";
}

export class ChemicalSpace {
  constructor(container) {
    this.container = container;
    this.points = [];
    this.meshes = new Map();
    this.generationFilter = null;
    this.onSelect = null;
    this._raf = null;
  }

  init() {
    const width = this.container.clientWidth || 640;
    const height = this.container.clientHeight || 460;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(2.6, 2.0, 2.6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(3, 4, 2);
    this.scene.add(key);

    // Axes are unlabelled on purpose: principal components have no units and
    // no chemical meaning individually. They orient the viewer, nothing more.
    const axes = new THREE.AxesHelper(1.25);
    axes.material.opacity = 0.18;
    axes.material.transparent = true;
    this.scene.add(axes);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderer.domElement.addEventListener("click", (event) => this._pick(event));

    this._resize = () => this._onResize();
    window.addEventListener("resize", this._resize);
    this._loop();
    return true;
  }

  /** Draw a campaign's molecules. Positions come from the server. */
  setPoints(points) {
    this.points = points.filter((point) => Array.isArray(point.position));
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes.clear();

    const grouped = new Map();
    for (const point of this.points) {
      const style = styleFor(point);
      if (!grouped.has(style)) grouped.set(style, []);
      grouped.get(style).push(point);
    }

    for (const [styleKey, members] of grouped) {
      const style = STYLES[styleKey];
      const geometry = new THREE.SphereGeometry(0.028 * style.size, 12, 10);
      const material = new THREE.MeshStandardMaterial({
        color: style.color,
        transparent: style.opacity < 1,
        opacity: style.opacity,
        roughness: 0.45,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, members.length);
      mesh.userData = { style: styleKey, members };

      const matrix = new THREE.Matrix4();
      members.forEach((point, index) => {
        matrix.setPosition(point.position[0], point.position[1], point.position[2] ?? 0);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this.meshes.set(styleKey, mesh);
    }

    this._applyFilter();
  }

  /**
   * Show only up to a generation.
   *
   * The molecules do not move — they appear. Positions are fixed by the
   * embedding, so "watching the search concentrate" is watching real
   * accumulation in a fixed space rather than an animation.
   */
  setGeneration(generation) {
    this.generationFilter = generation;
    this._applyFilter();
  }

  _applyFilter() {
    const limit = this.generationFilter;
    const matrix = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);

    for (const mesh of this.meshes.values()) {
      mesh.userData.members.forEach((point, index) => {
        const visible = limit === null || point.generation <= limit;
        if (visible) {
          matrix.setPosition(point.position[0], point.position[1], point.position[2] ?? 0);
          mesh.setMatrixAt(index, matrix);
        } else {
          mesh.setMatrixAt(index, hidden);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects([...this.meshes.values()], false);
    if (!hits.length || !this.onSelect) return;
    const hit = hits[0];
    const point = hit.object.userData.members[hit.instanceId];
    if (point) this.onSelect(point);
  }

  _onResize() {
    if (!this.renderer) return;
    const width = this.container.clientWidth || 640;
    const height = this.container.clientHeight || 460;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._resize);
    this.renderer?.dispose();
    this.container.innerHTML = "";
  }
}

export function legend() {
  return Object.entries(STYLES)
    .map(
      ([key, style]) => `<span class="space-legend-item">
        <span class="space-swatch space-${key}"
              style="background:#${style.color.toString(16).padStart(6, "0")};
                     opacity:${style.opacity};
                     width:${6 + style.size * 2}px;height:${6 + style.size * 2}px"></span>
        ${style.label}
      </span>`
    )
    .join("");
}
