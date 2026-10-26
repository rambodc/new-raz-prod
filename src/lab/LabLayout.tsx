import { Suspense, useEffect } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { greetingName } from "../auth/validation";
import { MoonIcon, SunIcon } from "../components/Icons";
import { RaspberryMark, Wordmark } from "../components/RaspberryMark";
import { useTheme } from "../components/ThemeProvider";
import { LAB_PAGES } from "./pages";
import "./styles/lab.css";

export default function LabLayout() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const name = greetingName(user?.displayName, user?.email);
  const next = theme === "dark" ? "light" : "dark";

  // Earlier previews stored a look and a view here. They are no longer used, so tidy them away.
  useEffect(() => {
    try {
      localStorage.removeItem("razzberry-lab-style");
      localStorage.removeItem("razzberry-lab-role");
    } catch {
      /* storage blocked: nothing to tidy */
    }
  }, []);

  return (
    <div className={`lab ${theme === "dark" ? "is-dark" : "is-light"}`}>
      <div className="lab-bg" aria-hidden="true">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
        <span className="blob blob-4" />
        <span className="aurora-sheen" />
      </div>
      <a className="skip-link" href="#lab-main">
        Skip to content
      </a>
      <header className="lab-top">
        <div className="lab-top-row">
          <Link to="/app" className="lab-brand" aria-label="Design lab home">
            <RaspberryMark className="lab-brand-mark" />
            <Wordmark className="lab-brand-word" />
          </Link>
          <div className="lab-tools">
            <button type="button" className="lab-icon-btn" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <Link to="/welcome" className="lab-account" title={`Signed in as ${name}`} aria-label={`Account: ${name}`}>
              {name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </div>
        <nav className="lab-links" aria-label="Design lab pages">
          {LAB_PAGES.map((p) => (
            <NavLink key={p.key} to={p.path} className="lab-link">
              {p.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="lab-main" className="lab-main">
        <Suspense
          fallback={
            <div className="lab-loading" aria-busy="true">
              <span className="sr-only">Loading…</span>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <footer className="lab-foot">Demo</footer>
    </div>
  );
}
