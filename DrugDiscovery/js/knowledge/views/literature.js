/**
 * Literature intelligence.
 *
 * Date-windowed retrieval, full metadata retention, and DOI validation.
 *
 * The rule this view makes visible: an LLM may summarise a retrieved paper and
 * may not invent one. Every row here came from a Europe PMC response and
 * carries the identifier and retrieval timestamp needed to fetch it again.
 * Nothing on this page is generated text.
 */

import { esc, loading, notice } from "../../ui.js";
import { kbApi } from "../api.js";
import { kbDisclaimer, provenanceBlock, statusChip } from "../ui.js";

export async function literatureView(root, params) {
  let windows;
  try {
    windows = await kbApi.literatureWindows();
  } catch (error) {
    root.innerHTML = notice(
      `<strong>The literature layer could not be reached.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  const preset = params?.get("q") || "";

  root.innerHTML = `
    <section class="kb-controls lg-surface lg-d1">
      <div class="kb-control-row">
        <label for="kb-lit-q">Query</label>
        <input id="kb-lit-q" type="search" autocomplete="off" spellcheck="false"
               value="${esc(preset)}"
               placeholder="glioblastoma temozolomide resistance · KRAS G12C · heart failure SGLT2"
               aria-label="Literature query" />
        <label for="kb-lit-window" class="dim small">Window</label>
        <select id="kb-lit-window">
          ${windows.windows
            .map(
              (w) =>
                `<option value="${esc(w.key)}" ${w.key === "1y" ? "selected" : ""}>${esc(
                  w.label
                )}</option>`
            )
            .join("")}
        </select>
        <label for="kb-lit-limit" class="dim small">Limit</label>
        <select id="kb-lit-limit"><option>10</option><option selected>25</option><option>50</option></select>
        <button id="kb-lit-go" class="kb-btn">Search</button>
      </div>
      <div id="kb-lit-custom" class="kb-control-row kb-custom" hidden>
        <label for="kb-lit-since" class="dim small">From</label>
        <input id="kb-lit-since" type="date" />
        <label for="kb-lit-until" class="dim small">To</label>
        <input id="kb-lit-until" type="date" />
      </div>
      <p class="dim small kb-control-note">${esc(windows.note)}</p>
    </section>

    <div id="kb-lit-status"></div>
    <div id="kb-lit-results"></div>
    ${kbDisclaimer}`;

  const windowSelect = root.querySelector("#kb-lit-window");
  const custom = root.querySelector("#kb-lit-custom");
  const statusHost = root.querySelector("#kb-lit-status");
  const resultHost = root.querySelector("#kb-lit-results");
  const input = root.querySelector("#kb-lit-q");

  windowSelect.addEventListener("change", () => {
    custom.hidden = windowSelect.value !== "custom";
  });

  async function search() {
    const query = input.value.trim();
    if (!query) {
      statusHost.innerHTML = notice("Enter a query.", "warn", "⚠");
      return;
    }
    statusHost.innerHTML = loading("Searching Europe PMC…");
    resultHost.innerHTML = "";

    const payload = {
      query,
      window: windowSelect.value,
      limit: Number(root.querySelector("#kb-lit-limit").value),
    };
    if (windowSelect.value === "custom") {
      payload.since = root.querySelector("#kb-lit-since").value || undefined;
      payload.until = root.querySelector("#kb-lit-until").value || undefined;
    }

    try {
      const result = await kbApi.literatureSearch(payload);
      statusHost.innerHTML = "";
      renderResults(resultHost, result);
    } catch (error) {
      statusHost.innerHTML = notice(
        `<strong>The search failed.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  }

  root.querySelector("#kb-lit-go").addEventListener("click", search);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      search();
    }
  });

  if (preset) search();
}

function renderResults(host, result) {
  const retention = result.retention || {};
  const papers = result.records || [];

  host.innerHTML = `
    <section class="kb-lit-summary lg-surface lg-d1">
      <div class="kb-lit-summary-head">
        <div>
          <h3>${papers.length} retrieved${
            result.total_available ? ` of ${result.total_available} matched` : ""
          }</h3>
          <p class="dim small">
            Window: ${esc(result.query?.window || "all")}${
              result.query?.since
                ? ` · ${esc(result.query.since)} to ${esc(result.query.until || "now")}`
                : ""
            }.
            Retained ${retention.stored || 0} new,
            refreshed ${retention.updated || 0}${
              retention.skipped_no_identifier
                ? `, skipped ${retention.skipped_no_identifier} with no DOI/PMID/PMCID`
                : ""
            }.
          </p>
        </div>
        ${statusChip(result.status, result.count)}
      </div>
      ${
        retention.skipped_no_identifier
          ? `<p class="kb-incomplete">
               ${retention.skipped_no_identifier} record(s) carried no DOI, PMID or
               PMCID and were not retained. A citation that cannot be re-found is
               indistinguishable from a fabricated one, so it is not kept.
             </p>`
          : ""
      }
      ${provenanceBlock(result.provenance, "How this search was run")}
    </section>

    <div class="kb-papers">
      ${papers.map(paper).join("") || '<p class="dim">Nothing matched.</p>'}
    </div>`;

  host.querySelectorAll("[data-validate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const doi = button.dataset.validate;
      const slot = button.parentElement.querySelector(".kb-validation");
      button.disabled = true;
      slot.innerHTML = `<span class="dim small">checking Crossref…</span>`;
      try {
        const check = await kbApi.validateDoi(doi);
        if (check.status === "ok" && check.records?.length) {
          const work = check.records[0];
          slot.innerHTML = `<span class="kb-ok">✓ registered with Crossref</span>
            <span class="dim small">${esc(work.publisher || "")} ${esc(
              String(work.year || "")
            )}</span>`;
        } else if (check.status === "empty") {
          slot.innerHTML = `<span class="kb-warn">⚠ Crossref has no record for this DOI</span>`;
        } else {
          slot.innerHTML = `<span class="dim small">${esc(
            check.note || "could not be checked"
          )}</span>`;
        }
      } catch (error) {
        slot.innerHTML = `<span class="kb-warn">${esc(error.message)}</span>`;
      }
      button.disabled = false;
    });
  });
}

function paper(record) {
  const ids = [
    record.doi ? `<a class="kb-id" href="https://doi.org/${esc(record.doi)}" target="_blank" rel="noopener noreferrer"><span class="kb-id-ns">DOI</span> <span class="mono">${esc(record.doi)}</span> ↗</a>` : "",
    record.pmid ? `<a class="kb-id" href="https://pubmed.ncbi.nlm.nih.gov/${esc(record.pmid)}/" target="_blank" rel="noopener noreferrer"><span class="kb-id-ns">PMID</span> <span class="mono">${esc(record.pmid)}</span> ↗</a>` : "",
    record.pmcid ? `<a class="kb-id" href="https://www.ncbi.nlm.nih.gov/pmc/articles/${esc(record.pmcid)}/" target="_blank" rel="noopener noreferrer"><span class="kb-id-ns">PMCID</span> <span class="mono">${esc(record.pmcid)}</span> ↗</a>` : "",
  ]
    .filter(Boolean)
    .join("");

  const authors = (record.authors || []).slice(0, 6).join(", ");
  const more = (record.authors || []).length > 6 ? ` +${record.authors.length - 6}` : "";

  return `
    <article class="kb-paper lg-surface lg-d1">
      <h4>${esc(record.title || "(untitled)")}</h4>
      <div class="kb-paper-meta">
        <span>${esc(authors)}${esc(more)}</span>
        <span class="dim">·</span>
        <span><em>${esc(record.journal || "journal not stated")}</em></span>
        <span class="dim">·</span>
        <span class="mono small">${esc(record.publication_date || record.year || "date not stated")}</span>
        ${record.open_access ? '<span class="kb-oa">open access</span>' : ""}
        ${
          Number.isFinite(record.citation_count)
            ? `<span class="dim small">cited ${record.citation_count}×</span>`
            : ""
        }
      </div>
      <div class="kb-chips kb-ids">${ids}</div>
      ${
        record.abstract
          ? `<details class="kb-abstract"><summary>Abstract</summary><p>${esc(
              record.abstract
            )}</p></details>`
          : `<p class="dim small">No abstract was supplied by the source for this record.</p>`
      }
      <div class="kb-paper-foot">
        ${
          record.doi
            ? `<button class="kb-btn-quiet" data-validate="${esc(record.doi)}">Validate DOI</button>`
            : `<span class="dim small">No DOI to validate.</span>`
        }
        <span class="kb-validation"></span>
        <span class="dim small mono">retrieved ${esc(
          String(record.retrieved_at || "").slice(0, 16).replace("T", " ")
        )}</span>
      </div>
    </article>`;
}
