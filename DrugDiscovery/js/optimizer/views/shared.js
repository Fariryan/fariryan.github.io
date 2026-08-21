/** Pieces the optimiser's four views share. */

import { esc, loading, notice } from "../../ui.js";
import { optimizerApi } from "../api.js";

export const STATE_GLYPH = {
  seed: "◉", front: "★", active: "●", dominated: "○",
  rejected: "⊘", invalid: "⚠",
};

export const RUN_GLYPH = {
  queued: "○", preparing: "◐", generating: "◑", evaluating: "◒",
  selecting: "◓", complete: "●", failed: "⚠", cancelled: "◌",
};

/** A run picker shared by candidates, pareto and lineage. */
export async function withRun(root, params, render) {
  let list;
  try { list = await optimizerApi.runs(30); }
  catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  if (!list.runs.length) {
    root.innerHTML = notice(
      "No optimisation run yet. Start one from <a href=\"#/optimizer/design\">Design Run</a>.",
      "info", "◌");
    return;
  }

  const requested = params?.get("run") ? Number(params.get("run")) : null;
  let current = list.runs.find((r) => r.id === requested) || list.runs[0];

  root.innerHTML = `
    <div class="opt-runbar lg-surface lg-d1">
      <label for="opt-runsel">Run</label>
      <select id="opt-runsel">${list.runs.map((r) =>
        `<option value="${r.id}" ${r.id === current.id ? "selected" : ""}>
          #${r.id} · ${esc(r.name)} · ${esc(r.strategy)} · ${esc(r.status)}</option>`).join("")}</select>
      <span class="opt-state opt-state-${esc(current.status)}" id="opt-runstate">
        ${RUN_GLYPH[current.status] || "•"} ${esc(current.status)}</span>
    </div>
    <div id="opt-runbody">${loading("Loading…")}</div>`;

  const body = root.querySelector("#opt-runbody");
  const select = root.querySelector("#opt-runsel");

  async function show(id) {
    body.innerHTML = loading("Loading…");
    try { await render(body, id); }
    catch (error) { body.innerHTML = notice(esc(error.message), "danger", "⚠"); }
  }

  select.addEventListener("change", () => show(Number(select.value)));
  await show(current.id);
}

/** A compact objective-values row, one cell per objective. */
export function objectiveCells(objectives, keys) {
  return keys.map((key) => {
    const value = objectives?.[key];
    return `<td class="num mono ${value === null || value === undefined ? "dim" : ""}">${
      value === null || value === undefined ? "—" : Number(value).toFixed(3)}</td>`;
  }).join("");
}

/** Scale helpers for the hand-drawn SVG plots. */
export function scale(values, low, high) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  return (value) => low + ((value - min) / span) * (high - low);
}
