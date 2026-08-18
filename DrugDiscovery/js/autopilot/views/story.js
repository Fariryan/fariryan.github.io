/**
 * DISCOVERY STORY — the reconstruction, chapter by chapter.
 *
 * Empty chapters are shown as empty with their reason rather than dropped.
 * A story whose shape implies completeness it does not have is a worse
 * artefact than one that admits its gaps.
 */

import { card, esc, loading, notice } from "../../ui.js";
import { apApi } from "../api.js";
import { currentRun, needsRun } from "../router.js";

export async function storyView(host) {
  const runId = currentRun.get();
  if (!runId) {
    host.innerHTML = needsRun();
    return;
  }

  host.innerHTML = loading("Assembling the story…");
  let story;
  let contradictions;
  try {
    [story, contradictions] = await Promise.all([
      apApi.story(runId),
      apApi.contradictions(runId),
    ]);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = `
    <div class="ap-actions ap-story-actions">
      <button class="sm" id="ap-regen">Regenerate from current results</button>
      <button class="sm" id="ap-demo">Demo mode</button>
      <button class="sm" id="ap-pub">Publication data</button>
      <button class="sm" id="ap-reg">Regulatory evidence</button>
    </div>
    ${renderEvidenceKey(story.evidence_language)}
    <ol class="ap-chapters">
      ${story.chapters.map(renderChapter).join("")}
    </ol>
    ${renderContradictions(contradictions)}
    <p class="dim">${esc(story.note)}</p>
    <div id="ap-mode-output"></div>
  `;
  wire(host, runId);
}

function renderEvidenceKey(classes) {
  return `<details class="ap-evidence-key">
    <summary>How to read the evidence markers</summary>
    <ul>${classes
      .map(
        (c) =>
          `<li><span class="ap-badge ${esc(c.tone)}">${esc(
            c.label
          )}</span> ${esc(c.meaning)}</li>`
      )
      .join("")}</ul>
    <p class="dim">These are never rendered as equally certain.</p>
  </details>`;
}

function renderChapter(chapter) {
  if (chapter.is_empty) {
    return `<li class="ap-chapter empty">
      <div class="ap-chapter-num">${chapter.ordinal}</div>
      <div class="ap-chapter-body">
        <h3>${esc(chapter.title)}</h3>
        <p class="ap-empty-reason">${esc(chapter.empty_reason)}</p>
      </div>
    </li>`;
  }

  return `<li class="ap-chapter">
    <div class="ap-chapter-num">${chapter.ordinal}</div>
    <div class="ap-chapter-body">
      <h3>${esc(chapter.title)}</h3>
      <p class="ap-narrative">${esc(chapter.narrative)}</p>
      ${
        chapter.visuals?.length
          ? `<div class="ap-visuals">${chapter.visuals
              .map((v) => renderVisual(v))
              .join("")}</div>`
          : ""
      }
      ${
        chapter.sources?.length
          ? `<div class="dim ap-sources">From: ${chapter.sources
              .map((s) => `<code>${esc(s)}</code>`)
              .join(" ")}</div>`
          : ""
      }
    </div>
  </li>`;
}

function renderVisual(visual) {
  const data = visual.data;
  if (!data) return "";

  if (visual.kind === "compound_table" && Array.isArray(data) && data.length) {
    return `<table class="ap-table compact">
      <thead><tr><th>Compound</th><th>Class</th><th>SMILES</th></tr></thead>
      <tbody>${data
        .slice(0, 10)
        .map(
          (c) =>
            `<tr class="${c.is_withdrawn ? "withdrawn" : ""}">
              <td>${esc(c.name || "")}</td>
              <td>${esc(c.class || "")}</td>
              <td class="mono dim">${esc((c.smiles || "").slice(0, 40))}</td>
            </tr>`
        )
        .join("")}</tbody></table>`;
  }

  if (visual.kind === "property_table" && data && typeof data === "object") {
    const rows = Object.entries(data).filter(([, v]) => v && typeof v === "object");
    if (!rows.length) return "";
    return `<table class="ap-table compact">
      <thead><tr><th>Property</th><th>Value</th><th>Confidence</th></tr></thead>
      <tbody>${rows
        .slice(0, 14)
        .map(
          ([k, v]) =>
            `<tr><td>${esc(v.property_label || k)}</td>
             <td>${esc(String(v.value ?? "—"))} ${esc(v.units || "")}</td>
             <td class="dim">${esc(v.confidence || "")}</td></tr>`
        )
        .join("")}</tbody></table>`;
  }

  if (visual.kind === "failure_map" && data.modes) {
    const shown = data.modes.slice(0, 8);
    return `<table class="ap-table compact">
      <thead><tr><th>Failure mode</th><th>Severity</th></tr></thead>
      <tbody>${shown
        .map(
          (m) =>
            `<tr class="${m.is_assessed ? "" : "unassessed"}">
              <td>${esc(m.label)}</td>
              <td><span class="ap-pill ${
                m.severity === "high" ? "failed" : m.is_assessed ? "" : "skipped"
              }">${esc(m.severity.replace(/_/g, " "))}</span></td>
            </tr>`
        )
        .join("")}</tbody></table>`;
  }

  if (visual.kind === "next_actions" && Array.isArray(data) && data.length) {
    return `<ol class="ap-actions-list">${data
      .slice(0, 5)
      .map(
        (a) =>
          `<li><strong>${esc(a.proposal)}</strong>
           <div class="dim">${esc(a.rationale || "")}</div></li>`
      )
      .join("")}</ol>`;
  }

  return "";
}

function renderContradictions(payload) {
  return card(
    "Consensus and contradiction",
    `<div class="ap-two-col">
       <div>
         <div class="ap-field-label">Supporting (${payload.balance.supporting})</div>
         ${
           payload.consensus.length
             ? `<ul>${payload.consensus
                 .map(
                   (c) =>
                     `<li><span class="ap-badge ${esc(
                       c.evidence_class.toLowerCase()
                     )}">${esc(c.evidence_class)}</span> ${esc(c.claim)}</li>`
                 )
                 .join("")}</ul>`
             : `<p class="dim">Nothing recorded.</p>`
         }
       </div>
       <div>
         <div class="ap-field-label">Contradicting (${payload.balance.contradicting})</div>
         ${
           payload.contradictory.length
             ? `<ul>${payload.contradictory
                 .map(
                   (c) =>
                     `<li><span class="ap-badge ${esc(
                       (c.evidence_class || "").toLowerCase()
                     )}">${esc(c.kind.replace(/_/g, " "))}</span> ${esc(
                       c.detail || ""
                     )}</li>`
                 )
                 .join("")}</ul>`
             : `<p class="dim">Nothing recorded.</p>`
         }
       </div>
     </div>
     ${renderMethodComparison(payload.method_comparison)}
     <p class="dim">${esc(payload.note)}</p>
     <p class="dim">${esc(payload.limitation)}</p>`
  );
}

/**
 * Where two groups of studies differ methodologically. This is the panel that
 * turns "12 support, 4 contradict" into something a scientist can act on: not
 * a tiebreak, but the axis to go and check.
 */
function renderMethodComparison(comparison) {
  if (!comparison || comparison.available === false) {
    return `<p class="dim">${esc(
      comparison?.reason || "No study methods were compared."
    )}</p>`;
  }
  if (!comparison.comparable) {
    return `<p class="dim">${esc(comparison.reason || "")}</p>`;
  }

  const groups = comparison.grouping || {};
  return `<div class="ap-methods">
    <div class="ap-field-label">Why the studies disagree</div>
    <p class="dim">
      ${groups.reporting_an_effect?.length || 0} report an effect,
      ${groups.reporting_no_effect?.length || 0} report none,
      ${groups.direction_not_stated?.length || 0} do not state a direction.
      ${esc(comparison.grouping_note || "")}
    </p>

    ${
      comparison.differences?.length
        ? comparison.differences
            .map(
              (d) => `<div class="ap-method-diff">
                <div class="ap-method-axis">${esc(d.axis.replace(/_/g, " "))}</div>
                <div class="ap-method-groups">
                  <span><strong>reporting an effect:</strong> ${d.supporting
                    .map(esc)
                    .join(", ")}</span>
                  <span><strong>reporting none:</strong> ${d.contradicting
                    .map(esc)
                    .join(", ")}</span>
                </div>
                <p class="dim">${esc(d.consequence)}</p>
              </div>`
            )
            .join("")
        : `<p class="dim">No methodological difference could be established
             on the axes the abstracts state.</p>`
    }

    <p>${esc(comparison.interpretation || "")}</p>

    ${
      comparison.uncomparable_axes?.length
        ? `<details class="ap-method-uncomparable">
             <summary>${comparison.uncomparable_axes.length} axis(es) could not be compared</summary>
             <ul>${comparison.uncomparable_axes
               .map((u) => `<li><strong>${esc(u.axis)}</strong> — ${esc(u.reason)}</li>`)
               .join("")}</ul>
           </details>`
        : ""
    }
    <p class="dim">${esc(comparison.limitation || "")}</p>
  </div>`;
}

function wire(host, runId) {
  const output = host.querySelector("#ap-mode-output");

  host.querySelector("#ap-regen")?.addEventListener("click", async () => {
    await apApi.regenerateStory(runId);
    storyView(host);
  });

  const showMode = async (mode, title) => {
    output.innerHTML = loading(`Assembling ${title}…`);
    try {
      const payload = await apApi.output(runId, mode);
      output.innerHTML = card(
        title,
        `<pre class="ap-pre">${esc(
          JSON.stringify(payload, null, 1).slice(0, 20000)
        )}</pre>
         <p class="dim">All four modes read the same run state — there is no
           separate store for any of them, so they cannot disagree about what
           the run found.</p>`
      );
      output.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      output.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  };

  host.querySelector("#ap-demo")?.addEventListener("click", () =>
    showMode("demo", "Demo mode — presentation sequence")
  );
  host.querySelector("#ap-pub")?.addEventListener("click", () =>
    showMode("publication", "Publication handoff — structured data, no images")
  );
  host.querySelector("#ap-reg")?.addEventListener("click", () =>
    showMode("regulatory", "Regulatory evidence — with gaps stated")
  );
}
