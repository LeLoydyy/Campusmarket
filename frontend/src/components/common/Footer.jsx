import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";

/** Deep-green site footer for buyer-facing pages. */
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-logo"><img src="/images/buyer/campusmarket-logo.png" alt="Campus Market" /></span>
          <p>Food, merch and student-made goods from sellers you know — all around CSU Cabadbaran.</p>
          <p className="site-footer-tagline">Buy. Sell. Connect.</p>
        </div>
        <nav aria-label="Explore">
          <h2>Explore</h2>
          <Link to="/browse">Shop products</Link>
          <Link to="/stalls">Campus stalls</Link>
          <Link to="/events">Events & fairs</Link>
        </nav>
        <nav aria-label="Sell">
          <h2>Sell on campus</h2>
          <Link to="/open-store">Open your stall</Link>
          <Link to="/register">Create an account</Link>
          <Link to="/events">Apply for an event stall</Link>
        </nav>
        <div>
          <h2>Our campus</h2>
          <p className="site-footer-place"><MapPin aria-hidden="true" /> Caraga State University – Cabadbaran Campus</p>
          <p>For students, faculty and employees of CSUCC.</p>
        </div>
      </div>
      <div className="site-footer-base">
        <span>© {new Date().getFullYear()} Campus Market · CSUCC</span>
        <span>Made by and for the CSUCC community</span>
      </div>
    </footer>
  );
}
