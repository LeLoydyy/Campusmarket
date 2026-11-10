import { eventStore } from "../data/marketStore.js";

// GET /api/events
export const getEvents = async (req, res, next) => {
  try {
    // ?status=upcoming leaves out events that have already ended (the seller application form uses it).
    const events = await eventStore.listEvents({ upcoming: req.query.status === "upcoming" });

    res.json(events);
  } catch (error) {
    next(error);
  }
};

// GET /api/events/:eventId
export const getEvent = async (req, res, next) => {
  try {
    const event = await eventStore.getById(req.params.eventId);

    res.json(event);
  } catch (error) {
    next(error);
  }
};

// GET /api/events/:eventId/stalls
export const getEventStalls = async (req, res, next) => {
  try {
    const stalls = await eventStore.listStallsForEvent(req.params.eventId);

    res.json(stalls);
  } catch (error) {
    next(error);
  }
};

// POST /api/seller-applications
export const submitSellerApplication = async (req, res, next) => {
  try {
    const application = await eventStore.submitApplication(
      req.user.id,
      req.body,
    );

    res.status(201).json({
      message: "Application submitted successfully!",
      application,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/seller-applications/my
export const getMySellerApplications = async (req, res, next) => {
  try {
    const { eventId, status } = req.query;

    const applications = await eventStore.listApplications({
      eventId,
      status,
      sellerId: req.user.id,
    });

    res.json(applications);
  } catch (error) {
    next(error);
  }
};

// PUT /api/seller-applications/:id/review
// Admin approves or rejects a pending application
export const reviewSellerApplication = async (req, res, next) => {
  try {
    const application = await eventStore.reviewApplication(req.params.id, req.user.id, req.body);

    res.json(application);
  } catch (error) {
    next(error);
  }
};

// GET /api/seller-applications
// Admin-only application review
export const getSellerApplications = async (req, res, next) => {
  try {
    const { eventId, status } = req.query;

    const applications = await eventStore.listApplications({
      eventId,
      status,
    });

    res.json(applications);
  } catch (error) {
    next(error);
  }
};
