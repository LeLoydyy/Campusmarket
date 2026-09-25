import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellRing, CheckCheck, ChevronRight, Inbox, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import Navbar from "../../components/common/Navbar.jsx";
import OrderNotificationCard from "../../components/notifications/OrderNotificationCard.jsx";
import { useNotifications } from "../../context/NotificationContext.jsx";

const FINISHED = new Set(["completed", "delivered", "cancelled"]);

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "active", label: "Active orders" },
];

export default function Notifications() {
  const { notifications, unread, loading, error, permission, refresh, markRead, markAllRead, enableSystemAlerts } = useNotifications();
  const [filter, setFilter] = useState("all");
  const [markingAll, setMarkingAll] = useState(false);

  // Opening the page is a good moment to catch up without waiting for the next poll.
  useEffect(() => { refresh({ announce: false }); }, [refresh]);

  const counts = useMemo(() => ({
    all: notifications.length,
    unread: notifications.filter((item) => !item.read).length,
    active: notifications.filter((item) => item.order && !FINISHED.has(item.order.status)).length,
  }), [notifications]);

  const visible = useMemo(() => {
    if (filter === "unread") return notifications.filter((item) => !item.read);
    if (filter === "active") return notifications.filter((item) => item.order && !FINISHED.has(item.order.status));
    return notifications;
  }, [filter, notifications]);

  const handleMarkAll = async () => {
    if (!unread || markingAll) return;
    try {
      setMarkingAll(true);
      await markAllRead();
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Could not update notifications");
    } finally {
      setMarkingAll(false);
    }
  };

  const handleEnableAlerts = async () => {
    const result = await enableSystemAlerts();
    if (result === "granted") toast.success("Order alerts are on for this device");
    else if (result === "denied") toast.error("Alerts are blocked. Allow notifications for this site in your browser settings.");
  };

  return (
    <div className="notifications-shell">
      <Navbar />

      <main className="notifications-page">
        <header className="notifications-header">
          <div className="notifications-title-wrap">
            <span className="notifications-title-icon" aria-hidden="true">
              <Bell />
              {unread > 0 && <i />}
            </span>
            <div>
              <span className="notifications-eyebrow">Your activity</span>
              <h1>Notifications</h1>
              <p>
                {loading && notifications.length === 0
                  ? "Checking for updates…"
                  : unread > 0
                    ? `${unread} unread ${unread === 1 ? "update" : "updates"}`
                    : "You're all caught up"}
              </p>
            </div>
          </div>

          {unread > 0 && (
            <button type="button" className="notifications-read-all" onClick={handleMarkAll} disabled={markingAll}>
              {markingAll ? <span className="spinner notifications-action-spinner" /> : <CheckCheck />}
              {markingAll ? "Updating…" : "Mark all as read"}
            </button>
          )}
        </header>

        {permission === "default" && (
          <section className="notifications-alerts-banner">
            <BellRing aria-hidden="true" />
            <div>
              <strong>Get order alerts on this device</strong>
              <p>See when your order is confirmed or ready, even while you're in another tab or app.</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleEnableAlerts}>Turn on alerts</button>
          </section>
        )}

        {notifications.length > 0 && (
          <nav className="notifications-filters" aria-label="Notification filters">
            {FILTERS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={filter === option.value ? "active" : ""}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span>{counts[option.value]}</span>
              </button>
            ))}
          </nav>
        )}

        {loading && notifications.length === 0 ? (
          <NotificationSkeleton />
        ) : error && notifications.length === 0 ? (
          <section className="notification-state is-error" role="alert">
            <span><XCircle /></span>
            <h2>Notifications unavailable</h2>
            <p>{error}</p>
            <button type="button" className="btn btn-outline" onClick={() => refresh({ announce: false })}>Try again</button>
          </section>
        ) : notifications.length === 0 ? (
          <section className="notification-state">
            <div className="notification-empty-art" aria-hidden="true">
              <span><Bell /></span>
              <i><CheckCheck /></i>
            </div>
            <span className="notifications-eyebrow">Nothing new</span>
            <h2>You're all caught up</h2>
            <p>When you order from a stall, you'll follow every step here — from confirmed to ready for pickup.</p>
            <Link to="/browse" className="btn btn-primary btn-lg">
              Explore the market <ChevronRight size={17} />
            </Link>
          </section>
        ) : visible.length === 0 ? (
          <section className="notification-state compact">
            <span><Inbox /></span>
            <h2>No notifications in this view</h2>
            <p>Choose another filter to see your other updates.</p>
            <button type="button" className="btn btn-outline" onClick={() => setFilter("all")}>View all notifications</button>
          </section>
        ) : (
          <section className="notification-card-list" aria-live="polite">
            {visible.map((notification, index) => (
              <OrderNotificationCard
                key={notification.id}
                notification={notification}
                defaultExpanded={index === 0 && !notification.read}
                onRead={markRead}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="notification-skeleton-list" aria-label="Loading notifications">
      {[0, 1, 2, 3].map((item) => (
        <div key={item}>
          <span className="skeleton" />
          <div>
            <i className="skeleton" />
            <i className="skeleton" />
            <i className="skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}
