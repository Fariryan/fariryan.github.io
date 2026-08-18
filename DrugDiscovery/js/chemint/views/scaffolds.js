/**
 * Scaffold families.
 *
 * A different question from the neighbourhood: scaffold membership is exact
 * and structural, while similarity is continuous. A molecule can be a close
 * neighbour with a different scaffold and a distant one with the same
 * scaffold, and both facts are worth seeing separately.
 *
 * The therapeutic-area strip on each family is the point of the whole
 * section. A scaffold is a chemical fact; its members routinely span
 * oncology, immunology and cardiovascular medicine, and that is precisely the
 * observation a fabric partitioned by indication cannot make.
 */

import { esc, loading, notice } from "../../ui.js";
import { chemApi } from "../api.js";
import { areaLabels, subject } from "../router.js";
import { areaPills, caveat, neighborBadge } from "../ui.js";

export async function scaffoldsView(root, params) {
  const entityId = params?.get("entity") || subject.get()?.entity_id;
  const labels = await areaLabels();

  root.innerHTML = loading("Loading scaffolds…");

  if (entityId) {
    await renderFamily(root, Number(entityId), labels);
    return;
  }
  await renderIndex(root, labels);
}

async function renderFamily(root, entityId, labels) {
  let family;
  try {
    family = await chemApi.scaffoldFamily(entityId, { limit: 200 });
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!family.scaffold) {
    root.innerHTML = `
      <div class="ci-empty">
        <div class="big">⬡</div>
        <p><strong>This molecule has no ring system.</strong></p>
        <p class="dim">${esc(family.note || "")}</p>
        <a class="sm" href="#/chemint/neighborhood?entity=${entityId}">
          Use the Chemical Neighborhood instead</a>
        <p><a href="#/chemint/scaffolds">Browse all scaffold families</a></p>
      </div>`;
    return;
  }

  const areas = family.therapeutic_areas || [];

  root.innerHTML = `
    <section class="card">
      <h3>Scaffold family
        <span class="spacer"></span>
        <a class="sm" href="#/chemint/scaffolds">All families</a>
      </h3>
      <div class="ci-scaffold-head">
        <div class="ci-scaffold-figure">
          <img alt="Scaffold structure"
               src="${esc(scaffoldImage(family.scaffold))}" />
        </div>
        <div>
          <div class="ci-scaffold-smiles mono">${esc(family.scaffold)}</div>
          <div class="ci-scaffold-count">
            ${family.total} member${family.total === 1 ? "" : "s"} in the fabric
          </div>
          <div class="ci-scaffold-areas">${areaPills(areas, labels)}</div>
        </div>
      </div>
      ${caveat(family.note)}
    </section>

    <section class="card">
      <h3>Members</h3>
      <table class="ci-table">
        <thead><tr>
          <th>Molecule</th><th>Class</th><th>Phase</th><th>MW</th>
          <th>Therapeutic areas</th>
        </tr></thead>
        <tbody>
          ${family.members
            .map(
              (member) => `
            <tr class="${member.is_query ? "ci-is-query" : ""}">
              <td>
                <a href="#/chemint/molecule?entity=${member.entity_id}">${esc(
                member.name
              )}</a>
                ${member.is_query ? '<em class="dim"> — this molecule</em>' : ""}
                <div class="dim small mono">${esc(member.inchikey || "")}</div>
              </td>
              <td>${neighborBadge({
                class: member.class,
                class_tone: member.class,
                class_label: member.class.replace(/_/g, " "),
              })}</td>
              <td>${member.max_phase ?? "—"}</td>
              <td class="mono">${
                member.molecular_weight
                  ? Number(member.molecular_weight).toFixed(1)
                  : "—"
              }</td>
              <td>${areaPills(member.therapeutic_areas, labels)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      ${
        family.truncated
          ? '<div class="dim small">Truncated; the family has more members than shown.</div>'
          : ""
      }
    </section>`;
}

async function renderIndex(root, labels) {
  let payload;
  try {
    payload = await chemApi.scaffolds({ limit: 80, min_members: 2 });
  } catch (error) {
    root.innerHTML = notice(esc(error.message), "danger", "⚠");
    return;
  }

  if (!payload.scaffolds.length) {
    root.innerHTML = `<div class="ci-empty">
      <div class="big">⬡</div>
      <p>No scaffold family has more than one member yet.</p>
      <p class="dim">Scaffold families form as more compounds are ingested.
      Each ingested molecule contributes its Bemis–Murcko scaffold.</p>
    </div>`;
    return;
  }

  root.innerHTML = `
    ${caveat(
      "Families are grouped by exact Bemis–Murcko scaffold — the ring " +
        "systems plus their linkers. A shared scaffold is a chemical fact and " +
        "implies nothing about shared activity, shared safety, or shared use."
    )}
    <div class="ci-scaffold-grid">
      ${payload.scaffolds
        .map(
          (scaffold) => `
        <a class="ci-scaffold-card"
           href="#/chemint/scaffolds?entity=${scaffold.entity_id}">
          <div class="ci-scaffold-thumb">
            <img loading="lazy" alt=""
                 src="${esc(scaffoldImage(scaffold.smiles))}" />
          </div>
          <div class="ci-scaffold-meta">
            <div class="n">${scaffold.member_count} members</div>
            ${
              scaffold.approved_member_count
                ? `<div class="approved">${scaffold.approved_member_count} approved</div>`
                : ""
            }
            <div class="dim small mono">${esc(
              scaffold.smiles.slice(0, 46)
            )}${scaffold.smiles.length > 46 ? "…" : ""}</div>
          </div>
        </a>`
        )
        .join("")}
    </div>`;
}

/**
 * Depiction for a scaffold.
 *
 * A scaffold is a SMILES string rather than a substance row, so it goes
 * through the fabric's by-SMILES depiction route rather than the by-entity
 * one.
 */
const scaffoldImage = (smiles) => chemApi.smilesDepictionUrl(smiles, 220, 170);
