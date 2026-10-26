import { useState } from "react";
import { formatDay, REWARDS } from "../mock";
import "../styles/rewards.css";

export default function Rewards() {
  const [copied, setCopied] = useState(false);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const pct = Math.round((REWARDS.toNext.have / REWARDS.toNext.need) * 100);

  function copy() {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(REWARDS.friends.code).then(done, done);
    else done();
  }

  return (
    <div className="rw-page">
      <header className="lb-head">
        <p className="lb-eyebrow">Fan · Rewards</p>
        <h1 className="lb-display">
          Keep the <em>streak alive.</em>
        </h1>
        <p className="lb-lede">Showing up is the currency. Rewards here are access and recognition, never anything you pay for.</p>
      </header>

      <section className="rw-hero lb-card" aria-label="Your streak">
        <div className="orb-wrap">
          <div className="orb" aria-hidden="true">
            <span className="orb-core" />
            <svg viewBox="0 0 64 80" className="flame">
              <path d="M32 4c4 12 18 20 18 38a18 18 0 0 1-36 0c0-8 4-13 8-17 0 7 3 10 6 11-2-14 0-23 4-32Z" />
              <path d="M32 40c3 6 9 9 9 17a9 9 0 0 1-18 0c0-5 3-8 5-10 1 3 2 4 4 4-1-4 0-7 0-11Z" className="flame-in" />
            </svg>
            <span className="orb-spark sp1" />
            <span className="orb-spark sp2" />
            <span className="orb-spark sp3" />
          </div>
        </div>
        <div className="rw-hero-text">
          <p className="rw-streak">
            <strong>{REWARDS.streak}</strong> shows in a row
          </p>
          <p className="rw-sub">Your best is {REWARDS.best}. One more verified night and you are an Insider.</p>
          <div className="rw-progress" role="progressbar" aria-label="Progress to next tier" aria-valuemin={0} aria-valuemax={REWARDS.toNext.need} aria-valuenow={REWARDS.toNext.have}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="rw-next">
            {REWARDS.toNext.have} of {REWARDS.toNext.need} shows · next: {REWARDS.toNext.reward}
          </p>
        </div>
      </section>

      <section aria-labelledby="rw-tiers">
        <div className="lb-section-head">
          <h2 id="rw-tiers" className="lb-h2">
            Tiers
          </h2>
          <span className="lb-count">By verified shows</span>
        </div>
        <ol className="tiers">
          {REWARDS.tiers.map((t, i) => {
            const state = i < REWARDS.current ? "done" : i === REWARDS.current ? "now" : "locked";
            return (
              <li key={t.id} className={`tier lb-card tier--${state}`}>
                <div className="tier-top">
                  <span className="tier-no">{String(i + 1).padStart(2, "0")}</span>
                  <span className="tier-state">{state === "done" ? "Unlocked" : state === "now" ? "You are here" : `${t.shows} shows`}</span>
                </div>
                <h3>{t.name}</h3>
                <p className="tier-need">From {t.shows} verified {t.shows === 1 ? "show" : "shows"}</p>
                <ul>
                  {t.perks.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="rw-hooks">
        <div className="lb-section-head">
          <h2 id="rw-hooks" className="lb-h2">
            Next up
          </h2>
          <span className="lb-count">Reasons to come back</span>
        </div>
        <ul className="hooks">
          {REWARDS.hooks.map((h) => (
            <li key={h.id} className="hook lb-card" style={{ "--hue": h.hue } as React.CSSProperties}>
              <span className="hook-date">
                <b>{formatDay(h.date, { day: "numeric" })}</b>
                {formatDay(h.date, { month: "short" })}
              </span>
              <div className="hook-text">
                <strong>{h.show}</strong>
                <span>{h.line}</span>
              </div>
              <button type="button" className={`lb-btn lb-btn--sm${reminded[h.id] ? " lb-btn--ghost" : ""}`} aria-pressed={Boolean(reminded[h.id])} onClick={() => setReminded((r) => ({ ...r, [h.id]: !r[h.id] }))}>
                {reminded[h.id] ? "Reminder set" : "Remind me"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="friend lb-card" aria-label="Bring a friend">
        <div className="friend-text">
          <p className="lb-label">Bring a friend</p>
          <h2 className="friend-title">Their first night counts for you too.</h2>
          <p>When a friend you invited gets verified at their first show, you both earn a streak shield: miss one show without losing your run.</p>
          <div className="friend-dots" aria-label={`${REWARDS.friends.joined} of ${REWARDS.friends.goal} friends joined`}>
            {Array.from({ length: REWARDS.friends.goal }, (_, i) => (
              <span key={i} className={i < REWARDS.friends.joined ? "on" : ""} />
            ))}
            <em>
              {REWARDS.friends.joined} of {REWARDS.friends.goal} friends
            </em>
          </div>
        </div>
        <div className="friend-code">
          <span className="friend-code-label">Your invite code</span>
          <code>{REWARDS.friends.code}</code>
          <button type="button" className="lb-btn lb-btn--sm" onClick={copy}>
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      </section>
    </div>
  );
}
