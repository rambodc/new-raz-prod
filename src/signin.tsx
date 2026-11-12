import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { rememberInvite } from "./inviteApi";
import { cleanEmail, validEmail } from "./profile";
import { inviteCodeFromPath, returnPathFromSearch, safeReturnPath } from "./routes";
import { authFailure, requestCode, verifyCode } from "./services";
import { Field } from "./ui";

const PENDING_KEY = "razzberry.pendingSignIn";
const RETURN_KEY = "razzberry.returnTo";

export type PendingSignIn = { email: string; step: "code"; cooldownUntil: number };

export function readPendingSignIn(): PendingSignIn | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PendingSignIn>;
    const email = cleanEmail(String(data.email ?? ""));
    if (!validEmail(email) || data.step !== "code") return null;
    const cooldownUntil = Number(data.cooldownUntil);
    return { email, step: "code", cooldownUntil: Number.isFinite(cooldownUntil) ? cooldownUntil : 0 };
  } catch {
    return null;
  }
}

export function writePendingSignIn(pending: PendingSignIn | null) {
  try {
    if (!pending) sessionStorage.removeItem(PENDING_KEY);
    else sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Private mode can refuse storage. This visit still keeps the step in memory.
  }
}

export function rememberReturnPath(path: string): string {
  const safe = safeReturnPath(path) || "/";
  const code = inviteCodeFromPath(safe);
  if (code) rememberInvite(code);
  try {
    sessionStorage.setItem(RETURN_KEY, safe);
  } catch {
    // The address bar still has the page when the dialog is only a popup.
  }
  return safe;
}

export function readReturnPath(): string {
  try {
    return safeReturnPath(sessionStorage.getItem(RETURN_KEY)) || "";
  } catch {
    return "";
  }
}

export function clearReturnPath() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function signInDestination(search: string): string {
  return returnPathFromSearch(search) || readReturnPath() || "/";
}

export function formatWait(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function CodeBoxes({
  value,
  disabled,
  onChange,
  onComplete,
}: {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onComplete: (next: string) => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete(clean);
  }

  function put(index: number, chars: string) {
    const clean = chars.replace(/\D/g, "");
    if (!clean) {
      commit(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    if (clean.length >= 6) {
      commit(clean);
      refs.current[5]?.focus();
      return;
    }
    const merged = (value.slice(0, index) + clean + value.slice(index + clean.length)).slice(0, 6);
    commit(merged);
    refs.current[Math.min(index + clean.length, 5)]?.focus();
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!/\d/.test(text)) return;
    event.preventDefault();
    put(index, text);
  }

  function onKeyDown(index: number, event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        commit(value.slice(0, index) + value.slice(index + 1));
        return;
      }
      if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index));
        refs.current[index - 1]?.focus();
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 5) refs.current[index + 1]?.focus();
  }

  return (
    <div className="code-boxes" role="group" aria-label="6-digit code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label={`Digit ${index + 1}`}
          onChange={(event) => put(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={(event) => onPaste(index, event)}
          onFocus={(event) => event.currentTarget.select()}
        />
      ))}
    </div>
  );
}

export function SignInSheet({ onClose, onVerified }: { onClose: () => void; onVerified: () => void }) {
  const pending = useRef(readPendingSignIn());
  const [step, setStep] = useState<"email" | "code">(pending.current ? "code" : "email");
  const [email, setEmail] = useState(pending.current?.email ?? "");
  const [sentTo, setSentTo] = useState(pending.current?.email ?? "");
  const [code, setCode] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(pending.current?.cooldownUntil ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const prevRoot = root.style.overflow;
    const prevBody = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevRoot;
      body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (step !== "code") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [step]);

  const remain = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  function enterCode(address: string, until: number) {
    setEmail(address);
    setSentTo(address);
    setStep("code");
    setCode("");
    setCooldownUntil(until);
    writePendingSignIn({ email: address, step: "code", cooldownUntil: until });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const next = cleanEmail(email);
    if (!validEmail(next)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      await requestCode(next);
      enterCode(next, Date.now() + 60_000);
    } catch (caught) {
      const failure = authFailure(caught);
      if (failure.reason === "too-soon" || failure.reason === "rate-limited") {
        const seconds = failure.retryAfterSeconds || 60;
        enterCode(next, Date.now() + seconds * 1000);
        setNote(failure.reason === "too-soon" ? "A code was already sent. Enter it below." : failure.message);
      } else {
        setError(failure.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busyRef.current || remain > 0 || !sentTo) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNote("");
    try {
      await requestCode(sentTo);
      const until = Date.now() + 60_000;
      setCode("");
      setCooldownUntil(until);
      writePendingSignIn({ email: sentTo, step: "code", cooldownUntil: until });
      setNote("We sent a new code.");
    } catch (caught) {
      const failure = authFailure(caught);
      if (failure.retryAfterSeconds > 0 || failure.reason === "too-soon" || failure.reason === "rate-limited") {
        const seconds = failure.retryAfterSeconds || 60;
        const until = Date.now() + seconds * 1000;
        setCooldownUntil(until);
        writePendingSignIn({ email: sentTo, step: "code", cooldownUntil: until });
      }
      setError(failure.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function confirm(digits: string) {
    if (busyRef.current) return;
    if (!/^\d{6}$/.test(digits)) {
      setError("Enter the 6-digit code.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await verifyCode(sentTo, digits);
      writePendingSignIn(null);
      onVerifiedRef.current();
    } catch (caught) {
      setError(authFailure(caught).message);
      setCode("");
      busyRef.current = false;
      setBusy(false);
    }
  }

  function differentEmail() {
    writePendingSignIn(null);
    setStep("email");
    setCode("");
    setError("");
    setNote("");
    setCooldownUntil(0);
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (busyRef.current) return;
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="signin-layer" onMouseDown={closeFromBackdrop}>
      <div className="signin-sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="signin-head">
          <h2 id="signin-title">{step === "code" ? "Enter your code" : "Sign in"}</h2>
          <button type="button" className="stage-text" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        {step === "code" ? (
          <form className="code-step" onSubmit={(event) => { event.preventDefault(); void confirm(code); }}>
            <p className="signin-copy">
              Sent to <strong>{sentTo}</strong>. New here? This creates your account too.
            </p>
            <CodeBoxes value={code} disabled={busy} onChange={setCode} onComplete={(next) => void confirm(next)} />
            {note ? <p className="signin-note">{note}</p> : null}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Continue"}
            </button>
            <div className="signin-actions">
              <button type="button" className="text-button" disabled={busy || remain > 0} onClick={() => void resend()}>
                {remain > 0 ? `Resend code in ${formatWait(remain)}` : "Resend code"}
              </button>
              <button type="button" className="text-button" disabled={busy} onClick={differentEmail}>
                Use a different email
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(event) => void send(event)}>
            <p className="signin-copy">We'll email you a 6-digit code. No password needed.</p>
            <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" placeholder="you@email.com" value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
