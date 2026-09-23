import { Link } from "react-router-dom";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand${compact ? " brand-compact" : ""}`} to="/" aria-label="Razzberry home">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span>razzberry</span>
  </Link>;
}
