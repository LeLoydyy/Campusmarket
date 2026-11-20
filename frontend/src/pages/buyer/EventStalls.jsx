import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, MapPin, Navigation, Store } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import EventMap from "../../components/map/EventMap.jsx";
import { SPACE_CATEGORIES, SPACE_STATUSES, spaceStatus, StallMapLegend } from "../../components/map/StallMap.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { productService } from "../../services/api.js";
import eventService from "../../services/eventService.js";
import { formatCurrency } from "../../utils/formatCurrency.js";
import { directionsUrl, hasPin } from "../../utils/geo.js";
import { calendarLink, eventStatus, formatEventDate, plural } from "../../utils/marketplace.js";
import { effectivePrice } from "../../utils/pricing.js";
import "./EventStalls.css";

const sellerName = (space) => space.sellerStallName || space.name || space.sellerName || "Campus seller";

/** What a seller at the event sells: loaded when their pin is chosen, kept per stall. */
function SellerProducts({ space }) {
  const cache = useRef(new Map());
  const stallId = space.sellerStallId;
  const [state, setState] = useState({ loading: true, products: [], total: 0, error: "" });

  useEffect(() => {
    if (!stallId) { setState({ loading: false, products: [], total: 0, error: "" }); return undefined; }
    if (cache.current.has(stallId)) { setState(cache.current.get(stallId)); return undefined; }
    let active = true;
    setState({ loading: true, products: [], total: 0, error: "" });
    productService.getAll({ stall_id: stallId, limit: 6 })
      .then(({ data }) => {
        const products = Array.isArray(data?.data) ? data.data : [];
        const next = { loading: false, products, total: Number(data?.total) || products.length, error: "" };
        cache.current.set(stallId, next);
        if (active) setState(next);
      })
      .catch(() => { if (active) setState({ loading: false, products: [], total: 0, error: "We couldn't load this seller's products." }); });
    return () => { active = false; };
  }, [stallId]);

  return (
    <div className="evs-seller-pick">
      <div className="evs-seller-pick-head">
        <span className="evs-seller-logo">{space.sellerLogo ? <img src={space.sellerLogo} alt="" /> : <Store aria-hidden="true" />}</span>
        <div>
          <strong>{sellerName(space)}</strong>
          <small>Space {space.stall_number} · {SPACE_CATEGORIES[space.category] || "Mixed"}</small>
        </div>
        {stallId && <Link className="btn btn-primary btn-sm" to={`/stalls/${stallId}`}>Visit stall <ArrowRight aria-hidden="true" /></Link>}
      </div>
      {state.loading ? (
        <div className="evs-products" aria-busy="true"><SkeletonBlock height={64} /><SkeletonBlock height={64} /><SkeletonBlock height={64} /></div>
      ) : state.error ? (
        <p className="evs-products-note">{state.error}</p>
      ) : state.products.length === 0 ? (
        <p className="evs-products-note">{space.productsAvailable?.length ? `Selling: ${space.productsAvailable.join(", ")}.` : "This seller hasn't listed products yet. Drop by their stall at the event."}</p>
      ) : (
        <>
          <h3 className="evs-products-title">What they sell</h3>
          <ul className="evs-products">
            {state.products.map((product) => (
              <li key={product.id}>
                <Link to={`/products/${product.id}`} className="evs-product">
                  <span className="evs-product-img">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" /> : <Store aria-hidden="true" />}</span>
                  <span className="evs-product-text">
                    <strong>{product.name}</strong>
                    <small>{formatCurrency(effectivePrice(product))}{Number(product.stock) < 1 ? " · Sold out" : ""}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {state.total > state.products.length && stallId && (
            <Link className="cm-link evs-products-more" to={`/stalls/${stallId}`}>See all {state.total} products</Link>
          )}
        </>
      )}
    </div>
  );
}

/** Buyer-facing stall map on the real map: see who's selling where and what they sell. */
export default function EventStalls() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // ?space=<id> (from the home page map) opens with that space chosen.
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => searchParams.get("space"));
  const panel = useRef(null);

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

  const landmarks = useMemo(() => (event?.landmarks || []).filter(hasPin), [event]);
  const pinned = useMemo(() => [...stalls].filter(hasPin).sort((a, b) => a.stall_number - b.stall_number), [stalls]);
  const sellers = pinned.filter((space) => spaceStatus(space) === "occupied");
  const openCount = pinned.filter((space) => spaceStatus(space) === "available").length;
  const selected = pinned.find((space) => space.id === selectedId);
  const status = event ? eventStatus(event) : "upcoming";
  const calendar = event && status !== "past" ? calendarLink(event) : null;
  const applyLink = user?.role === "seller" ? "/seller/apply" : user ? "/open-store" : "/register";

  // Choosing a seller from the list: show their products, which sit under the map.
  const pickFromList = (id) => {
    setSelectedId(id);
    requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

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
                <div className="evs-head-actions">
                  {hasPin(event) && status !== "past" && <a className="btn btn-on-dark" href={directionsUrl(event)} target="_blank" rel="noreferrer"><Navigation aria-hidden="true" /> Directions</a>}
                  {calendar && <a className="btn btn-gold" href={calendar} target="_blank" rel="noreferrer"><CalendarPlus aria-hidden="true" /> Add to calendar</a>}
                </div>
              </div>
            </header>

            {pinned.length === 0 ? (
              <EmptyState illustration="map" title="The stall map isn't ready yet" description="Organisers are still pinning the stalls on the map. Check back closer to the event." action={{ label: "See other events", to: "/events" }} />
            ) : (
              <div className="evs-layout">
                <section className="evs-map-card" aria-labelledby="map-title">
                  <div className="evs-map-bar">
                    <h2 id="map-title">Stall map <small>{plural(pinned.length, "space")}</small></h2>
                  </div>
                  <EventMap spaces={pinned} landmarks={landmarks} mode="view" center={event} selectedId={selectedId} onSelect={setSelectedId} label={`Stall map for ${event.name}`} />
                  <p className="evs-hint">Tap a seller's pin to see what they sell. Use the layers button for satellite or street view.</p>
                  <div ref={panel} className="evs-selected-wrap" aria-live="polite">
                    {selected && spaceStatus(selected) === "occupied" && <SellerProducts space={selected} />}
                    {selected && spaceStatus(selected) !== "occupied" && (
                      <div className="evs-selected">
                        <strong>Space {selected.stall_number}</strong>
                        <span>{SPACE_CATEGORIES[selected.category] || "Mixed"} · {selected.size} · {formatCurrency(selected.price)}</span>
                        <span className={`cm-chip cm-chip--sm cm-tone-${spaceStatus(selected) === "reserved" ? "gold" : "green"}`}>{SPACE_STATUSES[spaceStatus(selected)]}</span>
                        {spaceStatus(selected) === "available" && status !== "past" && (
                          <Link className="btn btn-primary btn-sm" to={applyLink}>Want to sell here? Apply</Link>
                        )}
                      </div>
                    )}
                  </div>
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
                            <button type="button" className={`evs-seller ${selectedId === space.id ? "is-active" : ""}`} aria-pressed={selectedId === space.id} onClick={() => pickFromList(space.id)}>
                              <span className="evs-seller-logo">{space.sellerLogo ? <img src={space.sellerLogo} alt="" /> : <Store aria-hidden="true" />}</span>
                              <span>
                                <strong>{sellerName(space)}</strong>
                                <small>Space {space.stall_number}{space.productsAvailable?.length ? ` · ${space.productsAvailable.slice(0, 2).join(", ")}` : ""}</small>
                              </span>
                            </button>
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
                      <Link className="btn btn-gold" to={applyLink}>Apply for a stall</Link>
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
