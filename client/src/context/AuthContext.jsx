import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setUnauthorizedHandler } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("mdt_token") || null);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking"); // checking | needs-setup | needs-login | ready

  const logout = useCallback(() => {
    localStorage.removeItem("mdt_token");
    setToken(null);
    setUser(null);
    setStatus("needs-login");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
  }, [logout]);

  useEffect(() => {
    (async () => {
      try {
        if (token) {
          const { user } = await api.me(token);
          setUser(user);
          setStatus("ready");
          return;
        }
        const { hasUsers } = await api.authStatus();
        setStatus(hasUsers ? "needs-login" : "needs-setup");
      } catch {
        setStatus("needs-login");
      }
    })();
  }, [token]);

  const completeAuth = ({ token: t, user: u }) => {
    localStorage.setItem("mdt_token", t);
    setToken(t);
    setUser(u);
    setStatus("ready");
  };

  const login = async (email, password) => completeAuth(await api.login({ email, password }));
  const setup = async (name, email, password) => completeAuth(await api.setup({ name, email, password }));

  return (
    <AuthContext.Provider value={{ token, user, status, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
