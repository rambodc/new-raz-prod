import { createServer } from "node:http";
import { handleImageRequest, IMAGE_MODEL } from "../functions/lib/images.js";
import { handleSceneChat } from "../functions/lib/sceneChat.js";
import { SEARCH_MODEL } from "../functions/lib/webSearch.js";

const port = Number(process.env.PORT || 8787);
const store = new Map();

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  let body = null;
  if (raw.length) {
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      body = null;
    }
  }
  const path = (req.url || "").split("?")[0];
  const shared = {
    method: req.method,
    origin: req.headers.origin || "",
    ip: req.socket.remoteAddress || "",
    body,
    rawLength: raw.length,
    now: Date.now(),
    store,
    apiKey: process.env.XAI_API_KEY || "",
    fetchImpl: fetch,
  };
  const result = path === "/api/image"
    ? await handleImageRequest({ ...shared, model: process.env.XAI_IMAGE_MODEL || IMAGE_MODEL })
    : await handleSceneChat({ ...shared, model: process.env.XAI_MODEL || "grok-4.20-0309-non-reasoning", searchModel: process.env.XAI_SEARCH_MODEL || SEARCH_MODEL });
  if (result.allowOrigin) {
    res.setHeader("Access-Control-Allow-Origin", result.allowOrigin);
    res.setHeader("Vary", "Origin");
  }
  for (const [name, value] of Object.entries(result.extraHeaders)) res.setHeader(name, value);
  res.setHeader("Cache-Control", "no-store");
  if (result.status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(result.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.body));
}).listen(port, "127.0.0.1");
