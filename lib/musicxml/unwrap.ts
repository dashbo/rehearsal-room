import { unzipSync, strFromU8 } from "fflate";

/**
 * A `.mxl` file is a zip archive. `META-INF/container.xml` names the
 * rootfile (the actual score XML). Uncompressed MusicXML is returned as-is.
 */
export function unwrapMusicXml(
  data: Uint8Array,
  filename: string,
): string {
  const isZip = data[0] === 0x50 && data[1] === 0x4b; // "PK"
  if (!isZip && !filename.toLowerCase().endsWith(".mxl")) {
    return strFromU8(data);
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    // Not actually a zip — fall back to treating it as plain XML.
    return strFromU8(data);
  }

  const container = files["META-INF/container.xml"];
  if (container) {
    const xml = strFromU8(container);
    const match = xml.match(/<rootfile[^>]*full-path=["']([^"']+)["']/i);
    if (match) {
      const target = match[1];
      const entry = files[target] ?? files[target.replace(/^\.?\//, "")];
      if (entry) return strFromU8(entry);
    }
  }

  // No usable container — pick the first plausible score file.
  const candidate = Object.keys(files).find(
    (k) =>
      !k.startsWith("META-INF/") &&
      (k.toLowerCase().endsWith(".xml") ||
        k.toLowerCase().endsWith(".musicxml")),
  );
  if (candidate) return strFromU8(files[candidate]);

  throw new Error("Could not find a score file inside the .mxl archive");
}
