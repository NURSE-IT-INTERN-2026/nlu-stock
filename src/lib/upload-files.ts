import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";

// One generated filename only: no separators, nested paths, dot segments or alternate streams.
export function uploadFilename(parts: string[]): string | null {
  if (parts.length !== 1) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(parts[0])
    ? parts[0] : null;
}

export async function readStoredUpload(directory: string, filename: string) {
  if (!uploadFilename([filename])) throw new Error("Invalid upload filename");
  // Open once, refusing symlinks, so validation and reading operate on the same file.
  const file = await open(join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) throw new Error("Not a file");
    return await file.readFile();
  } finally {
    await file.close();
  }
}
