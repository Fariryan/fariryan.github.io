/**
 * Enterprise shell.
 *
 * The same additive pattern as every other section: one entry point, the
 * stylesheet injected here rather than linked from index.html, its own hash
 * namespace.
 */

import { esc, loading, notice } from "../ui.js";

export const SECTIONS = [
  {
    key: "portfolio",
    label: "Portfolio",
    icon: "▤",
    module: () => import("./views/portfolio.js"),
    view: "portfolioView",
    lede:
      "Programmes, candidate funnels, liabilities and outstanding experiments. Scientific uncertainty is shown, not summarised away.",
  },
  {
    key: "evidence",
    label: "Evidence Chain",
    icon: "⛓",
    module: () => import("./views/evidence.js"),
    view: "evidenceView",
    lede:
      "Walk backwards from a decision to the source underneath it, through every candidate, prediction, model and dataset in between.",
  },
  {
    key: "models",
    label: "Model Registry",
    icon: "◈",
    module: () => import("./views/models.js"),
    view: "modelsView",
    lede:
      "Every registered model, its lifecycle state, and what it was measured on. Nothing reaches 'validated' without a person and a measurement.",
  },
  {
    key: "validation",
    label: "Validation",
    icon: "⊹",
    module: () => import("./views/validation.js"),
    view: "validationView",
    lede:
      "Accuracy, calibration, drift and out-of-domain rates computed from predictions this platform actually made and results that came back.",
  },
  {
    key: "compute",
    label: "Compute & Runs",
    icon: "⚙",
    module: () => import("./views/compute.js"),
    view: "computeView",
    lede:
      "Background jobs and reproducible runs. Closing this tab does not stop anything, and a run can be reopened or re-run with one parameter changed.",
  },
  {
    key: "governance",
    label: "Governance",
    icon: "⚖",
    module: () => import("./views/governance.js"),
    view: "governanceView",
    lede:
      "Regulatory-ready evidence infrastructure, security posture and the audit log — including what this platform does not claim.",
  },
];

const STYLESHEET = "css/enterprise.css";

function ensureStylesheet() {
  if (document.querySelector("link[data-enterprise-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.enterpriseStyle = "true";
  document.head.appendChild(link);
}

export async function enterpriseView(root, section, params) {
  ensureStylesheet();

  const key = SECTIONS.some((s) => s.key === section) ? section : "portfolio";
  const definition = SECTIONS.find((s) => s.key === key);

  root.innerHTML = `
    <div class="ent-head">
      <div>
        <div class="breadcrumbs">
          <a href="#/enterprise/portfolio">Enterprise</a> › ${esc(definition.label)}
        </div>
        <h2>${esc(definition.label)}</h2>
        <p class="lede">${esc(definition.lede)}</p>
      </div>
      <div class="spacer"></div>
      <div id="ent-identity"></div>
    </div>
    <nav class="ent-tabs">
      ${SECTIONS.map(
        (s) => `<a href="#/enterprise/${s.key}" data-section="${s.key}"
          class="${s.key === key ? "active" : ""}">
          <span class="ico">${s.icon}</span>${esc(s.label)}</a>`
      ).join("")}
    </nav>
    <div id="ent-body">${loading("Preparing…")}</div>
    <div class="disclaimer">
      <strong>This layer adds governance, not certainty.</strong>
      Every scientific value shown here comes from the same engines as before
      and carries the same uncertainty. The enterprise layer records who
      produced it, with which model version, on what data — it does not make
      any prediction more reliable. Research and education only; not medical
      advice, and not a claim of regulatory compliance.
    </div>
  `;

  renderIdentity(root.querySelector("#ent-identity"));

  const body = root.querySelector("#ent-body");
  try {
    const module = await definition.module();
    await module[definition.view](body, params);
  } catch (error) {
    body.innerHTML = notice(
      `<strong>${esc(definition.label)} could not be loaded.</strong><br />${esc(
        error.message
      )}`,
      "danger",
      "⚠"
    );
    console.error(error);
  }
}

async function renderIdentity(host) {
  if (!host) return;
  const { entApi } = await import("./api.js");
  try {
    const me = await entApi.me();
    host.innerHTML = `
      <div class="ent-identity">
        <div class="who">
          <div class="name mono">${esc(me.subject)}</div>
          <div class="sub">${esc(me.role)} · org ${me.org_id} · ${esc(
      me.auth_method
    )}</div>
        </div>
      </div>`;
  } catch (error) {
    host.innerHTML = `
      <div class="ent-identity warn">
        <div class="who">
          <div class="name dim">Not authenticated</div>
          <div class="sub">${esc(error.message).slice(0, 90)}</div>
        </div>
      </div>`;
  }
}
