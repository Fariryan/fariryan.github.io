/**
 * Knowledge-graph viewer (Cytoscape.js).
 *
 * The graph is always ego-centric — the neighbourhood of one entity — so it is
 * laid out in concentric rings by hop distance from that entity rather than
 * force-directed. A hub like a well-studied target pulls in dozens of drugs,
 * and a force layout turns that into an unreadable knot of identical circles.
 *
 * Two other things keep it legible: nodes are sized by how connected they are,
 * and labels are shown only where they can be read — the root, its immediate
 * neighbours, and whatever the pointer is over.
 */

const KIND_COLORS = {
  disease: "#ff8fa3",
  drug: "#63d9a8",
  compound: "#7ec4ff",
  target: "#c8a2ff",
  gene: "#ffc978",
  pathway: "#6fd8d8",
  structure: "#ffa8d4",
  trial: "#9fb4c9",
  publication: "#b8b8b8",
  brain_region: "#ffb3a0",
  cell_type: "#a0e8b0",
};

/** Edge appearance encodes evidence strength. */
const EVIDENCE_STYLE = {
  established: { width: 2.6, opacity: 0.95, dashed: false, color: "#3fb950" },
  strong: { width: 2.2, opacity: 0.9, dashed: false, color: "#4a9eff" },
  clinical_trial: { width: 1.7, opacity: 0.8, dashed: true, color: "#a371f7" },
  preliminary: { width: 1.4, opacity: 0.68, dashed: true, color: "#d29922" },
  preclinical: { width: 1.3, opacity: 0.64, dashed: true, color: "#f0883e" },
  hypothesized: { width: 1.0, opacity: 0.45, dashed: true, color: "#8b949e" },
  unknown: { width: 0.8, opacity: 0.3, dashed: true, color: "#6b7d92" },
};

const truncate = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export class GraphViewer {
  constructor(container) {
    this.container = container;
    this.cy = null;
    this.onNodeTap = null;
    this.onEdgeTap = null;
    this.showEdgeLabels = false;
    this.rootId = null;
  }

  render(data) {
    if (!window.cytoscape) {
      this.container.innerHTML =
        '<div class="viewer-loading">Graph library unavailable.</div>';
      return;
    }

    this.rootId = String(data.root?.id ?? "");

    // Hop distance from the root drives the concentric rings. Computed here
    // rather than trusted from the payload so the layout stays correct even
    // when the server truncates the neighbourhood.
    const adjacency = new Map();
    data.nodes.forEach((n) => adjacency.set(String(n.id), []));
    data.edges.forEach((e) => {
      const a = String(e.source);
      const b = String(e.target);
      adjacency.get(a)?.push(b);
      adjacency.get(b)?.push(a);
    });

    const depth = new Map([[this.rootId, 0]]);
    let frontier = [this.rootId];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        for (const neighbour of adjacency.get(id) || []) {
          if (!depth.has(neighbour)) {
            depth.set(neighbour, depth.get(id) + 1);
            next.push(neighbour);
          }
        }
      }
      frontier = next;
    }

    const degree = new Map();
    data.nodes.forEach((n) =>
      degree.set(String(n.id), (adjacency.get(String(n.id)) || []).length)
    );
    const maxDegree = Math.max(1, ...degree.values());

    const elements = [
      ...data.nodes.map((n) => {
        const id = String(n.id);
        const isRoot = id === this.rootId;
        const d = degree.get(id) || 0;
        return {
          data: {
            id,
            // Full name kept for the tooltip; the drawn label is short enough
            // to sit under a node without colliding with its neighbours.
            label: truncate(n.name, isRoot ? 34 : 22),
            full: n.name,
            kind: n.kind,
            isRoot: isRoot ? 1 : 0,
            ring: depth.has(id) ? depth.get(id) : 9,
            // 14px floor, growing with connectivity.
            size: isRoot ? 40 : 14 + Math.round(16 * Math.sqrt(d / maxDegree)),
            // Only well-connected or near nodes carry a permanent label.
            labelled: isRoot || (depth.get(id) ?? 9) <= 1 ? 1 : 0,
          },
        };
      }),
      ...data.edges.map((e) => ({
        data: {
          id: `e${e.id}`,
          source: String(e.source),
          target: String(e.target),
          label: e.predicate.replace(/_/g, " ").toLowerCase(),
          level: e.evidence.level,
        },
      })),
    ];

    this.cy?.destroy();
    this.cy = window.cytoscape({
      container: this.container,
      elements,
      wheelSensitivity: 0.25,
      minZoom: 0.15,
      maxZoom: 3,
      style: [
        {
          selector: "node",
          style: {
            "background-color": (n) => KIND_COLORS[n.data("kind")] || "#93a4b8",
            width: "data(size)",
            height: "data(size)",
            "border-width": 1.5,
            "border-color": "#0b0f14",
            label: (n) => (n.data("labelled") ? n.data("label") : ""),
            color: "#e6edf5",
            "font-size": "10px",
            "font-weight": 500,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-outline-width": 2.5,
            "text-outline-color": "#0b0f14",
            "text-max-width": "110px",
            "text-wrap": "ellipsis",
            "z-index": 10,
          },
        },
        {
          selector: "node[isRoot = 1]",
          style: {
            "border-width": 3,
            "border-color": "#35c6d8",
            "font-size": "13px",
            "font-weight": 700,
            "text-valign": "center",
            "text-margin-y": 0,
            "text-outline-width": 3,
            "z-index": 30,
          },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "straight",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.6,
            "line-color": (e) => EVIDENCE_STYLE[e.data("level")]?.color ?? "#33465b",
            "target-arrow-color": (e) =>
              EVIDENCE_STYLE[e.data("level")]?.color ?? "#33465b",
            width: (e) => EVIDENCE_STYLE[e.data("level")]?.width ?? 1,
            opacity: (e) => EVIDENCE_STYLE[e.data("level")]?.opacity ?? 0.4,
            "line-style": (e) =>
              EVIDENCE_STYLE[e.data("level")]?.dashed ? "dashed" : "solid",
            "line-dash-pattern": [5, 4],
            label: "",
            "font-size": "8px",
            color: "#93a4b8",
            "text-rotation": "autorotate",
            "text-outline-width": 2,
            "text-outline-color": "#0b0f14",
            "z-index": 1,
          },
        },
        {
          selector: "edge.labelled",
          style: { label: "data(label)" },
        },
        // Hover focus: everything outside the neighbourhood recedes.
        { selector: ".dim", style: { opacity: 0.07, "text-opacity": 0 } },
        {
          selector: ".spotlight",
          style: {
            "border-width": 3,
            "border-color": "#35c6d8",
            "z-index": 40,
            label: "data(label)",
            "text-opacity": 1,
          },
        },
        {
          selector: "edge.spotlight",
          style: { width: 3, opacity: 1, label: "data(label)", "z-index": 20 },
        },
      ],
      layout: this.layoutOptions("concentric"),
    });

    this.cy.on("tap", "node", (event) => {
      // Clear any hover state before navigating, so a fade never survives
      // into the next view.
      this.clearFocus();
      this.onNodeTap?.(Number(event.target.id()));
    });
    this.cy.on("tap", "edge", (event) => this.onEdgeTap?.(event.target.data()));

    this.cy.on("mouseover", "node", (event) => {
      const node = event.target;
      const hood = node.closedNeighborhood();
      this.cy.elements().difference(hood).addClass("dim");
      hood.addClass("spotlight");
    });
    this.cy.on("mouseout", "node", () => this.clearFocus());

    // Tapping the background also clears, in case a pointer left the canvas
    // without firing mouseout.
    this.cy.on("tap", (event) => {
      if (event.target === this.cy) this.clearFocus();
    });

    this.cy.ready(() => this.fit());
  }

  clearFocus() {
    this.cy?.elements().removeClass("dim").removeClass("spotlight");
  }

  layoutOptions(name) {
    const layouts = {
      // Rings by hop distance: the natural shape of an ego network.
      concentric: {
        name: "concentric",
        animate: false,
        concentric: (n) => 10 - (n.data("ring") ?? 9),
        levelWidth: () => 1,
        minNodeSpacing: 26,
        spacingFactor: 1.1,
        padding: 40,
      },
      cose: {
        name: "cose",
        animate: false,
        nodeRepulsion: 20000,
        idealEdgeLength: 130,
        nodeOverlap: 28,
        numIter: 900,
        gravity: 30,
        randomize: false,
        padding: 40,
      },
      breadthfirst: {
        name: "breadthfirst",
        animate: false,
        directed: false,
        roots: this.rootId ? `#${this.rootId}` : undefined,
        spacingFactor: 1.3,
        padding: 40,
      },
      circle: { name: "circle", animate: false, padding: 40 },
      grid: { name: "grid", animate: false, padding: 40 },
    };
    return layouts[name] || layouts.concentric;
  }

  setLayout(name) {
    if (!this.cy) return;
    this.cy.layout(this.layoutOptions(name)).run();
    this.fit();
  }

  /** Show every node label, or only the readable subset. */
  setAllLabels(show) {
    if (!this.cy) return;
    this.cy.nodes().forEach((n) => n.data("labelled", show ? 1 : n.data("isRoot") || (n.data("ring") <= 1 ? 1 : 0)));
    this.cy.style().update();
  }

  setEdgeLabels(show) {
    this.showEdgeLabels = show;
    if (!this.cy) return;
    this.cy.edges().toggleClass("labelled", show);
  }

  fit() {
    this.cy?.fit(undefined, 45);
  }

  destroy() {
    this.cy?.destroy();
    this.cy = null;
  }
}

export { KIND_COLORS, EVIDENCE_STYLE };
