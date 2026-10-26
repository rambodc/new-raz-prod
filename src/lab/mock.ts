/**
 * Everything on the design-lab pages is invented demo data: no real artists, venues, brands or people.
 * Nothing here is read from or written to a backend.
 */

export type Genre = "Techno" | "House" | "DnB" | "Breaks" | "Ambient" | "Trance";
export const GENRES: Genre[] = ["Techno", "House", "DnB", "Breaks", "Ambient", "Trance"];

export type Show = {
  id: string;
  title: string;
  series: string;
  venue: string;
  hood: string;
  date: string; // ISO date, display only
  doors: string;
  genres: Genre[];
  lineup: string[];
  hue: number; // drives the generated poster art
  hue2: number;
  going: number; // verified fans planning to attend (fake)
};

export const SHOWS: Show[] = [
  { id: "s1", title: "Nightshift: Low Frequency", series: "Nightshift", venue: "Foundry 47", hood: "Inglewood", date: "2026-11-14", doors: "9:00 PM", genres: ["Techno"], lineup: ["Orchid Static", "Mira Kell", "Tundra Pilot"], hue: 330, hue2: 275, going: 312 },
  { id: "s2", title: "Concrete Bloom", series: "Concrete Bloom", venue: "The Annex Floor", hood: "Beltline", date: "2026-11-21", doors: "9:30 PM", genres: ["House", "Breaks"], lineup: ["Juno Tarn", "Kestrel Low"], hue: 18, hue2: 335, going: 188 },
  { id: "s3", title: "Afterglow Protocol", series: "Afterglow", venue: "Signal Hall", hood: "East Village", date: "2026-11-28", doors: "10:00 PM", genres: ["Trance", "Techno"], lineup: ["Halogen Choir", "Sable & Quill"], hue: 200, hue2: 300, going: 241 },
  { id: "s4", title: "Slow Voltage", series: "Slow Voltage", venue: "Lowlight Yard", hood: "Bridgeland", date: "2026-12-05", doors: "8:30 PM", genres: ["Ambient", "House"], lineup: ["Pale Meridian", "Orchid Static"], hue: 160, hue2: 250, going: 97 },
  { id: "s5", title: "Rattle & Hum", series: "Rattle & Hum", venue: "Foundry 47", hood: "Inglewood", date: "2026-12-12", doors: "9:00 PM", genres: ["DnB"], lineup: ["Kestrel Low", "Dub Cartographer", "Mira Kell"], hue: 48, hue2: 345, going: 276 },
  { id: "s6", title: "Nightshift: Year Zero", series: "Nightshift", venue: "The Annex Floor", hood: "Beltline", date: "2026-12-31", doors: "9:00 PM", genres: ["Techno", "Trance"], lineup: ["Tundra Pilot", "Halogen Choir", "Orchid Static", "Juno Tarn"], hue: 300, hue2: 220, going: 520 },
  { id: "s7", title: "Deep Cargo", series: "Deep Cargo", venue: "Signal Hall", hood: "East Village", date: "2027-01-16", doors: "9:30 PM", genres: ["House"], lineup: ["Sable & Quill", "Pale Meridian"], hue: 175, hue2: 320, going: 134 },
];

export type Artist = { id: string; name: string; genres: Genre[]; verified: number; hue: number; hue2: number };
export const ARTISTS: Artist[] = [
  { id: "a1", name: "Orchid Static", genres: ["Techno"], verified: 2184, hue: 330, hue2: 280 },
  { id: "a2", name: "Mira Kell", genres: ["Techno", "DnB"], verified: 1420, hue: 285, hue2: 200 },
  { id: "a3", name: "Juno Tarn", genres: ["House", "Breaks"], verified: 960, hue: 18, hue2: 340 },
  { id: "a4", name: "Halogen Choir", genres: ["Trance", "Techno"], verified: 1105, hue: 205, hue2: 305 },
  { id: "a5", name: "Kestrel Low", genres: ["DnB", "Breaks"], verified: 873, hue: 48, hue2: 350 },
  { id: "a6", name: "Pale Meridian", genres: ["Ambient", "House"], verified: 412, hue: 165, hue2: 255 },
  { id: "a7", name: "Tundra Pilot", genres: ["Techno"], verified: 1688, hue: 255, hue2: 330 },
  { id: "a8", name: "Sable & Quill", genres: ["House", "Trance"], verified: 702, hue: 340, hue2: 190 },
];

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  // Parse as a local date so the day never shifts with the time zone.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", opts);
}

/* ----- Live show ----- */

export const LIVE = {
  show: "Nightshift: Low Frequency",
  venue: "Foundry 47",
  rep: "Dani (Razzberry rep)",
  inRoom: 412,
  scenes: [
    { name: "Static Bloom", hue: 330, hue2: 275 },
    { name: "Cold Fire", hue: 200, hue2: 320 },
    { name: "Signal Rain", hue: 160, hue2: 260 },
    { name: "Red Shift", hue: 12, hue2: 335 },
  ],
  tracks: [
    { title: "Hollow Frequency", artist: "Orchid Static", length: 312 },
    { title: "Night Shelf", artist: "Mira Kell", length: 264 },
    { title: "Glass Ratio", artist: "Tundra Pilot", length: 348 },
  ],
  drops: [
    { id: "d1", name: "Strobe wall", note: "Whole screen goes white for 4 beats", inSec: 38 },
    { id: "d2", name: "Colour flood", note: "Screen turns raspberry on the build", inSec: 140 },
    { id: "d3", name: "Lights out", note: "10 seconds of black, then the drop", inSec: 310 },
  ],
  poll: {
    question: "What should the next 20 minutes feel like?",
    options: [
      { id: "p1", label: "Harder and faster", votes: 164 },
      { id: "p2", label: "Rolling and hypnotic", votes: 201 },
      { id: "p3", label: "Melodic and bright", votes: 87 },
      { id: "p4", label: "Surprise us", votes: 58 },
    ],
  },
  moments: [
    "Doors-to-peak: the floor passed 400 verified fans",
    "Orchid Static took over from the opener",
    "The first drop landed: the whole room counted down",
    "Dani changed the screen to Cold Fire",
    "A new crowd vote just opened",
    "Mira Kell dropped an unreleased edit (name withheld)",
    "412 fans in the room, 61 are here for the first time",
    "The next drop is queued by the rep",
    "Floor is full: great time to find your friends",
    "Verified check-ins hit a venue record for this series",
  ],
};

/* ----- Passport ----- */

export const PASSPORT = {
  level: "Regular",
  levelNo: 4,
  stats: [
    { label: "Shows attended", value: 9 },
    { label: "Venues", value: 4 },
    { label: "Artists seen", value: 17 },
    { label: "Longest streak", value: 5 },
  ],
  stamps: [
    { id: "t1", show: "Nightshift: Low Frequency", venue: "Foundry 47", date: "2026-10-17", hue: 330 },
    { id: "t2", show: "Concrete Bloom", venue: "The Annex Floor", date: "2026-10-03", hue: 18 },
    { id: "t3", show: "Afterglow Protocol", venue: "Signal Hall", date: "2026-09-19", hue: 200 },
    { id: "t4", show: "Slow Voltage", venue: "Lowlight Yard", date: "2026-09-05", hue: 160 },
    { id: "t5", show: "Rattle & Hum", venue: "Foundry 47", date: "2026-08-22", hue: 48 },
    { id: "t6", show: "Nightshift: Soft Launch", venue: "Foundry 47", date: "2026-08-08", hue: 300 },
    { id: "t7", show: "Deep Cargo", venue: "Signal Hall", date: "2026-07-25", hue: 175 },
    { id: "t8", show: "Concrete Bloom", venue: "The Annex Floor", date: "2026-07-11", hue: 12 },
    { id: "t9", show: "Nightshift: Opening Night", venue: "Foundry 47", date: "2026-06-27", hue: 320 },
  ],
  badges: [
    { id: "b1", name: "First night", hint: "Verified at your first show", earned: true, shape: "hex", progress: 1 },
    { id: "b2", name: "Early doors", hint: "In the room in the first hour", earned: true, shape: "star", progress: 1 },
    { id: "b3", name: "Three-peat", hint: "Three shows in a row", earned: true, shape: "ring", progress: 1 },
    { id: "b4", name: "Series regular", hint: "Five Nightshift nights", earned: true, shape: "diamond", progress: 1 },
    { id: "b5", name: "Venue hopper", hint: "Four different venues", earned: true, shape: "tri", progress: 1 },
    { id: "b6", name: "Last one standing", hint: "Verified in the final hour", earned: false, shape: "star", progress: 0.6 },
    { id: "b7", name: "Ten club", hint: "Ten verified shows", earned: false, shape: "hex", progress: 0.9 },
    { id: "b8", name: "Year zero", hint: "Be there on New Year's Eve", earned: false, shape: "diamond", progress: 0 },
  ],
  timeline: [
    { date: "2026-10-17", text: "Checked in at Foundry 47", sub: "Nightshift: Low Frequency, in the room 3h 12m" },
    { date: "2026-10-03", text: "Checked in at The Annex Floor", sub: "Concrete Bloom, streak reached 4" },
    { date: "2026-09-19", text: "Earned the Series regular badge", sub: "Fifth Nightshift night" },
    { date: "2026-09-05", text: "Checked in at Lowlight Yard", sub: "Slow Voltage, new venue unlocked" },
    { date: "2026-08-22", text: "Checked in at Foundry 47", sub: "Rattle & Hum, 3 new artists" },
  ],
};

/* ----- Rewards ----- */

export const REWARDS = {
  streak: 5,
  best: 5,
  toNext: { have: 5, need: 6, reward: "Insider: priority entry at the door" },
  tiers: [
    { id: "r1", name: "Newcomer", shows: 1, perks: ["Digital passport", "Name in the monthly thank-you wall"] },
    { id: "r2", name: "Regular", shows: 3, perks: ["Double-weight crowd votes", "Early look at lineups"] },
    { id: "r3", name: "Insider", shows: 6, perks: ["Priority entry lane", "Request a track for the opener"] },
    { id: "r4", name: "Inner circle", shows: 10, perks: ["Soundcheck invite", "Meet the artist after the set", "A numbered poster for your wall"] },
  ],
  current: 1, // index of the tier currently held (Regular)
  hooks: [
    { id: "h1", show: "Nightshift: Year Zero", date: "2026-12-31", line: "Show 10 of your run: unlocks the Inner circle", hue: 300 },
    { id: "h2", show: "Rattle & Hum", date: "2026-12-12", line: "Your next show unlocks Insider", hue: 48 },
    { id: "h3", show: "Concrete Bloom", date: "2026-11-21", line: "Keep the streak alive: shows 6 in a row", hue: 18 },
  ],
  friends: { code: "RZ-FRIEND-48K", joined: 1, goal: 3 },
};

/* ----- Artist dashboard ----- */

export const ARTIST = {
  name: "Orchid Static",
  period: "Last 90 days",
  verified: 2184,
  followers: 18430,
  returningRate: 47,
  returningDelta: 6,
  avgShows: 2.3,
  monthVerified: 612,
  shows: [
    { name: "Opening Night", verified: 168, returning: 0, capacity: 0.56 },
    { name: "Soft Launch", verified: 214, returning: 52, capacity: 0.71 },
    { name: "Concrete Bloom I", verified: 205, returning: 71, capacity: 0.68 },
    { name: "Rattle & Hum", verified: 247, returning: 96, capacity: 0.82 },
    { name: "Deep Cargo", verified: 231, returning: 99, capacity: 0.77 },
    { name: "Slow Voltage", verified: 189, returning: 88, capacity: 0.63 },
    { name: "Afterglow", verified: 262, returning: 124, capacity: 0.87 },
    { name: "Concrete Bloom II", verified: 276, returning: 139, capacity: 0.92 },
    { name: "Nightshift 7", verified: 301, returning: 158, capacity: 1 },
    { name: "Low Frequency", verified: 312, returning: 171, capacity: 1 },
  ],
  hoods: [
    { name: "Beltline", pct: 24 },
    { name: "Inglewood", pct: 17 },
    { name: "Kensington", pct: 13 },
    { name: "Bridgeland", pct: 11 },
    { name: "Marda Loop", pct: 9 },
    { name: "East Village", pct: 8 },
    { name: "Mission", pct: 6 },
    { name: "NW suburbs", pct: 7 },
    { name: "Airdrie and beyond", pct: 5 },
  ],
  tiers: [
    { name: "Newcomers", pct: 54, color: "var(--tier-1)" },
    { name: "Regulars", pct: 28, color: "var(--tier-2)" },
    { name: "Insiders", pct: 13, color: "var(--tier-3)" },
    { name: "Inner circle", pct: 5, color: "var(--tier-4)" },
  ],
  insight: {
    title: "Your regulars peak on Saturday doors-open",
    body: "Fans who arrive in the first hour come back 2.1x more often than late arrivals. Opening a second early-entry window and putting a rising local act in that slot is the cheapest way to turn newcomers into regulars. Four Beltline fans in your top tier have not been to a show in 5 weeks: a note about Nightshift: Year Zero should reach them.",
    confidence: "Medium confidence",
  },
};
