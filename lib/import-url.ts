import { MAX_UPLOAD_BYTES } from "@/lib/parse-score";

export interface ResolvedScore {
  data: Uint8Array;
  filename: string;
  sourceUrl: string;
  /** the page/file URL the score was ultimately downloaded from */
  assetUrl: string;
  title?: string;
}

const DIRECT_RE = /\.(mxl|musicxml|xml|mid|midi)(?:$|\?)/i;
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const BLOCKED_HOST_RE =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1$|\[::1\]|.*\.internal$|.*\.local$)/i;

function assertPublicHttpUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }
  if (BLOCKED_HOST_RE.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
    throw new Error("That host is not allowed.");
  }
}

function basename(pathname: string): string {
  const last = pathname.split("/").filter(Boolean).pop() ?? "score";
  return decodeURIComponent(last);
}

async function fetchBytes(url: string, accept: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: accept },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Could not download from that URL (${res.status}).`);
  }
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
    );
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
    );
  }
  return buf;
}

function guessFilename(assetUrl: string, fallbackExt: string): string {
  try {
    const name = basename(new URL(assetUrl).pathname);
    if (/\.[a-z0-9]+$/i.test(name)) return name;
    return `${name}${fallbackExt}`;
  } catch {
    return `score${fallbackExt}`;
  }
}

/** Pull score asset URLs out of a churchofjesuschrist.org song page. */
function extractChurchAssets(html: string): {
  musicxml: string[];
  midi: string[];
  title?: string;
} {
  const urls = new Set(
    html.match(
      /https:\/\/assets\.churchofjesuschrist\.org\/[A-Za-z0-9/_.-]+\.(?:mxl|musicxml|midi|mid)/gi,
    ) ?? [],
  );
  const musicxml: string[] = [];
  const midi: string[] = [];
  for (const u of urls) {
    if (/\.(mxl|musicxml)$/i.test(u)) musicxml.push(u);
    else midi.push(u);
  }
  const titleMatch =
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ??
    html.match(/"pageTitle"\s*:\s*"([^"]+)"/)?.[1];
  const title = titleMatch
    ? titleMatch
        .replace(/\s*[|–-]\s*The Church of Jesus Christ.*$/i, "")
        .replace(/\s*\|\s*.*$/, "")
        .trim()
    : undefined;
  return { musicxml, midi, title };
}

async function resolveChurchPage(url: URL): Promise<ResolvedScore> {
  if (!url.searchParams.has("lang")) url.searchParams.set("lang", "eng");
  const html = await fetch(url.toString(), {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    redirect: "follow",
  }).then((r) => {
    if (!r.ok) throw new Error(`Could not open that page (${r.status}).`);
    return r.text();
  });

  const { musicxml, midi, title } = extractChurchAssets(html);
  const chosen = musicxml[0] ?? midi[0];
  if (!chosen) {
    throw new Error(
      "No downloadable MusicXML or MIDI was found on that page. It may not be a song page, or the score isn't published for download.",
    );
  }
  const isXml = /\.(mxl|musicxml)$/i.test(chosen);
  const data = await fetchBytes(
    chosen,
    isXml ? "application/*" : "audio/midi",
  );
  return {
    data,
    filename: guessFilename(chosen, isXml ? ".mxl" : ".mid"),
    sourceUrl: url.toString(),
    assetUrl: chosen,
    title,
  };
}

export async function resolveScoreFromUrl(
  rawUrl: string,
): Promise<ResolvedScore> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  assertPublicHttpUrl(url);

  if (DIRECT_RE.test(url.pathname)) {
    const isXml = /\.(mxl|musicxml|xml)(?:$|\?)/i.test(url.pathname);
    const data = await fetchBytes(
      url.toString(),
      isXml ? "application/*" : "audio/midi",
    );
    return {
      data,
      filename: basename(url.pathname),
      sourceUrl: url.toString(),
      assetUrl: url.toString(),
    };
  }

  if (/(^|\.)churchofjesuschrist\.org$/i.test(url.hostname)) {
    return resolveChurchPage(url);
  }

  throw new Error(
    "Paste a direct link to a .mxl, .musicxml, or .mid file, or a churchofjesuschrist.org song page.",
  );
}
