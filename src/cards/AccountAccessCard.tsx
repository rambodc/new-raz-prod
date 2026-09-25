import { CircleHelp, LockKeyhole } from "lucide-react";
import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import type { AuthMode } from "./types-auth";

type Props = {
  user: User | null;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onSignOut: () => void;
  invite?: boolean;
};

export function AccountAccessCard(props: Props) {
  const { user, mode, setMode, email, setEmail, password, setPassword, busy, onSubmit, onSignOut, invite } = props;
  const title = mode === "signup" ? "Create your account" : mode === "signin" ? "Sign in to Razzberry" : mode === "reset" ? "Reset your password" : user ? "You’re already signed in" : "Keep this conversation";
  const body = mode === "reset"
    ? "Enter your email and we’ll send a reset link."
    : mode ? "Use your email to continue to Razzberry."
      : user ? `${user.email || "Your account"} is active. To use a different account, sign out first.`
        : invite ? "Create a free account to save your chats and pick up where you left off." : "Create an account or sign in to continue.";

  return <section className="inline-auth-card" aria-label="Razzberry account access">
    <div className="auth-card-icon">{user ? <LockKeyhole size={17} /> : <CircleHelp size={17} />}</div>
    <div className="inline-auth-copy"><strong>{title}</strong><span>{body}</span></div>
    {user && !mode ? <button className="button" type="button" onClick={onSignOut}>Sign out to switch accounts</button> : mode ? <form className="inline-auth-form" onSubmit={onSubmit}>
      <label htmlFor="chat-email">Email</label>
      <input id="chat-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      {mode !== "reset" && <><label htmlFor="chat-password">Password</label><input id="chat-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} value={password} onChange={(event) => setPassword(event.target.value)} /></>}
      <button className="button" disabled={busy}>{mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
      <div className="inline-auth-switch">{mode !== "signin" && <button type="button" onClick={() => setMode("signin")}>Sign in</button>}{mode !== "signup" && <button type="button" onClick={() => setMode("signup")}>Sign up</button>}{mode !== "reset" && <button type="button" onClick={() => setMode("reset")}>Forgot password?</button>}</div>
    </form> : <>
      <label className="inline-email-label" htmlFor="inline-email">Your email</label>
      <input id="inline-email" className="inline-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      <div className="inline-auth-actions"><button type="button" onClick={() => setMode("signin")}>Sign in</button><button className="button" type="button" onClick={() => setMode("signup")}>Sign up</button></div>
    </>}
  </section>;
}
