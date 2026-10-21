import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import eventService from "../../services/eventService.js";
import { stallService } from "../../services/api.js";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiInfo,
  FiMapPin,
  FiRefreshCw,
  FiSend,
} from "react-icons/fi";
import "./SellerApplicationForm.css";

const STALL_CATEGORIES = ["food", "merchandise", "mixed-use"];
const CATEGORY_LABELS = {
  food: "Food Stall",
  merchandise: "Merchandise",
  "mixed-use": "Mixed-Use",
};

const SIZE_PRESETS = [4, 9, 16];
const DURATION_PRESETS = [1, 2, 3];
// Your stall's category, as an event-stall category.
const toStallCategory = (value) => {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("food")) return "food";
  if (raw.includes("mixed")) return "mixed-use";
  return raw ? "merchandise" : "food";
};
// Days an event runs, counting both ends; null when it can't be told.
const eventDays = (event) => {
  if (!event?.date) return null;
  const start = new Date(event.date);
  const end = event.endDate ? new Date(event.endDate) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
};

const EMPTY_FORM = {
  eventId: "",
  stallName: "",
  businessName: "",
  productCategory: "food",
  productList: "",
  preferredStallSize: "",
  duration: "",
  contactInfo: "",
};

const extractEvents = (payload) => {
  const value =
    payload?.data?.events ?? payload?.events ?? payload?.data ?? payload;
  return Array.isArray(value) ? value : [];
};

const normalizeEvent = (event) => ({
  ...event,
  id: event.id || event.event_id,
  name: event.name || event.title || "Untitled event",
  location: event.location || event.venue || "Location to be announced",
  date: event.date || event.start_date || event.starts_at || null,
  endDate: event.end_date || event.ends_at || null,
});

const formatEventDate = (start, end) => {
  if (!start) return "Schedule to be announced";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "Schedule to be announced";

  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!end) return formatter.format(startDate);

  const endDate = new Date(end);
  return Number.isNaN(endDate.getTime())
    ? formatter.format(startDate)
    : `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
};

export default function SellerApplicationForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError("");

    try {
      const response = await eventService.getAll({ status: "upcoming" });
      setEvents(
        extractEvents(response.data)
          .map(normalizeEvent)
          .filter((event) => event.id),
      );
    } catch (requestError) {
      setEvents([]);
      setEventsError(
        requestError.response?.data?.error ||
          "We couldn't load the available events. Please try again.",
      );
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Start from what the seller's stall already says; every field stays editable.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    let active = true;
    stallService.getMy().then(({ data }) => {
      const stall = data?.data || data;
      if (!active || !stall?.name) return;
      setFormData((previous) => ({
        ...previous,
        stallName: previous.stallName || stall.name,
        businessName: previous.businessName || stall.name,
        productCategory: toStallCategory(stall.category),
        contactInfo: previous.contactInfo || stall.contact_number || "",
      }));
      setPrefilled(true);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const requestedEventId = searchParams.get("eventId");
    if (
      requestedEventId &&
      events.some((event) => String(event.id) === requestedEventId)
    ) {
      setFormData((previous) => ({
        ...previous,
        eventId: previous.eventId || requestedEventId,
      }));
    }
  }, [events, searchParams]);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === String(formData.eventId)),
    [events, formData.eventId],
  );

  const completedFields = useMemo(() => {
    const required = [
      formData.eventId,
      formData.stallName,
      formData.businessName,
      formData.productCategory,
      formData.productList,
      formData.preferredStallSize,
      formData.duration,
      formData.contactInfo,
    ];
    return required.filter((value) => String(value).trim()).length;
  }, [formData]);

  const progress = Math.round((completedFields / 8) * 100);

  const handleChange = ({ target: { name, value } }) => {
    setFormData((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  };

  const setField = (name, value) => handleChange({ target: { name, value: String(value) } });

  // Picking an event fills in how many days it runs, unless the seller already typed one.
  const pickEvent = (eventItem) => {
    setField("eventId", eventItem.id);
    const days = eventDays(eventItem);
    if (days) setFormData((previous) => ({ ...previous, duration: previous.duration || String(days) }));
  };

  const validate = () => {
    const nextErrors = {};
    const size = Number(formData.preferredStallSize);
    const duration = Number(formData.duration);

    if (!formData.eventId) nextErrors.eventId = "Select an event.";
    if (formData.stallName.trim().length < 2) {
      nextErrors.stallName = "Enter at least 2 characters.";
    }
    if (formData.businessName.trim().length < 2) {
      nextErrors.businessName = "Enter your business or organization name.";
    }
    if (!STALL_CATEGORIES.includes(formData.productCategory)) {
      nextErrors.productCategory = "Choose a valid category.";
    }
    if (formData.productList.trim().length < 3) {
      nextErrors.productList = "List at least one product.";
    }
    if (!Number.isFinite(size) || size <= 0) {
      nextErrors.preferredStallSize = "Enter a stall size greater than zero.";
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      nextErrors.duration = "Enter a whole number of days.";
    }
    if (formData.contactInfo.trim().length < 5) {
      nextErrors.contactInfo = "Enter a valid phone number or email.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.error("Please review the highlighted fields");
      return;
    }

    const payload = {
      ...formData,
      eventId: formData.eventId,
      stallName: formData.stallName.trim(),
      businessName: formData.businessName.trim(),
      productList: formData.productList.trim(),
      preferredStallSize: Number(formData.preferredStallSize),
      duration: Number(formData.duration),
      contactInfo: formData.contactInfo.trim(),
    };

    setSubmitting(true);
    try {
      await eventService.submitSellerApplication(payload);
      toast.success("Application submitted successfully");
      navigate("/seller/stall");
    } catch (requestError) {
      toast.error(
        requestError.response?.data?.error ||
          requestError.response?.data?.message ||
          "Failed to submit your application",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-layout seller-application-shell">
      <Sidebar />
      <main className="dashboard-main">
        <header className="topbar seller-application-topbar">
          <div className="topbar-left">
            <div className="topbar-titles">
              <h1>Apply for a Stall</h1>
              <p>Request a selling space at an upcoming campus event.</p>
            </div>
          </div>
          <div className="seller-application-progress-label">
            <span>{progress}% complete</span>
            <div>
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <div className="dashboard-content seller-application-content">
          <div className="seller-application-intro">
            <p className="cm-eyebrow">Seller application</p>
            <h2>Bring your stall to a campus fair</h2>
            <p>Pick an event, tell the team what you'll sell and how much space you need. It takes about two minutes.</p>
          </div>

          <div className="seller-application-layout">
            <form
              className="seller-application-form"
              onSubmit={handleSubmit}
              noValidate
            >
              <section>
                <div className="seller-application-section-heading">
                  <span>01</span>
                  <div>
                    <h3>Choose an event</h3>
                    <p>Select where you would like to operate your stall.</p>
                  </div>
                </div>

                {eventsError && (
                  <div className="seller-application-alert" role="alert">
                    <FiAlertCircle />
                    <span>{eventsError}</span>
                    <button type="button" onClick={loadEvents}>
                      <FiRefreshCw /> Retry
                    </button>
                  </div>
                )}

                {eventsLoading ? (
                  <div className="sa-events">{[0, 1].map((i) => <span key={i} className="sa-event-skel" />)}</div>
                ) : !eventsError && events.length === 0 ? (
                  <div className="sa-no-events">
                    <FiCalendar aria-hidden="true" />
                    <div>
                      <strong>No upcoming events to apply for yet</strong>
                      <p>New fairs are announced on the Events page. You can apply as soon as one opens.</p>
                    </div>
                    <Link to="/events" className="btn btn-outline btn-sm">See events</Link>
                  </div>
                ) : (
                  <fieldset className="sa-events-field">
                    <legend className="sr-only">Event</legend>
                    <div className={`sa-events${errors.eventId ? " invalid" : ""}`}>
                      {events.map((eventItem) => {
                        const selected = String(formData.eventId) === String(eventItem.id);
                        return (
                          <label key={eventItem.id} className={`sa-event${selected ? " is-selected" : ""}`}>
                            <input type="radio" name="eventId" value={eventItem.id} checked={selected} onChange={() => pickEvent(eventItem)} />
                            <span className="sa-event-check" aria-hidden="true"><FiCheckCircle /></span>
                            <strong>{eventItem.name}</strong>
                            <small><FiCalendar aria-hidden="true" /> {formatEventDate(eventItem.date, eventItem.endDate)}</small>
                            <small><FiMapPin aria-hidden="true" /> {eventItem.location}</small>
                          </label>
                        );
                      })}
                    </div>
                    {errors.eventId && <small className="sa-error">{errors.eventId}</small>}
                  </fieldset>
                )}
              </section>

              <section>
                <div className="seller-application-section-heading">
                  <span>02</span>
                  <div>
                    <h3>Business details</h3>
                    <p>Help reviewers understand your campus business.</p>
                  </div>
                </div>
                {prefilled && <p className="sa-prefill"><FiInfo aria-hidden="true" /> Filled in from your stall. Change anything that's different for this event.</p>}

                <div className="seller-application-fields">
                  <div className="seller-application-field">
                    <label htmlFor="application-stall-name">
                      Stall name <em>*</em>
                    </label>
                    <input
                      id="application-stall-name"
                      name="stallName"
                      value={formData.stallName}
                      onChange={handleChange}
                      placeholder="Sweet Finds PH"
                      className={errors.stallName ? "invalid" : ""}
                    />
                    {errors.stallName && <small>{errors.stallName}</small>}
                  </div>
                  <div className="seller-application-field">
                    <label htmlFor="application-business-name">
                      Business name <em>*</em>
                    </label>
                    <input
                      id="application-business-name"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      placeholder="Your registered business name"
                      className={errors.businessName ? "invalid" : ""}
                    />
                    {errors.businessName && (
                      <small>{errors.businessName}</small>
                    )}
                  </div>
                  <fieldset className="seller-application-field sa-chips-field">
                    <legend>Product category <em>*</em></legend>
                    <div className="sa-chips">
                      {STALL_CATEGORIES.map((category) => (
                        <label key={category} className={formData.productCategory === category ? "is-selected" : ""}>
                          <input type="radio" name="productCategory" value={category} checked={formData.productCategory === category} onChange={handleChange} />
                          {CATEGORY_LABELS[category]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="seller-application-field">
                    <label htmlFor="application-contact">
                      Contact information <em>*</em>
                    </label>
                    <input
                      id="application-contact"
                      name="contactInfo"
                      value={formData.contactInfo}
                      onChange={handleChange}
                      placeholder="Phone number or email"
                      className={errors.contactInfo ? "invalid" : ""}
                    />
                    {errors.contactInfo && <small>{errors.contactInfo}</small>}
                  </div>
                  <div className="seller-application-field wide">
                    <label htmlFor="application-products">
                      Products you plan to sell <em>*</em>
                    </label>
                    <textarea
                      id="application-products"
                      name="productList"
                      rows="3"
                      maxLength="600"
                      value={formData.productList}
                      onChange={handleChange}
                      placeholder="Example: cookies, brownies, bottled coffee"
                      className={errors.productList ? "invalid" : ""}
                    />
                    <i>{formData.productList.length}/600</i>
                    {errors.productList && <small>{errors.productList}</small>}
                  </div>
                </div>
              </section>

              <section>
                <div className="seller-application-section-heading">
                  <span>03</span>
                  <div>
                    <h3>Space requirements</h3>
                    <p>
                      Give the organizers enough information to plan the layout.
                    </p>
                  </div>
                </div>

                <div className="seller-application-fields">
                  <div className="seller-application-field">
                    <label htmlFor="application-size">
                      Preferred stall size <em>*</em>
                    </label>
                    <div
                      className={`seller-application-unit ${errors.preferredStallSize ? "invalid" : ""}`}
                    >
                      <input
                        id="application-size"
                        type="number"
                        name="preferredStallSize"
                        min="1"
                        step="1"
                        value={formData.preferredStallSize}
                        onChange={handleChange}
                        placeholder="9"
                      />
                      <span>sqm</span>
                    </div>
                    <div className="sa-presets" role="group" aria-label="Common stall sizes">
                      {SIZE_PRESETS.map((size) => (
                        <button key={size} type="button" className={formData.preferredStallSize === String(size) ? "is-selected" : ""} onClick={() => setField("preferredStallSize", size)}>
                          {size} sqm
                        </button>
                      ))}
                    </div>
                    {errors.preferredStallSize && (
                      <small>{errors.preferredStallSize}</small>
                    )}
                  </div>
                  <div className="seller-application-field">
                    <label htmlFor="application-duration">
                      Duration <em>*</em>
                    </label>
                    <div
                      className={`seller-application-unit ${errors.duration ? "invalid" : ""}`}
                    >
                      <input
                        id="application-duration"
                        type="number"
                        name="duration"
                        min="1"
                        step="1"
                        value={formData.duration}
                        onChange={handleChange}
                        placeholder="3"
                      />
                      <span>days</span>
                    </div>
                    <div className="sa-presets" role="group" aria-label="Common durations">
                      {DURATION_PRESETS.map((days) => (
                        <button key={days} type="button" className={formData.duration === String(days) ? "is-selected" : ""} onClick={() => setField("duration", days)}>
                          {days} {days === 1 ? "day" : "days"}
                        </button>
                      ))}
                    </div>
                    {errors.duration && <small>{errors.duration}</small>}
                  </div>
                </div>
              </section>

              <div className="seller-application-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => navigate(-1)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || eventsLoading || !events.length}
                >
                  {submitting ? (
                    <span className="seller-application-spinner" />
                  ) : (
                    <FiSend />
                  )}
                  {submitting ? "Submitting…" : "Submit application"}
                </button>
              </div>
            </form>

            <aside className="seller-application-aside">
              <div className="seller-application-summary">
                <span>Application summary</span>
                <h3>{formData.stallName.trim() || "Your stall"}</h3>
                <p>{CATEGORY_LABELS[formData.productCategory]}</p>
                <dl>
                  <div>
                    <dt>
                      <FiCalendar /> Event
                    </dt>
                    <dd>{selectedEvent?.name || "Not selected"}</dd>
                  </div>
                  <div>
                    <dt>
                      <FiMapPin /> Space
                    </dt>
                    <dd>
                      {formData.preferredStallSize
                        ? `${formData.preferredStallSize} sqm`
                        : "Not specified"}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <FiClock /> Duration
                    </dt>
                    <dd>
                      {formData.duration
                        ? `${formData.duration} day${formData.duration === "1" ? "" : "s"}`
                        : "Not specified"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="seller-application-note">
                <FiInfo />
                <div>
                  <strong>What happens next?</strong>
                  <p>
                    An administrator will review your application. You can
                    monitor its status from My Stall.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
