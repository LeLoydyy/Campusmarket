import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import eventService from "../../services/eventService.js";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiMapPin,
  FiRefreshCw,
  FiSearch,
  FiShoppingBag,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import "./SellerReservations.css";
import EmptyState from "../../components/ui/EmptyState.jsx";

const FILTERS = ["all", "pending", "approved", "rejected"];

const extractList = (payload, key) => {
  const value =
    payload?.data?.[key] ?? payload?.[key] ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const normalizeEvent = (event) => ({
  ...event,
  id: event.id || event.event_id,
  name: event.name || event.title || "Untitled event",
  date: event.date || event.start_date || event.starts_at || null,
  endDate: event.end_date || event.ends_at || null,
  location: event.location || event.venue || "Location to be announced",
  description: event.description || "",
});

const normalizeApplication = (application) => {
  const event = application.event ? normalizeEvent(application.event) : null;
  return {
    ...application,
    id: application.id || application.application_id,
    eventId: application.event_id || application.eventId || event?.id,
    event,
    stallName:
      application.stall_name || application.stallName || "Untitled stall",
    businessName: application.business_name || application.businessName || "",
    category:
      application.product_category || application.productCategory || "other",
    products: application.product_list || application.productList || "",
    size:
      Number(
        application.preferred_stall_size ?? application.preferredStallSize,
      ) || 0,
    duration: Number(application.duration) || 0,
    contact: application.contact_info || application.contactInfo || "",
    status: String(application.status || "pending").toLowerCase(),
    createdAt: application.created_at || application.createdAt || null,
    reviewNote: application.review_note || "",
  };
};

const formatDate = (value, options = {}) => {
  if (!value) return "To be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "To be announced";
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
};

const formatCategory = (value) =>
  String(value || "Other")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusIcon = (status) => {
  if (["approved", "reserved"].includes(status)) return FiCheckCircle;
  if (["rejected", "cancelled"].includes(status)) return FiXCircle;
  return FiClock;
};

export default function SellerReservations() {
  const [applications, setApplications] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [eventsError, setEventsError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");

  const loadPage = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    setEventsError("");

    const [applicationResult, eventResult] = await Promise.allSettled([
      eventService.getMyApplications(),
      eventService.getAll(),
    ]);

    if (applicationResult.status === "fulfilled") {
      setApplications(
        extractList(applicationResult.value.data, "applications").map(
          normalizeApplication,
        ),
      );
    } else {
      setApplications([]);
      setError(
        applicationResult.reason?.response?.data?.error ||
          "We couldn't load your applications. Please try again.",
      );
    }

    if (eventResult.status === "fulfilled") {
      setEvents(
        extractList(eventResult.value.data, "events").map(normalizeEvent),
      );
    } else {
      setEvents([]);
      setEventsError(
        eventResult.reason?.response?.data?.error ||
          "Available events could not be loaded.",
      );
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const counts = useMemo(
    () => ({
      all: applications.length,
      pending: applications.filter((item) => item.status === "pending").length,
      approved: applications.filter((item) =>
        ["approved", "reserved"].includes(item.status),
      ).length,
      rejected: applications.filter((item) =>
        ["rejected", "cancelled"].includes(item.status),
      ).length,
    }),
    [applications],
  );

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "approved"
          ? ["approved", "reserved"].includes(application.status)
          : activeFilter === "rejected"
            ? ["rejected", "cancelled"].includes(application.status)
            : application.status === activeFilter);
      const matchesSearch =
        !query ||
        [
          application.stallName,
          application.businessName,
          application.event?.name,
          application.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, applications, search]);

  const availableEvents = useMemo(() => {
    const appliedEventIds = new Set(
      applications.map((item) => String(item.eventId)),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return events
      .filter((event) => {
        if (!event.id || appliedEventIds.has(String(event.id))) return false;
        if (!event.date) return true;
        const date = new Date(event.date);
        return !Number.isNaN(date.getTime()) && date >= today;
      })
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
      .slice(0, 3);
  }, [applications, events]);

  return (
    <div className="dashboard-layout seller-reservations-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar seller-reservations-topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Events & Reservations</h1>
              <p>
                Track stall applications and discover upcoming selling
                opportunities.
              </p>
            </div>
          </div>
          <div className="topbar-right">
            <button
              className="seller-reservations-refresh"
              type="button"
              onClick={() => loadPage(true)}
              disabled={refreshing}
            >
              <FiRefreshCw className={refreshing ? "spinning" : ""} />
              Refresh
            </button>
            <Link className="btn btn-primary btn-sm" to="/seller/apply">
              Apply for a stall
            </Link>
          </div>
        </header>

        <div className="dashboard-content seller-reservations-content">
          {error && !loading && (
            <div className="seller-reservations-error" role="alert">
              <FiAlertCircle />
              <span>{error}</span>
              <button type="button" onClick={() => loadPage()}>
                Try again
              </button>
            </div>
          )}

          <section
            className="seller-reservations-summary"
            aria-label="Application summary"
          >
            <article>
              <span className="tone-blue">
                <FiFileText />
              </span>
              <div>
                <small>Applications</small>
                <strong>{loading ? "—" : counts.all}</strong>
              </div>
            </article>
            <article>
              <span className="tone-gold">
                <FiClock />
              </span>
              <div>
                <small>Pending review</small>
                <strong>{loading ? "—" : counts.pending}</strong>
              </div>
            </article>
            <article>
              <span className="tone-green">
                <FiCheckCircle />
              </span>
              <div>
                <small>Approved</small>
                <strong>{loading ? "—" : counts.approved}</strong>
              </div>
            </article>
            <article>
              <span className="tone-red">
                <FiXCircle />
              </span>
              <div>
                <small>Not approved</small>
                <strong>{loading ? "—" : counts.rejected}</strong>
              </div>
            </article>
          </section>

          <div className="seller-reservations-main-grid">
            <section className="seller-reservations-panel">
              <div className="seller-reservations-panel-heading">
                <div>
                  <small>Your activity</small>
                  <h2>Stall applications</h2>
                </div>
              </div>

              <div
                className="seller-reservations-tabs"
                role="tablist"
                aria-label="Application status"
              >
                {FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    aria-selected={activeFilter === filter}
                    className={activeFilter === filter ? "active" : ""}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter === "all"
                      ? "All"
                      : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    <span>{counts[filter]}</span>
                  </button>
                ))}
              </div>

              <div className="seller-reservations-filter-row">
                <label className="seller-reservations-search">
                  <FiSearch />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search stall, business, or event"
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
              </div>

              {loading ? (
                <div
                  className="seller-reservations-skeleton"
                  aria-label="Loading applications"
                >
                  <i />
                  <i />
                  <i />
                </div>
              ) : !error && visibleApplications.length ? (
                <div className="seller-reservations-list">
                  {visibleApplications.map((application) => {
                    const StatusIcon = statusIcon(application.status);
                    return (
                      <article
                        className="seller-reservation-card"
                        key={application.id}
                      >
                        <div className="seller-reservation-date">
                          <strong>
                            {formatDate(application.event?.date, {
                              day: "2-digit",
                            })
                              .split(" ")[1]
                              ?.replace(",", "") || "—"}
                          </strong>
                          <span>
                            {application.event?.date
                              ? new Date(
                                  application.event.date,
                                ).toLocaleDateString("en-PH", {
                                  month: "short",
                                })
                              : "TBA"}
                          </span>
                        </div>
                        <div className="seller-reservation-copy">
                          <div className="seller-reservation-title-row">
                            <div>
                              <small>
                                {application.event?.name || "Event unavailable"}
                              </small>
                              <h3>{application.stallName}</h3>
                            </div>
                            <span
                              className={`seller-reservation-status status-${application.status}`}
                            >
                              <StatusIcon /> {application.status}
                            </span>
                          </div>
                          <p className="seller-reservation-business">
                            {application.businessName || "Campus seller"} ·{" "}
                            {formatCategory(application.category)}
                          </p>
                          <div className="seller-reservation-meta">
                            <span>
                              <FiMapPin />{" "}
                              {application.event?.location ||
                                "Location unavailable"}
                            </span>
                            <span>
                              <FiShoppingBag />{" "}
                              {application.size
                                ? `${application.size} sqm`
                                : "Size not specified"}
                            </span>
                            <span>
                              <FiClock /> {application.duration} day
                              {application.duration === 1 ? "" : "s"}
                            </span>
                          </div>
                          {application.reviewNote && (
                            <p className="seller-reservation-business">
                              <strong>Administrator note:</strong> {application.reviewNote}
                            </p>
                          )}
                          <footer>
                            <span>
                              Submitted {formatDate(application.createdAt)}
                            </span>
                            {application.eventId && (
                              <Link
                                to={`/events/${application.eventId}/stalls`}
                              >
                                View event stalls <FiArrowRight />
                              </Link>
                            )}
                          </footer>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : !error ? (
                <EmptyState
                  compact
                  illustration={search || activeFilter !== "all" ? "search" : "calendar"}
                  title={search || activeFilter !== "all" ? "No matching applications" : "No applications yet"}
                  description={search || activeFilter !== "all" ? "Try changing your search or status filter." : "Apply to an upcoming event to reserve your first selling space."}
                  action={search || activeFilter !== "all" ? { label: "Clear filters", onClick: () => { setSearch(""); setActiveFilter("all"); } } : { label: "Start an application", to: "/seller/apply" }}
                />
              ) : null}
            </section>

            <aside className="seller-events-panel">
              <div className="seller-events-heading">
                <div>
                  <small>Discover</small>
                  <h2>Upcoming events</h2>
                </div>
                <Link to="/events">See all</Link>
              </div>

              {eventsError ? (
                <div className="seller-events-message">
                  <FiAlertCircle />
                  <p>{eventsError}</p>
                </div>
              ) : loading ? (
                <div className="seller-events-skeleton">
                  <i />
                  <i />
                </div>
              ) : availableEvents.length ? (
                <div className="seller-events-list">
                  {availableEvents.map((event) => (
                    <article key={event.id}>
                      <span>
                        <FiCalendar />
                      </span>
                      <div>
                        <h3>{event.name}</h3>
                        <p>
                          <FiCalendar /> {formatDate(event.date)}
                        </p>
                        <p>
                          <FiMapPin /> {event.location}
                        </p>
                        <Link to={`/seller/apply?eventId=${event.id}`}>
                          Apply now <FiArrowRight />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="seller-events-message">
                  <FiCalendar />
                  <p>No new events are accepting applications right now.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
