// Invite links, private-event access, RSVPs, and the host email.
// Clients cannot read private events or invite records. This module runs with the Admin SDK.

import { randomBytes } from "node:crypto";
import { FROM_ADDRESS, nextRateState, sha256 } from "./loginCode.js";
import { INVITE_CODE_RE } from "./slug.js";
import { asDate, eventHasEnded, formatEventWhen } from "./when.js";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 10;

export class InviteError extends Error {
  constructor(reason, message) {
    super(message ?? reason);
    this.reason = reason;
    this.name = "InviteError";
  }
}

export function isInviteCode(value) {
  return typeof value === "string" && INVITE_CODE_RE.test(value);
}

export function generateInviteCode(bytes = randomBytes(CODE_LENGTH)) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function cleanId(value) {
  return typeof value === "string" && /^[A-Za-z0-9]{1,128}$/.test(value) ? value : "";
}

function cleanKey(value) {
  return typeof value === "string" && /^[a-f0-9]{16,64}$/.test(value) ? value : "";
}

function displayName(data) {
  const first = typeof data?.firstName === "string" ? data.firstName.trim() : "";
  const last = typeof data?.lastName === "string" ? data.lastName.trim() : "";
  return [first, last].filter(Boolean).join(" ");
}

function firstName(data) {
  const name = typeof data?.firstName === "string" ? data.firstName.trim() : "";
  return name;
}

export function inviteLine(inviterName, eventTitle) {
  const who = String(inviterName || "").trim() || "Someone";
  return `${who} invited you to ${eventTitle}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/** Same card and sender as the sign-in and email-change messages. */
export function rsvpEmail({ guestName, eventName, eventUrl }) {
  const guest = String(guestName || "Someone").trim() || "Someone";
  const event = String(eventName || "your event").trim() || "your event";
  const subject = `${guest} is going to ${event}`;
  const intro = `${guest} is going to ${event}.`;
  const href = escapeHtml(eventUrl);
  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f7;">
  <div lang="en" dir="ltr" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #ececef;">
          <tr><td style="height:4px;background:#D81E5B;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:32px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161616;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;font-weight:700;color:#D81E5B;">Razzberry</p>
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;">New RSVP</h1>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">${escapeHtml(intro)}</p>
              <p style="margin:0;font-size:16px;line-height:1.5;"><a href="${href}" style="color:#D81E5B;font-weight:700;text-decoration:none;">Open the event</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = `New RSVP\n\n${intro}\n\nOpen the event: ${eventUrl}\n`;
  return { from: FROM_ADDRESS, subject, html, text };
}

async function charge(db, id, now, max) {
  const ref = db.doc(`authRateLimits/${id}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = nextRateState(snap.exists ? snap.data() : null, now, { max, minIntervalMs: 0 });
    if (!next.ok) throw new InviteError("rate-limited", "Too many requests. Try again later.");
    tx.set(ref, next.state);
  });
}

async function readUser(db, uid) {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists ? snap.data() || {} : null;
}

function publicEvent(eventId, event) {
  const starts = asDate(event.startsAt);
  return {
    id: eventId,
    artistId: typeof event.artistId === "string" ? event.artistId : "",
    title: typeof event.title === "string" ? event.title : "",
    startsAt: starts ? starts.toISOString() : "",
    venue: typeof event.venue === "string" ? event.venue : "",
    city: typeof event.city === "string" ? event.city : "",
    description: typeof event.description === "string" ? event.description : "",
    imageURL: typeof event.imageURL === "string" ? event.imageURL : "",
    ticketUrl: typeof event.ticketUrl === "string" ? event.ticketUrl : "",
    visibility: event.visibility === "private" ? "private" : "public",
    slug: typeof event.slug === "string" ? event.slug : "",
    showGuestList: event.showGuestList === true,
  };
}

function publicArtist(artistId, artist) {
  if (!artist) return null;
  return {
    id: artistId,
    name: typeof artist.name === "string" ? artist.name : "",
    slug: typeof artist.slug === "string" ? artist.slug : "",
    imageURL: typeof artist.imageURL === "string" ? artist.imageURL : "",
  };
}

async function resolveInvite(db, code, now) {
  if (!isInviteCode(code)) return { state: "inactive" };
  const snap = await db.doc(`invites/${code}`).get();
  if (!snap.exists) return { state: "inactive" };
  const invite = snap.data() || {};
  if (invite.active !== true) return { state: "inactive" };
  const eventId = cleanId(invite.eventId);
  if (!eventId) return { state: "inactive" };
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) return { state: "inactive" };
  const event = eventSnap.data() || {};
  if (eventHasEnded(event.startsAt, now)) return { state: "ended" };
  const artistId = cleanId(event.artistId);
  const artistSnap = artistId ? await db.doc(`artists/${artistId}`).get() : null;
  const artist = artistSnap?.exists ? artistSnap.data() || {} : null;
  return { state: "ok", invite, event, eventId, artist, artistId };
}

async function goingCount(db, eventId) {
  const snap = await db.doc(`events/${eventId}/stats/public`).get();
  return snap.exists ? Number(snap.data()?.goingCount) || 0 : 0;
}

async function hostStats(db, eventId) {
  const snap = await db.doc(`events/${eventId}/stats/host`).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    opens: Number(data.opens) || 0,
    goingCount: Number(data.goingCount) || 0,
    signupCount: Number(data.signupCount) || 0,
  };
}

function bumpStats(current, patch) {
  const next = {
    opens: Number(current.opens) || 0,
    goingCount: Number(current.goingCount) || 0,
    signupCount: Number(current.signupCount) || 0,
  };
  for (const [key, delta] of Object.entries(patch)) next[key] = Math.max(0, next[key] + delta);
  return next;
}

async function findActive(db, eventId, field, value) {
  if (!value) return [];
  const snap = await db.collection("invites").where("eventId", "==", eventId).where(field, "==", value).where("active", "==", true).get();
  return snap.docs;
}

async function canSeePrivate(db, event, eventId, uid) {
  if (!uid) return false;
  if (event.artistId === uid) return true;
  const access = await db.doc(`events/${eventId}/access/${uid}`).get();
  if (access.exists) return true;
  const rsvp = await db.doc(`events/${eventId}/rsvps/${uid}`).get();
  return rsvp.exists && rsvp.data()?.status === "going";
}

function guestView(data) {
  return {
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Guest",
    photoURL: typeof data.photoURL === "string" ? data.photoURL : "",
  };
}

function hostGuest(id, data) {
  return {
    uid: id,
    ...guestView(data),
    inviterName: typeof data.inviterName === "string" ? data.inviterName : "",
    inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : "",
    newSignup: data.newSignup === true,
  };
}

async function listRsvps(db, eventId) {
  const snap = await db.collection(`events/${eventId}/rsvps`).get();
  return snap.docs
    .map((item) => ({ id: item.id, data: item.data() || {} }))
    .filter((item) => item.data.status === "going")
    .sort((a, b) => String(a.data.createdAt || "").localeCompare(String(b.data.createdAt || "")));
}

/**
 * Creates or reuses the caller's invite. The caller has to be signed in.
 * Any signed-in person can invite to a public event. A private event only
 * the host or a guest who is going.
 */
export async function createInvite({ db, uid = "", eventId, regenerate = false, now, timestampOf, newCode = () => generateInviteCode() }) {
  const id = cleanId(eventId);
  if (!id) throw new InviteError("bad-input", "That event isn't available.");
  if (!uid) throw new InviteError("unauthenticated", "Sign in first.");
  await charge(db, `invite_make_${sha256(uid)}`, now, 40);

  const eventSnap = await db.doc(`events/${id}`).get();
  if (!eventSnap.exists) throw new InviteError("not-found", "That event isn't available.");
  const event = eventSnap.data() || {};
  const host = Boolean(uid) && event.artistId === uid;
  const goingSnap = uid ? await db.doc(`events/${id}/rsvps/${uid}`).get() : null;
  const going = Boolean(goingSnap?.exists && goingSnap.data()?.status === "going");
  if (event.visibility === "private" && !host && !going) throw new InviteError("forbidden", "You can't invite people to this event.");
  if (event.visibility !== "public" && event.visibility !== "private") throw new InviteError("not-found", "That event isn't available.");
  if (eventHasEnded(event.startsAt, now)) throw new InviteError("ended", "This event has ended.");

  const field = "createdBy";
  const value = uid;
  const existing = await findActive(db, id, field, value);
  if (existing.length > 0 && !regenerate) {
    const invite = existing[0].data() || {};
    const user = await readUser(db, uid);
    return {
      code: existing[0].id,
      message: inviteLine(invite.inviterName || firstName(user), event.title || "this event"),
      reused: true,
    };
  }
  if (regenerate) {
    for (const doc of existing) {
      await doc.ref.update({ active: false });
      await revokeAccess(db, id, doc.id);
    }
  }

  const user = await readUser(db, uid);
  const inviterName = firstName(user);
  let code = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = newCode();
    if (!isInviteCode(next)) continue;
    const ref = db.doc(`invites/${next}`);
    const snap = await ref.get();
    if (snap.exists) continue;
    code = next;
    await ref.set({
      code,
      eventId: id,
      artistId: event.artistId || "",
      createdBy: uid || "",
      guestKey: "",
      inviterName,
      createdAt: timestampOf(now),
      active: true,
      opens: 0,
      rsvpCount: 0,
      signupCount: 0,
    });
    break;
  }
  if (!code) throw new InviteError("unavailable", "Could not create an invite. Try again.");
  return { code, message: inviteLine(inviterName, event.title || "this event"), reused: false };
}

async function revokeAccess(db, eventId, code) {
  const snap = await db.collection(`events/${eventId}/access`).where("inviteCode", "==", code).get();
  for (const doc of snap.docs) {
    const rsvp = await db.doc(`events/${eventId}/rsvps/${doc.id}`).get();
    if (rsvp.exists && rsvp.data()?.status === "going") continue;
    await doc.ref.delete();
  }
}

/** Host only. Deactivating a leaked link stops new opens and drops access that never became an RSVP. */
export async function deactivateInvite({ db, uid = "", code, now }) {
  if (!uid) throw new InviteError("unauthenticated", "Sign in first.");
  if (!isInviteCode(code)) throw new InviteError("bad-input", "That invite isn't active.");
  await charge(db, `invite_host_${sha256(uid)}`, now, 60);
  const snap = await db.doc(`invites/${code}`).get();
  if (!snap.exists) throw new InviteError("not-found", "That invite isn't active.");
  const invite = snap.data() || {};
  const eventSnap = await db.doc(`events/${invite.eventId}`).get();
  if (!eventSnap.exists || eventSnap.data()?.artistId !== uid) throw new InviteError("forbidden", "You can't change this invite.");
  await snap.ref.update({ active: false });
  await revokeAccess(db, invite.eventId, code);
  return { ok: true, code, active: false };
}

async function recordOpen(db, code, deviceKey, now, timestampOf) {
  const key = cleanKey(deviceKey);
  if (!key) return false;
  const ref = db.doc(`inviteOpens/${code}_${sha256(key).slice(0, 24)}`);
  let counted = false;
  await db.runTransaction(async (tx) => {
    const inviteRef = db.doc(`invites/${code}`);
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) return;
    const invite = inviteSnap.data() || {};
    const statsRef = invite.eventId ? db.doc(`events/${invite.eventId}/stats/host`) : null;
    const [snap, statsSnap] = await Promise.all([tx.get(ref), statsRef ? tx.get(statsRef) : Promise.resolve(null)]);
    if (snap.exists) return;
    tx.set(ref, { code, at: timestampOf(now) });
    tx.update(inviteRef, { opens: (Number(invite.opens) || 0) + 1 });
    if (statsRef) {
      const current = statsSnap?.exists ? statsSnap.data() || {} : {};
      tx.set(statsRef, bumpStats(current, { opens: 1 }));
    }
    counted = true;
  });
  return counted;
}

/**
 * Validates a code and returns the event. Private details are included only for an active,
 * unexpired invite. Signed-in visitors also receive an access record so rules can allow later reads.
 */
export async function openInvite({ db, uid = "", code, deviceKey = "", ip = "", now, timestampOf, countOpen = true }) {
  const ipKey = sha256(String(ip || "unknown").slice(0, 64));
  const resolved = await resolveInvite(db, String(code || "").trim().toLowerCase(), now);
  if (resolved.state !== "ok") {
    await charge(db, `invite_fail_${ipKey}`, now, 40);
    return { state: resolved.state };
  }
  if (countOpen) await recordOpen(db, resolved.invite.code || code, deviceKey, now, timestampOf);
  if (uid && uid !== resolved.event.artistId && resolved.event.visibility === "private") {
    const accessRef = db.doc(`events/${resolved.eventId}/access/${uid}`);
    const access = await accessRef.get();
    if (!access.exists) {
      await accessRef.set({ inviteCode: code, createdAt: timestampOf(now) });
    }
  }
  const event = publicEvent(resolved.eventId, resolved.event);
  if (event.visibility === "private") event.imageURL = `/api/invite-cover?code=${encodeURIComponent(code)}`;
  const rsvps = event.showGuestList ? await listRsvps(db, resolved.eventId) : [];
  const mine = uid ? await db.doc(`events/${resolved.eventId}/rsvps/${uid}`).get() : null;
  const viewerGoing = Boolean(mine?.exists && mine.data()?.status === "going");
  return {
    state: "ok",
    event,
    artist: publicArtist(resolved.artistId, resolved.artist),
    goingCount: await goingCount(db, resolved.eventId),
    viewerGoing,
    canInvite: Boolean(uid) && (event.visibility === "public" || resolved.event.artistId === uid || viewerGoing),
    showGuestList: event.showGuestList,
    guests: event.showGuestList ? rsvps.map((item) => guestView(item.data)) : null,
    inviteCode: code,
  };
}

/** Image bytes for a valid private invite. Missing, inactive, and ended codes return null. */
export async function inviteCover({ db, bucket, code, now }) {
  const resolved = await resolveInvite(db, String(code || "").trim().toLowerCase(), now);
  if (resolved.state !== "ok") return null;
  const file = bucket.file(`events/${resolved.eventId}/cover.jpg`);
  try {
    const [buffer] = await file.download();
    let contentType = "image/jpeg";
    try {
      const [meta] = await file.getMetadata();
      if (typeof meta?.contentType === "string" && meta.contentType.startsWith("image/")) contentType = meta.contentType;
    } catch {
      // The bytes are enough. JPEG is the upload type.
    }
    return { buffer, contentType };
  } catch {
    return null;
  }
}

export async function eventDesk({ db, uid = "", eventId }) {
  const id = cleanId(eventId);
  if (!id) return { state: "missing" };
  const eventSnap = await db.doc(`events/${id}`).get();
  if (!eventSnap.exists) return { state: "missing" };
  const event = eventSnap.data() || {};
  const host = Boolean(uid) && event.artistId === uid;
  const visible = event.visibility === "public" || (await canSeePrivate(db, event, id, uid));
  if (!visible) return { state: "private" };
  const rsvps = await listRsvps(db, id);
  const mine = rsvps.find((item) => item.id === uid);
  const showGuestList = event.showGuestList === true;
  const count = await goingCount(db, id);
  const body = {
    state: "ok",
    viewerGoing: Boolean(mine),
    goingCount: count,
    canInvite: Boolean(uid) && (event.visibility === "public" || host || Boolean(mine)),
    showGuestList,
    guests: showGuestList ? rsvps.map((item) => guestView(item.data)) : null,
    host: null,
  };
  if (!host) return body;
  const invitesSnap = await db.collection("invites").where("eventId", "==", id).get();
  const invites = invitesSnap.docs
    .map((item) => {
      const data = item.data() || {};
      return {
        code: item.id,
        createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
        inviterName: typeof data.inviterName === "string" && data.inviterName ? data.inviterName : "Someone",
        opens: Number(data.opens) || 0,
        rsvpCount: Number(data.rsvpCount) || 0,
        signupCount: Number(data.signupCount) || 0,
        active: data.active === true,
        mine: data.createdBy === uid,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.opens - a.opens);
  body.host = {
    ...(await hostStats(db, id)),
    goingCount: count,
    invites,
    guests: rsvps.map((item) => hostGuest(item.id, item.data)),
  };
  return body;
}

async function validInbound(db, eventId, code, now) {
  if (!isInviteCode(code)) return null;
  const snap = await db.doc(`invites/${code}`).get();
  if (!snap.exists) return null;
  const invite = snap.data() || {};
  if (invite.active !== true || invite.eventId !== eventId) return null;
  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists || eventHasEnded(eventSnap.data()?.startsAt, now)) return null;
  return invite;
}

/**
 * Going is the only RSVP. Attribution comes from the invite record, not from the client.
 * The host email is sent after the RSVP is saved. A failed send does not undo the RSVP.
 */
export async function rsvpGoing({ db, auth, uid, eventId, inviteCode = "", now, timestampOf, sendEmail, origin = "https://new-raz-prod.web.app" }) {
  if (!uid) throw new InviteError("unauthenticated", "Sign in first.");
  const id = cleanId(eventId);
  if (!id) throw new InviteError("bad-input", "That event isn't available.");
  const eventSnap = await db.doc(`events/${id}`).get();
  if (!eventSnap.exists) throw new InviteError("not-found", "That event isn't available.");
  const event = eventSnap.data() || {};
  if (event.artistId === uid) throw new InviteError("forbidden", "You're hosting this event.");
  if (eventHasEnded(event.startsAt, now)) throw new InviteError("ended", "This event has ended.");
  const code = String(inviteCode || "").trim().toLowerCase();
  const invite = await validInbound(db, id, code, now);
  const allowed = event.visibility === "public" || (await canSeePrivate(db, event, id, uid)) || Boolean(invite);
  if (!allowed) throw new InviteError("forbidden", "An invite is required for this event.");

  const user = (await readUser(db, uid)) || {};
  const name = displayName(user) || "Someone";
  const photoURL = typeof user.photoURL === "string" ? user.photoURL : "";
  const existing = await db.doc(`events/${id}/rsvps/${uid}`).get();
  if (existing.exists && existing.data()?.status === "going") {
    return { ok: true, already: true, goingCount: await goingCount(db, id) };
  }

  const newSignup = user.signupCounted !== true && typeof user.inviteCode === "string" && user.inviteCode === code && Boolean(code);
  const invitedBy = invite && typeof invite.createdBy === "string" ? invite.createdBy : "";
  const inviterName = invite && typeof invite.inviterName === "string" ? invite.inviterName : "";
  const createdAt = new Date(now).toISOString();

  await db.runTransaction(async (tx) => {
    const rsvpRef = db.doc(`events/${id}/rsvps/${uid}`);
    const publicRef = db.doc(`events/${id}/stats/public`);
    const hostRef = db.doc(`events/${id}/stats/host`);
    const inviteRef = invite ? db.doc(`invites/${code}`) : null;
    const accessRef = event.visibility === "private" ? db.doc(`events/${id}/access/${uid}`) : null;
    const userRef = newSignup ? db.doc(`users/${uid}`) : null;
    const [rsvpSnap, publicSnap, hostSnap, inviteSnap, accessSnap] = await Promise.all([
      tx.get(rsvpRef),
      tx.get(publicRef),
      tx.get(hostRef),
      inviteRef ? tx.get(inviteRef) : Promise.resolve(null),
      accessRef ? tx.get(accessRef) : Promise.resolve(null),
    ]);
    if (rsvpSnap.exists && rsvpSnap.data()?.status === "going") return;
    tx.set(rsvpRef, {
      status: "going",
      name,
      photoURL,
      invitedBy,
      inviteCode: invite ? code : "",
      inviterName,
      newSignup,
      createdAt,
    });
    const publicCurrent = publicSnap.exists ? publicSnap.data() || {} : {};
    tx.set(publicRef, { goingCount: (Number(publicCurrent.goingCount) || 0) + 1 });
    const hostCurrent = hostSnap.exists ? hostSnap.data() || {} : {};
    tx.set(hostRef, bumpStats(hostCurrent, { goingCount: 1, signupCount: newSignup ? 1 : 0 }));
    if (inviteRef && inviteSnap?.exists) {
      const current = inviteSnap.data() || {};
      tx.update(inviteRef, {
        rsvpCount: (Number(current.rsvpCount) || 0) + 1,
        signupCount: (Number(current.signupCount) || 0) + (newSignup ? 1 : 0),
      });
    }
    if (userRef) tx.update(userRef, { signupCounted: true });
    if (accessRef && !accessSnap?.exists) tx.set(accessRef, { inviteCode: invite ? code : "", createdAt: timestampOf(now) });
  });

  let emailed = false;
  if (sendEmail) {
    const hostUser = await readUser(db, event.artistId);
    let to = typeof hostUser?.email === "string" ? hostUser.email : "";
    if (!to && auth) {
      try {
        const record = await auth.getUser(event.artistId);
        to = record?.email || "";
      } catch {
        to = "";
      }
    }
    if (to) {
      const mail = rsvpEmail({ guestName: name, eventName: event.title || "your event", eventUrl: `${origin}/event/${id}` });
      try {
        const sent = await sendEmail({
          to,
          idempotencyKey: `rsvp/${id}/${uid}/${createdAt}`,
          kind: "rsvp",
          mail,
        });
        emailed = !sent?.error;
      } catch {
        emailed = false;
      }
    }
  }
  return { ok: true, already: false, newSignup, goingCount: await goingCount(db, id), emailed };
}

export async function rsvpCancel({ db, uid, eventId }) {
  if (!uid) throw new InviteError("unauthenticated", "Sign in first.");
  const id = cleanId(eventId);
  if (!id) throw new InviteError("bad-input", "That event isn't available.");
  const ref = db.doc(`events/${id}/rsvps/${uid}`);
  const existing = await ref.get();
  if (!existing.exists || existing.data()?.status !== "going") return { ok: true, goingCount: await goingCount(db, id) };
  await db.runTransaction(async (tx) => {
    const publicRef = db.doc(`events/${id}/stats/public`);
    const hostRef = db.doc(`events/${id}/stats/host`);
    const [snap, publicSnap, hostSnap] = await Promise.all([tx.get(ref), tx.get(publicRef), tx.get(hostRef)]);
    if (!snap.exists || snap.data()?.status !== "going") return;
    tx.delete(ref);
    const publicCurrent = publicSnap.exists ? publicSnap.data() || {} : {};
    tx.set(publicRef, { goingCount: Math.max(0, (Number(publicCurrent.goingCount) || 0) - 1) });
    const hostCurrent = hostSnap.exists ? hostSnap.data() || {} : {};
    tx.set(hostRef, bumpStats(hostCurrent, { goingCount: -1 }));
  });
  return { ok: true, goingCount: await goingCount(db, id) };
}

/** Open Graph for /i/{code}. Private cards never include a photo, venue, or city. */
export async function inviteShareMeta({ db, origin, code, now = Date.now() }) {
  const resolved = await resolveInvite(db, code, now);
  const url = `${origin}/i/${code}`;
  if (resolved.state === "ended") {
    return {
      title: "This event has ended",
      description: "This event has ended",
      url,
      imagePath: null,
      imageSource: "",
      cardTitle: "This event has ended",
      cardSubtitle: "Razzberry",
      cache: "private, no-store",
      privateEvent: true,
    };
  }
  if (resolved.state !== "ok") {
    return {
      title: "Razzberry",
      description: "You're invited.",
      url: origin,
      imagePath: null,
      imageSource: "",
      cardTitle: "Razzberry",
      cardSubtitle: "You're invited",
      cache: "private, no-store",
      privateEvent: true,
    };
  }
  const title = resolved.event.title || "You're invited";
  const isPrivate = resolved.event.visibility === "private";
  if (isPrivate) {
    return {
      title: `${title} · You're invited`,
      description: "You're invited",
      url,
      imagePath: `og/invites/${code}.jpg`,
      imageSource: "",
      cardTitle: title,
      cardSubtitle: "You're invited",
      cache: "private, no-store",
      privateEvent: true,
    };
  }
  const when = formatEventWhen(resolved.event.startsAt);
  return {
    title: when ? `${title} · ${when}` : title,
    description: when || "You're invited",
    url,
    imagePath: `og/invites/${code}.jpg`,
    imageSource: resolved.event.imageURL || resolved.artist?.imageURL || "",
    cardTitle: title,
    cardSubtitle: when,
    cache: "public, max-age=300, s-maxage=600",
    privateEvent: false,
  };
}
