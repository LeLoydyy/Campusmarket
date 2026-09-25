import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useCart } from "../../context/CartContext.jsx";
import { useNotifications } from "../../context/NotificationContext.jsx";
import NotificationBell from "../notifications/NotificationBell.jsx";
import {
  FiBell,
  FiCalendar,
  FiChevronDown,
  FiGrid,
  FiHeart,
  FiHome,
  FiLock,
  FiLogOut,
  FiMapPin,
  FiMenu,
  FiMessageSquare,
  FiPackage,
  FiSearch,
  FiShoppingBag,
  FiShoppingCart,
  FiX,
} from "react-icons/fi";
import "./Navbar.css";

const NAV_LINKS = [
  { to: "/", label: "Home", icon: FiHome },
  { to: "/stalls", label: "Stalls", icon: FiMapPin },
  { to: "/browse", label: "Products", icon: FiShoppingBag },
  { to: "/events", label: "Events", icon: FiCalendar },
];

const ROLE_LABELS = {
  buyer: "Buyer",
  seller: "Seller",
  admin: "Administrator",
  super_admin: "Super Administrator",
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const userMenuRef = useRef(null);
  const { unread: unreadNotifications } = useNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const displayName = user?.name?.trim() || "Campus user";
  const firstName = displayName.split(/\s+/)[0];
  const userInitial = displayName.charAt(0).toUpperCase();
  const roleLabel = ROLE_LABELS[user?.role] || "Member";
  const numericCartCount = Number(count) || 0;
  const cartCount = numericCartCount > 99 ? "99+" : numericCartCount;

  const isActiveRoute = (path) => {
    if (path === "/") return location.pathname === "/";
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!dropdownOpen) return undefined;

    const handlePointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDropdownOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  const handleLogout = () => {
    setDropdownOpen(false);
    setMobileOpen(false);
    logout();
    navigate("/login");
  };

  const handleSearch = (event) => {
    event.preventDefault();
    const query = searchTerm.trim();
    setMobileOpen(false);
    navigate(query ? `/browse?q=${encodeURIComponent(query)}` : "/browse");
  };

  return (
    <header className="navbar-shell">
      <nav className="navbar" aria-label="Primary navigation">
        <div className="navbar-inner container">
          <Link to="/" className="navbar-brand" aria-label="Campus Market home">
            <img
              src="/images/buyer/campusmarket-logo.png"
              alt="Campus Market"
              className="navbar-brand-logo"
            />
          </Link>

          <div className="navbar-links" aria-label="Marketplace pages">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`nav-link ${isActiveRoute(link.to) ? "active" : ""}`}
                aria-current={isActiveRoute(link.to) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <form className="navbar-search" onSubmit={handleSearch} role="search">
            <FiSearch aria-hidden="true" />
            <label className="sr-only" htmlFor="navbar-search-input">
              Search products, stalls, or events
            </label>
            <input
              id="navbar-search-input"
              type="search"
              placeholder="Search campus marketplace"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <button type="submit" aria-label="Submit search">
              <FiSearch aria-hidden="true" />
            </button>
          </form>

          <div className="navbar-actions">
            {user?.role === "buyer" && (
              <div className="navbar-utilities" aria-label="Buyer shortcuts">
                <Link
                  to="/cart"
                  className="icon-btn"
                  aria-label={`Cart, ${numericCartCount} items`}
                  title="Cart"
                >
                  <FiShoppingCart />
                  {numericCartCount > 0 && (
                    <span className="cart-badge">{cartCount}</span>
                  )}
                </Link>
                <Link
                  to="/messages"
                  className="icon-btn"
                  aria-label="Messages"
                  title="Messages"
                >
                  <FiMessageSquare />
                </Link>
                <NotificationBell />
              </div>
            )}

            {user ? (
              <div className="user-menu" ref={userMenuRef}>
                <button
                  type="button"
                  className="user-avatar-btn"
                  onClick={() => setDropdownOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={dropdownOpen}
                  aria-controls="account-dropdown"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="avatar-img" />
                  ) : (
                    <span className="avatar-initials" aria-hidden="true">
                      {userInitial}
                    </span>
                  )}
                  <span className="user-info-nav">
                    <span className="user-name-nav">{firstName}</span>
                    <span className="user-role-nav">{roleLabel}</span>
                  </span>
                  <FiChevronDown
                    className={`user-menu-chevron ${dropdownOpen ? "open" : ""}`}
                    aria-hidden="true"
                  />
                </button>

                {dropdownOpen && (
                  <div id="account-dropdown" className="dropdown" role="menu">
                    <div className="dropdown-header">
                      <span className="dropdown-avatar" aria-hidden="true">
                        {userInitial}
                      </span>
                      <div>
                        <p>{displayName}</p>
                        <span>{user.email}</span>
                      </div>
                    </div>

                    <div className="dropdown-separator" />
                    {user.status !== "approved" && <Link to="/account-status" className="dropdown-item" role="menuitem">Registration approval status</Link>}
                    {user.role === "buyer" && user.status === "approved" && <Link to="/open-store" className="dropdown-item" role="menuitem">Open a campus store</Link>}

                    {user.role === "buyer" && (
                      <>
                        <Link
                          to="/orders"
                          className="dropdown-item"
                          role="menuitem"
                        >
                          <FiPackage /> My orders
                        </Link>
                        <Link
                          to="/favorites"
                          className="dropdown-item"
                          role="menuitem"
                        >
                          <FiHeart /> Favorites
                        </Link>
                        <Link
                          to="/messages"
                          className="dropdown-item"
                          role="menuitem"
                        >
                          <FiMessageSquare /> Messages
                        </Link>
                      </>
                    )}

                    {user.role === "seller" && (
                      <Link
                        to="/seller"
                        className="dropdown-item"
                        role="menuitem"
                      >
                        <FiGrid /> Seller dashboard
                      </Link>
                    )}

                    {(user.role === "admin" || user.role === "super_admin") && (
                      <Link
                        to="/admin"
                        className="dropdown-item"
                        role="menuitem"
                      >
                        <FiGrid /> Admin panel
                      </Link>
                    )}

                    <Link to="/account/password" className="dropdown-item" role="menuitem">
                      <FiLock /> Change password
                    </Link>

                    <div className="dropdown-separator" />
                    <button
                      type="button"
                      className="dropdown-item danger"
                      onClick={handleLogout}
                      role="menuitem"
                    >
                      <FiLogOut /> Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="auth-btns">
                <Link to="/login" className="btn btn-ghost btn-sm">
                  Log in
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  Create account
                </Link>
              </div>
            )}

            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={
                mobileOpen ? "Close navigation menu" : "Open navigation menu"
              }
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
            >
              {mobileOpen ? <FiX /> : <FiMenu />}
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="mobile-menu-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          />
          <div id="mobile-navigation" className="mobile-menu">
            <form
              className="mobile-search"
              onSubmit={handleSearch}
              role="search"
            >
              <FiSearch aria-hidden="true" />
              <input
                type="search"
                placeholder="Search the marketplace"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search products, stalls, or events"
                autoFocus
              />
              <button type="submit" aria-label="Submit search">
                <FiSearch />
              </button>
            </form>

            <div className="mobile-nav-section">
              <span className="mobile-nav-label">Explore</span>
              {NAV_LINKS.map((link) => {
                const LinkIcon = link.icon;
                const active = isActiveRoute(link.to);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`mobile-nav-link ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <LinkIcon />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>

            {user?.role === "buyer" && (
              <div className="mobile-nav-section">
                <span className="mobile-nav-label">Your account</span>
                <Link to="/cart" className="mobile-nav-link">
                  <FiShoppingCart />
                  <span>Cart</span>
                  {numericCartCount > 0 && (
                    <strong className="mobile-link-count">{cartCount}</strong>
                  )}
                </Link>
                <Link to="/orders" className="mobile-nav-link">
                  <FiPackage />
                  <span>My orders</span>
                </Link>
                <Link to="/favorites" className="mobile-nav-link">
                  <FiHeart />
                  <span>Favorites</span>
                </Link>
                <Link to="/messages" className="mobile-nav-link">
                  <FiMessageSquare />
                  <span>Messages</span>
                </Link>
                <Link to="/notifications" className="mobile-nav-link">
                  <FiBell />
                  <span>Notifications</span>
                  {unreadNotifications > 0 && <span className="notif-bell-badge notif-bell-badge--inline">{unreadNotifications}</span>}
                </Link>
              </div>
            )}

            {user?.role === "seller" && (
              <Link
                to="/seller"
                className="mobile-nav-link mobile-dashboard-link"
              >
                <FiGrid />
                <span>Seller dashboard</span>
              </Link>
            )}

            {(user?.role === "admin" || user?.role === "super_admin") && (
              <Link
                to="/admin"
                className="mobile-nav-link mobile-dashboard-link"
              >
                <FiGrid />
                <span>Admin panel</span>
              </Link>
            )}

            <div className="mobile-menu-footer">
              {user ? (
                <>
                  <div className="mobile-user-summary">
                    <span className="avatar-initials">{userInitial}</span>
                    <div>
                      <strong>{displayName}</strong>
                      <span>{roleLabel}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mobile-logout-btn"
                    onClick={handleLogout}
                  >
                    <FiLogOut /> Log out
                  </button>
                </>
              ) : (
                <div className="mobile-auth-actions">
                  <Link to="/login" className="btn btn-outline">
                    Log in
                  </Link>
                  <Link to="/register" className="btn btn-primary">
                    Create account
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
