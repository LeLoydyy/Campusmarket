import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarDays, Grid3X3, Home, LogIn, LogOut, ShoppingBag, ShoppingCart, Store, UserRound, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { accountLinks } from "./accountLinks.js";

/**
 * Thumb-reach navigation on phones: Home, Browse, Events, Cart, Profile.
 * Profile opens a bottom sheet with the account links. Hidden above 768px.
 */
export default function MobileTabBar({ onLogout, bump }) {
  const { user } = useAuth();
  const { count } = useCart();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const cartCount = Number(count) || 0;

  useEffect(() => {
    document.body.classList.add("has-tabbar");
    return () => document.body.classList.remove("has-tabbar");
  }, []);
  useEffect(() => { setSheetOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const escape = (event) => { if (event.key === "Escape") setSheetOpen(false); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [sheetOpen]);

  const isActive = (path) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));
  const tabs = [
    { to: "/", label: "Home", icon: Home },
    { to: "/browse", label: "Browse", icon: ShoppingBag },
    { to: "/events", label: "Events", icon: CalendarDays },
    !user ? { to: "/stalls", label: "Stalls", icon: Store }
      : user.role === "buyer" ? { to: "/cart", label: "Cart", icon: ShoppingCart, badge: cartCount }
        : { to: user.role === "seller" ? "/seller" : "/admin", label: "Dashboard", icon: Grid3X3 },
  ];

  return (
    <>
      <nav className="tabbar" aria-label="Quick navigation">
        {tabs.map(({ to, label, icon: Icon, badge }) => (
          <Link key={to} to={to} className={`tabbar-item ${isActive(to) ? "is-active" : ""}`} aria-current={isActive(to) ? "page" : undefined}>
            <span className="tabbar-icon">
              <Icon aria-hidden="true" />
              {badge > 0 && <span key={bump} className={`cm-tabbar-badge ${bump ? "is-bumped" : ""}`}>{badge > 99 ? "99+" : badge}</span>}
            </span>
            <span>{label}</span>
          </Link>
        ))}
        {user ? (
          <button type="button" className={`tabbar-item ${sheetOpen ? "is-active" : ""}`} onClick={() => setSheetOpen(true)} aria-haspopup="dialog" aria-expanded={sheetOpen}>
            <span className="tabbar-icon"><UserRound aria-hidden="true" /></span>
            <span>Profile</span>
          </button>
        ) : (
          <Link to="/login" className={`tabbar-item ${isActive("/login") ? "is-active" : ""}`}>
            <span className="tabbar-icon"><LogIn aria-hidden="true" /></span>
            <span>Log in</span>
          </Link>
        )}
      </nav>

      {sheetOpen && user && (
        <div className="sheet-layer" role="presentation" onClick={() => setSheetOpen(false)}>
          <section className="sheet" role="dialog" aria-modal="true" aria-label="Your account" onClick={(event) => event.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <header className="sheet-head">
              <span className="nb-avatar nb-avatar--lg" aria-hidden="true">{(user.name || "C").charAt(0).toUpperCase()}</span>
              <div><strong>{user.name}</strong><small>{user.email}</small></div>
              <button type="button" className="sheet-close" onClick={() => setSheetOpen(false)} aria-label="Close"><X aria-hidden="true" /></button>
            </header>
            <div className="sheet-links">
              {accountLinks(user).map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="sheet-link"><Icon aria-hidden="true" /> {label}</Link>
              ))}
              <button type="button" className="sheet-link is-danger" onClick={onLogout}><LogOut aria-hidden="true" /> Log out</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
