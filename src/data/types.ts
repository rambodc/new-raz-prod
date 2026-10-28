export type Show = {
  id: string;
  venue: string;
  lat: number;
  lng: number;
  startsAt: Date;
  endsAt: Date;
  artistIds: string[];
  artistNames: string[];
};

export type Artist = { id: string; name: string; imageUrl: string | null; fanCount: number };

/** One row on the home screen: how many of this artist's shows the fan has been to. */
export type FanNumber = { artistId: string; artistName: string; count: number };

export type Position = { lat: number; lng: number; accuracy: number };

export type CheckInResult = { status: "checked-in" | "already"; artists: { id: string; name: string; count: number }[] };

export type NewShow = { venue: string; lat: number; lng: number; startsAt: Date; endsAt: Date; artistNames: string[] };
