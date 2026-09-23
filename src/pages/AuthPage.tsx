import { useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { ArrowLeft, ArrowUpRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { Brand } from "../components/Brand";

type Mode = "signup" | "signin" | "reset";

const copy = {
  signup: { eyebrow: "Your creative workspace", title: "Start with a clean slate.", body: "Create an account to step into the Razzberry workspace." },
  signin: { eyebrow: "Welcome back", title: "Pick up where you left off.", body: "Sign in to return to your Razzberry workspace." },
  reset: { eyebrow: "Account recovery", title: "A fresh start is close.", body: "Enter your email and we’ll send you a password reset link." },
};

export function AuthPage({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const destination = (location.state as { from?: string } | null)?.from || "/dashboard";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        navigate("/dashboard", { replace: true });
      } else if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        navigate(destination, { replace: true });
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice("If an account exists for that email, a reset link is on its way.");
      }
    } catch (err) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      if (code.includes("email-already-in-use")) setError("An account already exists for this email. Sign in instead.");
      else if (code.includes("invalid-credential") || code.includes("wrong-password")) setError("That email and password combination could not be verified.");
      else if (code.includes("weak-password")) setError("Use a password with at least 8 characters.");
      else if (code.includes("invalid-email")) setError("Enter a valid email address.");
      else if (code.includes("too-many-requests")) setError("Too many attempts. Wait a moment and try again.");
      else if (code.includes("operation-not-allowed")) setError("Email and password sign-in has not been enabled for this project yet.");
      else setError("We couldn’t complete that request. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const content = copy[mode];

  return <main className="auth-layout">
    <aside className="auth-aside"><Brand /><Link to="/" className="back-home"><ArrowLeft size={16} /> Back to Razzberry</Link><div className="auth-aside-copy"><span className="eyebrow"><span className="live-dot" /> {content.eyebrow}</span><h1>Rights have a story.<br /><em>Give it a home.</em></h1><p>A clearer record for the creative work that moves culture forward.</p><div className="auth-aside-lines"><span>CREATE</span><i /><span>PROVE</span><i /><span>OWN</span><i /><span>MOVE</span></div></div><small className="auth-aside-foot">RAZZBERRY / CREATIVE RIGHTS INFRASTRUCTURE</small></aside>
    <section className="auth-main"><Link to="/" className="mobile-brand"><Brand /></Link><div className="auth-card-wrap"><div className="auth-card-heading"><span className="eyebrow">{content.eyebrow}</span><h2>{content.title}</h2><p>{content.body}</p></div>
      {error && <div className="form-message form-error" role="alert">{error}</div>}
      {notice && <div className="form-message form-success" role="status">{notice}</div>}
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="email">Email address</label><div className="input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div>
        {mode !== "reset" && <><label htmlFor="password">Password</label><div className="input-wrap"><LockKeyhole size={17} /><input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></>}
        {mode === "signin" && <div className="forgot-row"><span /> <Link to="/forgot-password">Forgot password?</Link></div>}
        <button className="button auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : "Send reset link"}<ArrowUpRight size={16} /></button>
      </form>
      <div className="auth-switch">{mode === "signup" ? <>Already have an account? <Link to="/signin">Sign in</Link></> : mode === "signin" ? <>New to Razzberry? <Link to="/signup">Create an account</Link></> : <>Remembered it? <Link to="/signin">Return to sign in</Link></>}</div>
      <div className="auth-legal">By continuing, you agree to use Razzberry responsibly. Terms and privacy details will be added as the product takes shape.</div>
    </div><footer className="auth-footer">© {new Date().getFullYear()} Razzberry <span>Early access</span></footer></section>
  </main>;
}
