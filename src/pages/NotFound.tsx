import { Link } from "react-router-dom";
import { Ambient, BrandLink, ThemeToggle } from "../components/Layout";

export default function NotFound() {
  return (
    <div className="page auth-page">
      <Ambient />
      <header className="auth-top">
        <BrandLink />
        <ThemeToggle />
      </header>
      <main id="main" className="auth-main">
        <section className="auth-card glass center">
          <p className="eyebrow">404</p>
          <h1>That page isn't here.</h1>
          <p className="auth-sub">The link may be old, or the page may have moved.</p>
          <Link to="/" className="btn btn-primary btn-block">
            Back to home
          </Link>
        </section>
      </main>
    </div>
  );
}
