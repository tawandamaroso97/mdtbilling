const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    onUnauthorized();
  }
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || "Something went wrong. Please try again.");
  }
  return data;
}

export const api = {
  authStatus: () => request("/auth/status"),
  setup: (body) => request("/auth/setup", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),
  me: (token) => request("/auth/me", { token }),

  getUsers: (token) => request("/users", { token }),
  createUser: (token, body) => request("/users", { method: "POST", body, token }),
  updateUser: (token, id, body) => request(`/users/${id}`, { method: "PATCH", body, token }),
  deleteUser: (token, id) => request(`/users/${id}`, { method: "DELETE", token }),

  getSettings: (token) => request("/settings", { token }),
  updateSettings: (token, body) => request("/settings", { method: "PUT", body, token }),

  getClients: (token) => request("/clients", { token }),
  createClient: (token, body) => request("/clients", { method: "POST", body, token }),
  updateClient: (token, id, body) => request(`/clients/${id}`, { method: "PUT", body, token }),
  deleteClient: (token, id) => request(`/clients/${id}`, { method: "DELETE", token }),

  getQuotations: (token) => request("/quotations", { token }),
  createQuotation: (token, body) => request("/quotations", { method: "POST", body, token }),
  updateQuotation: (token, id, body) => request(`/quotations/${id}`, { method: "PUT", body, token }),
  setQuotationStatus: (token, id, status) => request(`/quotations/${id}/status`, { method: "PATCH", body: { status }, token }),
  convertQuotation: (token, id) => request(`/quotations/${id}/convert`, { method: "POST", token }),
  deleteQuotation: (token, id) => request(`/quotations/${id}`, { method: "DELETE", token }),

  getInvoices: (token) => request("/invoices", { token }),
  createInvoice: (token, body) => request("/invoices", { method: "POST", body, token }),
  updateInvoice: (token, id, body) => request(`/invoices/${id}`, { method: "PUT", body, token }),
  setInvoiceStatus: (token, id, status) => request(`/invoices/${id}/status`, { method: "PATCH", body: { status }, token }),
  deleteInvoice: (token, id) => request(`/invoices/${id}`, { method: "DELETE", token }),
  addPayment: (token, id, body) => request(`/invoices/${id}/payments`, { method: "POST", body, token }),
  removePayment: (token, id, paymentId) => request(`/invoices/${id}/payments/${paymentId}`, { method: "DELETE", token }),
};
