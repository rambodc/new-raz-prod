import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage } from "../auth/errors";
import { signIn } from "../auth/service";
import { hasErrors, validateSignIn } from "../auth/validation";
import { Field, FormAlert, PasswordField, Spinner } from "../components/Form";
import { AuthShell } from "../components/Layout";
import { spotlight } from "../lib/hooks";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError("");
    const found = validateSignIn({ email, password });
    setErrors(found);
    if (hasErrors(found)) return;
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (error) {
      setFormError(authErrorMessage(error));
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <section className="auth-card glass" onPointerMove={spotlight} aria-labelledby="auth-title">
        <h1 id="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to your Razzberry account.</p>
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
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField label="Password" name="password" autoComplete="current-password" value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
          <div className="form-aside">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
        <p className="auth-switch">
          New to Razzberry? <Link to="/signup">Create an account</Link>
        </p>
      </section>
    </AuthShell>
  );
}
