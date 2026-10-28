/** A small round picture for an artist, or their first letter if they have no picture yet. */
export function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img className="avatar" src={url} alt="" loading="lazy" />
  ) : (
    <span className="avatar avatar--blank" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
