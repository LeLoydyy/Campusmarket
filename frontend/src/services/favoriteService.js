import api from "./api.js";

// Saved products live on the server, so they follow the buyer to every device.
// One shared copy per signed-in user keeps product cards in sync without extra requests.
const LEGACY_PREFIX = "campus-market:favorites";

let cache = { userId: null, products: null, loading: null };
const listeners = new Set();

const emit = (userId, products) => {
  listeners.forEach((entry) => { if (entry.userId === String(userId)) entry.listener(products); });
};

/** Favorites saved in this browser before they moved to the server: send them up once. */
const importLegacy = async (userId) => {
  const key = `${LEGACY_PREFIX}:${userId}`;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
    const ids = Array.isArray(saved) ? saved.map((product) => product?.id).filter(Boolean) : [];
    if (ids.length) await api.post("/favorites", { product_ids: ids });
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked or the import failed; it is retried on the next visit.
  }
};

const load = (userId) => {
  const id = String(userId);
  if (cache.userId === id && cache.products) return Promise.resolve(cache.products);
  if (cache.userId === id && cache.loading) return cache.loading;
  cache = { userId: id, products: null, loading: null };
  cache.loading = (async () => {
    await importLegacy(id);
    const { data } = await api.get("/favorites");
    if (cache.userId === id) cache.products = Array.isArray(data) ? data : [];
    return cache.products;
  })().finally(() => { if (cache.userId === id) cache.loading = null; });
  return cache.loading;
};

const setProducts = (userId, products) => {
  if (cache.userId === String(userId)) cache.products = products;
  emit(userId, products);
};

const favoriteService = {
  getAll(userId) {
    return load(userId);
  },

  async isFavorite(userId, productId) {
    return (await load(userId)).some((product) => String(product.id) === String(productId));
  },

  /** Saves or un-saves a product. The change shows at once and is undone if the server refuses it. */
  async toggle(userId, product) {
    const before = await load(userId);
    const saved = before.some((item) => String(item.id) === String(product.id));
    const after = saved ? before.filter((item) => String(item.id) !== String(product.id)) : [product, ...before];
    setProducts(userId, after);
    try {
      if (saved) await api.delete(`/favorites/${product.id}`);
      else await api.post("/favorites", { product_ids: [product.id] });
    } catch (error) {
      setProducts(userId, before);
      throw error;
    }
    return { saved: !saved, favorites: after };
  },

  async remove(userId, productId) {
    const before = await load(userId);
    const after = before.filter((item) => String(item.id) !== String(productId));
    setProducts(userId, after);
    try {
      await api.delete(`/favorites/${productId}`);
    } catch (error) {
      setProducts(userId, before);
      throw error;
    }
    return after;
  },

  subscribe(userId, listener) {
    const entry = { userId: String(userId), listener };
    listeners.add(entry);
    return () => listeners.delete(entry);
  },
};

export default favoriteService;
