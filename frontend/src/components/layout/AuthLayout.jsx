import { Link } from "react-router-dom";
import { BadgeCheck, MapPin, Store } from "lucide-react";
import "./AuthLayout.css";

/** Split auth layout: deep-green brand panel with the Campus Market art, form on cream. */
export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="auth2">
      <aside className="auth2-brand">
        <Link to="/" className="auth2-logo" aria-label="Campus Market home">
          <img src="/images/buyer/campusmarket-logo.png" alt="Campus Market" />
        </Link>
        <div className="auth2-brand-copy">
          <p className="auth2-tagline">Buy. Sell. Connect.</p>
          <h2>The campus fair that's open every day.</h2>
          <ul>
            <li><BadgeCheck aria-hidden="true" /> Every seller is a verified CSUCC student, faculty or staff member</li>
            <li><MapPin aria-hidden="true" /> Pick up between classes at stalls you already know</li>
            <li><Store aria-hidden="true" /> Open your own stall in minutes</li>
          </ul>
        </div>
        <figure className="auth2-art">
          <img src="/images/buyer/campusmarket-background.png" alt="The Campus Market tote bag and books in front of the CSUCC building" />
        </figure>
        <p className="auth2-note">Exclusive to Caraga State University – Cabadbaran Campus</p>
      </aside>

      <main className="auth2-form">
        <div className="auth2-form-inner fade-in">
          <Link to="/" className="auth2-logo auth2-logo--mobile" aria-label="Campus Market home">
            <img src="/images/buyer/campusmarket-logo.png" alt="Campus Market" />
          </Link>
          <header className="auth-form-header">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
