export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));

export const CURRENCIES = {
  USD: { symbol: "$", label: "US Dollar" },
  ZWG: { symbol: "ZiG ", label: "Zimbabwe Gold" },
  ZAR: { symbol: "R", label: "South African Rand" },
  GBP: { symbol: "£", label: "British Pound" },
  EUR: { symbol: "€", label: "Euro" },
};

export const QUOTE_STATUSES = {
  draft: { label: "Draft", color: "gray" },
  sent: { label: "Sent", color: "warning" },
  accepted: { label: "Accepted", color: "success" },
  rejected: { label: "Rejected", color: "danger" },
  expired: { label: "Expired", color: "gray" },
  invoiced: { label: "Invoiced", color: "accent" },
};

export const INVOICE_STATUSES = {
  draft: { label: "Draft", color: "gray" },
  sent: { label: "Sent", color: "warning" },
  partial: { label: "Partially paid", color: "warning" },
  paid: { label: "Paid", color: "success" },
  overdue: { label: "Overdue", color: "danger" },
  cancelled: { label: "Cancelled", color: "gray" },
};

export const PIPELINE_STAGES = ["draft", "sent", "accepted", "invoiced", "paid"];

export const fmtMoney = (amount, currency = "USD") => {
  const cur = CURRENCIES[currency] || CURRENCIES.USD;
  const n = Number(amount) || 0;
  const parts = Math.abs(n).toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = n < 0 ? "-" : "";
  return `${sign}${cur.symbol}${parts[0]}.${parts[1]}`;
};

export const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtMonth = (d) => {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

export const calcLineTotal = (item) => (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);

export const calcDocTotals = (items, taxRate, discount = 0, discountType = "percent") => {
  const subtotal = items.reduce((s, it) => s + calcLineTotal(it), 0);
  let discountAmt = 0;
  if (discountType === "percent") discountAmt = subtotal * ((Number(discount) || 0) / 100);
  else discountAmt = Number(discount) || 0;
  const taxable = Math.max(subtotal - discountAmt, 0);
  const taxAmt = taxable * ((Number(taxRate) || 0) / 100);
  const total = taxable + taxAmt;
  return { subtotal, discountAmt, taxAmt, total };
};

export const amountPaidOf = (doc) => (doc.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

export const downloadCSV = (filename, rows) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
