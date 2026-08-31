export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

export const calcLineTotal = (item) => (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);

export const calcDocTotals = (items, taxRate, discount = 0, discountType = "percent") => {
  const subtotal = (items || []).reduce((s, it) => s + calcLineTotal(it), 0);
  let discountAmt = 0;
  if (discountType === "percent") discountAmt = subtotal * ((Number(discount) || 0) / 100);
  else discountAmt = Number(discount) || 0;
  const taxable = Math.max(subtotal - discountAmt, 0);
  const taxAmt = taxable * ((Number(taxRate) || 0) / 100);
  const total = taxable + taxAmt;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmt: Math.round(discountAmt * 100) / 100,
    taxAmt: Math.round(taxAmt * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
};

export const amountPaidOf = (payments = []) =>
  payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

export const computeInvoiceStatus = (invoice, payments = []) => {
  if (invoice.status === "cancelled" || invoice.status === "draft") return invoice.status;
  const paid = amountPaidOf(payments);
  const total = invoice.total || 0;
  if (paid >= total && total > 0) return "paid";
  const overdue = invoice.due_date && new Date(invoice.due_date) < new Date(todayISO());
  if (paid > 0 && paid < total) return "partial";
  if (overdue) return "overdue";
  return "sent";
};

export const nextNumber = (db, table, prefix) => {
  const year = new Date().getFullYear();
  const yearPrefix = `${prefix}-${year}-`;
  const rows = db.prepare(`SELECT number FROM ${table} WHERE number LIKE ?`).all(`${yearPrefix}%`);
  const nums = rows
    .map((r) => parseInt(r.number.split("-").pop(), 10))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${yearPrefix}${String(next).padStart(3, "0")}`;
};
