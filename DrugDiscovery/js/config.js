/**
 * Where the API lives.
 *
 * The UI is published to GitHub Pages at fariryan.github.io/DrugDiscovery,
 * while the API runs on a private server reached through the neuro.roneu.com
 * Cloudflare Tunnel. In that deployment the two are different origins, so API
 * requests must be absolute and the backend must allow this origin in CORS.
 *
 * Served by the backend itself — local development, or opening
 * neuro.roneu.com directly — an empty origin keeps every request same-origin,
 * which is what the local `uvicorn app.main:app` setup expects.
 *
 * Everything else in the frontend is addressed *relatively* so the same files
 * work whether they sit at the root of a domain or under a /DrugDiscovery/
 * path. Routing is hash-based, so the document URL never changes and relative
 * URLs stay stable no matter which view is open.
 */
export const API_ORIGIN = location.hostname.endsWith("github.io")
  ? "https://neuro.roneu.com"
  : "";
