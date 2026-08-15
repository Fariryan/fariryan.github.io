/**
 * Running jobs that outlive the view that started them.
 *
 * Shared by Discovery Lab and the preclinical laboratory — both run against the
 * same server-side queue, so one store and one cancel path serve both.
 *
 * A docking run is seconds; a molecular-dynamics run is minutes. Tying the
 * result to the lifetime of a view means the work is thrown away the moment
 * the user looks at anything else — and since the *server* keeps computing
 * regardless, that is the worst of both: the core is spent and the answer is
 * lost.
 *
 * So the job id is written to localStorage under its slot, and any view that
 * owns that slot reattaches on mount. Leave the tab, come back, and the run is
 * still there — progressing, or finished with its result. It stops when the
 * user stops it, and at no other time.
 *
 * One poller per slot, held here rather than in a view, so navigating away and
 * back does not leave two pollers racing on the same job.
 */

import { API_ORIGIN } from "./config.js";
import { esc, loading, notice } from "./ui.js";

const STORAGE_KEY = "neuroatlas.jobs";
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** Active pollers, by slot. Never serialised — they belong to this page load. */
const pollers = new Map();
const listeners = new Map();

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage disabled: jobs simply do not survive navigation */
  }
}

async function fetchJob(jobId) {
  const response = await fetch(`${API_ORIGIN}/api/v1/lab/jobs/${jobId}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export const jobStore = {
  /** The job recorded for a slot, if any. */
  get(slot) {
    return readAll()[slot] || null;
  },

  /** Record a newly started job and begin polling it. */
  start(slot, job, { label = "" } = {}) {
    const all = readAll();
    all[slot] = {
      id: job.id,
      kind: job.kind,
      label,
      started_at: new Date().toISOString(),
      status: job.status,
    };
    writeAll(all);
    this.poll(slot);
    return all[slot];
  },

  /** Forget a slot entirely, stopping its poller. */
  clear(slot) {
    const all = readAll();
    delete all[slot];
    writeAll(all);
    const poller = pollers.get(slot);
    if (poller) {
      clearTimeout(poller);
      pollers.delete(slot);
    }
  },

  /**
   * Subscribe to a slot. Fires immediately with whatever is known, then on
   * every poll. Returns an unsubscribe function.
   */
  subscribe(slot, listener) {
    if (!listeners.has(slot)) listeners.set(slot, new Set());
    listeners.get(slot).add(listener);

    const record = this.get(slot);
    if (record) {
      // Reattach: the view was remounted, so resume polling if the job is
      // still live and hand over the finished result if it is not.
      this.poll(slot);
    }
    return () => listeners.get(slot)?.delete(listener);
  },

  emit(slot, job) {
    listeners.get(slot)?.forEach((listener) => {
      try {
        listener(job);
      } catch (error) {
        console.error("job listener failed", error);
      }
    });
  },

  /** Poll a slot's job until it reaches a terminal state. */
  async poll(slot, { intervalMs = 1500 } = {}) {
    const record = this.get(slot);
    if (!record) return;

    // One poller per slot: remounting a view must not start a second.
    const existing = pollers.get(slot);
    if (existing) clearTimeout(existing);

    const tick = async () => {
      const current = this.get(slot);
      if (!current) return;

      let job;
      try {
        job = await fetchJob(current.id);
      } catch (error) {
        // A transient failure is not a reason to abandon a running job; the
        // server is still computing. Report and retry.
        this.emit(slot, { ...current, status: current.status, poll_error: error.message });
        pollers.set(slot, setTimeout(tick, intervalMs * 3));
        return;
      }

      const all = readAll();
      if (all[slot]) {
        all[slot].status = job.status;
        writeAll(all);
      }
      this.emit(slot, job);

      if (TERMINAL.has(job.status)) {
        pollers.delete(slot);
        return;
      }
      pollers.set(slot, setTimeout(tick, intervalMs));
    };

    await tick();
  },

  /** Ask the server to stop the job in a slot. */
  async stop(slot) {
    const record = this.get(slot);
    if (!record) return null;
    const response = await fetch(
      `${API_ORIGIN}/api/v1/lab/jobs/${record.id}/cancel`,
      { method: "POST" }
    );
    // A 409 means it already finished — not an error worth surfacing.
    const job = response.ok ? await response.json() : await fetchJob(record.id);
    const all = readAll();
    if (all[slot]) {
      all[slot].status = job.status;
      writeAll(all);
    }
    const poller = pollers.get(slot);
    if (poller) {
      clearTimeout(poller);
      pollers.delete(slot);
    }
    this.emit(slot, job);
    return job;
  },

  /** Every slot with a job still running, for the global indicator. */
  running() {
    return Object.entries(readAll())
      .filter(([, record]) => !TERMINAL.has(record.status))
      .map(([slot, record]) => ({ slot, ...record }));
  },
};

/**
 * Render the run/stop control for a slot.
 *
 * Deliberately one control that changes role rather than two buttons: while a
 * job runs, the only useful action is to stop it, and a live Run button invites
 * a second identical run.
 */
export function runControl(job, { runLabel = "Run", idleDisabled = false } = {}) {
  const running = job && !TERMINAL.has(job.status);
  const percent = Math.round((job?.progress || 0) * 100);

  if (running) {
    return `<button class="sm" data-job-stop title="Stop this run">■ Stop</button>
      <span class="job-chip running">
        <span class="dot"></span>${escapeText(job.stage || job.status)}${
          job.progress ? ` · ${percent}%` : ""
        }</span>
      <span class="small dim">Runs in the background — you can leave this tab.</span>`;
  }

  const finished =
    job && job.status === "completed"
      ? `<span class="job-chip">✓ finished</span>`
      : job && job.status === "cancelled"
        ? `<span class="job-chip">■ stopped</span>`
        : job && job.status === "failed"
          ? `<span class="job-chip failed"><span class="dot"></span>failed</span>`
          : "";

  return `<button class="sm primary" data-job-run ${
    idleDisabled ? "disabled" : ""
  }>▶ ${escapeText(runLabel)}</button>${finished}`;
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

/**
 * Bind one stage of a view to a job slot.
 *
 * The view keeps no polling state of its own: it subscribes, and the store
 * drives it. That is what lets a run survive a navigation — the store outlives
 * the DOM that started it, so a remounted view picks the job back up mid-flight
 * instead of showing an empty panel while the server keeps working.
 *
 * `start` returns the queued job, `render` draws a finished result. Everything
 * between the two — progress, stopping, failure, the stopped-without-a-result
 * case — is handled here so every stage reports it the same way.
 */
export function bindJob(root, slot, options) {
  const control = root.querySelector(options.control);
  const output = options.output ? root.querySelector(options.output) : null;
  if (!control) return () => {};

  const paint = (job) => {
    control.innerHTML = runControl(job, {
      runLabel: options.runLabel,
      idleDisabled: options.disabled,
    });

    control.querySelector("[data-job-run]")?.addEventListener("click", async () => {
      control.innerHTML = loading("Queueing…");
      if (output) output.innerHTML = "";
      try {
        const started = await options.start();
        const job = started?.job || started;
        if (!job?.id) throw new Error("the server did not return a job");
        jobStore.start(slot, job, { label: options.runLabel });
      } catch (error) {
        if (output) output.innerHTML = notice(esc(error.message), "danger", "⚠");
        paint(null);
      }
    });

    control.querySelector("[data-job-stop]")?.addEventListener("click", async () => {
      control.innerHTML = loading("Stopping…");
      try {
        await jobStore.stop(slot);
      } catch (error) {
        if (output) output.innerHTML = notice(esc(error.message), "warn", "⚠");
        paint(jobStore.get(slot));
      }
    });

    if (!job || !output) return;

    if (job.status === "completed" && job.result) {
      try {
        options.render(output, job.result, job);
      } catch (error) {
        output.innerHTML = notice(
          `The run finished but its result could not be displayed: ${esc(error.message)}`,
          "danger",
          "⚠"
        );
      }
    } else if (job.status === "failed") {
      output.innerHTML = notice(
        `<strong>The run failed.</strong><br />${esc(job.error || "no reason reported")}`,
        "danger",
        "⚠"
      );
    } else if (job.status === "cancelled") {
      output.innerHTML = notice(
        "Stopped before it finished, so there is no result to show.",
        "muted",
        "■"
      );
    } else if (job.poll_error) {
      // The server is still computing; only the status check failed.
      output.innerHTML = notice(
        `Lost contact while checking on the run (${esc(job.poll_error)}). Still retrying.`,
        "warn",
        "⚠"
      );
    }
  };

  const unsubscribe = jobStore.subscribe(slot, paint);
  const known = jobStore.get(slot);
  paint(known);

  // A stage that runs itself on arrival must not re-run on every remount: the
  // slot already holding a job — running or finished — is the record of that.
  if (options.autoStart && !known) control.querySelector("[data-job-run]")?.click();

  return unsubscribe;
}
