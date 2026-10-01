import { createContext, useContext, useState, useEffect, useCallback } from "react";
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

  /** Checks the password; resolves with the sign-in challenge (code sent, security question). */
  const login = useCallback(async (email, password) => (await authService.login({ email, password })).data, []);

  /** Finishes sign-in with { challenge, code } or { challenge, security_answer }; `remember` keeps the session after the browser closes. */
  const verifyLogin = useCallback(async (payload, remember = true) => startSession((await authService.verifyLogin(payload)).data, remember), []);

  const register = useCallback(async (formData) => startSession((await authService.register(formData)).data), []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLogin, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};