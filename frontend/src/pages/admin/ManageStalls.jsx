import "./AdminWorkspace.css";
import { useState, useEffect } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import PremiumRequests from "../../components/admin/PremiumRequests.jsx";
import StallPlanControl, { isExpiringSoon } from "../../components/admin/StallPlanControl.jsx";
import { EmptyState } from "../../components/common/Ui.jsx";
import { adminService, stallService } from "../../services/api.js";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { FiSearch, FiCheck, FiX, FiPause, FiRefreshCw } from "react-icons/fi";

const STATUS_TABS = ["all", "pending", "approved", "rejected", "suspended"];
const PLAN_FILTERS = [["all", "All plans"], ["premium", "Premium"], ["expiring", "Expiring soon"], ["free", "Free"]];

export default function ManageStalls() {
  const [stalls, setStalls] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const fetchStalls = async () => {
    setLoading(true);
    try {
      const { data: allStalls } = await adminService.getStalls();
      setStalls(allStalls);
    } catch {
      toast.error("Failed to load stalls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStalls();
  }, []);

  const handleAction = async (stallId, status) => {
    const labels = {
      approved: "approve",
      rejected: "reject",
      suspended: "suspend",
    };
    if (
      !window.confirm(`Are you sure you want to ${labels[status]} this stall?`)
    )
      return;
    try {
      setActingId(stallId);
      await stallService.updateStatus(stallId, status);
      setStalls((prev) =>
        prev.map((s) => (s.id === stallId ? { ...s, status } : s)),
      );
      toast.success(`Stall ${status} successfully`);
    } catch (error) {
      toast.error(error.response?.data?.error || "Action failed");
    } finally {
      setActingId(null);
    }
  };

  const filtered = stalls.filter((s) => {
    const matchTab = activeTab === "all" || s.status === activeTab;
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.users?.name?.toLowerCase().includes(search.toLowerCase());
    const matchPlan =
      planFilter === "all" ||
      (planFilter === "expiring" ? isExpiringSoon(s) : (s.tier || "free") === planFilter);
    return matchTab && matchSearch && matchPlan;
  });

  const expiringCount = stalls.filter(isExpiringSoon).length;

  const tabCount = (tab) =>
    tab === "all"
      ? stalls.length
      : stalls.filter((s) => s.status === tab).length;

  return (
    <div className="dashboard-layout admin-shell">
      <Sidebar />
      <main className="dashboard-main">
        <div className="topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Manage Stalls</h1>
              <p>Review, approve, and moderate student stalls.</p>
            </div>
          </div>
          <div className="topbar-right">
            <button
              className="btn btn-ghost btn-sm"
              onClick={fetchStalls}
              disabled={loading}
            >
              <FiRefreshCw size={14} className={loading ? "spin" : ""} />{" "}
              <span className="cm-btn-label">Refresh</span>
            </button>
          </div>
        </div>

        <div className="dashboard-content ms-content">
          <PremiumRequests onChanged={fetchStalls} />
          <section className="ms-toolbar" aria-label="Find a stall">
            <div className="ms-tabs" role="group" aria-label="Stall status">
              {STATUS_TABS.map((tab) => (
                <button key={tab} type="button" className={activeTab === tab ? "is-active" : ""} aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}>
                  <span className="ms-tab-label">{tab}</span> <span className="ms-count">{tabCount(tab)}</span>
                </button>
              ))}
            </div>
            <div className="ms-toolbar-row">
              <label className="ms-search">
                <FiSearch aria-hidden="true" />
                <span className="sr-only">Search stalls or owners</span>
                <input type="search" placeholder="Search stalls or owners" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <div className="sp-filters ms-plans" role="group" aria-label="Filter by plan">
                {PLAN_FILTERS.map(([key, label]) => (
                  <button key={key} type="button" className={planFilter === key ? "is-active" : ""} aria-pressed={planFilter === key} onClick={() => setPlanFilter(key)}>
                    {label}
                    {key === "expiring" && expiringCount > 0 && <span>{expiringCount}</span>}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Stalls grid */}
          {loading ? (
            <div className="stalls-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ height: 180, borderRadius: 12 }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="🏪"
              title="No stalls found"
              description={`No ${activeTab === "all" ? "" : activeTab} stalls`}
            />
          ) : (
            <div className="stalls-grid">
              {filtered.map((stall) => (
                <div key={stall.id} className="stall-card card">
                  <div className="stall-card-banner">
                    {stall.banner_url ? (
                      <img src={stall.banner_url} alt={stall.name} />
                    ) : (
                      <div className="stall-banner-ph">🏪</div>
                    )}
                    <span
                      className={`badge stall-status-badge status-${stall.status}`}
                    >
                      {stall.status}
                    </span>
                  </div>

                  <div className="stall-card-body">
                    <p className="stall-card-name">{stall.name}</p>
                    <p className="stall-card-owner text-sm text-muted">
                      by {stall.seller_name || stall.users?.name || "Campus seller"} · {stall.users?.email}
                    </p>
                    {stall.description && (
                      <p className="stall-card-desc text-sm text-muted">
                        {stall.description}
                      </p>
                    )}
                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                      Applied{" "}
                      {format(new Date(stall.created_at), "MMM d, yyyy")}
                    </p>

                    <StallPlanControl
                      stall={stall}
                      onChanged={(updated) => setStalls((current) => current.map((item) => item.id === stall.id ? { ...item, ...updated } : item))}
                    />
                    <p className="text-sm text-muted">{stall.location}</p>
                    <div className="stall-card-actions">
                      {stall.status === "pending" && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleAction(stall.id, "approved")}
                            disabled={actingId === stall.id}
                          >
                            {actingId === stall.id ? (
                              <span
                                className="spinner"
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderWidth: 2,
                                }}
                              />
                            ) : (
                              <>
                                <FiCheck size={13} /> Approve
                              </>
                            )}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleAction(stall.id, "rejected")}
                            disabled={actingId === stall.id}
                          >
                            <FiX size={13} /> Reject
                          </button>
                        </>
                      )}
                      {stall.status === "approved" && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleAction(stall.id, "suspended")}
                          disabled={actingId === stall.id}
                          style={{
                            borderColor: "var(--color-warning)",
                            color: "var(--color-warning)",
                          }}
                        >
                          <FiPause size={13} /> Suspend
                        </button>
                      )}
                      {(stall.status === "rejected" ||
                        stall.status === "suspended") && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleAction(stall.id, "approved")}
                          disabled={actingId === stall.id}
                        >
                          <FiCheck size={13} /> Re-approve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <style>{`
        .admin-shell .dashboard-content.ms-content { display: grid; align-content: start; gap: 1rem; }
        .ms-content > .pr-panel { margin: 0; }
        .ms-toolbar { display: grid; gap: .6rem; padding: .6rem; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
        .ms-tabs { display: inline-flex; flex-wrap: wrap; justify-self: start; gap: 3px; padding: 3px; background: var(--cream-100); border-radius: 11px; }
        .ms-tabs button { display: inline-flex; align-items: center; gap: .35rem; height: 34px; padding: 0 .85rem; color: var(--ink-600); border-radius: 8px; font-size: var(--text-sm); font-weight: 700; }
        .ms-tab-label { text-transform: capitalize; }
        .ms-count { min-width: 20px; padding: 0 .35rem; background: rgba(255,255,255,.75); border-radius: 99px; font-size: .75rem; text-align: center; }
        .ms-tabs button.is-active { color: var(--green-900); background: var(--surface); box-shadow: var(--shadow-1); }
        .ms-tabs button.is-active .ms-count { color: #fff; background: var(--green-700); }
        .ms-toolbar-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .6rem; }
        .ms-search { flex: 0 1 340px; display: flex; align-items: center; gap: .5rem; height: 40px; padding: 0 .8rem; color: var(--ink-600); background: var(--cream-50); border: 1px solid var(--line); border-radius: 10px; }
        .ms-search:focus-within { border-color: var(--green-700); }
        .ms-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--ink-900); font: 500 var(--text-sm) var(--font-body); }
        .ms-plans { margin: 0 !important; }
        @media (max-width: 600px) { .ms-tabs { flex-wrap: nowrap; overflow-x: auto; max-width: 100%; } .ms-search { flex: 1 1 100%; } }
        .stall-tabs { display: flex; gap: 0.25rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
        .stall-tab { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 1rem; border-radius: var(--radius-full); border: 1.5px solid var(--gray-200); background: #fff; font-size: 0.875rem; font-weight: 500; color: var(--gray-600); transition: var(--transition-fast); white-space: nowrap; }
        .stall-tab:hover { border-color: var(--color-primary); color: var(--color-primary); }
        .stall-tab.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .tab-count { background: var(--gray-200); color: var(--gray-700); font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: var(--radius-full); }
        .tab-count.active { background: rgba(255,255,255,0.3); color: #fff; }
        .stalls-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
        .stall-card { display: flex; flex-direction: column; overflow: hidden; }
        .stall-card-banner { height: 100px; position: relative; background: var(--gray-100); overflow: hidden; }
        .stall-card-banner img { width: 100%; height: 100%; object-fit: cover; }
        .stall-banner-ph { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
        .stall-status-badge { position: absolute; top: 8px; right: 8px; }
        .stall-card-body { padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
        .stall-card-name { font-weight: 700; font-size: 1rem; color: var(--gray-900); }
        .stall-card-owner { margin-top: 2px; }
        .stall-card-desc { margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .stall-card-actions { display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.75rem; }
        .spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </div>
  );
}
