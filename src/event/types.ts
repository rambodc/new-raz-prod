export type StylePreset = "calm" | "editorial" | "soft";
export type GuestStatus = "invited" | "yes" | "no" | "maybe";

export type Guest = { id: string; name: string; group: string; status: GuestStatus };

export type EventPage = {
  title: string;
  description: string;
  date: string;
  time: string;
  timeZone: string;
  venue: string;
  artistName: string;
  style: StylePreset;
  guests: Guest[];
};
