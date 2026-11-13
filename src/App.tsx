import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArtistStage } from "./artist";
import { HomeScreen } from "./home";
import { MiniPlayer, Playback } from "./player";
import { cleanEmail, cleanName, validEmail, validName, type Profile } from "./profile";
import { currentPath, parseRoute, type Route } from "./routes";
import { confirmEmailChange, explain, requestEmailChange, saveProfile, signOutUser, uploadAvatar, watchSession, type Session } from "./services";
import { clearReturnPath, readPendingSignIn, rememberReturnPath, SignInSheet, signInDestination } from "./signin";
import { Avatar, BackIcon, Boot, BootProblem, BrandLockup, CameraIcon, Field, Scene, SignInButton, TopBar, keepVisible } from "./ui";

const GUEST: Profile = { firstName: "", lastName: "", email: "", photoURL: "", role: "fan" };

function needsAccount(route: Route): boolean {
  return route.name === "settings" || route.name === "artist-edit" || route.name === "event-edit";
}

export default function App() {
  const [session, setSession] = useState<Session>(import.meta.env.MODE === "test" ? { status: "signed-out" } : { status: "loading" });
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [path, setPath] = useState(currentPath);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [authOpen, setAuthOpen] = useState(() => parseRoute(currentPath()).name === "signin" || readPendingSignIn() !== null);
  const openedPending = useRef(false);
  const historyStack = useRef<string[]>([currentPath()]);

  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    let alive = true;
    let settled = false;
    const stop = watchSession((next) => {
      if (!alive) return;
      settled = true;
      setSession(next);
    });
    const timer = window.setTimeout(() => {
      if (!alive || settled) return;
      if (sessionAttempt < 1) setSessionAttempt(1);
      else setSession({ status: "error" });
    }, 12000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stop();
    };
  }, [sessionAttempt, sessionNonce]);

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
    const route = parseRoute(path);
    if (route.name !== "share" || !route.eventSlug) return;
    const artist = `/${route.artistSlug}`;
    const here = path;
    const stack = historyStack.current;
    if (stack.length >= 2 && stack[stack.length - 2] === artist && stack[stack.length - 1] === here) return;
    window.history.replaceState({ razz: true }, "", artist);
    window.history.pushState({ razz: true }, "", here);
    const head = stack.slice(0, -1).filter((entry) => entry !== here);
    historyStack.current = [...head, artist, here];
  }, [path]);

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
    if (session.status !== "signed-in") return;
    setAuthOpen(false);
    if (parseRoute(path).name !== "signin") return;
    const dest = signInDestination(window.location.search);
    clearReturnPath();
    replace(dest);
  }, [session.status, path]);

  useEffect(() => {
    if (session.status !== "signed-out") return;
    const routeName = parseRoute(path).name;
    if (routeName === "signin") {
      openedPending.current = true;
      rememberReturnPath(signInDestination(window.location.search));
      setAuthOpen(true);
      return;
    }
    if (needsAccount(parseRoute(path))) {
      rememberReturnPath(path);
      setAuthOpen(true);
      return;
    }
    if (!openedPending.current && readPendingSignIn()) {
      openedPending.current = true;
      rememberReturnPath(path);
      setAuthOpen(true);
    }
  }, [session.status, path]);

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
    go("/");
  }

  function toArtist(dest: string) {
    const stack = historyStack.current;
    if (stack.length > 1 && stack[stack.length - 2] === dest) {
      stack.pop();
      window.history.back();
      return;
    }
    replace(dest);
  }

  function closeAuth() {
    setAuthOpen(false);
    if (session.status === "signed-in") return;
    const current = parseRoute(path);
    if (current.name === "signin") {
      const dest = signInDestination(window.location.search);
      clearReturnPath();
      replace(dest);
      return;
    }
    if (current.name === "artist-edit") replace(`/artist/${current.id}`);
    else if (current.name === "event-edit" && current.id) replace(`/event/${current.id}`);
    else if (current.name === "settings" || current.name === "event-edit") replace("/");
  }

  function openSignIn() {
    rememberReturnPath(parseRoute(path).name === "signin" ? signInDestination(window.location.search) : path);
    setAuthOpen(true);
  }

  function finishSignIn() {
    if (parseRoute(path).name !== "signin") return;
    const dest = signInDestination(window.location.search);
    clearReturnPath();
    replace(dest);
  }

  if (session.status === "loading") return <Boot />;
  if (session.status === "error") {
    return (
      <BootProblem
        title="Couldn't open Razzberry"
        body="Check your connection and try again."
        onRetry={() => {
          setSession({ status: "loading" });
          setSessionAttempt(0);
          setSessionNonce((value) => value + 1);
        }}
      />
    );
  }

  const signedIn = session.status === "signed-in" ? session : null;
  const needsName = signedIn !== null && !signedIn.profile?.firstName;
  const route = parseRoute(path);
  const profile = signedIn?.profile?.firstName ? signedIn.profile : null;
  let body;
  if (needsName && signedIn) {
    body = (
      <NameScreen
        uid={signedIn.uid}
        onHome={goHome}
        onSaved={(next) => {
          setPhotoVersion(Date.now());
          setSession({ ...signedIn, profile: next });
        }}
      />
    );
  } else if (signedIn && profile && route.name === "settings") {
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
        onSignedOut={() => go("/")}
      />
    );
  } else if (route.name === "signin") {
    body = (
      <Scene variant="auth">
        <TopBar onHome={goHome} avatar={<SignInButton onClick={openSignIn} />} />
        <div className="home-column">
          <div className="empty">
            <strong>Sign in</strong>
            <p>We'll email you a 6-digit code.</p>
          </div>
        </div>
      </Scene>
    );
  } else if (route.name === "home" || (!signedIn && (route.name === "settings" || (route.name === "event-edit" && route.id === null)))) {
    body = (
      <HomeScreen
        uid={signedIn?.uid ?? ""}
        profile={profile}
        photoVersion={photoVersion}
        onSettings={profile ? () => go("/settings") : undefined}
        onSignIn={profile ? undefined : openSignIn}
        go={go}
      />
    );
  } else if (route.name === "artist" || route.name === "artist-edit" || route.name === "event" || route.name === "event-edit" || route.name === "share") {
    body = (
      <ArtistStage
        route={route}
        uid={signedIn?.uid ?? ""}
        profile={profile ?? GUEST}
        go={go}
        replace={replace}
        back={backHome}
        onHome={goHome}
        onSignIn={profile ? undefined : openSignIn}
        toArtist={toArtist}
      />
    );
  } else {
    body = (
      <Scene variant="home">
        <TopBar onHome={goHome} avatar={profile ? undefined : <SignInButton onClick={openSignIn} />} />
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
      {needsName ? null : (
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
      )}
      {authOpen && !signedIn ? <SignInSheet onClose={closeAuth} onVerified={finishSignIn} /> : null}
    </Playback>
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
