import { STORAGE_KEYS } from "./constants";

/* ------------------------------
   Format Date
--------------------------------*/
export const formatDate = (dateString) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDateDDMMYYYY = (dateString) => {
  if (!dateString) return "—";
  const date = new Date(dateString);
  // Returns DD/MM/YYYY
  return date.toLocaleDateString("en-GB");
};

/* ------------------------------
   Get CSRF Cookie
--------------------------------*/
export const getCookie = (name) => {

  const cookies = document.cookie ? document.cookie.split(";") : [];

  for (let cookie of cookies) {

    const [cookieName, cookieValue] = cookie.trim().split("=");

    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }

  }

  return null;
};

/* ------------------------------
   API Error Handler
--------------------------------*/
export const handleApiError = (error) => {

  if (error.response) {
    return (
      error.response.data.error ||
      error.response.data.detail ||
      "Server error"
    );
  }

  return error.message || "Unexpected error occurred";
};

/* ------------------------------
   LocalStorage: User Session
--------------------------------*/

export const setUserData = (userData) => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.USER_DATA,
      JSON.stringify(userData)
    );
  } catch (error) {
    console.error("Error saving user data:", error);
  }
};

export const getUserData = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_DATA);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error reading user data:", error);
    return null;
  }
};

export const removeUserData = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
  } catch (error) {
    console.error("Error removing user data:", error);
  }
};

/* ------------------------------
   Login Message Tracking
--------------------------------*/

export const setLoginMessageShown = (shown = true) => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOGIN_MESSAGE_SHOWN,
      JSON.stringify(shown)
    );
  } catch (error) {
    console.error("Error saving login message state:", error);
  }
};

export const getLoginMessageShown = () => {
  try {
    const data = localStorage.getItem(
      STORAGE_KEYS.LOGIN_MESSAGE_SHOWN
    );
    return data ? JSON.parse(data) : false;
  } catch (error) {
    console.error("Error reading login message state:", error);
    return false;
  }
};

export const resetLoginMessageShown = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.LOGIN_MESSAGE_SHOWN);
  } catch (error) {
    console.error("Error resetting login message state:", error);
  }
};
