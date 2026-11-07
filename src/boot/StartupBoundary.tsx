import { Component, type CSSProperties, type ReactNode } from "react";

const panel: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "#1a1020",
  color: "#f6f1f5",
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  textAlign: "center",
};

/** Shown when the tree throws after the bundle has loaded. Styling is inline so a missing stylesheet still leaves a readable screen. */
export function StartupRecovery({ title, detail }: { title: string; detail: string }) {
  return (
    <main style={panel}>
      <div style={{ maxWidth: "28rem" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 560, margin: "0 0 8px" }}>{title}</h1>
        <p style={{ margin: "0 0 16px", color: "#b3aab9" }}>{detail}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 999, background: "#e11d63", color: "#fff", fontSize: "1rem" }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}

export class StartupBoundary extends Component<{ children: ReactNode }, { detail: string | null }> {
  state = { detail: null as string | null };

  static getDerivedStateFromError(error: unknown): { detail: string } {
    const detail = error instanceof Error && error.message ? error.message : "The screen failed while starting.";
    return { detail };
  }

  render() {
    if (this.state.detail) return <StartupRecovery title="Razzberry couldn't start" detail={this.state.detail} />;
    return this.props.children;
  }
}
