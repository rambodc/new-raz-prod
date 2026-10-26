import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { greetingName } from "../../auth/validation";
import { RaspberryMark } from "../../components/RaspberryMark";
import { CODE_WINDOW_MS, codeState, useNow, useTilt } from "../hooks";
import { formatDay, SHOWS } from "../mock";
import "../styles/pass.css";

const SHOW = SHOWS[0];
const R = 54;
const CIRC = 2 * Math.PI * R;

export default function ShowPass() {
  const { user } = useAuth();
  const holder = user?.displayName?.trim() || greetingName(user?.displayName, user?.email);
  const now = useNow(250);
  const { code, secondsLeft, elapsedMs } = codeState(now);
  const { ref, motionState, enableMotion } = useTilt<HTMLDivElement>(13);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  // Brief flash on every new code so the change is felt as well as seen.
  useEffect(() => {
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(id);
  }, [code]);

  const progress = 1 - elapsedMs / CODE_WINDOW_MS; // 1 → 0 over the window
  const checkedIn = checkedAt !== null;

  return (
    <div className="pass-page">
      <header className="lb-head">
        <p className="lb-eyebrow">Fan · Show pass</p>
        <h1 className="lb-display">
          Your pass <em>for tonight.</em>
        </h1>
        <p className="lb-lede">Show this at the door. The code rotates every 30 seconds, so a screenshot is useless an instant later. A Razzberry rep confirms it, and the night goes on your passport.</p>
      </header>

      <div className="pass-stage">
        <div ref={ref} className={`ticket${checkedIn ? " is-in" : ""}`} style={{ "--hue": SHOW.hue, "--hue2": SHOW.hue2 } as React.CSSProperties}>
          <div className="ticket-body">
            <div className="ticket-glare" aria-hidden="true" />
            <div className="ticket-foil" aria-hidden="true" />
            <div className="ticket-top">
              <span className="ticket-brand">
                <RaspberryMark className="ticket-mark" />
                razzberry
              </span>
              <span className="ticket-admit">Admit one</span>
            </div>
            <div className="ticket-main">
              <p className="ticket-series">{SHOW.series}</p>
              <h2 className="ticket-title">{SHOW.title}</h2>
              <p className="ticket-meta">
                {SHOW.venue} · {SHOW.hood}
              </p>
              <dl className="ticket-grid">
                <div>
                  <dt>Date</dt>
                  <dd>{formatDay(SHOW.date)}</dd>
                </div>
                <div>
                  <dt>Doors</dt>
                  <dd>{SHOW.doors}</dd>
                </div>
                <div>
                  <dt>Zone</dt>
                  <dd>Main floor</dd>
                </div>
              </dl>
            </div>

            <div className="ticket-perf" aria-hidden="true" />

            <div className="ticket-stub">
              <div className="code-ring">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle className="ring-track" cx="60" cy="60" r={R} />
                  <circle className="ring-bar" cx="60" cy="60" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} />
                </svg>
                <div className="code-core">
                  <span className="code-label">Presence code</span>
                  <span className={`code-value${flash ? " flash" : ""}`} aria-label={`Presence code ${code.split("").join(" ")}`}>
                    {code.slice(0, 3)}
                    <i />
                    {code.slice(3)}
                  </span>
                  <span className="code-secs" aria-live="off">
                    changes in {secondsLeft}s
                  </span>
                </div>
              </div>
              <div className="ticket-holder">
                <span>Holder</span>
                <strong>{holder}</strong>
              </div>
            </div>

            {checkedIn && (
              <div className="checked" role="status">
                <span className="checked-seal">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <strong>Checked in</strong>
                <span>Proof of presence recorded at {checkedAt}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pass-actions">
        {checkedIn ? (
          <button type="button" className="lb-btn lb-btn--ghost" onClick={() => setCheckedAt(null)}>
            Reset demo
          </button>
        ) : (
          <button type="button" className="lb-btn" onClick={() => setCheckedAt(new Date().toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }))}>
            Simulate rep confirmation
          </button>
        )}
        {motionState === "needs-permission" && (
          <button type="button" className="lb-btn lb-btn--ghost" onClick={enableMotion}>
            Enable tilt from phone motion
          </button>
        )}
      </div>

      <ol className="pass-how lb-card">
        <li>
          <span>1</span>
          <p>
            <strong>Arrive.</strong> The venue sells and scans tickets as usual. Razzberry adds the proof layer.
          </p>
        </li>
        <li>
          <span>2</span>
          <p>
            <strong>Show your code.</strong> It rotates every 30 seconds and only works while the show is open.
          </p>
        </li>
        <li>
          <span>3</span>
          <p>
            <strong>Rep confirms.</strong> You are marked as verified, and the artists on tonight's bill count you as a real fan.
          </p>
        </li>
      </ol>
    </div>
  );
}
