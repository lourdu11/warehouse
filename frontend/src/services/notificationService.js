/**
 * notificationService.js
 * Axios wrappers for the notification API endpoints.
 */

const BASE = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/auth` : "http://localhost:8000/api/auth";

function authHeaders() {
  const token = sessionStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET — fetch all visible notifications for current user */
export async function fetchNotifications() {
  const res = await fetch(`${BASE}/notifications/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json();
}

/** GET — fetch unread count { count: N } */
export async function fetchUnreadCount() {
  const headers = authHeaders();
  if (!headers.Authorization) return { count: 0 };
  try {
    const res = await fetch(`${BASE}/notifications/unread-count/`, {
      headers: headers,
    });
    if (!res.ok) {
      const errData = await res.text();
      console.error("Unread count fetch failed:", res.status, errData);
      return { count: 0 };
    }
    return await res.json();
  } catch (err) {
    console.error("Unread count fetch error:", err);
    return { count: 0 };
  }
}

/**
 * POST — send a notification
 * @param {{ recipient_role, notification_type, title, message, redirect_url }} data
 */
export async function sendNotification(data) {
  const res = await fetch(`${BASE}/notifications/send/`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to send notification");
  return json;
}

/** POST — mark a single notification as read */
export async function markRead(notificationId) {
  const res = await fetch(`${BASE}/notifications/mark-read/${notificationId}/`, {
    method: "POST",
    headers: authHeaders(),
  });
  return res.json();
}

/** POST — mark all notifications as read */
export async function markAllRead() {
  const res = await fetch(`${BASE}/notifications/mark-all-read/`, {
    method: "POST",
    headers: authHeaders(),
  });
  return res.json();
}

/** GET — fetch sent notifications (outbox) */
export async function fetchSentNotifications() {
  const res = await fetch(`${BASE}/notifications/sent/`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch sent notifications");
  return res.json();
}

/** GET — fetch allowed recipient roles for current user */
export async function fetchAllowedRecipients() {
  const res = await fetch(`${BASE}/notifications/allowed-recipients/`, {
    headers: authHeaders(),
  });
  if (!res.ok) return { allowed_roles: [], sender_role: "" };
  return res.json();
}
