/** The provider capability map. */

import { esc, loading, notice } from "../../ui.js";
import { kbApi } from "../api.js";

export async function sourcesView(root) {
  root.innerHTML = loading("Reading the provider registry…");
  let data;
  try {
    data = await kbApi.providers();
  } catch (error) {
    root.innerHTML = notice(
      `<strong>The provider registry could not be read.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  root.innerHTML = `
    <div class="kb-summary">
      <span><b>${data.counts.interfaces}</b> interfaces</span>
      <span><b>${data.counts.adapters}</b> adapters</span>
      <span><b>${data.counts.available}</b> currently available</span>
    </div>
    <div class="kb-providers">
      ${data.interfaces
        .map(
          (i) => `
        <section class="kb-provider lg-surface lg-d1 ${i.available ? "" : "absent"}">
          <header>
            <h3>${esc(i.interface)}</h3>
            <span class="kb-status kb-status-${i.available ? "ok" : "unavailable"}">
              <span class="kb-glyph">${i.available ? "●" : "⚠"}</span>
              ${i.available ? "available" : "unavailable"}
            </span>
          </header>
          <table class="kb-table">
            <thead><tr><th>Adapter</th><th>Source</th><th>Produces</th><th>Licence</th><th>Status</th></tr></thead>
            <tbody>
              ${i.adapters
                .map(
                  (a) => `
                <tr>
                  <td class="mono small">${esc(a.key)}</td>
                  <td>${esc(a.source)}</td>
                  <td><span class="kb-kind kb-kind-${esc(a.produces)}">${esc(a.produces)}</span></td>
                  <td class="small dim">${esc(a.licence)}</td>
                  <td class="small">${
                    a.available
                      ? '<span class="kb-ok">ready</span>'
                      : `<span class="kb-warn">${esc(a.unavailable_reason || "unavailable")}</span>`
                  }</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </section>`
        )
        .join("")}
    </div>`;
}
