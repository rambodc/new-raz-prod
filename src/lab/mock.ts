/** Invented demo data. Nothing here comes from, or goes to, a backend. */

export type Genre = "Techno" | "House" | "DnB";
export const GENRES: Genre[] = ["Techno", "House", "DnB"];

export type Show = { id: string; title: string; venue: string; date: string; genre: Genre; hue: number; hue2: number };

export const SHOWS: Show[] = [
  { id: "s1", title: "Low Frequency", venue: "Foundry 47", date: "2026-11-14", genre: "Techno", hue: 330, hue2: 275 },
  { id: "s2", title: "Concrete Bloom", venue: "The Annex Floor", date: "2026-11-21", genre: "House", hue: 18, hue2: 335 },
  { id: "s3", title: "Afterglow", venue: "Signal Hall", date: "2026-11-28", genre: "Techno", hue: 200, hue2: 300 },
  { id: "s4", title: "Rattle & Hum", venue: "Foundry 47", date: "2026-12-12", genre: "DnB", hue: 48, hue2: 345 },
  { id: "s6", title: "Year Zero", venue: "The Annex Floor", date: "2026-12-31", genre: "Techno", hue: 300, hue2: 220 },
  { id: "s5", title: "Deep Cargo", venue: "Signal Hall", date: "2027-01-16", genre: "House", hue: 175, hue2: 320 },
];

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  // Parse as a local date so the day never shifts with the time zone.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", opts);
}

export const PASS = { title: "Low Frequency", venue: "Foundry 47", date: "2026-11-14", hue: 330, hue2: 275 };

export const LIVE = {
  scenes: [
    { name: "Static Bloom", hue: 330, hue2: 275 },
    { name: "Cold Fire", hue: 200, hue2: 320 },
    { name: "Signal Rain", hue: 160, hue2: 260 },
    { name: "Red Shift", hue: 12, hue2: 335 },
  ],
  dropEverySec: 36,
  question: "What next?",
  options: [
    { id: "p1", label: "Faster", votes: 164 },
    { id: "p2", label: "Smoother", votes: 201 },
  ],
};

export const PASSPORT = {
  stamps: [
    { id: "t1", show: "Low Frequency", date: "2026-10-17", hue: 330 },
    { id: "t2", show: "Concrete Bloom", date: "2026-10-03", hue: 18 },
    { id: "t3", show: "Afterglow", date: "2026-09-19", hue: 200 },
    { id: "t4", show: "Slow Voltage", date: "2026-09-05", hue: 160 },
    { id: "t5", show: "Rattle & Hum", date: "2026-08-22", hue: 48 },
    { id: "t6", show: "Soft Launch", date: "2026-08-08", hue: 300 },
    { id: "t7", show: "Deep Cargo", date: "2026-07-25", hue: 175 },
    { id: "t8", show: "Concrete Bloom", date: "2026-07-11", hue: 12 },
    { id: "t9", show: "Opening Night", date: "2026-06-27", hue: 320 },
  ],
};

export const REWARDS = { streak: 5, need: 6, reward: "priority entry" };

export const ARTIST = {
  verified: 2184,
  followers: 18430,
  shows: [168, 214, 205, 247, 231, 189, 262, 276, 301, 312],
};
