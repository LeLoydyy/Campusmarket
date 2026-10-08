import { Component } from "react";
import { useLocation } from "react-router-dom";
import EmptyState from "../ui/EmptyState.jsx";
import { clearTokens } from "../../services/tokens";

/**
 * Catches a page that crashes while rendering, so the screen never goes blank.
 * Shows what failed and a way out; moving to another page clears the error.
 */
class Boundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ui] Page crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="full-center" style={{ padding: "24px 16px" }}>
        <div style={{ maxWidth: 520, width: "100%" }}>
          <EmptyState
            illustration="box"
            title="This page didn't load"
            description="Something went wrong while showing this page. Reloading usually fixes it. If it keeps happening, sign in again."
            action={{ label: "Reload page", onClick: () => window.location.reload() }}
            secondaryAction={{ label: "Sign in again", onClick: () => { clearTokens(); window.location.assign("/login"); } }}
          />
          <details style={{ marginTop: 16, fontSize: 13, color: "var(--ink-600, #4A5A50)" }}>
            <summary style={{ cursor: "pointer" }}>Error details</summary>
            <pre style={{ marginTop: 8, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "rgba(0,0,0,.04)", borderRadius: 10 }}>
              {String(error?.stack || error?.message || error)}
            </pre>
          </details>
        </div>
      </main>
    );
  }
}

export default function ErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <Boundary key={pathname}>{children}</Boundary>;
}
