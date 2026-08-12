/**
 * Application shell: navigation, universal search, hash routing.
 *
 * Views are loaded as dynamic imports so the initial page does not pay for
 * the 3D and graph libraries until a route actually needs them.
 */

import { api } from "./api.js";
import { compareStore } from "./compare-store.js";
import { requireAcceptance, termsView } from "./terms.js";
import { esc, kindBadge, notice } from "./ui.js";

const NAV = [
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
  markActive(name);

  try {
    await handler(id, params);
  } catch (error) {
    view.innerHTML = notice(
      `<strong>Could not load this view.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    console.error(error);
  }
}

function markActive(name) {
  navHost.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === name);
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

// The shell is built first so there is something coherent behind the gate, but
// routing is held back until the terms are accepted: no record should be
// fetched or displayed to someone who has not yet seen the notice.
buildNav();
setupSearch();
setupTheme();
setupCompare();

requireAcceptance().then(route);
