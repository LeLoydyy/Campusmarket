import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, Search, Store } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import EventCard from "../../components/ui/EventCard.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Illustration from "../../components/ui/Illustration.jsx";
import { FilterChip } from "../../components/ui/Chip.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import eventService from "../../services/eventService.js";
import { calendarLink, eventStart, eventStatus, formatEventDate, parseEventDate } from "../../utils/marketplace.js";
import "./BuyerEvents.css";

const TABS = [
  { value: "all", label: "All events" },
  { value: "ongoing", label: "Happening now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];
const ORDER = { ongoing: 0, upcoming: 1, past: 2 };

export default function BuyerEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const load = () => {
    setLoading(true);
    eventService.getAll()
      .then(({ data }) => { setEvents(Array.isArray(data) ? data : []); setError(""); })
      .catch((requestError) => setError(requestError.response?.data?.error || "We couldn't load events."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Live first, then upcoming (soonest first), then past (most recent first).
  const sorted = useMemo(() => [...events].sort((a, b) => {
    const sa = eventStatus(a), sb = eventStatus(b);
    if (sa !== sb) return ORDER[sa] - ORDER[sb];
    const da = parseEventDate(eventStart(a)) || 0, db = parseEventDate(eventStart(b)) || 0;
    return sa === "past" ? db - da : da - db;
  }), [events]);

  const counts = useMemo(() => sorted.reduce((acc, event) => { acc[eventStatus(event)] += 1; acc.all += 1; return acc; }, { all: 0, ongoing: 0, upcoming: 0, past: 0 }), [sorted]);
  const visible = sorted.filter((event) => (tab === "all" || eventStatus(event) === tab)
    && (!query.trim() || `${event.name} ${event.location} ${event.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())));
  const next = sorted.find((event) => eventStatus(event) !== "past");
  const applyTo = user?.role === "seller" ? "/seller/apply" : user ? "/open-store" : "/register";

  return (
    <div className="bev">
      <Navbar />
      <main className="bev-wrap">
        <header className="bev-head">
          <div>
            <p className="cm-eyebrow">Around CSUCC</p>
            <h1>Campus fairs & pop-ups</h1>
            <p>See what's on, explore each event's stall map, and find your favourite sellers on the day.</p>
          </div>
          <Illustration name="calendar" size={150} />
        </header>

        <div className="bev-controls">
          <div className="bev-tabs" role="tablist" aria-label="Filter events">
            {TABS.map((item) => (
              <FilterChip key={item.value} role="tab" aria-selected={tab === item.value} active={tab === item.value} count={counts[item.value]} onClick={() => setTab(item.value)}>
                {item.value === "ongoing" && counts.ongoing > 0 && <i className="bev-live" aria-hidden="true" />}
                {item.label}
              </FilterChip>
            ))}
          </div>
          <label className="bev-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search events or locations</span>
            <input type="search" placeholder="Search events or places" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {loading ? (
          <div className="ec-grid">{[0, 1, 2].map((i) => <SkeletonBlock key={i} height={380} />)}</div>
        ) : error ? (
          <EmptyState illustration="calendar" title="Events didn't load" description={error} action={{ label: "Try again", onClick: load }} />
        ) : visible.length === 0 ? (
          <EmptyState
            illustration="calendar"
            title={events.length ? "No events match" : "No events yet"}
            description={events.length ? "Try another tab or search term." : "When the next campus fair is announced, you'll find its stall map here."}
            action={events.length ? { label: "Show all events", onClick: () => { setTab("all"); setQuery(""); } } : { label: "Browse products", to: "/browse" }}
          />
        ) : (
          <div className="ec-grid bev-grid">
            {visible.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        )}

        <section className="bev-ctas" aria-label="Get involved">
          <article className="bev-cta bev-cta--calendar">
            <CalendarPlus aria-hidden="true" />
            <div>
              <h2>{next ? `Don't miss ${next.name}` : "Stay in the loop"}</h2>
              <p>{next ? `${formatEventDate(next)} at ${next.location}. Add it to your calendar so you catch your favourite stalls.` : "New fairs are posted here first — check back soon."}</p>
            </div>
            {next && <a className="btn btn-primary" href={calendarLink(next)} target="_blank" rel="noreferrer">Add to calendar</a>}
          </article>
          <article className="bev-cta bev-cta--sell">
            <Store aria-hidden="true" />
            <div>
              <h2>Want to sell here?</h2>
              <p>Bring your stall to the next fair. Apply for a space and an administrator will confirm your spot on the map.</p>
            </div>
            <Link className="btn btn-gold" to={applyTo}>Apply for a stall</Link>
          </article>
        </section>
      </main>
      <Footer />
    </div>
  );
}
