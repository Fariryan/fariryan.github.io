/** The conversation, and the evidence behind every answer. */

import { esc, loading, notice } from "../../ui.js";
import { scientistApi } from "../api.js";

const CONTEXT_FIELDS = [
  ["therapeutic_area", "Therapeutic area", "text"],
  ["disease", "Disease", "text"],
  ["target", "Target", "text"],
  ["molecule", "Molecule (SMILES)", "text"],
  ["workflow_run_id", "Workflow run", "number"],
  ["optimizer_run_id", "Optimisation run", "number"],
  ["docking_campaign_id", "Docking campaign", "number"],
  ["md_run_id", "Simulation run", "number"],
];

export async function askView(root, params) {
  let status;
  let list;
  try {
    [status, list] = await Promise.all([
      scientistApi.status(), scientistApi.conversations(30),
    ]);
  } catch (error) { root.innerHTML = notice(esc(error.message), "danger", "⚠"); return; }

  const prefill = {};
  for (const [key] of CONTEXT_FIELDS) {
    const supplied = params?.get(key) || params?.get(key.replace(/_id$/, ""));
    if (supplied) prefill[key] = supplied;
  }

  let current = list.conversations[0] || null;

  root.innerHTML = `
    <section class="sci-panel lg-surface lg-d1">
      <header class="sci-panel-head">
        <div><strong>${esc(status.provider.name || "reasoning gateway")}</strong>
          <span class="sci-state ${status.provider.available ? "ok" : "no"}">
            ${status.provider.available ? "● available" : "⚠ unavailable"}</span>
          ${status.provider.unavailable_reason ? `<span class="dim small">${esc(status.provider.unavailable_reason)}</span>` : ""}
        </div>
        <div class="sci-caps">
          ${status.provider.supports_native_chat ? '<span class="sci-chip">native chat</span>' : ""}
          ${status.provider.supports_schema_enforcement ? '<span class="sci-chip">schema-enforced JSON</span>' : ""}
          <span class="sci-chip">${esc(status.gateway.surface)}</span>
        </div>
      </header>
      <p class="sci-note">${esc(status.method)}</p>
    </section>

    <div class="sci-layout">
      <aside class="sci-side lg-surface lg-d1">
        <button id="sci-new" class="sci-btn">New conversation</button>
        <div id="sci-list" class="sci-list">
          ${list.conversations.map((c) => `
            <button class="sci-conv ${current && c.id === current.id ? "active" : ""}" data-id="${c.id}">
              <div class="sci-conv-title">${esc(c.title)}</div>
              <div class="sci-conv-meta">${c.message_count} message${c.message_count === 1 ? "" : "s"}
                ${c.has_context ? "" : "· nothing attached"}</div>
            </button>`).join("") || '<p class="dim small">No conversation yet.</p>'}
        </div>

        <h4>Attached context</h4>
        <p class="sci-note">The assistant reads only what is attached here. With nothing attached it declines rather than answering from training data.</p>
        <div id="sci-context">
          ${CONTEXT_FIELDS.map(([key, label, type]) => `
            <label for="sci-${key}">${esc(label)}</label>
            <input id="sci-${key}" type="${type}" value="${esc(prefill[key] || "")}" />`).join("")}
        </div>
        <button id="sci-attach" class="sci-btn ghost">Attach to this conversation</button>
      </aside>

      <div class="sci-main">
        <div id="sci-thread" class="sci-thread">${loading("Loading…")}</div>
        <div class="sci-suggest" id="sci-suggest">
          ${status.suggested_questions.map((q) =>
            `<button class="sci-pill" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
        </div>
        <div class="sci-compose">
          <textarea id="sci-question" rows="3" placeholder="Ask about a run, a candidate, a target, or what is measured versus predicted…"></textarea>
          <button id="sci-ask" class="sci-btn">Ask</button>
        </div>
      </div>
    </div>`;

  const thread = root.querySelector("#sci-thread");
  const listHost = root.querySelector("#sci-list");

  async function open(id) {
    thread.innerHTML = loading("Loading…");
    try {
      const conversation = await scientistApi.conversation(id);
      current = conversation;
      for (const [key] of CONTEXT_FIELDS) {
        const field = root.querySelector(`#sci-${key}`);
        if (field) field.value = conversation.context[key] ?? "";
      }
      thread.innerHTML = renderThread(conversation);
      wireEvidence(thread);
    } catch (error) { thread.innerHTML = notice(esc(error.message), "danger", "⚠"); }
  }

  listHost.querySelectorAll(".sci-conv").forEach((button) =>
    button.addEventListener("click", () => {
      listHost.querySelectorAll(".sci-conv").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      open(Number(button.dataset.id));
    }));

  root.querySelector("#sci-new").addEventListener("click", async () => {
    const payload = { title: "New conversation", ...collectContext(root) };
    try {
      const conversation = await scientistApi.create(payload);
      location.hash = "#/scientist/ask";
      await askView(root, new URLSearchParams({ }));
      await open(conversation.id);
    } catch (error) { thread.innerHTML = notice(esc(error.message), "danger", "⚠"); }
  });

  root.querySelector("#sci-attach").addEventListener("click", async () => {
    if (!current) return;
    try {
      await scientistApi.attach(current.id, collectContext(root));
      await open(current.id);
    } catch (error) { thread.innerHTML = notice(esc(error.message), "warn", "⚠"); }
  });

  root.querySelectorAll(".sci-pill").forEach((pill) =>
    pill.addEventListener("click", () => {
      root.querySelector("#sci-question").value = pill.dataset.q;
    }));

  root.querySelector("#sci-ask").addEventListener("click", async () => {
    const field = root.querySelector("#sci-question");
    const question = field.value.trim();
    if (!question) return;
    if (!current) {
      const conversation = await scientistApi.create({
        title: question.slice(0, 60), ...collectContext(root),
      });
      current = conversation;
    }
    const button = root.querySelector("#sci-ask");
    button.disabled = true;
    thread.insertAdjacentHTML("beforeend",
      `<div class="sci-msg user"><div class="sci-msg-body">${esc(question)}</div></div>
       <div class="sci-msg assistant pending" id="sci-pending">${loading("Retrieving records, then reasoning over them…")}</div>`);
    thread.scrollTop = thread.scrollHeight;
    field.value = "";
    try {
      await scientistApi.ask(current.id, question);
      await open(current.id);
      thread.scrollTop = thread.scrollHeight;
    } catch (error) {
      const pending = root.querySelector("#sci-pending");
      if (pending) pending.innerHTML = notice(esc(error.message), "danger", "⚠");
    } finally { button.disabled = false; }
  });

  if (current) await open(current.id);
  else thread.innerHTML = `<p class="dim">Start a conversation, attach what it should be about, and ask.</p>`;
}

function collectContext(root) {
  const out = {};
  for (const [key, , type] of CONTEXT_FIELDS) {
    const value = root.querySelector(`#sci-${key}`)?.value?.trim();
    out[key] = value ? (type === "number" ? Number(value) : value) : null;
  }
  return out;
}

function renderThread(conversation) {
  if (!conversation.messages.length) {
    return `<p class="dim">Nothing asked yet. ${
      conversation.has_context
        ? "Context is attached, so answers will be grounded in it."
        : "Nothing is attached, so the assistant will decline rather than guess."}</p>`;
  }
  return conversation.messages.map((m) => {
    if (m.role === "system_note") {
      return `<div class="sci-msg note"><div class="sci-msg-body">${esc(m.content)}</div></div>`;
    }
    if (m.role === "user") {
      return `<div class="sci-msg user"><div class="sci-msg-body">${esc(m.content)}</div></div>`;
    }
    const provenance = m.provenance || {};
    const found = (m.retrieval || {}).blocks_found || [];
    const absent = (m.retrieval || {}).blocks_absent || [];
    return `
      <div class="sci-msg assistant">
        <div class="sci-msg-body">${esc(m.content).replace(/\n/g, "<br />")}</div>
        <div class="sci-msg-foot">
          <span class="sci-ground ${m.grounded === true ? "yes" : m.grounded === false ? "no" : "err"}">
            ${m.grounded === true ? "grounded in records" : m.grounded === false ? "no records — declined" : "gateway error"}</span>
          ${provenance.resolved_model ? `<span class="mono small dim">${esc(provenance.resolved_model)}</span>` : ""}
          ${provenance.records_shown != null ? `<span class="dim small">${provenance.records_shown} records read</span>` : ""}
          ${found.length ? `<span class="dim small">found: ${found.map(esc).join(", ")}</span>` : ""}
          ${absent.length ? `<span class="dim small">absent: ${absent.map(esc).join(", ")}</span>` : ""}
          <button class="sci-evidence-toggle" data-message="${m.id}" data-conversation="${conversation.id}">Show the evidence</button>
        </div>
        <div class="sci-evidence" id="sci-ev-${m.id}" hidden></div>
        ${provenance.grounding ? `<p class="sci-caveat">${esc(provenance.grounding)}</p>` : ""}
      </div>`;
  }).join("");
}

function wireEvidence(thread) {
  thread.querySelectorAll(".sci-evidence-toggle").forEach((button) =>
    button.addEventListener("click", async () => {
      const host = thread.querySelector(`#sci-ev-${button.dataset.message}`);
      if (!host.hidden) { host.hidden = true; button.textContent = "Show the evidence"; return; }
      host.hidden = false;
      button.textContent = "Hide the evidence";
      host.innerHTML = loading("Loading records…");
      try {
        const message = await scientistApi.message(
          Number(button.dataset.conversation), Number(button.dataset.message));
        host.innerHTML = (message.evidence || []).map((block) => `
          <div class="sci-block ${block.found ? "" : "absent"}">
            <div class="sci-block-head">
              <strong>${esc(block.kind.replace(/_/g, " "))}</strong>
              <span class="dim small">${block.found ? `${block.count} record(s)` : "not available"}</span>
            </div>
            <p class="sci-note">${esc(block.note || "")}</p>
            ${block.found ? `<pre class="sci-records">${esc(
              JSON.stringify(block.records, null, 1).slice(0, 8000))}</pre>` : ""}
          </div>`).join("") || '<p class="dim small">No evidence was recorded for this message.</p>';
      } catch (error) { host.innerHTML = notice(esc(error.message), "danger", "⚠"); }
    }));
}
