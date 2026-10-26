import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { greetingName } from "../../auth/validation";
import { ArrowIcon } from "../../components/Icons";
import { LAB_ROLES, LAB_STYLES, useLab, type LabRole, type LabStyle } from "../context";
import { LAB_PAGES } from "../pages";
import "../styles/hub.css";

function Preview({ k }: { k: string }) {
  switch (k) {
    case "pass":
      return (
        <div className="pv pv-pass">
          <div className="pv-ticket">
            <svg viewBox="0 0 44 44" className="pv-ring">
              <circle cx="22" cy="22" r="18" className="pv-ring-bg" />
              <circle cx="22" cy="22" r="18" className="pv-ring-fg" />
            </svg>
            <span className="pv-code">7KQ2NX</span>
          </div>
        </div>
      );
    case "live":
      return (
        <div className="pv pv-live">
          <div className="pv-screen">
            <span className="pv-live-dot" />
          </div>
          <div className="pv-bars">
            <i style={{ width: "72%" }} />
            <i style={{ width: "46%" }} />
            <i style={{ width: "58%" }} />
          </div>
        </div>
      );
    case "passport":
      return (
        <div className="pv pv-passport">
          <span className="pv-stamp s1" />
          <span className="pv-stamp s2" />
          <span className="pv-stamp s3" />
          <span className="pv-stamp s4 empty" />
        </div>
      );
    case "rewards":
      return (
        <div className="pv pv-rewards">
          <span className="pv-orb" />
          <span className="pv-orbit" />
        </div>
      );
    case "discover":
      return (
        <div className="pv pv-discover">
          <span className="pv-card c1" />
          <span className="pv-card c2" />
          <span className="pv-card c3" />
        </div>
      );
    default:
      return (
        <div className="pv pv-artist">
          <i style={{ height: "30%" }} />
          <i style={{ height: "48%" }} />
          <i style={{ height: "42%" }} />
          <i style={{ height: "70%" }} />
          <i style={{ height: "62%" }} />
          <i style={{ height: "92%" }} />
        </div>
      );
  }
}

const STYLE_COPY: Record<LabStyle, { name: string; line: string }> = {
  aurora: { name: "Aurora", line: "Flowing gradients, liquid blobs, soft glass. Light or dark." },
  cinematic: { name: "Cinematic", line: "Film grain, letterbox, dramatic light, editorial type. Always dark." },
};

export default function Hub() {
  const { style, setStyle, role, setRole } = useLab();
  const { user } = useAuth();
  const name = greetingName(user?.displayName, user?.email);
  const pages = LAB_PAGES.filter((p) => p.role === role);

  return (
    <div className="hub">
      <section className="hub-hero">
        <p className="lb-eyebrow">Design lab · {name}</p>
        <h1 className="lb-display">
          Six ways Razzberry <em>could feel.</em>
        </h1>
        <p className="lb-lede">
          Front-end-only experiments with made-up artists, shows and fans. Pick a view, pick a look, and judge each screen on a phone first. Nothing here is saved or sent anywhere.
        </p>
      </section>

      <section className="hub-controls" aria-label="Choose how to explore">
        <div className="hub-control">
          <h2 className="lb-label">View as</h2>
          <div className="hub-role" role="radiogroup" aria-label="View as">
            {LAB_ROLES.map((r: LabRole) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "hub-role-btn on" : "hub-role-btn"} onClick={() => setRole(r)}>
                <strong>{r === "fan" ? "Fan view" : "Artist view"}</strong>
                <span>{r === "fan" ? "Five screens for the people in the room" : "The verified-fans dashboard"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="hub-control">
          <h2 className="lb-label">Visual style</h2>
          <div className="hub-styles" role="radiogroup" aria-label="Visual style">
            {LAB_STYLES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={style === s} className={`hub-style hub-style--${s}${style === s ? " on" : ""}`} onClick={() => setStyle(s)}>
                <span className="hub-style-swatch" aria-hidden="true" />
                <strong>{STYLE_COPY[s].name}</strong>
                <span>{STYLE_COPY[s].line}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Pages" className="hub-grid">
        {pages.map((p) => (
          <Link key={p.key} to={p.path} className="hub-card lb-card">
            <Preview k={p.key} />
            <div className="hub-card-body">
              <h3>{p.label}</h3>
              <p>{p.blurb}</p>
              <span className="hub-open">
                Open <ArrowIcon />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
