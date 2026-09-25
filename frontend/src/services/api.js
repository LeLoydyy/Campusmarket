import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Access tokens expire after 15 minutes. On a 401, trade the refresh token for a new pair
// once and retry; concurrent 401s share the same refresh request.
let refreshing = null;

const refreshTokens = async () => {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) throw new Error("No refresh token");
  const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
  localStorage.setItem("accessToken", data.accessToken);
  localStorage.setItem("refreshToken", data.refreshToken);
  return data.accessToken;
};

api.interceptors.response.use(undefined, async (error) => {
  const original = error.config;
  const isAuthCall = /\/auth\/(login|register|refresh)$/.test(original?.url || "");
  if (error.response?.status !== 401 || !original || original._retried || isAuthCall) {
    throw error;
  }

  original._retried = true;
  try {
    refreshing ??= refreshTokens().finally(() => { refreshing = null; });
    const token = await refreshing;
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  } catch {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    if (window.location.pathname !== "/login") window.location.assign("/login");
    throw error;
  }
});

export const productService = {
  uploadPhoto: (file) => {
    const data = new FormData();
    data.append("image", file);
    return api.post("/products/image", data);
  },
  getAll: (params = {}) => api.get("/products", { params }),
  getLocations: () => api.get("/products/locations"),
  getOne: (id) => api.get(`/products/${id}`),
  // Same product, without counting a view (e.g. pinned in a chat)
  getPreview: (id) => api.get(`/products/${id}`, { params: { preview: 1 } }),
  getRecommendations: (userId) =>
    api.get(`/products/recommendations/${userId}`),
  getSimilar: (id) => api.get(`/products/similar/${id}`),
  create: (data) => api.post("/products", data),
  update: (id, data) => api.put(`/products/${id}`, data),
  remove: (id) => api.delete(`/products/${id}`),
};

export const orderService = {
  getBuyerOrders: () => api.get("/orders/buyer"),
  getSellerOrders: (params = {}) => api.get("/orders/seller", { params }),
  updateStatus: (orderId, status) =>
    api.put(`/orders/${orderId}/status`, { status }),
};

export const messageService = {
  getConversations: () => api.get("/messages"),
  getMessages: (partnerId) => api.get(`/messages/${partnerId}`),
  send: (payload) => api.post("/messages", payload),
};

export const analyticsService = {
  getSales: (period = 30) =>
    api.get("/analytics/sales", { params: { period } }),
  getTopProducts: (period = 30) => api.get("/analytics/products/top", { params: { period } }),
  getCategories: (period = 30) => api.get("/analytics/categories", { params: { period } }),
};

export const behaviorService = {
  log: (productId, action) => api.post(`/behavior/${productId}`, { action }),
};

export const authService = {
  login: (credentials) => api.post("/auth/login", credentials),

  register: (data) => api.post("/auth/register", data),

  me: () => api.get("/auth/me"),

  getCurrentUser: () => api.get("/auth/me"),

  logout: () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");

    return Promise.resolve({
      data: {
        message: "Logged out successfully",
      },
    });
  },
};

export const settingsService = {
  getProfile: () => api.get("/auth/me"),

  updateProfile: (profileData) => api.put("/auth/profile", profileData),

  updatePassword: (passwordData) => api.put("/auth/password", passwordData),
};

export const cartService = {
  get: () => api.get("/cart"),

  add: (productId, quantity = 1) =>
    api.post("/cart", {
      product_id: productId,
      quantity,
    }),

  update: (itemId, quantity) => api.put(`/cart/${itemId}`, { quantity }),

  remove: (itemId) => api.delete(`/cart/${itemId}`),

  clear: () => api.delete("/cart/clear"),
};

export const adminService = {
  getStats: () => api.get("/admin/stats"),

  getUsers: (params = {}) => api.get("/admin/users", { params }),

  reviewUser: (id, payload) => api.put(`/admin/users/${id}/review`, payload),
  getStalls: () => api.get("/admin/stalls"),
  setPlan: (id, tier) => api.put(`/admin/stalls/${id}/plan`, { tier }),
  getPendingStalls: () => api.get("/admin/stalls/pending"),

  banUser: (userId, ban) => api.put(`/admin/users/${userId}/ban`, { ban }),
};

export const stallService = {
  create: (data) => api.post("/stalls", data),

  getAll: (params = {}) => api.get("/stalls", { params }),

  getMy: () => api.get("/stalls/my"),

  get: (stallId) => api.get(`/stalls/${stallId}`),

  update: (stallId, data) => api.put(`/stalls/${stallId}`, data),

  // kind: "logo" | "cover"
  uploadBranding: (kind, file) => {
    const data = new FormData();
    data.append("image", file);
    return api.put(`/stalls/my/branding/${kind}`, data);
  },

  removeBranding: (kind) => api.delete(`/stalls/my/branding/${kind}`),

  updateStatus: (stallId, status) =>
    api.put(`/stalls/${stallId}/status`, { status }),
};

export default api;

export const statsService = {
  // Home page counts and an anonymous "just ordered" feed
  getPublic: () => api.get("/stats/public"),
};
