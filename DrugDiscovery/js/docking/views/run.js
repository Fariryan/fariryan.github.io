/** Submit a docking or screening campaign. */

import { esc, loading, notice } from "../../ui.js";
import { dkApi } from "../api.js";

const SAMPLE = [
  "CN1CCN(Cc2ccc(cc2)C(=O)Nc2ccc(C)c(Nc3nccc(n3)-c3cccnc3)c2)CC1 imatinib",
  "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1 gefitinib",
  "CCO ethanol-control",
].join("\n");

export async function runView(root) {
  let status;
  try {
    status = await dkApi.status();
  } catch (error) {
    root.innerHTML = notice(
      `<strong>The docking layer could not be reached.</strong><br />${esc(error.message)}`,
      "danger",
      "⚠"
    );
    return;
  }

  const engine = status.engines[0];
  const ready = engine?.status?.available;

  root.innerHTML = `
    <section class="dk-engine lg-surface lg-d1 ${ready ? "" : "absent"}">
      <div>
        <strong>${esc(engine.name)}</strong>
        <span class="mono small dim">${esc(engine.status.version || "")}</span>
        <span class="dk-badge">${esc(engine.licence)}</span>
      </div>
      <span class="dk-status dk-status-${ready ? "ok" : "unavailable"}">
        ${ready ? "● ready" : "⚠ not installed"}
      </span>
    </section>
    ${
      ready
        ? ""
        : notice(
            `${esc(engine.status.reason || "No docking binary is installed.")}
             ${esc(engine.status.install || "")}`,
            "warn",
            "⚠"
          )
    }

    <section class="dk-controls lg-surface lg-d1">
      <div class="dk-grid">
        <div>
          <label for="dk-pdb">Receptor (PDB entry)</label>
          <input id="dk-pdb" type="search" spellcheck="false" value="1IEP" />

          <label for="dk-site-mode">Binding site</label>
          <select id="dk-site-mode">
            ${status.binding_site_modes
              .map(
                (m) =>
                  `<option value="${esc(m.mode)}" ${
                    m.mode === "reference_ligand" ? "selected" : ""
                  }>${esc(m.label)} — ${esc(m.strength)}</option>`
              )
              .join("")}
          </select>

          <div id="dk-site-fields"></div>
          <button id="dk-preview" class="dk-btn-quiet">Preview box</button>
          <div id="dk-site-out"></div>
        </div>

        <div>
          <label for="dk-ligands">Ligands — one SMILES per line, optional name</label>
          <textarea id="dk-ligands" rows="7" spellcheck="false">${esc(SAMPLE)}</textarea>

          <div class="dk-params">
            <div><label for="dk-exh">Exhaustiveness</label>
              <input id="dk-exh" type="number" value="8" min="1" max="${status.limits.max_exhaustiveness}" /></div>
            <div><label for="dk-modes">Poses</label>
              <input id="dk-modes" type="number" value="9" min="1" max="${status.limits.max_num_modes}" /></div>
            <div><label for="dk-seed">Seed</label>
              <input id="dk-seed" type="number" value="42" /></div>
          </div>
          <p class="dk-note">
            Vina is stochastic. The seed is stored with the campaign, so a run
            reproduces exactly; a different seed gives a slightly different
            pose set and slightly different scores.
          </p>
        </div>
      </div>
      <div class="dk-actions">
        <button id="dk-submit" class="dk-btn" ${ready ? "" : "disabled"}>Run campaign</button>
      </div>
    </section>
    <div id="dk-submit-out"></div>`;

  const modeSelect = root.querySelector("#dk-site-mode");
  const fields = root.querySelector("#dk-site-fields");

  function renderFields() {
    const mode = modeSelect.value;
    if (mode === "reference_ligand") {
      fields.innerHTML = `
        <label for="dk-resname">Ligand residue name</label>
        <input id="dk-resname" type="text" value="STI" spellcheck="false" />`;
    } else if (mode === "residues") {
      fields.innerHTML = `
        <label for="dk-residues">Residue numbers, comma separated</label>
        <input id="dk-residues" type="text" value="315, 318, 381" spellcheck="false" />`;
    } else {
      fields.innerHTML = `
        <label>Centre (x, y, z) Å</label>
        <div class="dk-triple">
          <input id="dk-cx" type="number" step="0.001" value="15.614" />
          <input id="dk-cy" type="number" step="0.001" value="53.380" />
          <input id="dk-cz" type="number" step="0.001" value="15.455" />
        </div>
        <label>Size (x, y, z) Å</label>
        <div class="dk-triple">
          <input id="dk-sx" type="number" step="0.1" value="24" />
          <input id="dk-sy" type="number" step="0.1" value="24" />
          <input id="dk-sz" type="number" step="0.1" value="24" />
        </div>`;
    }
  }
  modeSelect.addEventListener("change", renderFields);
  renderFields();

  function siteSpec() {
    const mode = modeSelect.value;
    if (mode === "reference_ligand") {
      return { mode, reference_ligand: root.querySelector("#dk-resname").value.trim() };
    }
    if (mode === "residues") {
      return {
        mode,
        residues: root
          .querySelector("#dk-residues")
          .value.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      };
    }
    return {
      mode,
      center_x: Number(root.querySelector("#dk-cx").value),
      center_y: Number(root.querySelector("#dk-cy").value),
      center_z: Number(root.querySelector("#dk-cz").value),
      size_x: Number(root.querySelector("#dk-sx")?.value || 22),
      size_y: Number(root.querySelector("#dk-sy")?.value || 22),
      size_z: Number(root.querySelector("#dk-sz")?.value || 22),
    };
  }

  root.querySelector("#dk-preview").addEventListener("click", async () => {
    const host = root.querySelector("#dk-site-out");
    host.innerHTML = loading("Resolving the box…");
    try {
      const result = await dkApi.previewSite({
        pdb_id: root.querySelector("#dk-pdb").value.trim(),
        site: siteSpec(),
      });
      const s = result.binding_site;
      host.innerHTML = `
        <div class="dk-box">
          <div><span>Centre</span><code>${s.center_x}, ${s.center_y}, ${s.center_z}</code></div>
          <div><span>Size</span><code>${s.size_x} × ${s.size_y} × ${s.size_z} Å</code></div>
          <div><span>Volume</span><code>${s.volume_angstrom3} Å³</code></div>
          <div><span>Origin</span><code>${esc(s.origin)}</code></div>
          <p class="dk-note">${esc(s.origin_detail || "")}</p>
        </div>`;
    } catch (error) {
      host.innerHTML = notice(esc(error.message), "danger", "⚠");
    }
  });

  root.querySelector("#dk-submit").addEventListener("click", async () => {
    const host = root.querySelector("#dk-submit-out");
    const ligands = root
      .querySelector("#dk-ligands")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!ligands.length) {
      host.innerHTML = notice("Enter at least one ligand.", "warn", "⚠");
      return;
    }
    host.innerHTML = loading("Submitting…");
    try {
      const campaign = await dkApi.submit({
        pdb_id: root.querySelector("#dk-pdb").value.trim(),
        site: siteSpec(),
        ligands,
        parameters: {
          exhaustiveness: Number(root.querySelector("#dk-exh").value),
          num_modes: Number(root.querySelector("#dk-modes").value),
          seed: Number(root.querySelector("#dk-seed").value),
        },
      });
      host.innerHTML = `
        <div class="dk-submitted lg-surface lg-d1">
          <strong>Campaign ${campaign.id} submitted.</strong>
          <p class="dk-note">
            ${campaign.progress.total} ligand(s) queued. This runs
            asynchronously — nothing is holding this request open.
          </p>
          <a class="dk-btn" href="#/docking/campaigns?id=${campaign.id}">Watch it →</a>
        </div>`;
    } catch (error) {
      host.innerHTML = notice(
        `<strong>The campaign was refused.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  });
}
