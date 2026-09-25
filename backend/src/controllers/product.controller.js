import { productStore, stallStore } from "../data/marketStore.js";

export const getProducts = async (req, res, next) => {
  try {
    const { q, category, page = 1, limit = 20, stall_id: stallId } = req.query;
    const mine = req.query.mine === "true";
    const myStall = mine && req.user?.role === "seller" ? await stallStore.getMy(req.user.id) : null;
    if (mine && !myStall) return res.status(403).json({ error: "Your own store is required." });
    const result = await productStore.listProducts({
      q,
      category,
      page,
      limit,
      stallId: mine ? myStall.id : stallId,
      activeOnly: !mine, publicOnly: !mine,
      featured: req.query.featured === "true",
      min_price: req.query.min_price, max_price: req.query.max_price,
      sort: req.query.sort,
      location: req.query.location,
      openNow: req.query.open_now === "true",
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/products/locations — pickup locations for the Browse filter
export const getPickupLocations = async (_req, res, next) => {
  try {
    res.json(await productStore.listLocations());
  } catch (err) {
    next(err);
  }
};

export const getProduct = async (req, res, next) => {
  try {
    const product = await productStore.getById(req.params.id, req.user, { countView: req.query.preview !== "1" });
    res.json(product);
  } catch (err) {
    next(err);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const myStall = await stallStore.getMy(req.user.id);
    const stallId = myStall?.status === "approved" ? myStall.id : null;
    if (!stallId) {
      return res.status(403).json({ error: "You need an approved stall before listing products" });
    }

    const product = await productStore.create(stallId, req.body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const product = await productStore.update(req.params.id, req.body, req.user);
    res.json(product);
  } catch (err) {
    next(err);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    await productStore.remove(req.params.id, req.user);
    res.json({ message: "Product removed" });
  } catch (err) {
    next(err);
  }
};

export const getRecommendations = async (req, res, next) => {
  try {
    // Recommendations reveal browsing history, so only your own (or any, for admins).
    if (req.params.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "You can only view your own recommendations." });
    }
    const products = await productStore.getRecommendations(req.params.userId);
    res.json(products);
  } catch (err) {
    next(err);
  }
};

export const getSimilar = async (req, res, next) => {
  try {
    const products = await productStore.getSimilar(req.params.productId);
    res.json(products);
  } catch (err) {
    next(err);
  }
};
