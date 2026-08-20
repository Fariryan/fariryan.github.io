/**
 * The selected therapeutic area and disease.
 *
 * Persisted in localStorage under its own key, so this module never touches
 * the atlas's comparison tray, the lab's subject, or Chemical Intelligence's
 * selected molecule. Every other module keeps working whether or not an area
 * has ever been chosen — the selection is an entry point, not a global mode.
 *
 * That last point is the important one. Choosing Oncology does not hide the
 * neuroscience atlas or reconfigure any existing view; it decides which
 * workspace the area section opens and which property panels it surfaces.
 */

const KEY = "dd.areas.selection.v1";

const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const selection = {
  get: read,

  set(value) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* a full or blocked localStorage must not break navigation */
    }
    listeners.forEach((fn) => {
      try {
        fn(value);
      } catch (error) {
        console.error(error);
      }
    });
  },

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* as above */
    }
    listeners.forEach((fn) => fn(null));
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
