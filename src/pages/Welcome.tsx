import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { signOutUser } from "../auth/service";
import { greetingName } from "../auth/validation";
import { Spinner } from "../components/Form";
import { BrandLink, ThemeToggle } from "../components/Layout";
import { THEMES } from "../world/theme";
import WorldStage, { WorldHeader } from "../world/WorldStage";

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
    <WorldStage stage="auth" theme={THEMES.raspberry} portalStyle="quiet" description={`Account for ${name}.`}>
      <WorldHeader
        start={<BrandLink />}
        end={
          <>
            <ThemeToggle />
            <button type="button" className="btn btn-ghost btn-sm" onClick={out} disabled={busy}>
              {busy ? <Spinner /> : null} Sign out
            </button>
          </>
        }
      />
      <section className="world-auth-sheet">
        <h1>
          Welcome, <span className="grad">{name}</span>.
        </h1>
        <div className="account glass">
          <div>
            <span className="account-label">Signed in as</span>
            <span className="account-value">{user?.email}</span>
          </div>
        </div>
        <Link to="/" className="btn btn-primary">
          Back to your world
        </Link>
        <p className="auth-demo">
          <Link to="/demo">Try the UI demo</Link>
        </p>
        <p className="auth-demo-note">Sample artist NOVA, kept on this device. It does not change your account.</p>
      </section>
    </WorldStage>
  );
}
