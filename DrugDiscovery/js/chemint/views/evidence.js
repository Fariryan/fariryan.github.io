/**
 * Claims and their evidence.
 *
 * Supporting and contradicting evidence are shown side by side, at the same
 * visual weight, because a claim that two groups disagree about is more
 * informative than one nobody has checked — and a fabric that only displays
 * agreement cannot tell its reader when it is wrong.
 *
 * The evidence-class filter defaults to excluding inferred and hypothesised
 * claims. They are propositions, not findings, and mixing them into a
 * pharmacology list by default is exactly the confusion the whole evidence
 * partition exists to prevent. Turning them on is one click and is labelled.
 */

import { esc, loading, notice } from "../../ui.js";
import { chemApi } from "../api.js";
import { needsSubject, subject, vocabulary } from "../router.js";
import { caveat, classBadge, provenanceCard } from "../ui.js";

export async function evidenceView(root, params) {
  const entityId = params?.get("entity") || subject.get()?.entity_id;
  if (!entityId) {
    root.innerHTML = await overview(root);
    return;
  }

  root.innerHTML = loading("Loading claims…");

  let includeInferred = false;

  async function render() {
    root.innerHTML = loading("Loading claims…");
    let payload;
    try {
      payload = await chemApi.claims(Number(entityId), {
        include_inferred: includeInferred,
        limit: 200,
      });
    } catch (error) {
      root.innerHTML = notice(esc(error.message), "danger", "⚠");
      return;
    }

    root.innerHTML = `
      <div class="ci-ev-controls">
        <div>
          <strong>${payload.total}</strong> claim${payload.total === 1 ? "" : "s"}
          ${
            payload.disputed
              ? ` · <span class="ci-disputed">${payload.disputed} disputed</span>`
              : ""
          }
        </div>
        <div class="spacer"></div>
        <label class="ci-toggle">
          <input type="checkbox" id="ci-inferred" ${
            includeInferred ? "checked" : ""
          } />
          Include inferred and hypothesised claims
        </label>
      </div>
      ${caveat(payload.note)}
      <div id="ci-ev-list"></div>`;

    root.querySelector("#ci-inferred").addEventListener("change", (event) => {
      includeInferred = event.target.checked;
      render();
    });

    const host = root.querySelector("#ci-ev-list");
    if (!payload.claims.length) {
      host.innerHTML = `<div class="ci-empty small"><div class="big">◌</div>
        <p>No claims recorded for this substance yet.</p></div>`;
      return;
    }

    // Disputed first: a disagreement is the most informative thing here.
    const ordered = [...payload.claims].sort(
      (a, b) =>
        b.contradict_count - a.contradict_count ||
        b.support_count - a.support_count
    );

    host.innerHTML = ordered.map(claimCard).join("");
  }

  await render();
}

function claimCard(claim) {
  const both = claim.evidence;
  return `
    <section class="card ci-claim-card ${
      claim.status === "DISPUTED" ? "disputed" : ""
    }">
      <div class="ci-claim-head">
        <span class="ci-claim-type">${esc(claim.claim_type)}</span>
        ${classBadge(claim.evidence_class)}
        ${
          claim.status === "DISPUTED"
            ? '<span class="ci-disputed">disputed</span>'
            : ""
        }
        <span class="spacer"></span>
        ${
          claim.confidence !== null && claim.confidence !== undefined
            ? `<span class="dim small" title="${esc(
                claim.confidence_basis || "source-supplied score"
              )}">score ${Number(claim.confidence).toFixed(3)}</span>`
            : ""
        }
      </div>

      <p class="ci-claim-statement">${esc(claim.statement)}</p>

      <div class="ci-claim-subjects">
        ${
          claim.subject
            ? `<a href="#/chemint/molecule?entity=${claim.subject.id}">${esc(
                claim.subject.name
              )}</a>`
            : ""
        }
        ${claim.object ? `<span class="arrow">→</span> ${esc(claim.object.name)}` : ""}
        ${
          claim.context
            ? `<span class="dim small"> in ${esc(
                claim.context.name.slice(0, 90)
              )}</span>`
            : ""
        }
      </div>

      <div class="ci-claim-conditions">
        ${[
          claim.conditions.species && `species: ${claim.conditions.species}`,
          claim.conditions.tissue && `tissue: ${claim.conditions.tissue}`,
          claim.conditions.cell && `cell: ${claim.conditions.cell}`,
          claim.conditions.method && `method: ${claim.conditions.method}`,
          claim.conditions.dose &&
            `dose: ${claim.conditions.dose.value} ${claim.conditions.dose.units || ""}`,
          claim.conditions.concentration &&
            `concentration: ${claim.conditions.concentration.value} ${
              claim.conditions.concentration.units || ""
            }`,
          claim.measurement &&
            `${claim.measurement.type} ${claim.measurement.relation || ""}${
              claim.measurement.value
            } ${claim.measurement.units || ""}`,
          claim.publication_date && `published ${claim.publication_date}`,
        ]
          .filter(Boolean)
          .map((bit) => `<span>${esc(bit)}</span>`)
          .join("") || '<span class="dim">no conditions recorded</span>'}
      </div>

      <div class="ci-evidence-columns">
        ${evidenceColumn("Supporting", both.supporting, "support")}
        ${evidenceColumn("Contradicting", both.contradicting, "contradict")}
        ${
          both.contextualising.length
            ? evidenceColumn(
                "Contextualising",
                both.contextualising,
                "context",
                "Neither supports nor refutes — it bounds when the claim holds."
              )
            : ""
        }
      </div>
    </section>`;
}

function evidenceColumn(title, rows, tone, note = "") {
  return `
    <div class="ci-evidence-col ci-evidence-${tone}">
      <h4>${esc(title)} <span class="n">${rows.length}</span></h4>
      ${note ? `<div class="dim small">${esc(note)}</div>` : ""}
      ${
        rows.length
          ? rows
              .map(
                (row) => `
            <div class="ci-evidence-row ${row.counted ? "" : "uncounted"}">
              ${classBadge(row.evidence_class)}
              ${
                row.counted
                  ? ""
                  : `<span class="ci-uncounted" title="${esc(
                      "An inferred statement is recorded so it is visible, " +
                        "and is never counted as evidence."
                    )}">not counted</span>`
              }
              ${row.note ? `<div class="meta">${esc(row.note)}</div>` : ""}
              ${
                row.excerpt
                  ? `<blockquote>${esc(row.excerpt.slice(0, 300))}</blockquote>`
                  : ""
              }
              ${row.source ? provenanceCard(row.source) : ""}
            </div>`
              )
              .join("")
          : `<div class="dim small">${
              tone === "contradict"
                ? "Nothing contradicts this claim in the fabric. That is not " +
                  "the same as nobody having tried."
                : "None recorded."
            }</div>`
      }
    </div>`;
}

/** With no molecule selected, explain the vocabulary the section runs on. */
async function overview() {
  const vocab = await vocabulary();
  return `
    ${needsSubject("the evidence view")}
    <section class="card">
      <h3>How evidence is classified here</h3>
      <p class="lede">
        The atlas already grades how <em>strong</em> a statement is. This
        section answers a prior and different question: what kind of process
        produced it. Those are not the same axis, and collapsing them is how a
        prediction ends up cited as a fact.
      </p>
      <table class="ci-table">
        <thead><tr>
          <th>Class</th><th>Means</th><th>May be called fact</th>
          <th>Counts as evidence</th>
        </tr></thead>
        <tbody>
          ${vocab.evidence_classes
            .map(
              (entry) => `
            <tr>
              <td>${classBadge(entry)}</td>
              <td>${esc(entry.description)}</td>
              <td>${entry.factual ? "yes" : "no"}</td>
              <td>${entry.counts_as_evidence ? "yes" : "no"}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      ${caveat(
        "A language model's output is recorded so it is visible, and is " +
          "never counted as evidence for or against anything. A model " +
          "agreeing with a hypothesis is the same opinion restated, not a " +
          "second one."
      )}
    </section>`;
}
