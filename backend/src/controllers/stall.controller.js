import { stallStore, authStore } from "../data/marketStore.js";
import { readImageUpload } from "../middleware/productPhoto.js";
import { deletePhoto, savePhoto } from "../services/photoStorage.js";

const BRANDING_FIELDS = { logo: "logo_url", cover: "banner_url" };

// PUT /api/stalls/my/branding/:kind  (multipart "image"; kind = logo | cover)
export const uploadStallBranding = async (req, res, next) => {
  try {
    const field = BRANDING_FIELDS[req.params.kind];
    if (!field) return res.status(404).json({ error: "Unknown stall image." });
    if (!(await stallStore.getMy(req.user.id))) return res.status(404).json({ error: "Create your stall first." });
    const image = await readImageUpload(req, res);
    if (!image) return;
    const url = await savePhoto(image.buffer, image.type, "stalls");
    let result;
    try {
      result = await stallStore.setBranding(req.user.id, field, url);
    } catch (error) {
      await deletePhoto(url); // don't leave an orphaned upload behind
      throw error;
    }
    await deletePhoto(result.previous);
    res.json(result.stall);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/stalls/my/branding/:kind
export const removeStallBranding = async (req, res, next) => {
  try {
    const field = BRANDING_FIELDS[req.params.kind];
    if (!field) return res.status(404).json({ error: "Unknown stall image." });
    const result = await stallStore.setBranding(req.user.id, field, "");
    await deletePhoto(result.previous);
    res.json(result.stall);
  } catch (err) {
    next(err);
  }
};

export const getStalls = async (req, res, next) => {
  try {
    const { q, status, active } = req.query;
    const stalls = await stallStore.listStalls({
      q,
      status: "approved",
      activeOnly: true,
    });
    const visible = [];
    for (const stall of stalls) {
      const owner = await authStore.getUserById(stall.owner_id);
      if (owner.status === "approved" && !owner.is_banned) visible.push(stall);
    }
    res.json(visible);
  } catch (err) {
    next(err);
  }
};

export const getStall = async (req, res, next) => {
  try {
    const stall = await stallStore.getById(req.params.id);
    const owner = await authStore.getUserById(stall.owner_id);
    if (stall.status !== "approved" || !stall.is_active || owner.status !== "approved" || owner.is_banned) return res.status(404).json({ error: "Stall not found" });
    res.json(stall);
  } catch (err) {
    next(err);
  }
};

export const createStall = async (req, res, next) => {
  try {
    const stall = await stallStore.create(req.user.id, req.body);
    res.status(201).json(stall);
  } catch (err) {
    next(err);
  }
};

export const updateStall = async (req, res, next) => {
  try {
    const stall = await stallStore.update(req.params.id, req.user.id, req.body);
    res.json(stall);
  } catch (err) {
    next(err);
  }
};

export const updateStallStatus = async (req, res, next) => {
  try {
    const stall = await stallStore.updateStatus(req.params.id, req.body.status);
    res.json(stall);
  } catch (err) {
    next(err);
  }
};

export const getMyStall = async (req, res, next) => {
  try {
    const stall = await stallStore.getMy(req.user.id);
    res.json(stall);
  } catch (err) {
    next(err);
  }
};
