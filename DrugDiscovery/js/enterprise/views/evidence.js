/**
 * SHOW ME THE EVIDENCE CHAIN.
 *
 * Renders the walk backwards from a decision to the sources under it. Two
 * things are given as much weight as the chain itself: whether it actually
 * reaches a measurement or a document, and whether any claimed link is
 * missing. A chain that is inference all the way down looks, at a glance,
 * exactly like one grounded in experiment — so this page refuses to let it.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { entApi } from "../api.js";

export async function evidenceView(host) {
  host.innerHTML = `
    <form class="ent-form ent-chain-form" id="ent-chain">
      <div class="ent-form-row">
        <label>Subject type
          <select name="type">
            <option value="decision">decision</option>
            <option value="candidate">candidate</option>
            <option value="experiment">experiment</option>
            <option value="result">result</option>
            <option value="series">series</option>
            <option value="model">model</option>
            <option value="dataset">dataset</option>
          </select>
        </label>
        <label>Identifier
          <input name="id" type="text" required placeholder="e.g. CAND-20260818-A1B2C3" />
        </label>
      </div>
      <button type="submit" class="primary">Show me the evidence chain</button>
    </form>
    <div id="ent-ledger-state"></div>
    <div id="ent-chain-result"></div>
  `;

  await renderLedgerState(host.querySelector("#ent-ledger-state"));

  const form = host.querySelector("#ent-chain");
  const result = host.querySelector("#ent-chain-result");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    result.innerHTML = loading("Walking the chain…");
    try {
      const chain = await entApi.evidenceChain(data.get("type"), data.get("id"));
      result.innerHTML = renderChain(chain);
    } catch (error) {
      result.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

async function renderLedgerState(host) {
  try {
    const [head, verification] = await Promise.all([
      entApi.ledger(),
      entApi.verifyLedger(),
    ]);
    host.innerHTML = card(
      "Ledger integrity",
      `<div class="ent-stats small">
         <div><span class="v">${head.entries}</span><span class="l">entries</span></div>
         <div><span class="v">${head.sequence}</span><span class="l">head sequence</span></div>
       </div>
       <p class="mono dim">head ${esc((head.head_hash || "").slice(0, 32))}…</p>
       ${
         verification.intact
           ? notice(
               `The hash chain verifies across ${verification.entries} entries.`,
               "ok",
               "✓"
             )
           : notice(
               `<strong>The chain is broken at sequence ${esc(
                 String(verification.broken_at_sequence)
               )}</strong> — ${esc(verification.what_failed || "")}. ${esc(
                 verification.interpretation || ""
               )}`,
               "danger",
               "⚠"
             )
       }
       <p class="dim">${esc(verification.scope_note || "")}</p>`
    );
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "warn", "⚠");
  }
}

function renderChain(chain) {
  if (!chain.found) {
    return notice(esc(chain.note), "warn", "◌");
  }

  const completeness = {
    complete: ["ok", "✓", "This chain reaches a measurement or source document."],
    partial: [
      "warn",
      "⚠",
      "This chain reaches evidence, but some claimed links are not recorded.",
    ],
    ungrounded: [
      "danger",
      "⚠",
      "This chain reaches no measurement and no source document. It is " +
        "inference all the way down — worth knowing before relying on it.",
    ],
  }[chain.completeness] || ["warn", "⚠", ""];

  const nodes = chain.nodes
    .slice()
    .reverse()
    .map(
      (n, index) => `
      <li class="ent-chain-node ${grounding(n.entry_type)}">
        <div class="ent-chain-step">${index === 0 ? "start" : "↓"}</div>
        <div class="ent-chain-body">
          <div class="ent-chain-head">
            <span class="ent-badge ${grounding(n.entry_type)}">${esc(
        n.entry_type.replace(/_/g, " ")
      )}</span>
            <span class="mono">${esc(n.subject_type)}:${esc(n.subject_id)}</span>
            <span class="spacer"></span>
            <span class="dim">seq ${n.sequence}</span>
          </div>
          <p>${esc(n.summary)}</p>
          <div class="dim">${esc(n.actor || "unattributed")} · ${esc(
        n.recorded_at || ""
      )}</div>
          <div class="mono dim ent-hash">${esc(n.entry_hash.slice(0, 24))}…</div>
        </div>
      </li>`
    )
    .join("");

  return `
    ${notice(esc(completeness[2]), completeness[0], completeness[1])}
    ${card(
      `Evidence chain for ${esc(chain.subject.type)} ${esc(chain.subject.id)}`,
      `<ol class="ent-chain">${nodes}</ol>
       <p class="dim">${esc(chain.note)}</p>`
    )}
    ${
      chain.dangling_references?.length
        ? card(
            `${chain.dangling_references.length} missing link(s)`,
            `<ul>${chain.dangling_references
              .map(
                (d) =>
                  `<li><span class="mono">${esc(d.from.type)}:${esc(
                    d.from.id
                  )}</span> claims <span class="mono">${esc(
                    d.missing.type
                  )}:${esc(d.missing.id)}</span>, which the ledger does not
                   contain. <span class="dim">${esc(
                     d.why_it_matters
                   )}</span></li>`
              )
              .join("")}</ul>`
          )
        : ""
    }
    ${
      chain.grounded_in?.length
        ? card(
            "Grounded in",
            `<ul>${chain.grounded_in
              .map(
                (g) =>
                  `<li><span class="ent-badge grounded">${esc(
                    g.entry_type.replace(/_/g, " ")
                  )}</span> <span class="mono">${esc(g.subject_id)}</span> —
                   ${esc(g.summary)}</li>`
              )
              .join("")}</ul>`
          )
        : ""
    }
  `;
}

const GROUNDING = new Set([
  "experimental_result",
  "literature_evidence",
  "curated_database",
  "dataset_registered",
  "measurement",
]);

function grounding(entryType) {
  return GROUNDING.has(entryType) ? "grounded" : "derived";
}
