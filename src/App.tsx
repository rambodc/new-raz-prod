import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { ArtistStage } from "./artist";
import { HomeScreen } from "./home";
import { MiniPlayer, Playback } from "./player";
import { cleanEmail, cleanName, validEmail, validName, type Profile } from "./profile";
import { currentPath, parseRoute } from "./routes";
import { SignInSheet, usePreviewNudge } from "./signin";
import { isPreviewRoute } from "./slug";
import { confirmEmailChange, explain, requestCode, requestEmailChange, saveProfile, signOutUser, uploadAvatar, verifyCode, watchSession, type Session } from "./services";
import { Avatar, BackIcon, Boot, BrandLockup, CameraIcon, Field, Scene, TopBar, keepVisible } from "./ui";

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

export default function App() {
  const [session, setSession] = useState<Session>(import.meta.env.MODE === "test" ? { status: "signed-out" } : { status: "loading" });
  const [path, setPath] = useState(currentPath);
  const [pending, setPending] = useState<Pending | null>(() => (import.meta.env.MODE === "test" ? null : readPending()));
  const [codeStep, setCodeStep] = useState(() => import.meta.env.MODE !== "test" && readPending() !== null);
  const [signingIn, setSigningIn] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [nudge, setNudge] = useState(true);
  const historyStack = useRef<string[]>([currentPath()]);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    return watchSession(setSession);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const next = currentPath();
      historyStack.current = [next];
      setPath(next);
    };
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
      historyStack.current = ["/"];
      window.history.replaceState({ razz: true }, "", "/");
      setPath("/");
    }
  }, [session, path]);

  function go(next: string) {
    if (next === path) return;
    historyStack.current.push(next);
    window.history.pushState({ razz: true }, "", next);
    setPath(next);
  }

  function replace(next: string) {
    if (historyStack.current.length === 0) historyStack.current.push(next);
    else historyStack.current[historyStack.current.length - 1] = next;
    window.history.replaceState({ razz: true }, "", next);
    setPath(next);
  }

  function backHome() {
    if (historyStack.current.length > 1) {
      historyStack.current.pop();
      const prev = historyStack.current[historyStack.current.length - 1] ?? "/";
      window.history.pushState({ razz: true }, "", prev);
      setPath(prev);
      return;
    }
    if (path !== "/") {
      historyStack.current = ["/"];
      window.history.pushState({ razz: true }, "", "/");
      setPath("/");
    }
  }

  function goHome() {
    setCodeStep(false);
    go("/");
  }

  const signedIn = session.status === "signed-in" ? session : null;
  const needsName = signedIn !== null && !signedIn.profile?.firstName;

  const routeNow = parseRoute(path);
  usePreviewNudge(Boolean(!signedIn && isPreviewRoute(routeNow) && nudge && !authOpen), () => {
    setAuthOpen(true);
    setNudge(false);
  });

  if (session.status === "loading" || signingIn) return <Boot />;

  if (!signedIn && isPreviewRoute(routeNow)) {
    return (
      <Playback>
        <ArtistStage
          route={routeNow}
          uid=""
          profile={{ firstName: "", lastName: "", email: "", photoURL: "", role: "fan" }}
          go={go}
          replace={replace}
          back={backHome}
          onHome={goHome}
          guest
          onNeedAccount={() => setAuthOpen(true)}
        />
        {authOpen ? (
          <SignInSheet
            onClose={() => {
              setAuthOpen(false);
              setNudge(false);
            }}
            onVerified={() => setSigningIn(true)}
          />
        ) : null}
      </Playback>
    );
  }

  if (!signedIn) {
    if (codeStep && pending) {
      return (
        <CodeScreen
          email={pending.email}
          sentAt={pending.sentAt}
          onHome={goHome}
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
        onHome={goHome}
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
        onHome={goHome}
        onSaved={(profile) => {
          setPhotoVersion(Date.now());
          setSession({ ...signedIn, profile });
        }}
      />
    );
  }

  const profile = signedIn.profile;
  if (!profile?.firstName) return null;
  const route = routeNow;
  let body;
  if (route.name === "settings") {
    body = (
      <SettingsScreen
        uid={signedIn.uid}
        email={profile.email || signedIn.email}
        profile={profile}
        photoVersion={photoVersion}
        onBack={backHome}
        onHome={goHome}
        onSaved={(next) => {
          setPhotoVersion(Date.now());
          setSession({ ...signedIn, profile: next });
        }}
        onPhoto={() => setPhotoVersion(Date.now())}
        onEmail={(next) => {
          setSession({
            ...signedIn,
            email: next,
            profile: profile ? { ...profile, email: next } : profile,
          });
        }}
        onSignedOut={() => {
          setCodeStep(false);
          setPending(null);
          go("/");
        }}
      />
    );
  } else if (route.name === "home") {
    body = <HomeScreen uid={signedIn.uid} profile={profile} photoVersion={photoVersion} onSettings={() => go("/settings")} go={go} />;
  } else if (route.name === "artist" || route.name === "artist-edit" || route.name === "event" || route.name === "event-edit" || route.name === "share") {
    body = <ArtistStage route={route} uid={signedIn.uid} profile={profile} go={go} replace={replace} back={backHome} onHome={goHome} />;
  } else {
    body = (
      <Scene variant="home">
        <TopBar onHome={goHome} />
        <div className="home-column">
          <div className="empty">
            <strong>That page isn't here</strong>
            <p>Head back home.</p>
            <button className="primary" type="button" onClick={goHome}>
              Back home
            </button>
          </div>
        </div>
      </Scene>
    );
  }

  return (
    <Playback>
      {body}
      <MiniPlayer
        onOpen={(artistId, trackId) => {
          const here = document.querySelector(`[data-artist="${artistId}"]`);
          if (here) {
            const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            document.getElementById(`track-${trackId}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
            return;
          }
          go(`/artist/${artistId}`);
        }}
      />
    </Playback>
  );
}

function EmailScreen({ initialEmail, onSent, onHome }: { initialEmail: string; onSent: (pending: Pending) => void; onHome: () => void }) {
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
      <TopBar menu onHome={onHome} />
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

function CodeScreen({ email, sentAt, onBack, onSent, onVerified, onHome }: { email: string; sentAt: number; onBack: () => void; onSent: (pending: Pending) => void; onVerified: () => void; onHome: () => void }) {
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
      <TopBar back={onBack} menu onHome={onHome} />
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

function NameScreen({ uid, onSaved, onHome }: { uid: string; onSaved: (profile: Profile) => void; onHome: () => void }) {
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
      <TopBar menu onHome={onHome} />
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

function EmailChange({ email, disabled, onChanged }: { email: string; disabled: boolean; onChanged: (email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const remain = sentTo ? Math.max(0, 60 - Math.floor((clock - sentAt) / 1000)) : 0;

  useEffect(() => {
    if (!sentTo) return;
    const id = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [sentTo]);

  async function send(address: string) {
    const cleaned = cleanEmail(address);
    if (!validEmail(cleaned)) {
      setError("Enter a valid email address.");
      return;
    }
    if (cleaned === cleanEmail(email)) {
      setError("That's already your email.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      await requestEmailChange(cleaned);
      setSentTo(cleaned);
      setSentAt(Date.now());
      setClock(Date.now());
      setCode("");
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
      const updated = await confirmEmailChange(code);
      onChanged(updated);
      setOpen(false);
      setSentTo("");
      setNext("");
      setCode("");
      setNote("Email updated.");
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="email-change">
        {note ? <p className="photo-hint">{note}</p> : null}
        <button type="button" className="text-button" disabled={disabled} onClick={() => { setOpen(true); setError(""); setNote(""); }}>
          Change email
        </button>
      </div>
    );
  }

  if (sentTo) {
    return (
      <form className="email-change" onSubmit={(event) => void confirm(event)}>
        <p className="photo-hint">We sent a 6-digit code to {sentTo}.</p>
        <Field label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="pill" type="submit" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button>
        <button type="button" className="text-button" disabled={busy || remain > 0} onClick={() => void send(sentTo)}>
          {remain > 0 ? `Resend code in ${remain}s` : "Resend code"}
        </button>
        <button type="button" className="text-button" disabled={busy} onClick={() => { setSentTo(""); setCode(""); setError(""); }}>
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form
      className="email-change"
      onSubmit={(event) => {
        event.preventDefault();
        void send(next);
      }}
    >
      <Field label="New email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={next} disabled={busy} onChange={(event) => setNext(event.target.value)} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="pill" type="submit" disabled={busy || disabled}>{busy ? "Sending…" : "Send code"}</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>
        Cancel
      </button>
    </form>
  );
}

function SettingsScreen({
  uid,
  email,
  profile,
  photoVersion,
  onBack,
  onHome,
  onSaved,
  onPhoto,
  onEmail,
  onSignedOut,
}: {
  uid: string;
  email: string;
  profile: Profile | null;
  photoVersion: number;
  onBack: () => void;
  onHome: () => void;
  onSaved: (profile: Profile) => void;
  onPhoto: () => void;
  onEmail: (email: string) => void;
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
      onSaved({ firstName: first, lastName: last, email, photoURL, role: profile?.role === "artist" ? "artist" : "fan" });
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
      onSaved({ firstName: first, lastName: last, email, photoURL: next, role: profile?.role === "artist" ? "artist" : "fan" });
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
        <BrandLockup onHome={onHome} />
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
          <div className="email-line">
            <span>Email</span>
            <span>{email}</span>
          </div>
          <EmailChange email={email} disabled={busy || photoBusy} onChanged={onEmail} />
        </section>
        <button type="button" className="sign-out" onClick={() => void signOut()} disabled={busy}>
          Sign out
        </button>
      </div>
    </div>
  );
}
