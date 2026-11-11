import { useEffect, useRef, useState, type FormEvent } from "react";
import { cleanEmail, validEmail } from "./profile";
import { explain, requestCode, verifyCode } from "./services";
import { Field } from "./ui";

export function usePreviewNudge(enabled: boolean, onOpen: () => void) {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    if (!enabled) return;
    let done = false;
    const open = () => {
      if (done) return;
      done = true;
      openRef.current();
    };
    const timer = window.setTimeout(open, 3200);
    const onScroll = () => {
      if (window.scrollY > 180) open();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled]);
}

export function SignInSheet({ onClose, onVerified }: { onClose: () => void; onVerified: () => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    const next = cleanEmail(email);
    if (!validEmail(next)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestCode(next);
      setSentTo(next);
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyCode(sentTo, code);
      onVerified();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <div className="signin-sheet" role="dialog" aria-labelledby="signin-title">
      <div className="signin-head">
        <h2 id="signin-title">Sign in to join in</h2>
        <button type="button" className="stage-text" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="signin-copy">The page stays here. Sign in to play, open the details, and come back to this link.</p>
      {sentTo ? (
        <form onSubmit={(event) => void confirm(event)}>
          <Field label="Code" inputMode="numeric" autoComplete="one-time-code" value={code} disabled={busy} maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void send(event)}>
          <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" placeholder="you@email.com" value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      )}
    </div>
  );
}
