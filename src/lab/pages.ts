export type LabPage = { key: string; path: string; label: string; tag: string; group: "Fan" | "Artist" | "Show night" };

export const LAB_PAGES: LabPage[] = [
  { key: "pass", path: "/app/pass", label: "Pass", tag: "Your ticket", group: "Fan" },
  { key: "passport", path: "/app/passport", label: "Passport", tag: "Your nights", group: "Fan" },
  { key: "discover", path: "/app/discover", label: "Discover", tag: "What's next", group: "Fan" },
  { key: "artist", path: "/app/artist", label: "Verified fans", tag: "Real fans", group: "Artist" },
  { key: "live", path: "/app/live", label: "Venue screen", tag: "For the TV", group: "Show night" },
  { key: "rep", path: "/app/rep", label: "Rep phone", tag: "In the rep's hand", group: "Show night" },
];
