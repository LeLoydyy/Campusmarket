/**
 * Where the session tokens live.
 *
 * "Remember me" on → localStorage: you stay signed in after closing the browser.
 * "Remember me" off → sessionStorage: closing the tab or browser signs you out
 *                     (safer on shared computers in labs and libraries).
 */
const KEYS = ["accessToken", "refreshToken"];
const REMEMBER_KEY = "rememberMe";

const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };

/** The storage that currently holds a session (refreshed tokens stay where they started). */
const activeStorage = () => (read(sessionStorage, "accessToken") ? sessionStorage : localStorage);

export const getAccessToken = () => read(sessionStorage, "accessToken") || read(localStorage, "accessToken");
export const getRefreshToken = () => read(sessionStorage, "refreshToken") || read(localStorage, "refreshToken");

export const clearTokens = () => {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of KEYS) { try { storage.removeItem(key); } catch { /* storage blocked */ } }
  }
};

/** Saves a token pair. `remember` is only passed at sign-in; later saves keep the same place. */
export const saveTokens = ({ accessToken, refreshToken }, remember) => {
  const storage = remember === undefined ? activeStorage() : remember ? localStorage : sessionStorage;
  clearTokens();
  try {
    storage.setItem("accessToken", accessToken);
    storage.setItem("refreshToken", refreshToken);
  } catch { /* storage blocked: the session lasts until reload */ }
};

export const getRememberPreference = () => read(localStorage, REMEMBER_KEY) !== "false";
export const setRememberPreference = (remember) => {
  try { localStorage.setItem(REMEMBER_KEY, String(remember)); } catch { /* ignore */ }
};
