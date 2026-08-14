/**
 * 3D culture plate.
 *
 * Two views of the same simulation: the whole plate, and the inside of one
 * well. Both are driven by the solver output — cell counts and, for spheroids,
 * the computed oxygen field. Nothing on screen moves because it looks good.
 *
 * **Instanced rendering throughout.** A 96-well plate at a few hundred cells
 * per well is tens of thousands of spheres; as individual meshes that is a
 * dropped frame every frame. One InstancedMesh per well population and one for
 * the wells themselves keeps the whole scene at a handful of draw calls.
 *
 * The label is fixed and non-negotiable: this is a **digital-twin
 * visualisation of a mechanistic simulation**, not microscopy. The caller
 * renders that text; this module refuses to draw anything the solver did not
 * produce.
 */

import * as THREE from "../../../vendor/three.module.js";
import { OrbitControls } from "../../../vendor/OrbitControls.js";

/** Standard SBS plate geometries, in well counts and rows × columns. */
export const PLATE_FORMATS = {
  6: { rows: 2, cols: 3, wellRadius: 1.7, spacing: 3.9 },
  12: { rows: 3, cols: 4, wellRadius: 1.1, spacing: 2.6 },
  24: { rows: 4, cols: 6, wellRadius: 0.78, spacing: 1.95 },
  48: { rows: 6, cols: 8, wellRadius: 0.56, spacing: 1.45 },
  96: { rows: 8, cols: 12, wellRadius: 0.38, spacing: 0.99 },
  384: { rows: 16, cols: 24, wellRadius: 0.19, spacing: 0.495 },
};

const ROW_LETTERS = "ABCDEFGHIJKLMNOP";

/** Viability → colour. Green is living, amber stressed, red dead. */
function viabilityColour(viability, target) {
  // Interpolated in HSL so the ramp reads as a gradient rather than three bands.
  const hue = 0.33 * Math.max(0, Math.min(1, viability)); // 0 red → 0.33 green
  return target.setHSL(hue, 0.62, 0.45 + 0.12 * viability);
}

export class PlateViewer {
  /**
   * @param {HTMLElement} container
   * @param {object} options  { format, onWellSelect }
   */
  constructor(container, { format = 96, onWellSelect = null } = {}) {
    this.container = container;
    this.format = PLATE_FORMATS[format] ? format : 96;
    this.onWellSelect = onWellSelect;
    this.wells = [];
    this.selectedWell = null;
    this.mode = "plate"; // "plate" | "well"
    this.frame = 0;
    this.running = false;
    this.disposables = [];
  }

  init() {
    const { clientWidth: width, clientHeight: height } = this.container;
    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(isLight ? 0xf6f8fa : 0x0d141d);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 400);
    this.camera.position.set(0, 11, 11);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.scene.add(new THREE.AmbientLight(0xffffff, isLight ? 0.85 : 0.55));
    const key = new THREE.DirectionalLight(0xffffff, isLight ? 0.7 : 0.9);
    key.position.set(6, 12, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88bbff, 0.25);
    fill.position.set(-8, 5, -6);
    this.scene.add(fill);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderer.domElement.addEventListener("click", (event) =>
      this.handleClick(event)
    );

    this.animate();
    return true;
  }

  /**
   * Build the plate from simulation output.
   *
   * @param {Array} wells  one entry per configured well:
   *   { row, col, label, concentration, isControl, series: [{time_h, count, viability}] }
   */
  buildPlate(wells) {
    this.wells = wells;
    this.clearScene();

    const spec = PLATE_FORMATS[this.format];
    const originX = -((spec.cols - 1) * spec.spacing) / 2;
    const originZ = -((spec.rows - 1) * spec.spacing) / 2;

    // Plate body.
    const bodyWidth = spec.cols * spec.spacing + spec.spacing;
    const bodyDepth = spec.rows * spec.spacing + spec.spacing;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth, 0.42, bodyDepth),
      new THREE.MeshStandardMaterial({
        color: 0x2a3746,
        roughness: 0.72,
        metalness: 0.05,
      })
    );
    body.position.y = -0.24;
    this.scene.add(body);
    this.track(body);

    // Wells as one instanced cylinder.
    const wellGeometry = new THREE.CylinderGeometry(
      spec.wellRadius, spec.wellRadius * 0.92, 0.4, 20, 1, true
    );
    const wellMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f1822,
      roughness: 0.35,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    this.wellMesh = new THREE.InstancedMesh(
      wellGeometry, wellMaterial, wells.length
    );

    // Culture medium: a translucent disc per well, tinted by viability. This is
    // the layer that carries the simulation state at plate scale.
    const mediumGeometry = new THREE.CylinderGeometry(
      spec.wellRadius * 0.94, spec.wellRadius * 0.9, 0.22, 20
    );
    const mediumMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.86,
      roughness: 0.25,
    });
    this.mediumMesh = new THREE.InstancedMesh(
      mediumGeometry, mediumMaterial, wells.length
    );

    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();

    wells.forEach((well, index) => {
      const x = originX + well.col * spec.spacing;
      const z = originZ + well.row * spec.spacing;
      well.position = { x, z };

      matrix.makeTranslation(x, 0, z);
      this.wellMesh.setMatrixAt(index, matrix);

      matrix.makeTranslation(x, -0.06, z);
      this.mediumMesh.setMatrixAt(index, matrix);
      this.mediumMesh.setColorAt(index, viabilityColour(1, colour));
    });

    this.wellMesh.instanceMatrix.needsUpdate = true;
    this.mediumMesh.instanceMatrix.needsUpdate = true;
    if (this.mediumMesh.instanceColor) this.mediumMesh.instanceColor.needsUpdate = true;

    this.scene.add(this.wellMesh);
    this.scene.add(this.mediumMesh);
    this.track(this.wellMesh, this.mediumMesh);

    this.camera.position.set(0, bodyDepth * 1.05, bodyDepth * 0.95);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender();
  }

  /**
   * Move every well to the state at a timepoint.
   *
   * Reads the solver series directly — the colour of a well *is* its simulated
   * viability at that hour, not an animation keyframe.
   */
  setTime(index) {
    this.timeIndex = index;
    if (!this.mediumMesh) return;

    const colour = new THREE.Color();
    this.wells.forEach((well, wellIndex) => {
      const point = well.series?.[Math.min(index, (well.series?.length ?? 1) - 1)];
      const viability = point?.viability ?? 1;
      this.mediumMesh.setColorAt(wellIndex, viabilityColour(viability, colour));
    });
    if (this.mediumMesh.instanceColor) this.mediumMesh.instanceColor.needsUpdate = true;

    if (this.mode === "well" && this.selectedWell !== null) {
      this.updateWellInterior();
    }
    this.requestRender();
  }

  /** Enter one well: cells rendered individually from the simulated count. */
  enterWell(wellIndex) {
    this.mode = "well";
    this.selectedWell = wellIndex;
    this.clearScene();

    const well = this.wells[wellIndex];
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 5.7, 1.4, 48, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x16202b,
        roughness: 0.4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.scene.add(dish);
    this.track(dish);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.9, 48),
      new THREE.MeshStandardMaterial({ color: 0x0b131b, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.7;
    this.scene.add(floor);
    this.track(floor);

    // Cell population. Capacity is fixed at build time; the live count is
    // expressed by how many instances are placed, so the visible density is
    // the simulated density.
    this.cellCapacity = 4000;
    const cellGeometry = new THREE.SphereGeometry(0.11, 10, 8);
    const cellMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.cellMesh = new THREE.InstancedMesh(
      cellGeometry, cellMaterial, this.cellCapacity
    );
    this.cellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.cellMesh);
    this.track(this.cellMesh);

    // Fixed layout, so a cell does not teleport between timepoints: the same
    // seat is occupied or empty as the population grows and shrinks.
    this.cellSeats = [];
    for (let index = 0; index < this.cellCapacity; index += 1) {
      const angle = index * 2.399963; // golden angle: even disc packing
      const radius = 5.5 * Math.sqrt(index / this.cellCapacity);
      this.cellSeats.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        jitter: (Math.random() - 0.5) * 0.14,
      });
    }

    this.camera.position.set(0, 7, 9);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.updateWellInterior();
    this.requestRender();
    return well;
  }

  /** Place instances to match the simulated count and viability. */
  updateWellInterior() {
    if (!this.cellMesh) return;
    const well = this.wells[this.selectedWell];
    const point = well.series?.[
      Math.min(this.timeIndex ?? 0, (well.series?.length ?? 1) - 1)
    ];
    if (!point) return;

    const reference = well.maxCount || point.count || 1;
    const visible = Math.max(
      0,
      Math.min(this.cellCapacity, Math.round((point.count / reference) * this.cellCapacity * 0.85))
    );

    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    const dead = new THREE.Color(0x8a3b3b);
    const living = viabilityColour(1, new THREE.Color());
    const deadFraction = 1 - (point.viability ?? 1);

    for (let index = 0; index < this.cellCapacity; index += 1) {
      if (index < visible) {
        const seat = this.cellSeats[index];
        matrix.makeTranslation(seat.x, -0.55 + seat.jitter, seat.z);
        this.cellMesh.setMatrixAt(index, matrix);
        // Dead cells are drawn at the *end* of the seat order, so the dying
        // fraction reads as a proportion rather than a random speckle.
        const isDead = index > visible * (1 - deadFraction);
        this.cellMesh.setColorAt(index, isDead ? dead : living);
      } else {
        matrix.makeScale(0, 0, 0);
        this.cellMesh.setMatrixAt(index, matrix);
      }
    }
    this.cellMesh.instanceMatrix.needsUpdate = true;
    if (this.cellMesh.instanceColor) this.cellMesh.instanceColor.needsUpdate = true;
    this.visibleCells = visible;
  }

  /**
   * Render a spheroid from the computed oxygen field.
   *
   * Shells are placed at the radii the solver returned and coloured by the
   * oxygen value there. Where the field never crosses the thresholds there are
   * no zones, and none are drawn.
   */
  showSpheroid(field) {
    this.mode = "well";
    this.clearScene();

    const radii = field.radii_um || [];
    const oxygen = field.oxygen?.value || [];
    if (!radii.length) return;

    const outer = radii[radii.length - 1];
    const scale = 5.0 / outer;

    // A handful of nested translucent shells: enough to read the gradient,
    // few enough to stay transparent-sortable.
    const shellCount = Math.min(9, radii.length);
    for (let index = shellCount - 1; index >= 0; index -= 1) {
      const dataIndex = Math.floor((index / (shellCount - 1)) * (radii.length - 1));
      const radius = radii[dataIndex] * scale;
      const value = oxygen[dataIndex] ?? 1;

      const colour = new THREE.Color().setHSL(
        0.02 + 0.32 * Math.max(0, Math.min(1, value)),
        0.6,
        0.34 + 0.16 * value
      );
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius, 0.05), 32, 24),
        new THREE.MeshStandardMaterial({
          color: colour,
          transparent: true,
          opacity: index === shellCount - 1 ? 0.28 : 0.4,
          roughness: 0.6,
          depthWrite: false,
        })
      );
      this.scene.add(shell);
      this.track(shell);
    }

    this.camera.position.set(0, 4, 11);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.requestRender();
  }

  handleClick(event) {
    if (this.mode !== "plate" || !this.wellMesh) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObject(this.mediumMesh);
    if (hits.length && hits[0].instanceId !== undefined) {
      this.onWellSelect?.(hits[0].instanceId, this.wells[hits[0].instanceId]);
    }
  }

  exitWell() {
    this.mode = "plate";
    this.selectedWell = null;
    this.buildPlate(this.wells);
    this.setTime(this.timeIndex ?? 0);
  }

  track(...objects) {
    this.disposables.push(...objects);
  }

  clearScene() {
    for (const object of this.disposables) {
      this.scene.remove(object);
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) {
        object.material.forEach((m) => m.dispose());
      } else {
        object.material?.dispose?.();
      }
    }
    this.disposables = [];
    this.cellMesh = null;
    this.mediumMesh = null;
    this.wellMesh = null;
  }

  /**
   * Draw one frame now.
   *
   * The render loop is driven by requestAnimationFrame, which browsers suspend
   * in a background or hidden tab. Without this, a plate built while the tab is
   * not visible stays blank until the tab is focused — and a viewer that is
   * blank for reasons unrelated to the data is indistinguishable from one whose
   * simulation produced nothing.
   */
  requestRender() {
    this.renderer?.render(this.scene, this.camera);
  }

  animate() {
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      this.controls?.update();
      this.renderer?.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    if (!this.renderer) return;
    const { clientWidth: width, clientHeight: height } = this.container;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  destroy() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.clearScene();
    this.renderer?.dispose();
    this.controls?.dispose();
  }
}

/** Well labels: A1, A2 … in the plate's own convention. */
export function wellLabel(row, col) {
  return `${ROW_LETTERS[row] || "?"}${col + 1}`;
}
