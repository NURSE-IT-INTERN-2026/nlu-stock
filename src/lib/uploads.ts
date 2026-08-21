// What the upload endpoint accepts, in one place: the API allowlist, the accept= strings the
// pickers use, and the extension we store under. Adding a format means editing this file only.
//
// HEIC is deliberately absent. The explicit accept strings below are what make that safe on
// iOS — a picker told "image/jpeg,image/png,image/webp" transcodes an HEIC shot to JPEG on the
// way out, while accept="image/*" hands over the raw HEIC the API then rejects.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 5;

/** mime → the extension we save it under. Also the API's allowlist: a type absent here is refused. */
export const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
} as const;

export type UploadMime = keyof typeof EXT_BY_MIME;

/** Serve-side inverse: what Content-Type to send back for a stored file. */
export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ...Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime])),
};

/** รูปพัสดุ — images only, no documents. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
/** หลักฐาน — รูปถ่าย or a scanned/quoted PDF. */
export const EVIDENCE_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;

/**
 * What the bytes actually are, ignoring both the filename and the browser-declared type — the
 * only two things an uploader controls. Returns null for anything not in EXT_BY_MIME.
 */
export function sniff(buf: Buffer): UploadMime | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}
