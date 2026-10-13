import axios from "axios";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./tokens";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Access tokens expire after 15 minutes. On a 401, trade the refresh token for a new pair
// once and retry; concurrent 401s share the same refresh request.
let refreshing = null;

const refreshTokens = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("No refresh token");
  const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken }).catch((refreshError) => {
    if (refreshError.response?.data?.code === "SHIFT_ENDED") signOutTo("shift_ended");
    throw refreshError;
  });
  saveTokens(data);
  return data.accessToken;
};

/** Ends the session in this tab and shows the sign-in page with a reason (?reason=shift_ended). */
const signOutTo = (reason) => {
  clearTokens();
  if (window.location.pathname !== "/login") window.location.assign(`/login?reason=${reason}`);
};

api.interceptors.response.use(undefined, async (error) => {
  const original = error.config;
  const code = error.response?.data?.code;
  // An admin's shift ended: no refresh will help.
  if (code === "SHIFT_ENDED") {
    signOutTo("shift_ended");
    throw error;
  }
  // A new admin must finish first-login setup before anything else.
  if (code === "SETUP_REQUIRED" && window.location.pathname !== "/admin/setup") {
    window.location.assign("/admin/setup");
    throw error;
  }
  const isAuthCall = /\/auth\/(login|register|refresh|email)(\/|$)/.test(original?.url || "");
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
    clearTokens();
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
  setFeatured: (id, featured) => api.put(`/products/${id}/featured`, { featured }),
  chooseVisible: (productIds) => api.put("/products/visible", { product_ids: productIds }),
};

export const orderService = {
  getBuyerOrders: () => api.get("/orders/buyer"),
  getSellerOrders: (params = {}) => api.get("/orders/seller", { params }),
  /** `extra`: { pickup_code } when a seller hands over a pickup order. */
  updateStatus: (orderId, status, cancelReason, extra = {}) =>
    api.put(`/orders/${orderId}/status`, {
      status,
      ...(cancelReason ? { cancel_reason: cancelReason } : {}),
      ...extra,
    }),
};

export const reviewService = {
  /** { order_id, product_id, rating, comment } — saving again edits the review. */
  save: (data) => api.post("/reviews", data),
  getMine: () => api.get("/reviews/mine"),
  /** Seller's public answer; an empty reply removes it. */
  reply: (reviewId, reply) => api.put(`/reviews/${reviewId}/reply`, { reply }),
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
  // Step 1 checks the password and emails a code; step 2 trades the code
  // (or the security answer) for a session.
  login: (credentials) => api.post("/auth/login", credentials),

  verifyLogin: (data) => api.post("/auth/login/verify", data),

  resendLoginCode: (challenge) => api.post("/auth/login/resend", { challenge }),

  sendEmailCode: (email) => api.post("/auth/email/send-code", { email }),

  verifyEmailCode: (email, code) => api.post("/auth/email/verify", { email, code }),

  register: (data) => api.post("/auth/register", data),

  me: () => api.get("/auth/me"),

  getCurrentUser: () => api.get("/auth/me"),

  // Records the time out in the login log; the caller clears the tokens either way.
  logout: (reason) => api.post("/auth/logout", reason ? { reason } : {}),

  completeSetup: (data) => api.put("/auth/setup", data),

  setRecoveryQuestions: (data) => api.put("/auth/recovery-questions", data),

  myLogins: (params = {}) => api.get("/auth/logins", { params }),

  // Forgot password: emailed code → recovery questions → new password.
  forgotStart: (email) => api.post("/auth/forgot/start", { email }),
  forgotVerify: (email, code) => api.post("/auth/forgot/verify", { email, code }),
  forgotComplete: (data) => api.post("/auth/forgot/complete", data),
};

export const settingsService = {
  getProfile: () => api.get("/auth/me"),

  updateProfile: (profileData) => api.put("/auth/profile", profileData),

  updatePassword: (passwordData) => api.put("/auth/password", passwordData),
};

export const cartService = {
  get: () => api.get("/cart"),

  add: (productId, quantity = 1, optionId = null) =>
    api.post("/cart", {
      product_id: productId,
      quantity,
      ...(optionId ? { option_id: optionId } : {}),
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
  /** { tier, premium_until?: 'YYYY-MM-DD' | null, note? } */
  setPlan: (id, data) => api.put(`/admin/stalls/${id}/plan`, data),
  getPendingStalls: () => api.get("/admin/stalls/pending"),

  banUser: (userId, ban) => api.put(`/admin/users/${userId}/ban`, { ban }),
  updateUser: (userId, data) => api.put(`/admin/users/${userId}`, data),
  removeUser: (userId, reason) => api.delete(`/admin/users/${userId}`, { data: { reason } }),
  restoreUser: (userId) => api.post(`/admin/users/${userId}/restore`),
  signOutUser: (userId) => api.post(`/admin/users/${userId}/sign-out`),

  getAdmins: () => api.get("/admin/admins"),
  getAdminOptions: () => api.get("/admin/admins/options"),
  createAdmin: (data) => api.post("/admin/admins", data),
  updateAdmin: (id, data) => api.put(`/admin/admins/${id}`, data),
  resetAdminPassword: (id) => api.post(`/admin/admins/${id}/reset-password`),

  getPlanRequests: (status = "pending") => api.get("/admin/plan-requests", { params: { status } }),
  reviewPlanRequest: (id, data) => api.put(`/admin/plan-requests/${id}`, data),

  getLoginLogs: (params = {}) => api.get("/admin/logs", { params }),
  getActivity: (params = {}) => api.get("/admin/activity", { params }),
};

// Seller plans: current plan, Premium requests.
export const planService = {
  getMy: (feature) => api.get("/plans/my", { params: feature ? { feature } : {} }),
  request: (data) => api.post("/plans/requests", data),
  cancel: () => api.delete("/plans/requests/pending"),
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
