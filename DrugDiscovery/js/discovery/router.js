/**
 * Molecular Discovery Lab shell.
 *
 * A separate workspace from the preclinical laboratory, and connected to it by
 * one explicit contract rather than by shared code. This one asks *what should
 * we investigate next, and why*; the preclinical laboratory answers *what does
 * this molecule do*.
 *
 * The campaign bar is always present, because every section here is a view of
 * one campaign. Sections whose backend is not built yet say so rather than
 * rendering an empty panel — an empty panel reads as "no results", which is a
 * scientific claim this workspace has not earned.
 */

import { esc, loading, notice } from "../ui.js";
import { activeCampaign, discApi } from "./api.js";

/**
 * Load this workspace's stylesheets on demand.
 *
 * `lab.css` comes first because the discovery views reuse Discovery Lab's
 * primitives — cards, notes, chips — exactly as the preclinical views do.
 * Restating those rules here would let the three drift apart.
 */
function ensureStylesheet() {
  for (const [href, marker] of [
    ["css/lab.css", "labStyle"],
    ["css/discovery.css", "discoveryStyle"],
  ]) {
    const attribute = marker.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    if (document.querySelector(`link[data-${attribute}]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset[marker] = "true";
    document.head.appendChild(link);
  }
}

export const SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    module: () => import("./views/overview.js"),
    view: "overviewView",
    lede: "Where this campaign stands: current hypothesis, main uncertainty, and what it recommends doing next.",
  },
  {
    key: "campaigns",
    label: "Campaigns",
    module: () => import("./views/campaigns.js"),
    view: "campaignsView",
    lede: "Persistent research programmes. A campaign keeps its whole history, including what failed.",
  },
  {
    key: "disease",
    label: "Disease Intelligence",
    module: () => import("./views/disease.js"),
    view: "diseaseView",
    lede: "Real literature retrieved from Europe PMC, read into structured claims that stay attached to their sources.",
  },
  {
    key: "hypotheses",
    label: "Hypothesis Lab",
    module: () => import("./views/hypotheses.js"),
    view: "hypothesesView",
    lede: "Mechanistic proposals with the evidence for and against them, each independently criticised.",
  },
  {
    key: "memory",
    label: "Research Memory",
    module: () => import("./views/memory.js"),
    view: "memoryView",
    lede: "The campaign's recorded history and every reasoning call it made, including the ones that failed.",
  },
  // Declared, not yet built. Listed because the shape of the programme is
  // itself information, and marked so nobody mistakes an unbuilt stage for an
  // empty result.
  { key: "graph", label: "Evidence Graph", pending: "the claim-to-graph projection and its provenance layer" },
  { key: "targets", label: "Target Discovery", pending: "the target dossier adapters (Open Targets, DepMap, UniProt tractability)" },
  { key: "chemistry", label: "Chemical Space", pending: "known-chemistry retrieval, embedding and the 3D chemical-space view" },
  { key: "design", label: "Candidate Design", pending: "the controlled transformation engine and candidate lineage" },
  { key: "optimization", label: "Optimization", pending: "the ML prediction registry, Pareto ranking and active learning" },
  { key: "comparisons", label: "Comparisons", pending: "the candidate comparison lab and the preclinical bridge" },
];

const DEFAULT_SECTION = "overview";

export async function discoveryView(root, section, params) {
  ensureStylesheet();
  const key = section || DEFAULT_SECTION;
  const entry = SECTIONS.find((s) => s.key === key) || SECTIONS[0];

  root.innerHTML = `
    <div class="disc-shell">
      <div class="disc-head">
        <div>
          <div class="disc-eyebrow">Molecular Discovery Lab</div>
          <h2>${esc(entry.label)}</h2>
          <p class="disc-lede">${esc(entry.lede || "")}</p>
        </div>
        <div id="disc-ai" class="disc-ai"></div>
      </div>
      <div id="disc-campaign-bar" class="disc-campaign-bar"></div>
      <nav class="disc-tabs" id="disc-tabs">
        ${SECTIONS.map(
          (s) => `<a class="disc-tab ${s.key === entry.key ? "active" : ""}
                       ${s.pending ? "pending" : ""}"
                     href="#/discovery/${s.key}">${esc(s.label)}</a>`
        ).join("")}
      </nav>
      <div id="disc-body">${loading()}</div>
    </div>`;

  renderCampaignBar(root);
  renderAiStatus(root);

  const body = root.querySelector("#disc-body");

  if (entry.pending) {
    body.innerHTML = notice(
      `<strong>NOT YET IMPLEMENTED.</strong><br />
       This section needs ${esc(entry.pending)}. It is listed here because the
       shape of the research programme is information — but it holds no data,
       and an empty panel would read as "nothing found", which is a different
       claim entirely.`,
      "muted",
      "◌"
    );
    return;
  }

  try {
    const module = await entry.module();
    await module[entry.view](body, params);
  } catch (error) {
    body.innerHTML = notice(
      `<strong>This section could not load.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
  }
}

/** The campaign every section is a view of. */
function renderCampaignBar(root) {
  const host = root.querySelector("#disc-campaign-bar");
  const current = activeCampaign.get();

  if (!current) {
    host.innerHTML = `
      <span class="dim small">No campaign selected.</span>
      <a class="sm" href="#/discovery/campaigns">Choose or create one →</a>`;
    return;
  }

  host.innerHTML = `
    <span class="disc-campaign-code">${esc(current.code)}</span>
    <span class="disc-campaign-title">${esc(current.title || "")}</span>
    <span class="spacer"></span>
    <a class="sm" href="#/discovery/campaigns">Switch campaign</a>`;
}

/**
 * The reasoning gateway's own report of itself.
 *
 * Deliberately small and out of the way. It matters when it is offline — and
 * when it is, it says which parts of the platform are unaffected, because the
 * chemistry and simulation engines do not depend on it.
 */
async function renderAiStatus(root) {
  const host = root.querySelector("#disc-ai");
  host.innerHTML = `<span class="dim small">checking reasoning service…</span>`;

  try {
    const status = await discApi.aiStatus();
    if (!status.online) {
      host.innerHTML = `
        <div class="disc-ai-card offline">
          <strong>RONEU reasoning service unavailable</strong>
          <div class="small dim">${esc(status.detail || "")}</div>
        </div>`;
      return;
    }
    host.innerHTML = `
      <div class="disc-ai-card">
        <div class="row">
          <span class="disc-dot online"></span>
          <strong>RONEU gateway online</strong>
        </div>
        <dl class="disc-ai-models">
          <dt>Text</dt><dd>${esc(status.text_model || "not reported")}</dd>
          <dt>Vision</dt><dd>${esc(status.vision_model || "not reported")}</dd>
          <dt>vLLM</dt><dd>${status.vllm_available
            ? esc(status.vllm_models.join(", "))
            : "not serving"}</dd>
        </dl>
      </div>`;
  } catch (error) {
    host.innerHTML = `
      <div class="disc-ai-card offline">
        <strong>Reasoning service unreachable</strong>
        <div class="small dim">${esc(error.message)}</div>
      </div>`;
  }
}
