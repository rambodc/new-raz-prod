export function splitByTime<T extends { startsAt: Date }>(items: readonly T[], now = Date.now()): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const item of items) {
    if (item.startsAt.getTime() >= now) upcoming.push(item);
    else past.push(item);
  }
  upcoming.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  past.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return { upcoming, past };
}
