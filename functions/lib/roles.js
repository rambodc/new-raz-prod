// Sets users/{uid}.role. Only an admin custom claim may do this through the callable.
// Promoting someone to artist also creates artists/{uid} from their profile, once,
// and claims a public slug at slugs/{slug}.

import { slugCandidates } from "./slug.js";

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export class RoleError extends Error {
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

export function artistNameFromProfile(profile) {
  const first = typeof profile?.firstName === "string" ? profile.firstName.trim() : "";
  const last = typeof profile?.lastName === "string" ? profile.lastName.trim() : "";
  const name = [first, last].filter(Boolean).join(" ");
  return (name || "Artist").slice(0, 80);
}

export function artistImageFromProfile(profile) {
  const url = typeof profile?.photoURL === "string" ? profile.photoURL : "";
  return url.length <= 2048 ? url : "";
}

/**
 * @param {{ db: any, auth: any, caller?: { token?: { admin?: unknown } } | null, email: string, role?: "fan" | "artist", grantAdmin?: boolean, now: number, timestampOf: (ms: number) => unknown, trustCaller?: boolean }} input
 */
export async function applyUserRole({ db, auth, caller = null, email, role, grantAdmin = false, now, timestampOf, trustCaller = false }) {
  if (!trustCaller) {
    if (!caller) throw new RoleError("unauthenticated", "Sign in first.");
    if (!caller.token || caller.token.admin !== true) throw new RoleError("forbidden", "Admins only.");
  }
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new RoleError("bad-email", "Enter a valid email address.");
  if (role !== undefined && role !== "fan" && role !== "artist") throw new RoleError("bad-role", "Role must be fan or artist.");
  if (role === undefined && grantAdmin !== true) throw new RoleError("bad-role", "Role must be fan or artist.");

  let user;
  try {
    user = await auth.getUserByEmail(normalized);
  } catch (error) {
    if (error?.code === "auth/user-not-found") throw new RoleError("not-found", "No account uses that email.");
    throw error;
  }

  if (role) {
    await db.runTransaction(async (tx) => {
      const userRef = db.doc(`users/${user.uid}`);
      const artistRef = db.doc(`artists/${user.uid}`);
      const snap = await tx.get(userRef);
      const artist = role === "artist" ? await tx.get(artistRef) : null;
      if (!snap.exists) throw new RoleError("not-found", "That person has not finished signing up.");
      const profile = snap.data() || {};
      let slug = "";
      const slugRefs = [];
      if (role === "artist" && artist && !artist.exists) {
        for (const candidate of slugCandidates(artistNameFromProfile(profile)).slice(0, 8)) {
          slugRefs.push({ slug: candidate, ref: db.doc(`slugs/${candidate}`) });
        }
      }
      const slugSnaps = [];
      for (const item of slugRefs) slugSnaps.push(await tx.get(item.ref));
      for (let i = 0; i < slugSnaps.length; i += 1) {
        const found = slugSnaps[i];
        if (!found.exists || found.data()?.artistId === user.uid) {
          slug = slugRefs[i].slug;
          break;
        }
      }
      if (role === "artist" && artist && !artist.exists && !slug) throw new RoleError("slug", "Could not assign a page link.");
      tx.update(userRef, { role, updatedAt: timestampOf(now) });
      if (role === "artist" && artist && !artist.exists) {
        tx.set(artistRef, {
          name: artistNameFromProfile(profile),
          bio: "",
          imageURL: artistImageFromProfile(profile),
          ownerUid: user.uid,
          slug,
          createdAt: timestampOf(now),
          updatedAt: timestampOf(now),
        });
        tx.set(db.doc(`slugs/${slug}`), { artistId: user.uid, kind: "artist" });
      }
    });
  }

  if (grantAdmin === true) {
    const claims = { ...(user.customClaims || {}) };
    claims.admin = true;
    await auth.setCustomUserClaims(user.uid, claims);
  }

  return {
    uid: user.uid,
    email: user.email || normalized,
    role: role ?? null,
    admin: grantAdmin === true || user.customClaims?.admin === true,
  };
}
