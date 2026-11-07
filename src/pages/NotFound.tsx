import { Link } from "react-router-dom";
import { BrandLink, ThemeToggle } from "../components/Layout";
import { THEMES } from "../world/theme";
import WorldStage, { WorldHeader } from "../world/WorldStage";

export default function NotFound() {
  return (
    <WorldStage stage="auth" theme={THEMES.raspberry} portalStyle="quiet" description="That page isn't here.">
      <WorldHeader start={<BrandLink />} end={<ThemeToggle />} />
      <section className="world-auth-sheet">
        <p className="eyebrow">404</p>
        <h1>That page isn't here.</h1>
        <p className="auth-sub">The link may be old, or the page may have moved.</p>
        <Link to="/" className="btn btn-primary btn-block">
          Back to home
        </Link>
      </section>
    </WorldStage>
  );
}
