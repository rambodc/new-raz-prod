import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { ArrowUpRight, CircleHelp, FileKey2, Fingerprint, LogOut, Settings2, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { auth } from "../firebase";
import { functions } from "../firebaseServices";
import { useAuth } from "../auth/AuthProvider";
import { Brand } from "../components/Brand";

type Health = "checking" | "connected" | "unavailable";

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState<Health>("checking");
  const firstName = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  useEffect(() => {
    const check = httpsCallable(functions, "healthCheck");
    void check().then(() => setHealth("connected")).catch(() => setHealth("unavailable"));
  }, []);

  async function handleSignOut() {
    await signOut(auth);
    navigate("/", { replace: true });
  }

  return <div className="dashboard-shell">
    <aside className="dash-sidebar"><Brand /><div className="dash-nav-label">WORKSPACE</div><Link className="dash-nav-item active" to="/dashboard"><Fingerprint size={17} /> Overview</Link><div className="sidebar-spacer" /><div className="sidebar-profile"><div className="avatar">{firstName.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{user?.email}</strong><span>Personal workspace</span></div><button aria-label="Sign out" onClick={handleSignOut}><LogOut size={16} /></button></div></aside>
    <main className="dash-main"><header className="dash-header"><span>Workspace / Overview</span><div><span className={`service-indicator ${health}`}><i />{health === "connected" ? "Platform connected" : health === "checking" ? "Checking platform" : "Platform setup in progress"}</span><button className="icon-button" aria-label="Settings"><Settings2 size={18} /></button></div></header>
      <section className="dash-content"><div className="dash-welcome"><div><span className="eyebrow">YOUR RAZZBERRY WORKSPACE</span><h1>Good to have you, <em>{firstName}.</em></h1><p>Your creative rights workspace is ready for its next chapter.</p></div><span className="welcome-mark"><Sparkles size={22} /></span></div>
        <div className="setup-banner"><div className="setup-icon"><Sparkles size={19} /></div><div><strong>Your foundation is in place.</strong><p>Razzberry is getting its first tools ready. This space will grow with the work you bring to it.</p></div><span className="setup-status"><i /> EARLY ACCESS</span></div>
        <div className="dash-section-title"><div><span className="eyebrow">THE FOUNDATION</span><h2>A home for the work ahead.</h2></div><button className="help-link"><CircleHelp size={16} /> Help</button></div>
        <div className="workspace-cards"><article className="workspace-card"><div className="card-icon"><FileKey2 size={19} /></div><span className="card-kicker">01 / CREATIVE WORK</span><h3>Works & records</h3><p>A clear place for each work and the story connected to it.</p><span className="card-foot">COMING INTO FOCUS <ArrowUpRight size={14} /></span></article><article className="workspace-card"><div className="card-icon card-icon-green"><Fingerprint size={19} /></div><span className="card-kicker">02 / RIGHTS & OWNERSHIP</span><h3>People & rights</h3><p>Understand who created, owns, and participates in the work.</p><span className="card-foot">COMING INTO FOCUS <ArrowUpRight size={14} /></span></article></div>
        <div className="dash-bottom-note"><span className="live-dot" /> This is an early workspace. No creative records or files are being stored yet.</div>
      </section>
    </main>
  </div>;
}
