import { Link } from "react-router-dom";
import { ArrowIcon } from "../../components/Icons";
import { LAB_PAGES } from "../pages";
import "../styles/hub.css";

const GROUPS = ["Fan", "Artist", "Show night"] as const;

export default function Hub() {
  return (
    <div className="hub">
      <header className="lb-head">
        <h1 className="lb-display">
          Pick a <em>screen.</em>
        </h1>
      </header>
      {GROUPS.map((g) => (
        <section key={g} className="hub-group" aria-labelledby={`hub-${g}`}>
          <h2 id={`hub-${g}`} className="lb-label">
            {g}
          </h2>
          <ul className="hub-list">
            {LAB_PAGES.filter((p) => p.group === g).map((p) => (
              <li key={p.key}>
                <Link to={p.path} className="hub-item lb-card">
                  <span className="hub-name">{p.label}</span>
                  <span className="hub-tag">{p.tag}</span>
                  <ArrowIcon className="hub-go" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
