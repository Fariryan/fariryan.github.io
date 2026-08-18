/**
 * The executive portfolio view.
 *
 * The design constraint here is negative: this page must not turn uncertain
 * science into a confident-looking business number. There is no probability
 * of success, no composite health score and no traffic light derived from
 * predictions — and the page says so, because an absent number reads as an
 * oversight and somebody eventually adds it.
 *
 * What it shows instead are counts a reader can click through and verify.
 */

import { card, esc, empty, loading, notice } from "../../ui.js";
import { entApi } from "../api.js";

export async function portfolioView(host) {
  host.innerHTML = loading("Loading portfolio…");

  let data;
  try {
    data = await entApi.portfolio();
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  host.innerHTML = `
    ${renderSummary(data)}
    ${renderPrograms(data)}
    ${renderFunnel(data.funnel)}
    ${renderLiabilities(data.liabilities)}
    ${renderHypotheses(data.unresolved_hypotheses)}
    ${renderExperiments(data.experiments_awaiting_results)}
    ${renderRisk(data.risk_indicators)}
    ${renderCompute(data.compute)}
    ${renderDecisions(data.decision_history)}
    <div class="ent-refusal">
      <strong>Why there is no probability of success here.</strong>
      <p>${esc(data.why_no_probability_of_success)}</p>
    </div>
  `;
}

function renderSummary(data) {
  const s = data.summary;
  return `
    <div class="ent-stats">
      <div><span class="v">${s.programs_active}</span><span class="l">active programmes</span></div>
      <div><span class="v">${s.campaigns}</span><span class="l">campaigns</span></div>
      <div><span class="v">${s.candidates}</span><span class="l">candidates</span></div>
      <div><span class="v">${s.experiments_awaiting_results}</span><span class="l">experiments outstanding</span></div>
    </div>
    <p class="ent-caveat">${esc(data.uncertainty_note)}</p>
  `;
}

function renderPrograms(data) {
  if (!data.programs.length) {
    return card("Programmes", empty("No programme has been created yet."));
  }
  const rows = data.programs
    .map(
      (p) => `
      <tr>
        <td><strong>${esc(p.name)}</strong><div class="dim">${esc(
        p.objective || ""
      )}</div></td>
        <td>${esc(p.indication || "—")}</td>
        <td><span class="ent-pill">${esc(p.state)}</span></td>
        <td>${p.candidates}</td>
        <td>${p.experiments_outstanding}</td>
        <td>${p.campaigns.map((c) => `<code>${esc(c)}</code>`).join(" ") || "—"}</td>
      </tr>`
    )
    .join("");
  return card(
    "Programmes",
    `<div class="table-wrap"><table class="ent-table">
      <thead><tr><th>Programme</th><th>Indication</th><th>State</th>
        <th>Candidates</th><th>Outstanding</th><th>Campaigns</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
  );
}

function renderFunnel(funnel) {
  const stages = Object.entries(funnel.by_stage);
  const peak = Math.max(1, ...stages.map(([, n]) => n));
  const bars = stages
    .map(
      ([stage, n]) => `
      <div class="ent-funnel-row">
        <div class="ent-funnel-label">${esc(stage.replace(/_/g, " "))}</div>
        <div class="ent-funnel-bar">
          <span style="width:${Math.round((n / peak) * 100)}%"></span>
        </div>
        <div class="ent-funnel-count mono">${n}</div>
      </div>`
    )
    .join("");

  const exits = Object.entries(funnel.exit_reasons || {});
  return card(
    "Candidate funnel",
    `${bars}
     <p class="dim">${esc(funnel.note)}</p>
     ${
       exits.length
         ? `<div class="ent-exits"><strong>Why candidates left</strong>
              <ul>${exits
                .map(([reason, n]) => `<li>${n} — ${esc(reason)}</li>`)
                .join("")}</ul></div>`
         : `<p class="dim">${funnel.exited} candidate(s) have exited.</p>`
     }`
  );
}

function renderLiabilities(liabilities) {
  if (!liabilities?.available) {
    return card(
      "Liabilities",
      empty(liabilities?.reason || "Failure maps are not available.")
    );
  }
  const rows = (liabilities.high_severity || [])
    .map(
      (l) => `<tr><td class="mono">${esc(l.candidate)}</td>
        <td>${esc(l.mode)}</td><td class="dim">${esc(l.basis || "")}</td></tr>`
    )
    .join("");

  return card(
    `Major liabilities — ${liabilities.high_severity_count} high severity`,
    `${
      rows
        ? `<div class="table-wrap"><table class="ent-table">
             <thead><tr><th>Candidate</th><th>Mode</th><th>Basis</th></tr></thead>
             <tbody>${rows}</tbody></table></div>`
        : empty("No high-severity liability is recorded.")
    }
     ${notice(esc(liabilities.note), "warn", "⚠")}`
  );
}

function renderHypotheses(h) {
  if (!h?.available) return "";
  const list = (items, label) =>
    items.length
      ? `<div class="ent-hyp-group"><strong>${label}</strong>
           <ul>${items
             .map(
               (x) =>
                 `<li><span class="mono">${esc(x.key)}</span> ${esc(
                   x.statement
                 )}</li>`
             )
             .join("")}</ul></div>`
      : "";

  return card(
    "Unresolved hypotheses",
    `${list(h.open, "Open")}
     ${list(h.weakened, "Weakened by the Critic")}
     <p class="dim">${h.falsified} falsified. ${esc(h.note || "")}</p>`
  );
}

function renderExperiments(experiments) {
  if (!experiments.length) {
    return card(
      "Experiments awaiting results",
      empty("Nothing is outstanding.")
    );
  }
  const rows = experiments
    .map(
      (e) => `<tr>
        <td class="mono">${esc(e.experiment_key)}</td>
        <td>${esc(e.title)}</td>
        <td>${esc(e.assay || "—")}</td>
        <td>${e.waiting_days ?? "—"} d</td>
      </tr>`
    )
    .join("");
  return card(
    "Experiments awaiting results",
    `<div class="table-wrap"><table class="ent-table">
      <thead><tr><th>Key</th><th>Title</th><th>Assay</th><th>Waiting</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
  );
}

function renderRisk(indicators) {
  if (!indicators?.length) {
    return card(
      "Risk indicators",
      empty("No risk indicator is currently triggered.")
    );
  }
  return card(
    "Risk indicators",
    `<ul class="ent-risks">
      ${indicators
        .map(
          (i) => `<li class="${esc(i.severity)}">
            <span class="ent-pill ${
              i.severity === "high" ? "danger" : "warn"
            }">${i.count}</span>
            <strong>${esc(i.indicator)}</strong>
            <p class="dim">${esc(i.meaning)}</p>
          </li>`
        )
        .join("")}
     </ul>
     <p class="dim">These are counts, not ratings. Each is a fact you can
       click through and verify rather than a score derived from one.</p>`
  );
}

function renderCompute(compute) {
  return card(
    "Compute",
    `<div class="ent-stats small">
      <div><span class="v">${compute.jobs_total}</span><span class="l">jobs</span></div>
      <div><span class="v">${Math.round(compute.cpu_seconds)}</span><span class="l">CPU seconds</span></div>
      <div><span class="v">${Math.round(compute.gpu_seconds)}</span><span class="l">GPU seconds</span></div>
     </div>
     <p class="dim">${esc(compute.cost_note)}</p>`
  );
}

function renderDecisions(decisions) {
  if (!decisions.length) {
    return card("Decision history", empty("No decision has been recorded."));
  }
  return card(
    "Decision history",
    `<ul class="ent-decisions">
      ${decisions
        .slice(0, 20)
        .map(
          (d) => `<li class="${d.by_human ? "human" : "ai"}">
            <div class="ent-decision-head">
              <span class="ent-badge ${d.by_human ? "human" : "ai"}">${
            d.by_human ? "human" : "AI"
          }</span>
              <strong>${esc(d.decision)}</strong>
              <span class="mono dim">${esc(d.subject)}</span>
            </div>
            <p>${esc(d.rationale)}</p>
            <div class="dim">${esc(d.decided_by)} · ${esc(d.at || "")}</div>
          </li>`
        )
        .join("")}
     </ul>`
  );
}
