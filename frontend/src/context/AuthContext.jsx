import { createContext, useContext, useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { authService } from "../services/api";
import { clearTokens, getAccessToken, saveTokens } from "../services/tokens";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      authService
        .me()
        .then(({ data }) => setUser(data))
        .catch(clearTokens)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const startSession = (data, remember = true) => {
    saveTokens(data, remember);
    setUser(data.user);
    return data.user;
  };

  /**
   * Checks the password; resolves with the sign-in challenge (code sent, security question),
   * or — when the server skips the code (admins in development) — starts the session and resolves with `{ user }`.
   */
  const login = useCallback(async (email, password, remember = true) => {
    const { data } = await authService.login({ email, password });
    return data.accessToken ? { user: startSession(data, remember) } : data;
  }, []);

  /** Finishes sign-in with { challenge, code } or { challenge, security_answer }; `remember` keeps the session after the browser closes. */
  const verifyLogin = useCallback(async (payload, remember = true) => startSession((await authService.verifyLogin(payload)).data, remember), []);

  const register = useCallback(async (formData) => startSession((await authService.register(formData)).data), []);

  // Tells the server first so the login log gets a time out; signing out never waits on or fails because of it.
  const logout = useCallback(async (reason) => {
    if (getAccessToken()) await authService.logout(reason).catch(() => {});
    clearTokens();
    setUser(null);
  }, []);

  /** First-login setup for admins created by another admin; returns the updated user. */
  const completeSetup = useCallback(async (payload) => startSession((await authService.completeSetup(payload)).data), []);

  // Admin shifts: warn 5 minutes before the end, then sign out and explain why.
  const shiftEndsAt = user?.shift?.ends_at;
  useEffect(() => {
    if (!shiftEndsAt) return undefined;
    const msLeft = Date.parse(shiftEndsAt) - Date.now();
    const timers = [];
    if (msLeft > 5 * 60000) {
      timers.push(setTimeout(() => toast("Your shift ends in 5 minutes. Save your work — you'll be signed out automatically.", { icon: "⏰", duration: 10000 }), msLeft - 5 * 60000));
    }
    timers.push(setTimeout(async () => {
      await logout("shift_ended");
      window.location.assign("/login?reason=shift_ended");
    }, Math.max(0, msLeft)));
    return () => timers.forEach(clearTimeout);
  }, [shiftEndsAt, logout]);

  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  /** Re-reads the signed-in user (e.g. a seller's plan after an admin changed it). Failures are ignored. */
  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) return;
    try {
      const { data } = await authService.me();
      setUser((prev) => (prev ? { ...prev, ...data } : prev));
    } catch { /* keep the current user; the next request handles an expired session */ }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLogin, register, logout, updateUser, refreshUser, completeSetup }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};