import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { greetingName } from "../../auth/validation";
import { CODE_WINDOW_MS, codeState, useNow, useTilt } from "../hooks";
import { formatDay, PASS } from "../mock";
import "../styles/pass.css";

const R = 54;
const CIRC = 2 * Math.PI * R;

export default function ShowPass() {
  const { user } = useAuth();
  const holder = user?.displayName?.trim() || greetingName(user?.displayName, user?.email);
  const now = useNow(250);
  const { code, secondsLeft, elapsedMs } = codeState(now);
  const ref = useTilt<HTMLDivElement>(13);
  const [checkedIn, setCheckedIn] = useState(false);
  const [flash, setFlash] = useState(false);

  // A brief glow on every new code, so the change is felt as well as seen.
  useEffect(() => {
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(id);
  }, [code]);

  const progress = 1 - elapsedMs / CODE_WINDOW_MS;

  return (
    <div className="pass-page">
      <h1 className="lb-display">
        Your <em>pass.</em>
      </h1>

      <div className="pass-stage">
        <div ref={ref} className="ticket" style={{ "--hue": PASS.hue, "--hue2": PASS.hue2 } as React.CSSProperties}>
          <div className="ticket-body">
            <div className="ticket-glare" aria-hidden="true" />
            <div className="ticket-main">
              <h2 className="ticket-title">{PASS.title}</h2>
              <p className="ticket-meta">
                {PASS.venue} · {formatDay(PASS.date)}
              </p>
            </div>
            <div className="ticket-perf" aria-hidden="true" />
            <div className="ticket-stub">
              <div className="code-ring">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle className="ring-track" cx="60" cy="60" r={R} />
                  <circle className="ring-bar" cx="60" cy="60" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} />
                </svg>
                <div className="code-core">
                  <span className={`code-value${flash ? " flash" : ""}`} aria-label={`Pass code ${code.split("").join(" ")}`}>
                    {code.slice(0, 3)}
                    <i />
                    {code.slice(3)}
                  </span>
                  <span className="code-secs">{secondsLeft}s</span>
                </div>
              </div>
              <p className="ticket-holder">{holder}</p>
            </div>
            {checkedIn && (
              <div className="checked" role="status">
                <span className="checked-seal">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <strong>Checked in</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pass-actions">
        <button type="button" className={`lb-btn${checkedIn ? " lb-btn--ghost" : ""}`} onClick={() => setCheckedIn((v) => !v)}>
          {checkedIn ? "Start over" : "Check in"}
        </button>
      </div>
    </div>
  );
}
