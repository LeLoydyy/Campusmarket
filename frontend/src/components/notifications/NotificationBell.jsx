import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiBell } from "react-icons/fi";
import { useNotifications } from "../../context/NotificationContext.jsx";
import OrderNotificationCard from "./OrderNotificationCard.jsx";
import "./notifications.css";

const DESKTOP = "(min-width: 769px)";

/** Navbar bell: unread badge; a dropdown of recent updates on PC, the full page on phones. */
export default function NotificationBell() {
  const { notifications, unread, markRead, markAllRead, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!wrapper.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const handleClick = () => {
    if (!window.matchMedia(DESKTOP).matches) return navigate("/notifications");
    setOpen((value) => {
      if (!value) refresh({ announce: false });
      return !value;
    });
  };

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div className="notif-bell" ref={wrapper}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        title="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleClick}
      >
        <FiBell />
        {unread > 0 && <span className="notif-bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <section className="notif-panel" role="dialog" aria-label="Recent notifications">
          <header>
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" onClick={() => markAllRead().catch(() => {})}>Mark all as read</button>}
          </header>
          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <p className="notif-panel-empty">No updates yet. Your order progress will show up here.</p>
            ) : (
              notifications.slice(0, 6).map((notification) => (
                <OrderNotificationCard
                  key={notification.id}
                  notification={notification}
                  onRead={markRead}
                  onOpen={() => setOpen(false)}
                />
              ))
            )}
          </div>
          <footer>
            <Link to="/notifications" onClick={() => setOpen(false)}>See all notifications</Link>
          </footer>
        </section>
      )}
    </div>
  );
}
