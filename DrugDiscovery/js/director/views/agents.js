/**
 * Agents, failure modes, and the provenance audit.
 *
 * Three things a reader should be able to check without trusting a summary:
 * what each agent is allowed to do, which failure modes this deployment can
 * actually assess, and whether the campaign's own output stayed traceable.
 *
 * The failure-mode table lists the modes with no model on this deployment
 * alongside the ones with one. A table showing only the assessable modes
 * would read as "checked, and fine" for the rest.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { ddApi } from "../api.js";
import { currentCampaign } from "../router.js";

export async function agentsView(host) {
  host.innerHTML = loading("Loading…");

  let agents;
  let loop;
  let modes;
  try {
    [agents, loop, modes] = await Promise.all([
      ddApi.agents(),
      ddApi.loop(),
      ddApi.failureModes(),
    ]);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = `
    ${renderAudit()}
    ${renderLoop(loop)}
    ${renderAgents(agents)}
    ${renderModes(modes)}
  `;

  const auditHost = host.querySelector("#dd-audit");
  if (auditHost) await loadAudit(auditHost);
}

function renderAudit() {
  return card(
    "Provenance audit",
    `<div id="dd-audit">${loading("Auditing…")}</div>`
  );
}

async function loadAudit(host) {
  const key = currentCampaign.get();
  if (!key) {
    host.innerHTML = empty(
      "Select a campaign to audit it. The audit checks the campaign's own output, not the science."
    );
    return;
  }

  let report;
  try {
    report = await ddApi.audit(key);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  const findings = report.findings || [];
  host.innerHTML = `
    <p><strong>${esc(report.summary)}</strong></p>
    ${
      findings.length
        ? `<ul class="dd-findings">
             ${findings
               .map(
                 (f) => `<li class="${esc(f.severity)}">
                   <span class="dd-pill ${
                     f.severity === "high" ? "danger" : "warn"
                   }">${esc(f.severity)}</span>
                   <strong>${esc(f.kind.replace(/_/g, " "))}</strong>
                   ${f.agent ? `<span class="mono dim">${esc(f.agent)}</span>` : ""}
                   <p>${esc(f.detail)}</p>
                   <p class="dim">${esc(f.consequence || "")}</p>
                 </li>`
               )
               .join("")}
           </ul>`
        : notice(
            "Every number in this campaign's agent prose matched a recorded tool output, and every citation resolves.",
            "ok",
            "✓"
          )
    }
    <div class="dd-audit-checked dim">
      Checked ${report.checked?.agent_runs ?? 0} agent run(s),
      ${report.checked?.evidence_rows ?? 0} evidence row(s) and
      ${report.checked?.tool_calls ?? 0} tool call(s).
    </div>
    <p class="dim">${esc(report.scope_note || "")}</p>
  `;
}

function renderLoop(loop) {
  const rows = loop.stages
    .map(
      (s) => `
      <tr class="${s.requires_approval ? "gated" : ""}">
        <td>${s.position}</td>
        <td class="mono">${esc(s.stage)}</td>
        <td>${
          s.agents.length
            ? s.agents.map((a) => `<code>${esc(a)}</code>`).join(" ")
            : '<span class="dim">bookkeeping</span>'
        }</td>
        <td>${
          s.requires_approval
            ? `<span class="dd-pill warn">human decides</span>`
            : ""
        }</td>
      </tr>`
    )
    .join("");

  return card(
    "The research loop",
    `<div class="table-wrap"><table class="dd-table">
       <thead><tr><th>#</th><th>Stage</th><th>Agents</th><th>Gate</th></tr></thead>
       <tbody>${rows}</tbody>
     </table></div>
     <p class="dim">${esc(loop.iteration_note)}</p>`
  );
}

function renderAgents(agents) {
  const blocks = agents.agents
    .map(
      (a) => `
      <div class="dd-agent">
        <div class="dd-agent-head">
          <strong>${esc(a.name)}</strong>
          <span class="mono dim">${esc(a.key)} v${esc(a.version)}</span>
        </div>
        <div class="dd-agent-cols">
          <div>
            <div class="dd-agent-label">Responsibilities</div>
            <ul>${a.responsibilities.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          </div>
          <div>
            <div class="dd-agent-label">Explicitly not its remit</div>
            ${
              a.out_of_scope.length
                ? `<ul>${a.out_of_scope
                    .map((r) => `<li>${esc(r)}</li>`)
                    .join("")}</ul>`
                : '<p class="dim">—</p>'
            }
          </div>
          <div>
            <div class="dd-agent-label">Engines it may call</div>
            ${
              a.tools.length
                ? `<ul class="mono">${a.tools
                    .map((t) => `<li>${esc(t)}</li>`)
                    .join("")}</ul>`
                : '<p class="dim">none</p>'
            }
          </div>
        </div>
      </div>`
    )
    .join("");

  return card(
    "The specialists",
    `${blocks}<p class="dim">${esc(agents.note)}</p>`
  );
}

function renderModes(modes) {
  const rows = modes.modes
    .map(
      (m) => `
      <tr class="${m.assessable_here ? "" : "unassessed"}">
        <td>${esc(m.label)}<div class="dim">${esc(m.why_it_matters)}</div></td>
        <td class="mono">${esc(m.stage)}</td>
        <td>
          ${
            m.assessable_here
              ? `<span class="dd-pill ok">assessed by <code>${esc(
                  m.assessed_by
                )}</code></span>`
              : `<span class="dd-pill warn">not assessed here</span>
                 <div class="dim">${esc(m.not_assessed_reason || "")}</div>`
          }
        </td>
      </tr>`
    )
    .join("");

  return card(
    `Failure modes — ${modes.assessable} of ${modes.total} assessable on this deployment`,
    `<div class="table-wrap"><table class="dd-table">
       <thead><tr><th>Mode</th><th>Stage</th><th>Assessment</th></tr></thead>
       <tbody>${rows}</tbody>
     </table></div>
     <p class="dim">${esc(modes.note)}</p>`
  );
}
