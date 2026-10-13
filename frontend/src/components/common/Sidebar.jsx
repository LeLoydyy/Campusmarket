import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { clearTokens } from "../../services/tokens.js";
import { can } from "../../utils/adminAccess.js";
import { useNotifications } from "../../context/NotificationContext.jsx";
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
    ["Growth", ["Events & Reservations", "Analytics", "Messages", "Notifications", "Premium"]],
    ["Account", ["Reviews", "Settings", "Password", "Login History"]],
  ],
  admin: [
    ["Overview", ["Dashboard", "Analytics", "Reports"]],
    ["Management", ["Registration & Users", "Stores & Plans", "Event Applications"]],
    ["Security", ["Administrators", "Login Logs"]],
    ["Operations", ["Events", "Stall Map", "Reservations", "Complaints"]],
    ["Account", ["Settings", "Password", "Login History"]],
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
  const isPremium = user?.stall_plan?.tier === "premium";
  const { unread } = useNotifications();
  // Admins only see pages their privileges open.
  const navItems = useMemo(
    () => (NAVIGATION[role] || SELLER_NAV).filter((item) => !item.permission || can(user, item.permission)),
    [role, user],
  );
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
  const profilePath = role === "seller" ? "/seller/settings" : role === "buyer" ? "/profile" : homePath;

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
            className="cm-sidebar-logo"
            aria-label="Campus Market dashboard"
          >
            {/* Same brand block on every dashboard; only the workspace name changes. */}
            <span className="cm-sidebar-logo-mark">
              <img src="/images/auth/logo-mark.png" alt="" />
            </span>
            <span className="cm-sidebar-brand-copy">
              <strong>Campus Market</strong>
              <small>{ROLE_LABELS[role] || role} workspace</small>
            </span>
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
                {group.items.map(({ to, label, icon: Icon, pro, badge }) => {
                  // Free stalls: Premium pages show a PRO badge and open the Plans page instead.
                  const locked = pro && !isPremium;
                  const count = badge === "notifications" ? unread : 0;
                  return (
                  <NavLink
                    key={to}
                    to={locked ? `/seller/plans?feature=${pro}` : to}
                    // Exact match when another link lives under this path (e.g. My Stall → Stall Branding)
                    end={to === homePath || navItems.some((item) => item.to.startsWith(`${to}/`))}
                    className={({ isActive }) =>
                      `cm-sidebar-link ${isActive && !locked ? "active" : ""}`
                    }
                  >
                    <span className="cm-sidebar-link-icon">
                      <Icon size={18} />
                    </span>
                    <span>{label}</span>
                    {locked && <b className="cm-sidebar-pro" title="Premium feature">PRO</b>}
                    {count > 0 && <b className="cm-sidebar-count" aria-label={`${count} unread`}>{count > 9 ? "9+" : count}</b>}
                    <i className="cm-sidebar-active-dot" />
                  </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="cm-sidebar-footer">
          <div className="cm-sidebar-secure-note">
            <ShieldCheck size={15} />
            <span>
              <strong>{role === "admin" && user?.shift?.ends_at ? "On duty" : "Secure workspace"}</strong>
              <small>
                {role !== "admin" ? "Your account data is protected"
                  : user?.shift?.ends_at ? `Shift ends ${new Date(user.shift.ends_at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}`
                    : "Campus Market administration"}
              </small>
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
