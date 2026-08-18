/**
 * Governance, security posture and the audit log.
 *
 * The most important content on this page is the list of things the platform
 * does *not* provide. A governance page that lists only capabilities invites
 * a reader to assume the rest, and the rest is where the liability is.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { entApi } from "../api.js";

export async function governanceView(host) {
  host.innerHTML = loading("Loading governance…");

  let governance;
  let status;
  let learning;
  try {
    [governance, status, learning] = await Promise.all([
      entApi.governance(),
      entApi.status(),
      entApi.learning(),
    ]);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = `
    ${renderStatement(governance)}
    ${renderProvidedAndNot(governance)}
    ${renderLearning(learning)}
    ${renderSecurity(status.security)}
    ${renderPackageForm()}
    <div id="ent-package-result"></div>
    <div id="ent-audit"></div>
  `;

  wirePackage(host);
  await renderAudit(host.querySelector("#ent-audit"));
}

function renderStatement(g) {
  return `<div class="ent-statement">
    <strong>Regulatory-ready evidence infrastructure</strong>
    <p>${esc(g.compliance_statement)}</p>
  </div>`;
}

function renderProvidedAndNot(g) {
  return `<div class="ent-two-col">
    ${card(
      "What this provides",
      `<ul class="ent-provided">${g.what_is_provided
        .map((x) => `<li>${esc(x)}</li>`)
        .join("")}</ul>`
    )}
    ${card(
      "What this does not provide",
      `<ul class="ent-not-provided">${g.what_is_not_provided
        .map((x) => `<li>${esc(x)}</li>`)
        .join("")}</ul>`
    )}
  </div>`;
}

function renderLearning(learning) {
  const pending = learning.proposals.filter((p) => p.state === "pending");
  return card(
    `Closed-loop learning — ${learning.pending_review} awaiting review`,
    `${
      pending.length
        ? pending
            .map(
              (p) => `<div class="ent-proposal">
                <div class="ent-proposal-head">
                  <strong>${esc(p.model_key)}</strong>
                  <span class="dim">${p.proposed_records} record(s)</span>
                </div>
                <p>${esc(p.reason)}</p>
                <table class="ent-table compact">
                  ${Object.entries(p.performance_delta || {})
                    .map(
                      ([k, v]) =>
                        `<tr><td class="mono">${esc(k)}</td><td>${esc(
                          String(v)
                        )}</td></tr>`
                    )
                    .join("")}
                </table>
              </div>`
            )
            .join("")
        : empty("No retraining proposal is awaiting review.")
    }
     ${notice(esc(learning.gate_note), "warn", "⚖")}`
  );
}

function renderSecurity(security) {
  const rows = (block, name) =>
    Object.entries(block || {})
      .filter(([, v]) => typeof v !== "object")
      .map(
        ([k, v]) =>
          `<tr><td class="mono">${esc(k)}</td><td>${esc(String(v))}</td></tr>`
      )
      .join("");

  return card(
    "Security posture",
    `<div class="ent-field">
       <div class="ent-field-label">Authentication</div>
       <table class="ent-table compact">${rows(
         security.authentication
       )}</table>
     </div>
     <div class="ent-field">
       <div class="ent-field-label">Authorisation</div>
       <table class="ent-table compact">${rows(security.authorisation)}</table>
     </div>
     <div class="ent-field">
       <div class="ent-field-label">Encryption at rest</div>
       <p>${esc(security.encryption_at_rest?.note || "")}</p>
       <p class="${
         security.encryption_at_rest?.suitable_for_customer_data
           ? "dim"
           : "ent-warn-inline"
       }">Suitable for customer data: ${
      security.encryption_at_rest?.suitable_for_customer_data ? "yes" : "no"
    }</p>
     </div>
     <div class="ent-field">
       <div class="ent-field-label">Rate limiting</div>
       <p class="dim">${esc(security.rate_limiting?.limitation || "")}</p>
     </div>
     ${notice(esc(security.assessment_status), "warn", "⚠")}`
  );
}

function renderPackageForm() {
  return card(
    "Generate an evidence package",
    `<form class="ent-form" id="ent-package">
       <div class="ent-form-row">
         <label>Subject type
           <select name="subject_type">
             <option value="decision">decision</option>
             <option value="candidate">candidate</option>
             <option value="experiment">experiment</option>
           </select>
         </label>
         <label>Identifier
           <input name="subject_id" type="text" required />
         </label>
       </div>
       <button type="submit" class="primary">Generate</button>
       <p class="dim">The package states its own gaps. One that silently
         omitted an unvalidated model would look complete, which is worse
         than one that says what is missing.</p>
     </form>`
  );
}

function wirePackage(host) {
  const form = host.querySelector("#ent-package");
  const result = host.querySelector("#ent-package-result");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    result.innerHTML = loading("Assembling…");
    try {
      const pkg = await entApi.createPackage({
        subject_type: data.get("subject_type"),
        subject_id: data.get("subject_id"),
      });
      result.innerHTML = card(
        `Package ${esc(pkg.package_key)}`,
        `<p class="mono dim">hash ${esc(
          (pkg.content_hash || "").slice(0, 32)
        )}…</p>
         ${
           pkg.completeness_gaps?.length
             ? `<div class="ent-gaps">
                  <strong>${pkg.completeness_gaps.length} gap(s)</strong>
                  <ul>${pkg.completeness_gaps
                    .map(
                      (g) =>
                        `<li><span class="mono">${esc(
                          g.element
                        )}</span> — ${esc(g.gap)}</li>`
                    )
                    .join("")}</ul>
                </div>`
             : notice("No gaps were found.", "ok", "✓")
         }
         <p class="dim">${esc(pkg.note)}</p>`
      );
    } catch (error) {
      result.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });
}

async function renderAudit(host) {
  if (!host) return;
  try {
    const audit = await entApi.audit();
    if (!audit.events.length) {
      host.innerHTML = card("Audit log", empty("No event recorded yet."));
      return;
    }
    host.innerHTML = card(
      "Audit log",
      `<div class="table-wrap"><table class="ent-table">
        <thead><tr><th>When</th><th>Action</th><th>Subject</th>
          <th>Outcome</th></tr></thead>
        <tbody>${audit.events
          .map(
            (e) => `<tr class="${e.outcome !== "allowed" ? "ent-denied" : ""}">
              <td class="dim">${esc(e.at || "")}</td>
              <td class="mono">${esc(e.action)}</td>
              <td>${esc(e.subject || "—")}</td>
              <td><span class="ent-pill ${
                e.outcome === "allowed" ? "" : "danger"
              }">${esc(e.outcome)}</span></td>
            </tr>`
          )
          .join("")}</tbody></table></div>
       <p class="dim">${esc(audit.note)}</p>`
    );
  } catch (error) {
    host.innerHTML = card(
      "Audit log",
      notice(
        `${esc(error.message)} — reading the audit log requires the admin role.`,
        "warn",
        "⚠"
      )
    );
  }
}
