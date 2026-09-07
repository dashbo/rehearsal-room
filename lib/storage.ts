import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Local filesystem storage for uploaded score files. A single function
 * boundary so this can become S3 (or similar) later without touching
 * callers.
 */

const STORAGE_DIR = path.join(process.cwd(), "storage");

function resolveInStorage(filePath: string): string {
  const abs = path.resolve(STORAGE_DIR, filePath);
  if (abs !== STORAGE_DIR && !abs.startsWith(STORAGE_DIR + path.sep)) {
    throw new Error("Refusing to access path outside storage dir");
  }
  return abs;
}

/** Persist an uploaded file. Returns a storage-relative path to store in the DB. */
export async function saveUpload(
  buffer: Buffer,
  ext: string,
): Promise<string> {
  await mkdir(STORAGE_DIR, { recursive: true });
  const safeExt = ext.replace(/[^a-z0-9.]/gi, "").toLowerCase();
  const name = `${randomUUID()}${safeExt.startsWith(".") ? "" : "."}${safeExt}`;
  const abs = resolveInStorage(name);
  await writeFile(abs, buffer);
  return name;
}

export async function readUpload(filePath: string): Promise<Buffer> {
  return readFile(resolveInStorage(filePath));
}

export async function deleteUpload(filePath: string): Promise<void> {
  try {
    await unlink(resolveInStorage(filePath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
