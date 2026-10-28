import { Link } from "react-router-dom";
import { MoonIcon, SunIcon } from "./Icons";
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
