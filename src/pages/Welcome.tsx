import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { signOutUser } from "../auth/service";
import { greetingName } from "../auth/validation";
import { Spinner } from "../components/Form";
import { Ambient, BrandLink, ThemeToggle } from "../components/Layout";
import { spotlight } from "../lib/hooks";

/** The account screen: who you are, and a way out. */
export default function Welcome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const name = greetingName(user?.displayName, user?.email);

  async function out() {
    setBusy(true);
    try {
      await signOutUser();
      navigate("/signin", { replace: true });
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
        <h1>
          Welcome, <span className="grad">{name}</span>.
        </h1>
        <div className="account glass" onPointerMove={spotlight}>
          <div>
            <span className="account-label">Signed in as</span>
            <span className="account-value">{user?.email}</span>
          </div>
        </div>
        <Link to="/" className="btn btn-primary">
          Back to tonight
        </Link>
      </main>
    </div>
  );
}
