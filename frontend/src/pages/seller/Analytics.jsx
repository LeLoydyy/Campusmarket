import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import { analyticsService } from "../../services/api.js";
import {
  FiAlertCircle,
  FiArrowDownRight,
  FiArrowUpRight,
  FiAward,
  FiCalendar,
  FiDollarSign,
  FiDownload,
  FiMinus,
  FiRefreshCw,
  FiShoppingBag,
  FiTrendingUp,
} from "react-icons/fi";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { CHART } from "../../utils/chartColors.js";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { csvDate, downloadCsv } from "../../utils/csv.js";
import "./Analytics.css";

const PERIOD_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
];
const MEASURES = [
  { key: "revenue", label: "Revenue" },
  { key: "orders", label: "Orders" },
];

const extractObject = (payload, key) => payload?.data?.[key] || payload?.[key] || payload?.data || payload || {};
const extractArray = (payload, key) => {
  const value = payload?.data?.[key] ?? payload?.[key] ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const formatCompactCurrency = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Sales are grouped by campus (Manila) date on the server; build the same keys here.
const campusDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = (key) => format(new Date(`${key}T00:00:00`), "MMM d");
const dayLabelLong = (key) => format(new Date(`${key}T00:00:00`), "EEE, MMM d");

/** Every day in the period, oldest first, with zero for days without sales. */
const fillDays = (timeline, days) => {
  const byDay = new Map(timeline.map((entry) => [String(entry.date).slice(0, 10), entry]));
  return Array.from({ length: days }, (_, index) => {
    const key = campusDay.format(new Date(Date.now() - (days - 1 - index) * 86400000));
    const entry = byDay.get(key);
    return { key, label: dayLabel(key), revenue: Number(entry?.revenue) || 0, orders: Number(entry?.orders) || 0 };
  });
};

const titleCase = (value) => String(value || "Other").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeTopProduct = (record, index) => {
  const product = record?.product || record?.products || {};
  return {
    id: record?.product_id || product.id || record?.id || `product-${index}`,
    name: product.name || record?.product_name || record?.name || "Removed product",
    image: product.image_url || "",
    category: product.category || record?.category || "other",
    sold: Number(record?.total_sold ?? record?.sold_count ?? record?.quantity_sold ?? 0) || 0,
    revenue: Number(record?.revenue ?? record?.total_revenue ?? 0) || 0,
  };
};

/** "▲ 24% vs previous 30 days" — arrow + words, so the direction never relies on colour alone. */
function Change({ current, previous, periodLabel }) {
  if (!current && !previous) return <p className="analytics-change is-flat"><FiMinus aria-hidden="true" /> No sales yet</p>;
  if (!previous) return <p className="analytics-change is-up"><FiArrowUpRight aria-hidden="true" /> New this period</p>;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return <p className="analytics-change is-flat"><FiMinus aria-hidden="true" /> Same as previous {periodLabel}</p>;
  const up = percent > 0;
  return (
    <p className={`analytics-change ${up ? "is-up" : "is-down"}`}>
      {up ? <FiArrowUpRight aria-hidden="true" /> : <FiArrowDownRight aria-hidden="true" />}
      {up ? "Up" : "Down"} {Math.abs(percent)}% <span>vs previous {periodLabel}</span>
    </p>
  );
}

function Metric({ icon, label, value, children, tone = "green", loading }) {
  return (
    <article className={`analytics-metric tone-${tone}`}>
      <div className="analytics-metric-head">
        <span aria-hidden="true">{icon}</span>
        <small>{label}</small>
      </div>
      {loading ? <i className="analytics-shimmer" /> : <strong>{value}</strong>}
      {!loading && children}
    </article>
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const day = payload[0].payload;
  return (
    <div className="analytics-tooltip">
      <strong>{dayLabelLong(day.key)}</strong>
      <span><i className="is-revenue" />Revenue <b>{formatCurrency(day.revenue)}</b></span>
      <span><i className="is-orders" />Orders <b>{day.orders}</b></span>
    </div>
  );
}

/** Ranked rows with a bar for the share of the leader; bars only appear when there is something to compare. */
function RankedList({ rows, valueLabel }) {
  const max = Math.max(...rows.map((row) => row.measure), 0);
  const compare = rows.length > 1;
  return (
    <ol className="analytics-ranked" aria-label={valueLabel}>
      {rows.map((row, index) => (
        <li key={row.id}>
          <span className="analytics-rank" aria-hidden="true">{index + 1}</span>
          <div className="analytics-ranked-body">
            <div className="analytics-ranked-line">
              <strong>{row.name}</strong>
              <span>{row.value}</span>
            </div>
            {row.detail && <small>{row.detail}</small>}
            {compare && (
              <span className="analytics-ranked-track" aria-hidden="true">
                <span style={{ width: `${max ? Math.max(3, (row.measure / max) * 100) : 0}%` }} />
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PanelEmpty({ title, description }) {
  return (
    <EmptyState compact className="analytics-chart-empty" illustration="sprout" title={title} description={description}
      action={{ label: "Manage products", to: "/seller/products" }} />
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState("30");
  const [measure, setMeasure] = useState("revenue");
  const [sales, setSales] = useState({});
  const [topProducts, setTopProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [premiumRequired, setPremiumRequired] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestSequence = useRef(0);
  const hasData = useRef(false);

  const loadAnalytics = useCallback(async ({ quiet = false } = {}) => {
    const requestId = ++requestSequence.current;
    // Keep the current charts on screen while a new period loads (no skeleton flash).
    quiet || hasData.current ? setRefreshing(true) : setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      analyticsService.getSales(Number(period)),
      analyticsService.getTopProducts(Number(period)),
      analyticsService.getCategories(Number(period)),
    ]);
    if (requestId !== requestSequence.current) return;
    const [salesResult, productsResult, categoriesResult] = results;
    setPremiumRequired(results.some((result) => result.status === "rejected" && result.reason.response?.data?.code === "PREMIUM_REQUIRED"));
    const failedCount = results.filter((result) => result.status === "rejected").length;
    if (salesResult.status === "fulfilled") setSales(extractObject(salesResult.value.data, "sales"));
    if (productsResult.status === "fulfilled") setTopProducts(extractArray(productsResult.value.data, "products").map(normalizeTopProduct));
    if (categoriesResult.status === "fulfilled") {
      setCategories(extractArray(categoriesResult.value.data, "categories")
        .map((record) => ({ id: record.category || "other", name: titleCase(record.category), revenue: Number(record.revenue) || 0 }))
        .filter((category) => category.revenue > 0));
    }
    if (failedCount > 0) {
      setError(failedCount === results.length ? "Analytics are temporarily unavailable. Please try again." : "Some analytics could not be updated. Available sections are still shown.");
    } else {
      setLastUpdated(new Date());
      hasData.current = true;
    }
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const days = Number(period);
  const periodLabel = `${days} days`;
  const series = useMemo(() => fillDays(Array.isArray(sales?.timeline) ? sales.timeline : [], days), [sales, days]);
  const totalRevenue = Number(sales?.total_revenue) || 0;
  const totalOrders = Number(sales?.total_orders) || 0;
  const averageOrder = Number(sales?.avg_order_value) || 0;
  const previous = sales?.previous || {};
  const activeDays = series.filter((day) => day.orders > 0);
  const bestDay = activeDays.reduce((best, day) => (!best || day[measure] > best[measure] ? day : best), null);
  const bestProduct = topProducts[0];
  const categoryTotal = categories.reduce((sum, category) => sum + category.revenue, 0);
  const rangeLabel = series.length ? `${dayLabel(series[0].key)} – ${dayLabel(series[series.length - 1].key)}` : "";
  const measureLabel = MEASURES.find((item) => item.key === measure).label;

  if (premiumRequired) {
    return (
      <div className="dashboard-layout seller-analytics-shell"><Sidebar /><main className="dashboard-main"><div className="dashboard-content seller-analytics-content">
        <EmptyState illustration="sprout" title="Product analytics come with Premium"
          description="See your daily sales, best-selling products and which categories earn the most. Premium also includes up to 25 listings, the point of sale and 3 featured products."
          action={{ label: "See Premium", to: "/seller/plans?feature=analytics" }} />
      </div></main></div>
    );
  }

  return (
    <div className="dashboard-layout seller-analytics-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar seller-analytics-topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Analytics</h1>
              <p>Understand sales trends and product performance.</p>
            </div>
          </div>
          <div className="seller-analytics-topbar-actions">
            <div className="analytics-segmented" role="group" aria-label="Analytics period">
              {PERIOD_OPTIONS.map((option) => (
                <button type="button" key={option.value} className={period === option.value ? "is-active" : ""}
                  onClick={() => setPeriod(option.value)} aria-pressed={period === option.value}>
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" className="analytics-refresh-button" onClick={() => loadAnalytics({ quiet: true })}
              disabled={loading || refreshing} aria-label="Refresh analytics" title="Refresh">
              <FiRefreshCw className={refreshing ? "is-spinning" : ""} />
            </button>
          </div>
        </header>

        <div className="dashboard-content seller-analytics-content" aria-busy={loading || refreshing}>
          {error && (
            <div className="analytics-error" role="alert">
              <FiAlertCircle aria-hidden="true" />
              <span>{error}</span>
              <button type="button" onClick={() => loadAnalytics({ quiet: true })}>Retry</button>
            </div>
          )}

          <section className="analytics-overview">
            <div>
              <span className="analytics-eyebrow">Performance overview</span>
              <h2>Your stall at a glance</h2>
              <p><FiCalendar aria-hidden="true" /> Last {periodLabel}{rangeLabel && ` · ${rangeLabel}`} · completed online orders and counter sales</p>
            </div>
          </section>

          <section className="analytics-metrics-grid" aria-label="Summary">
            <Metric icon={<FiDollarSign />} label="Revenue" value={formatCurrency(totalRevenue)} tone="gold" loading={loading}>
              <Change current={totalRevenue} previous={previous.revenue} periodLabel={periodLabel} />
            </Metric>
            <Metric icon={<FiShoppingBag />} label="Orders" value={totalOrders} loading={loading}>
              <p className="analytics-metric-note">{plural(sales?.online_orders || 0, "online order")} · {sales?.pos_sales || 0} at the counter</p>
              <Change current={totalOrders} previous={previous.orders} periodLabel={periodLabel} />
            </Metric>
            <Metric icon={<FiTrendingUp />} label="Average order" value={formatCurrency(averageOrder)} tone="teal" loading={loading}>
              <Change current={averageOrder} previous={previous.avg_order_value} periodLabel={periodLabel} />
            </Metric>
            <Metric icon={<FiAward />} label="Best seller" value={bestProduct ? bestProduct.name : "—"} tone="coral" loading={loading}>
              <p className="analytics-metric-note">{bestProduct ? `${plural(bestProduct.sold, "unit")} sold · ${formatCurrency(bestProduct.revenue)}` : "No products sold yet"}</p>
            </Metric>
          </section>

          <section className="analytics-panel" aria-labelledby="analytics-trend-title">
            <div className="analytics-panel-header">
              <div>
                <span className="analytics-eyebrow">Sales trend</span>
                <h2 id="analytics-trend-title">Daily {measureLabel.toLowerCase()}</h2>
                {bestDay && (
                  <p className="analytics-panel-sub">
                    Best day: <strong>{dayLabelLong(bestDay.key)}</strong> · {measure === "revenue" ? formatCurrency(bestDay.revenue) : plural(bestDay.orders, "order")}
                    {" "}· sales on {plural(activeDays.length, "day")} of {days}
                  </p>
                )}
              </div>
              <div className="analytics-segmented is-small" role="group" aria-label="Measure shown">
                {MEASURES.map((item) => (
                  <button type="button" key={item.key} className={measure === item.key ? "is-active" : ""} onClick={() => setMeasure(item.key)} aria-pressed={measure === item.key}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="analytics-wide-chart">
              {loading ? (
                <div className="analytics-chart-skeleton analytics-shimmer" />
              ) : !activeDays.length ? (
                <PanelEmpty title="No sales in this period" description="Daily sales appear here once orders are completed or you record counter sales." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 12, right: 8, left: 4, bottom: 0 }} barCategoryGap={days > 30 ? 1 : "20%"}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART.ink }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={24} interval="preserveStartEnd" />
                    <YAxis width={measure === "revenue" ? 64 : 36} allowDecimals={false} tick={{ fontSize: 12, fill: CHART.ink }} tickLine={false} axisLine={false}
                      tickFormatter={measure === "revenue" ? formatCompactCurrency : undefined} />
                    <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(19, 112, 60, .08)" }} />
                    <Bar dataKey={measure} name={measureLabel} fill={CHART.green} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {!loading && activeDays.length > 0 && (
              <details className="analytics-table-toggle">
                <summary>
                  Show days with sales as a table
                  <button type="button" className="analytics-export" onClick={(event) => {
                    event.preventDefault();
                    downloadCsv(`campus-market-daily-sales-${period}d-${csvDate()}.csv`, ["Date", "Orders", "Revenue (PHP)"],
                      series.map((day) => [day.key, day.orders, day.revenue.toFixed(2)]));
                  }}>
                    <FiDownload aria-hidden="true" /> Export CSV
                  </button>
                </summary>
                <div className="analytics-table-wrap">
                  <table className="seller-analytics-table">
                    <thead><tr><th>Day</th><th>Orders</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {[...activeDays].reverse().map((day) => (
                        <tr key={day.key}><td>{dayLabelLong(day.key)}</td><td>{day.orders}</td><td><strong>{formatCurrency(day.revenue)}</strong></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>

          <section className="analytics-lower-grid">
            <article className="analytics-panel" aria-labelledby="analytics-products-title">
              <div className="analytics-panel-header">
                <div>
                  <span className="analytics-eyebrow">Product ranking</span>
                  <h2 id="analytics-products-title">Best-selling products</h2>
                </div>
                {topProducts.length > 0 && <small>By units sold</small>}
              </div>
              <div className="analytics-panel-body">
                {loading ? <div className="analytics-list-skeleton analytics-shimmer" />
                  : !topProducts.length ? <PanelEmpty title="No product sales yet" description="Your best-selling products will appear here." />
                  : <RankedList valueLabel="Units sold and revenue per product" rows={topProducts.map((product) => ({
                      id: product.id,
                      name: product.name,
                      value: plural(product.sold, "unit"),
                      detail: `${titleCase(product.category)} · ${formatCurrency(product.revenue)}`,
                      measure: product.sold,
                    }))} />}
              </div>
            </article>

            <article className="analytics-panel" aria-labelledby="analytics-categories-title">
              <div className="analytics-panel-header">
                <div>
                  <span className="analytics-eyebrow">Revenue mix</span>
                  <h2 id="analytics-categories-title">Revenue by category</h2>
                </div>
                {categories.length > 0 && <small>{formatCurrency(categoryTotal)} total</small>}
              </div>
              <div className="analytics-panel-body">
                {loading ? <div className="analytics-list-skeleton analytics-shimmer" />
                  : !categories.length ? <PanelEmpty title="No category revenue yet" description="See which kinds of products earn the most once you make sales." />
                  : categories.length === 1 ? (
                    <p className="analytics-single-category">All of your revenue this period came from <strong>{categories[0].name}</strong> ({formatCurrency(categories[0].revenue)}).</p>
                  ) : <RankedList valueLabel="Revenue and share per category" rows={categories.map((category) => ({
                      id: category.id,
                      name: category.name,
                      value: formatCurrency(category.revenue),
                      detail: `${Math.round((category.revenue / categoryTotal) * 100)}% of revenue`,
                      measure: category.revenue,
                    }))} />}
              </div>
            </article>
          </section>

          {lastUpdated && (
            <p className="analytics-last-updated">
              Updated {format(lastUpdated, "MMM d, yyyy · h:mm a")}{refreshing ? " · refreshing…" : ""} · <Link to="/seller/orders">View orders</Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
