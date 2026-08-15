/**
 * Candidate Design.
 *
 * Every candidate with the reason it exists: its parent, the transformation
 * applied, what that change was expected to improve, and what actually moved.
 * The expected-versus-observed pair is the point of the page — a transformation
 * that was supposed to help BBB and did not is the campaign's most reusable
 * finding, and it only exists because both halves are stored.
 */

import { card, empty, esc, loading, notice } from "../../ui.js";
import { bindJob } from "../../jobstore.js";
import { labApi } from "../../lab/api.js";
import { activeCampaign, discApi } from "../api.js";

export async function designView(root, params) {
  const campaign = activeCampaign.get();
  if (!campaign) {
    root.innerHTML = notice("Select a campaign first.", "muted", "◎");
    return;
  }

  root.innerHTML = `
    ${card(
      "Design the next generation",
      `<div class="toolbar">
        <span id="g-run-control"></span>
        <label class="row small">Children
          <input class="search-input" id="g-children" type="number" value="16"
                 min="2" max="200" style="width:70px" />
        </label>
        <label class="row small">Parents
          <input class="search-input" id="g-parents" type="number" value="2"
                 min="1" max="10" style="width:60px" />
        </label>
      </div>
      <div class="lab-note">
        The reasoning model chooses transformations from the chemistry engine's
        own catalogue; RDKit applies them and validates the products. A
        structure written by a model is never stored, and anything the campaign
        has learned to avoid is refused before it becomes a candidate.
      </div>
      <div id="g-run-result"></div>`
    )}

    ${card(
      "Add a seed by hand",
      `<div class="toolbar">
        <input class="search-input" id="s-smiles" placeholder="SMILES" style="flex:1;min-width:240px" />
        <input class="search-input" id="s-why" placeholder="Why this molecule? (required)" style="flex:1;min-width:240px" />
        <button class="sm" id="s-add">Add seed</button>
      </div>
      <div id="s-result" class="small"></div>`
    )}

    <div id="g-list">${loading()}</div>`;

  bindJob(root, `disc-generate:${campaign.id}`, {
    control: "#g-run-control",
    output: "#g-run-result",
    runLabel: "Design generation",
    start: () =>
      discApi.generate(campaign.code, {
        max_children: Number(root.querySelector("#g-children").value),
        max_parents: Number(root.querySelector("#g-parents").value),
      }),
    render: (host, result) => {
      host.innerHTML = renderGenerationReport(result);
      load(root, campaign, params);
    },
  });

  root.querySelector("#s-add").addEventListener("click", async () => {
    const host = root.querySelector("#s-result");
    try {
      const created = await discApi.addSeed(campaign.code, {
        smiles: root.querySelector("#s-smiles").value.trim(),
        rationale: root.querySelector("#s-why").value.trim(),
        origin: "user_supplied",
      });
      host.innerHTML = `<span class="dim">Added ${esc(created.code)}.</span>`;
      await load(root, campaign, params);
    } catch (error) {
      host.innerHTML = `<span class="danger">${esc(error.message)}</span>`;
    }
  });

  await load(root, campaign, params);
}

function renderGenerationReport(result) {
  return `
    <div class="mt">
      <strong>Generation ${result.generation}: ${result.created} candidates</strong>
      ${(result.per_parent || [])
        .map(
          (report) => `<div class="disc-gen-report">
            <div><strong>${esc(report.parent || "?")}</strong> —
              ${report.generated ?? 0} built,
              ${report.rejected_count ?? 0} refused
              ${report.unsupported_classes?.length
                ? `· unsupported: ${esc(report.unsupported_classes.join(", "))}`
                : ""}
            </div>
            ${report.strategy_summary
              ? `<div class="small dim">${esc(report.strategy_summary)}</div>`
              : ""}
            ${(report.rejected || [])
              .slice(0, 3)
              .map((r) => `<div class="small muted">refused: ${esc(r.reason)}</div>`)
              .join("")}
          </div>`
        )
        .join("")}
      <div class="lab-note">${esc(result.note || "")}</div>
    </div>`;
}

async function load(root, campaign, params) {
  const host = root.querySelector("#g-list");
  try {
    const [payload, lineage] = await Promise.all([
      discApi.candidates(campaign.code, { limit: 400 }),
      discApi.lineage(campaign.code),
    ]);

    if (!payload.count) {
      host.innerHTML = empty(
        "No candidates yet. Seed the campaign from known chemistry, or add a " +
          "molecule by hand above."
      );
      return;
    }

    const edges = new Map(lineage.edges.map((edge) => [edge.child_id, edge]));
    const byGeneration = new Map();
    for (const candidate of payload.candidates) {
      if (!byGeneration.has(candidate.generation)) byGeneration.set(candidate.generation, []);
      byGeneration.get(candidate.generation).push(candidate);
    }

    const focus = params?.get?.("candidate");

    host.innerHTML = [...byGeneration.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(
        ([generation, members]) => card(
          `Generation ${generation} — ${members.length} candidates`,
          `<div class="disc-candidates">
            ${members.map((c) => renderCandidate(c, edges.get(c.id), String(c.id) === focus)).join("")}
          </div>`
        )
      )
      .join("");

    wire(root, campaign, params);
  } catch (error) {
    host.innerHTML = notice(esc(error.message), "danger", "⚠");
  }
}

function renderCandidate(candidate, edge, focused) {
  const predictions = candidate.predictions || {};
  const known = candidate.known_activity;

  return `
    <div class="disc-candidate ${candidate.status === "rejected" ? "rejected" : ""}
                ${focused ? "focused" : ""}" data-cid="${candidate.id}">
      <div class="row">
        <span class="disc-code">${esc(candidate.code)}</span>
        <span class="disc-state">${esc(candidate.status)}</span>
        ${candidate.pareto_rank === 1 ? `<span class="chip pareto">front 1</span>` : ""}
        ${candidate.pinned ? `<span class="chip">pinned</span>` : ""}
      </div>

      <div class="mol-2d">
        <img src="${esc(labApi.depictionUrl(candidate.smiles, 200, 150))}"
             alt="${esc(candidate.code)}" loading="lazy" />
      </div>

      <div class="small dim">${esc(candidate.formula || "")} ·
        ${candidate.molecular_weight ?? "—"} Da</div>

      ${known
        ? `<div class="disc-measured">
            <span class="status-chip status-measured">● measured</span>
            ${esc(known.type)} ${known.value} ${esc(known.units || "")}
            <span class="dim small">${esc(known.chembl_id || "")}</span>
           </div>`
        : ""}

      ${candidate.seed_rationale
        ? `<div class="small"><strong>Seeded because:</strong> ${esc(
            candidate.seed_rationale
          )}</div>`
        : ""}

      ${edge ? renderEdge(edge) : ""}

      <table class="disc-preds">
        ${Object.entries(predictions)
          .map(([endpoint, prediction]) => {
            const domain = prediction.applicability;
            const band = domain?.available ? domain.band : null;
            return `<tr class="${band && band !== "in_domain" ? "out" : ""}">
              <td>${esc(endpoint.replace(/_/g, " "))}</td>
              <td class="num">${prediction.value ?? "—"}</td>
              <td class="dim small">${esc(prediction.units || "")}</td>
              <td><span class="status-chip status-${esc(prediction.status)}">${esc(
                prediction.status
              )}</span></td>
              <td class="dim small">${
                band
                  ? band === "in_domain"
                    ? "in domain"
                    : `<span class="danger">${esc(band.replace(/_/g, " "))}</span>`
                  : ""
              }${prediction.is_surrogate ? " · surrogate" : ""}</td>
            </tr>`;
          })
          .join("")}
      </table>

      ${candidate.rejection_reason
        ? `<div class="disc-status-reason"><strong>Rejected:</strong> ${esc(
            candidate.rejection_reason
          )}</div>`
        : ""}

      <div class="row mt">
        <button class="sm" data-trace>Why is this here?</button>
        <button class="sm" data-dock>Send to preclinical</button>
        <button class="sm" data-pin>${candidate.pinned ? "Unpin" : "Pin"}</button>
        <button class="sm" data-reject>Reject</button>
      </div>
      <div class="disc-trace" data-trace-host></div>
    </div>`;
}

function renderEdge(edge) {
  const observed = Object.entries(edge.observed || {});
  return `
    <div class="disc-edge">
      <div class="small"><strong>${esc(edge.transformation || "transformation")}</strong>
        from ${esc(edge.parent_code)}
        ${edge.similarity_to_parent
          ? `<span class="dim">· similarity ${edge.similarity_to_parent}</span>`
          : ""}
      </div>
      ${edge.reason ? `<div class="small dim">${esc(edge.reason)}</div>` : ""}
      <div class="disc-expect">
        <span class="small">Expected to improve
          <strong>${esc(edge.expected_to_improve || "—")}</strong></span>
        ${observed.length
          ? `<div class="disc-observed">
              ${observed
                .map(
                  ([endpoint, delta]) => `<span class="disc-delta ${
                    delta.delta > 0 ? "up" : delta.delta < 0 ? "down" : ""
                  }">${esc(endpoint.replace(/_/g, " "))}
                    ${delta.delta > 0 ? "+" : ""}${delta.delta}</span>`
                )
                .join("")}
             </div>`
          : `<span class="dim small">nothing comparable measured yet</span>`}
      </div>
      ${edge.potential_downside
        ? `<div class="small muted">Stated cost: ${esc(edge.potential_downside)}</div>`
        : ""}
    </div>`;
}

function wire(root, campaign, params) {
  root.querySelectorAll("[data-cid]").forEach((element) => {
    const id = Number(element.dataset.cid);
    const traceHost = element.querySelector("[data-trace-host]");

    element.querySelector("[data-trace]").addEventListener("click", async () => {
      traceHost.innerHTML = loading("Reading the record…");
      try {
        const detail = await discApi.candidate(id);
        traceHost.innerHTML = renderTrace(detail.decision_trace);
      } catch (error) {
        traceHost.innerHTML = notice(esc(error.message), "danger", "⚠");
      }
    });

    element.querySelector("[data-dock]").addEventListener("click", async () => {
      const pdb = window.prompt(
        "Receptor PDB id for docking (the preclinical workspace needs a real structure):",
        "1M17"
      );
      if (!pdb) return;
      try {
        const submitted = await discApi.sendToPreclinical(id, {
          analysis: "docking",
          parameters: { pdb_id: pdb.trim(), exhaustiveness: 8, num_modes: 5 },
        });
        traceHost.innerHTML = `<div class="small">Submitted as job
          ${submitted.job_id}. It runs in the preclinical workspace and its
          result returns here. <a href="#/discovery/comparisons">Watch it →</a></div>`;
      } catch (error) {
        traceHost.innerHTML = notice(esc(error.message), "warn", "⚠");
      }
    });

    element.querySelector("[data-pin]").addEventListener("click", async () => {
      const pinned = element.querySelector("[data-pin]").textContent.trim() === "Pin";
      await discApi.updateCandidate(id, { pinned });
      await load(root, campaign, params);
    });

    element.querySelector("[data-reject]").addEventListener("click", async () => {
      const reason = window.prompt(
        "Why is this candidate rejected? It keeps its row and its lineage."
      );
      if (!reason) return;
      try {
        await discApi.updateCandidate(id, { status: "rejected", reason });
        await load(root, campaign, params);
      } catch (error) {
        window.alert(error.message);
      }
    });
  });
}

function renderTrace(trace) {
  return `
    <div class="disc-trace-chain">
      <div class="disc-trace-step"><span class="dim">Disease</span>
        ${esc(trace.disease.name)}${
          trace.disease.subtype ? ` · ${esc(trace.disease.subtype)}` : ""
        }</div>
      ${trace.hypothesis
        ? `<div class="disc-trace-step"><span class="dim">Hypothesis</span>
            ${esc(trace.hypothesis.code)}: ${esc(trace.hypothesis.title)}</div>`
        : ""}
      ${trace.target
        ? `<div class="disc-trace-step"><span class="dim">Target</span>
            ${esc(trace.target.code)} ${esc(trace.target.symbol)}</div>`
        : ""}
      ${trace.lineage
        .map(
          (step) => `<div class="disc-trace-step">
            <span class="dim">Gen ${step.generation}</span>
            ${esc(step.code)}
            ${step.seed_rationale ? `— ${esc(step.seed_rationale)}` : ""}
            ${step.transformation?.name ? `— ${esc(step.transformation.name)}` : ""}
          </div>`
        )
        .join("")}
    </div>
    <div class="lab-note">${esc(trace.note)}</div>`;
}
