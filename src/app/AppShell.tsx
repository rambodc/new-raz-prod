import { Suspense } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { greetingName } from "../auth/validation";
import { MoonIcon, SunIcon } from "../components/Icons";
import { RaspberryMark, Wordmark } from "../components/RaspberryMark";
import { useTheme } from "../components/ThemeProvider";
import { useIsAdmin } from "./useIsAdmin";
import "../styles/app.css";
import "../styles/screens.css";

/** The Aurora frame around every signed-in screen: moving colour behind, a small header on top. */
export default function AppShell() {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { admin } = useIsAdmin();
  const name = greetingName(user?.displayName, user?.email);
  const next = theme === "dark" ? "light" : "dark";

  return (
    <div className={`app ${theme === "dark" ? "is-dark" : "is-light"}`}>
      <div className="app-bg" aria-hidden="true">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
        <span className="blob blob-4" />
        <span className="aurora-sheen" />
      </div>
      <a className="skip-link" href="#app-main">
        Skip to content
      </a>
      <header className="app-top">
        <div className="app-top-row">
          <Link to="/" className="app-brand" aria-label="Razzberry home">
            <RaspberryMark className="app-brand-mark" />
            <Wordmark className="app-brand-word" />
          </Link>
          <div className="app-tools">
            {admin && (
              <Link to="/admin" className="app-pill">
                Admin
              </Link>
            )}
            <button type="button" className="app-icon-btn" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <Link to="/welcome" className="app-account" title={`Signed in as ${name}`} aria-label={`Account: ${name}`}>
              {name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </div>
      </header>
      <main id="app-main" className="app-main">
        <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
