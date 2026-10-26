import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage } from "../auth/errors";
import { sendPasswordReset } from "../auth/service";
import { validateEmail } from "../auth/validation";
import { Field, FormAlert, Spinner } from "../components/Form";
import { AuthShell } from "../components/Layout";
import { spotlight } from "../lib/hooks";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError("");
    const invalid = validateEmail(email);
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setFormError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <section className="auth-card glass" onPointerMove={spotlight} aria-labelledby="auth-title">
        <h1 id="auth-title">Reset your password</h1>
        <p className="auth-sub">Enter your email and we'll send you a link to choose a new one.</p>
        {sent ? (
          <>
            <FormAlert tone="success">If an account exists for {email.trim()}, a reset link is on its way. Check your inbox and spam folder.</FormAlert>
            <p className="auth-switch">
              <Link to="/signin">Back to sign in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <FormAlert>{formError}</FormAlert>
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              error={error}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </button>
            <p className="auth-switch">
              Remembered it? <Link to="/signin">Back to sign in</Link>
            </p>
          </form>
        )}
      </section>
    </AuthShell>
  );
}
