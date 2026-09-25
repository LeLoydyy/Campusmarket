import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock3, Gem, Headphones, MapPin, Package, Shirt, Soup, Sparkles, Store } from "lucide-react";
import Navbar from "../../components/common/Navbar.jsx";
import Footer from "../../components/common/Footer.jsx";
import ProductCard from "../../components/ui/ProductCard.jsx";
import StallCard from "../../components/ui/StallCard.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import Illustration from "../../components/ui/Illustration.jsx";
import { categoryKey } from "../../components/ui/Chip.jsx";
import { SkeletonGrid, SkeletonBlock } from "../../components/ui/Skeleton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { productService, stallService, statsService } from "../../services/api.js";
import eventService from "../../services/eventService.js";
import { eventStart, eventStatus, formatEventDate, parseEventDate, plural, stallOpenStatus, timeUntil } from "../../utils/marketplace.js";
import "./Home.css";

const CATEGORY_TILES = [
  { key: "food", label: "Food & drinks", blurb: "Rice meals, snacks, iced coffee", icon: Soup, size: "lg" },
  { key: "clothing", label: "Clothing", blurb: "Varsity tees, hoodies, org shirts", icon: Shirt },
  { key: "electronics", label: "Electronics", blurb: "Chargers, earbuds, flash drives", icon: Headphones },
  { key: "accessories", label: "Accessories", blurb: "Totes, pins, keychains", icon: Gem },
  { key: "student-made", label: "Student Made", blurb: "Handmade by CSUCC students", icon: Sparkles, size: "wide" },
  { key: "other", label: "Everything else", blurb: "School supplies & more", icon: Package },
];

const SUGGEST_EMAIL = import.meta.env.VITE_CONTACT_EMAIL;
const list = (payload) => (Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []);

const minutesAgo = (value) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
};

export default function BuyerHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [stalls, setStalls] = useState([]);
  const [events, setEvents] = useState([]);
  const [products, setProducts] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      statsService.getPublic(),
      stallService.getAll(),
      eventService.getAll(),
      productService.getAll({ limit: 100 }),
      productService.getAll({ featured: true, limit: 24 }),
    ]).then(([statsResult, stallsResult, eventsResult, productsResult, featuredResult]) => {
      if (!active) return;
      if (statsResult.status === "fulfilled") setStats(statsResult.value.data);
      if (stallsResult.status === "fulfilled") setStalls(list(stallsResult.value.data));
      if (eventsResult.status === "fulfilled") setEvents(list(eventsResult.value.data));
      if (productsResult.status === "fulfilled") setProducts(list(productsResult.value.data));
      if (featuredResult.status === "fulfilled") setFeatured(list(featuredResult.value.data));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  // Open stalls first, then by number of listings.
  const openStalls = useMemo(() => [...stalls].sort((a, b) =>
    Number(stallOpenStatus(b).open) - Number(stallOpenStatus(a).open) || Number(b.product_count || 0) - Number(a.product_count || 0)), [stalls]);

  const categoryCounts = useMemo(() => products.reduce((counts, product) => {
    const key = categoryKey(product.category);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {}), [products]);

  // Real featured (Premium) listings, most viewed first. Falls back to the most viewed overall.
  const trending = useMemo(() => {
    const source = featured.length ? featured : products;
    return [...source].sort((a, b) => Number(b.view_count || 0) - Number(a.view_count || 0)).slice(0, 8);
  }, [featured, products]);

  // Student Made spotlight: the stall with the most student-made listings, excluding items already in Trending.
  const spotlight = useMemo(() => {
    const trendingIds = new Set(trending.map((product) => product.id));
    const byStall = {};
    for (const product of products) {
      if (categoryKey(product.category) !== "student-made") continue;
      (byStall[product.stall_id] ||= []).push(product);
    }
    const [stallId, items] = Object.entries(byStall).sort((a, b) => b[1].length - a[1].length)[0] || [];
    if (!stallId) return null;
    const stall = stalls.find((entry) => entry.id === stallId) || items[0].stalls;
    return stall ? { stall, items: items.filter((item) => !trendingIds.has(item.id)).slice(0, 3), total: items.length } : null;
  }, [products, stalls, trending]);

  const nextEvent = useMemo(() => {
    const live = events.find((event) => eventStatus(event) === "ongoing");
    if (live) return live;
    return events
      .filter((event) => eventStatus(event) === "upcoming")
      .sort((a, b) => parseEventDate(eventStart(a)) - parseEventDate(eventStart(b)))[0] || null;
  }, [events]);

  const stallCta = !user ? { to: "/register", label: "Open your stall" }
    : user.role === "buyer" ? { to: "/open-store", label: "Open your stall" }
      : user.role === "seller" ? { to: "/seller/stall", label: "Manage your stall" }
        : { to: "/admin/stalls", label: "Review stalls" };

  return (
    <div className="home">
      <Navbar />
      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero-copy">
            <p className="cm-eyebrow">CSU Cabadbaran's campus marketplace</p>
            <h1 id="home-hero-title">Your campus fair, <span>open every day.</span></h1>
            <p className="home-hero-lede">Order rice bowls from Main Canteen, grab a varsity tee, or discover something a classmate made by hand — then pick it up between classes.</p>
            <div className="home-hero-ctas">
              <Link to="/browse" className="btn btn-primary btn-lg">Start shopping <ArrowRight aria-hidden="true" /></Link>
              <Link to={stallCta.to} className="btn btn-gold-outline btn-lg"><Store aria-hidden="true" /> {stallCta.label}</Link>
            </div>
            <dl className="home-stats" aria-label="Campus Market right now">
              {stats ? (
                <>
                  <div><dt>Active stalls</dt><dd>{stats.active_stalls}</dd></div>
                  <div><dt>Products</dt><dd>{stats.products}</dd></div>
                  <div><dt>{Number(stats.students_served) === 1 ? "Student served" : "Students served"}</dt><dd>{stats.students_served}</dd></div>
                </>
              ) : (
                [0, 1, 2].map((i) => <div key={i}><SkeletonBlock height={46} /></div>)
              )}
            </dl>
          </div>
          <figure className="home-hero-art">
            <img src="/images/buyer/campusmarket-background.png" alt="A Campus Market tote bag and books among leaves in front of the CSUCC building" />
          </figure>
        </section>

        {/* ── Just ordered ticker ─────────────────────────────────────── */}
        {stats?.recent_orders?.length > 0 && (
          <section className="home-ticker" aria-label="Recent orders on campus">
            <span className="home-ticker-label"><i aria-hidden="true" /> Live</span>
            <div className="home-ticker-track">
              {[0, 1].map((copy) => (
                <ul key={copy} aria-hidden={copy === 1 ? true : undefined}>
                  {stats.recent_orders.map((order, index) => (
                    <li key={`${copy}-${index}`}>Someone just ordered <strong>{order.product_name}</strong> · {minutesAgo(order.ordered_at)}</li>
                  ))}
                </ul>
              ))}
            </div>
          </section>
        )}

        <div className="home-wrap">
          {/* ── Open now ───────────────────────────────────────────────── */}
          <section className="home-section" aria-labelledby="open-now-title">
            <div className="cm-section-head">
              <div>
                <p className="cm-eyebrow">Stalls around campus</p>
                <h2 id="open-now-title">Open now</h2>
              </div>
              <Link to="/stalls" className="cm-link">All stalls <ArrowRight aria-hidden="true" /></Link>
            </div>
            {loading ? (
              <div className="home-rail">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} height={220} className="home-rail-skel" />)}</div>
            ) : openStalls.length ? (
              <div className="home-rail" role="list">
                {openStalls.map((stall) => <div role="listitem" key={stall.id} className="home-rail-item"><StallCard stall={stall} /></div>)}
              </div>
            ) : (
              <EmptyState illustration="store" compact title="No stalls are open yet" description="Be the first campus seller — it takes a few minutes to set up." action={{ label: stallCta.label, to: stallCta.to }} />
            )}
          </section>

          {/* ── Shop by category ───────────────────────────────────────── */}
          <section className="home-section" aria-labelledby="categories-title">
            <div className="cm-section-head">
              <div>
                <p className="cm-eyebrow">Find it fast</p>
                <h2 id="categories-title">Shop by category</h2>
              </div>
            </div>
            <div className="home-bento">
              {CATEGORY_TILES.map(({ key, label, blurb, icon: Icon, size }) => (
                <Link key={key} to={`/browse?category=${key}`} className={`home-tile home-tile--${key} ${size ? `home-tile--${size}` : ""}`}>
                  <span className="home-tile-icon" aria-hidden="true"><Icon /></span>
                  <span className="home-tile-text">
                    <strong>{label}</strong>
                    <span>{blurb}</span>
                    <small>{categoryCounts[key] ? plural(categoryCounts[key], "item") : "Browse"}</small>
                  </span>
                  {key === "student-made" && <span className="home-tile-sticker" aria-hidden="true">Made at CSUCC</span>}
                </Link>
              ))}
            </div>
          </section>

          {/* ── Trending on campus ─────────────────────────────────────── */}
          <section className="home-section" aria-labelledby="trending-title">
            <div className="cm-section-head">
              <div>
                <p className="cm-eyebrow">{featured.length ? "Featured by Premium stalls" : "Most viewed this week"}</p>
                <h2 id="trending-title">Trending on campus</h2>
              </div>
              <Link to="/browse" className="cm-link">Browse all products <ArrowRight aria-hidden="true" /></Link>
            </div>
            {loading ? <SkeletonGrid count={4} /> : trending.length ? (
              <div className="pc-grid">{trending.map((product) => <ProductCard key={product.id} product={product} />)}</div>
            ) : (
              <EmptyState illustration="bag" title="Nothing listed yet" description="Products from campus stalls will show up here as soon as sellers add them." action={{ label: stallCta.label, to: stallCta.to }} />
            )}
          </section>
        </div>

        {/* ── Events (deep green) ────────────────────────────────────────── */}
        <section className="home-events" aria-labelledby="events-title">
          <div className="home-wrap home-events-inner">
            <div className="home-events-copy">
              <p className="cm-eyebrow">Campus fairs & pop-ups</p>
              <h2 id="events-title">{nextEvent ? (eventStatus(nextEvent) === "ongoing" ? "Happening now" : "Next on campus") : "Events"}</h2>
              {nextEvent ? (
                <>
                  <h3>{nextEvent.name}</h3>
                  <p className="home-events-meta"><CalendarDays aria-hidden="true" /> {formatEventDate(nextEvent)}</p>
                  <p className="home-events-meta"><MapPin aria-hidden="true" /> {nextEvent.location}</p>
                  {eventStatus(nextEvent) === "upcoming" && <Countdown event={nextEvent} />}
                  <div className="home-events-ctas">
                    <Link to={`/events/${nextEvent.id}/stalls`} className="btn btn-gold btn-lg">View stall map <ArrowRight aria-hidden="true" /></Link>
                    <Link to="/events" className="btn btn-on-dark btn-lg">All events</Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="home-events-empty">No fairs on the calendar right now. When the next one is announced, you'll see the stall map here.</p>
                  <div className="home-events-ctas">
                    {SUGGEST_EMAIL && <a className="btn btn-gold btn-lg" href={`mailto:${SUGGEST_EMAIL}?subject=Campus%20Market%20event%20idea`}>Suggest an event</a>}
                    <Link to="/events" className="btn btn-on-dark btn-lg">See past events</Link>
                  </div>
                </>
              )}
            </div>
            <div className="home-events-art" aria-hidden="true">
              <Illustration name={nextEvent ? "map" : "calendar"} size={300} />
              {nextEvent && <span className="home-events-count">{plural(nextEvent.stall_count || 0, "stall space")}</span>}
            </div>
          </div>
        </section>

        {/* ── Student Made spotlight ─────────────────────────────────────── */}
        {spotlight && (
          <div className="home-wrap">
            <section className="home-section home-spotlight" aria-labelledby="spotlight-title">
              <div className="home-spotlight-story">
                <span className="cm-chip cm-chip--student-made home-spotlight-sticker">Student Made</span>
                <p className="cm-eyebrow">Spotlight</p>
                <h2 id="spotlight-title">{spotlight.stall.name}</h2>
                <p className="home-spotlight-seller">
                  <span className="home-spotlight-logo">{spotlight.stall.logo_url ? <img src={spotlight.stall.logo_url} alt="" /> : <Store aria-hidden="true" />}</span>
                  by {spotlight.stall.seller_name || "a CSUCC student"} · <MapPin aria-hidden="true" /> {spotlight.stall.location}
                </p>
                <blockquote>{spotlight.stall.description || "Everything here is designed and made by a CSUCC student."}</blockquote>
                <p className="home-spotlight-note">{plural(spotlight.total, "handmade item")} listed</p>
                <Link to={`/stalls/${spotlight.stall.id}`} className="btn btn-primary">Visit the stall <ArrowRight aria-hidden="true" /></Link>
              </div>
              {spotlight.items.length > 0 && (
                <div className="home-spotlight-items">
                  {spotlight.items.map((product) => <ProductCard key={product.id} product={product} showStall={false} />)}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/** Days / hours / minutes until an event starts (updates every second). */
function Countdown({ event }) {
  const start = parseEventDate(eventStart(event));
  const [left, setLeft] = useState(() => timeUntil(start));
  useEffect(() => {
    const timer = window.setInterval(() => setLeft(timeUntil(start)), 1000);
    return () => window.clearInterval(timer);
  }, [start?.getTime()]);
  if (!start) return null;
  const parts = [["days", left.days], ["hours", left.hours], ["min", left.minutes], ["sec", left.seconds]];
  return (
    <div className="home-countdown" role="timer" aria-label={`Starts in ${left.days} days, ${left.hours} hours and ${left.minutes} minutes`}>
      <Clock3 aria-hidden="true" />
      {parts.map(([label, value]) => (
        <span key={label}><b>{String(value).padStart(2, "0")}</b><small>{label}</small></span>
      ))}
    </div>
  );
}

