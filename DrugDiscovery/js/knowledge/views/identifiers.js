/** Identifier namespaces, and live resolution of anything pasted in. */

import { esc, loading, notice } from "../../ui.js";
import { kbApi } from "../api.js";
import { identifierChip } from "../ui.js";

export async function identifiersView(root) {
  root.innerHTML = loading("Reading the namespace registry…");
  let data;
  try {
    data = await kbApi.namespaces();
  } catch (error) {
    root.innerHTML = notice(
      `<strong>The namespace registry could not be read.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  root.innerHTML = `
    <section class="kb-resolve lg-surface lg-d1">
      <h3>What is this identifier?</h3>
      <p class="dim small">
        Paste anything — an accession, a PDB code, a DOI, an NCT number. When a
        string could belong to more than one namespace, every candidate is
        shown rather than one being guessed: a wrong namespace resolves
        confidently to the wrong entity, which is harder to notice than no
        resolution at all.
      </p>
      <div class="kb-resolve-row">
        <input id="kb-id-input" type="search" autocomplete="off" spellcheck="false"
               placeholder="P00533   ·   1IEP   ·   CHEMBL941   ·   10.1038/nature12373   ·   NCT00000102"
               aria-label="Identifier to resolve" />
        <button id="kb-id-go" class="kb-btn">Resolve</button>
      </div>
      <div id="kb-id-result"></div>
    </section>

    <section class="kb-namespaces lg-surface lg-d1">
      <h3>Namespaces stored by this platform <span class="dim">(${data.count})</span></h3>
      <table class="kb-table">
        <thead><tr><th>Namespace</th><th>Entity</th><th>Canonical form</th><th>Authority</th></tr></thead>
        <tbody>
          ${data.namespaces
            .map(
              (n) => `
            <tr>
              <td><strong>${esc(n.label)}</strong> <span class="mono small dim">${esc(n.key)}</span></td>
              <td><span class="kb-kind kb-kind-${esc(n.kind)}">${esc(n.kind)}</span></td>
              <td class="mono small">${esc(n.canonical_prefix)}${esc(n.separator)}…</td>
              <td class="small dim">${esc(n.authority)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`;

  const input = root.querySelector("#kb-id-input");
  const host = root.querySelector("#kb-id-result");

  async function resolve() {
    const value = input.value.trim();
    if (!value) return;
    host.innerHTML = loading("Resolving…");
    try {
      const result = await kbApi.resolveIdentifier(value);
      if (result.resolved) {
        host.innerHTML = `
          <div class="kb-resolved">
            <span class="kb-ok">Resolved</span>
            ${identifierChip(result.resolved)}
            <span class="kb-kind kb-kind-${esc(result.resolved.kind)}">${esc(
              result.resolved.kind || ""
            )}</span>
          </div>`;
      } else if (result.candidates?.length) {
        host.innerHTML = `
          <div class="kb-ambiguous">
            <p class="kb-warn">${esc(result.note || "Ambiguous.")}</p>
            <div class="kb-chips">${result.candidates.map(identifierChip).join("")}</div>
          </div>`;
      } else {
        host.innerHTML = `<p class="kb-warn">${esc(result.note || "Not recognised.")}</p>`;
      }
    } catch (error) {
      host.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  }

  root.querySelector("#kb-id-go").addEventListener("click", resolve);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      resolve();
    }
  });
}
