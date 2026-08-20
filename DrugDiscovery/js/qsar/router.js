/** QSAR shell. */
import { esc, loading, notice } from "../ui.js";
const STYLESHEET = "css/qsar.css";

export const SECTIONS = [
  { key: "models", label: "Model Registry", icon: "▦",
    module: () => import("./views/models.js"), view: "modelsView",
    lede: "Every trained model, its dataset and licence, its split, its metrics — and whether it cleared the validation gate that decides if it may answer questions." },
  { key: "train", label: "Train", icon: "⚗",
    module: () => import("./views/train.js"), view: "trainView",
    lede: "Assemble a dataset from this platform's ingested ChEMBL activities, train a classical model, and see the full provenance before anything is exposed." },
  { key: "predict", label: "Predict", icon: "◈",
    module: () => import("./views/predict.js"), view: "predictView",
    lede: "Predict with promoted models. Endpoints whose model failed its gate are listed too, so the gap is visible rather than silent." },
];

export function ensureStylesheet() {
  if (document.querySelector("link[data-qsar-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = STYLESHEET;
  link.dataset.qsarStyle = "true";
  document.head.appendChild(link);
}

export async function qsarView(root, section, params) {
  ensureStylesheet();
  const key = SECTIONS.some((s) => s.key === section) ? section : "models";
  const definition = SECTIONS.find((s) => s.key === key);
  root.innerHTML = `
    <div class="qs-head">
      <div>
        <div class="breadcrumbs"><a href="#/qsar/models">QSAR</a> › ${esc(definition.label)}</div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
    </div>
    <nav class="qs-tabs">
      ${SECTIONS.map((s) => `<a href="#/qsar/${s.key}" class="${s.key === key ? "active" : ""}">
        <span class="ico">${s.icon}</span>${esc(s.label)}</a>`).join("")}
    </nav>
    <div id="qs-body">${loading("Preparing…")}</div>`;
  const body = root.querySelector("#qs-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(`<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(error.message)}`, "danger", "⚠");
    console.error(error);
  }
}
