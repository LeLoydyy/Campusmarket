import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { clearTokens } from "../../services/tokens.js";
import {
  ADMIN_NAV,
  BUYER_NAV,
  ROLE_LABELS,
  SELLER_NAV,
} from "../../config/navigation.js";
import "./Sidebar.css";

const NAVIGATION = {
  admin: ADMIN_NAV,
  buyer: BUYER_NAV,
  seller: SELLER_NAV,
};

const GROUP_LABELS = {
  seller: [
    ["Workspace", ["Dashboard", "My Stall", "Stall Branding", "Products", "Point of Sale", "Orders"]],
    ["Growth", ["Events & Reservations", "Analytics", "Messages"]],
    ["Account", ["Reviews", "Settings", "Password"]],
  ],
  admin: [
    ["Overview", ["Dashboard", "Analytics", "Reports"]],
    ["Management", ["Registration & Users", "Stores & Plans", "Event Applications"]],
    ["Operations", ["Events", "Stall Map", "Reservations", "Complaints"]],
    ["Account", ["Settings", "Password"]],
  ],
  buyer: [["Marketplace", []]],
};

const getInitials = (value) =>
  String(value || "CM")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function Sidebar({ open, isOpen: legacyOpen, onClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);

  const role = user?.role || "seller";
  const navItems = NAVIGATION[role] || SELLER_NAV;
  const controlledOpen = typeof open === "boolean" ? open : legacyOpen;
  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = (isControlled && controlledOpen) || internalOpen;

  const closeSidebar = () => {
    setInternalOpen(false);
    if (isControlled) onClose?.();
  };

  useEffect(() => {
    closeSidebar();
  }, [location.pathname]);

  const groups = useMemo(() => {
    const definitions = GROUP_LABELS[role] || GROUP_LABELS.seller;
    const assigned = new Set();

    const result = definitions.map(([label, names]) => {
      const items = names.length
        ? navItems.filter((item) => names.includes(item.label))
        : navItems;
      items.forEach((item) => assigned.add(item.to));
      return { label, items };
    });

    const remaining = navItems.filter((item) => !assigned.has(item.to));
    if (remaining.length)
      result.splice(-1, 0, { label: "More", items: remaining });
    return result.filter((group) => group.items.length);
  }, [navItems, role]);

  const name = user?.name || user?.full_name || "Campus User";
  const avatar = user?.avatar_url || user?.profile_image;
  const homePath =
    role === "admin" ? "/admin" : role === "seller" ? "/seller" : "/";
  const profilePath = role === "seller" ? "/seller/settings" : homePath;

  const handleLogout = async () => {
    try {
      await logout?.();
    } finally {
      clearTokens();
      navigate("/login", { replace: true });
    }
  };

  return (
    <>
      <button
        type="button"
        className="cm-sidebar-mobile-trigger"
        onClick={() => setInternalOpen(true)}
        aria-label="Open navigation"
        aria-expanded={isOpen}
      >
        <Menu size={20} />
      </button>

      <aside className={`cm-sidebar cm-sidebar--${role} ${isOpen ? "cm-sidebar--open" : ""}`}>
        <div className="cm-sidebar-brand">
          <Link
            to={homePath}
            className={`cm-sidebar-logo${role === "seller" ? " cm-sidebar-logo--seller" : ""}`}
            aria-label="Campus Market dashboard"
          >
            {role === "seller" ? (
              <img
                className="cm-sidebar-seller-wordmark"
                src="/images/buyer/campusmarket-logo.png"
                alt="Campus Market"
              />
            ) : (
              <>
                <span className="cm-sidebar-logo-mark">
                  <img src="/images/logo.png" alt="" />
                </span>
                <span className="cm-sidebar-brand-copy">
                  <strong>Campus Market</strong>
                  <small>{ROLE_LABELS[role] || role} workspace</small>
                </span>
              </>
            )}
          </Link>
          <button
            type="button"
            className="cm-sidebar-close"
            onClick={closeSidebar}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <Link to={profilePath} className="cm-sidebar-user">
          <span className="cm-sidebar-avatar">
            {avatar ? <img src={avatar} alt="" /> : getInitials(name)}
            <i aria-label="Online" />
          </span>
          <span className="cm-sidebar-user-info">
            <strong className="cm-sidebar-user-name">{name}</strong>
            <small className="cm-sidebar-user-role">
              <ShieldCheck size={12} /> {ROLE_LABELS[role] || role}
            </small>
          </span>
          <ChevronRight className="cm-sidebar-chevron" size={16} />
        </Link>

        <nav
          className="cm-sidebar-nav"
          aria-label={`${ROLE_LABELS[role] || role} navigation`}
        >
          {groups.map((group) => (
            <div className="cm-sidebar-group" key={group.label}>
              <p className="cm-sidebar-group-label">{group.label}</p>
              <div className="cm-sidebar-group-links">
                {group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    // Exact match when another link lives under this path (e.g. My Stall → Stall Branding)
                    end={to === homePath || navItems.some((item) => item.to.startsWith(`${to}/`))}
                    className={({ isActive }) =>
                      `cm-sidebar-link ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="cm-sidebar-link-icon">
                      <Icon size={18} />
                    </span>
                    <span>{label}</span>
                    <i className="cm-sidebar-active-dot" />
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="cm-sidebar-footer">
          <div className="cm-sidebar-secure-note">
            <ShieldCheck size={15} />
            <span>
              <strong>Secure workspace</strong>
              <small>{role === "admin" ? "Campus Market administration" : "Your account data is protected"}</small>
            </span>
          </div>
          <button
            type="button"
            className="cm-sidebar-link cm-sidebar-link--logout"
            onClick={handleLogout}
          >
            <span className="cm-sidebar-link-icon">
              <LogOut size={18} />
            </span>
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {isOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          onClick={closeSidebar}
          aria-label="Close navigation"
        />
      )}
    </>
  );
}
