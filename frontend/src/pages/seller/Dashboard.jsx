import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BarChart3, ClipboardList, PackageCheck, RefreshCw, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Sidebar from "../../components/common/Sidebar.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { StatusChip } from "../../components/ui/Chip.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { analyticsService, orderService, productService, stallService } from "../../services/api.js";
import { formatCurrency } from "../../utils/formatCurrency.js";
import { plural } from "../../utils/marketplace.js";
import "./Dashboard.css";

const DAY = 86400000;
const DONE = new Set(["completed", "delivered"]);
const ACTIVE_PICKUP = new Set(["confirmed", "preparing", "ready"]);
const CHART = { green: "#13703C", grid: "#ECE4D2", ink: "#4A5A50" };

const list = (payload) => (Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []);
const axisPeso = (value) => (value >= 1000 ? `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K` : `₱${Math.round(value)}`);

/** Every day of the last 30 (zeros included), so the chart shows the period, not isolated dots. */
const fillDays = (timeline) => {
  const byDate = Object.fromEntries(timeline.map((day) => [day.date, day]));
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10);
    return { date, revenue: Number(byDate[date]?.revenue || 0), orders: Number(byDate[date]?.orders || 0) };
  });
};

const pct = (current, previous) => (previous > 0 ? ((current - previous) / previous) * 100 : null);

/** Revenue and order counts from the seller's own online orders (used when analytics is unavailable). */
const summarizeOrders = (orders, fromMs, toMs) => {
  const inRange = orders.filter((order) => DONE.has(order.status) && Date.parse(order.created_at) >= fromMs && Date.parse(order.created_at) < toMs);
  return { revenue: inRange.reduce((sum, order) => sum + Number(order.total || 0), 0), orders: inRange.length };
};

export default function SellerDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ sales30: null, sales60: null, top: [], orders: [], products: [], stall: null, analytics: true });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    quiet ? setRefreshing(true) : setLoading(true);
    const [s30, s60, top, orders, products, stall] = await Promise.allSettled([
      analyticsService.getSales(30), analyticsService.getSales(60), analyticsService.getTopProducts(30),
      orderService.getSellerOrders(), productService.getAll({ mine: true, limit: 100 }), stallService.getMy(),
    ]);
    const value = (result) => (result.status === "fulfilled" ? result.value.data : null);
    setData({
      sales30: value(s30), sales60: value(s60), top: list(value(top)).slice(0, 5),
      orders: list(value(orders)), products: list(value(products)), stall: value(stall),
      analytics: s30.status === "fulfilled",
    });
    setUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const kpis = useMemo(() => {
    if (data.analytics && data.sales30) {
      const cur = { revenue: Number(data.sales30.total_revenue || 0), orders: Number(data.sales30.total_orders || 0) };
      const prev = { revenue: Number(data.sales60?.total_revenue || 0) - cur.revenue, orders: Number(data.sales60?.total_orders || 0) - cur.orders };
      return { cur, prev, scope: "Completed & delivered online orders + POS sales, last 30 days", timeline: data.sales30.timeline || [] };
    }
    const cur = summarizeOrders(data.orders, now - 30 * DAY, now + DAY);
    const prev = summarizeOrders(data.orders, now - 60 * DAY, now - 30 * DAY);
    return { cur, prev, scope: "Completed & delivered online orders, last 30 days (POS needs Premium analytics)", timeline: [] };
  }, [data, now]);

  const pickups = data.orders.filter((order) => (order.fulfillment || "pickup") === "pickup" && ACTIVE_PICKUP.has(order.status))
    .sort((a, b) => (a.status === "ready" ? -1 : 0) - (b.status === "ready" ? -1 : 0) || Date.parse(a.created_at) - Date.parse(b.created_at));
  const lowStock = data.products.filter((product) => Number(product.stock) <= 5).sort((a, b) => a.stock - b.stock);
  const pending = data.orders.filter((order) => order.status === "pending").length;
  const avg = kpis.cur.orders ? kpis.cur.revenue / kpis.cur.orders : 0;
  const prevAvg = kpis.prev.orders ? kpis.prev.revenue / kpis.prev.orders : 0;
  const firstName = user?.name?.split(" ")[0] || "seller";

  return (
    <div className="dashboard-layout sd-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar sd-topbar">
          <div className="topbar-titles">
            <h1>Welcome back, {firstName}</h1>
            <p>{data.stall?.name ? `${data.stall.name} · ${data.stall.location}` : "Your stall at a glance"}</p>
          </div>
          <div className="sd-topbar-actions">
            {updatedAt && <span className="sd-updated">Updated {updatedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => load({ quiet: true })} disabled={refreshing}>
              <RefreshCw className={refreshing ? "spin" : ""} aria-hidden="true" /> Refresh
            </button>
          </div>
        </header>

        <div className="dashboard-content sd-content">
          {pending > 0 && (
            <Link to="/seller/orders" className="sd-alert">
              <ClipboardList aria-hidden="true" />
              <span><strong>{plural(pending, "new order")} waiting</strong> — confirm so buyers know you're on it.</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          )}

          <section className="sd-kpis" aria-label="Key numbers">
            {loading ? [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={118} />) : (
              <>
                <StatCard icon={Wallet} tone="green" label="Revenue" value={formatCurrency(kpis.cur.revenue)} delta={pct(kpis.cur.revenue, kpis.prev.revenue)} deltaLabel="vs previous 30 days" scope={kpis.scope} />
                <StatCard icon={ShoppingBag} tone="gold" label="Completed orders" value={kpis.cur.orders} delta={pct(kpis.cur.orders, kpis.prev.orders)} deltaLabel="vs previous 30 days" scope="Same scope as revenue" />
                <StatCard icon={TrendingUp} tone="teal" label="Average order" value={formatCurrency(avg)} delta={pct(avg, prevAvg)} deltaLabel="vs previous 30 days" scope="Revenue ÷ completed orders" />
                <StatCard icon={PackageCheck} tone="coral" label="Pickups to hand over" value={pickups.length} scope={`${plural(pickups.filter((o) => o.status === "ready").length, "order")} ready now`} />
              </>
            )}
          </section>

          <div className="sd-grid">
            <div className="sd-col">
            <section className="sd-card sd-chart" aria-labelledby="revenue-title">
              <div className="sd-card-head">
                <div>
                  <p className="cm-eyebrow">Revenue trend</p>
                  <h2 id="revenue-title">Last 30 days</h2>
                  <p className="sd-scope">{kpis.scope}</p>
                </div>
                <Link to="/seller/analytics" className="cm-link">Full analytics <ArrowRight aria-hidden="true" /></Link>
              </div>
              {loading ? <SkeletonBlock height={260} /> : !data.analytics ? (
                <EmptyState compact illustration="sprout" title="Revenue charts are a Premium feature" description="Your KPIs above still count your completed online orders. Ask the campus administrator to switch your stall to Premium for charts and POS analytics." />
              ) : kpis.timeline.length === 0 ? (
                <EmptyState compact illustration="sprout" title="No completed sales yet" description="When orders are completed or delivered, your daily revenue will grow here." action={{ label: "Review orders", to: "/seller/orders" }} />
              ) : (
                <div className="sd-chart-box">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={fillDays(kpis.timeline)} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="sdRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART.green} stopOpacity={0.45} />
                          <stop offset="100%" stopColor={CHART.green} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} tick={{ fill: CHART.ink, fontSize: 13 }} axisLine={false} tickLine={false} minTickGap={28} />
                      <YAxis tickFormatter={axisPeso} tick={{ fill: CHART.ink, fontSize: 13 }} axisLine={false} tickLine={false} width={56} allowDecimals={false} />
                      <Tooltip formatter={(v) => [formatCurrency(v), "Revenue"]} labelFormatter={(d) => new Date(d).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })} contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 10px 24px rgba(11,61,36,.14)" }} />
                      <Area type="monotone" dataKey="revenue" stroke={CHART.green} strokeWidth={3} fill="url(#sdRevenue)" dot={false} activeDot={{ r: 6, fill: "#F5B82E", stroke: "#fff", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

<section className="sd-card" aria-labelledby="top-title">
              <div className="sd-card-head">
                <div>
                  <p className="cm-eyebrow">Best sellers</p>
                  <h2 id="top-title">Top products</h2>
                </div>
                <BarChart3 className="sd-head-icon" aria-hidden="true" />
              </div>
              {loading ? <SkeletonBlock height={160} /> : data.top.length === 0 ? (
                <EmptyState compact illustration="bag" title={data.analytics ? "No sales yet" : "Premium feature"} description={data.analytics ? "Your best sellers will rank here." : "Product rankings come with Premium analytics."} />
              ) : (
                <ol className="sd-top">
                  {data.top.map((row, index) => {
                    const max = Math.max(...data.top.map((r) => Number(r.total_sold)));
                    return (
                      <li key={row.product_id}>
                        <b>{index + 1}</b>
                        <span>
                          <strong>{row.product?.name || "Removed product"}</strong>
                          <small>{plural(row.total_sold, "sold", "sold")} · {formatCurrency(row.revenue)}</small>
                          <i style={{ width: `${(Number(row.total_sold) / max) * 100}%` }} aria-hidden="true" />
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            </div>
            <div className="sd-col">
            <section className="sd-card" aria-labelledby="pickups-title">
              <div className="sd-card-head">
                <div>
                  <p className="cm-eyebrow">Hand-overs</p>
                  <h2 id="pickups-title">Today's pickups</h2>
                </div>
                <Link to="/seller/orders" className="cm-link">Orders <ArrowRight aria-hidden="true" /></Link>
              </div>
              {loading ? <SkeletonBlock height={200} /> : pickups.length === 0 ? (
                <EmptyState compact illustration="box" title="No pickups waiting" description="Confirmed pickup orders will line up here." />
              ) : (
                <ul className="sd-pickups">
                  {pickups.slice(0, 6).map((order) => (
                    <li key={order.id}>
                      <span className="sd-pickup-thumb">{order.items?.[0]?.product?.image_url ? <img src={order.items[0].product.image_url} alt="" /> : <ShoppingBag aria-hidden="true" />}</span>
                      <span className="sd-pickup-text">
                        <strong>{order.buyer_name || "Campus buyer"}</strong>
                        <small>{plural(order.items?.reduce((s, i) => s + Number(i.quantity), 0) || 0, "item")} · {formatCurrency(order.total)}</small>
                      </span>
                      <StatusChip status={order.status} label={order.status === "ready" ? "Ready" : undefined} />
                    </li>
                  ))}
                </ul>
              )}
              {data.stall?.location && <p className="sd-scope">Pickup point: <strong>{data.stall.location}</strong></p>}
            </section>

            <section className={`sd-card ${lowStock.length ? "sd-card--warn" : ""}`} aria-labelledby="stock-title">
              <div className="sd-card-head">
                <div>
                  <p className="cm-eyebrow">Inventory</p>
                  <h2 id="stock-title">{lowStock.length ? "Running low" : "Stock levels"}</h2>
                </div>
                <Link to="/seller/products" className="cm-link">Products <ArrowRight aria-hidden="true" /></Link>
              </div>
              {loading ? <SkeletonBlock height={160} /> : lowStock.length === 0 ? (
                <EmptyState compact illustration="check" title="All stocked up" description={`None of your ${plural(data.products.length, "product")} is at 5 or fewer.`} />
              ) : (
                <ul className="sd-stock">
                  {lowStock.slice(0, 6).map((product) => (
                    <li key={product.id}>
                      <AlertTriangle aria-hidden="true" />
                      <span>{product.name}</span>
                      <b className={Number(product.stock) === 0 ? "is-out" : ""}>{Number(product.stock) === 0 ? "Sold out" : `${product.stock} left`}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>


            </div>
          </div>

          <section className="sd-card sd-orders" aria-labelledby="recent-title">
            <div className="sd-card-head">
              <div>
                <p className="cm-eyebrow">Order activity</p>
                <h2 id="recent-title">Recent orders</h2>
              </div>
              <Link to="/seller/orders" className="cm-link">All orders <ArrowRight aria-hidden="true" /></Link>
            </div>
            {loading ? <SkeletonBlock height={180} /> : data.orders.length === 0 ? (
              <EmptyState compact illustration="box" title="No orders yet" description="Share your stall link so buyers can find you." action={data.stall ? { label: "View your stall", to: `/stalls/${data.stall.id}` } : undefined} />
            ) : (
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead><tr><th scope="col">Order</th><th scope="col">Buyer</th><th scope="col">Placed</th><th scope="col">Type</th><th scope="col">Total</th><th scope="col">Status</th></tr></thead>
                  <tbody>
                    {data.orders.slice(0, 6).map((order) => (
                      <tr key={order.id}>
                        <td>#{order.id.slice(0, 8).toUpperCase()}</td>
                        <td>{order.buyer_name || "Campus buyer"}</td>
                        <td>{new Date(order.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                        <td>{order.fulfillment === "delivery" ? "Delivery" : "Pickup"}</td>
                        <td><strong>{formatCurrency(order.total)}</strong></td>
                        <td><StatusChip status={order.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
