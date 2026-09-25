import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import OrderStepper from "../../components/ui/OrderStepper.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { orderService } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import "./Orders.css";

const FILTERS = [
  { value: "all", label: "All orders" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ACTIVE_STATUSES = new Set([
  "pending",
  "confirmed",
  "processing",
  "preparing",
  "ready",
  "ready-for-pickup",
  "out-for-delivery",
]);

const formatPrice = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalizeStatus = (status) =>
  String(status || "pending")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

const formatStatus = (status) =>
  normalizeStatus(status)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatDate = (date) => {
  if (!date) return "Date unavailable";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";

  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getOrderItems = (order) => {
  const items = order.order_items || order.items || order.orderItems;
  if (Array.isArray(items) && items.length) return items;

  if (order.productName || order.products || order.product) return [order];
  return [];
};

const getProduct = (item) => item.products || item.product || item;

const getItemPrice = (item) => {
  const product = getProduct(item);
  return Number(item.unit_price ?? item.price ?? product.price ?? 0);
};

const getOrderTotal = (order) => {
  const savedTotal = order.total_amount ?? order.total ?? order.total_price;
  if (savedTotal !== undefined && savedTotal !== null)
    return Number(savedTotal);

  return getOrderItems(order).reduce(
    (sum, item) => sum + getItemPrice(item) * Number(item.quantity || 1),
    0,
  );
};

const getOrderReference = (order) => {
  const rawId = String(
    order.order_number || order.reference || order.id || "Order",
  );
  return rawId.length > 12 ? `…${rawId.slice(-8)}` : rawId;
};

const getStallName = (order, items) =>
  order.stalls?.name ||
  order.stall?.name ||
  getProduct(items[0] || {}).stalls?.name ||
  "Campus seller";

const matchesFilter = (order, filter) => {
  if (filter === "all") return true;
  const status = normalizeStatus(order.status);
  if (filter === "active") return ACTIVE_STATUSES.has(status);
  if (filter === "completed") return status === "completed" || status === "delivered";
  if (filter === "cancelled")
    return status === "cancelled" || status === "canceled";
  return status === filter;
};

const getStatusIcon = (status) => {
  const normalized = normalizeStatus(status);
  if (normalized === "completed" || normalized === "delivered") return <CheckCircle2 aria-hidden="true" />;
  if (normalized === "cancelled" || normalized === "canceled") {
    return <XCircle aria-hidden="true" />;
  }
  if (normalized === "ready" || normalized === "ready-for-pickup") {
    return <Package aria-hidden="true" />;
  }
  return <Clock3 aria-hidden="true" />;
};

export default function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedOrders, setExpandedOrders] = useState({});
  const [cancellingId, setCancellingId] = useState(null);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchOrders = useCallback(
    async ({ background = false } = {}) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        background ? setRefreshing(true) : setLoading(true);
        setError("");

        // Buyer identity comes from the access token on the backend.
        const { data } = await orderService.getBuyerOrders();
        const nextOrders = Array.isArray(data)
          ? data
          : data?.data || data?.orders || [];

        setOrders(Array.isArray(nextOrders) ? nextOrders : []);
      } catch (requestError) {
        setError(
          requestError.response?.data?.error ||
            requestError.message ||
            "We could not load your orders.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const cancelOrder = async (order) => {
    if (cancellingId || !window.confirm(`Cancel order #${getOrderReference(order)}? All items in this order will be cancelled.`)) return;
    setCancellingId(order.id);
    try {
      await orderService.updateStatus(order.id, "cancelled");
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: "cancelled", can_cancel: false } : item));
      toast.success("Order cancelled. You can browse for another item.");
    } catch (requestError) {
      toast.error(requestError.response?.data?.error || "Could not cancel this order. Please try again.");
      await fetchOrders({ background: true });
    } finally {
      setCancellingId(null);
    }
  };

  const counts = useMemo(() => {
    const active = orders.filter((order) =>
      matchesFilter(order, "active"),
    ).length;
    const completed = orders.filter((order) =>
      matchesFilter(order, "completed"),
    ).length;
    const cancelled = orders.filter((order) => matchesFilter(order, "cancelled")).length;
    return { all: orders.length, active, completed, cancelled };
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();

    return [...orders]
      .filter((order) => matchesFilter(order, activeFilter))
      .filter((order) => {
        if (!searchTerm) return true;
        const items = getOrderItems(order);
        const searchableText = [
          order.id,
          order.order_number,
          order.reference,
          order.status,
          getStallName(order, items),
          ...items.flatMap((item) => {
            const product = getProduct(item);
            return [product.name, item.productName];
          }),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(searchTerm);
      })
      .sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      );
  }, [activeFilter, orders, query]);

  const toggleExpanded = (orderId) => {
    setExpandedOrders((current) => ({
      ...current,
      [orderId]: !current[orderId],
    }));
  };

  return (
    <div className="buyer-orders-shell">
      <Navbar />

      <main className="buyer-orders-page">
        <header className="orders-page-header">
          <div>
            <span className="orders-eyebrow">Purchase history</span>
            <h1>Your orders</h1>
            <p>
              Track active purchases and review your previous campus orders.
            </p>
          </div>
          <div className="orders-header-actions">
          <Link to="/browse" className="orders-browse-link">Browse products <ArrowRight size={16} /></Link>
          <button
            type="button"
            className="orders-refresh-btn"
            aria-label={refreshing ? "Refreshing orders" : "Refresh orders"}
            onClick={() => fetchOrders({ background: true })}
            disabled={loading || refreshing}
          >
            <RefreshCw className={refreshing ? "is-spinning" : ""} size={15} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          </div>
        </header>

        {!loading && !error && orders.length > 0 && (
          <section className="orders-overview" aria-label="Order overview">
            <button type="button" onClick={() => setActiveFilter("all")} aria-pressed={activeFilter === "all"}>
              <span>
                <ShoppingBag />
              </span>
              <p>
                <strong>{counts.all}</strong>Total orders
              </p>
            </button>
            <button type="button" onClick={() => setActiveFilter("active")} aria-pressed={activeFilter === "active"}>
              <span>
                <Clock3 />
              </span>
              <p>
                <strong>{counts.active}</strong>Active orders
              </p>
            </button>
            <button type="button" onClick={() => setActiveFilter("completed")} aria-pressed={activeFilter === "completed"}>
              <span>
                <CheckCircle2 />
              </span>
              <p>
                <strong>{counts.completed}</strong>Completed
              </p>
            </button>
          </section>
        )}

        {!loading && !error && orders.length > 0 && (
          <section className="orders-toolbar" aria-label="Order filters">
            <div className="orders-filter-tabs">
              {FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter.value}
                  className={activeFilter === filter.value ? "active" : ""}
                  aria-pressed={activeFilter === filter.value}
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {filter.label}
                  <span>{counts[filter.value]}</span>
                </button>
              ))}
            </div>
            <label className="orders-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search orders</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search order or product"
              />
            </label>
          </section>
        )}

        {loading ? (
          <OrdersSkeleton />
        ) : error ? (
          <EmptyState illustration="box" title="Orders unavailable" description={error} action={{ label: "Try again", onClick: () => fetchOrders() }} />
        ) : !orders.length ? (
          <EmptyState illustration="bag" title="Your first campus find is waiting" description="Products you order from verified campus sellers will appear here, with every step from placed to ready for pickup." action={{ label: "Browse products", to: "/browse" }} secondaryAction={{ label: "See stalls open now", to: "/stalls" }} />
        ) : !visibleOrders.length ? (
          <EmptyState compact illustration="search" title="No matching orders" description="Try another search term or choose a different status." action={{ label: "Clear filters", onClick: () => { setQuery(""); setActiveFilter("all"); } }} />
        ) : (
          <section className="buyer-order-list" aria-busy={refreshing}>
            <div className="orders-results-heading" aria-live="polite">
              <h2>{FILTERS.find((filter) => filter.value === activeFilter)?.label} <span>{visibleOrders.length}</span></h2>
              <span>Newest first</span>
            </div>
            {visibleOrders.map((order) => (
              <BuyerOrderCard
                key={order.id}
                order={order}
                expanded={Boolean(expandedOrders[order.id])}
                onToggle={() => toggleExpanded(order.id)}
                now={now}
                cancelling={cancellingId === order.id}
                cancelDisabled={Boolean(cancellingId)}
                onCancel={() => cancelOrder(order)}
              />
            ))}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

function BuyerOrderCard({ order, expanded, onToggle, now, cancelling, cancelDisabled, onCancel }) {
  const detailsRef = useRef(null);
  const openDetails = () => {
    detailsRef.current.open = true;
    detailsRef.current.querySelector("summary").focus();
  };
  const items = getOrderItems(order);
  const displayedItems = expanded ? items : items.slice(0, 2);
  const status = normalizeStatus(order.status);
  const secondsRemaining = Math.max(0, Math.ceil((Date.parse(order.cancellation_deadline) - now) / 1000) || 0);
  const canCancel = order.can_cancel && secondsRemaining > 0 && ACTIVE_STATUSES.has(status);
  const remainingLabel = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;
  const fulfillment = normalizeStatus(
    order.fulfillment || order.fulfillment_method || "pickup",
  );
  const stallName = getStallName(order, items);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const statusMessage = status === "pending" ? "Waiting for seller confirmation"
    : ["confirmed", "processing", "preparing"].includes(status) ? "The seller is preparing your order"
    : ["ready", "ready-for-pickup"].includes(status) ? (fulfillment === "delivery" ? "Your order is ready for delivery" : "Your order is ready to collect")
    : status === "out-for-delivery" ? "Your order is on its way"
    : ["completed", "delivered"].includes(status) ? "Order completed. Thanks for shopping on campus!"
    : ["cancelled", "canceled"].includes(status) ? "This order was cancelled"
    : "Check here for order updates";

  return (
    <article className={`buyer-order-card ${ACTIVE_STATUSES.has(status) ? "is-active-order" : ""}`}>
      <header className="buyer-order-header">
        <div className="buyer-order-reference">
          <span className="buyer-order-icon">
            <Store size={18} />
          </span>
          <div>
            <strong>{stallName}</strong>
            <small>Order #{getOrderReference(order)}</small>
          </div>
        </div>
        <div className="buyer-order-meta">
          <span>
            <CalendarDays size={13} />
            {formatDate(order.created_at || order.order_date)}
          </span>
          <span className={`order-status-pill status-${status}`}>
            {getStatusIcon(status)} {formatStatus(status)}
          </span>
        </div>
      </header>

      <div className="buyer-order-progress">
        <OrderStepper status={status} fulfillment={fulfillment} />
        <p className="buyer-order-status-text">{getStatusIcon(status)} {statusMessage}</p>
      </div>

      {!["cancelled", "canceled"].includes(status) && (
        <div className={`buyer-order-pickup ${fulfillment === "delivery" ? "is-delivery" : ""}`}>
          <span className="buyer-order-pickup-icon" aria-hidden="true">{fulfillment === "delivery" ? <Truck size={20} /> : <MapPin size={20} />}</span>
          <span>
            <small>{fulfillment === "delivery" ? "Campus delivery" : "Pick up at"}</small>
            <strong>{fulfillment === "delivery" ? "The seller will bring it to you" : order.stall?.location || stallName}</strong>
            {fulfillment !== "delivery" && order.stall?.location && <small>{stallName}</small>}
          </span>
        </div>
      )}

      <div className="buyer-order-items">
        {displayedItems.length ? (
          displayedItems.map((item, index) => {
            const product = getProduct(item);
            const quantity = Number(item.quantity || 1);
            const lineKey =
              item.id || item.order_item_id || `${order.id}-${index}`;

            return (
              <div className="buyer-order-item" key={lineKey}>
                <button type="button" className="buyer-order-thumb" onClick={openDetails} aria-label={`View order details for ${product.name || item.productName || "this item"}`}>
                  {product.image_url ? (
                    <img src={product.image_url} alt="" loading="lazy" />
                  ) : (
                    <ShoppingBag size={18} aria-hidden="true" />
                  )}
                </button>
                <div>
                  <button type="button" className="buyer-order-product-link" onClick={openDetails} aria-label={`View order details for ${product.name || item.productName || "this item"}`}>
                    {product.name || item.productName || "Item details unavailable"}
                  </button>
                  <small>
                    {formatPrice(getItemPrice(item))} × {quantity}
                  </small>
                </div>
                <strong>{formatPrice(getItemPrice(item) * quantity)}</strong>
              </div>
            );
          })
        ) : (
          <div className="buyer-order-item buyer-order-item-fallback">
            <span className="buyer-order-thumb">
              <ShoppingBag size={18} />
            </span>
            <div>
              <strong>Order items</strong>
              <small>Item details unavailable</small>
            </div>
          </div>
        )}

        {items.length > 2 && (
          <button type="button" className="order-expand-btn" onClick={onToggle} aria-expanded={expanded}>
            {expanded
              ? "Show fewer items"
              : `Show ${items.length - 2} more ${items.length - 2 === 1 ? "item" : "items"}`}
            <ChevronDown className={expanded ? "is-open" : ""} size={14} />
          </button>
        )}
      </div>

      <footer className="buyer-order-footer">
        <p>
          <span>{itemCount} {itemCount === 1 ? "item" : "items"} · Order total</span>
          <strong>{formatPrice(getOrderTotal(order))}</strong>
        </p>
        <details ref={detailsRef} className="order-details">
          <summary>Order details <ChevronDown size={15} /></summary>
          <dl>
            <dt>Order reference</dt><dd>{order.order_number || order.reference || order.id}</dd>
            <dt>Placed on</dt><dd>{formatDate(order.created_at || order.order_date)}</dd>
            <dt>Your note</dt><dd>{order.delivery_notes || order.notes || "No note added."}</dd>
          </dl>
        </details>
        {ACTIVE_STATUSES.has(status) && (
          <div className="buyer-order-cancellation">
            {canCancel ? <>
              <button type="button" onClick={onCancel} disabled={cancelDisabled} className="buyer-order-cancel-button">
                {cancelling ? "Cancelling…" : "Cancel order"}
              </button>
              <small>Cancellation available for <strong>{remainingLabel}</strong></small>
            </> : <small>The 10-minute cancellation window has closed.</small>}
          </div>
        )}
      </footer>
    </article>
  );
}

function OrdersSkeleton() {
  return (
    <div className="orders-skeleton" aria-label="Loading orders">
      {[0, 1, 2].map((item) => (
        <div className="orders-skeleton-card" key={item}>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ))}
    </div>
  );
}
