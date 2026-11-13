import { describe, expect, it } from "vitest";
import { canonicalFor, focusFromPage, focusReady, type Artist, type ArtistPageData, type EventItem, type Track } from "./data";

const artist: Artist = { id: "ada", name: "Ada Vale", bio: "Night bass", imageURL: "", ownerUid: "ada", slug: "ada-vale" };

function event(patch: Partial<EventItem> & Pick<EventItem, "id" | "slug">): EventItem {
  return {
    artistId: "ada",
    title: patch.slug,
    startsAt: new Date("2026-11-11T03:00:00Z"),
    venue: "Hall",
    city: "Calgary",
    description: "A late set",
    imageURL: "",
    ticketUrl: "",
    ...patch,
  };
}

const track: Track = { id: "t1", title: "Midnight", duration: 180, order: 0, audioURL: "https://example.com/a.mp3", coverURL: "", slug: "midnight" };

const page: ArtistPageData = {
  artist,
  events: [event({ id: "e1", slug: "river-room", title: "River Room" })],
  tracks: [track],
};

describe("opening an event from the page already loaded", () => {
  it("resolves a public event and a track from slugs without a share lookup", () => {
    const focus = focusFromPage({ name: "share", artistSlug: "ada-vale", eventSlug: "river-room", trackSlug: null }, page);
    expect(focusReady(focus)).toBe(true);
    expect(focus.openEventId).toBe("e1");
    const song = focusFromPage({ name: "share", artistSlug: "ada-vale", eventSlug: null, trackSlug: "midnight" }, page);
    expect(focusReady(song)).toBe(true);
    expect(song.highlightTrackId).toBe("t1");
  });

  it("does not treat a missing slug as an open event", () => {
    const focus = focusFromPage({ name: "share", artistSlug: "ada-vale", eventSlug: "secret-set", trackSlug: null }, page);
    expect(focus.sameArtist).toBe(true);
    expect(focus.pendingEvent).toBe(true);
    expect(focusReady(focus)).toBe(false);
    expect(focus.openEventId).toBeNull();
  });

  it("uses the event share path for every event", () => {
    const next = event({ id: "e2", slug: "secret-set", title: "Secret Set" });
    const owned: ArtistPageData = { ...page, events: [...page.events, next] };
    const focus = focusFromPage({ name: "event", id: "e2" }, owned);
    expect(focusReady(focus)).toBe(true);
    expect(focus.openEventId).toBe("e2");
    expect(canonicalFor({ name: "event", id: "e2" }, owned)).toBe("/ada-vale/secret-set");
    expect(canonicalFor({ name: "event", id: "e1" }, page)).toBe("/ada-vale/river-room");
  });
});
