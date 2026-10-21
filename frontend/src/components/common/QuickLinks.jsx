import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotifications } from "../../context/NotificationContext.jsx";
import { can } from "../../utils/adminAccess.js";
import { ADMIN_NAV, SELLER_NAV } from "../../config/navigation.js";

// Short tile labels for a 4-across phone grid.
const SHORT = {
  "Stall Branding": "Branding",
  "Point of Sale": "POS",
  "Events & Reservations": "Events",
  Notifications: "Alerts",
  "Registration & Users": "Users",
  "Stores & Plans": "Stores",
  "Event Applications": "Applications",
  Administrators: "Admins",
  "Login Logs": "Logs",
};
// The dashboard itself and account pages (in the profile menu) don't need a tile.
const SKIP = new Set(["/seller", "/admin", "/account/password", "/account/logins"]);
// Tiles grouped by job, so a phone user scans a short labelled row instead of 12 loose icons.
const SELLER_GROUPS = [
  { title: "Sell", paths: ["/seller/orders", "/seller/pos", "/seller/messages", "/notifications"] },
  { title: "Your stall", paths: ["/seller/products", "/seller/stall", "/seller/stall/branding", "/seller/reservations"] },
  { title: "Grow & account", paths: ["/seller/analytics", "/seller/reviews", "/seller/plans", "/seller/settings"] },
];

const ADMIN_GROUPS = [
  { title: "Approvals", paths: ["/admin/users", "/admin/stalls", "/admin/applications", "/admin/events"] },
  { title: "Security", paths: ["/admin/admins", "/admin/logs"] },
];

/** Splits nav items into the groups above; anything unlisted lands in a trailing "More" group. */
const groupItems = (items, groups) => {
  const byPath = new Map(items.map((item) => [item.to, item]));
  const result = groups.map(({ title, paths }) => ({ title, items: paths.map((to) => byPath.get(to)).filter(Boolean) }));
  const listed = new Set(groups.flatMap((group) => group.paths));
  const rest = items.filter((item) => !listed.has(item.to));
  if (rest.length) result.push({ title: "More", items: rest });
  return result.filter((group) => group.items.length);
};

/**
 * Every workspace page as a grid of tiles, built from the same list as the sidebar
 * (same PRO locks and admin privileges). Shown on phones, where the sidebar hides behind the menu.
 */
export default function QuickLinks({ counts = {} }) {
  const { user } = useAuth();
  const { unread } = useNotifications();
  const isPremium = user?.stall_plan?.tier === "premium";
  const groups = useMemo(() => {
    const isAdmin = user?.role === "admin";
    const items = (isAdmin ? ADMIN_NAV : SELLER_NAV)
      .filter((item) => !SKIP.has(item.to) && (!item.permission || can(user, item.permission)));
    return groupItems(items, isAdmin ? ADMIN_GROUPS : SELLER_GROUPS);
  }, [user]);

  return (
    <nav className="cm-quick" aria-label="Workspace shortcuts">
      {groups.map(({ title, items }) => (
        <div className="cm-quick-group" key={title || "all"}>
          {title && <h3 className="cm-quick-title">{title}</h3>}
          <ul>
            {items.map(({ to, label, icon: Icon, pro, badge }) => {
              const locked = pro && !isPremium;
              const count = badge === "notifications" ? unread : Number(counts[to] || 0);
              return (
                <li key={to}>
                  <Link to={locked ? `/seller/plans?feature=${pro}` : to} aria-label={`${label}${locked ? " (Premium)" : ""}${count ? `, ${count} new` : ""}`}>
                    <span className="cm-quick-icon" aria-hidden="true">
                      <Icon />
                      {count > 0 && <b>{count > 9 ? "9+" : count}</b>}
                      {locked && <em>PRO</em>}
                    </span>
                    <span className="cm-quick-label" aria-hidden="true">{SHORT[label] || label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
