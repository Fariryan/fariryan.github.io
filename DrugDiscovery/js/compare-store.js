/** Session-scoped selection tray for the comparison view. */

const KEY = "neuroatlas.compare";
const listeners = new Set();

function read() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(items) {
  sessionStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((fn) => fn(items));
}

export const compareStore = {
  items: () => read(),
  add(entity) {
    const items = read();
    if (items.some((i) => i.id === entity.id)) return items;
    // Six columns is the practical limit before the table stops being readable.
    const next = [...items, entity].slice(-6);
    write(next);
    return next;
  },
  remove(id) {
    write(read().filter((i) => i.id !== id));
  },
  clear() {
    write([]);
  },
  subscribe(fn) {
    listeners.add(fn);
    fn(read());
    return () => listeners.delete(fn);
  },
};
