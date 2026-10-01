import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { analyticsService } from "../../services/api.js";
import {
  FiAlertCircle,
  FiBarChart2,
  FiDollarSign,
  FiRefreshCw,
  FiShoppingBag,
  FiStar,
  FiTrendingUp,
} from "react-icons/fi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { CHART } from "../../utils/chartColors.js";
import EmptyState from "../../components/ui/EmptyState.jsx";
import "./Analytics.css";

const PERIOD_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
];

const CHART_COLORS = [
  CHART.green,
  CHART.gold,
  CHART.teal,
  CHART.coral,
  "#F6A58C",
  "#9AA59E",
];

const extractObject = (payload, key) =>
  payload?.data?.[key] || payload?.[key] || payload?.data || payload || {};

const extractArray = (payload, key) => {
  const value =
    payload?.data?.[key] ?? payload?.[key] ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatCompactCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);

const formatChartDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "MMM d");
};

const titleCase = (value) =>
  String(value || "Other")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeTopProduct = (record, index) => {
  const product = record?.product || record?.products || {};
  return {
    id: record?.product_id || product.id || record?.id || `product-${index}`,
    name:
      product.name ||
      record?.product_name ||
      record?.name ||
      "Untitled product",
    category: product.category || record?.category || "other",
    sold:
      Number(
        record?.total_sold ?? record?.sold_count ?? record?.quantity_sold ?? 0,
      ) || 0,
    revenue: Number(record?.revenue ?? record?.total_revenue ?? 0) || 0,
  };
};

const normalizeCategory = (record, index) => ({
  id: record?.category || record?.name || `category-${index}`,
  name: titleCase(record?.category || record?.name),
  revenue:
    Number(record?.revenue ?? record?.total_revenue ?? record?.value ?? 0) || 0,
  orders: Number(record?.orders ?? record?.order_count ?? 0) || 0,
});

function AnalyticsMetric({
  icon,
  label,
  value,
  note,
  tone = "green",
  loading,
}) {
  return (
    <article className={`analytics-metric tone-${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        {loading ? (
          <i className="analytics-shimmer" />
        ) : (
          <strong>{value}</strong>
        )}
        <p>{note}</p>
      </div>
    </article>
  );
}

function ChartEmpty({ title, description }) {
  return (
    <EmptyState
      compact
      className="analytics-chart-empty"
      illustration="sprout"
      title={title}
      description={description}
      action={{ label: "Manage products", to: "/seller/products" }}
    />
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState("30");
  const [sales, setSales] = useState({});
  const [topProducts, setTopProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [premiumRequired, setPremiumRequired] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestSequence = useRef(0);

  const loadAnalytics = useCallback(
    async ({ quiet = false } = {}) => {
      const requestId = ++requestSequence.current;
      quiet ? setRefreshing(true) : setLoading(true);
      setError("");

      const results = await Promise.allSettled([
        analyticsService.getSales(Number(period)),
        analyticsService.getTopProducts(Number(period)),
        analyticsService.getCategories(Number(period)),
      ]);

      if (requestId !== requestSequence.current) return;

      const [salesResult, productsResult, categoriesResult] = results;
      setPremiumRequired(results.some((result) => result.status === "rejected" && result.reason.response?.data?.code === "PREMIUM_REQUIRED"));
      const failedCount = results.filter(
        (result) => result.status === "rejected",
      ).length;

      if (salesResult.status === "fulfilled") {
        setSales(extractObject(salesResult.value.data, "sales"));
      }
      if (productsResult.status === "fulfilled") {
        setTopProducts(
          extractArray(productsResult.value.data, "products").map(
            normalizeTopProduct,
          ),
        );
      }
      if (categoriesResult.status === "fulfilled") {
        setCategories(
          extractArray(categoriesResult.value.data, "categories").map(
            normalizeCategory,
          ),
        );
      }

      if (failedCount > 0) {
        setError(
          failedCount === results.length
            ? "Analytics are temporarily unavailable. Please try again."
            : "Some analytics could not be updated. Available sections are still shown.",
        );
      } else {
        setLastUpdated(new Date());
      }

      setLoading(false);
      setRefreshing(false);
    },
    [period],
  );

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const timeline = useMemo(
    () =>
      (Array.isArray(sales?.timeline) ? sales.timeline : [])
        .map((entry) => ({
          date: formatChartDate(entry?.date || entry?.day || entry?.created_at),
          Revenue: Number(entry?.revenue ?? entry?.total_revenue ?? 0) || 0,
          Orders: Number(entry?.orders ?? entry?.order_count ?? 0) || 0,
        }))
        .filter((entry) => entry.date),
    [sales],
  );

  const productChart = useMemo(
    () =>
      topProducts.slice(0, 8).map((product) => ({
        name:
          product.name.length > 17
            ? `${product.name.slice(0, 17)}…`
            : product.name,
        Sold: product.sold,
      })),
    [topProducts],
  );

  const categoryChart = useMemo(
    () => categories.filter((category) => category.revenue > 0),
    [categories],
  );

  const categoryRevenue = categoryChart.reduce(
    (sum, category) => sum + category.revenue,
    0,
  );
  const totalRevenue =
    Number(sales?.total_revenue) ||
    timeline.reduce((sum, item) => sum + item.Revenue, 0);
  const totalOrders =
    Number(sales?.total_orders) ||
    timeline.reduce((sum, item) => sum + item.Orders, 0);
  const averageOrder =
    Number(sales?.avg_order_value) ||
    (totalOrders > 0 ? totalRevenue / totalOrders : 0);
  const bestProduct = topProducts[0];
  const bestCategory = [...categoryChart].sort(
    (a, b) => b.revenue - a.revenue,
  )[0];
  const selectedPeriod =
    PERIOD_OPTIONS.find((option) => option.value === period)?.label ||
    `${period} days`;

  if (premiumRequired) return <div className="dashboard-layout"><Sidebar /><main className="dashboard-main"><div className="dashboard-content"><section className="card" style={{ padding: "2rem" }}><h1>Product analytics with Premium</h1><p>Understand sales, popular products, and category performance. Premium also includes up to 25 listings, the point of sale with printable receipts, and landing-page advertising.</p><p>Contact the campus administrator to request a plan change.</p><a href="/seller/products" className="btn btn-primary">Back to my products</a></section></div></main></div>;

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
            <div
              className="analytics-period-toggle"
              aria-label="Analytics period"
            >
              {PERIOD_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={period === option.value ? "active" : ""}
                  onClick={() => setPeriod(option.value)}
                  aria-pressed={period === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="analytics-refresh-button"
              onClick={() => loadAnalytics({ quiet: true })}
              disabled={loading || refreshing}
              aria-label="Refresh analytics"
            >
              <FiRefreshCw className={refreshing ? "is-spinning" : ""} />
            </button>
          </div>
        </header>

        <div className="dashboard-content seller-analytics-content">
          {error && (
            <div className="analytics-error" role="alert">
              <FiAlertCircle />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => loadAnalytics({ quiet: true })}
              >
                Retry
              </button>
            </div>
          )}

          <section className="analytics-overview">
            <div>
              <span>Performance overview</span>
              <h2>Your stall at a glance</h2>
              <p>
                Showing sales activity and product performance for the last{" "}
                {selectedPeriod}.
              </p>
            </div>
            <div className="analytics-overview-highlights">
              <div>
                <FiStar />
                <span>
                  <small>Top product</small>
                  <strong>{bestProduct?.name || "No sales yet"}</strong>
                </span>
              </div>
              <div>
                <FiBarChart2 />
                <span>
                  <small>Top category</small>
                  <strong>{bestCategory?.name || "No category data"}</strong>
                </span>
              </div>
            </div>
          </section>

          <section
            className="analytics-metrics-grid"
            aria-label="Analytics summary"
          >
            <AnalyticsMetric
              icon={<FiDollarSign />}
              label="Total revenue"
              value={formatCurrency(totalRevenue)}
              note={`Last ${selectedPeriod}`}
              tone="gold"
              loading={loading}
            />
            <AnalyticsMetric
              icon={<FiShoppingBag />}
              label="Total orders"
              value={totalOrders}
              note="Orders received"
              loading={loading}
            />
            <AnalyticsMetric
              icon={<FiTrendingUp />}
              label="Average order"
              value={formatCurrency(averageOrder)}
              note="Revenue per order"
              tone="blue"
              loading={loading}
            />
            <AnalyticsMetric
              icon={<FiBarChart2 />}
              label="Categories sold"
              value={categories.length}
              note="Product categories"
              tone="purple"
              loading={loading}
            />
          </section>

          <section className="analytics-panel analytics-revenue-panel">
            <div className="analytics-panel-header">
              <div>
                <span>Sales trend</span>
                <h2>Revenue and orders over time</h2>
              </div>
              <div className="analytics-chart-key">
                <span>
                  <i className="revenue" /> Revenue
                </span>
                <span>
                  <i className="orders" /> Orders
                </span>
              </div>
            </div>
            <div className="analytics-wide-chart">
              {loading ? (
                <div className="analytics-chart-skeleton analytics-shimmer" />
              ) : timeline.length === 0 ? (
                <ChartEmpty
                  title="No activity for this period"
                  description="Revenue and order trends will appear after buyers complete purchases."
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={timeline}
                    margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke={CHART.grid}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 13, fill: CHART.ink }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={18}
                    />
                    <YAxis
                      yAxisId="revenue"
                      tick={{ fontSize: 13, fill: CHART.ink }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatCompactCurrency}
                    />
                    <YAxis
                      yAxisId="orders"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 13, fill: CHART.ink }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: `1px solid ${CHART.grid}`,
                        boxShadow: "0 10px 28px rgba(15,52,34,.1)",
                        fontSize: 13,
                      }}
                      formatter={(value, name) => [
                        name === "Revenue" ? formatCurrency(value) : value,
                        name,
                      ]}
                    />
                    <Line
                      yAxisId="revenue"
                      type="monotone"
                      dataKey="Revenue"
                      stroke={CHART.green}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: CHART.green,
                        stroke: CHART.surface,
                        strokeWidth: 2,
                      }}
                    />
                    <Line
                      yAxisId="orders"
                      type="monotone"
                      dataKey="Orders"
                      stroke={CHART.gold}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="analytics-lower-grid">
            <article className="analytics-panel">
              <div className="analytics-panel-header">
                <div>
                  <span>Product ranking</span>
                  <h2>Top products by units sold</h2>
                </div>
              </div>
              <div className="analytics-small-chart">
                {loading ? (
                  <div className="analytics-chart-skeleton analytics-shimmer" />
                ) : productChart.length === 0 ? (
                  <ChartEmpty
                    title="No product sales yet"
                    description="Your best-selling products will appear here."
                  />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productChart}
                      layout="vertical"
                      margin={{ top: 5, right: 15, left: 5, bottom: 0 }}
                    >
                      <CartesianGrid
                        horizontal={false}
                        strokeDasharray="3 3"
                        stroke={CHART.grid}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 13, fill: CHART.ink }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={108}
                        tick={{ fontSize: 13, fill: CHART.ink }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: `1px solid ${CHART.grid}`,
                          fontSize: 13,
                        }}
                      />
                      <Bar
                        dataKey="Sold"
                        fill={CHART.green}
                        radius={[0, 5, 5, 0]}
                        maxBarSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="analytics-panel">
              <div className="analytics-panel-header">
                <div>
                  <span>Revenue mix</span>
                  <h2>Revenue by category</h2>
                </div>
              </div>
              {loading ? (
                <div className="analytics-category-loading analytics-shimmer" />
              ) : categoryChart.length === 0 ? (
                <div className="analytics-small-chart">
                  <ChartEmpty
                    title="No category revenue yet"
                    description="Category contribution appears after products are sold."
                  />
                </div>
              ) : (
                <div className="analytics-category-layout">
                  <div className="analytics-pie-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryChart}
                          dataKey="revenue"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={75}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {categoryChart.map((category, index) => (
                            <Cell
                              key={category.id}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [
                            formatCurrency(value),
                            "Revenue",
                          ]}
                          contentStyle={{
                            borderRadius: 12,
                            border: `1px solid ${CHART.grid}`,
                            fontSize: 13,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div>
                      <strong>{formatCurrency(categoryRevenue)}</strong>
                      <span>Total</span>
                    </div>
                  </div>
                  <div className="analytics-category-list">
                    {categoryChart.slice(0, 6).map((category, index) => (
                      <div key={category.id}>
                        <i
                          style={{
                            background:
                              CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                        <span>
                          <strong>{category.name}</strong>
                          <small>
                            {categoryRevenue > 0
                              ? (
                                  (category.revenue / categoryRevenue) *
                                  100
                                ).toFixed(1)
                              : 0}
                            %
                          </small>
                        </span>
                        <b>{formatCurrency(category.revenue)}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </section>

          {!loading && topProducts.length > 0 && (
            <section className="analytics-panel analytics-product-table-panel">
              <div className="analytics-panel-header">
                <div>
                  <span>Detailed results</span>
                  <h2>Product performance</h2>
                </div>
                <small>{topProducts.length} {topProducts.length === 1 ? "product" : "products"}</small>
              </div>
              <div className="analytics-table-wrap">
                <table className="seller-analytics-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Units sold</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((product, index) => (
                      <tr key={product.id}>
                        <td data-label="Rank">
                          <span className={index < 3 ? "top" : ""}>
                            #{index + 1}
                          </span>
                        </td>
                        <td data-label="Product">
                          <strong>{product.name}</strong>
                        </td>
                        <td data-label="Category">
                          <span
                            className={`analytics-category-badge cat-${product.category}`}
                          >
                            {titleCase(product.category)}
                          </span>
                        </td>
                        <td data-label="Units sold">{product.sold}</td>
                        <td data-label="Revenue">
                          <strong>{formatCurrency(product.revenue)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {lastUpdated && (
            <p className="analytics-last-updated">
              Last updated {format(lastUpdated, "MMM d, yyyy · h:mm a")}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
