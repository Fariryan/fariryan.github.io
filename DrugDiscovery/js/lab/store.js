/**
 * Discovery Lab state: the selected subject and the candidate workbench.
 *
 * Both live in localStorage under their own keys, so the lab never touches the
 * atlas's comparison tray. A candidate saved in the workbench keeps its full
 * payload — properties, model versions, provenance — because a saved structure
 * without its provenance is not a scientific record and could not be exported
 * as one later.
 */

const SUBJECT_KEY = "neuroatlas.lab.subject";
const WORKBENCH_KEY = "neuroatlas.lab.workbench";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a full or disabled localStorage must not break the interface */
  }
}

/* ------------------------------------------------------------- subject */

const subjectListeners = new Set();

export const subjectStore = {
  get() {
    return read(SUBJECT_KEY, null);
  },
  set(subject) {
    write(SUBJECT_KEY, subject);
    subjectListeners.forEach((listener) => listener(subject));
  },
  clear() {
    localStorage.removeItem(SUBJECT_KEY);
    subjectListeners.forEach((listener) => listener(null));
  },
  subscribe(listener) {
    subjectListeners.add(listener);
    listener(this.get());
    return () => subjectListeners.delete(listener);
  },
};

/* ----------------------------------------------------------- workbench */

const workbenchListeners = new Set();

export const workbench = {
  all() {
    return read(WORKBENCH_KEY, []);
  },
  has(inchikey) {
    return this.all().some((item) => item.inchikey === inchikey);
  },
  add(candidate) {
    const items = this.all();
    if (items.some((item) => item.inchikey === candidate.inchikey)) return items;
    const next = [
      ...items,
      { ...candidate, saved_at: new Date().toISOString() },
    ];
    write(WORKBENCH_KEY, next);
    workbenchListeners.forEach((listener) => listener(next));
    return next;
  },
  remove(inchikey) {
    const next = this.all().filter((item) => item.inchikey !== inchikey);
    write(WORKBENCH_KEY, next);
    workbenchListeners.forEach((listener) => listener(next));
    return next;
  },
  clear() {
    write(WORKBENCH_KEY, []);
    workbenchListeners.forEach((listener) => listener([]));
  },
  subscribe(listener) {
    workbenchListeners.add(listener);
    listener(this.all());
    return () => workbenchListeners.delete(listener);
  },
};
