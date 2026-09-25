import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext.jsx";
import notificationService from "../services/notificationService.js";
import OrderNotificationCard from "../components/notifications/OrderNotificationCard.jsx";

const NotificationContext = createContext(null);

const POLL_VISIBLE_MS = 20000;
const POLL_HIDDEN_MS = 60000;
const MAX_POPUPS = 3;

const systemSupported = () => typeof window !== "undefined" && "Notification" in window;

// Phones (Android Chrome) can only show system notifications through a service worker.
let registration = null;
const getRegistration = async () => {
  if (registration || !("serviceWorker" in navigator)) return registration;
  try {
    await navigator.serviceWorker.register("/notifications-sw.js");
    registration = await navigator.serviceWorker.ready; // showNotification needs an active worker
  } catch {
    registration = null;
  }
  return registration;
};

const showSystemNotification = async (notification) => {
  if (!systemSupported() || Notification.permission !== "granted") return;
  const options = {
    body: notification.body,
    icon: notification.order?.first_item?.image_url
      ? new URL(notification.order.first_item.image_url, window.location.origin).href
      : "/images/buyer/campusmarket-logo.png",
    badge: "/images/buyer/campusmarket-logo.png",
    // One entry per order in the tray: a new stage replaces the previous one.
    tag: notification.order_id ? `order-${notification.order_id}` : notification.id,
    renotify: true,
    data: { url: notification.link || "/notifications" },
  };
  const reg = await getRegistration();
  if (reg?.showNotification) return reg.showNotification(notification.title, options);
  try {
    const shown = new Notification(notification.title, options);
    shown.onclick = () => { window.focus(); window.location.assign(options.data.url); shown.close(); };
  } catch {
    // Some browsers only allow service-worker notifications; nothing else to do.
  }
};

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState(systemSupported() ? Notification.permission : "unsupported");
  const known = useRef(null); // ids already shown; null until the first load
  const latestId = useRef(null);
  const enabled = Boolean(user?.id && user.status === "approved" && !user.is_banned);

  const markRead = useCallback(async (notification) => {
    setNotifications((items) => items.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
    setUnread((count) => Math.max(0, count - (notification.read ? 0 : 1)));
    try { await notificationService.markRead(notification.id); } catch { /* next poll corrects the count */ }
  }, []);

  const popUp = useCallback((notification) => {
    toast.custom((t) => (
      <div className={t.visible ? "onc-toast-enter" : "onc-toast-leave"}>
        <OrderNotificationCard
          notification={notification}
          variant="toast"
          onRead={markRead}
          onOpen={(item) => { toast.dismiss(t.id); navigate(item.link || "/notifications"); }}
        />
      </div>
    ), { id: notification.id, duration: 7000 });
  }, [markRead, navigate]);

  /** Reload the list. `announce` pops up anything new since the last load. */
  const refresh = useCallback(async ({ announce = true } = {}) => {
    if (!enabled) return;
    setLoading((value) => value || known.current === null);
    try {
      const items = await notificationService.list(30);
      const fresh = known.current === null ? [] : items.filter((item) => !known.current.has(item.id) && !item.read);
      known.current = new Set(items.map((item) => item.id));
      latestId.current = items[0]?.id ?? null;
      setNotifications(items);
      setUnread(items.filter((item) => !item.read).length);
      setError("");
      if (announce) {
        fresh.slice(0, MAX_POPUPS).reverse().forEach((item) => {
          popUp(item);
          if (document.visibilityState !== "visible") showSystemNotification(item);
        });
      }
    } catch {
      setError("We couldn't load your notifications.");
    } finally {
      setLoading(false);
    }
  }, [enabled, popUp]);

  // Cheap poll; fetch the full list only when something changed.
  const poll = useCallback(async () => {
    if (!enabled) return;
    try {
      const summary = await notificationService.summary();
      setUnread(summary.unread);
      if (summary.latest_id !== latestId.current) await refresh();
    } catch { /* offline or signed out; try again next tick */ }
  }, [enabled, refresh]);

  useEffect(() => {
    known.current = null;
    latestId.current = null;
    setNotifications([]);
    setUnread(0);
    if (!enabled) return undefined;
    refresh({ announce: false });

    let timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { await poll(); schedule(); },
        document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
    };
    const onVisible = () => { if (document.visibilityState === "visible") { poll(); schedule(); } };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, poll, refresh]);

  const markAllRead = useCallback(async () => {
    setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    setUnread(0);
    await notificationService.markAllRead();
  }, []);

  const enableSystemAlerts = useCallback(async () => {
    if (!systemSupported()) return "unsupported";
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") await getRegistration();
    return result;
  }, []);

  const value = useMemo(() => ({
    notifications, unread, loading, error, permission,
    refresh, markRead, markAllRead, enableSystemAlerts,
  }), [notifications, unread, loading, error, permission, refresh, markRead, markAllRead, enableSystemAlerts]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used inside NotificationProvider");
  return context;
};
