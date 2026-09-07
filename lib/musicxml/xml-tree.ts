import { XMLParser } from "fast-xml-parser";

/**
 * Thin helpers over fast-xml-parser's `preserveOrder` output. That mode
 * keeps sibling order (essential for `<backup>` / `<forward>` / `<note>`
 * sequencing) at the cost of a verbose shape: every node is an object
 * with exactly one "content" key (an array of child nodes) plus an
 * optional ":@" key holding attributes. Text is `{ "#text": value }`.
 */

export type XmlNode = Record<string, unknown>;

export function parseXml(xml: string): XmlNode[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    // treat these as always-array so single occurrences don't surprise us
  });
  return parser.parse(xml) as XmlNode[];
}

export function tagName(node: XmlNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text") return key;
  }
  return undefined;
}

export function childrenOf(node: XmlNode): XmlNode[] {
  const tag = tagName(node);
  if (!tag) return [];
  const value = node[tag];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

export function attr(node: XmlNode, name: string): string | number | undefined {
  const bag = node[":@"] as Record<string, unknown> | undefined;
  if (!bag) return undefined;
  const v = bag[`@_${name}`];
  return v as string | number | undefined;
}

export function findChild(node: XmlNode, tag: string): XmlNode | undefined {
  return childrenOf(node).find((c) => tagName(c) === tag);
}

export function findChildren(node: XmlNode, tag: string): XmlNode[] {
  return childrenOf(node).filter((c) => tagName(c) === tag);
}

/** Deep-first search for the first descendant (or self) with the given tag. */
export function findDeep(node: XmlNode, tag: string): XmlNode | undefined {
  if (tagName(node) === tag) return node;
  for (const child of childrenOf(node)) {
    const hit = findDeep(child, tag);
    if (hit) return hit;
  }
  return undefined;
}

export function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  const tag = tagName(node);
  if (!tag) {
    const t = node["#text"];
    return t === undefined || t === null ? "" : String(t);
  }
  let out = "";
  for (const child of childrenOf(node)) {
    const t = child["#text"];
    if (t !== undefined && t !== null) out += String(t);
  }
  return out.trim();
}

export function numOf(
  node: XmlNode | undefined,
  fallback = 0,
): number {
  const s = textOf(node);
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
