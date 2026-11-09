import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { cleanEmail, cleanName, validEmail, validName, type Profile } from "./profile";
import { explain, requestCode, saveProfile, signOutUser, uploadAvatar, verifyCode, watchSession, type Session } from "./services";

const PENDING_KEY = "razzberry.pendingEmail";

type Pending = { email: string; sentAt: number };

function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Pending>;
    if (typeof parsed.email !== "string" || !parsed.email) return null;
    return { email: parsed.email, sentAt: typeof parsed.sentAt === "number" ? parsed.sentAt : 0 };
  } catch {
    return null;
  }
}

function writePending(pending: Pending) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

function clearPending() {
  sessionStorage.removeItem(PENDING_KEY);
}

function currentPath(): string {
  const path = window.location.pathname.replace(/\/$/, "");
  return path.length > 0 ? path : "/";
}

export default function App() {
  const [session, setSession] = useState<Session>(import.meta.env.MODE === "test" ? { status: "signed-out" } : { status: "loading" });
  const [path, setPath] = useState(currentPath);
  const [pending, setPending] = useState<Pending | null>(() => (import.meta.env.MODE === "test" ? null : readPending()));
  const [codeStep, setCodeStep] = useState(() => import.meta.env.MODE !== "test" && readPending() !== null);
  const [signingIn, setSigningIn] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    return watchSession(setSession);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--keyboard", `${inset}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  useEffect(() => {
    if (session.status === "signed-in") {
      clearPending();
      setSigningIn(false);
    }
  }, [session]);

  useEffect(() => {
    if (session.status === "signed-out" && path === "/settings") {
      window.history.replaceState({ razz: true }, "", "/");
      setPath("/");
    }
  }, [session, path]);

  function go(next: string) {
    window.history.pushState({ razz: true }, "", next);
    setPath(next);
  }

  function backHome() {
    if (window.history.state?.razz) window.history.back();
    else {
      window.history.replaceState({ razz: true }, "", "/");
      setPath("/");
    }
  }

  const signedIn = session.status === "signed-in" ? session : null;
  const needsName = signedIn !== null && !signedIn.profile?.firstName;

  if (session.status === "loading" || signingIn) return <Boot />;

  if (!signedIn) {
    if (codeStep && pending) {
      return (
        <CodeScreen
          email={pending.email}
          sentAt={pending.sentAt}
          onBack={() => setCodeStep(false)}
          onSent={(next) => {
            setPending(next);
            writePending(next);
          }}
          onVerified={() => setSigningIn(true)}
        />
      );
    }
    return (
      <EmailScreen
        initialEmail={pending?.email ?? ""}
        onSent={(next) => {
          setPending(next);
          writePending(next);
          setCodeStep(true);
        }}
      />
    );
  }

  if (needsName) {
    return (
      <NameScreen
        uid={signedIn.uid}
        onSaved={(profile) => {
          setPhotoVersion(Date.now());
          setSession({ ...signedIn, profile });
        }}
      />
    );
  }

  if (path === "/settings") {
    return (
      <SettingsScreen
        uid={signedIn.uid}
        email={signedIn.profile?.email || signedIn.email}
        profile={signedIn.profile}
        photoVersion={photoVersion}
        onBack={backHome}
        onSaved={(profile) => {
          setPhotoVersion(Date.now());
          setSession({ ...signedIn, profile });
        }}
        onPhoto={() => setPhotoVersion(Date.now())}
        onSignedOut={() => {
          setCodeStep(false);
          setPending(null);
          go("/");
        }}
      />
    );
  }

  return (
    <HomeScreen
      firstName={signedIn.profile?.firstName || "there"}
      photoURL={signedIn.profile?.photoURL ?? ""}
      photoVersion={photoVersion}
      onSettings={() => go("/settings")}
    />
  );
}

function Boot() {
  return (
    <div className="boot">
      <p className="wordmark">Razzberry</p>
      <p className="fine-print">Loading…</p>
    </div>
  );
}

function Scene({ variant, children }: { variant: "auth" | "home"; children: ReactNode }) {
  return (
    <div className={variant === "home" ? "scene is-home" : "scene is-auth"}>
      <picture className="scene-photo">
        {/* Unsplash photo-1540039155733-5bb30b53aa14, Unsplash License. Color graded for the stage lights. */}
        <source srcSet="/concert.webp" type="image/webp" />
        <img src="/concert.jpg" alt="" />
      </picture>
      <div className="scene-shade" />
      <div className={variant === "home" ? "frame is-spread" : "frame"}>{children}</div>
    </div>
  );
}

function TopBar({ back, menu, avatar }: { back?: () => void; menu?: boolean; avatar?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        {back ? (
          <button type="button" className="back" aria-label="Back" onClick={back}>
            <BackIcon />
          </button>
        ) : null}
        <p className="wordmark">Razzberry</p>
      </div>
      {avatar}
      {menu ? <MenuMark /> : null}
    </header>
  );
}

function MenuMark() {
  return (
    <span className="menu-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M5 7h14M5 12h14M5 17h14" />
      </svg>
    </span>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.2 7.2 9.6 5.4h4.8l1.4 1.8H18a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.2a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="12.4" r="2.7" />
    </svg>
  );
}

function Avatar({ name, url, version, alt }: { name: string; url: string; version: number; alt: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "R";
  if (!url) return <span className="avatar-fallback">{letter}</span>;
  const src = version > 0 ? `${url}${url.includes("?") ? "&" : "?"}v=${version}` : url;
  return <img src={src} alt={alt} />;
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
    </label>
  );
}

function keepVisible(id: string) {
  window.setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  }, 280);
}

function EmailScreen({ initialEmail, onSent }: { initialEmail: string; onSent: (pending: Pending) => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
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
      onSent({ email: next, sentAt: Date.now() });
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <Scene variant="auth">
      <TopBar menu />
      <form className="auth-main" onSubmit={onSubmit}>
        <h1 className="headline">Be there.</h1>
        <p className="subhead">Sign in or create an account.</p>
        <div className="glass">
          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            enterKeyHint="send"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@email.com"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            onFocus={() => keepVisible("send-code")}
          />
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button id="send-code" className="primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Sending…" : "Send me a code"}
        </button>
        <p className="fine-print">We'll email you a 6-digit code. No password needed.</p>
      </form>
    </Scene>
  );
}

function CodeScreen({ email, sentAt, onBack, onSent, onVerified }: { email: string; sentAt: number; onBack: () => void; onSent: (pending: Pending) => void; onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const remain = Math.max(0, 60 - Math.floor((clock - sentAt) / 1000));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await verifyCode(email, code);
      onVerified();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  async function resend() {
    if (remain > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      await requestCode(email);
      setCode("");
      onSent({ email, sentAt: Date.now() });
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Scene variant="auth">
      <TopBar back={onBack} menu />
      <form className="auth-main" onSubmit={onSubmit}>
        <h1 className="headline long">Check your email</h1>
        <p className="subhead">We sent a code to {email}</p>
        <div className="glass">
          <CodeBoxes value={code} disabled={busy} onChange={setCode} />
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button id="continue-code" className="primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
        <button type="button" className="text-button" onClick={resend} disabled={busy || remain > 0}>
          {remain > 0 ? `Resend code in ${remain}s` : "Resend code"}
        </button>
      </form>
    </Scene>
  );
}

function CodeBoxes({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? "");

  function write(next: string, focusIndex: number) {
    const cleaned = next.replace(/\D/g, "").slice(0, 6);
    onChange(cleaned);
    refs.current[Math.min(focusIndex, 5)]?.focus();
  }

  function onPaste(event: ClipboardEvent) {
    const text = event.clipboardData.getData("text");
    if (!/\d/.test(text)) return;
    event.preventDefault();
    const cleaned = text.replace(/\D/g, "").slice(0, 6);
    write(cleaned, Math.max(cleaned.length - 1, 0));
  }

  return (
    <div className="code-boxes" role="group" aria-label="6-digit code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onFocus={() => keepVisible("continue-code")}
          onPaste={onPaste}
          onChange={(event) => {
            const cleaned = event.target.value.replace(/\D/g, "");
            if (cleaned.length > 1) {
              write(`${value.slice(0, index)}${cleaned}`, index + cleaned.length);
              return;
            }
            const next = digits.slice();
            next[index] = cleaned;
            onChange(next.join("").replace(/\D/g, "").slice(0, 6));
            if (cleaned && index < 5) refs.current[index + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digits[index] && index > 0) {
              const next = digits.slice();
              next[index - 1] = "";
              onChange(next.join(""));
              refs.current[index - 1]?.focus();
            }
          }}
        />
      ))}
    </div>
  );
}

function NameScreen({ uid, onSaved }: { uid: string; onSaved: (profile: Profile) => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const first = cleanName(firstName);
    const last = cleanName(lastName);
    if (!validName(first) || !validName(last)) {
      setError("Enter your first and last name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const photoURL = file ? await uploadAvatar(uid, file) : "";
      await saveProfile(uid, { firstName: first, lastName: last, photoURL });
      onSaved({ firstName: first, lastName: last, email: "", photoURL, role: "fan" });
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <Scene variant="auth">
      <TopBar menu />
      <form className="auth-main" onSubmit={onSubmit}>
        <h1 className="headline long">What's your name?</h1>
        <div className="glass name-card">
          <button type="button" className="photo-picker" onClick={() => inputRef.current?.click()}>
            <span className="photo-ring">{preview ? <img src={preview} alt="" /> : <CameraIcon />}</span>
            <span>Add photo</span>
          </button>
          <input
            ref={inputRef}
            className="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Field label="First name" name="given-name" autoComplete="given-name" enterKeyHint="next" value={firstName} disabled={busy} onChange={(event) => setFirstName(event.target.value)} onFocus={() => keepVisible("save-name")} />
          <Field label="Last name" name="family-name" autoComplete="family-name" enterKeyHint="done" value={lastName} disabled={busy} onChange={(event) => setLastName(event.target.value)} onFocus={() => keepVisible("save-name")} />
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button id="save-name" className="primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Done"}
        </button>
      </form>
    </Scene>
  );
}

function HomeScreen({ firstName, photoURL, photoVersion, onSettings }: { firstName: string; photoURL: string; photoVersion: number; onSettings: () => void }) {
  return (
    <Scene variant="home">
      <TopBar
        avatar={
          <button type="button" className="avatar-link" aria-label="Settings" onClick={onSettings}>
            <Avatar name={firstName} url={photoURL} version={photoVersion} alt="" />
          </button>
        }
      />
      <div className="home-main">
        <div className="hero-avatar">
          <Avatar name={firstName} url={photoURL} version={photoVersion} alt="" />
        </div>
        <h1 className="welcome">Welcome, {firstName}</h1>
        <p className="soon">More coming soon.</p>
      </div>
    </Scene>
  );
}

function SettingsScreen({
  uid,
  email,
  profile,
  photoVersion,
  onBack,
  onSaved,
  onPhoto,
  onSignedOut,
}: {
  uid: string;
  email: string;
  profile: Profile | null;
  photoVersion: number;
  onBack: () => void;
  onSaved: (profile: Profile) => void;
  onPhoto: () => void;
  onSignedOut: () => void;
}) {
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const first = cleanName(firstName);
    const last = cleanName(lastName);
    if (!validName(first) || !validName(last)) {
      setError("Enter your first and last name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveProfile(uid, { firstName: first, lastName: last, photoURL });
      onSaved({ firstName: first, lastName: last, email, photoURL, role: "fan" });
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changePhoto(file: File | null) {
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    try {
      const next = await uploadAvatar(uid, file);
      const first = profile?.firstName || cleanName(firstName);
      const last = profile?.lastName || cleanName(lastName);
      await saveProfile(uid, { firstName: first, lastName: last, photoURL: next });
      setPhotoURL(next);
      onPhoto();
      onSaved({ firstName: first, lastName: last, email, photoURL: next, role: "fan" });
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await signOutUser();
      onSignedOut();
    } catch (caught) {
      setError(explain(caught));
      setBusy(false);
    }
  }

  return (
    <div className="settings">
      <div className="settings-glow" aria-hidden="true" />
      <header className="settings-appbar">
        <p className="wordmark">Razzberry</p>
        <button type="button" className="avatar-link" aria-label="Home" onClick={onBack}>
          <Avatar name={firstName} url={photoURL} version={photoVersion} alt="" />
        </button>
      </header>
      <div className="settings-column">
        <header className="settings-title">
          <button type="button" className="back" aria-label="Back" onClick={onBack}>
            <BackIcon />
          </button>
          <h1>Settings</h1>
        </header>
        <form onSubmit={onSubmit}>
          <section className="panel photo-panel">
            <div className="settings-avatar">
              <Avatar name={firstName} url={photoURL} version={photoVersion} alt="Profile photo" />
            </div>
            <button type="button" className="pill" disabled={photoBusy || busy} onClick={() => inputRef.current?.click()}>
              {photoBusy ? "Saving…" : "Change photo"}
            </button>
            <input
              ref={inputRef}
              className="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void changePhoto(file);
              }}
            />
          </section>
          <section className="panel name-panel">
            <div className="name-grid">
              <Field label="First name" name="given-name" autoComplete="given-name" value={firstName} disabled={busy} onChange={(event) => setFirstName(event.target.value)} />
              <Field label="Last name" name="family-name" autoComplete="family-name" value={lastName} disabled={busy} onChange={(event) => setLastName(event.target.value)} />
            </div>
            <button className="primary" type="submit" disabled={busy || photoBusy} aria-busy={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </section>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </form>
        <section className="panel email-panel">
          <span>Email</span>
          <span>{email}</span>
        </section>
        <button type="button" className="sign-out" onClick={() => void signOut()} disabled={busy}>
          Sign out
        </button>
      </div>
    </div>
  );
}
