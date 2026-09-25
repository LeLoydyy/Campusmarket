import { Link } from "react-router-dom";
import { CalendarPlus, MapPin, Map as MapIcon, Store } from "lucide-react";
import Illustration from "./Illustration.jsx";
import { calendarLink, eventStart, eventStatus, formatEventDate, parseEventDate, plural } from "../../utils/marketplace.js";

/**
 * Event card: framed photo with the green-gold treatment, date chip,
 * live / upcoming / past state, and the two things buyers do next —
 * open the stall map or add the event to their calendar.
 */
export default function EventCard({ event, variant = "default" }) {
  const status = eventStatus(event);
  const start = parseEventDate(eventStart(event));
  const calendar = status !== "past" ? calendarLink(event) : null;
  const stalls = Number(event.stall_count || 0);
  return (
    <article className={`ec ec--${status} ec--${variant}`}>
      <div className="ec-media">
        {event.image_url ? <img src={event.image_url} alt={`${event.name} at ${event.location}`} loading="lazy" /> : <span className="ec-art"><Illustration name="calendar" size={130} /></span>}
        {start && (
          <span className="ec-date" aria-label={start.toLocaleDateString("en-PH", { month: "long", day: "numeric" })}>
            <b>{start.toLocaleDateString("en-PH", { day: "numeric" })}</b>
            <small>{start.toLocaleDateString("en-PH", { month: "short" })}</small>
          </span>
        )}
        <span className={`ec-state ec-state--${status}`}>
          {status === "ongoing" && <i className="ec-live" aria-hidden="true" />}
          {status === "ongoing" ? "Happening now" : status === "upcoming" ? "Upcoming" : "Past event"}
        </span>
      </div>
      <div className="ec-body">
        <h3>{event.name}</h3>
        <p className="ec-meta"><CalendarPlus aria-hidden="true" /> {formatEventDate(event)}</p>
        <p className="ec-meta"><MapPin aria-hidden="true" /> {event.location || "CSU Cabadbaran Campus"}</p>
        {event.description && <p className="ec-desc">{event.description}</p>}
        <p className="ec-meta ec-stalls"><Store aria-hidden="true" /> {stalls ? plural(stalls, "stall space") : "Stall map coming soon"}</p>
        <div className="ec-actions">
          <Link className="btn btn-primary btn-sm" to={`/events/${event.id}/stalls`}><MapIcon aria-hidden="true" /> View stall map</Link>
          {calendar && <a className="btn btn-outline btn-sm" href={calendar} target="_blank" rel="noreferrer"><CalendarPlus aria-hidden="true" /> Add to calendar</a>}
        </div>
      </div>
    </article>
  );
}
