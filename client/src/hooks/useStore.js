import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export function useStore() {
  const { token, status } = useAuth();
  const [settings, setSettings] = useState(null);
  const [clients, setClients] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [s, c, q, i] = await Promise.all([
        api.getSettings(token),
        api.getClients(token),
        api.getQuotations(token),
        api.getInvoices(token),
      ]);
      setSettings(s);
      setClients(c);
      setQuotations(q);
      setInvoices(i);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (status === "ready" && token) reload();
  }, [status, token, reload]);

  return { settings, clients, quotations, invoices, loading, error, reload, token };
}
