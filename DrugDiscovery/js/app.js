/**
 * Application shell: navigation, universal search, hash routing.
 *
 * Views are loaded as dynamic imports so the initial page does not pay for
 * the 3D and graph libraries until a route actually needs them.
 */

import { api } from "./api.js";
import { compareStore } from "./compare-store.js";
import { refreshGlass, retheme, startGlass } from "./glass/index.js";
import { requireAcceptance, termsView } from "./terms.js";
import { esc, kindBadge, notice } from "./ui.js";

const NAV = [
  // Universal platform Phase 1. Placed first because choosing the therapeutic
  // area is the first decision a scientist makes; every group below it works
  // exactly as before whether or not an area has been chosen.
  {
    group: "Discovery",
    items: [
      { route: "areas/select", icon: "◈", label: "Therapeutic Areas" },
      { route: "areas/workspace", icon: "▤", label: "Disease Workspace" },
      { route: "knowledge/graph", icon: "⁘", label: "Knowledge Graph" },
      { route: "knowledge/literature", icon: "📄", label: "Literature" },
      { route: "workbench/editor", icon: "✎", label: "Molecule Editor" },
      { route: "workbench/structures", icon: "⬢", label: "Structure Workbench" },
    ],
  },
  { group: "Overview", items: [{ route: "", icon: "◈", label: "Dashboard" }] },
  {
    group: "Entities",
    items: [
      { route: "diseases", icon: "🧠", label: "Diseases", stat: "disease" },
      { route: "drugs", icon: "💊", label: "Drugs", stat: "drug" },
      { route: "molecules", icon: "⌬", label: "Molecules", stat: "compound" },
      { route: "targets", icon: "🎯", label: "Targets", stat: "target" },
      { route: "pathways", icon: "⇄", label: "Pathways", stat: "pathway" },
    ],
  },
  {
    group: "Explore",
    items: [
      { route: "mechanism", icon: "⇣", label: "Mechanisms" },
      { route: "brain", icon: "◑", label: "Brain", stat: "brain_region" },
      { route: "cells", icon: "⬡", label: "Cells", stat: "cell_type" },
      { route: "explorer", icon: "⬢", label: "3D explorer", stat: "structure" },
      { route: "graph", icon: "⁘", label: "Knowledge graph" },
      { route: "matrix", icon: "▦", label: "Drug–disease matrix" },
      { route: "compare", icon: "⇄", label: "Compare" },
    ],
  },
  {
    group: "Evidence",
    items: [
      { route: "trials", icon: "🔬", label: "Clinical trials", stat: "trial" },
      { route: "publications", icon: "📄", label: "Publications", stat: "publication" },
      { route: "sources", icon: "🗄", label: "Sources" },
      { route: "admin", icon: "✓", label: "Scientific review" },
    ],
  },
  { group: "Assistant", items: [{ route: "ai", icon: "✦", label: "AI scientist" }] },
  // Discovery Lab: the computational layer. Isolated under its own route
  // prefix, so nothing above changes behaviour when it is present or absent.
  {
    group: "Discovery Lab",
    items: [
      { route: "lab/radar", icon: "◎", label: "Research Radar" },
      { route: "lab/graph", icon: "⁘", label: "Evidence Graph" },
      { route: "lab/designer", icon: "⚗", label: "Molecule Designer" },
      { route: "lab/molecular3d", icon: "⬢", label: "3D Molecular Lab" },
      { route: "lab/bbb", icon: "◐", label: "BBB Lab" },
      { route: "lab/target", icon: "🎯", label: "Target & Binding" },
      { route: "lab/gaps", icon: "◌", label: "Gap Finder" },
      { route: "lab/workbench", icon: "▤", label: "Candidate Workbench" },
    ],
  },
  // The preclinical laboratory: one molecule followed from structure through
  // docking, dynamics, a cell model and a mouse PK/PD model.
  {
    group: "Preclinical",
    items: [
      { route: "preclinical/molecule", icon: "⌬", label: "Molecule" },
      { route: "preclinical/insilico", icon: "⚛", label: "In Silico" },
      { route: "preclinical/invitro", icon: "▦", label: "In Vitro" },
      { route: "preclinical/invivo", icon: "🐁", label: "In Vivo Mouse" },
    ],
  },
  // Molecular Discovery Lab: the research programme. Separate from the
  // preclinical group above, which evaluates a molecule it is given. This one
  // decides which molecule is worth evaluating, and why.
  {
    group: "Molecular Discovery Lab",
    items: [
      { route: "discovery/overview", icon: "◉", label: "Overview" },
      { route: "discovery/campaigns", icon: "▣", label: "Campaigns" },
      { route: "discovery/disease", icon: "❊", label: "Disease Intelligence" },
      { route: "discovery/graph", icon: "⁝", label: "Evidence Graph" },
      { route: "discovery/hypotheses", icon: "◈", label: "Hypothesis Lab" },
      { route: "discovery/targets", icon: "⌖", label: "Target Discovery" },
      { route: "discovery/chemistry", icon: "✦", label: "Chemical Space" },
      { route: "discovery/design", icon: "⎔", label: "Candidate Design" },
      { route: "discovery/optimization", icon: "⚖", label: "Optimization" },
      { route: "discovery/comparisons", icon: "⇄", label: "Comparisons" },
      { route: "discovery/memory", icon: "⏱", label: "Research Memory" },
    ],
  },
  // Chemical Intelligence: the cross-therapeutic-area evidence fabric. Every
  // group above is unchanged; this one is appended, and its routes live in
  // their own `chemint/` namespace so no existing bookmark is affected.
  {
    group: "Chemical Intelligence",
    items: [
      { route: "chemint/search", icon: "⌕", label: "Molecule Search" },
      { route: "chemint/molecule", icon: "⌬", label: "Molecule Dossier" },
      { route: "chemint/neighborhood", icon: "◎", label: "Chemical Neighborhood" },
      { route: "chemint/scaffolds", icon: "⬡", label: "Scaffold Families" },
      { route: "chemint/evidence", icon: "⚖", label: "Claims & Evidence" },
      { route: "chemint/sources", icon: "🗄", label: "Sources & Coverage" },
    ],
  },
  // Molecular Property Intelligence Engine. Appended, like every group above
  // it, in its own `propintel/` route namespace.
  {
    group: "Property Intelligence",
    items: [
      { route: "propintel/profile", icon: "◈", label: "Property Profile" },
      { route: "propintel/liabilities", icon: "⚠", label: "Liability Map" },
      { route: "propintel/compare", icon: "⇄", label: "Reference Comparison" },
      { route: "propintel/models", icon: "▤", label: "Model Registry" },
    ],
  },
  // Molecular Gradient: directed chemical evolution. Appended, in its own
  // `molgrad/` route namespace.
  {
    group: "Molecular Gradient",
    items: [
      { route: "molgrad/runs", icon: "▤", label: "Optimisation Runs" },
      { route: "molgrad/trajectory", icon: "⇢", label: "Gradient Trajectory" },
      { route: "molgrad/pareto", icon: "◈", label: "Pareto Frontier" },
      { route: "molgrad/graph", icon: "⁘", label: "Search Graph" },
    ],
  },
  // Discovery Director: orchestration over the three engines above.
  // Appended, in its own `director/` route namespace.
  {
    group: "Discovery Director",
    items: [
      { route: "director/campaigns", icon: "▤", label: "Campaigns" },
      { route: "director/timeline", icon: "⇢", label: "Decision Timeline" },
      { route: "director/hypotheses", icon: "◈", label: "Hypotheses" },
      { route: "director/review", icon: "⚖", label: "Review Queue" },
      { route: "director/agents", icon: "⁘", label: "Agents & Audit" },
    ],
  },
  // Enterprise: tenancy, provenance, governance and compute around the
  // scientific phases. Appended, in its own `enterprise/` route namespace.
  {
    group: "Enterprise",
    items: [
      { route: "enterprise/portfolio", icon: "▤", label: "Portfolio" },
      { route: "enterprise/evidence", icon: "⛓", label: "Evidence Chain" },
      { route: "enterprise/models", icon: "◈", label: "Model Registry" },
      { route: "enterprise/validation", icon: "⊹", label: "Validation" },
      { route: "enterprise/compute", icon: "⚙", label: "Compute & Runs" },
      { route: "enterprise/governance", icon: "⚖", label: "Governance" },
    ],
  },
  // Autonomous Discovery: one objective in, a planned and executed workflow
  // out. Placed last in the nav but first in intent — it is the simplest way
  // in, and every manual group above it still works exactly as before.
  {
    group: "Autonomous Discovery",
    items: [
      { route: "autopilot/start", icon: "▶", label: "Start Discovery" },
      { route: "autopilot/map", icon: "◎", label: "Live Discovery Map" },
      { route: "autopilot/story", icon: "▤", label: "Discovery Story" },
      { route: "autopilot/evolution", icon: "⑃", label: "Chemical Evolution" },
      { route: "autopilot/generations", icon: "⧉", label: "Generation Viewer" },
      { route: "autopilot/decision", icon: "◫", label: "Decision Room" },
      { route: "autopilot/runs", icon: "⟲", label: "Discovery Runs" },
    ],
  },
];

const view = document.getElementById("view");
const navHost = document.getElementById("nav");

/* -------------------------------------------------------------- routing */

const ROUTES = {
  "": () => import("./views/dashboard.js").then((m) => m.dashboardView(view)),
  diseases: (id, params) =>
    import("./views/lists.js").then((m) => m.listView(view, "diseases", params)),
  drugs: (id, params) =>
    import("./views/lists.js").then((m) => m.listView(view, "drugs", params)),
  molecules: (id, params) =>
    import("./views/lists.js").then((m) => m.listView(view, "molecules", params)),
  targets: (id, params) =>
    import("./views/lists.js").then((m) => m.listView(view, "targets", params)),
  pathways: (id, params) =>
    import("./views/lists.js").then((m) => m.pathwaysView(view, params)),
  search: (id, params) =>
    import("./views/lists.js").then((m) => m.searchView(view, params)),
  trials: () => import("./views/lists.js").then((m) => m.trialsView(view)),
  publications: (id, params) =>
    import("./views/lists.js").then((m) => m.publicationsView(view, params)),
  sources: () => import("./views/lists.js").then((m) => m.sourcesView(view)),

  entity: (id) => import("./views/entity.js").then((m) => m.entityView(view, id)),
  mechanism: (id) =>
    import("./views/mechanism.js").then((m) => m.mechanismView(view, id)),
  cells: () => import("./views/mechanism.js").then((m) => m.cellsView(view)),

  brain: () => import("./views/tools.js").then((m) => m.brainView(view)),
  graph: (id) => import("./views/tools.js").then((m) => m.graphView(view, id)),
  matrix: () => import("./views/tools.js").then((m) => m.matrixView(view)),
  compare: () => import("./views/tools.js").then((m) => m.compareView(view)),
  admin: () => import("./views/tools.js").then((m) => m.adminView(view)),

  ai: () => import("./views/ai.js").then((m) => m.aiView(view)),
  explorer: () => import("./views/ai.js").then((m) => m.explorerView(view)),

  // Discovery Lab. One route for the whole module; the second path segment
  // selects the section, so the lab's own navigation costs no further entries
  // here and the atlas's routing rules are unchanged.
  lab: (section, params) =>
    import("./lab/router.js").then((m) => m.labView(view, section, params)),

  // Same pattern as the lab: one route, the second segment selects the stage.
  preclinical: (section, params) =>
    import("./preclinical/router.js").then((m) =>
      m.preclinicalView(view, section, params)
    ),

  // Molecular Discovery Lab, same pattern again.
  discovery: (section, params) =>
    import("./discovery/router.js").then((m) =>
      m.discoveryView(view, section, params)
    ),

  // Therapeutic areas, same pattern again. One route for the whole module;
  // the second path segment selects the section.
  areas: (section, params) =>
    import("./areas/router.js").then((m) => m.areasView(view, section, params)),

  // The knowledge layer, same pattern again.
  knowledge: (section, params) =>
    import("./knowledge/router.js").then((m) => m.knowledgeView(view, section, params)),

  // The cheminformatics workbench, same pattern again.
  workbench: (section, params) =>
    import("./workbench/router.js").then((m) => m.workbenchView(view, section, params)),

  // Chemical Intelligence, same pattern again.
  chemint: (section, params) =>
    import("./chemint/router.js").then((m) =>
      m.chemintView(view, section, params)
    ),

  // Property Intelligence, same pattern again.
  propintel: (section, params) =>
    import("./propintel/router.js").then((m) =>
      m.propintelView(view, section, params)
    ),

  // Molecular Gradient, same pattern again.
  molgrad: (section, params) =>
    import("./molgrad/router.js").then((m) =>
      m.molgradView(view, section, params)
    ),

  // Discovery Director, same pattern again.
  director: (section, params) =>
    import("./director/router.js").then((m) =>
      m.directorView(view, section, params)
    ),

  // Enterprise, same pattern again.
  enterprise: (section, params) =>
    import("./enterprise/router.js").then((m) =>
      m.enterpriseView(view, section, params)
    ),

  // Autonomous Discovery, same pattern again.
  autopilot: (section, params) =>
    import("./autopilot/router.js").then((m) =>
      m.autopilotView(view, section, params)
    ),

  // Not a dynamic import: terms.js is already loaded by the gate, and the one
  // page a visitor may need to re-read should never depend on a further fetch.
  terms: () => termsView(view),
};

async function route() {
  const hash = window.location.hash.slice(2) || "";
  const [pathPart, queryPart] = hash.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const name = segments[0] || "";
  const id = segments[1];
  const params = new URLSearchParams(queryPart || "");

  const handler = ROUTES[name];
  if (!handler) {
    view.innerHTML = notice(
      `No such page: <code>${esc(name)}</code>. <a href="#/">Return to the dashboard</a>.`,
      "warn",
      "?"
    );
    return;
  }

  view.scrollIntoView?.({ block: "start" });
  window.scrollTo(0, 0);
  markActive(pathPart);

  try {
    await handler(id, params);
  } catch (error) {
    view.innerHTML = notice(
      `<strong>Could not load this view.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    console.error(error);
  } finally {
    // The view has replaced its whole subtree, so the optical budget has to
    // be recomputed against whatever it rendered, remembered panel positions
    // reapplied, and the adaptive frosting re-measured against any viewer the
    // route just mounted. Runs on the error path too: a failed route still
    // rendered a notice, and that notice is a glass surface.
    refreshGlass();
  }
}

/**
 * Highlight the nav entry for the current path.
 *
 * Compared against the whole path rather than its first segment, because
 * Discovery Lab's entries are two segments deep (`lab/radar`). A single-segment
 * entry still matches its own sub-paths, so `#/mechanism/12` keeps highlighting
 * "Mechanisms" exactly as it did before.
 */
/** Routes whose visualization is the page, rather than an illustration on it. */
const WORKSPACE_ROUTES = new Set([
  "brain",
  "cells",
  "explorer",
  "graph",
  "matrix",
  "lab/graph",
  "lab/molecular3d",
  "lab/bbb",
  "discovery/graph",
  "discovery/chemistry",
  "preclinical/molecule",
  "preclinical/insilico",
  "preclinical/invitro",
  // The neighbourhood map is the page, not an illustration on it.
  "chemint/neighborhood",
  // The trajectory is a three-panel workspace.
  "molgrad/trajectory",
  // The live discovery map is the page, not an illustration on it.
  "autopilot/map",
  // The generation viewer is a synchronised multi-panel workspace.
  "autopilot/generations",
  // The decision room lays candidates out side by side.
  "autopilot/decision",
]);

function markActive(path) {
  // Published on <body> so the stylesheet can tell a reading view from a
  // workspace one. A workspace gives its canvas the whole viewport and floats
  // its controls over it; a reading view keeps them in the flow. Nothing else
  // depends on this, and no view has to know it exists.
  document.body.dataset.route = path;
  document.body.toggleAttribute(
    "data-workspace",
    WORKSPACE_ROUTES.has(path) || WORKSPACE_ROUTES.has(path.split("/")[0])
  );

  navHost.querySelectorAll("a").forEach((link) => {
    const route = link.dataset.route;
    const active =
      route === path || (route !== "" && path.startsWith(`${route}/`));
    link.classList.toggle("active", active);
  });
}

/* ----------------------------------------------------------- navigation */

async function buildNav() {
  navHost.innerHTML = NAV.map(
    (group) => `
    <div class="nav-group-label">${esc(group.group)}</div>
    ${group.items
      .map(
        (item) => `
        <a href="#/${item.route}" data-route="${item.route}">
          <span class="ico">${item.icon}</span>
          <span>${esc(item.label)}</span>
          ${item.stat ? `<span class="count" data-stat="${item.stat}"></span>` : ""}
        </a>`
      )
      .join("")}`
  ).join("");

  // Counts come from the database, so an empty install shows nothing rather
  // than a plausible-looking number.
  try {
    const stats = await api.stats();
    navHost.querySelectorAll("[data-stat]").forEach((node) => {
      const count = (stats.entities || {})[node.dataset.stat];
      node.textContent = count ? String(count) : "";
    });
  } catch {
    /* the dashboard reports the failure; the nav simply stays uncounted */
  }
}

/* --------------------------------------------------------------- search */

function setupSearch() {
  const input = document.getElementById("search");
  const box = document.getElementById("suggestions");
  let timer;
  let selectedIndex = -1;

  const close = () => {
    box.innerHTML = "";
    selectedIndex = -1;
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) return close();

    timer = setTimeout(async () => {
      try {
        const hits = await api.suggest(query, 10);
        if (!hits.length) {
          box.innerHTML = `<div class="sugg"><div class="body">
            <div class="sub">Nothing matched “${esc(query)}”.</div></div></div>`;
          return;
        }
        box.innerHTML = hits
          .map(
            (h, i) => `
            <div class="sugg" data-id="${h.id}" data-i="${i}">
              ${kindBadge(h.kind)}
              <div class="body">
                <div class="title">${esc(h.title)}</div>
                <div class="sub">${esc(h.subtitle || "")}</div>
              </div>
            </div>`
          )
          .join("");
        box.querySelectorAll(".sugg[data-id]").forEach((node) =>
          node.addEventListener("click", () => {
            window.location.hash = `#/entity/${node.dataset.id}`;
            input.value = "";
            close();
          })
        );
      } catch {
        close();
      }
    }, 140);
  });

  input.addEventListener("keydown", (event) => {
    const options = [...box.querySelectorAll(".sugg[data-id]")];

    if (event.key === "Enter") {
      if (selectedIndex >= 0 && options[selectedIndex]) {
        window.location.hash = `#/entity/${options[selectedIndex].dataset.id}`;
      } else if (input.value.trim()) {
        window.location.hash = `#/search?q=${encodeURIComponent(input.value.trim())}`;
      }
      input.value = "";
      close();
      input.blur();
      return;
    }

    if (event.key === "Escape") {
      close();
      input.blur();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!options.length) return;
      selectedIndex =
        event.key === "ArrowDown"
          ? Math.min(selectedIndex + 1, options.length - 1)
          : Math.max(selectedIndex - 1, -1);
      options.forEach((node, i) => node.classList.toggle("sel", i === selectedIndex));
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) close();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}

/* ---------------------------------------------------------------- theme */

function setupTheme() {
  const saved = localStorage.getItem("neuroatlas.theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("neuroatlas.theme", next);
    // The ambient field's palette follows the theme, and it is a canvas, so
    // it has to be told rather than inheriting the change through CSS.
    retheme();
    // Viewers bake the background colour in at creation time, so re-render the
    // current route rather than leaving a mismatched canvas on screen.
    route();
  });
}

/* -------------------------------------------------------------- compare */

function setupCompare() {
  const button = document.getElementById("compare-btn");
  const count = document.getElementById("compare-count");
  compareStore.subscribe((items) => {
    count.textContent = `(${items.length})`;
    button.classList.toggle("primary", items.length >= 2);
  });
  button.addEventListener("click", () => {
    window.location.hash = "#/compare";
  });
}

/* ----------------------------------------------------------------- boot */

window.addEventListener("hashchange", route);

// The optical layer starts before anything is rendered, so the environment is
// already behind the terms gate and the first view never appears un-materialised.
// It is entirely additive: remove this call and every route, viewer and
// calculation still works, unstyled by the glass.
startGlass();

// The shell is built first so there is something coherent behind the gate, but
// routing is held back until the terms are accepted: no record should be
// fetched or displayed to someone who has not yet seen the notice.
buildNav();
setupSearch();
setupTheme();
setupCompare();

requireAcceptance().then(route);
