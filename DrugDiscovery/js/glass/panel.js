/**
 * Floating glass panel behaviour.
 *
 * Panels opt in by carrying `data-lg-panel="<id>"`; the id is what their
 * position and collapsed state are remembered under. Behaviour is added by
 * delegation from the document, so a panel rendered by any view — including
 * one rendered after this module ran — works without registering anything.
 *
 * Deliberately not universal. Only panels that a scientist has a reason to
 * move are draggable: an inspector that covers the part of a structure you
 * are trying to look at, a control cluster that wants to sit near the thing
 * it controls. Making every surface draggable turns a workspace into a mess
 * of accidentally-nudged furniture.
 */

const STORE_KEY = "neuroatlas.panels";
/** Panels raised above their siblings on focus, in ascending order of use. */
let topZ = 30;

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeStore(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* a full or disabled storage costs the memory of a position, nothing more */
  }
}

function remember(id, patch) {
  const store = readStore();
  store[id] = { ...(store[id] || {}), ...patch };
  writeStore(store);
}

/** Keep a panel inside the viewport after a drag, a resize or a restore. */
function clampToViewport(panel, x, y) {
  const box = panel.getBoundingClientRect();
  const margin = 8;
  const maxX = window.innerWidth - Math.min(box.width, window.innerWidth) - margin;
  const maxY = window.innerHeight - Math.min(box.height, window.innerHeight) - margin;
  return {
    x: Math.max(margin, Math.min(x, Math.max(margin, maxX))),
    y: Math.max(margin, Math.min(y, Math.max(margin, maxY))),
  };
}

function raise(panel) {
  topZ += 1;
  panel.style.zIndex = String(topZ);
  document.querySelectorAll("[data-lg-panel].is-active").forEach((other) => {
    if (other !== panel) other.classList.remove("is-active");
  });
  panel.classList.add("is-active");
}

/* ------------------------------------------------------------------ drag */

let drag = null;

function onPointerDown(event) {
  const handle = event.target.closest("[data-lg-drag]");
  if (!handle || event.button !== 0) return;
  const panel = handle.closest("[data-lg-panel]");
  if (!panel) return;

  // A control inside the title bar is a control, not a drag handle.
  if (event.target.closest("button, a, input, select, textarea")) return;

  const box = panel.getBoundingClientRect();
  drag = {
    panel,
    id: panel.dataset.lgPanel,
    offsetX: event.clientX - box.left,
    offsetY: event.clientY - box.top,
    moved: false,
  };

  raise(panel);
  panel.classList.remove("lg-settling");
  panel.classList.add("is-dragging");
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!drag) return;
  drag.moved = true;
  const { x, y } = clampToViewport(
    drag.panel,
    event.clientX - drag.offsetX,
    event.clientY - drag.offsetY
  );
  drag.panel.style.left = `${x}px`;
  drag.panel.style.top = `${y}px`;
  drag.panel.style.right = "auto";
  drag.panel.style.bottom = "auto";
}

function onPointerUp() {
  if (!drag) return;
  const { panel, id, moved } = drag;
  drag = null;

  panel.classList.remove("is-dragging");
  if (!moved) return;

  // The settle: the pane overshoots very slightly and comes to rest, which is
  // what stops a drag ending like a dropped file icon.
  panel.classList.add("lg-settling");
  window.setTimeout(() => panel.classList.remove("lg-settling"), 500);

  if (id) {
    remember(id, { left: panel.style.left, top: panel.style.top });
  }
}

/* -------------------------------------------------------------- collapse */

function onClick(event) {
  const toggle = event.target.closest("[data-lg-collapse]");
  if (toggle) {
    const panel = toggle.closest("[data-lg-panel]");
    if (panel) {
      const collapsed = panel.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      if (panel.dataset.lgPanel) remember(panel.dataset.lgPanel, { collapsed });
    }
    return;
  }

  const panel = event.target.closest("[data-lg-panel]");
  if (panel) raise(panel);
}

/* --------------------------------------------------------------- restore */

/**
 * Reapply remembered geometry to any panel currently in the document.
 *
 * Called after every route render, because views replace their whole subtree
 * and a panel that came back deserves to come back where it was left.
 */
export function restorePanels(root = document) {
  const store = readStore();
  // Below the laptop breakpoint panels dock as bottom sheets and a remembered
  // free position is meaningless — worse, it would fight the docked layout and
  // strand the panel off-screen.
  const docked = window.matchMedia("(max-width: 900px)").matches;
  root.querySelectorAll("[data-lg-panel]").forEach((panel) => {
    const state = store[panel.dataset.lgPanel];
    if (!state) return;
    if (state.collapsed) {
      panel.classList.add("is-collapsed");
      panel
        .querySelector("[data-lg-collapse]")
        ?.setAttribute("aria-expanded", "false");
    }
    if (!docked && state.left && state.top && panel.dataset.lgFloat !== "fixed") {
      panel.style.left = state.left;
      panel.style.top = state.top;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      const { x, y } = clampToViewport(
        panel,
        parseFloat(state.left),
        parseFloat(state.top)
      );
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    }
  });
}

let started = false;

export function startPanels() {
  if (started) return;
  started = true;

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerup", onPointerUp, { passive: true });
  document.addEventListener("pointercancel", onPointerUp, { passive: true });
  document.addEventListener("click", onClick);

  // A window that got smaller must not leave a panel off-screen and
  // unreachable.
  window.addEventListener(
    "resize",
    () => {
      document.querySelectorAll("[data-lg-panel]").forEach((panel) => {
        if (!panel.style.left) return;
        const { x, y } = clampToViewport(
          panel,
          parseFloat(panel.style.left),
          parseFloat(panel.style.top)
        );
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
      });
    },
    { passive: true }
  );
}
