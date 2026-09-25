import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();
const openAiApiKey = defineSecret("OPENAI_API_KEY2");
const MAX_MESSAGE_LENGTH = 1500;
const MAX_HISTORY = 20;
const PROMPT = `You are Razzberry's concise, friendly product guide. Answer only questions about Razzberry and the ideas below. If a request is unrelated, gently say you can only help with Razzberry. If the deck or facts do not answer a question, say you don't know yet; never invent details. Clearly call unbuilt product capabilities future ideas, possibilities, or plans—not features that exist. Keep answers simple, useful, and under 120 words. Razzberry is an early-stage concept exploring clearer records for creative works, the people involved, ownership, agreements, and how rights/value may move over time. It is not yet a launched rights-management product, and no such tools currently exist. One participatory idea discussed is a Song Made of Places: people contribute short environmental sounds from where they live, which a musician could arrange into a composition. This is a collaborative music concept, not an AI music generator and not a built feature. Blockchain (potentially XRPL) and decentralized file storage (potentially IPFS) are technologies to explore, not confirmed implementation choices. Explain that records can aid coordination but do not by themselves prove legal ownership or replace contracts, registries, or professional legal advice.`;
const ACCOUNT_ACCESS_CARD = "account-access";

export function accountAccessReply(message, email = "") {
  if (!/(?:\bsign[ -]?(?:in|up)\b|\b(?:create|make|open)\s+(?:(?:an?|my)\s+)?account\b|\bregister\b|\bnew account\b)/i.test(message)) return null;
  return {
    card: ACCOUNT_ACCESS_CARD,
    text: email
      ? `You’re already signed in as ${email}. Your Razzberry account is active. If you meant to create a separate account, sign out first, then use the sign-up card here.`
      : "Yes—sign-up is available. Create a free account here to save your conversations and continue them later.",
  };
}

export function platformHealth() {
  return { status: "ok", service: "razzberry", checkedAt: new Date().toISOString() };
}

export const healthCheck = onCall({ region: "us-central1" }, (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to check workspace services.");
  return platformHealth();
});

function requireUid(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to manage saved conversations.");
  return request.auth.uid;
}

function validConversationId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{12,100}$/.test(value)) {
    throw new HttpsError("invalid-argument", "Invalid conversation.");
  }
  return value;
}

function cleanMessages(value) {
  if (!Array.isArray(value) || value.length > MAX_HISTORY || value.length < 1) {
    throw new HttpsError("invalid-argument", "Conversation is too large.");
  }
  const clean = value.map((entry) => {
    if (!entry || !["user", "assistant"].includes(entry.role) || typeof entry.content !== "string" || !entry.content.trim() || entry.content.length > MAX_MESSAGE_LENGTH) {
      throw new HttpsError("invalid-argument", "Invalid conversation message.");
    }
    return { role: entry.role, content: entry.content.trim(), ...(entry.card === ACCOUNT_ACCESS_CARD ? { card: entry.card } : {}) };
  });
  if (clean.some((entry, index) => entry.role !== (index % 2 === 0 ? "user" : "assistant"))) {
    throw new HttpsError("invalid-argument", "Conversation message order is invalid.");
  }
  return clean;
}

async function rateLimit(request) {
  const uid = request.auth?.uid;
  const identity = uid ? `user:${uid}` : `guest:${request.rawRequest.ip || "unknown"}`;
  const id = createHash("sha256").update(identity).digest("hex");
  const ref = db.collection("chatRateLimits").doc(id);
  const now = Date.now();
  const limit = uid ? 30 : 8;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const expiresAt = snapshot.get("expiresAt")?.toMillis?.() ?? 0;
    const count = expiresAt > now ? snapshot.get("count") ?? 0 : 0;
    if (count >= limit) throw new HttpsError("resource-exhausted", "Please wait before sending another message.");
    transaction.set(ref, { count: count + 1, expiresAt: new Date(now + 60 * 60 * 1000) });
  });
}

async function openAiReply(history, key, onDelta) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5-mini", instructions: PROMPT, input: history.map(({ role, content }) => ({ role, content })), max_output_tokens: 300, stream: true }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok || !response.body) {
    console.error("OpenAI Responses API failed", { status: response.status });
    throw new HttpsError("unavailable", "Razzberry's guide is temporarily unavailable.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        const data = event.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!data || data === "[DONE]") continue;
        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }
        if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
          answer += parsed.delta;
          onDelta(parsed.delta);
        }
        if (parsed.type === "response.failed" || parsed.type === "error") throw new HttpsError("unavailable", "Razzberry's guide is temporarily unavailable.");
      }
    }
  } finally { reader.releaseLock(); }
  if (!answer.trim()) throw new HttpsError("unavailable", "Razzberry could not complete that reply. Please try again.");
  return answer.trim().slice(0, 2500);
}

export const askRazzberry = onCall({ region: "us-central1", enforceAppCheck: true, secrets: [openAiApiKey], timeoutSeconds: 120, memory: "256MiB" }, async (request, response) => {
  const prompt = request.data?.message;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError("invalid-argument", "Please send a message under 1,500 characters.");
  }
  await rateLimit(request);
  const uid = request.auth?.uid;
  const id = uid && request.data?.conversationId ? validConversationId(request.data.conversationId) : null;
  let ref;
  let prior = [];
  if (id) {
    ref = db.collection("users").doc(uid).collection("conversations").doc(id);
    const existing = await ref.get();
    if (!existing.exists) throw new HttpsError("not-found", "Conversation not found.");
    const previousMessages = await ref.collection("messages").orderBy("sequence", "asc").limitToLast(MAX_HISTORY - 1).get();
    prior = previousMessages.docs.map((doc) => ({ role: doc.get("role"), content: doc.get("content") }));
  }
  const history = [...prior, { role: "user", content: prompt.trim() }];
  const accountReply = accountAccessReply(prompt, request.auth?.token?.email || "");
  const text = accountReply?.text || await openAiReply(history, openAiApiKey.value(), (delta) => {
    if (request.acceptsStreaming) response.sendChunk({ text: delta });
  });
  if (accountReply && request.acceptsStreaming) response.sendChunk({ text });
  let conversationId;
  if (uid) {
    conversationId = id || db.collection("users").doc(uid).collection("conversations").doc().id;
    ref ||= db.collection("users").doc(uid).collection("conversations").doc(conversationId);
    const messagesRef = ref.collection("messages");
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const sequence = snapshot.get("messageCount") || 0;
      const previousMessages = await transaction.get(messagesRef.orderBy("sequence", "asc"));
      transaction.set(messagesRef.doc(String(sequence).padStart(8, "0")), { role: "user", content: prompt.trim(), sequence });
      transaction.set(messagesRef.doc(String(sequence + 1).padStart(8, "0")), { role: "assistant", content: text, sequence: sequence + 1, ...(accountReply ? { card: accountReply.card } : {}) });
      const removeCount = Math.max(0, previousMessages.size + 2 - MAX_HISTORY);
      previousMessages.docs.slice(0, removeCount).forEach((doc) => transaction.delete(doc.ref));
      const title = snapshot.get("title");
      transaction.set(ref, { title: title || prompt.trim().slice(0, 72), messageCount: sequence + 2, updatedAt: FieldValue.serverTimestamp(), ...(!title ? { createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
    });
  }
  return { text, ...(accountReply ? { card: accountReply.card } : {}), ...(conversationId ? { conversationId } : {}) };
});

export const adoptGuestConversation = onCall({ region: "us-central1", enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const messages = cleanMessages(request.data?.messages);
  const id = request.data?.conversationId ? validConversationId(request.data.conversationId) : db.collection("users").doc(uid).collection("conversations").doc().id;
  const ref = db.collection("users").doc(uid).collection("conversations").doc(id);
  const existing = await ref.get();
  if (existing.exists) throw new HttpsError("already-exists", "Conversation already saved.");
  const batch = db.batch();
  messages.forEach((item, sequence) => batch.set(ref.collection("messages").doc(String(sequence).padStart(8, "0")), { ...item, sequence }));
  batch.set(ref, { title: messages.find((item) => item.role === "user").content.slice(0, 72), messageCount: messages.length, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { conversationId: id };
});

export const getConversation = onCall({ region: "us-central1", enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const id = validConversationId(request.data?.conversationId);
  const snapshot = await db.collection("users").doc(uid).collection("conversations").doc(id).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Conversation not found.");
  const messages = await snapshot.ref.collection("messages").orderBy("sequence", "asc").get();
  return { messages: messages.docs.map((doc) => ({ role: doc.get("role"), content: doc.get("content"), ...(doc.get("card") === ACCOUNT_ACCESS_CARD ? { card: ACCOUNT_ACCESS_CARD } : {}) })) };
});

export const deleteConversation = onCall({ region: "us-central1", enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const id = validConversationId(request.data?.conversationId);
  const ref = db.collection("users").doc(uid).collection("conversations").doc(id);
  const messages = await ref.collection("messages").get();
  const batch = db.batch();
  messages.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(ref);
  await batch.commit();
  return { deleted: true };
});
