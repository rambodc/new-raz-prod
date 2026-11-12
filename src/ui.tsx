import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type MouseEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { EventItem } from "./data";
import { loadWithRetry } from "./deadline";
import { formatWhen } from "./format";
import { Logo } from "./logo";

export function Boot() {
  return (
    <div className="boot" role="status" aria-label="Loading">
      <div className="boot-mark">
        <Logo className="boot-logo" />
        <p className="boot-word">Razzberry</p>
      </div>
    </div>
  );
}

export function BootProblem({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div className="boot">
      <div className="boot-problem">
        <Logo className="boot-logo" />
        <strong>{title}</strong>
        <p>{body}</p>
        <button className="primary" type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

export function Scene({ variant, children }: { variant: "auth" | "home"; children: ReactNode }) {
  return (
    <div className={variant === "home" ? "scene is-home" : "scene is-auth"}>
      <picture className="scene-photo">
        {/* Unsplash photo-1540039155733-5bb30b53aa14, Unsplash License. Color graded for the stage lights. */}
        <source srcSet="/concert.webp" type="image/webp" />
        <img src="/concert.jpg" alt="" width={1600} height={1067} decoding="async" fetchPriority="high" />
      </picture>
      <div className="scene-shade" />
      <div className={variant === "home" ? "frame is-spread" : "frame"}>{children}</div>
    </div>
  );
}

export function BrandLockup({ back, onHome }: { back?: () => void; onHome?: () => void }) {
  return (
    <div className="brand-lockup">
      {back ? (
        <button type="button" className="back" aria-label="Back" onClick={back}>
          <BackIcon />
        </button>
      ) : null}
      <button type="button" className="brand-home" aria-label="Home" onClick={onHome}>
        <Logo className="brand-mark" />
        <span className="wordmark">Razzberry</span>
      </button>
    </div>
  );
}

export function TopBar({ back, menu, avatar, onHome }: { back?: () => void; menu?: boolean; avatar?: ReactNode; onHome?: () => void }) {
  return (
    <header className="topbar">
      <BrandLockup back={back} onHome={onHome} />
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

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

export function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.2 7.2 9.6 5.4h4.8l1.4 1.8H18a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.2a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="12.4" r="2.7" />
    </svg>
  );
}

export function Avatar({ url, version, alt, lazy = false }: { name: string; url: string; version: number; alt: string; lazy?: boolean }) {
  if (!url) {
    return (
      <span className="avatar-fallback" role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
        <Logo />
      </span>
    );
  }
  const src = version > 0 ? `${url}${url.includes("?") ? "&" : "?"}v=${version}` : url;
  return <img src={src} alt={alt} width={128} height={128} decoding="async" loading={lazy ? "lazy" : undefined} />;
}

export function EventPhoto({ url, alt, priority = false }: { url: string; alt: string; priority?: boolean }) {
  if (!url) {
    return (
      <span className="night-photo event-placeholder">
        <Logo />
      </span>
    );
  }
  return (
    <img
      className="night-photo"
      src={url}
      alt={alt}
      width={1200}
      height={675}
      decoding="async"
      loading={priority ? undefined : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}

export function Cover({ url, alt, width, height, priority = false }: { url: string; alt: string; width: number; height: number; priority?: boolean }) {
  if (!url) {
    return (
      <span className="cover-fallback">
        <Logo />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      loading={priority ? undefined : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
    </label>
  );
}

export function TextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} {...props} />
    </label>
  );
}

export function keepVisible(id: string) {
  window.setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  }, 280);
}

export function openLink(event: MouseEvent<HTMLAnchorElement>, go: (path: string) => void) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = event.currentTarget.getAttribute("href");
  if (!href || !href.startsWith("/")) return;
  event.preventDefault();
  go(href);
}

export function SignInButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="signin-link" onClick={onClick}>
      Sign in
    </button>
  );
}

export function Page({
  back,
  onHome,
  children,
  tone = "plain",
  narrow = false,
  avatar,
}: {
  back?: () => void;
  onHome?: () => void;
  children: ReactNode;
  tone?: "plain" | "form" | "event";
  narrow?: boolean;
  avatar?: ReactNode;
}) {
  return (
    <div className={`sheet is-${tone}`}>
      <div className={narrow ? "sheet-column is-narrow" : "sheet-column"}>
        <TopBar back={back} onHome={onHome} avatar={avatar} />
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function EventList({
  events,
  go,
  emptyTitle,
  emptyBody,
}: {
  events: EventItem[];
  go: (path: string) => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (events.length === 0) return <Empty title={emptyTitle} body={emptyBody} />;
  return (
    <ul className="event-list">
      {events.map((event) => (
        <li key={event.id}>
          <a className="event-card" href={`/event/${event.id}`} onClick={(click) => openLink(click, go)}>
            <Cover url={event.imageURL} alt="" width={84} height={84} />
            <span className="event-copy">
              <span className="event-title">{event.title}</span>
              <span className="event-when">{formatWhen(event.startsAt, "card")}</span>
              <span className="event-where">
                {event.venue}, {event.city}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function useLoad<T>(key: string, load: () => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState(key);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<T | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  if (loadedKey !== key) {
    setLoadedKey(key);
    setStatus("loading");
    setData(null);
  }

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    loadWithRetry(() => loadRef.current())
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  return { status, data, reload: () => setNonce((value) => value + 1) };
}
