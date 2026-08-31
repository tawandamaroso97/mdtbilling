import { Router } from "express";
import { db } from "../db.js";
import { uid, todayISO, calcDocTotals, nextNumber, computeInvoiceStatus } from "../utils/domain.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const paymentsFor = (invoiceId) =>
  db.prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY date ASC, created_at ASC").all(invoiceId)
    .map((p) => ({ id: p.id, date: p.date, amount: p.amount, method: p.method, reference: p.reference }));

const toApi = (inv) => {
  const payments = paymentsFor(inv.id);
  return {
    id: inv.id,
    number: inv.number,
    quotationId: inv.quotation_id,
    quotationNumber: inv.quotation_number,
    clientId: inv.client_id,
    date: inv.date,
    dueDate: inv.due_date,
    currency: inv.currency,
    taxRate: inv.tax_rate,
    discount: inv.discount,
    discountType: inv.discount_type,
    items: JSON.parse(inv.items || "[]"),
    subtotal: inv.subtotal,
    discountAmt: inv.discount_amt,
    taxAmt: inv.tax_amt,
    total: inv.total,
    status: computeInvoiceStatus(inv, payments),
    rawStatus: inv.status,
    notes: inv.notes,
    createdAt: inv.created_at,
    payments,
  };
};

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all().map(toApi));
});

router.post("/", (req, res) => {
  const b = req.body;
  if (!b.clientId) return res.status(400).json({ error: "Select a client." });
  if (!Array.isArray(b.items) || !b.items.some((i) => (i.description || "").trim())) {
    return res.status(400).json({ error: "Add at least one line item." });
  }
  const totals = calcDocTotals(b.items, b.taxRate, b.discount, b.discountType);
  const settingsRow = db.prepare("SELECT data FROM settings WHERE id = 1").get();
  const settings = JSON.parse(settingsRow.data);
  const row = {
    id: uid(),
    number: nextNumber(db, "invoices", settings.invoicePrefix || "MDT-INV"),
    quotation_id: b.quotationId || null,
    quotation_number: b.quotationNumber || null,
    client_id: b.clientId,
    date: b.date || todayISO(),
    due_date: b.dueDate,
    currency: b.currency || "USD",
    tax_rate: Number(b.taxRate) || 0,
    discount: Number(b.discount) || 0,
    discount_type: b.discountType || "percent",
    items: JSON.stringify(b.items),
    subtotal: totals.subtotal,
    discount_amt: totals.discountAmt,
    tax_amt: totals.taxAmt,
    total: totals.total,
    status: b.status || "draft",
    notes: b.notes || "",
    created_at: todayISO(),
    created_by: req.user.id,
  };
  db.prepare(
    `INSERT INTO invoices (id,number,quotation_id,quotation_number,client_id,date,due_date,currency,tax_rate,discount,discount_type,items,subtotal,discount_amt,tax_amt,total,status,notes,created_at,created_by)
     VALUES (@id,@number,@quotation_id,@quotation_number,@client_id,@date,@due_date,@currency,@tax_rate,@discount,@discount_type,@items,@subtotal,@discount_amt,@tax_amt,@total,@status,@notes,@created_at,@created_by)`
  ).run(row);
  res.json(toApi(row));
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Invoice not found." });
  const b = req.body;
  const totals = calcDocTotals(b.items, b.taxRate, b.discount, b.discountType);
  db.prepare(
    `UPDATE invoices SET client_id=?, date=?, due_date=?, currency=?, tax_rate=?, discount=?, discount_type=?, items=?, subtotal=?, discount_amt=?, tax_amt=?, total=?, notes=? WHERE id=?`
  ).run(
    b.clientId, b.date, b.dueDate, b.currency, Number(b.taxRate) || 0, Number(b.discount) || 0, b.discountType || "percent",
    JSON.stringify(b.items), totals.subtotal, totals.discountAmt, totals.taxAmt, totals.total, b.notes || "", req.params.id
  );
  res.json(toApi(db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id)));
});

router.patch("/:id/status", (req, res) => {
  const { status } = req.body;
  const allowed = ["draft", "sent", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status." });
  db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json(toApi(db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id)));
});

router.post("/:id/payments", (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found." });
  const { date, amount, method, reference } = req.body;
  if (!(Number(amount) > 0)) return res.status(400).json({ error: "Enter a payment amount greater than zero." });
  const payment = {
    id: uid(),
    invoice_id: invoice.id,
    date: date || todayISO(),
    amount: Number(amount),
    method: method || "Bank transfer",
    reference: reference || "",
    created_at: todayISO(),
    created_by: req.user.id,
  };
  db.prepare(
    "INSERT INTO payments (id,invoice_id,date,amount,method,reference,created_at,created_by) VALUES (@id,@invoice_id,@date,@amount,@method,@reference,@created_at,@created_by)"
  ).run(payment);
  if (invoice.status === "draft") db.prepare("UPDATE invoices SET status='sent' WHERE id=?").run(invoice.id);
  res.json(toApi(db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice.id)));
});

router.delete("/:id/payments/:paymentId", (req, res) => {
  db.prepare("DELETE FROM payments WHERE id = ? AND invoice_id = ?").run(req.params.paymentId, req.params.id);
  res.json(toApi(db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id)));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM invoices WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
