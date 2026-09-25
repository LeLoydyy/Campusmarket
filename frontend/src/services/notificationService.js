import api from "./api.js";

// Notifications live on the server, so they follow the user across phone and PC.
// Live updates and unread counts are handled by NotificationContext.
const notificationService = {
  list: (limit = 30) => api.get("/notifications", { params: { limit } }).then(({ data }) => data),
  summary: () => api.get("/notifications/summary").then(({ data }) => data),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put("/notifications/read-all"),
};

export default notificationService;
