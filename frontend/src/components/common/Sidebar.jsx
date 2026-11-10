import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Menu, MessageSquare, Package, ShieldCheck, Store, Users, X } from "lucide-react";
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
    // Same groups as the dashboard shortcut tiles (QuickLinks), so both menus read alike.
    ["Sell", ["Dashboard", "Orders", "Point of Sale", "Messages", "Notifications"]],
    ["Your stall", ["Products", "My Stall", "Stall Branding", "Events & Reservations"]],
    ["Grow & account", ["Analytics", "Reviews", "Premium", "Settings", "Password", "Login History"]],
  ],
  // Same groups as the admin dashboard shortcut tiles.
  admin: [
    ["Overview", ["Dashboard"]],
    ["Approvals", ["Registration & Users", "Stores & Plans", "Event Applications", "Events"]],
    ["Security", ["Administrators", "Login Logs"]],
    ["Account", ["Password", "Login History"]],
  ],
  buyer: [["Marketplace", []]],
};

// Bottom bar on phones: the four most used pages per role, plus "More" for the full menu.
const TABS = {
  seller: [
    { to: "/seller", label: "Home", icon: LayoutDashboard, end: true },
    { to: "/seller/orders", label: "Orders", icon: ClipboardList },
    { to: "/seller/products", label: "Products", icon: Package },
    { to: "/seller/messages", label: "Messages", icon: MessageSquare },
  ],
  admin: [
    { to: "/admin", label: "Home", icon: LayoutDashboard, end: true },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/stalls", label: "Stores", icon: Store },
    { to: "/admin/events", label: "Events", icon: CalendarDays },
  ],
};

const getInitials = (value) =>
  String(value || "CM")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function Sidebar({ open, isOpen: legacyOpen, onClose, hideTabbar = false }) {
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

  // An open chat needs the bottom of the screen for its message box, so it hides the bar (and shows the menu button).
  const tabs = TABS[role];
  const showTabbar = Boolean(tabs) && !hideTabbar;
  useEffect(() => {
    if (!showTabbar) return undefined;
    document.body.classList.add("has-workspace-tabbar");
    return () => document.body.classList.remove("has-workspace-tabbar");
  }, [showTabbar]);

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
      {showTabbar ? (
        <nav className="cm-seller-tabbar" aria-label={`${ROLE_LABELS[role] || role} quick navigation`}>
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `cm-seller-tab ${isActive ? "is-active" : ""}`}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
          <button type="button" className={`cm-seller-tab ${isOpen ? "is-active" : ""}`} onClick={() => setInternalOpen(true)} aria-expanded={isOpen} aria-label={`More pages${unread ? `, ${unread} unread notifications` : ""}`}>
            <span className="cm-seller-tab-icon">
              <Menu aria-hidden="true" />
              {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
            </span>
            <span>More</span>
          </button>
        </nav>
      ) : (
        <button
          type="button"
          className="cm-sidebar-mobile-trigger"
          onClick={() => setInternalOpen(true)}
          aria-label="Open navigation"
          aria-expanded={isOpen}
        >
          <Menu size={20} />
        </button>
      )}

      <aside className={`cm-sidebar cm-sidebar--${role} ${isOpen ? "cm-sidebar--open" : ""}`}>
        <div className="cm-sidebar-brand">
          <Link
            to={homePath}
            className="cm-sidebar-logo"
            aria-label="Campus Market dashboard"
          >
            {/* Same brand block on every dashboard; only the workspace name changes. */}
            <span className="cm-sidebar-logo-mark">
              <img src="/images/buyer/campusmarket-icon.png" alt="" />
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
