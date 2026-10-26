import { Suspense, useEffect, useMemo } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { greetingName } from "../auth/validation";
import { MoonIcon, SunIcon } from "../components/Icons";
import { RaspberryMark, Wordmark } from "../components/RaspberryMark";
import { useTheme } from "../components/ThemeProvider";
import { LAB_ROLES, LAB_STYLES, LabContext, ROLE_KEY, STYLE_KEY, type LabRole, type LabStyle } from "./context";
import { useStoredChoice } from "./hooks";
import { LAB_PAGES } from "./pages";
import "./styles/lab.css";

function Backdrop({ style }: { style: LabStyle }) {
  if (style === "aurora") {
    return (
      <div className="lab-bg lab-bg--aurora" aria-hidden="true">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
        <span className="blob blob-4" />
        <span className="aurora-sheen" />
      </div>
    );
  }
  return (
    <div className="lab-bg lab-bg--cinematic" aria-hidden="true">
      <span className="cine-beam cine-beam-1" />
      <span className="cine-beam cine-beam-2" />
      <span className="cine-glow" />
      <span className="cine-vignette" />
      <span className="cine-grain" />
      <span className="cine-bar cine-bar-top" />
      <span className="cine-bar cine-bar-bottom" />
    </div>
  );
}

const STYLE_LABEL: Record<LabStyle, string> = { aurora: "Aurora", cinematic: "Cinematic" };

export default function LabLayout() {
  const [style, setStyle] = useStoredChoice<LabStyle>(STYLE_KEY, LAB_STYLES, "aurora");
  const [storedRole, setRole] = useStoredChoice<LabRole>(ROLE_KEY, LAB_ROLES, "fan");
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const name = greetingName(user?.displayName, user?.email);

  // The role follows the page you open, so the nav always lists the right pages. On the hub it is your last choice.
  const pageRole = LAB_PAGES.find((p) => pathname === p.path)?.role;
  const role = pageRole ?? storedRole;
  useEffect(() => {
    if (pageRole && pageRole !== storedRole) setRole(pageRole);
  }, [pageRole, storedRole, setRole]);

  // Aurora follows the site light/dark switch. Cinematic is always dark.
  const dark = style === "cinematic" || theme === "dark";
  const ctx = useMemo(() => ({ style, setStyle, role, setRole }), [style, setStyle, role, setRole]);
  const pages = LAB_PAGES.filter((p) => p.role === role);

  return (
    <LabContext.Provider value={ctx}>
      <div className={`lab lab--${style} ${dark ? "is-dark" : "is-light"}`} data-lab-style={style}>
        <Backdrop style={style} />
        <a className="skip-link" href="#lab-main">
          Skip to content
        </a>
        <header className="lab-top">
          <div className="lab-top-row">
            <Link to="/app" className="lab-brand" aria-label="Design lab home">
              <RaspberryMark className="lab-brand-mark" />
              <Wordmark className="lab-brand-word" />
              <span className="lab-brand-tag">Design lab</span>
            </Link>
            <div className="lab-tools">
              <div className="seg" role="radiogroup" aria-label="Visual style">
                {LAB_STYLES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={style === s} className={style === s ? "seg-btn on" : "seg-btn"} onClick={() => setStyle(s)}>
                    {STYLE_LABEL[s]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="lab-icon-btn"
                onClick={toggle}
                disabled={style === "cinematic"}
                aria-label={style === "cinematic" ? "Cinematic is always dark" : `Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                title={style === "cinematic" ? "Cinematic is always dark" : `Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
              <Link to="/welcome" className="lab-account" title={`Signed in as ${name}`}>
                {name.slice(0, 1).toUpperCase()}
              </Link>
            </div>
          </div>
          <nav className="lab-sub" aria-label="Design lab pages">
            <div className="seg seg--role" role="radiogroup" aria-label="View as">
              {LAB_ROLES.map((r) => (
                <Link key={r} to={LAB_PAGES.find((p) => p.role === r)!.path} role="radio" aria-checked={role === r} className={role === r ? "seg-btn on" : "seg-btn"} onClick={() => setRole(r)}>
                  {r === "fan" ? "Fan view" : "Artist view"}
                </Link>
              ))}
            </div>
            <div className="lab-links">
              <NavLink to="/app" end className="lab-link">
                Hub
              </NavLink>
              {pages.map((p) => (
                <NavLink key={p.key} to={p.path} className="lab-link">
                  {p.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </header>
        <main id="lab-main" className="lab-main">
          <Suspense fallback={<div className="lab-loading" aria-busy="true"><span className="sr-only">Loading…</span></div>}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="lab-foot">
          <span className="lab-foot-dot" aria-hidden="true" /> Demo data — design preview
        </footer>
      </div>
    </LabContext.Provider>
  );
}
