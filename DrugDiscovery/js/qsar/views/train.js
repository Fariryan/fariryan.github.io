/** Assemble a dataset and train a model, with provenance shown first. */

import { esc, loading, notice } from "../../ui.js";
import { qsApi } from "../api.js";

export async function trainView(root) {
  root.innerHTML = loading("Reading available datasets…");
  let targets, status;
  try {
    [targets, status] = await Promise.all([qsApi.availableTargets(60), qsApi.status()]);
  } catch (error) {
    root.innerHTML = notice(`<strong>Could not read available data.</strong><br />${esc(error.message)}`, "danger", "⚠");
    return;
  }

  root.innerHTML = `
    <section class="qs-controls lg-surface lg-d1">
      <div class="qs-grid">
        <div>
          <label for="qs-target">Target (from this platform's ingested ChEMBL)</label>
          <select id="qs-target">
            ${targets.targets.map((t) =>
              `<option value="${t.target_id}">${esc(t.target_name)} — ${t.compounds} compounds</option>`).join("")}
          </select>
          <label for="qs-algo">Algorithm</label>
          <select id="qs-algo">
            ${status.algorithms.filter((a) => a.task === "classification")
              .map((a) => `<option value="${esc(a.key)}">${esc(a.label)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label for="qs-split">Split</label>
          <select id="qs-split">
            <option value="scaffold" selected>Scaffold — held-out chemistry</option>
            <option value="random">Random — optimistic</option>
          </select>
          <label for="qs-threshold">Active threshold (pChEMBL)</label>
          <input id="qs-threshold" type="number" step="0.1" value="6.0" />
        </div>
      </div>
      <div class="qs-actions">
        <button id="qs-preview" class="qs-btn-quiet">Preview dataset</button>
        <button id="qs-train" class="qs-btn">Train</button>
      </div>
      <p class="qs-note">
        Source: ChEMBL activities already ingested here, under ${esc(targets.licence)}.
        Nothing is downloaded at training time.
      </p>
    </section>
    <div id="qs-train-out"></div>`;

  const out = root.querySelector("#qs-train-out");
  const body = () => ({
    target_id: Number(root.querySelector("#qs-target").value),
    algorithm: root.querySelector("#qs-algo").value,
    split: root.querySelector("#qs-split").value,
    active_threshold: Number(root.querySelector("#qs-threshold").value),
    endpoint: root.querySelector("#qs-target").selectedOptions[0].text.split(" —")[0]
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40),
  });

  root.querySelector("#qs-preview").addEventListener("click", async () => {
    out.innerHTML = loading("Assembling…");
    try {
      const d = await qsApi.previewDataset(body());
      out.innerHTML = `
        <section class="qs-card lg-surface lg-d1">
          <h3>${esc(d.name)}</h3>
          <table class="qs-props"><tbody>
            <tr><th>Size</th><td class="mono">${d.size} compounds</td></tr>
            <tr><th>Balance</th><td class="mono">${JSON.stringify(d.class_balance)}</td></tr>
            <tr><th>Licence</th><td>${esc(d.licence)}</td></tr>
            <tr><th>Rows matched</th><td class="mono">${d.query.rows_matched} → ${d.size} compounds</td></tr>
            <tr><th>Content SHA-256</th><td class="mono small">${esc((d.content_sha256||"").slice(0,32))}…</td></tr>
          </tbody></table>
          <h4>Inclusion</h4>
          <ul class="qs-list">${d.inclusion_criteria.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
          ${d.exclusions.length ? `<h4>Excluded (${d.excluded_total})</h4>
            <ul class="qs-list">${d.exclusions.map((e) =>
              `<li><strong>${e.count}</strong> — ${esc(e.criterion)}<div class="dim small">${esc(e.reason)}</div></li>`).join("")}</ul>` : ""}
          <h4>Preprocessing</h4>
          <ul class="qs-list">${d.preprocessing.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        </section>`;
    } catch (error) {
      out.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });

  root.querySelector("#qs-train").addEventListener("click", async () => {
    out.innerHTML = loading("Training and validating…");
    try {
      const m = await qsApi.train(body());
      const t = m.metrics.held_out_test;
      out.innerHTML = `
        <section class="qs-card lg-surface lg-d1">
          <header class="qs-card-head">
            <h3>${esc(m.name)}</h3>
            <span class="qs-badge ${m.promoted ? "qs-badge-ok" : "qs-badge-warn"}">${esc(m.verdict)}</span>
          </header>
          <table class="qs-props"><tbody>
            <tr><th>Held-out ROC-AUC</th><td class="mono">${t.roc_auc ?? "—"} on ${t.n} compounds</td></tr>
            <tr><th>PR-AUC</th><td class="mono">${t.pr_auc ?? "—"} (trivial baseline ${m.baseline_comparison?.pr_auc ?? "—"})</td></tr>
            <tr><th>Cross-validation</th><td class="mono">${
              m.metrics.cross_validation?.roc_auc
                ? `${m.metrics.cross_validation.roc_auc.mean} ± ${m.metrics.cross_validation.roc_auc.sd}` : "—"}</td></tr>
          </tbody></table>
          <table class="qs-table"><tbody>
            ${(m.promotion?.checks || []).map((c) => `<tr>
              <td class="${c.passed ? "qs-ok" : "qs-warn"}">${c.passed ? "PASS" : "FAIL"}</td>
              <td class="small">${esc(c.criterion)}</td>
              <td class="small dim">${esc(c.detail)}</td></tr>`).join("")}
          </tbody></table>
          <p class="qs-note">
            ${m.promoted
              ? "This model cleared the gate and is exposed as an endpoint."
              : "Registered, but not exposed. Its metrics are the evidence for why that endpoint is unavailable."}
          </p>
          <a class="qs-btn" href="#/qsar/models">See the registry →</a>
        </section>`;
    } catch (error) {
      out.innerHTML = notice(`<strong>Training was refused.</strong><br />${esc(error.message)}`, "warn", "⚠");
    }
  });
}
