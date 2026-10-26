import { REWARDS } from "../mock";
import "../styles/rewards.css";

export default function Rewards() {
  const left = REWARDS.need - REWARDS.streak;
  const pct = Math.round((REWARDS.streak / REWARDS.need) * 100);
  return (
    <div className="rw-page">
      <h1 className="lb-display">
        Your <em>streak.</em>
      </h1>
      <div className="rw-hero">
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
        <p className="rw-streak">
          <strong>{REWARDS.streak}</strong> shows in a row
        </p>
        <div className="rw-progress" role="progressbar" aria-label="Progress to next reward" aria-valuemin={0} aria-valuemax={REWARDS.need} aria-valuenow={REWARDS.streak}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="rw-next">
          {left} more {left === 1 ? "show" : "shows"} for {REWARDS.reward}
        </p>
      </div>
    </div>
  );
}
