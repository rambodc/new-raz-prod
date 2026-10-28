export type Place = { label: string; lat: number; lng: number };

/** Reads OpenStreetMap's reply into plain places. Anything odd is skipped. */
export function parsePlaces(json: unknown): Place[] {
  if (!Array.isArray(json)) return [];
  const places: Place[] = [];
  for (const item of json) {
    const x = (item ?? {}) as { display_name?: unknown; lat?: unknown; lon?: unknown };
    const lat = Number(x.lat);
    const lng = Number(x.lon);
    if (typeof x.display_name === "string" && Number.isFinite(lat) && Number.isFinite(lng)) places.push({ label: x.display_name, lat, lng });
  }
  return places;
}

/** Looks up an address with OpenStreetMap's free search (no key). One call per tap of "Find". */
export async function searchAddress(text: string): Promise<Place[]> {
  const q = text.trim();
  if (!q) return [];
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Search failed.");
  return parsePlaces(await res.json());
}
