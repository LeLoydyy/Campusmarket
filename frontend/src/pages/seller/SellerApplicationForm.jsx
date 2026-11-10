import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../../components/common/Sidebar.jsx";
import eventService from "../../services/eventService.js";
import StallMap, { placeSpaces, SPACE_CATEGORIES } from "../../components/map/StallMap.jsx";
import { stallService } from "../../services/api.js";
import toast from "react-hot-toast";
import {
  FiAlertCircle,
  FiCalendar,
  FiCheckCircle,
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

// Your stall's category, as an event-stall category.
const toStallCategory = (value) => {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("food")) return "food";
  if (raw.includes("mixed")) return "mixed-use";
  return raw ? "merchandise" : "food";
};
// Seller category -> the event map's space category.
const toSpaceCategory = (value) => (value === "mixed-use" ? "mixed" : value);
const formatFee = (price) => (Number(price) > 0 ? `₱${Number(price).toLocaleString("en-PH")} fee` : "No fee");

const EMPTY_FORM = {
  eventId: "",
  stallName: "",
  businessName: "",
  productCategory: "food",
  productList: "",
  preferredSpaceId: "",
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
  // One-day events show a single date, not "Sep 1, 2026 – Sep 1, 2026".
  if (Number.isNaN(endDate.getTime()) || formatter.format(endDate) === formatter.format(startDate)) return formatter.format(startDate);
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
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
      formData.preferredSpaceId,
      formData.contactInfo,
    ];
    return required.filter((value) => String(value).trim()).length;
  }, [formData]);

  const progress = Math.round((completedFields / 7) * 100);

  const handleChange = ({ target: { name, value } }) => {
    setFormData((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  };

  const setField = (name, value) => handleChange({ target: { name, value: String(value) } });

  // Picking an event clears any spot chosen on another event's map.
  const pickEvent = (eventItem) => {
    if (String(eventItem.id) === String(formData.eventId)) return;
    setFormData((previous) => ({ ...previous, eventId: String(eventItem.id), preferredSpaceId: "" }));
    setErrors((previous) => ({ ...previous, eventId: "", preferredSpaceId: "" }));
  };
  const pickSpace = (spaceId) => setField("preferredSpaceId", spaceId);

  // The chosen event's stall map: spaces plus landmarks (stage, entrance...).
  const [spaces, setSpaces] = useState([]);
  const [landmarks, setLandmarks] = useState([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spacesError, setSpacesError] = useState("");
  const loadSpaces = useCallback(async () => {
    if (!formData.eventId) { setSpaces([]); setLandmarks([]); return; }
    setSpacesLoading(true);
    setSpacesError("");
    try {
      const [eventResponse, stallsResponse] = await Promise.all([eventService.getOne(formData.eventId), eventService.getStalls(formData.eventId)]);
      setLandmarks(eventResponse.data?.landmarks || []);
      setSpaces(Array.isArray(stallsResponse.data) ? stallsResponse.data : []);
    } catch {
      setSpaces([]);
      setSpacesError("We couldn't load this event's stall map. Try again.");
    } finally {
      setSpacesLoading(false);
    }
  }, [formData.eventId]);
  useEffect(() => { loadSpaces(); }, [loadSpaces]);

  const placedSpaces = useMemo(() => placeSpaces(spaces, landmarks), [spaces, landmarks]);
  const isOpenSpace = (space) => !space.seller_id && space.status === "available" && !space.requested;
  const openCount = spaces.filter(isOpenSpace).length;
  const selectedSpace = spaces.find((space) => space.id === formData.preferredSpaceId);
  const categoryMismatch = selectedSpace && selectedSpace.category !== "mixed" && toSpaceCategory(formData.productCategory) !== "mixed"
    && selectedSpace.category !== toSpaceCategory(formData.productCategory);

  const validate = () => {
    const nextErrors = {};

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
    if (spaces.length > 0 && !formData.preferredSpaceId) {
      nextErrors.preferredSpaceId = "Tap an open space on the map to choose your spot.";
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
      preferredSpaceId: formData.preferredSpaceId || undefined,
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
      if (requestError.response?.status === 409 && formData.preferredSpaceId) {
        setFormData((previous) => ({ ...previous, preferredSpaceId: "" }));
        loadSpaces();
      }
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
                    <h3>Choose your spot</h3>
                    <p>Tap an open space on the event's stall map. If you're approved, that's where your stall goes.</p>
                  </div>
                </div>

                {!formData.eventId ? (
                  <p className="sa-spot-note"><FiMapPin aria-hidden="true" /> Pick an event above to see its stall map.</p>
                ) : spacesLoading ? (
                  <div className="sa-spot-skel" aria-label="Loading the stall map" />
                ) : spacesError ? (
                  <div className="seller-application-alert" role="alert">
                    <FiAlertCircle />
                    <span>{spacesError}</span>
                    <button type="button" onClick={loadSpaces}><FiRefreshCw /> Retry</button>
                  </div>
                ) : !spaces.length ? (
                  <p className="sa-spot-note"><FiInfo aria-hidden="true" /> This event's stall map isn't posted yet. Apply now and the event team will place you after approval.</p>
                ) : (
                  <div className={`sa-spot${errors.preferredSpaceId ? " invalid" : ""}`}>
                    <div className="sa-spot-legend">
                      {Object.entries(SPACE_CATEGORIES).map(([key, name]) => (
                        <span key={key}><i className={`smap-swatch smap-cat--${key} smap-status--available`} aria-hidden="true" /> {name}</span>
                      ))}
                      <span><i className="smap-swatch smap-cat--mixed smap-status--reserved is-taken" aria-hidden="true" /> Taken</span>
                      <small>{openCount} of {spaces.length} open</small>
                    </div>
                    <StallMap stalls={placedSpaces} landmarks={landmarks} mode="pick" selectedId={formData.preferredSpaceId}
                      onSelect={(id) => id && pickSpace(id)} label={`Stall map for ${selectedEvent?.name || "this event"}. Choose an open space.`} />
                    {selectedSpace ? (
                      <div className="sa-spot-picked" role="status">
                        <FiCheckCircle aria-hidden="true" />
                        <div>
                          <strong>Space {selectedSpace.stall_number}</strong>
                          <span>{SPACE_CATEGORIES[selectedSpace.category] || "Mixed"} space{selectedSpace.size ? ` · ${selectedSpace.size}` : ""} · {formatFee(selectedSpace.price)}</span>
                          {categoryMismatch && <small>This space is set aside for {SPACE_CATEGORIES[selectedSpace.category]?.toLowerCase()} sellers. The team may move you.</small>}
                        </div>
                      </div>
                    ) : openCount === 0 ? (
                      <p className="sa-spot-hint">Every space is taken or requested. Check back later or pick another event.</p>
                    ) : (
                      <p className="sa-spot-hint">Swipe the map to see all of it, then tap a solid space. Your pick gets a gold ring.</p>
                    )}
                    {errors.preferredSpaceId && <small className="sa-error">{errors.preferredSpaceId}</small>}
                  </div>
                )}
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
                      <FiMapPin /> Spot
                    </dt>
                    <dd>
                      {selectedSpace
                        ? `Space ${selectedSpace.stall_number}${selectedSpace.size ? ` · ${selectedSpace.size}` : ""}`
                        : formData.eventId && !spacesLoading && !spaces.length ? "Placed by the event team" : "Not chosen"}
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
