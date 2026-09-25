import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, LogOut, MessageSquare, Search, ShoppingCart } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import NotificationBell from "../notifications/NotificationBell.jsx";
import MobileTabBar from "./MobileTabBar.jsx";
import { accountLinks } from "./accountLinks.js";
import "./Navbar.css";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/stalls", label: "Stalls" },
  { to: "/browse", label: "Products" },
  { to: "/events", label: "Events" },
];

// Pages with their own scoped search field: the navbar hides its search there,
// so every screen has exactly one search bar.
const PAGES_WITH_OWN_SEARCH = ["/events", "/orders", "/messages", "/stalls"];

const ROLE_LABELS = { buyer: "Buyer", seller: "Seller", admin: "Administrator", super_admin: "Super Administrator" };


export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => (location.pathname === "/browse" ? params.get("q") || "" : ""));
  const [bump, setBump] = useState(0);
  const lastCount = useRef(count);

  const cartCount = Number(count) || 0;
  const displayName = user?.name?.trim() || "Campus user";
  const initial = displayName.charAt(0).toUpperCase();
  const showSearch = !PAGES_WITH_OWN_SEARCH.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

  const isActive = (path) => (path === "/" ? location.pathname === "/" : location.pathname === path || location.pathname.startsWith(`${path}/`));

  // Keep the field in step with Browse's ?q= so the one search bar reflects the results shown.
  useEffect(() => {
    if (location.pathname === "/browse") setSearchTerm(params.get("q") || "");
  }, [location.pathname, params]);

  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Bounce the cart badge when something is added.
  useEffect(() => {
    if (cartCount > (Number(lastCount.current) || 0)) setBump((value) => value + 1);
    lastCount.current = cartCount;
  }, [cartCount]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate("/login");
  };

  const handleSearch = (event) => {
    event.preventDefault();
    const query = searchTerm.trim();
    const next = new URLSearchParams(location.pathname === "/browse" ? params : undefined);
    if (query) next.set("q", query); else next.delete("q");
    navigate(`/browse${next.toString() ? `?${next}` : ""}`);
  };

  return (
    <>
      <header className={`nb ${scrolled ? "is-scrolled" : ""}`}>
        <div className="nb-inner">
          <Link to="/" className="nb-brand" aria-label="Campus Market home">
            <img src="/images/buyer/campusmarket-logo.png" alt="Campus Market" />
          </Link>

          <nav className="nb-links" aria-label="Marketplace">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className={`nb-link ${isActive(link.to) ? "is-active" : ""}`} aria-current={isActive(link.to) ? "page" : undefined}>
                {link.label}
              </Link>
            ))}
          </nav>

          {showSearch && (
            <form className="nb-search" onSubmit={handleSearch} role="search">
              <Search aria-hidden="true" />
              <label className="sr-only" htmlFor="nb-search-input">Search products and stalls</label>
              <input id="nb-search-input" type="search" placeholder="Search food, merch, stalls…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              <button type="submit" className="nb-search-go">Search</button>
            </form>
          )}

          <div className="nb-actions">
            {user?.role === "buyer" && (
              <>
                <Link to="/cart" className="nb-icon nb-hide-mobile" aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`} title="Cart">
                  <ShoppingCart aria-hidden="true" />
                  {cartCount > 0 && <span key={bump} className={`cart-badge nb-badge ${bump ? "is-bumped" : ""}`}>{cartCount > 99 ? "99+" : cartCount}</span>}
                </Link>
                <Link to="/messages" className="nb-icon nb-hide-mobile" aria-label="Messages" title="Messages"><MessageSquare aria-hidden="true" /></Link>
                <NotificationBell />
              </>
            )}

            {user ? (
              <div className="nb-user" ref={menuRef}>
                <button type="button" className="nb-user-btn" onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Account menu for ${displayName}`}>
                  <span className="nb-avatar" aria-hidden="true">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : initial}</span>
                  <span className="nb-user-text">
                    <strong>{displayName.split(/\s+/)[0]}</strong>
                    <small>{ROLE_LABELS[user.role] || "Member"}</small>
                  </span>
                  <ChevronDown className={`nb-chevron ${menuOpen ? "is-open" : ""}`} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div className="nb-menu" role="menu">
                    <div className="nb-menu-head">
                      <span className="nb-avatar nb-avatar--lg" aria-hidden="true">{initial}</span>
                      <div><strong>{displayName}</strong><small>{user.email}</small></div>
                    </div>
                    {accountLinks(user).map(({ to, label, icon: Icon }) => (
                      <Link key={to} to={to} className="nb-menu-item" role="menuitem"><Icon aria-hidden="true" /> {label}</Link>
                    ))}
                    <button type="button" className="nb-menu-item is-danger" role="menuitem" onClick={handleLogout}><LogOut aria-hidden="true" /> Log out</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="nb-auth">
                <Link to="/login" className="btn btn-ghost btn-sm nb-hide-mobile">Log in</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Join</Link>
              </div>
            )}
          </div>
        </div>
      </header>
      <MobileTabBar onLogout={handleLogout} bump={bump} />
    </>
  );
}
