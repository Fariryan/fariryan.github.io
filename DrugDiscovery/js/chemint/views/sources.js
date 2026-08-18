/**
 * Sources, coverage, ingestion queue and data quality.
 *
 * This page exists to make the fabric's boundary legible. Three distinctions
 * that a coverage table normally blurs are kept sharp here:
 *
 *   - a source that is **ingested** versus one that is merely **supported**;
 *   - a source that is **absent** versus one that is **not licensed** —
 *     "no data" and "we may not redistribute this" are entirely different
 *     statements and a reader comparing platforms deserves both;
 *   - a data-quality finding that has been **recorded** versus one that has
 *     been **fixed**. Nothing here is silently fixed.
 */

import { esc, loading, notice, tabs } from "../../ui.js";
import { chemApi } from "../api.js";
import { caveat, coverageNote } from "../ui.js";

export async function sourcesView(root) {
  root.innerHTML = loading("Loading sources…");

  const [sources, status] = await Promise.all([
    chemApi.sources(),
    chemApi.status().catch(() => null),
  ]);

  root.innerHTML = `
    ${coverageNote(sources.coverage)}
    <div id="ci-src-tabs"></div>`;

  tabs(
    root.querySelector("#ci-src-tabs"),
    [
      { label: "Open sources", count: sources.open.length },
      { label: "Licence-gated", count: sources.licensed.length },
      { label: "Planned", count: sources.planned.length },
      { label: "Ingestion queue" },
      { label: "Data quality" },
    ],
    async (tab, panel) => {
      switch (tab.label) {
        case "Open sources":
          panel.innerHTML = openTable(sources.open, sources.adapters);
          break;
        case "Licensed":
        case "Licence-gated":
          panel.innerHTML = licensedTable(sources.licensed);
          break;
        case "Planned":
          panel.innerHTML = plannedTable(sources.planned);
          break;
        case "Ingestion queue":
          panel.innerHTML = loading("Loading the queue…");
          panel.innerHTML = queueBlock(await chemApi.queue());
          break;
        case "Data quality":
          panel.innerHTML = loading("Loading findings…");
          panel.innerHTML = qualityBlock(await chemApi.quality());
          break;
      }
    }
  );
}

function openTable(rows, adapters) {
  const byKey = Object.fromEntries((adapters || []).map((a) => [a.source, a]));
  return `
    <table class="ci-table">
      <thead><tr>
        <th>Source</th><th>Provides</th><th>Licence</th>
        <th>Refresh strategy</th><th>Release</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>
              <a href="${esc(row.homepage)}" target="_blank" rel="noopener">
                <strong>${esc(row.name)}</strong></a>
              <div class="dim small">${esc(row.description || "")}</div>
              ${
                byKey[row.key]
                  ? `<div class="dim small">tasks: ${esc(
                      (byKey[row.key].tasks || []).join(", ")
                    )} · ${row.requests_per_second}/s</div>`
                  : ""
              }
            </td>
            <td>${(row.provides || [])
              .map((p) => `<span class="ci-chip small">${esc(p)}</span>`)
              .join("")}</td>
            <td>
              ${esc(row.license_name || "—")}
              ${
                row.license_url
                  ? `<div><a href="${esc(
                      row.license_url
                    )}" target="_blank" rel="noopener" class="small">terms ↗</a></div>`
                  : ""
              }
            </td>
            <td class="dim small">${esc(row.refresh_strategy || "—")}</td>
            <td class="mono small">${esc(row.current_version || "—")}
              ${
                row.last_refreshed_at
                  ? `<div class="dim">${esc(
                      row.last_refreshed_at.slice(0, 10)
                    )}</div>`
                  : ""
              }</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function licensedTable(rows) {
  return `
    ${caveat(
      "These sources are useful and are deliberately not fetched without a " +
        "licence. A connector interface exists for each; none of them scrape, " +
        "mirror, or work around access control. Configuring one is an " +
        "operator decision about terms they are entitled to accept."
    )}
    <div class="ci-licensed">
      ${rows
        .map(
          (row) => `
        <section class="card ci-licensed-card ${
          row.available ? "available" : "gated"
        }">
          <h3>
            <a href="${esc(row.homepage)}" target="_blank" rel="noopener">${esc(
            row.name
          )}</a>
            <span class="spacer"></span>
            <span class="ci-gate ${row.available ? "on" : "off"}">
              ${row.available ? "configured" : "not configured"}
            </span>
          </h3>
          <p>${esc(row.description || "")}</p>
          <div class="ci-field-row">
            <strong>Licence</strong>
            <span>${esc(row.license_name || "—")}
              ${
                row.license_url
                  ? `<a href="${esc(
                      row.license_url
                    )}" target="_blank" rel="noopener">terms ↗</a>`
                  : ""
              }</span>
          </div>
          <div class="ci-field-row">
            <strong>Would provide</strong>
            <span>${(row.provides || [])
              .map((p) => `<span class="ci-chip small">${esc(p)}</span>`)
              .join("")}</span>
          </div>
          ${
            row.unavailable_reason
              ? `<div class="ci-gate-reason">${esc(row.unavailable_reason)}</div>`
              : ""
          }
          <div class="dim small">${esc(row.attribution_note || "")}</div>
        </section>`
        )
        .join("")}
    </div>`;
}

function plannedTable(rows) {
  return `
    ${caveat(
      "Declared so the boundary of coverage is visible. A source listed here " +
        "has no adapter yet, which is a different statement from a source " +
        "that has one and found nothing."
    )}
    <table class="ci-table">
      <thead><tr><th>Source</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td><strong>${esc(row.name)}</strong></td>
            <td>${esc(row.status)}</td>
            <td class="dim small">${esc(row.note)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function queueBlock(payload) {
  const counts = payload.counts || {};
  return `
    <div class="ci-stat-row">
      ${["queued", "running", "succeeded", "failed", "skipped"]
        .map(
          (state) => `<div class="ci-stat">
            <div class="value">${Number(counts[state] || 0).toLocaleString()}</div>
            <div class="label">${esc(state)}</div>
          </div>`
        )
        .join("")}
    </div>
    <div class="ci-queue-state">
      Background worker: <strong>${
        payload.worker_running ? "running" : "stopped"
      }</strong> ·
      Ingestion: <strong>${
        payload.ingestion_enabled ? "enabled" : "disabled"
      }</strong>
    </div>
    ${
      payload.running?.length
        ? `<h4 class="ci-sub">Running now</h4>
           <table class="ci-table compact">
             <thead><tr><th>Source</th><th>Task</th><th>Argument</th></tr></thead>
             <tbody>${payload.running
               .map(
                 (job) =>
                   `<tr><td>${esc(job.source)}</td><td>${esc(
                     job.task
                   )}</td><td class="mono">${esc(job.argument)}</td></tr>`
               )
               .join("")}</tbody>
           </table>`
        : ""
    }
    ${
      payload.recent_failures?.length
        ? `<h4 class="ci-sub">Recent failures</h4>
           ${caveat(
             "A failed job is a recorded outcome, not a silent gap. Each one " +
               "keeps its error and its attempt count."
           )}
           <table class="ci-table compact">
             <thead><tr>
               <th>Source</th><th>Task</th><th>Argument</th>
               <th>Attempts</th><th>Error</th>
             </tr></thead>
             <tbody>${payload.recent_failures
               .map(
                 (job) => `<tr>
                   <td>${esc(job.source)}</td><td>${esc(job.task)}</td>
                   <td class="mono">${esc(job.argument)}</td>
                   <td>${job.attempts}</td>
                   <td class="dim small">${esc(
                     (job.error || "").slice(0, 160)
                   )}</td>
                 </tr>`
               )
               .join("")}</tbody>
           </table>`
        : ""
    }`;
}

function qualityBlock(payload) {
  if (!payload.total) {
    return `<div class="ci-empty small">
      <div class="big">✓</div>
      <p>No open data-quality findings.</p>
      <p class="dim">Run the checks with
        <span class="mono">python -m app.chemint.ingest.run --check</span>.</p>
    </div>`;
  }
  return `
    ${caveat(payload.note)}
    <table class="ci-table">
      <thead><tr><th>Finding</th><th>Severity</th><th>Count</th></tr></thead>
      <tbody>
        ${payload.issues
          .map(
            (issue) => `<tr>
              <td class="mono">${esc(issue.code)}</td>
              <td><span class="ci-sev ci-sev-${esc(
                issue.severity
              )}">${esc(issue.severity)}</span></td>
              <td>${issue.count}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}
