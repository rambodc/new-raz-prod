import type { LabRole } from "./context";

export type LabPage = { key: string; path: string; label: string; role: LabRole; blurb: string };

export const LAB_PAGES: LabPage[] = [
  { key: "pass", path: "/app/pass", label: "Show pass", role: "fan", blurb: "A tilting, ticket-like pass with a proof-of-presence code that rotates every 30 seconds." },
  { key: "live", path: "/app/live", label: "Live show", role: "fan", blurb: "Show-day companion: screen sync, the next drop, a crowd vote and a feed of moments." },
  { key: "passport", path: "/app/passport", label: "Passport", role: "fan", blurb: "Every show you were really at, as stamps, badges, stats and a timeline." },
  { key: "rewards", path: "/app/rewards", label: "Rewards", role: "fan", blurb: "Streak orb, reward tiers, reasons to come back and a bring-a-friend tile." },
  { key: "discover", path: "/app/discover", label: "Discover", role: "fan", blurb: "Featured show, genre chips, upcoming nights and the artists behind them." },
  { key: "artist", path: "/app/artist", label: "Verified fans", role: "artist", blurb: "The proof story for artists: verified fans vs followers, loyalty, attendance and city heat." },
];
