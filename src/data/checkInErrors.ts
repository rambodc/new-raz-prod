/** Turns what can go wrong during a check-in into one plain sentence. */
export type CheckInProblem = { kind: "denied" } | { kind: "message"; text: string };

type GeoErrorLike = { code?: number };
type CallErrorLike = { details?: { reason?: string } | null; code?: string };

export function geolocationProblem(error: GeoErrorLike): CheckInProblem {
  if (error.code === 1) return { kind: "denied" };
  if (error.code === 3) return { kind: "message", text: "Finding you took too long. Try again." };
  return { kind: "message", text: "We couldn't find your location. Try again." };
}

const BY_REASON: Record<string, string> = {
  "not-live": "This show isn't on right now.",
  "too-far": "You don't seem to be at the show yet.",
  "poor-accuracy": "Your location isn't exact enough. Turn on precise location and try again.",
  "no-show": "That show isn't here any more.",
  "bad-input": "Something went wrong. Try again.",
};

export function checkInProblem(error: unknown): CheckInProblem {
  const e = (error ?? {}) as CallErrorLike;
  const reason = e.details && typeof e.details === "object" ? e.details.reason : undefined;
  if (reason && BY_REASON[reason]) return { kind: "message", text: BY_REASON[reason] };
  if (typeof e.code === "string" && e.code.endsWith("unauthenticated")) return { kind: "message", text: "Please sign in again." };
  return { kind: "message", text: "Something went wrong. Try again." };
}
