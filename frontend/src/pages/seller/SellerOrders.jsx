import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { orderService } from "../../services/api.js";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiCopy,
  FiDownload,
  FiGrid,
  FiList,
  FiMapPin,
  FiPackage,
  FiPhone,
  FiRefreshCw,
  FiSearch,
  FiTruck,
  FiX,
} from "react-icons/fi";
import "./SellerOrders.css";
import EmptyState from "../../components/ui/EmptyState.jsx";
import HandoverDialog from "./HandoverDialog.jsx";
import ReadyTimeDialog from "./ReadyTimeDialog.jsx";
import CancelOrderDialog from "../buyer/CancelOrderDialog.jsx";
import { csvDate, downloadCsv } from "../../utils/csv.js";

const STATUS_FLOW = {
  pending: { next: "confirmed", label: "Confirm order" },
  confirmed: { next: "ready", label: "Mark as ready" },
  ready: { next: "delivered", label: "Mark delivered" },
  delivered: { next: null, label: "Completed" },
  cancelled: { next: null, label: "Cancelled" },
};

const STATUS_TABS = [
  { key: "active", label: "Needs action" },
  { key: "all", label: "All orders" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const ORDER_STEPS = ["pending", "confirmed", "ready", "delivered"];
const ACTIVE_STATUSES = ["pending", "confirmed", "ready"];
const POLL_INTERVAL_MS = 30000;
// An active order untouched this long is flagged so it doesn't get forgotten.
const STALE_AFTER_MINUTES = 30;
const VIEW_KEY = "seller-orders-view";

const readSavedView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "compact" ? "compact" : "cards";
  } catch {
    return "cards";
  }
};

const matchesTab = (order, tab) =>
  tab === "all" ||
  (tab === "active" ? ACTIVE_STATUSES.includes(order.status) : order.status === tab);

const normalizeStatus = (value) => {
  const status = String(value || "pending")
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (status === "processing") return "confirmed";
  if (status === "completed") return "delivered";
  if (status === "canceled") return "cancelled";
  return STATUS_FLOW[status] ? status : "pending";
};

const extractOrders = (payload) => {
  const value =
    payload?.data?.orders ?? payload?.orders ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const extractStatus = (payload, fallback) =>
  normalizeStatus(
    payload?.data?.order?.status ||
      payload?.order?.status ||
      payload?.data?.status ||
      payload?.status ||
      fallback,
  );

const normalizeItem = (item, index) => {
  const product = item?.products || item?.product || {};
  const quantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;
  const unitPrice =
    Number(item?.unit_price ?? item?.price ?? product.price ?? 0) || 0;

  return {
    id: item?.id || item?.order_item_id || `${product.id || "item"}-${index}`,
    name: product.name || item?.product_name || item?.name || "Product",
    image: product.image_url || item?.image_url || null,
    quantity,
    unitPrice,
    subtotal: Number(item?.subtotal) || unitPrice * quantity,
  };
};

const normalizeOrder = (order, index) => {
  const rawItems = order?.order_items || order?.items || [];
  const items = Array.isArray(rawItems)
    ? rawItems.map((item, itemIndex) => normalizeItem(item, itemIndex))
    : [];
  const buyer = order?.users || order?.buyer || order?.profiles || {};
  const computedTotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    ...order,
    id: order?.id || order?.order_id || `order-${index + 1}`,
    status: normalizeStatus(order?.status),
    createdAt: order?.created_at || order?.order_date || order?.createdAt,
    total:
      Number(order?.total ?? order?.total_amount ?? order?.grand_total) ||
      computedTotal,
    buyer: {
      name:
        buyer.name || buyer.full_name || order?.buyer_name || "Campus buyer",
      email: buyer.email || order?.buyer_email || "",
      avatar: buyer.avatar_url || buyer.profile_image || null,
    },
    items,
    notes: order?.delivery_notes || order?.notes || order?.customer_notes || "",
  };
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : format(date, "MMM d, yyyy · h:mm a");
};

const formatWaiting = (value, now) => {
  const created = new Date(value).getTime();
  if (!value || Number.isNaN(created)) return null;
  const minutes = Math.max(0, Math.floor((now - created) / 60000));
  let label;
  if (minutes < 1) label = "Just now";
  else if (minutes < 60) label = `Waiting ${minutes} min`;
  else if (minutes < 1440) label = `Waiting ${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  else label = `Waiting ${Math.floor(minutes / 1440)} day${minutes >= 2880 ? "s" : ""}`;
  return { minutes, label };
};

const summarizeItems = (items) => {
  if (!items.length) return "No item details";
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const extra = items.length > 1 ? ` +${items.length - 1} more` : "";
  return `${items[0].name}${extra} · ${units} unit${units === 1 ? "" : "s"}`;
};

function WaitingChip({ order, now }) {
  if (!ACTIVE_STATUSES.includes(order.status)) return null;
  const waiting = formatWaiting(order.createdAt, now);
  if (!waiting) return null;
  const stale = waiting.minutes >= STALE_AFTER_MINUTES;
  return (
    <span
      className={`seller-order-waiting${stale ? " is-stale" : ""}`}
      title={stale ? "This order has been waiting a while" : "Time since the order was placed"}
    >
      <FiClock /> {waiting.label}
    </span>
  );
}

function FulfillmentChip({ order }) {
  const delivery = order.fulfillment === "delivery";
  return (
    <>
      <span className="seller-order-fulfillment">
        {delivery ? <FiTruck /> : <FiMapPin />} {delivery ? "Campus delivery" : "Pickup"}
      </span>
      <ReadyChip order={order} />
    </>
  );
}

/** The time promised when confirming; flagged once it has passed and the order isn't ready yet. */
function ReadyChip({ order }) {
  if (!order.ready_by || !["confirmed", "preparing", "ready"].includes(order.status)) return null;
  const late = order.status !== "ready" && Date.parse(order.ready_by) < Date.now();
  return (
    <span className={`seller-order-ready-by${late ? " is-late" : ""}`} title="The ready time you gave the buyer">
      <FiClock aria-hidden="true" /> {late ? "Was due" : "Ready by"} {format(new Date(order.ready_by), "h:mm a")}
    </span>
  );
}

const getOrderCode = (id) =>
  String(id || "")
    .slice(0, 8)
    .toUpperCase();

function OrderProgress({ status, reason }) {
  if (status === "cancelled") {
    return (
      <div className="seller-order-cancelled">
        <span><FiX /> Order cancelled</span>
        {reason && <p><strong>Reason:</strong> {reason}</p>}
      </div>
    );
  }

  const currentIndex = ORDER_STEPS.indexOf(status);
  return (
    <div
      className="seller-order-progress"
      aria-label={`Order status: ${status}`}
    >
      {ORDER_STEPS.map((step, index) => (
        <div
          key={step}
          className={`${index <= currentIndex ? "complete" : ""} ${index === currentIndex ? "current" : ""}`}
        >
          <span>{index < currentIndex ? <FiCheck /> : index + 1}</span>
          <small>{step}</small>
        </div>
      ))}
    </div>
  );
}

/** Pickup orders placed with a code need the buyer's code to be handed over. */
const needsPickupCode = (order) => order.fulfillment !== "delivery" && order.has_pickup_code;

function OrderActions({ order, updating, onAdvance, onCancel, compact = false }) {
  const flow = STATUS_FLOW[order.status] || STATUS_FLOW.delivered;
  if (!flow.next) return null;
  return (
    <>
      {order.status === "pending" && (
        <button
          type="button"
          className="seller-order-cancel-button"
          onClick={onCancel}
          disabled={updating}
          aria-label={compact ? `Cancel order #${getOrderCode(order.id)}` : undefined}
          title={compact ? "Cancel order" : undefined}
        >
          {compact ? <FiX /> : "Cancel order"}
        </button>
      )}
      <button
        type="button"
        className="seller-order-next-button"
        onClick={() => onAdvance(flow.next)}
        disabled={updating}
      >
        {updating ? <span className="seller-orders-mini-spinner" />
          : order.status === "ready" && needsPickupCode(order) ? "Hand over (code)" : flow.label}
      </button>
    </>
  );
}

function OrderRow({ order, now, isNew, updating, onAdvance, onCancel }) {
  return (
    <article className={`seller-order-row status-${order.status}${isNew ? " is-new" : ""}`}>
      <div className="seller-order-row-main">
        <strong>
          #{getOrderCode(order.id)}
          {isNew && <em className="seller-order-new">New</em>}
        </strong>
        <small>{formatDate(order.createdAt)}</small>
      </div>
      <div className="seller-order-row-buyer">
        <strong>{order.buyer.name}</strong>
        <small>{order.status === "cancelled" && order.cancel_reason ? `Cancelled: ${order.cancel_reason}` : summarizeItems(order.items)}</small>
      </div>
      <div className="seller-order-row-chips">
        <span className={`seller-order-badge status-${order.status}`}>{order.status}</span>
        <WaitingChip order={order} now={now} />
      </div>
      <strong className="seller-order-row-total">{formatCurrency(order.total)}</strong>
      <div className="seller-order-row-actions">
        <OrderActions order={order} updating={updating} onAdvance={onAdvance} onCancel={onCancel} compact />
      </div>
    </article>
  );
}

function OrderCard({ order, now, isNew, updating, onAdvance, onCancel }) {
  const detailsRef = useRef(null);
  const openDetails = () => {
    detailsRef.current.open = true;
    detailsRef.current.querySelector("summary").focus();
  };
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      toast.success("Order reference copied");
    } catch {
      toast.error("Couldn't copy the reference");
    }
  };

  return (
    <article className={`seller-order-card status-${order.status}${isNew ? " is-new" : ""}`}>
      <header className="seller-order-card-header">
        <div>
          <span>Order {isNew && <em className="seller-order-new">New</em>}</span>
          <h2>#{getOrderCode(order.id)}</h2>
          <p>{formatDate(order.createdAt)}</p>
          <div className="seller-order-chips">
            <WaitingChip order={order} now={now} />
            <FulfillmentChip order={order} />
          </div>
        </div>
        <div>
          <span className={`seller-order-badge status-${order.status}`}>
            {order.status}
          </span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>
      </header>

      <OrderProgress status={order.status} reason={order.cancel_reason} />

      <div className="seller-order-buyer">
        <div className="seller-order-avatar">
          {order.buyer.avatar ? (
            <img src={order.buyer.avatar} alt="" />
          ) : (
            <span>{order.buyer.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div>
          <small>Buyer</small>
          <strong>{order.buyer.name}</strong>
          {order.buyer.email && <p>{order.buyer.email}</p>}
        </div>
        {order.notes && (
          <button type="button" className="seller-order-note-flag" onClick={openDetails}>
            Buyer note
          </button>
        )}
      </div>

      <div className="seller-order-items">
        <div className="seller-order-items-heading">
          <span>Items <small>Click a product to view order details</small></span>
          <small>
            {order.items.length} line item{order.items.length === 1 ? "" : "s"}
          </small>
        </div>

        {order.items.length === 0 ? (
          <p className="seller-order-items-missing">
            Item information is unavailable.
          </p>
        ) : (
          order.items.map((item) => (
            <button type="button" key={item.id} className="seller-order-item" onClick={openDetails} aria-label={`View order details and buyer notes for ${item.name}`}>
              <span className="seller-order-item-image">
                {item.image ? (
                  <img src={item.image} alt="" loading="lazy" />
                ) : (
                  <FiPackage />
                )}
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>
                  {formatCurrency(item.unitPrice)} × {item.quantity}
                </small>
              </span>
              <strong>{formatCurrency(item.subtotal)}</strong>
            </button>
          ))
        )}
      </div>

      <details ref={detailsRef} className="seller-order-details">
        <summary>Order details <span>{order.notes ? "Buyer note attached" : "View details"}</span></summary>
        <div className="seller-order-notes">
          <span>Buyer note</span>
          <p>{order.notes || "The buyer did not add a note to this order."}</p>
        </div>
        <dl>
          <dt>Order reference</dt>
          <dd className="seller-order-reference">
            <code>{order.id}</code>
            <button type="button" onClick={copyReference} aria-label="Copy order reference" title="Copy">
              <FiCopy />
            </button>
          </dd>
          <dt>Fulfillment</dt><dd>{order.fulfillment === "delivery" ? "Campus delivery" : "Campus pickup"}</dd>
          {order.fulfillment === "delivery" && order.delivery_address && <><dt>Deliver to</dt><dd><FiMapPin aria-hidden="true" /> {order.delivery_address}</dd></>}
          {order.buyer_phone && <><dt>Buyer phone</dt><dd><a href={`tel:${order.buyer_phone.replace(/[^\d+]/g, "")}`}><FiPhone aria-hidden="true" /> {order.buyer_phone}</a></dd></>}
          <dt>Payment</dt><dd>Cash {order.fulfillment === "delivery" ? "on delivery" : "at pickup"}</dd>
        </dl>
      </details>

      {STATUS_FLOW[order.status]?.next && (
        <footer className="seller-order-card-footer">
          <OrderActions order={order} updating={updating} onAdvance={onAdvance} onCancel={onCancel} />
        </footer>
      )}
    </article>
  );
}

export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const [view, setView] = useState(readSavedView);
  const [now, setNow] = useState(() => Date.now());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());
  const knownIds = useRef(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [updatingId, setUpdatingId] = useState(null);
  const [handover, setHandover] = useState(null); // { order, status, error }
  const [confirming, setConfirming] = useState(null); // order waiting for a ready time
  const [cancelling, setCancelling] = useState(null); // order waiting for a reason

  const fetchOrders = useCallback(async ({ quiet = false } = {}) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const { data } = await orderService.getSellerOrders({});
      const next = extractOrders(data).map(normalizeOrder);
      // Anything not seen since the page opened is a new order.
      if (knownIds.current) {
        const arrived = next.filter((order) => !knownIds.current.has(order.id));
        if (arrived.length) {
          toast.success(
            arrived.length === 1
              ? `New order #${getOrderCode(arrived[0].id)} from ${arrived[0].buyer.name}`
              : `${arrived.length} new orders arrived`,
          );
          setNewIds((current) => new Set([...current, ...arrived.map((order) => order.id)]));
        }
      }
      knownIds.current = new Set(next.map((order) => order.id));
      setOrders(next);
      setLastUpdated(new Date());
      setNow(Date.now());
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "We couldn't load your orders. Please try again.",
      );
      if (!quiet) setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Live queue: refresh quietly while the tab is visible, and keep waiting times ticking.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") fetchOrders({ quiet: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  const changeView = (value) => {
    setView(value);
    try {
      localStorage.setItem(VIEW_KEY, value);
    } catch {
      // The preference just won't be remembered.
    }
  };

  const tabCounts = useMemo(
    () =>
      STATUS_TABS.reduce((counts, tab) => {
        counts[tab.key] = orders.filter((order) => matchesTab(order, tab.key)).length;
        return counts;
      }, {}),
    [orders],
  );

  const displayedOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = orders.filter((order) => {
      const matchesStatus = matchesTab(order, activeTab);
      const haystack = [
        order.id,
        order.buyer.name,
        order.buyer.email,
        ...order.items.map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "oldest")
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === "total-high") return b.total - a.total;
      if (sortBy === "total-low") return a.total - b.total;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [activeTab, orders, search, sortBy]);

  const summary = useMemo(
    () => ({
      pending: orders.filter((order) => order.status === "pending").length,
      stalePending: orders.filter(
        (order) =>
          order.status === "pending" &&
          (formatWaiting(order.createdAt, now)?.minutes ?? 0) >= STALE_AFTER_MINUTES,
      ).length,
      processing: orders.filter((order) =>
        ["confirmed", "ready"].includes(order.status),
      ).length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      revenue: orders
        .filter((order) => order.status === "delivered")
        .reduce((sum, order) => sum + order.total, 0),
    }),
    [now, orders],
  );

  // Some steps ask the seller something first: a pickup code, a ready time, or a reason to cancel.
  const handleStatusUpdate = async (order, newStatus, pickupCode, extra = {}) => {
    if (["completed", "delivered"].includes(newStatus) && needsPickupCode(order) && !pickupCode) {
      setHandover({ order, status: newStatus, error: "" });
      return;
    }
    if (newStatus === "cancelled" && !extra.cancel_reason) {
      setCancelling(order);
      return;
    }
    if (newStatus === "confirmed" && !("ready_in_minutes" in extra)) {
      setConfirming(order);
      return;
    }

    try {
      setUpdatingId(order.id);
      const { data } = await orderService.updateStatus(order.id, newStatus, extra.cancel_reason, {
        ...(pickupCode ? { pickup_code: pickupCode } : {}),
        ...(extra.ready_in_minutes ? { ready_in_minutes: extra.ready_in_minutes } : {}),
      });
      const savedStatus = extractStatus(data, newStatus);
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? { ...item, status: savedStatus, ready_by: data?.ready_by ?? item.ready_by, cancel_reason: data?.cancel_reason ?? item.cancel_reason }
            : item,
        ),
      );
      setConfirming(null);
      setCancelling(null);
      setNewIds((current) => {
        if (!current.has(order.id)) return current;
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
      toast.success(pickupCode ? "Code matched. Order handed over." : `Order marked as ${savedStatus.replace(/-/g, " ")}`);
      if (pickupCode) setHandover(null);
    } catch (requestError) {
      if (pickupCode) {
        setHandover((current) => current && { ...current, error: requestError.response?.data?.error || "Couldn't check the code." });
        return;
      }
      toast.error(
        requestError.response?.data?.error || "Failed to update order",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(`campus-market-orders-${csvDate()}.csv`,
      ["Order", "Placed", "Buyer", "Buyer phone", "Items", "Units", "Total (PHP)", "Status", "Fulfillment", "Deliver to", "Payment", "Cancel reason"],
      orders.map((order) => [
        getOrderCode(order.id),
        order.createdAt ? format(new Date(order.createdAt), "yyyy-MM-dd HH:mm") : "",
        order.buyer.name,
        order.buyer_phone || "",
        order.items.map((item) => `${item.quantity} × ${item.name}`).join("; "),
        order.items.reduce((sum, item) => sum + item.quantity, 0),
        Number(order.total).toFixed(2),
        order.status,
        order.fulfillment === "delivery" ? "Delivery" : "Pickup",
        order.delivery_address || "",
        order.fulfillment === "delivery" ? "Cash on delivery" : "Cash at pickup",
        order.cancel_reason || "",
      ]));
    toast.success(`Exported ${orders.length} order${orders.length === 1 ? "" : "s"}`);
  };

  const showTab = (tab) => {
    setSearch("");
    setActiveTab(tab);
  };
  const clearFilters = () => showTab("all");

  return (
    <div className="dashboard-layout seller-orders-shell">
      <Sidebar />

      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Orders</h1>
              <p>Review, prepare, and complete incoming buyer orders.</p>
            </div>
          </div>
          <div className="seller-orders-topbar-actions">
            {lastUpdated && (
              <span className="seller-orders-live" title="Orders refresh automatically every 30 seconds">
                <i aria-hidden="true" /> Live · updated {format(lastUpdated, "h:mm a")}
              </span>
            )}
            <button
              type="button"
              className="seller-orders-refresh"
              onClick={exportCsv}
              disabled={loading || !orders.length}
              title="Download all orders as a spreadsheet (CSV)"
            >
              <FiDownload /> Export CSV
            </button>
            <button
              type="button"
              className="seller-orders-refresh"
              onClick={() => fetchOrders({ quiet: true })}
              disabled={loading || refreshing}
            >
              <FiRefreshCw className={refreshing ? "is-spinning" : ""} /> Refresh
            </button>
          </div>
        </header>

        <div className="dashboard-content seller-orders-content">
          {error && (
            <div className="seller-orders-error" role="alert">
              <FiAlertCircle />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => fetchOrders({ quiet: true })}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && summary.pending > 0 && activeTab !== "pending" && (
            <div className={`seller-orders-alert${summary.stalePending ? " is-urgent" : ""}`} role="status">
              <span className="seller-orders-alert-icon"><FiClock /></span>
              <div>
                <strong>
                  {summary.pending} order{summary.pending === 1 ? " is" : "s are"} waiting for you to confirm
                </strong>
                <p>
                  {summary.stalePending
                    ? `${summary.stalePending} ${summary.stalePending === 1 ? "has" : "have"} been waiting over ${STALE_AFTER_MINUTES} minutes. Buyers can't pick up until you confirm.`
                    : "Confirm quickly so buyers know their order is being prepared."}
                </p>
              </div>
              <button type="button" onClick={() => showTab("pending")}>
                Review pending <FiArrowRight />
              </button>
            </div>
          )}

          <section className="seller-orders-summary" aria-label="Order summary">
            <button
              type="button"
              className={activeTab === "pending" ? "is-selected" : ""}
              onClick={() => showTab("pending")}
              disabled={loading}
            >
              <span className="tone-gold">
                <FiClock />
              </span>
              <div>
                <small>Pending</small>
                <strong>{loading ? "—" : summary.pending}</strong>
              </div>
            </button>
            <button
              type="button"
              className={activeTab === "active" ? "is-selected" : ""}
              onClick={() => showTab("active")}
              disabled={loading}
            >
              <span className="tone-blue">
                <FiPackage />
              </span>
              <div>
                <small>In progress</small>
                <strong>{loading ? "—" : summary.processing}</strong>
              </div>
            </button>
            <button
              type="button"
              className={activeTab === "delivered" ? "is-selected" : ""}
              onClick={() => showTab("delivered")}
              disabled={loading}
            >
              <span className="tone-green">
                <FiCheckCircle />
              </span>
              <div>
                <small>Delivered</small>
                <strong>{loading ? "—" : summary.delivered}</strong>
              </div>
            </button>
            <article>
              <span className="tone-dark">₱</span>
              <div>
                <small>Completed revenue</small>
                <strong>
                  {loading ? "—" : formatCurrency(summary.revenue)}
                </strong>
              </div>
            </article>
          </section>

          {!loading && orders.length > 0 && (
            <section
              className="seller-orders-controls"
              aria-label="Order filters"
            >
              <div className="seller-orders-tabs">
                {STATUS_TABS.map((tab) => (
                  <button
                    type="button"
                    key={tab.key}
                    className={activeTab === tab.key ? "active" : ""}
                    onClick={() => setActiveTab(tab.key)}
                    aria-pressed={activeTab === tab.key}
                  >
                    {tab.label} <span>{tabCounts[tab.key] || 0}</span>
                  </button>
                ))}
              </div>

              <div className="seller-orders-filter-row">
                <label className="seller-orders-search">
                  <FiSearch />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search order, buyer, or product"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <FiX />
                    </button>
                  )}
                </label>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  aria-label="Sort orders"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="total-high">Highest total</option>
                  <option value="total-low">Lowest total</option>
                </select>
                <div className="seller-orders-view-toggle" role="group" aria-label="Layout">
                  <button
                    type="button"
                    className={view === "cards" ? "active" : ""}
                    aria-pressed={view === "cards"}
                    onClick={() => changeView("cards")}
                    title="Detailed cards"
                  >
                    <FiGrid /> Cards
                  </button>
                  <button
                    type="button"
                    className={view === "compact" ? "active" : ""}
                    aria-pressed={view === "compact"}
                    onClick={() => changeView("compact")}
                    title="Compact list"
                  >
                    <FiList /> Compact
                  </button>
                </div>
              </div>
            </section>
          )}

          {loading ? (
            <div className="seller-orders-skeleton" aria-label="Loading orders">
              {Array.from({ length: 3 }).map((_, index) => (
                <i key={index} />
              ))}
            </div>
          ) : error && orders.length === 0 ? null : orders.length === 0 ? (
            <EmptyState
              illustration="bag"
              title="No orders yet"
              description="Orders placed by campus buyers will appear here automatically. Keep your listings stocked so they can find you."
              action={{ label: "Manage products", to: "/seller/products" }}
            />
          ) : displayedOrders.length === 0 && activeTab === "active" && !search ? (
            <EmptyState
              compact
              illustration="box"
              title="You're all caught up"
              description="No orders need action right now. New orders will show up here automatically."
              action={{ label: "View all orders", onClick: clearFilters }}
            />
          ) : displayedOrders.length === 0 ? (
            <EmptyState compact illustration="search" title="No matching orders" description="Try another search or return to all order statuses." action={{ label: "Clear filters", onClick: clearFilters }} />
          ) : (
            <section>
              <div className="seller-orders-heading">
                <div>
                  <small>Order queue</small>
                  <h2>
                    {displayedOrders.length} order
                    {displayedOrders.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <p>Process orders from oldest to newest when possible.</p>
              </div>
              <div className={`seller-orders-list${view === "compact" ? " is-compact" : ""}`}>
                {displayedOrders.map((order) => {
                  const Item = view === "compact" ? OrderRow : OrderCard;
                  return (
                    <Item
                      key={order.id}
                      order={order}
                      now={now}
                      isNew={newIds.has(order.id)}
                      updating={updatingId === order.id}
                      onAdvance={(status) => handleStatusUpdate(order, status)}
                      onCancel={() => handleStatusUpdate(order, "cancelled")}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
      {confirming && (
        <ReadyTimeDialog
          orderCode={getOrderCode(confirming.id)}
          submitting={updatingId === confirming.id}
          onConfirm={(minutes) => handleStatusUpdate(confirming, "confirmed", null, { ready_in_minutes: minutes })}
          onClose={() => setConfirming(null)}
        />
      )}
      {cancelling && (
        <CancelOrderDialog
          audience="seller"
          orderReference={getOrderCode(cancelling.id)}
          submitting={updatingId === cancelling.id}
          onConfirm={(reason) => handleStatusUpdate(cancelling, "cancelled", null, { cancel_reason: reason })}
          onClose={() => setCancelling(null)}
        />
      )}
      {handover && (
        <HandoverDialog
          orderCode={getOrderCode(handover.order.id)}
          buyerName={handover.order.buyer.name}
          submitting={updatingId === handover.order.id}
          error={handover.error}
          onConfirm={(code) => handleStatusUpdate(handover.order, handover.status, code)}
          onClose={() => setHandover(null)}
        />
      )}
    </div>
  );
}
