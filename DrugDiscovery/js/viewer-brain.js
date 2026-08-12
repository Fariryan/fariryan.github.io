/**
 * 3D neuroanatomy viewer (Three.js).
 *
 * Renders real surface meshes from the Allen Human Reference Atlas (3D) v1.0
 * and real single-cell reconstructions from NeuroMorpho.org. Nothing here is a
 * procedural or artistic model: every surface is derived from a segmented
 * human specimen, and every neuron is a digital tracing of an individual cell
 * from a published study.
 *
 * Assets are built by `scripts/build_brain_assets.py` into a compact binary
 * format; see `frontend/assets/brain/manifest.json` for per-asset provenance.
 */

// Explicit paths, not bare specifiers: see the note in index.html about
// import maps and the Content-Security-Policy.
import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/OrbitControls.js";

// Relative, not /static/..., so the geometry loads whether the app is served
// from the root of a domain or from a /DrugDiscovery/ subpath on GitHub Pages.
// Hash routing keeps the document URL fixed, so this resolves the same way in
// every view. These files ship with the UI rather than coming from the API.
const ASSET_BASE = "assets/brain";

/** Display colour per structural role, overriding the atlas' own palette. */
const ROLE_STYLE = {
  shell: { color: 0xa8bcd0, opacity: 0.08, depthWrite: false, order: 0 },
  lobe: { color: 0xff8fa3, opacity: 0.42, depthWrite: true, order: 1 },
  subcortical: { color: 0xc8a2ff, opacity: 0.85, depthWrite: true, order: 2 },
  brainstem: { color: 0xffc978, opacity: 0.8, depthWrite: true, order: 2 },
  cerebellum: { color: 0x6fd8d8, opacity: 0.6, depthWrite: true, order: 1 },
  white_matter: { color: 0xe6edf5, opacity: 0.3, depthWrite: false, order: 1 },
  ventricle: { color: 0x63d9a8, opacity: 0.45, depthWrite: false, order: 1 },
};

/**
 * SWC structure identifiers → display colour and label.
 *
 * Types 0-4 are the original SWC specification; 5-7 are the standard
 * extensions, and glial reconstructions rely on type 7. Leaving those
 * unlabelled shows a reader "type 7" where the file actually says
 * "glial process".
 */
const SWC_COLORS = {
  0: 0x8b949e, // undefined
  1: 0xffd166, // soma
  2: 0x4a9eff, // axon
  3: 0xff8fa3, // basal dendrite
  4: 0xc8a2ff, // apical dendrite
  5: 0x6fd8d8, // custom
  6: 0x63d9a8, // unspecified neurite
  7: 0xa0e8b0, // glial process
};

const SWC_LABELS = {
  0: "undefined",
  1: "soma",
  2: "axon",
  3: "basal dendrite",
  4: "apical dendrite",
  5: "custom",
  6: "unspecified neurite",
  7: "glial process",
};

/* -------------------------------------------------------------- loaders */

/** Parse the binary mesh format written by the asset build script. */
export function parseMesh(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  if (magic !== "NBM1") throw new Error(`bad mesh magic: ${magic}`);

  const vertexCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);

  let offset = 12;
  const positions = new Float32Array(buffer, offset, vertexCount * 3);
  offset += vertexCount * 3 * 4;
  const indices = new Uint32Array(buffer, offset, indexCount);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Normals are omitted from the file and recomputed here; it costs a few
  // milliseconds and saves a third of the download.
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Parse the binary morphology format (SWC-derived). */
export function parseMorphology(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  if (magic !== "NSW3") throw new Error(`bad morphology magic: ${magic}`);

  const count = view.getUint32(4, true);
  const somaVertexCount = view.getUint32(8, true);
  const somaIndexCount = view.getUint32(12, true);

  // Order matters: the four-byte arrays come first so every typed-array view
  // starts on a 4-byte boundary. The single-byte type array is last.
  let offset = 16;
  const positions = new Float32Array(buffer, offset, count * 3);
  offset += count * 3 * 4;
  const radii = new Float32Array(buffer, offset, count);
  offset += count * 4;
  const parents = new Int32Array(buffer, offset, count);
  offset += count * 4;
  const somaPositions = new Float32Array(buffer, offset, somaVertexCount * 3);
  offset += somaVertexCount * 3 * 4;
  const somaIndices = new Uint32Array(buffer, offset, somaIndexCount);
  offset += somaIndexCount * 4;
  const types = new Uint8Array(buffer, offset, count);

  return {
    count,
    positions,
    radii,
    types,
    parents,
    somaPositions,
    somaIndices,
  };
}

async function loadBinary(path) {
  const response = await fetch(`${ASSET_BASE}/${path}`);
  if (!response.ok) throw new Error(`could not load ${path}`);
  return response.arrayBuffer();
}

export async function loadManifest() {
  const response = await fetch(`${ASSET_BASE}/manifest.json`);
  if (!response.ok) throw new Error("brain asset manifest is missing");
  return response.json();
}

/* --------------------------------------------------------- brain viewer */

export class BrainViewer {
  constructor(container) {
    this.container = container;
    this.manifest = null;
    this.meshes = new Map(); // acronym -> THREE.Mesh
    this.visible = new Set();
    this.onStructureClick = null;
    this.onStructureHover = null;
    this.raf = null;
  }

  init() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.01, 100);
    this.camera.position.set(2.6, 0.9, 2.6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.sortObjects = true;
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 9;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(3, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88c8e0, 0.45);
    fill.position.set(-3, -1, -2);
    this.scene.add(fill);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderer.domElement.addEventListener("click", (e) => this.onClick(e));
    this.renderer.domElement.addEventListener("pointermove", (e) => this.onHover(e));

    this.animate();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  async load(manifest, initialAcronyms) {
    this.manifest = manifest;
    const wanted = initialAcronyms || manifest.structures.map((s) => s.acronym);
    await Promise.all(wanted.map((a) => this.ensureStructure(a)));
    this.frameAll();
  }

  /** Load one structure mesh on demand. */
  async ensureStructure(acronym) {
    if (this.meshes.has(acronym)) return this.meshes.get(acronym);

    const record = this.manifest?.structures.find((s) => s.acronym === acronym);
    if (!record) return null;

    let geometry;
    try {
      geometry = parseMesh(await loadBinary(record.file));
    } catch (error) {
      console.warn("brain mesh failed", acronym, error);
      return null;
    }

    const style = ROLE_STYLE[record.role] || ROLE_STYLE.subcortical;
    const material = new THREE.MeshPhongMaterial({
      color: style.color,
      transparent: true,
      opacity: style.opacity,
      depthWrite: style.depthWrite,
      shininess: 28,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = style.order;
    mesh.userData = { record, baseOpacity: style.opacity, baseColor: style.color };
    mesh.visible = false;

    this.root.add(mesh);
    this.meshes.set(acronym, mesh);
    return mesh;
  }

  setVisible(acronyms) {
    this.visible = new Set(acronyms);
    for (const [acronym, mesh] of this.meshes) {
      mesh.visible = this.visible.has(acronym);
    }
  }

  /** Emphasise one structure, dimming everything else. */
  emphasise(acronym) {
    for (const [key, mesh] of this.meshes) {
      const { baseOpacity, baseColor } = mesh.userData;
      if (!acronym) {
        mesh.material.opacity = baseOpacity;
        mesh.material.color.setHex(baseColor);
        mesh.material.emissive.setHex(0x000000);
      } else if (key === acronym) {
        mesh.material.opacity = Math.min(0.98, baseOpacity + 0.5);
        mesh.material.emissive.setHex(0x224455);
      } else {
        mesh.material.opacity = baseOpacity * 0.22;
        mesh.material.emissive.setHex(0x000000);
      }
    }
  }

  focus(acronym) {
    const mesh = this.meshes.get(acronym);
    if (!mesh) return;
    const centroid = mesh.userData.record.centroid;
    this.controls.target.set(centroid[0], centroid[1], centroid[2]);
    this.controls.update();
  }

  frameAll() {
    const box = new THREE.Box3();
    for (const mesh of this.meshes.values()) {
      if (mesh.visible) box.expandByObject(mesh);
    }
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(centre);
    this.controls.update();
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // The translucent shell would swallow every click, so it is excluded.
    const targets = [...this.meshes.values()].filter(
      (m) => m.visible && m.userData.record.role !== "shell"
    );
    const hits = this.raycaster.intersectObjects(targets, false);
    return hits.length ? hits[0].object : null;
  }

  onClick(event) {
    const hit = this.pick(event);
    if (hit && this.onStructureClick) this.onStructureClick(hit.userData.record);
  }

  onHover(event) {
    const hit = this.pick(event);
    this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    if (this.onStructureHover) {
      this.onStructureHover(hit ? hit.userData.record : null);
    }
  }

  setShellOpacity(value) {
    const shell = [...this.meshes.values()].find(
      (m) => m.userData.record.role === "shell"
    );
    if (shell) {
      shell.material.opacity = value;
      shell.userData.baseOpacity = value;
      shell.visible = value > 0.001;
    }
  }

  setView(preset) {
    const positions = {
      lateral: [3.0, 0.15, 0.1],
      medial: [-3.0, 0.15, 0.1],
      anterior: [0.1, 0.15, 3.0],
      superior: [0.1, 3.0, 0.15],
      posterior: [0.1, 0.15, -3.0],
    };
    const [x, y, z] = positions[preset] || positions.lateral;
    this.camera.position.set(x, y, z);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  animate() {
    this.raf = requestAnimationFrame(() => this.animate());
    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height || !this.renderer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.renderer?.dispose();
  }
}

/* -------------------------------------------------------- neuron viewer */

/**
 * Renders a single reconstructed cell.
 *
 * Drawn as line segments coloured by SWC structure type, with the soma as a
 * sphere sized from its recorded radius. The branch topology and relative
 * geometry are exactly as traced; only a uniform scale was applied at build
 * time.
 */
export class NeuronViewer {
  constructor(container) {
    this.container = container;
    this.raf = null;
    this.cell = null;
    this.autoRotate = true;
  }

  init() {
    const width = this.container.clientWidth || 700;
    const height = this.container.clientHeight || 460;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 100);
    this.camera.position.set(0, 0, 3.1);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 14;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const light = new THREE.DirectionalLight(0xffffff, 0.6);
    light.position.set(2, 3, 4);
    this.scene.add(light);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.animate();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  async load(record) {
    if (!this.renderer) this.init();

    const morphology = parseMorphology(await loadBinary(record.file));
    this.clear();

    const {
      count, positions, radii, types, parents, somaPositions, somaIndices,
    } = morphology;

    // One line segment per point-to-parent link: that is the traced tree.
    const vertices = [];
    const colors = [];
    const colour = new THREE.Color();

    for (let i = 0; i < count; i += 1) {
      const parent = parents[i];
      if (parent < 0 || parent >= count) continue;

      vertices.push(
        positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
        positions[parent * 3], positions[parent * 3 + 1], positions[parent * 3 + 2]
      );

      colour.setHex(SWC_COLORS[types[i]] ?? SWC_COLORS[0]);
      colors.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position", new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    this.cell = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 })
    );
    this.root.add(this.cell);

    // Cell body. The mesh is reconstructed at build time from the soma points
    // the tracing recorded - a sphere where the file encodes one, and the
    // traced outline where it encodes a contour. Substituting a generic
    // sphere here would discard the measured shape.
    if (somaIndices.length) {
      const somaGeometry = new THREE.BufferGeometry();
      somaGeometry.setAttribute(
        "position", new THREE.BufferAttribute(somaPositions.slice(), 3)
      );
      somaGeometry.setIndex(new THREE.BufferAttribute(somaIndices.slice(), 1));
      somaGeometry.computeVertexNormals();

      this.root.add(
        new THREE.Mesh(
          somaGeometry,
          new THREE.MeshPhongMaterial({
            color: SWC_COLORS[1],
            emissive: 0x442200,
            shininess: 40,
            // Contour hulls can be near-flat; showing both faces avoids a
            // body that disappears from one side.
            side: THREE.DoubleSide,
            flatShading: false,
          })
        )
      );
    }

    // Present types actually found in this reconstruction, for the legend.
    const present = [...new Set([...types])].sort();
    return {
      segments: vertices.length / 6,
      types: present.map((t) => ({
        id: t,
        label: SWC_LABELS[t] ?? `type ${t}`,
        color: `#${(SWC_COLORS[t] ?? SWC_COLORS[0]).toString(16).padStart(6, "0")}`,
      })),
    };
  }

  clear() {
    while (this.root.children.length) {
      const child = this.root.children.pop();
      child.geometry?.dispose();
      child.material?.dispose();
    }
    this.cell = null;
  }

  setAutoRotate(on) {
    this.autoRotate = on;
  }

  resetView() {
    this.camera.position.set(0, 0, 3.1);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  animate() {
    this.raf = requestAnimationFrame(() => this.animate());
    if (this.autoRotate && this.root) this.root.rotation.y += 0.0035;
    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height || !this.renderer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.clear();
    this.renderer?.dispose();
  }
}

export { ROLE_STYLE, SWC_COLORS, SWC_LABELS };
