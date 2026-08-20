/**
 * The molecule editor.
 *
 * Kekule.js, vendored under frontend/vendor/kekule/. Why not Ketcher, which
 * the phase brief names first: Ketcher's editor package declares **React 18/19
 * as a hard peer dependency** and ships no build-free distribution, so
 * embedding it means either adding React and a bundler to a deliberately
 * buildless frontend, or vendoring a bundle whose npm package unpacks to 110 MB
 * alongside a 45 MB WASM core. The platform's own constraint forbids converting
 * the frontend to a framework without an unavoidable technical requirement, and
 * a structure editor is not one. Kekule.js is MIT, ships a single UMD file with
 * no framework dependency, contains no `eval` or `Function` constructor — so it
 * runs under the existing Content-Security-Policy unchanged — and provides the
 * atom, bond and stereochemistry editing the brief lists. The full evaluation
 * is in docs/phase3-workbench.md.
 *
 * The division of labour matters more than the choice: **the editor proposes,
 * RDKit decides.** Whatever is drawn is exported as a molfile and sent to the
 * server, where the same RDKit standardiser every other part of the platform
 * uses parses it, canonicalises it and computes properties. The browser never
 * produces a chemical value.
 */

import { esc, loading, notice } from "../../ui.js";
import { wbApi } from "../api.js";

const KEKULE_JS = "vendor/kekule/kekule.min.js";
const KEKULE_CSS = "vendor/kekule/themes/default/kekule.css";

//: A few structures worth starting from, all real drugs.
const PRESETS = [
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Imatinib", smiles: "CN1CCN(Cc2ccc(cc2)C(=O)Nc2ccc(C)c(Nc3nccc(n3)-c3cccnc3)c2)CC1" },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C)C(=O)N2C" },
  { name: "Donepezil", smiles: "COc1cc2c(cc1OC)C(=O)C(CC1CCN(Cc3ccccc3)CC1)C2" },
];

let kekulePromise = null;

/** Load the vendored editor once, on demand. */
function loadKekule() {
  if (window.Kekule) return Promise.resolve(window.Kekule);
  if (kekulePromise) return kekulePromise;

  kekulePromise = new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-kekule-style]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = KEKULE_CSS;
      link.dataset.kekuleStyle = "true";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = KEKULE_JS;
    script.async = true;
    script.onload = () =>
      window.Kekule
        ? resolve(window.Kekule)
        : reject(new Error("Kekule loaded but exposed no global."));
    script.onerror = () =>
      reject(new Error(`Could not load the editor from ${KEKULE_JS}.`));
    document.head.appendChild(script);
  });
  return kekulePromise;
}

export async function editorView(root, params) {
  root.innerHTML = `
    <div class="wb-editor-layout">
      <section class="wb-editor-pane lg-surface lg-d1">
        <header class="wb-pane-head">
          <h3>Draw</h3>
          <div class="wb-presets">
            ${PRESETS.map(
              (p) =>
                `<button class="wb-chip-btn" data-smiles="${esc(p.smiles)}">${esc(
                  p.name
                )}</button>`
            ).join("")}
          </div>
        </header>
        <div id="wb-canvas" class="wb-canvas">${loading("Loading the editor…")}</div>
        <div class="wb-editor-io">
          <label for="wb-smiles-in">SMILES in / out</label>
          <div class="wb-io-row">
            <input id="wb-smiles-in" type="text" spellcheck="false" autocomplete="off"
                   placeholder="Paste a SMILES and press Load, or draw above"
                   value="${esc(params?.get("smiles") || "")}" />
            <button id="wb-load" class="wb-btn-quiet">Load</button>
            <button id="wb-read" class="wb-btn-quiet">Read from canvas</button>
          </div>
          <div class="wb-io-row">
            <button id="wb-analyse" class="wb-btn">Send to RDKit →</button>
            <button id="wb-molfile" class="wb-btn-quiet">Export molfile</button>
          </div>
          <p class="wb-note">
            The editor is a drawing surface. Every chemical value on the right is
            computed by RDKit on the server from the structure you send it.
          </p>
        </div>
      </section>

      <section class="wb-result-pane lg-surface lg-d1">
        <header class="wb-pane-head"><h3>RDKit</h3></header>
        <div id="wb-result">
          <div class="wb-idle">
            <span class="wb-idle-glyph">⌬</span>
            <p>Draw or load a structure, then send it to RDKit.</p>
          </div>
        </div>
      </section>
    </div>`;

  const canvas = root.querySelector("#wb-canvas");
  const input = root.querySelector("#wb-smiles-in");
  const resultHost = root.querySelector("#wb-result");

  let composer = null;
  let Kekule = null;

  try {
    Kekule = await loadKekule();
    canvas.innerHTML = "";
    composer = new Kekule.Editor.Composer(canvas);
    composer.setDimension("100%", "440px");
    // A sensible default toolset: draw bonds, atoms, rings, charges, stereo.
    composer.setEnableCreateNewDoc(true).setEnableLoadNewFile(true);
  } catch (error) {
    canvas.innerHTML = notice(
      `<strong>The structure editor could not be loaded.</strong><br />${esc(
        error.message
      )}<br />You can still paste a SMILES below and send it to RDKit — the
       server does the chemistry either way.`,
      "warn",
      "⚠"
    );
  }

  /**
   * Put a structure on the canvas.
   *
   * The vendored editor writes SMILES but registers no SMILES *reader* — its
   * readable formats are mol, mol3k, sd and cml only. So the server converts
   * the input to a molfile with RDKit-generated 2D coordinates first. That is
   * not a workaround so much as the right arrangement: what appears on the
   * canvas is then RDKit's reading of the structure, not a second parser's.
   */
  async function loadStructure(text) {
    if (!text?.trim()) return;
    input.value = text.trim();
    if (!composer || !Kekule) return;
    try {
      const result = await wbApi.molblock({ input: text.trim() });
      const molecule = Kekule.IO.loadFormatData(result.molblock, "mol");
      if (molecule) composer.setChemObj(molecule);
      input.value = result.molecule.canonical_smiles;
    } catch (error) {
      resultHost.innerHTML = notice(
        `<strong>RDKit could not read that structure.</strong><br />${esc(
          error.message
        )}`,
        "danger",
        "⚠"
      );
    }
  }

  /** Read whatever is on the canvas as a molfile. */
  function readMolfile() {
    if (!composer || !Kekule) return null;
    const chemObj = composer.getChemObj();
    if (!chemObj) return null;
    try {
      return Kekule.IO.saveFormatData(chemObj, "mol");
    } catch (error) {
      console.warn("could not export molfile", error);
      return null;
    }
  }

  function readSmiles() {
    if (!composer || !Kekule) return null;
    const chemObj = composer.getChemObj();
    if (!chemObj) return null;
    try {
      return Kekule.IO.saveFormatData(chemObj, "smi");
    } catch {
      return null;
    }
  }

  root.querySelectorAll(".wb-chip-btn").forEach((button) => {
    button.addEventListener("click", () => loadStructure(button.dataset.smiles));
  });

  root.querySelector("#wb-load").addEventListener("click", () => loadStructure(input.value));

  root.querySelector("#wb-read").addEventListener("click", () => {
    const smiles = readSmiles();
    if (smiles) {
      input.value = smiles;
    } else {
      resultHost.innerHTML = notice(
        "Nothing on the canvas to read.",
        "warn",
        "⚠"
      );
    }
  });

  root.querySelector("#wb-molfile").addEventListener("click", () => {
    const molfile = readMolfile();
    resultHost.innerHTML = molfile
      ? `<h4>Molfile</h4><pre class="wb-pre">${esc(molfile)}</pre>`
      : notice("Nothing on the canvas to export.", "warn", "⚠");
  });

  root.querySelector("#wb-analyse").addEventListener("click", async () => {
    // The molfile is preferred: it carries explicit coordinates and stereo
    // bonds, so what RDKit receives is what was drawn rather than a
    // re-interpretation of it.
    const molfile = readMolfile();
    const smiles = input.value.trim();
    const payload = molfile
      ? { molecules: molfile, format: "mol" }
      : smiles
        ? { molecules: smiles, format: "smiles" }
        : null;

    if (!payload) {
      resultHost.innerHTML = notice(
        "Draw a structure or paste a SMILES first.",
        "warn",
        "⚠"
      );
      return;
    }

    resultHost.innerHTML = loading("RDKit is parsing the structure…");
    try {
      const result = await wbApi.descriptors(payload);
      renderResult(resultHost, result, payload.format);
      const first = result.molecules?.[0];
      if (first?.canonical_smiles) input.value = first.canonical_smiles;
    } catch (error) {
      resultHost.innerHTML = notice(
        `<strong>RDKit refused this structure.</strong><br />${esc(error.message)}`,
        "danger",
        "⚠"
      );
    }
  });

  const preset = params?.get("smiles");
  if (preset) loadStructure(preset);
}

function renderResult(host, result, sourceFormat) {
  const molecule = result.molecules?.[0];
  if (!molecule) {
    host.innerHTML = notice("RDKit returned no molecule.", "warn", "⚠");
    return;
  }

  const block = molecule.descriptors || {};
  const rows = Object.entries(block)
    .map(([key, value]) => {
      const v = value && typeof value === "object" ? value : { value };
      if (v.value === null || v.value === undefined) return "";
      return `<tr>
        <th>${esc((v.label || key).toString())}</th>
        <td class="mono">${esc(String(v.value))}${
          v.unit ? ` <span class="dim">${esc(v.unit)}</span>` : ""
        }</td>
      </tr>`;
    })
    .join("");

  host.innerHTML = `
    <div class="wb-identity">
      <div class="wb-id-row"><span>Canonical SMILES</span>
        <code>${esc(molecule.canonical_smiles || "—")}</code></div>
      <div class="wb-id-row"><span>Formula</span>
        <code>${esc(molecule.formula || "—")}</code></div>
      <div class="wb-id-row"><span>InChIKey</span>
        <code>${esc(molecule.inchikey || "—")}</code></div>
      ${
        molecule.scaffold?.scaffold
          ? `<div class="wb-id-row"><span>Murcko scaffold</span>
               <code>${esc(molecule.scaffold.scaffold)}</code></div>`
          : ""
      }
      <div class="wb-id-row"><span>Read as</span>
        <code>${esc(sourceFormat)}</code></div>
    </div>

    ${
      molecule.notes?.length
        ? `<div class="wb-notes">${molecule.notes
            .map((n) => `<div>⚠ ${esc(n)}</div>`)
            .join("")}</div>`
        : ""
    }

    <table class="wb-props"><tbody>${rows}</tbody></table>

    <div class="wb-provenance">
      <span class="wb-badge-calc">calculated</span>
      ${esc(result.provenance.software)} ${esc(result.provenance.version)}
      <p>${esc(result.provenance.note)}</p>
    </div>`;
}
