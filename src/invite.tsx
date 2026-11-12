import { useEffect, useState } from "react";
import { loadWithRetry } from "./deadline";
import { createPortal } from "react-dom";
import { Logo } from "./logo";
import { artistPath, eventPath } from "./slug";
import { cleanTicketUrl, formatWhen, validTicketUrl } from "./format";
import { ShareButton } from "./share";
import {
  coverSrc,
  createInviteLink,
  deactivateInviteLink,
  loadEventDesk,
  onRsvpChange,
  openInviteLink,
  qrSvg,
  rememberInvite,
  rememberPendingRsvp,
  rsvpCancel,
  rsvpGoing,
  type Desk,
  type GuestFace,
  type HostDesk,
  type OpenInvite,
} from "./inviteApi";
import { explain } from "./services";
import { Boot, BrandLockup, Empty, EventPhoto, Page, SignInButton } from "./ui";
import type { EventItem } from "./data";

async function copyText(url: string) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

function QrSheet({ url, message, onClose }: { url: string; message: string; onClose: () => void }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    void qrSvg(url).then((next) => {
      if (live) setSvg(next);
    });
    return () => {
      live = false;
    };
  }, [url]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="when-layer" onMouseDown={onClose}>
      <div className="when-card qr-card" role="dialog" aria-modal="true" aria-labelledby="qr-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="when-head">
          <h3 id="qr-title">Invite</h3>
          <button type="button" className="stage-text" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="qr-message">{message}</p>
        <div className="qr-frame" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
        <p className="qr-link">{url}</p>
        <p className="qr-note">Link copied. Scan the code to open it on a phone.</p>
      </div>
    </div>,
    document.body,
  );
}

export function useInviteShare() {
  const [qr, setQr] = useState<{ url: string; message: string } | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function share(eventId: string, regenerate = false) {
    setBusy(true);
    setError("");
    try {
      const invite = await createInviteLink(eventId, regenerate);
      const url = new URL(`/i/${invite.code}`, window.location.origin).href;
      const payload = { title: "Razzberry", text: invite.message, url };
      if (typeof navigator.share === "function") {
        try {
          await navigator.share(payload);
          setToast("Invite shared");
          return;
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError") return;
        }
      }
      await copyText(url);
      setToast("Link copied");
      setQr({ url, message: invite.message });
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  const sheet = (
    <>
      {qr ? <QrSheet url={qr.url} message={qr.message} onClose={() => setQr(null)} /> : null}
      {toast ? (
        <span className="toast" role="status">
          {toast}
        </span>
      ) : null}
    </>
  );
  return { share, busy, error, sheet };
}

function InviteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 21v-1.6a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 19.4V21" />
      <circle cx="9.4" cy="8" r="2.7" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}

function Face({ guest }: { guest: GuestFace }) {
  return (
    <span className="guest">
      {guest.photoURL ? <img src={guest.photoURL} alt="" width={36} height={36} decoding="async" loading="lazy" /> : <span className="guest-letter avatar-fallback"><Logo /></span>}
      <span>{guest.name}</span>
    </span>
  );
}

function HostPanel({ eventId, host, onChanged }: { eventId: string; host: HostDesk; onChanged: () => void }) {
  const invite = useInviteShare();
  const [error, setError] = useState("");

  async function deactivate(code: string) {
    setError("");
    try {
      await deactivateInviteLink(code);
      onChanged();
    } catch (caught) {
      setError(explain(caught));
    }
  }

  return (
    <div className="host-desk">
      <div className="stat-row">
        <span>
          <strong>{host.opens}</strong> opens
        </span>
        <span>
          <strong>{host.goingCount}</strong> going
        </span>
        <span>
          <strong>{host.signupCount}</strong> new
        </span>
      </div>
      {host.guests.length === 0 ? <p className="stage-empty">No one is going yet.</p> : null}
      <ul className="guest-list">
        {host.guests.map((guest) => (
          <li key={guest.uid}>
            <Face guest={guest} />
            <span className="guest-via">{guest.inviterName ? `via ${guest.inviterName}` : "Direct"}{guest.newSignup ? " · new" : ""}</span>
          </li>
        ))}
      </ul>
      {host.invites.length > 0 ? (
        <ul className="invite-list">
          {host.invites.map((item) => (
            <li key={item.code}>
              <span>
                {item.inviterName} · {item.opens} opens{item.active ? "" : " · off"}
              </span>
              {item.active ? (
                <button type="button" className="stage-text" onClick={() => void deactivate(item.code)}>
                  Deactivate
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="stage-quiet" disabled={invite.busy} onClick={() => void invite.share(eventId, true)}>
        New link
      </button>
      {invite.sheet}
      {error || invite.error ? <p className="form-error" role="alert">{error || invite.error}</p> : null}
    </div>
  );
}

export function SocialPanel({
  eventId,
  owner,
  signedIn,
  desk,
  onSignIn,
  onChanged,
  ticketUrl,
  visibility,
  sharePath,
  shareTitle,
  onEdit,
}: {
  eventId: string;
  owner: boolean;
  signedIn: boolean;
  desk: Desk | null;
  onSignIn?: () => void;
  onChanged: () => void;
  ticketUrl: string;
  visibility: "public" | "private";
  sharePath: string;
  shareTitle: string;
  onEdit?: () => void;
}) {
  const invite = useInviteShare();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const going = desk?.viewerGoing === true;
  const canInvite = signedIn && (owner || visibility === "public" || desk?.canInvite === true);
  const count = desk?.goingCount ?? 0;
  const tickets = cleanTicketUrl(ticketUrl);
  const showTickets = tickets.length > 0 && validTicketUrl(tickets);

  async function go() {
    if (!signedIn) {
      rememberPendingRsvp(eventId);
      onSignIn?.();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await rsvpGoing(eventId);
      onChanged();
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setError("");
    try {
      await rsvpCancel(eventId);
      onChanged();
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="social">
      <div className="event-actions">
        {showTickets ? (
          <a className="primary" href={tickets} target="_blank" rel="noopener noreferrer">
            Get tickets
          </a>
        ) : null}
        {owner ? null : going ? (
          <div className="going-state">
            <span className="going-pill">You're going</span>
            <button type="button" className="text-action" disabled={busy} onClick={() => void undo()}>
              Not going
            </button>
          </div>
        ) : (
          <button type="button" className={showTickets ? "secondary" : "primary"} disabled={busy} onClick={() => void go()}>
            {busy ? "Saving…" : "Going"}
          </button>
        )}
        <div className="event-tools">
          {canInvite ? (
            <button type="button" className="tool-btn" aria-label="Invite" disabled={invite.busy} onClick={() => void invite.share(eventId)}>
              <InviteIcon />
              <span>Invite</span>
            </button>
          ) : null}
          {sharePath ? <ShareButton title={shareTitle} text={shareTitle} path={sharePath} label={`Share ${shareTitle}`} /> : null}
          {onEdit ? (
            <button type="button" className="text-action" onClick={onEdit}>
              Edit
            </button>
          ) : null}
        </div>
      </div>
      {owner && desk?.host ? <HostPanel eventId={eventId} host={desk.host} onChanged={onChanged} /> : null}
      {!owner && desk?.showGuestList && desk.guests ? (
        desk.guests.length > 0 ? (
          <ul className="guest-list">
            {desk.guests.map((guest) => (
              <li key={guest.name}>
                <Face guest={guest} />
              </li>
            ))}
          </ul>
        ) : null
      ) : !owner && count > 0 ? (
        <p className="going-count">{count} going</p>
      ) : null}
      {invite.sheet}
      {error || invite.error ? <p className="form-error" role="alert">{error || invite.error}</p> : null}
    </div>
  );
}

export function EventSocial({
  event,
  owner,
  uid,
  onSignIn,
  sharePath,
  onEdit,
}: {
  event: EventItem;
  owner: boolean;
  uid: string;
  onSignIn?: () => void;
  sharePath: string;
  onEdit?: () => void;
}) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    void loadEventDesk(event.id)
      .then((next) => {
        if (live) setDesk(next);
      })
      .catch(() => {
        if (live) setDesk(null);
      });
    return () => {
      live = false;
    };
  }, [event.id, uid, nonce]);

  useEffect(() => onRsvpChange(() => setNonce((value) => value + 1)), []);

  return (
    <SocialPanel
      eventId={event.id}
      owner={owner}
      signedIn={Boolean(uid)}
      desk={desk}
      onSignIn={onSignIn}
      onChanged={() => setNonce((value) => value + 1)}
      ticketUrl={event.ticketUrl}
      visibility={event.visibility}
      sharePath={sharePath}
      shareTitle={event.title}
      onEdit={onEdit}
    />
  );
}

function statusCopy(state: "inactive" | "ended" | "private"): { title: string; body: string } {
  if (state === "ended") return { title: "This event has ended", body: "The invite link has expired." };
  if (state === "private") return { title: "This is a private event", body: "An invite link opens it." };
  return { title: "This invite link isn't active", body: "Ask for a new one." };
}

export function StatusScreen({ state, back, onHome, onSignIn }: { state: "inactive" | "ended" | "private"; back: () => void; onHome: () => void; onSignIn?: () => void }) {
  const copy = statusCopy(state);
  return (
    <Page back={back} onHome={onHome} avatar={onSignIn ? <SignInButton onClick={onSignIn} /> : undefined}>
      <Empty title={copy.title} body={copy.body} />
    </Page>
  );
}

export function InvitePage({
  code,
  uid,
  onSignIn,
  back,
  onHome,
  go,
}: {
  code: string;
  uid: string;
  onSignIn?: () => void;
  back: () => void;
  onHome: () => void;
  go: (path: string) => void;
}) {
  const [opened, setOpened] = useState<OpenInvite | null>(null);
  const [host, setHost] = useState<HostDesk | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setStatus("loading");
    void loadWithRetry(() => openInviteLink(code))
      .then(async (next) => {
        if (!live) return;
        if (next.state === "ok") rememberInvite(code);
        let desk: HostDesk | null = null;
        if (next.state === "ok" && uid && next.event.artistId === uid) {
          const loaded = await loadEventDesk(next.event.id);
          desk = loaded.host;
        }
        if (!live) return;
        setHost(desk);
        setOpened(next);
        setStatus("ready");
      })
      .catch(() => {
        if (!live) return;
        setOpened(null);
        setStatus("error");
      });
    return () => {
      live = false;
    };
  }, [code, uid, nonce]);

  useEffect(() => onRsvpChange(() => setNonce((value) => value + 1)), []);

  if (status === "loading") return <Boot />;
  if (status === "error" || !opened) {
    return (
      <Page back={back} onHome={onHome} avatar={onSignIn ? <SignInButton onClick={onSignIn} /> : undefined}>
        <Empty title="Couldn't open this invite" body="Check your connection and try again." />
        <button className="primary" type="button" onClick={() => setNonce((value) => value + 1)}>
          Retry
        </button>
      </Page>
    );
  }
  if (opened.state !== "ok") return <StatusScreen state={opened.state} back={back} onHome={onHome} onSignIn={onSignIn} />;

  const event = opened.event;
  const when = formatWhen(new Date(event.startsAt), "detail");
  const owner = uid !== "" && uid === event.artistId;
  const desk: Desk = {
    state: "ok",
    viewerGoing: opened.viewerGoing,
    goingCount: opened.goingCount,
    canInvite: opened.canInvite,
    showGuestList: opened.showGuestList,
    guests: opened.guests,
    host,
  };

  return (
    <div className="stage">
      <div className="stage-scroll">
        <header className="stage-top">
          <div className="stage-top-inner">
            <BrandLockup back={back} onHome={onHome} />
            {onSignIn ? <SignInButton onClick={onSignIn} /> : null}
          </div>
        </header>
        <main className="stage-column invite-column">
          <article className="night is-open">
            <div className="night-photo-wrap">
              <EventPhoto url={event.imageURL ? coverSrc(event.imageURL) : ""} alt="" priority />
            </div>
            <div className="night-detail">
              <h1 className="invite-title">{event.title}</h1>
              <p className="night-detail-when">{when}</p>
              <p className="night-detail-place">
                {event.venue}
                <span>{event.city}</span>
              </p>
              {opened.artist ? (
                <button type="button" className="artist-jump" onClick={() => go(artistPath(opened.artist?.slug || ""))}>
                  {opened.artist.name}
                </button>
              ) : null}
              {event.description ? <p className="stage-prose">{event.description}</p> : null}
              <SocialPanel
                eventId={event.id}
                owner={owner}
                signedIn={Boolean(uid)}
                desk={desk}
                onSignIn={onSignIn}
                onChanged={() => setNonce((value) => value + 1)}
                ticketUrl={event.ticketUrl}
                visibility={event.visibility}
                sharePath={event.visibility === "public" && opened.artist?.slug ? eventPath(opened.artist.slug, event.slug) : ""}
                shareTitle={event.title}
              />
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}
