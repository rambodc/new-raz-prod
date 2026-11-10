import type { Role } from "./profile";

export function ownsArtist(uid: string, role: Role, artist: { id: string; ownerUid: string } | null | undefined): boolean {
  return artist != null && role === "artist" && uid === artist.id && uid === artist.ownerUid;
}
