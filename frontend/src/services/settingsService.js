import api from "./api.js";

const settingsService = {
  // Get the currently logged-in user
  getProfile: () => api.get("/auth/me"),

  // Update seller profile information
  updateProfile: (profileData) => api.put("/auth/profile", profileData),

  // Which optional notifications to receive: { orderUpdates, reviewAlerts, stockAlerts }
  updateNotificationPrefs: (prefs) => api.put("/auth/notification-preferences", prefs),

  // Optional password update
  updatePassword: (passwordData) => api.put("/auth/password", passwordData),
};

export default settingsService;
