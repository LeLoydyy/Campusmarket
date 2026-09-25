import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowRight, CalendarDays, Check, ClipboardList, RefreshCw, Store, UserCheck, Users, Wallet, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Sidebar from "../../components/common/Sidebar.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Illustration from "../../components/ui/Illustration.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { adminService, stallService } from "../../services/api.js";
import { formatCurrency } from "../../utils/formatCurrency.js";
import { plural } from "../../utils/marketplace.js";
import "./AdminWorkspace.css";
import "./AdminDashboard.css";

// Chart colours: palette only (green-700, gold-500, teal, coral).
const CHART = { green: "#13703C", gold: "#F5B82E", teal: "#1E6B6B", coral: "#E8603C", grid: "#ECE4D2", ink: "#4A5A50" };
const ROLE_COLORS = { buyer: CHART.green, seller: CHART.gold, admin: CHART.teal };
const axisPeso = (value) => (value >= 1000 ? `₱${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K` : `₱${Math.round(value)}`);
const monthLabel = (month) => new Date(`${month}-01T12:00:00`).toLocaleDateString("en-PH", { month: "short", year: "2-digit" });

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingStalls, setPendingStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([adminService.getStats(), adminService.getPendingStalls()])
      .then(([s, p]) => { setStats(s.data); setPendingStalls(p.data || []); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const reviewStall = async (stallId, status) => {
    try {
      setActingId(stallId);
      await stallService.updateStatus(stallId, status);
      setPendingStalls((items) => items.filter((stall) => stall.id !== stallId));
      toast.success(status === "approved" ? "Stall approved" : "Stall rejected");
      adminService.getStats().then(({ data }) => setStats(data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't update the stall");
    } finally {
      setActingId(null);
    }
  };

  const actions = stats ? [
    { key: "registrations", count: stats.pending_registrations, label: "Registrations to verify", hint: "Check CSUCC ID numbers against school records", to: "/admin/users", icon: UserCheck },
    { key: "stalls", count: stats.pending_stalls, label: "Stall applications", hint: "New stores waiting for approval", to: "/admin/stalls", icon: Store },
    { key: "events", count: stats.pending_event_applications, label: "Event space requests", hint: "Sellers asking for a spot at a fair", to: "/admin/applications", icon: CalendarDays },
  ] : [];
  const openActions = actions.filter((item) => Number(item.count) > 0);
  const sales = (stats?.sales_history || []).map((row) => ({ ...row, label: monthLabel(row.month) }));
  const monthsWithSales = sales.filter((row) => Number(row.sales) > 0).length;
  const onlineRevenue = Number(stats?.total_revenue || 0);
  const posRevenue = Number(stats?.pos_revenue || 0);
  const roles = (stats?.user_breakdown || []).filter((row) => row.value > 0);

  return (
    <div className="dashboard-layout admin-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar ad-topbar">
          <div className="topbar-titles">
            <h1>Admin overview</h1>
            <p>What needs you today, and how the marketplace is doing.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}><RefreshCw aria-hidden="true" /> Refresh</button>
        </header>

        <div className="dashboard-content ad-content">
          {error && <EmptyState compact illustration="search" title="The dashboard didn't load" description="Check your connection and try again." action={{ label: "Retry", onClick: load }} />}

          {/* ── Action items ─────────────────────────────────────────────── */}
          <section className="ad-actions" aria-labelledby="actions-title">
            <div className="ad-actions-head">
              <div>
                <p className="cm-eyebrow">Needs your attention</p>
                <h2 id="actions-title">Action items</h2>
              </div>
              {!loading && openActions.length > 0 && <span className="ad-actions-total">{plural(openActions.reduce((s, a) => s + Number(a.count), 0), "item")} open</span>}
            </div>
            {loading ? <SkeletonBlock height={120} /> : openActions.length === 0 ? (
              <div className="ad-clear">
                <Illustration name="check" size={120} />
                <div>
                  <h3>All clear</h3>
                  <p>No registrations, stalls or event requests are waiting. New ones will show up here.</p>
                </div>
              </div>
            ) : (
              <ul className="ad-action-list">
                {actions.map(({ key, count, label, hint, to, icon: Icon }) => (
                  <li key={key}>
                    <Link to={to} className={`ad-action ${Number(count) > 0 ? "is-open" : "is-done"}`}>
                      <span className="ad-action-icon" aria-hidden="true"><Icon /></span>
                      <span className="ad-action-text"><strong>{label}</strong><small>{Number(count) > 0 ? hint : "Nothing waiting"}</small></span>
                      <span className="ad-action-count" aria-label={`${count} waiting`}>{Number(count) > 0 ? count : <Check aria-hidden="true" />}</span>
                      <ArrowRight className="ad-action-arrow" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── KPIs ───────────────────────────────────────────────────── */}
          <section className="ad-kpis" aria-label="Marketplace totals">
            {loading || !stats ? [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={128} />) : (
              <>
                <StatCard icon={Users} tone="teal" label="Registered accounts" value={stats.total_users} scope={`${plural(stats.pending_registrations, "account")} awaiting verification`} />
                <StatCard icon={Store} tone="green" label="Approved stalls" value={stats.active_stalls} scope="Approved by an admin, open or temporarily closed" />
                <StatCard icon={ClipboardList} tone="gold" label="Online orders" value={stats.total_orders} scope={`${plural(stats.completed_orders, "order")} completed or delivered · all time`} />
                <StatCard icon={Wallet} tone="coral" label="Sales, all stalls" value={formatCurrency(onlineRevenue + posRevenue)} scope={`${formatCurrency(onlineRevenue)} online (completed/delivered) + ${formatCurrency(posRevenue)} POS · all time`} />
              </>
            )}
          </section>

          <div className="ad-grid">
            <section className="ad-card" aria-labelledby="sales-title">
              <div className="ad-card-head">
                <div>
                  <p className="cm-eyebrow">Sales overview</p>
                  <h2 id="sales-title">Last 6 months</h2>
                  <p className="ad-scope">Completed & delivered online orders across all stalls, by calendar month (POS sales not included)</p>
                </div>
              </div>
              {loading ? <SkeletonBlock height={260} /> : monthsWithSales === 0 ? (
                <EmptyState compact illustration="sprout" title="No completed sales yet" description="Monthly totals appear once buyers' orders are completed or delivered." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={sales} margin={{ top: 10, right: 8, left: -6, bottom: 0 }}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: CHART.ink, fontSize: 13 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={axisPeso} tick={{ fill: CHART.ink, fontSize: 13 }} axisLine={false} tickLine={false} width={56} allowDecimals={false} />
                      <Tooltip formatter={(v) => [formatCurrency(v), "Sales"]} cursor={{ fill: "rgba(245,184,46,.15)" }} contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 10px 24px rgba(11,61,36,.14)" }} />
                      <Bar dataKey="sales" radius={[10, 10, 4, 4]} maxBarSize={56}>
                        {sales.map((row, i) => <Cell key={row.month} fill={i === sales.length - 1 ? CHART.gold : CHART.green} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {monthsWithSales === 1 && <p className="ad-scope ad-note">Early days — only one month has completed sales so far. The current month is highlighted in gold.</p>}
                </>
              )}
            </section>

            <section className="ad-card" aria-labelledby="users-title">
              <div className="ad-card-head">
                <div>
                  <p className="cm-eyebrow">Community</p>
                  <h2 id="users-title">Who's on Campus Market</h2>
                  <p className="ad-scope">All registered accounts, any status</p>
                </div>
              </div>
              {loading ? <SkeletonBlock height={260} /> : roles.length === 0 ? (
                <EmptyState compact illustration="chat" title="No accounts yet" />
              ) : (
                <div className="ad-donut">
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie data={roles} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} stroke="none">
                        {roles.map((row) => <Cell key={row.name} fill={ROLE_COLORS[row.name] || CHART.coral} />)}
                      </Pie>
                      <Tooltip formatter={(v, name) => [v, `${name}s`]} contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 10px 24px rgba(11,61,36,.14)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="ad-legend">
                    {roles.map((row) => (
                      <li key={row.name}>
                        <i style={{ background: ROLE_COLORS[row.name] || CHART.coral }} aria-hidden="true" />
                        <span>{row.name.charAt(0).toUpperCase() + row.name.slice(1)}s</span>
                        <b>{row.value}</b>
                        <small>{Math.round((row.value / stats.total_users) * 100)}%</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          {/* ── Stall approvals ───────────────────────────────────────────── */}
          <section className="ad-card" aria-labelledby="approvals-title">
            <div className="ad-card-head">
              <div>
                <p className="cm-eyebrow">Quick review</p>
                <h2 id="approvals-title">Stalls waiting for approval</h2>
              </div>
              <Link to="/admin/stalls" className="cm-link">All stalls <ArrowRight aria-hidden="true" /></Link>
            </div>
            {loading ? <SkeletonBlock height={120} /> : pendingStalls.length === 0 ? (
              <EmptyState compact illustration="store" title="No stalls waiting" description="New stall applications will appear here for a quick approve or reject." />
            ) : (
              <ul className="ad-approvals">
                {pendingStalls.slice(0, 5).map((stall) => (
                  <li key={stall.id}>
                    <span className="ad-approval-logo">{stall.logo_url ? <img src={stall.logo_url} alt="" /> : <Store aria-hidden="true" />}</span>
                    <span className="ad-approval-text"><strong>{stall.name}</strong><small>{stall.location || "No location yet"} · applied {new Date(stall.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</small></span>
                    <button type="button" className="btn btn-primary btn-sm" disabled={actingId === stall.id} onClick={() => reviewStall(stall.id, "approved")}><Check aria-hidden="true" /> Approve</button>
                    <button type="button" className="btn btn-outline btn-sm ad-reject" disabled={actingId === stall.id} onClick={() => reviewStall(stall.id, "rejected")}><X aria-hidden="true" /> Reject</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
