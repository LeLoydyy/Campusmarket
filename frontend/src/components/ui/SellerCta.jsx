import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";

/** Full-width yellow "Got something to sell?" band. Sits directly above the footer; shown to guests and buyers only. */
export default function SellerCta() {
  const { user } = useAuth();
  if (user && user.role !== "buyer") return null;
  return (
    <section className="cm-sell" aria-labelledby="sell-title">
      <div className="cm-sell-inner">
        <div>
          <h2 id="sell-title">Got something to sell?</h2>
          <p>Open your stall in 5 minutes. It's free for CSUCC students.</p>
        </div>
        <Link to={user ? "/open-store" : "/register"} className="btn btn-primary btn-lg"><Store aria-hidden="true" /> Open your stall</Link>
      </div>
    </section>
  );
}
