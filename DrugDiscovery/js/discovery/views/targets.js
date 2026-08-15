/**
 * Target Discovery.
 *
 * A shortlist assembled by counting symbols across the campaign's own claims
 * and confirming them against the atlas — not a curated target assessment, and
 * the page says so. What each dossier is *missing* is listed as prominently as
 * what it holds, because an absent dependency score and a bad one look
 * identical if only the present fields are shown.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { bindJob } from "../../jobstore.js";
import { activeCampaign, discApi } from "../api.js";

export async function targetsView(root) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = `
    ${card(
      "Find target opportunities",
      `<div class="toolbar">
        <span id="t-run-control"></span>
        <span class="small dim">
          Symbols are counted across this campaign's claims and checked against
          the atlas. Corroboration is required: a symbol seen once, in one
          paper, that the platform has never heard of is discarded.
        </span>
      </div>
      <div id="t-run-result"></div>`
    )}
    <div id="t-list">${loading()}</div>`;

  bindJob(root, `disc-targets:${campaign.id}`, {
    control: "#t-run-control",
    output: "#t-run-result",
    runLabel: "Shortlist targets",
    start: () => discApi.proposeTargets(campaign.code, { limit: 12 }),
    render: (host, result) => {
      host.innerHTML = `<div class="small dim mt">${result.count} shortlisted.</div>`;
      load(root, campaign);
    },
  });

  await load(root, campaign);
}

async function load(root, campaign) {
  const host = root.querySelector("#t-list");
  try {
    const payload = await discApi.targets(campaign.code);
    if (!payload.count) {
      host.innerHTML = empty(
        "No targets shortlisted yet. They are found in the campaign's evidence, " +
          "so retrieve literature first."
      );
      return;
    }
    host.innerHTML = payload.targets.map(renderTarget).join("");
    wire(root, campaign);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function renderTarget(target) {
  const dossier = target.dossier || {};
  const known = dossier.known_chemistry;

  return `
    <div class="disc-target ${target.blocked ? "blocked" : ""}" data-tid="${target.id}">
      <div class="disc-hyp-head">
        <span class="disc-code">${esc(target.code)}</span>
        <strong class="disc-symbol">${esc(target.symbol)}</strong>
        ${target.name ? `<span class="dim small">${esc(target.name)}</span>` : ""}
        ${dossier.resolved_in_atlas
          ? `<span class="chip">in atlas</span>`
          : `<span class="chip warn">unconfirmed symbol</span>`}
        <span class="spacer"></span>
        <button class="sm" data-pin>${target.pinned ? "Unpin" : "Pin"}</button>
        <button class="sm" data-block>${target.blocked ? "Unblock" : "Block"}</button>
      </div>

      <p class="small">${esc(target.rationale || "")}</p>

      ${target.blocked
        ? `<div class="disc-status-reason"><strong>Blocked:</strong> ${esc(
            target.block_reason || ""
          )}</div>`
        : ""}

      ${known
        ? `<div class="disc-known">
            <strong>Known chemistry</strong>
            ${known.found
              ? `<span class="dim">${known.compound_count} compounds ·
                 ${known.activity_count} measured activities ·
                 ${known.series?.scaffold_families ?? "—"} scaffold families</span>
                 <div class="disc-series">
                   ${(known.series?.families || [])
                     .slice(0, 4)
                     .map(
                       (family) => `<div class="disc-series-row">
                         <span>${family.members} members</span>
                         ${family.best_activity
                           ? `<span class="status-chip status-measured">● ${esc(
                               family.best_activity.type
                             )} ${family.best_activity.value} ${esc(
                               family.best_activity.units || ""
                             )}</span>
                             <span class="dim small">${esc(
                               family.best_activity.compound || ""
                             )}</span>`
                           : `<span class="dim small">no comparable activity</span>`}
                       </div>`
                     )
                     .join("")}
                 </div>`
              : `<span class="dim">${esc(known.reason || "none found")}</span>`}
           </div>`
        : `<button class="sm primary" data-known>Retrieve known chemistry &amp; seed</button>`}

      <details class="mt">
        <summary class="small">What this dossier does not contain</summary>
        <ul class="small muted mt" style="padding-left:17px">
          ${(dossier.not_retrieved || [])
            .map((gap) => `<li>${esc(gap)}</li>`)
            .join("")}
        </ul>
        <div class="lab-note">${esc(dossier.note || "")}</div>
      </details>
    </div>`;
}

function wire(root, campaign) {
  root.querySelectorAll("[data-tid]").forEach((element) => {
    const id = Number(element.dataset.tid);

    element.querySelector("[data-pin]")?.addEventListener("click", async () => {
      const pinned = element.querySelector("[data-pin]").textContent.trim() === "Pin";
      await discApi.updateTarget(id, { pinned, reason: "researcher decision" });
      await load(root, campaign);
    });

    element.querySelector("[data-block]")?.addEventListener("click", async () => {
      const blocking = element.querySelector("[data-block]").textContent.trim() === "Block";
      let reason = "unblocked by the researcher";
      if (blocking) {
        // Required by the backend: an unexplained block is a decision nobody
        // downstream can review.
        reason = window.prompt("Why is this target blocked? The reason is kept.");
        if (!reason) return;
      }
      try {
        await discApi.updateTarget(id, { blocked: blocking, reason });
        await load(root, campaign);
      } catch (error) {
        window.alert(error.message);
      }
    });

    element.querySelector("[data-known]")?.addEventListener("click", async (event) => {
      event.target.disabled = true;
      event.target.textContent = "Retrieving from ChEMBL…";
      try {
        await discApi.knownChemistry(campaign.code, {
          target_id: id,
          seed: true,
          seed_count: 6,
        });
        event.target.textContent = "Queued — this runs as a job";
      } catch (error) {
        event.target.textContent = error.message;
      }
    });
  });
}
