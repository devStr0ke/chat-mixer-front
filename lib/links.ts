export type TextPart = { type: "text"; value: string } | { type: "link"; url: string; label: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const MAX_LABEL = 48;

function count(text: string, ch: string): number {
  return text.split(ch).length - 1;
}

/** Removes punctuation that belongs to the sentence rather than the URL. */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (".,!?;:".includes(ch)) {
      end--;
    } else if (ch === ")" && count(url.slice(0, end), ")") > count(url.slice(0, end), "(")) {
      // an unmatched ")" closes the sentence's parenthesis, not the URL's:
      // "(see https://example.com)" — but wiki-style "…/Dune_(novel)" stays whole
      end--;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

function isValidUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes(".");
  } catch {
    return false;
  }
}

/** "https://www.example.com/some/long/path/" → "example.com/some/long/path", shortened. */
export function linkLabel(url: string): string {
  const label = url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

/** Splits message text into plain text and links. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTrailing(match[0]);
    const start = match.index ?? 0;
    if (!isValidUrl(url)) continue;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", url, label: linkLabel(url) });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/** The first link in a message, which is the one that gets a preview card. */
export function firstLink(text: string): string | null {
  const link = splitLinks(text).find((p) => p.type === "link");
  return link?.type === "link" ? link.url : null;
}
