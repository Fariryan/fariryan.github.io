/**
 * The liability map.
 *
 * Safety and developability concerns, sorted by severity — but with three
 * categories kept visually distinct, because collapsing them is how a
 * liability review goes wrong:
 *
 *   **Flagged** — a model or rule says there is a problem here.
 *   **Clear** — a model looked and found nothing. Absence of a *known* alert.
 *   **Not assessed** — no model exists. Nothing looked at all.
 *
 * The third is the one that gets lost. A liability map that omits unmodelled
 * endpoints reads as a clean bill of health, and hepatotoxicity being absent
 * from the list is very different from hepatotoxicity being predicted low.
 */

import { esc, loading, notice } from "../../ui.js";
import { propApi } from "../api.js";
import { needsStructure, structure } from "../router.js";
import { bandPill, confidenceChip, whyPanel } from "../ui.js";

//: Properties that constitute a liability review, in the order a reviewer
//: would work through them.
const LIABILITY_PROPERTIES = [
  "herg",
  "ames",
  "reactive_metabolite",
  "assay_interference",
  "hepatotoxicity",
  "mitochondrial_toxicity",
  "cytotoxicity",
  "genotoxicity_invitro",
  "pgp_substrate",
  "cyp_inhibition",
  "cyp_substrate",
  "cyp_induction",
];

const SEVERITY_RANK = { high: 0, moderate: 1, low: 2, "no alert": 3 };

export async function liabilitiesView(root) {
  const smiles = structure.get();
  if (!smiles) {
    root.innerHTML = needsStructure();
    return;
  }

  root.innerHTML = loading("Assessing liabilities…");

  let profile;
  try {
    profile = await propApi.profile(smiles, false);
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const predictions = profile.predictions || {};
  const flagged = [];
  const clear = [];
  const unassessed = [];

  for (const key of LIABILITY_PROPERTIES) {
    const entry = predictions[key];
    if (!entry) continue;
    if (!entry.is_prediction) {
      unassessed.push(entry);
      continue;
    }
    const band = String(entry.value ?? "").toLowerCase();
    if (band === "high" || band === "moderate") flagged.push(entry);
    else clear.push(entry);
  }

  flagged.sort(
    (a, b) =>
      (SEVERITY_RANK[String(a.value).toLowerCase()] ?? 9) -
      (SEVERITY_RANK[String(b.value).toLowerCase()] ?? 9)
  );

  root.innerHTML = `
    <div class="pi-liability-summary">
      <div class="pi-liability-count flagged">
        <div class="value">${flagged.length}</div><div class="label">flagged</div>
      </div>
      <div class="pi-liability-count clear">
        <div class="value">${clear.length}</div><div class="label">no alert found</div>
      </div>
      <div class="pi-liability-count unassessed">
        <div class="value">${unassessed.length}</div><div class="label">not assessed</div>
      </div>
    </div>

    <div class="pi-caveat">
      These three are different statements. "No alert found" means a model
      looked and found nothing known — it is not a clean bill of health.
      "Not assessed" means no model exists for that endpoint and nothing
      looked at all.
    </div>

    ${section("Flagged", flagged, "flagged", (entry) => `
      <div class="pi-liability flagged">
        <div class="pi-liability-head">
          ${bandPill(entry.value)}
          <span class="pi-prop">${esc(entry.property_label)}</span>
          ${confidenceChip(entry.confidence, entry.confidence_description)}
        </div>
        ${
          entry.drivers?.matched_toxicophores?.length
            ? `<div class="pi-liability-detail">Matched: ${entry.drivers.matched_toxicophores
                .map((m) => esc(m.toxicophore))
                .join(", ")}</div>`
            : ""
        }
        ${
          entry.drivers?.matched_motifs?.length
            ? `<div class="pi-liability-detail">Matched: ${entry.drivers.matched_motifs
                .map((m) => esc(m.motif))
                .join(", ")}</div>`
            : ""
        }
        ${whyPanel(entry)}
      </div>`)}

    ${section("No alert found", clear, "clear", (entry) => `
      <div class="pi-liability clear">
        <div class="pi-liability-head">
          ${bandPill(entry.value)}
          <span class="pi-prop">${esc(entry.property_label)}</span>
          ${confidenceChip(entry.confidence, entry.confidence_description)}
        </div>
        ${whyPanel(entry)}
      </div>`)}

    ${section("Not assessed — no model installed", unassessed, "unassessed", (entry) => `
      <div class="pi-liability unassessed">
        <div class="pi-liability-head">
          <span class="pi-nomodel">no model</span>
          <span class="pi-prop">${esc(entry.property_label)}</span>
        </div>
        <div class="pi-liability-detail">${esc(entry.reason)}</div>
        ${
          entry.remedy
            ? `<div class="dim small"><strong>What would enable it:</strong>
               ${esc(entry.remedy)}</div>`
            : ""
        }
      </div>`)}
  `;
}

function section(title, entries, tone, render) {
  if (!entries.length) return "";
  return `
    <section class="card pi-liability-section ${tone}">
      <h3>${esc(title)} <span class="n">${entries.length}</span></h3>
      ${entries.map(render).join("")}
    </section>`;
}
