// Passwordless email codes. The plaintext code is emailed and then discarded.
// Firestore stores only a salted scrypt hash, and clients cannot read that collection.

import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const HOUR_MS = 60 * 60 * 1000;
export const FROM_ADDRESS = "Razzberry <login@irobotx.io>";
export const DEFAULT_LIMITS = {
  emailMax: 5,
  ipMax: 30,
  minIntervalMs: 60 * 1000,
};

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const DUMMY_SALT = "razzberry-login-timing";
const DUMMY_HASH = scryptSync("000000", DUMMY_SALT, 32, SCRYPT).toString("hex");

export class LoginError extends Error {
  constructor(reason, message) {
    super(message ?? reason);
    this.reason = reason;
  }
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code, salt) {
  return scryptSync(String(code), String(salt), 32, SCRYPT).toString("hex");
}

export function codesMatch(code, salt, expectedHex) {
  try {
    const actual = scryptSync(String(code), String(salt), 32, SCRYPT);
    const expected = Buffer.from(String(expectedHex), "hex");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** True only inside the Firebase emulator. Production always sends through Resend. */
export function emulatorSinkEnabled(env = process.env) {
  return env.FUNCTIONS_EMULATOR === "true";
}

/**
 * Decides whether another code may be sent. `prev` is the stored window, or null.
 * Returns the next stored state when allowed.
 */
export function nextRateState(prev, now, { max, minIntervalMs }) {
  const fresh = !prev || typeof prev.windowStart !== "number" || now - prev.windowStart >= HOUR_MS;
  const windowStart = fresh ? now : prev.windowStart;
  const count = fresh ? 0 : Number(prev.count) || 0;
  const lastSentAt = fresh ? 0 : Number(prev.lastSentAt) || 0;
  if (!fresh && minIntervalMs > 0 && now - lastSentAt < minIntervalMs) {
    return { ok: false, reason: "too-soon", retryAfterSeconds: Math.ceil((minIntervalMs - (now - lastSentAt)) / 1000) };
  }
  if (count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + HOUR_MS - now) / 1000));
    return { ok: false, reason: "rate-limited", retryAfterSeconds };
  }
  return { ok: true, state: { windowStart, count: count + 1, lastSentAt: now } };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/** A short transactional email. The code is in the body, not the subject, so it stays out of lock-screen previews. */
export function loginEmail(code) {
  const safe = escapeHtml(code);
  const subject = "Your Razzberry sign-in code";
  const text = `Your Razzberry sign-in code\n\n${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't ask to sign in, you can ignore this email.\n`;
  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f7;">
  <div lang="en" dir="ltr" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">It expires in 10 minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #ececef;">
          <tr><td style="height:4px;background:#D81E5B;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:32px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161616;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;font-weight:700;color:#D81E5B;">Razzberry</p>
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;">Your sign-in code</h1>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">Enter this code in Razzberry to sign in. It expires in 10 minutes.</p>
              <p style="margin:0 0 20px;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.28em;color:#161616;">${safe}</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:#555555;">If you didn't ask to sign in, you can ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}

function retryable(statusCode) {
  return statusCode === 429 || (typeof statusCode === "number" && statusCode >= 500);
}

function redact(message) {
  return String(message || "unknown").replace(/re_[A-Za-z0-9]+/g, "[redacted]").slice(0, 200);
}

/**
 * Sends one code through Resend. Returns `{ error }` instead of throwing for API failures.
 * The API key is never logged.
 */
export async function sendWithResend(apiKey, { to, code, idempotencyKey, mail }) {
  if (!apiKey) return { error: { message: "missing-key" } };
  const resend = new Resend(apiKey);
  const { subject, html, text } = mail ?? loginEmail(code);
  let last = { message: "send-failed", statusCode: 0 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data, error } = await resend.emails.send(
        { from: FROM_ADDRESS, to: [to], subject, html, text },
        { idempotencyKey },
      );
      if (!error) return { data };
      last = { message: error.message, statusCode: error.statusCode };
      if (!retryable(error.statusCode)) break;
    } catch (error) {
      last = { message: error instanceof Error ? error.message : "send-failed", statusCode: 0 };
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return { error: { message: redact(last.message), statusCode: last.statusCode } };
}

async function findOrCreateUser(auth, email) {
  try {
    const existing = await auth.getUserByEmail(email);
    if (!existing.emailVerified) await auth.updateUser(existing.uid, { emailVerified: true });
    return existing;
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  try {
    return await auth.createUser({ email, emailVerified: true });
  } catch (error) {
    if (error?.code !== "auth/email-already-exists") throw error;
    const existing = await auth.getUserByEmail(email);
    if (!existing.emailVerified) await auth.updateUser(existing.uid, { emailVerified: true });
    return existing;
  }
}

/**
 * Creates a code, stores its hash, and sends the email.
 * `db.doc(path)` returns a ref with `delete()`. `runTransaction` matches the Admin SDK.
 */
export async function issueLoginCode({ db, email, ip, now, sendEmail, limits = DEFAULT_LIMITS, newCode = generateCode, newId = () => randomBytes(9).toString("hex") }) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new LoginError("bad-email", "Enter a valid email address.");
  const emailKey = sha256(normalized);
  const ipKey = sha256(String(ip || "unknown").slice(0, 64));
  const code = newCode();
  const salt = randomBytes(16).toString("hex");
  const codeHash = hashCode(code, salt);
  const codeId = newId();

  await db.runTransaction(async (tx) => {
    const emailRef = db.doc(`authRateLimits/email_${emailKey}`);
    const ipRef = db.doc(`authRateLimits/ip_${ipKey}`);
    const [emailSnap, ipSnap] = await Promise.all([tx.get(emailRef), tx.get(ipRef)]);
    const emailNext = nextRateState(emailSnap.exists ? emailSnap.data() : null, now, { max: limits.emailMax, minIntervalMs: limits.minIntervalMs });
    if (!emailNext.ok) throw new LoginError(emailNext.reason, "Please wait before requesting another code.");
    const ipNext = nextRateState(ipSnap.exists ? ipSnap.data() : null, now, { max: limits.ipMax, minIntervalMs: 0 });
    if (!ipNext.ok) throw new LoginError("rate-limited", "Too many codes were requested. Try again later.");
    tx.set(emailRef, emailNext.state);
    tx.set(ipRef, ipNext.state);
    tx.set(db.doc(`loginCodes/${emailKey}`), {
      email: normalized,
      codeHash,
      salt,
      attempts: 0,
      expiresAt: now + CODE_TTL_MS,
      codeId,
    });
  });

  let sent;
  try {
    sent = await sendEmail({ to: normalized, code, idempotencyKey: `login-code/${emailKey}/${codeId}` });
  } catch (error) {
    sent = { error: { message: redact(error instanceof Error ? error.message : "send-failed") } };
  }
  if (sent?.error) {
    try {
      await db.doc(`loginCodes/${emailKey}`).delete();
    } catch {
      // The hash expires on its own. A later send overwrites it.
    }
    console.error("login email failed", redact(sent.error.message));
    throw new LoginError("send-failed", "Could not send the email.");
  }
  return { ok: true };
}

/**
 * Checks a code and returns a Firebase custom token.
 * New profiles are created here (Admin SDK) so the client cannot choose its own role or email.
 */
export async function acceptLoginCode({ db, auth, email, code, now, timestampOf, projectId = "new-raz-prod" }) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new LoginError("bad-email", "Enter a valid email address.");
  const digits = String(code ?? "").trim();
  if (!/^\d{6}$/.test(digits)) throw new LoginError("bad-code", "Enter the 6-digit code.");
  const emailKey = sha256(normalized);
  const ref = db.doc(`loginCodes/${emailKey}`);
  let outcome = { error: "wrong-code" };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      codesMatch("000000", DUMMY_SALT, DUMMY_HASH);
      outcome = { error: "wrong-code" };
      return;
    }
    const data = snap.data() || {};
    if (typeof data.expiresAt !== "number" || now >= data.expiresAt) {
      tx.delete(ref);
      outcome = { error: "expired" };
      return;
    }
    if (Number(data.attempts) >= MAX_ATTEMPTS) {
      outcome = { error: "too-many-attempts" };
      return;
    }
    if (!codesMatch(digits, data.salt, data.codeHash)) {
      tx.update(ref, { attempts: Number(data.attempts) + 1 });
      outcome = { error: "wrong-code" };
      return;
    }
    tx.delete(ref);
    outcome = { email: typeof data.email === "string" ? data.email : normalized };
  });

  if (outcome.error === "expired") throw new LoginError("expired", "That code has expired. Send a new one.");
  if (outcome.error === "too-many-attempts") throw new LoginError("too-many-attempts", "Too many tries. Send a new code.");
  if (outcome.error) throw new LoginError("wrong-code", "That code is incorrect.");

  const user = await findOrCreateUser(auth, outcome.email);
  const canonical = user.email || outcome.email;
  const needsProfile = await ensureProfile(db, user.uid, canonical, now, timestampOf);
  let token;
  try {
    token = await auth.createCustomToken(user.uid);
  } catch (error) {
    const message = String(error?.message || "");
    const codeName = String(error?.code || "");
    if (codeName === "auth/insufficient-permission" || message.includes("signBlob")) {
      console.error(
        `createCustomToken failed: missing permission iam.serviceAccounts.signBlob. Grant roles/iam.serviceAccountTokenCreator to the Cloud Functions runtime service account on itself. Project ${projectId}. For new-raz-prod the default runtime account is 555086285693-compute@developer.gserviceaccount.com unless a custom service account is set.`,
      );
    } else {
      console.error("createCustomToken failed", codeName || "error");
    }
    throw new LoginError("token-failed", "Could not finish signing you in.");
  }
  return { token, needsProfile };
}

async function ensureProfile(db, uid, email, now, timestampOf) {
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : null;
  if (data && typeof data.firstName === "string" && data.firstName.trim().length > 0 && (data.role === "fan" || data.role === "artist")) return false;
  // Old accounts are not migrated. A document without the new name is deleted and written again,
  // so leftover fields (displayName and anything else) are gone. The auth user is reused.
  if (snap.exists) await ref.delete();
  await ref.set({
    firstName: "",
    lastName: "",
    email,
    photoURL: "",
    role: "fan",
    createdAt: timestampOf(now),
    updatedAt: timestampOf(now),
  });
  return true;
}
