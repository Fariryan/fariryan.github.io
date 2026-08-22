/** Protein Structure Intelligence — one workspace, coordinated panels.
 *
 *  Deliberately not a set of tabs. The 3D structure is the central object and
 *  stays on screen; the panels beside it are views of the same selection
 *  state, and clicking a result in any of them addresses the same viewer.
 */
import { esc, loading, notice } from "../ui.js";
const STYLESHEET = "css/structint.css";

export async function structintView(root, section, params) {
  if (!document.querySelector("link[data-structint-style]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = STYLESHEET;
    link.dataset.structintStyle = "true";
    document.head.appendChild(link);
  }
  root.innerHTML = `
    <div class="psi-head">
      <div>
        <div class="breadcrumbs">Protein Structure Intelligence</div>
        <h2>Protein Structure Intelligence</h2>
        <p class="lede">Secondary structure, surface chemistry, binding pockets and
          structural neighbours, computed from real coordinates. Every panel addresses
          the same structure — click a result and the viewer goes there.</p>
      </div>
    </div>
    <div id="psi-body">${loading("Preparing…")}</div>`;
  const body = root.querySelector("#psi-body");
  try {
    const module = await import("./workspace.js");
    await module.workspaceView(body, params);
  } catch (error) {
    body.innerHTML = notice(
      `<strong>The workspace could not be loaded.</strong><br />${esc(error.message)}`,
      "danger", "⚠");
    console.error(error);
  }
}
