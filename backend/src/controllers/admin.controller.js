import { adminStore, authStore, stallStore } from "../data/marketStore.js";

// GET /api/admin/stats
export const getAdminStats = async (_req, res, next) => {
  try {
    const stats = await adminStore.getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id/ban
export const banUser = async (req, res, next) => {
  try {
    const user = await authStore.banUser(req.params.id, req.body.ban, req.user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/stalls/pending
export const getPendingStalls = async (_req, res, next) => {
  try {
    const stalls = await adminStore.getPendingStalls();
    res.json(stalls || []);
  } catch (err) {
    next(err);
  }
};
