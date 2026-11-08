import { createServer } from "node:http";
import { handleSceneChat } from "../functions/lib/sceneChat.js";

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
  const result = await handleSceneChat({
    method: req.method,
    origin: req.headers.origin || "",
    ip: req.socket.remoteAddress || "",
    body,
    rawLength: raw.length,
    now: Date.now(),
    store,
    apiKey: process.env.XAI_API_KEY || "",
    model: process.env.XAI_MODEL || "grok-4.20-0309-non-reasoning",
    fetchImpl: fetch,
  });
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
