import { httpsCallable } from "firebase/functions";
import { client } from "./firebase";
import { isInviteCode } from "./slug";

const DEVICE = "razzberry.device";
const INVITE = "razzberry.invite";
const PENDING = "razzberry.pendingRsvp";

export type GuestFace = { name: string; photoURL: string };

export type HostInvite = {
  code: string;
  createdBy: string;
  inviterName: string;
  opens: number;
  rsvpCount: number;
  signupCount: number;
  active: boolean;
  mine: boolean;
};

export type HostGuest = GuestFace & {
  uid: string;
  inviterName: string;
  inviteCode: string;
  newSignup: boolean;
};

export type HostDesk = {
  opens: number;
  goingCount: number;
  signupCount: number;
  invites: HostInvite[];
  guests: HostGuest[];
};

export type Desk = {
  state: "ok" | "private" | "missing";
  viewerGoing: boolean;
  goingCount: number;
  canInvite: boolean;
  showGuestList: boolean;
  guests: GuestFace[] | null;
  host: HostDesk | null;
};

export type InviteEvent = {
  id: string;
  artistId: string;
  title: string;
  startsAt: string;
  venue: string;
  city: string;
  description: string;
  imageURL: string;
  ticketUrl: string;
  visibility: "public" | "private";
  slug: string;
  showGuestList: boolean;
};

export type OpenInvite =
  | { state: "inactive" | "ended" }
  | {
      state: "ok";
      event: InviteEvent;
      artist: { id: string; name: string; slug: string; imageURL: string } | null;
      goingCount: number;
      viewerGoing: boolean;
      canInvite: boolean;
      showGuestList: boolean;
      guests: GuestFace[] | null;
      inviteCode: string;
    };

function storageGet(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode can refuse storage. The page still works for this visit.
  }
}

export function deviceKey(): string {
  const existing = storageGet(DEVICE);
  if (/^[a-f0-9]{32}$/.test(existing)) return existing;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const next = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  storageSet(DEVICE, next);
  return next;
}

export function rememberInvite(code: string) {
  if (isInviteCode(code)) storageSet(INVITE, code);
}

export function readInvite(): string {
  const code = storageGet(INVITE);
  return isInviteCode(code) ? code : "";
}

export function rememberPendingRsvp(eventId: string) {
  storageSet(PENDING, eventId);
}

export function takePendingRsvp(): string {
  const value = storageGet(PENDING);
  if (value) {
    try {
      localStorage.removeItem(PENDING);
    } catch {
      // The next sign-in will try the same event again.
    }
  }
  return value;
}

export function clearPendingRsvp() {
  try {
    localStorage.removeItem(PENDING);
  } catch {
    // Nothing stored.
  }
}

const listeners = new Set<() => void>();

export function onRsvpChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRsvpChange() {
  for (const listener of listeners) listener();
}

export function coverSrc(url: string): string {
  if (!url.startsWith("/api/invite-cover")) return url;
  if (import.meta.env.VITE_USE_EMULATORS === "true") {
    const project = import.meta.env.VITE_FIREBASE_PROJECT_ID || "new-raz-prod";
    return `http://127.0.0.1:5001/${project}/us-central1/inviteCover${url.slice("/api/invite-cover".length)}`;
  }
  return url;
}

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const { functions } = await client();
  const fn = httpsCallable<Record<string, unknown>, T>(functions, name);
  const result = await fn(data);
  return result.data;
}

export function createInviteLink(eventId: string, regenerate = false): Promise<{ code: string; message: string; reused: boolean }> {
  return call("createInvite", { eventId, guestKey: deviceKey(), regenerate });
}

export function deactivateInviteLink(code: string): Promise<{ ok: boolean }> {
  return call("deactivateInvite", { code });
}

export function openInviteLink(code: string): Promise<OpenInvite> {
  return call("openInvite", { code, deviceKey: deviceKey() });
}

export function loadEventDesk(eventId: string): Promise<Desk> {
  return call("eventDesk", { eventId });
}

export function rsvpGoing(eventId: string, inviteCode = readInvite()): Promise<{ ok: boolean; already?: boolean; goingCount?: number }> {
  return call("rsvpGoing", { eventId, inviteCode });
}

export function rsvpCancel(eventId: string): Promise<{ ok: boolean; goingCount?: number }> {
  return call("rsvpCancel", { eventId });
}

type QrModule = {
  toString: (text: string, options: { type: "svg"; margin: number; width: number; color: { dark: string; light: string } }) => Promise<string>;
};

export async function qrSvg(text: string): Promise<string> {
  const loaded = (await import("qrcode")) as { default?: QrModule } & QrModule;
  const qr = loaded.default ?? loaded;
  return qr.toString(text, { type: "svg", margin: 1, width: 240, color: { dark: "#161616", light: "#ffffff" } });
}
