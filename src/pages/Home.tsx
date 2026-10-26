import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ArrowIcon } from "../components/Icons";
import { HeroVisual } from "../components/HeroVisual";
import { Ambient, Footer, Nav } from "../components/Layout";
import { spotlight, useReveal } from "../lib/hooks";

const STEPS = [
  { n: "01", title: "Create", body: "Give every creative work a permanent identity from the moment it exists." },
  { n: "02", title: "Prove", body: "Keep a clear record of who made it, who contributed, and when." },
  { n: "03", title: "Own", body: "See who owns what and how it earns, in one trusted place." },
];

export default function Home() {
  const { user } = useAuth();
  const root = useReveal<HTMLDivElement>();
  return (
    <div className="page home" ref={root}>
      <Ambient />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow reveal">
              <span className="dot" aria-hidden="true" /> Creative rights infrastructure
            </p>
            <h1 className="reveal" style={{ "--d": "80ms" } as React.CSSProperties}>
              Every creative work deserves a <span className="grad">permanent identity.</span>
            </h1>
            <p className="lede reveal" style={{ "--d": "160ms" } as React.CSSProperties}>
              Razzberry is building the system of record for who made it, who owns it and how it earns.
            </p>
            <div className="cta-row reveal" style={{ "--d": "240ms" } as React.CSSProperties}>
              {user ? (
                <Link to="/welcome" className="btn btn-primary btn-lg">
                  Open Razzberry <ArrowIcon />
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="btn btn-primary btn-lg">
                    Create your account <ArrowIcon />
                  </Link>
                  <Link to="/signin" className="btn btn-ghost btn-lg">
                    Sign in
                  </Link>
                </>
              )}
            </div>
            <p className="fine reveal" style={{ "--d": "320ms" } as React.CSSProperties}>
              Early access. Accounts are open while we build the rest.
            </p>
          </div>
          <HeroVisual />
        </section>

        <section className="section" aria-labelledby="how-title">
          <div className="section-head reveal">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Create. Prove. Own.</h2>
            <p className="section-sub">Three ideas at the heart of Razzberry, and where we're headed.</p>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.n} className="step glass reveal" style={{ "--d": `${i * 90}ms` } as React.CSSProperties} onPointerMove={spotlight}>
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" aria-labelledby="status-title">
          <div className="status glass reveal" onPointerMove={spotlight}>
            <div>
              <p className="eyebrow">Where we are</p>
              <h2 id="status-title">Just getting started.</h2>
              <p className="section-sub">
                Razzberry is in its earliest stage. You can create an account today. The rights tools themselves are still being built, and we'll share them as they're ready.
              </p>
            </div>
            {!user && (
              <Link to="/signup" className="btn btn-primary btn-lg">
                Join early <ArrowIcon />
              </Link>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
