import { ArrowDownRight, ArrowUpRight, CirclePlay, Fingerprint, Layers3, MoveUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";

const pillars = [
  { number: "01", title: "Create", text: "Give every creative work a clear beginning and a durable record.", icon: Layers3 },
  { number: "02", title: "Prove", text: "Connect the people, agreements, and history behind each work.", icon: Fingerprint },
  { number: "03", title: "Move value", text: "Make ownership and rights easier to understand as they change.", icon: MoveUpRight },
];

export function Home() {
  return <div className="site-shell">
    <header className="topbar wrap">
      <Brand />
      <nav className="top-links" aria-label="Main navigation">
        <a href="#approach">Approach</a>
        <a href="#infrastructure">Infrastructure</a>
      </nav>
      <div className="top-actions"><Link className="text-link" to="/signin">Sign in</Link><Link className="button button-small" to="/signup">Get started <ArrowUpRight size={15} /></Link></div>
    </header>

    <main>
      <section className="hero wrap" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> Creative rights infrastructure</div>
          <h1>Give every creative work <span>a permanent record.</span></h1>
          <p className="hero-intro">A system of record for what gets created, who owns it, how it earns, and how those rights move over time.</p>
          <div className="hero-actions"><Link className="button" to="/signup">Create your account <ArrowUpRight size={16} /></Link><a className="quiet-link" href="#approach"><CirclePlay size={17} /> Explore the idea</a></div>
          <div className="hero-note"><span className="note-line" />Built for the people and ideas behind culture</div>
        </div>

        <div className="rights-art" aria-label="Creative rights move from creation to inheritance">
          <div className="art-top"><span>RIGHTS, MADE LEGIBLE</span><span>RB / 001</span></div>
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-core"><span>R</span><small>THE WORK</small></div>
          <div className="art-node node-create"><span className="node-dot" />CREATE<small>01</small></div>
          <div className="art-node node-prove"><span className="node-dot" />PROVE<small>02</small></div>
          <div className="art-node node-own"><span className="node-dot" />OWN<small>03</small></div>
          <div className="art-node node-earn"><span className="node-dot" />EARN<small>04</small></div>
          <div className="art-node node-transfer"><span className="node-dot" />TRANSFER<small>05</small></div>
          <div className="art-foot"><span>CREATIVE WORK</span><span className="art-connector"><i /><i /><i /><i /><i /></span><span>RIGHTS IN MOTION</span></div>
          <ArrowDownRight className="art-arrow" size={22} />
        </div>
        <div className="hero-index">01 <span>/</span> A NEW FOUNDATION FOR CREATIVE WORK</div>
      </section>

      <section className="manifesto section-pad" id="approach">
        <div className="wrap manifesto-grid">
          <div><span className="eyebrow">The idea</span><h2>Creative work deserves infrastructure built around <em>its rights.</em></h2></div>
          <div className="manifesto-aside"><p>Creation is only the start. Razzberry is shaping a clearer way to record the work, recognize its owners, and follow its value as it moves.</p><a className="under-link" href="#infrastructure">See the foundation <ArrowUpRight size={15} /></a></div>
        </div>
      </section>

      <section className="infrastructure section-pad wrap" id="infrastructure">
        <div className="section-heading"><div><span className="eyebrow">One connected record</span><h2>From first creation<br />to what comes next.</h2></div><p>One thoughtful foundation for the lifecycle of a creative work and the rights connected to it.</p></div>
        <div className="pillar-grid">{pillars.map(({ number, title, text, icon: Icon }) => <article className="pillar" key={number}><div className="pillar-top"><span>{number} / 03</span><Icon size={19} strokeWidth={1.4} /></div><h3>{title}</h3><p>{text}</p></article>)}</div>
        <div className="timeline"><span>MAKE</span><i /><span>DOCUMENT</span><i /><span>RECOGNIZE</span><i /><span>TRANSFER</span></div>
      </section>

      <section className="closing section-pad"><div className="wrap closing-inner"><span className="eyebrow">An early foundation</span><h2>Make the invisible<br /><em>understandable.</em></h2><p>Start with a simple account. The Razzberry workspace is taking shape.</p><Link className="button" to="/signup">Join Razzberry <ArrowUpRight size={16} /></Link></div><div className="closing-orbit" aria-hidden="true" /></section>
    </main>

    <footer className="footer wrap"><Brand compact /><span>Creative rights infrastructure</span><div><Link to="/signin">Sign in</Link><Link to="/signup">Create account</Link></div><small>© {new Date().getFullYear()} Razzberry</small></footer>
  </div>;
}
