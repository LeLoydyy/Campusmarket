import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { orderService } from "../../services/api.js";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  FiAlertCircle,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiX,
} from "react-icons/fi";
import "./SellerOrders.css";
import EmptyState from "../../components/ui/EmptyState.jsx";

const STATUS_FLOW = {
  pending: { next: "confirmed", label: "Confirm order" },
  confirmed: { next: "ready", label: "Mark as ready" },
  ready: { next: "delivered", label: "Mark delivered" },
  delivered: { next: null, label: "Completed" },
  cancelled: { next: null, label: "Cancelled" },
};

const STATUS_TABS = [
  { key: "all", label: "All orders" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const ORDER_STEPS = ["pending", "confirmed", "ready", "delivered"];

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

const getOrderCode = (id) =>
  String(id || "")
    .slice(0, 8)
    .toUpperCase();

function OrderProgress({ status }) {
  if (status === "cancelled") {
    return (
      <div className="seller-order-cancelled">
        <FiX /> Order cancelled
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

function OrderCard({ order, updating, onAdvance, onCancel }) {
  const flow = STATUS_FLOW[order.status] || STATUS_FLOW.delivered;
  const detailsRef = useRef(null);
  const openDetails = () => {
    detailsRef.current.open = true;
    detailsRef.current.querySelector("summary").focus();
  };

  return (
    <article className="seller-order-card">
      <header className="seller-order-card-header">
        <div>
          <span>Order</span>
          <h2>#{getOrderCode(order.id)}</h2>
          <p>{formatDate(order.createdAt)}</p>
        </div>
        <div>
          <span className={`seller-order-badge status-${order.status}`}>
            {order.status}
          </span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>
      </header>

      <OrderProgress status={order.status} />

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
          <dt>Order reference</dt><dd>{order.id}</dd>
          <dt>Fulfillment</dt><dd>{order.fulfillment === "delivery" ? "Campus delivery" : "Campus pickup"}</dd>
        </dl>
      </details>

      {(flow.next || order.status === "pending") && (
        <footer className="seller-order-card-footer">
          {order.status === "pending" && (
            <button
              type="button"
              className="seller-order-cancel-button"
              onClick={onCancel}
              disabled={updating}
            >
              Cancel order
            </button>
          )}
          {flow.next && (
            <button
              type="button"
              className="seller-order-next-button"
              onClick={() => onAdvance(flow.next)}
              disabled={updating}
            >
              {updating ? (
                <span className="seller-orders-mini-spinner" />
              ) : (
                flow.label
              )}
            </button>
          )}
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
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [updatingId, setUpdatingId] = useState(null);

  const fetchOrders = useCallback(async ({ quiet = false } = {}) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      const { data } = await orderService.getSellerOrders({});
      setOrders(extractOrders(data).map(normalizeOrder));
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

  const tabCounts = useMemo(
    () =>
      STATUS_TABS.reduce((counts, tab) => {
        counts[tab.key] =
          tab.key === "all"
            ? orders.length
            : orders.filter((order) => order.status === tab.key).length;
        return counts;
      }, {}),
    [orders],
  );

  const displayedOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = orders.filter((order) => {
      const matchesStatus = activeTab === "all" || order.status === activeTab;
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
      processing: orders.filter((order) =>
        ["confirmed", "ready"].includes(order.status),
      ).length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      revenue: orders
        .filter((order) => order.status === "delivered")
        .reduce((sum, order) => sum + order.total, 0),
    }),
    [orders],
  );

  const handleStatusUpdate = async (order, newStatus) => {
    if (newStatus === "cancelled") {
      const confirmed = window.confirm(
        `Cancel order #${getOrderCode(order.id)}? The buyer will no longer be able to receive it.`,
      );
      if (!confirmed) return;
    }

    try {
      setUpdatingId(order.id);
      const { data } = await orderService.updateStatus(order.id, newStatus);
      const savedStatus = extractStatus(data, newStatus);
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id ? { ...item, status: savedStatus } : item,
        ),
      );
      toast.success(`Order marked as ${savedStatus.replace(/-/g, " ")}`);
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error || "Failed to update order",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setActiveTab("all");
  };

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
          <button
            type="button"
            className="seller-orders-refresh"
            onClick={() => fetchOrders({ quiet: true })}
            disabled={loading || refreshing}
          >
            <FiRefreshCw className={refreshing ? "is-spinning" : ""} /> Refresh
          </button>
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

          <section className="seller-orders-summary" aria-label="Order summary">
            <article>
              <span className="tone-gold">
                <FiClock />
              </span>
              <div>
                <small>Pending</small>
                <strong>{loading ? "—" : summary.pending}</strong>
              </div>
            </article>
            <article>
              <span className="tone-blue">
                <FiPackage />
              </span>
              <div>
                <small>In progress</small>
                <strong>{loading ? "—" : summary.processing}</strong>
              </div>
            </article>
            <article>
              <span className="tone-green">
                <FiCheckCircle />
              </span>
              <div>
                <small>Delivered</small>
                <strong>{loading ? "—" : summary.delivered}</strong>
              </div>
            </article>
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
              <div className="seller-orders-list">
                {displayedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updatingId === order.id}
                    onAdvance={(status) => handleStatusUpdate(order, status)}
                    onCancel={() => handleStatusUpdate(order, "cancelled")}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
