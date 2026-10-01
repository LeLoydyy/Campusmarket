import "./AdminWorkspace.css";
import { useState, useEffect } from "react";
import Sidebar from "../../components/common/Sidebar.jsx";
import { EmptyState } from "../../components/common/Ui.jsx";
import { adminService, stallService } from "../../services/api.js";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { FiSearch, FiCheck, FiX, FiPause, FiRefreshCw } from "react-icons/fi";

const STATUS_TABS = ["all", "pending", "approved", "rejected", "suspended"];

export default function ManageStalls() {
  const [stalls, setStalls] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
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
    return matchTab && matchSearch;
  });

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
              Refresh
            </button>
          </div>
        </div>

        <div className="dashboard-content">
          {/* Search */}
          <div
            style={{
              position: "relative",
              maxWidth: 360,
              marginBottom: "1.25rem",
            }}
          >
            <FiSearch
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--gray-400)",
              }}
            />
            <input
              className="form-input"
              placeholder="Search stalls or owners..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>

          {/* Status tabs */}
          <div className="stall-tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                className={`stall-tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <span style={{ textTransform: "capitalize" }}>{tab}</span>
                {tabCount(tab) > 0 && (
                  <span
                    className={`tab-count ${activeTab === tab ? "active" : ""}`}
                  >
                    {tabCount(tab)}
                  </span>
                )}
              </button>
            ))}
          </div>

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

                    <label className="form-label" style={{ marginTop: "1rem" }}>Account plan
                      <select className="form-input" value={stall.tier || "free"} disabled={actingId === stall.id} onChange={async (e) => {
                        setActingId(stall.id);
                        try {
                          const { data } = await adminService.setPlan(stall.id, e.target.value);
                          setStalls((current) => current.map((item) => item.id === stall.id ? data : item));
                          toast.success("Plan updated");
                        } catch (error) { toast.error(error.response?.data?.error || "Plan update failed"); }
                        finally { setActingId(null); }
                      }}><option value="free">Free · 5 listings</option><option value="premium">Premium · 25 listings · POS, advertising & analytics</option></select>
                    </label>
                    <p className="text-sm text-muted">{stall.product_count || 0} listings · {stall.location}</p>
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
