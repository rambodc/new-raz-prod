// Change the sign-in email with a code sent to the new address.
// The plaintext code is emailed and discarded. Firestore stores a salted scrypt hash.
// Firebase's own verification email is not used.

import { randomBytes } from "node:crypto";
import { CODE_TTL_MS, DEFAULT_LIMITS, FROM_ADDRESS, MAX_ATTEMPTS, codesMatch, generateCode, hashCode, isValidEmail, nextRateState, normalizeEmail, sha256 } from "./loginCode.js";

const DUMMY_SALT = "razzberry-email-timing";
const DUMMY_HASH = hashCode("000000", DUMMY_SALT);

export class EmailChangeError extends Error {
  constructor(reason, message) {
    super(message ?? reason);
    this.reason = reason;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/** Same card, cherry bar, and sender as the sign-in code. The copy is for this action. */
function branded({ subject, preview, title, intro, code, note }) {
  const safeCode = code ? escapeHtml(code) : "";
  const codeBlock = code
    ? `<p style="margin:0 0 20px;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.28em;color:#161616;">${safeCode}</p>`
    : "";
  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f7;">
  <div lang="en" dir="ltr" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #ececef;">
          <tr><td style="height:4px;background:#D81E5B;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:32px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161616;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;font-weight:700;color:#D81E5B;">Razzberry</p>
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;">${escapeHtml(title)}</h1>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">${intro}</p>
              ${codeBlock}
              <p style="margin:0;font-size:14px;line-height:1.5;color:#555555;">${note}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = code
    ? `${title}\n\n${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't ask to change the email on a Razzberry account, you can ignore this email.\n`
    : `${title}\n\n${preview}\n`;
  return { subject, html, text };
}

export function changeEmailMessage(code) {
  return branded({
    subject: "Confirm your new Razzberry email",
    preview: "It expires in 10 minutes.",
    title: "Confirm your new email",
    intro: "Enter this code in Razzberry to use this address for sign-in. It expires in 10 minutes.",
    code,
    note: "If you didn't ask to change an email, you can ignore this email.",
  });
}

export function emailChangedNotice(previous, next) {
  const from = escapeHtml(previous);
  const to = escapeHtml(next);
  return branded({
    subject: "Your Razzberry email was changed",
    preview: `Sign-in email is now ${next}.`,
    title: "Your email was changed",
    intro: `The sign-in email for your Razzberry account was changed from ${from} to ${to}.`,
    note: "If you didn't do this, reply to this email and we'll help you get the account back.",
  });
}

async function ownerOf(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

/**
 * Sends a code to the new address and stores only its hash under emailChanges/{uid}.
 * `sendEmail` receives `{ to, code, idempotencyKey, kind, mail }`.
 */
export async function requestEmailChange({ db, auth, uid, email, now, sendEmail, limits = DEFAULT_LIMITS, newCode = generateCode, newId = () => randomBytes(9).toString("hex") }) {
  if (!uid) throw new EmailChangeError("unauthenticated", "Sign in first.");
  const next = normalizeEmail(email);
  if (!isValidEmail(next)) throw new EmailChangeError("bad-email", "Enter a valid email address.");
  const user = await auth.getUser(uid);
  const current = normalizeEmail(user.email || "");
  if (current === next) throw new EmailChangeError("same-email", "That's already your email.");
  const taken = await ownerOf(auth, next);
  if (taken && taken.uid !== uid) throw new EmailChangeError("email-taken", "That email is already on another account.");

  const code = newCode();
  const salt = randomBytes(16).toString("hex");
  const codeHash = hashCode(code, salt);
  const codeId = newId();
  const emailKey = sha256(next);
  const uidKey = sha256(uid);

  await db.runTransaction(async (tx) => {
    const userRef = db.doc(`authRateLimits/change_uid_${uidKey}`);
    const destRef = db.doc(`authRateLimits/change_email_${emailKey}`);
    const [userSnap, destSnap] = await Promise.all([tx.get(userRef), tx.get(destRef)]);
    const userNext = nextRateState(userSnap.exists ? userSnap.data() : null, now, { max: limits.emailMax, minIntervalMs: limits.minIntervalMs });
    if (!userNext.ok) throw new EmailChangeError(userNext.reason, "Please wait before requesting another code.");
    const destNext = nextRateState(destSnap.exists ? destSnap.data() : null, now, { max: limits.emailMax, minIntervalMs: limits.minIntervalMs });
    if (!destNext.ok) throw new EmailChangeError(destNext.reason, "Please wait before requesting another code.");
    tx.set(userRef, userNext.state);
    tx.set(destRef, destNext.state);
    tx.set(db.doc(`emailChanges/${uid}`), {
      uid,
      nextEmail: next,
      previousEmail: current,
      codeHash,
      salt,
      attempts: 0,
      expiresAt: now + CODE_TTL_MS,
      codeId,
    });
  });

  let sent;
  try {
    sent = await sendEmail({
      to: next,
      code,
      kind: "email-change",
      idempotencyKey: `email-change/${uidKey}/${codeId}`,
      mail: changeEmailMessage(code),
    });
  } catch (error) {
    sent = { error: { message: "send-failed" } };
  }
  if (sent?.error) {
    try {
      await db.doc(`emailChanges/${uid}`).delete();
    } catch {
      // The hash expires on its own.
    }
    throw new EmailChangeError("send-failed", "Could not send the email.");
  }
  return { ok: true };
}

/**
 * Checks the code, updates the same Auth user and users/{uid}.email, then notices the old address.
 * Role, artist, events and tracks are not written.
 */
export async function confirmEmailChange({ db, auth, uid, code, now, sendEmail, timestampOf }) {
  if (!uid) throw new EmailChangeError("unauthenticated", "Sign in first.");
  const digits = String(code ?? "").trim();
  if (!/^\d{6}$/.test(digits)) throw new EmailChangeError("bad-code", "Enter the 6-digit code.");
  const ref = db.doc(`emailChanges/${uid}`);
  let outcome = { error: "wrong-code" };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      codesMatch("000000", DUMMY_SALT, DUMMY_HASH);
      outcome = { error: "wrong-code" };
      return;
    }
    const data = snap.data() || {};
    if (data.uid !== uid || typeof data.nextEmail !== "string" || typeof data.previousEmail !== "string") {
      outcome = { error: "wrong-code" };
      return;
    }
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
    outcome = { nextEmail: data.nextEmail, previousEmail: data.previousEmail, codeId: data.codeId || "once" };
  });

  if (outcome.error === "expired") throw new EmailChangeError("expired", "That code has expired. Send a new one.");
  if (outcome.error === "too-many-attempts") throw new EmailChangeError("too-many-attempts", "Too many tries. Send a new code.");
  if (outcome.error) throw new EmailChangeError("wrong-code", "That code is incorrect.");

  const taken = await ownerOf(auth, outcome.nextEmail);
  if (taken && taken.uid !== uid) throw new EmailChangeError("email-taken", "That email is already on another account.");

  try {
    await auth.updateUser(uid, { email: outcome.nextEmail, emailVerified: true });
  } catch (error) {
    if (error?.code === "auth/email-already-exists") throw new EmailChangeError("email-taken", "That email is already on another account.");
    throw error;
  }

  const profile = db.doc(`users/${uid}`);
  const snap = await profile.get();
  if (snap.exists) await profile.update({ email: outcome.nextEmail, updatedAt: timestampOf(now) });

  if (isValidEmail(outcome.previousEmail)) {
    try {
      const notice = await sendEmail({
        to: outcome.previousEmail,
        kind: "email-changed",
        idempotencyKey: `email-changed/${sha256(uid)}/${outcome.codeId}`,
        mail: emailChangedNotice(outcome.previousEmail, outcome.nextEmail),
      });
      if (notice?.error) console.error("email change notice failed");
    } catch {
      console.error("email change notice failed");
    }
  }

  return { email: outcome.nextEmail };
}

export { FROM_ADDRESS };
