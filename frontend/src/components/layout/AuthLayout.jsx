import { Link } from "react-router-dom";
import "./AuthLayout.css";

/**
 * Auth card: green brand wave with the logo and students art on the left, form on the right.
 * On phones the art drops away and the wave becomes a header above the form.
 */
export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="auth2">
      <div className="auth2-card">
        <aside className="auth2-brand">
          <div className="auth2-wave">
            <svg className="auth2-swoosh" viewBox="0 0 120 220" preserveAspectRatio="none" aria-hidden="true">
              {/* Both strokes taper to nothing at the bottom right, so they never end in a hard edge. */}
              <path d="M44 0 C 100 50 120 130 120 220 V 0 Z" fill="var(--gold-500)" />
              <path d="M74 0 C 108 50 120 120 120 180 V 0 Z" fill="var(--green-500)" opacity=".55" />
            </svg>
            <Link to="/" className="auth2-logo" aria-label="Campus Market home">
              <img src="/images/auth/logo-mark.png" alt="" width="72" height="80" />
              <span>Campus<br />Market</span>
            </Link>
            <p className="auth2-tagline">Buy. Sell. Connect.</p>
            <p className="auth2-blurb">Your campus marketplace for food, clothes, gadgets, school supplies, and more — all in one place.</p>
          </div>
          <svg className="auth2-wave-edge" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 0 H400 V18 C 320 78 230 30 150 52 C 90 68 40 80 0 70 Z" fill="var(--green-700)" />
          </svg>
          <figure className="auth2-art">
            <img src="/images/auth/students.webp" alt="Two CSUCC students smiling at their phones while shopping on Campus Market" />
          </figure>
        </aside>

        <main className="auth2-form">
          <div className="auth2-form-inner fade-in">
            <header className="auth-form-header">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
