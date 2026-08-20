/** The model registry: what was trained, and what may actually be used. */

import { esc, loading, notice } from "../../ui.js";
import { qsApi } from "../api.js";

export async function modelsView(root) {
  root.innerHTML = loading("Reading the registry…");
  let data, status;
  try {
    [data, status] = await Promise.all([qsApi.models(), qsApi.status()]);
  } catch (error) {
    root.innerHTML = notice(`<strong>The registry could not be read.</strong><br />${esc(error.message)}`, "danger", "⚠");
    return;
  }

  const t = status.promotion_thresholds || {};
  root.innerHTML = `
    <section class="qs-policy lg-surface lg-d1">
      <div class="qs-counts">
        <span><b>${data.count}</b> registered</span>
        <span class="qs-ok"><b>${data.promoted}</b> exposed</span>
        <span class="qs-warn"><b>${data.count - data.promoted}</b> withheld</span>
      </div>
      <p class="qs-note">${esc(status.policy)}</p>
      <p class="qs-note">
        The gate: held-out test set ≥ ${t.min_test_size} compounds, scaffold-split
        ROC-AUC ≥ ${t.min_roc_auc}, PR-AUC at least ${t.min_pr_auc_lift} above the
        trivial baseline, cross-validation spread ≤ ${t.max_cv_sd}, and validation
        on a scaffold split.
      </p>
    </section>

    ${data.models.length ? `
    <section class="qs-table-wrap lg-surface lg-d1">
      <table class="qs-table">
        <thead><tr>
          <th>Model</th><th>Endpoint</th><th>Algorithm</th>
          <th class="num">Dataset</th><th class="num">Test n</th>
          <th class="num">ROC-AUC</th><th>Gate</th><th></th>
        </tr></thead>
        <tbody>
          ${data.models.map((m) => `<tr class="${m.promoted ? "" : "qs-row-withheld"}">
            <td><strong>${esc(m.name)}</strong><div class="mono small dim">v${esc(m.version)}</div></td>
            <td>${esc(m.endpoint)}</td>
            <td class="small">${esc(m.algorithm)}</td>
            <td class="num mono">${m.dataset.size ?? "—"}</td>
            <td class="num mono">${m.split?.test_size ?? "—"}</td>
            <td class="num mono ${m.headline.value >= 0.7 ? "qs-ok" : "qs-warn"}">${
              m.headline.value ?? "—"}</td>
            <td>${m.promoted
              ? '<span class="qs-badge qs-badge-ok">exposed</span>'
              : '<span class="qs-badge qs-badge-warn">withheld</span>'}</td>
            <td><button class="qs-btn-quiet" data-model="${m.id}">Card</button></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>
    <div id="qs-card"></div>` : `<p class="dim">No models trained yet. <a href="#/qsar/train">Train one</a>.</p>`}`;

  root.querySelectorAll("[data-model]").forEach((b) =>
    b.addEventListener("click", () => showCard(root.querySelector("#qs-card"), Number(b.dataset.model)))
  );
}

async function showCard(host, id) {
  host.innerHTML = loading("Loading the model card…");
  let m;
  try { m = await qsApi.model(id); }
  catch (error) { host.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  const test = m.metrics.held_out_test || {};
  const cv = m.metrics.cross_validation || {};
  const row = (k, v) => v === undefined || v === null ? "" : `<tr><th>${esc(k)}</th><td class="mono">${esc(String(v))}</td></tr>`;

  host.innerHTML = `
    <section class="qs-card lg-surface lg-d1">
      <header class="qs-card-head">
        <div><h3>${esc(m.name)} <span class="dim">v${esc(m.version)}</span></h3>
          <span class="dim small">${esc(m.algorithm)} · ${esc(m.task)} · endpoint ${esc(m.endpoint)}</span></div>
        <span class="qs-badge ${m.promoted ? "qs-badge-ok" : "qs-badge-warn"}">${esc(m.verdict)}</span>
      </header>

      <h4>Dataset</h4>
      <table class="qs-props"><tbody>
        ${row("Name", m.dataset.name)}
        ${row("Size", m.dataset_detail?.size)}
        ${row("Licence", m.dataset.licence)}
        ${row("Content SHA-256", (m.dataset.sha256 || "").slice(0, 32) + "…")}
        ${row("Class balance", JSON.stringify(m.dataset_detail?.class_balance || {}))}
      </tbody></table>
      ${(m.dataset_detail?.exclusions || []).length ? `
        <p class="qs-note"><strong>Excluded:</strong> ${m.dataset_detail.exclusions
          .map((e) => `${e.count} — ${esc(e.criterion)}`).join("; ")}</p>` : ""}

      <h4>Split</h4>
      <table class="qs-props"><tbody>
        ${row("Method", m.split.method)}
        ${row("Train / test", `${m.split.train_size} / ${m.split.test_size}`)}
        ${row("Seed", m.split.seed)}
      </tbody></table>
      <p class="qs-note">${esc(m.split.note || "")}</p>

      <h4>Held-out test</h4>
      <table class="qs-props"><tbody>
        ${row("n", test.n)} ${row("ROC-AUC", test.roc_auc)} ${row("PR-AUC", test.pr_auc)}
        ${row("MCC", test.mcc)} ${row("Sensitivity", test.sensitivity)}
        ${row("Specificity", test.specificity)} ${row("Brier", test.brier)}
        ${row("R²", test.r2)} ${row("RMSE", test.rmse)} ${row("MAE", test.mae)}
      </tbody></table>

      <h4>Cross-validation (training portion only)</h4>
      <table class="qs-props"><tbody>
        ${row("ROC-AUC", cv.roc_auc ? `${cv.roc_auc.mean} ± ${cv.roc_auc.sd}` : undefined)}
        ${row("Folds", cv.folds)}
      </tbody></table>

      ${m.baseline_comparison ? `<h4>Trivial baseline</h4>
        <p class="qs-note">${esc(m.baseline_comparison.strategy)} —
          ROC-AUC ${m.baseline_comparison.roc_auc ?? "—"},
          PR-AUC ${m.baseline_comparison.pr_auc ?? "—"}.
          ${esc(m.baseline_comparison.note || "")}</p>` : ""}

      <h4>Promotion gate</h4>
      <table class="qs-table">
        <thead><tr><th></th><th>Criterion</th><th>Detail</th></tr></thead>
        <tbody>${(m.promotion?.checks || []).map((c) => `<tr>
          <td class="${c.passed ? "qs-ok" : "qs-warn"}">${c.passed ? "PASS" : "FAIL"}</td>
          <td class="small">${esc(c.criterion)}</td>
          <td class="small dim">${esc(c.detail)}</td></tr>`).join("")}</tbody>
      </table>

      <p class="qs-note mono small">artifact sha256 ${esc((m.artifact_sha256 || "").slice(0, 32))}… ·
        trained in ${m.training_seconds}s ·
        ${esc(m.environment?.scikit_learn ? "scikit-learn " + m.environment.scikit_learn : "")}</p>
    </section>`;
}
