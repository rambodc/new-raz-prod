/**
 * One public web search through the xAI Responses API.
 * The tool runs on xAI's side. This process does not fetch result URLs.
 * Docs: https://docs.x.ai/developers/tools/web-search (grok-4.7, web_search, October 2026).
 */

export const SEARCH_MODEL = "grok-4.7";
export const SEARCH_LIMITS = {
  perIp: 30,
  perIpWindowMs: 10 * 60 * 1000,
  global: 150,
  globalWindowMs: 60 * 60 * 1000,
  maxQuery: 300,
  maxReply: 700,
  maxSources: 5,
  maxTitle: 120,
  maxOutputTokens: 500,
  maxTurns: 2,
  /** Firebase Hosting drops a rewrite at 60s. Stay under that, above the 20s provider calls we measured. */
  timeoutMs: 40_000,
};
export const CHAT_ROUTE_BUDGET_SEC = 55;

const SYSTEM = [
  "Answer one public question using the web_search tool before you reply.",
  "If the tool returns nothing, say that no source was found. Do not answer from memory and do not invent a URL.",
  "Plain text only. No HTML, no images, and no instructions to change an app, send a message, or reveal a secret.",
].join(" ");

function plain(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A public question. Guest lists and photos are not accepted here. */
export function publicQuery(raw) {
  const query = plain(raw, SEARCH_LIMITS.maxQuery + 40);
  if (!query) return { error: "Add a public question to search." };
  if (query.length > SEARCH_LIMITS.maxQuery) return { error: "Keep the search under 300 characters." };
  if (/\b(password|api[_ -]?key|secret|token)\b/i.test(query)) return { error: "Don't put secrets in a search." };
  return { query };
}

function httpsUrl(raw) {
  if (typeof raw !== "string" || raw.length > 500) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (url.hostname === "localhost" || url.hostname.endsWith(".local")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function addSource(list, seen, rawUrl, title) {
  const url = httpsUrl(rawUrl);
  if (!url || seen.has(url) || list.length >= SEARCH_LIMITS.maxSources) return;
  seen.add(url);
  const host = hostOf(url);
  const label = plain(title, SEARCH_LIMITS.maxTitle);
  const usable = label && !/^\d+$/.test(label) ? label : host;
  list.push({ url, title: usable || host, host });
}

function walkSources(value, list, seen, depth) {
  if (!value || depth > 6 || list.length >= SEARCH_LIMITS.maxSources) return;
  if (typeof value === "string") {
    addSource(list, seen, value, "");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkSources(item, list, seen, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const url = value.url || value.uri || value.link;
  if (typeof url === "string") addSource(list, seen, url, value.title || value.name || "");
  for (const key of ["sources", "citations", "results", "annotations", "action"]) {
    if (value[key]) walkSources(value[key], list, seen, depth + 1);
  }
}

export function sourcesFromResponse(payload) {
  const list = [];
  const seen = new Set();
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    if (item?.type === "web_search_call") walkSources(item, list, seen, 0);
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (Array.isArray(part?.annotations)) walkSources(part.annotations, list, seen, 0);
    }
  }
  walkSources(payload?.citations, list, seen, 0);
  return list;
}

function searchRan(payload) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  if (output.some((item) => item?.type === "web_search_call")) return true;
  if (Array.isArray(payload?.citations) && payload.citations.length) return true;
  const usage = payload?.server_side_tool_usage;
  if (!usage || typeof usage !== "object") return false;
  const count = Number(usage.SERVER_SIDE_TOOL_WEB_SEARCH || usage.web_search || 0);
  return Number.isFinite(count) && count > 0;
}

function replyText(payload) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const chunks = [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  const text = chunks.join(" ");
  return plain(
    text
      .replace(/\[\[\d+\]\]\((?:https?:)?[^)]*\)/g, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1"),
    SEARCH_LIMITS.maxReply,
  );
}

export async function handleWebSearch({ query, apiKey, model, fetchImpl }) {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) return { status: 503, body: { error: "not-configured", message: "Web search isn't configured on the server yet." } };
  const prepared = publicQuery(query);
  if (prepared.error) return { status: 400, body: { error: "bad-input", message: prepared.error } };
  let response;
  try {
    response = await fetchImpl("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || SEARCH_MODEL,
        store: false,
        temperature: 0.2,
        max_output_tokens: SEARCH_LIMITS.maxOutputTokens,
        max_turns: SEARCH_LIMITS.maxTurns,
        reasoning: { effort: "low" },
        include: ["no_inline_citations", "web_search_call.action.sources"],
        tools: [{ type: "web_search", enable_image_understanding: false, enable_image_search: false }],
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prepared.query },
        ],
      }),
      signal: AbortSignal.timeout(SEARCH_LIMITS.timeoutMs),
    });
  } catch {
    return { status: 502, body: { error: "search-failed", message: "Web search didn't answer. Try again." } };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: 502, body: { error: "search-auth", message: "Web search rejected the server credential." } };
  }
  if (!response.ok) return { status: 502, body: { error: "search-failed", message: "Web search didn't answer. Try again." } };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { status: 502, body: { error: "search-failed", message: "Web search didn't answer. Try again." } };
  }
  if (!searchRan(payload)) {
    return { status: 502, body: { error: "search-unavailable", message: "Web search didn't look anything up, so this isn't shown as a sourced answer." } };
  }
  const sources = sourcesFromResponse(payload);
  if (!sources.length) {
    return { status: 502, body: { error: "search-unsourced", message: "Web search ran but didn't return a source link, so the answer isn't shown." } };
  }
  const reply = replyText(payload) || "Sources are below.";
  return { status: 200, body: { reply, sources } };
}
