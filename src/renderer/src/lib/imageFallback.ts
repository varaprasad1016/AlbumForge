/**
 * Shared decode-error fallback for thumbnail/`<img>` surfaces.
 *
 * Provider CDNs (and the native proxy cache) occasionally serve a file the
 * browser cannot decode — a malformed or unsupported WebP/JPEG, a truncated
 * download, a race right after cache clearing. Instead of a broken-image
 * glyph, every grid/thumbnail swaps to this neutral placeholder once.
 * Deliberately tiny and dependency-free: one data URI + one handler.
 */

const PLACEHOLDER_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>` +
  `<rect width='64' height='64' fill='%23eef2f7'/>` +
  `<rect x='1' y='1' width='62' height='62' fill='none' stroke='%23dde4ec' stroke-width='2'/>` +
  `<circle cx='32' cy='26' r='7' fill='%23c3cdd9'/>` +
  `<path d='M16 50l12-16 9 11 6-7 8 12z' fill='%23c3cdd9'/>`;

/** Neutral "image unavailable" placeholder — safe in any `src`. */
export const thumbPlaceholder = `data:image/svg+xml;utf8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

/**
 * Swap a failed `<img>` to the placeholder (once). Use as
 * `onError={fallbackToPlaceholder}` on any thumbnail.
 */
export function fallbackToPlaceholder(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  if (img.src === thumbPlaceholder) return;
  // Guard against an error loop if the placeholder itself ever fails.
  img.onerror = null;
  img.src = thumbPlaceholder;
}
