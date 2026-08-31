// The app is served from a subpath (/nlu-stock) on the faculty server, and the CMU OAuth
// callback is registered against that prefix — so next.config sets `basePath` to this value.
//
// Next prefixes <Link>, router navigations and next/image for us. It does NOT touch
// `fetch()`, `window.location.href`, or image srcs built from DB strings. Those go
// through withBase() below. Keep this file dependency-free: next.config.ts imports it.
export const BASE_PATH = "/nlu-stock";

/**
 * Prefix an app-absolute path with the basePath.
 * Passes through blob:/data:/http: URLs untouched (file-upload previews are blob URLs),
 * and is idempotent so a value that already carries the prefix isn't doubled.
 */
export function withBase(path: string): string {
  if (!path.startsWith("/")) return path;
  if (path === BASE_PATH || path.startsWith(BASE_PATH + "/")) return path;
  return BASE_PATH + path;
}
