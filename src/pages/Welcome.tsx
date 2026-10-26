import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { signOutUser } from "../auth/service";
import { greetingName } from "../auth/validation";
import { ArrowIcon } from "../components/Icons";
import { Ambient, BrandLink, ThemeToggle } from "../components/Layout";
import { RaspberryMark } from "../components/RaspberryMark";
import { Spinner } from "../components/Form";
import { spotlight } from "../lib/hooks";

export default function Welcome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const name = greetingName(user?.displayName, user?.email);

  async function out() {
    setBusy(true);
    try {
      await signOutUser();
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page welcome-page">
      <Ambient />
      <header className="auth-top">
        <BrandLink />
        <div className="nav-actions">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost btn-sm" onClick={out} disabled={busy}>
            {busy ? <Spinner /> : null} Sign out
          </button>
        </div>
      </header>
      <main id="main" className="welcome-main">
        <div className="welcome-mark" aria-hidden="true">
          <span className="hero-glow" />
          <RaspberryMark variant="glossy" className="hero-fallback-mark" />
        </div>
        <p className="eyebrow">
          <span className="dot" aria-hidden="true" /> You're in
        </p>
        <h1>
          Welcome, <span className="grad">{name}</span>.
        </h1>
        <p className="lede">Your Razzberry account is ready. We're building the creative rights tools now, and you'll find them right here as they arrive.</p>
        <Link to="/app" className="lab-cta glass" onPointerMove={spotlight}>
          <span className="lab-cta-text">
            <strong>Take a look around</strong>
            <span>Six simple screens.</span>
          </span>
          <span className="lab-cta-go" aria-hidden="true">
            <ArrowIcon />
          </span>
        </Link>
        <div className="account glass" onPointerMove={spotlight}>
          <div>
            <span className="account-label">Signed in as</span>
            <span className="account-value">{user?.email}</span>
          </div>
          <span className="badge">Early access</span>
        </div>
      </main>
    </div>
  );
}
