import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CalendarPlus, MapPin, Minus, Plus, Store } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import StallMap, { placeSpaces, SPACE_CATEGORIES, SPACE_STATUSES, StallMapLegend } from "../../components/map/StallMap.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import eventService from "../../services/eventService.js";
import { formatCurrency } from "../../utils/formatCurrency.js";
import { calendarLink, eventStatus, formatEventDate, plural } from "../../utils/marketplace.js";
import "./EventStalls.css";

const statusOf = (space) => (space.status === "occupied" || space.seller_id ? "occupied" : space.status === "reserved" ? "reserved" : "available");

/** Buyer-facing, read-only stall map: see who's selling where and jump to their stall. */
export default function EventStalls() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([eventService.getOne(eventId), eventService.getStalls(eventId)])
      .then(([eventResponse, stallsResponse]) => {
        if (!active) return;
        setEvent(eventResponse.data);
        setStalls(Array.isArray(stallsResponse.data) ? stallsResponse.data : []);
        setError("");
      })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.error || "We couldn't load this event."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId]);

  const landmarks = event?.landmarks || [];
  const placed = useMemo(() => placeSpaces(stalls, landmarks), [stalls, landmarks]);
  const sellers = placed.filter((space) => statusOf(space) === "occupied");
  const openCount = placed.filter((space) => statusOf(space) === "available").length;
  const selected = placed.find((space) => space.id === selectedId);
  const status = event ? eventStatus(event) : "upcoming";
  const calendar = event && status !== "past" ? calendarLink(event) : null;

  return (
    <div className="evs">
      <Navbar />
      <main className="evs-wrap">
        <Link to="/events" className="cm-link evs-back"><ArrowLeft aria-hidden="true" /> All events</Link>

        {loading ? (
          <><SkeletonBlock height={150} /><SkeletonBlock height={420} className="evs-skel" /></>
        ) : error || !event ? (
          <EmptyState illustration="map" title="Event not found" description={error || "This event may have been removed."} action={{ label: "Browse events", to: "/events" }} />
        ) : (
          <>
            <header className={`evs-head evs-head--${status}`}>
              <div>
                <p className="cm-eyebrow">{status === "ongoing" ? "Happening now" : status === "upcoming" ? "Upcoming event" : "Past event"} · Stall map</p>
                <h1>{event.name}</h1>
                <p className="evs-meta"><CalendarDays aria-hidden="true" /> {formatEventDate(event)} <span aria-hidden="true">·</span> <MapPin aria-hidden="true" /> {event.location}</p>
                {event.description && <p className="evs-desc">{event.description}</p>}
              </div>
              <div className="evs-head-side">
                <dl className="evs-counts">
                  <div><dt>Sellers</dt><dd>{sellers.length}</dd></div>
                  <div><dt>Open spaces</dt><dd>{openCount}</dd></div>
                </dl>
                {calendar && <a className="btn btn-gold" href={calendar} target="_blank" rel="noreferrer"><CalendarPlus aria-hidden="true" /> Add to calendar</a>}
              </div>
            </header>

            {placed.length === 0 ? (
              <EmptyState illustration="map" title="The stall map isn't ready yet" description="Organisers are still planning the layout. Check back closer to the event." action={{ label: "See other events", to: "/events" }} />
            ) : (
              <div className="evs-layout">
                <section className="evs-map-card" aria-labelledby="map-title">
                  <div className="evs-map-bar">
                    <h2 id="map-title">Stall map <small>{plural(placed.length, "space")}</small></h2>
                    <div className="evs-zoom" role="group" aria-label="Zoom">
                      <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} disabled={zoom <= 1} aria-label="Zoom out"><Minus aria-hidden="true" /></button>
                      <span aria-live="polite">{Math.round(zoom * 100)}%</span>
                      <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} disabled={zoom >= 2} aria-label="Zoom in"><Plus aria-hidden="true" /></button>
                    </div>
                  </div>
                  <StallMap stalls={placed} landmarks={landmarks} mode="view" zoom={zoom} selectedId={selectedId} onSelect={setSelectedId} label={`Stall map for ${event.name}`} />
                  <p className="evs-hint">Tap a seller's space to visit their stall. Tap an open space to see its size and fee.</p>
                  {selected && statusOf(selected) !== "occupied" && (
                    <div className="evs-selected" role="status">
                      <strong>Space {selected.stall_number}</strong>
                      <span>{SPACE_CATEGORIES[selected.category] || "Mixed"} · {selected.size} · {formatCurrency(selected.price)}</span>
                      <span className={`cm-chip cm-chip--sm cm-tone-${statusOf(selected) === "reserved" ? "gold" : "green"}`}>{SPACE_STATUSES[statusOf(selected)]}</span>
                      {statusOf(selected) === "available" && status !== "past" && (
                        <Link className="btn btn-primary btn-sm" to={user?.role === "seller" ? "/seller/apply" : user ? "/open-store" : "/register"}>Want to sell here? Apply</Link>
                      )}
                    </div>
                  )}
                </section>

                <aside className="evs-side">
                  <section className="evs-panel">
                    <h2>Sellers at this event</h2>
                    {sellers.length === 0 ? (
                      <EmptyState compact illustration="store" title="No sellers yet" description="Spaces are still open for this event." />
                    ) : (
                      <ul className="evs-sellers">
                        {sellers.map((space) => (
                          <li key={space.id}>
                            <Link to={space.sellerStallId ? `/stalls/${space.sellerStallId}` : "/stalls"} className="evs-seller">
                              <span className="evs-seller-logo">{space.sellerLogo ? <img src={space.sellerLogo} alt="" /> : <Store aria-hidden="true" />}</span>
                              <span>
                                <strong>{space.sellerStallName || space.name || space.sellerName || "Campus seller"}</strong>
                                <small>Space {space.stall_number}{space.productsAvailable?.length ? ` · ${space.productsAvailable.slice(0, 2).join(", ")}` : ""}</small>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="evs-panel"><StallMapLegend /></section>
                  {status !== "past" && openCount > 0 && (
                    <section className="evs-panel evs-cta">
                      <h2>Want to sell here?</h2>
                      <p>{plural(openCount, "space")} still open. Apply with your stall and an administrator will confirm your spot.</p>
                      <Link className="btn btn-gold" to={user?.role === "seller" ? "/seller/apply" : user ? "/open-store" : "/register"}>Apply for a stall</Link>
                    </section>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
