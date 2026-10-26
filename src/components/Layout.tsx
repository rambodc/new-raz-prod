import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ArrowIcon, MoonIcon, SunIcon } from "./Icons";
import { RaspberryMark, Wordmark } from "./RaspberryMark";
import { useTheme } from "./ThemeProvider";

export function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="orb orb-a" />
      <span className="orb orb-b" />
      <span className="orb orb-c" />
      <span className="grain" />
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function BrandLink() {
  return (
    <Link to="/" className="brand" aria-label="Razzberry home">
      <RaspberryMark className="brand-mark" />
      <Wordmark className="brand-word" />
    </Link>
  );
}

export function Nav() {
  const { user } = useAuth();
  return (
    <header className="nav-wrap">
      <nav className="nav glass" aria-label="Main">
        <BrandLink />
        <div className="nav-actions">
          <ThemeToggle />
          {user ? (
            <Link to="/welcome" className="btn btn-primary btn-sm">
              Open Razzberry <ArrowIcon />
            </Link>
          ) : (
            <>
              <NavLink to="/signin" className="nav-link">
                Sign in
              </NavLink>
              <Link to="/signup" className="btn btn-primary btn-sm">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <BrandLink />
        <p className="footer-tag">Creative rights infrastructure.</p>
        <p className="footer-copy">© {new Date().getFullYear()} Razzberry. All rights reserved.</p>
      </div>
    </footer>
  );
}

/** Slim page shell used by the auth pages. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page auth-page">
      <Ambient />
      <header className="auth-top">
        <BrandLink />
        <ThemeToggle />
      </header>
      <main id="main" className="auth-main">
        {children}
      </main>
    </div>
  );
}
