/** AI Scientist shell. */
import { esc, loading, notice } from "../ui.js";
const STYLESHEET = "css/scientist.css";

export const SECTIONS = [
  { key: "ask", label: "Ask", icon: "◎",
    module: () => import("./views/ask.js"), view: "askView",
    lede: "A persistent assistant that answers from this platform's own records. Every answer arrives with the rows it was grounded in, so you can check it rather than trust it." },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-scientist-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = STYLESHEET;
  link.dataset.scientistStyle = "true";
  document.head.appendChild(link);
}

export async function scientistView(root, section, params) {
  ensureStylesheet();
  const definition = SECTIONS[0];
  root.innerHTML = `
    <div class="sci-head">
      <div>
        <div class="breadcrumbs"><a href="#/scientist/ask">AI Scientist</a></div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <div id="sci-body">${loading("Preparing…")}</div>`;
  const body = root.querySelector("#sci-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(`<strong>The assistant could not be loaded.</strong><br />${esc(error.message)}`, "danger", "⚠");
    console.error(error);
  }
}
