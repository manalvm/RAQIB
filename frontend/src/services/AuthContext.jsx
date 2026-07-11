import React, { createContext, useContext, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("raqib_user"));
    } catch { return null; }
  });

const login = useCallback(async (email, password) => {
  try {
    const data = await api.login({ email, password });
    localStorage.setItem("raqib_token", data.token);
    localStorage.setItem("raqib_user", JSON.stringify(data));
    setUser(data);
    return data;
  } catch (err) {
    throw err;
  }
}, []);

  // ── NEW: Google OAuth login/register ──
  // If this is a brand-new Google account, the backend returns
  // { requiresPasswordSetup: true, ticket, email, fullName } instead of a token —
  // nothing to persist yet, the caller must send the user to Set Password first.
  const loginWithGoogle = useCallback(async (idToken) => {
    const data = await api.googleLogin(idToken);
    if (data.requiresPasswordSetup) return data;

    localStorage.setItem("raqib_token", data.token);
    localStorage.setItem("raqib_user", JSON.stringify(data));
    setUser(data);
    return data;
  }, []);

  // ── NEW: finishes a first-time Google sign-up once a password is set ──
  const completeGoogleSignup = useCallback(async (ticket, password) => {
    const data = await api.completeGoogleSignup(ticket, password);
    localStorage.setItem("raqib_token", data.token);
    localStorage.setItem("raqib_user", JSON.stringify(data));
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("raqib_token");
    localStorage.removeItem("raqib_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, completeGoogleSignup, logout, isAdmin: user?.role === "Admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
