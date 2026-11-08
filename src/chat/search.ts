import type { SourceLink } from "./flow";

const SEARCH_PREFIX = /^(?:please\s+)?(?:search(?:\s+the\s+web)?(?:\s+for)?|look\s+up)\b/i;

/** Null when the message is not a search. Guest names never become the query. */
export function searchRequest(text: string, guestNames: string[]): { query: string } | { error: string } | null {
  const trimmed = text.trim();
  if (!SEARCH_PREFIX.test(trimmed)) return null;
  const query = trimmed.replace(SEARCH_PREFIX, "").replace(/^\s*(?:for\s+)?/i, "").trim();
  if (!query) return { error: "Add a public question after Search the web for." };
  const lower = query.toLowerCase();
  const named = guestNames.find((name) => name && lower.includes(name.toLowerCase()));
  if (named) return { error: `“${named}” is on this page's sample list. Search public questions only.` };
  if (/\b(password|api[_ -]?key|secret)\b/i.test(query)) return { error: "Don't put secrets in a search." };
  if (query.length > 300) return { error: "Keep the search under 300 characters." };
  return { query };
}

export function safeSources(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) return [];
  const list: SourceLink[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const source = item as { url?: unknown; title?: unknown; host?: unknown };
    if (typeof source.url !== "string") continue;
    let url: URL;
    try {
      url = new URL(source.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password || seen.has(url.toString())) continue;
    seen.add(url.toString());
    const host = typeof source.host === "string" && source.host ? source.host : url.host.replace(/^www\./, "");
    const title = typeof source.title === "string" && source.title.trim() ? source.title.trim() : host;
    list.push({ url: url.toString(), title: title.slice(0, 120), host: host.slice(0, 80) });
    if (list.length === 5) break;
  }
  return list;
}
