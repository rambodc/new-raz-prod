import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { authErrorMessage } from "../auth/errors";
import { signUp } from "../auth/service";
import { MIN_PASSWORD_LENGTH, hasErrors, validateSignUp } from "../auth/validation";
import { Field, FormAlert, PasswordField, Spinner } from "../components/Form";
import { AuthShell } from "../components/Layout";
import { spotlight } from "../lib/hooks";

type Errors = { name?: string; email?: string; password?: string; confirm?: string };

export default function SignUp() {
  const { setHoldRedirect, refreshUser } = useAuth();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError("");
    const found = validateSignUp(values);
    setErrors(found);
    if (hasErrors(found)) return;
    setBusy(true);
    setHoldRedirect(true);
    try {
      await signUp({ name: values.name, email: values.email, password: values.password });
      await refreshUser();
    } catch (error) {
      setFormError(authErrorMessage(error));
      setBusy(false);
    } finally {
      setHoldRedirect(false);
    }
  }

  return (
    <AuthShell>
      <section className="auth-card glass" onPointerMove={spotlight} aria-labelledby="auth-title">
        <h1 id="auth-title">Create your account</h1>
        <p className="auth-sub">Join Razzberry in early access.</p>
        <form onSubmit={onSubmit} noValidate>
          <FormAlert>{formError}</FormAlert>
          <Field label="Name" name="name" autoComplete="name" value={values.name} error={errors.name} onChange={set("name")} />
          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={values.email}
            error={errors.email}
            onChange={set("email")}
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            value={values.password}
            error={errors.password}
            onChange={set("password")}
          />
          <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" value={values.confirm} error={errors.confirm} onChange={set("confirm")} />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Creating account…
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </section>
    </AuthShell>
  );
}
