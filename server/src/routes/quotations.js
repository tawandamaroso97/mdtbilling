import { Router } from "express";
import { db } from "../db.js";
import { uid, todayISO, addDays, calcDocTotals, nextNumber } from "../utils/domain.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const toApi = (q) => ({
  id: q.id,
  number: q.number,
  clientId: q.client_id,
  date: q.date,
  expiryDate: q.expiry_date,
  currency: q.currency,
  taxRate: q.tax_rate,
  discount: q.discount,
  discountType: q.discount_type,
  items: JSON.parse(q.items || "[]"),
  subtotal: q.subtotal,
  discountAmt: q.discount_amt,
  taxAmt: q.tax_amt,
  total: q.total,
  status: q.status,
  notes: q.notes,
  createdAt: q.created_at,
});

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM quotations ORDER BY created_at DESC").all().map(toApi));
});

router.post("/", (req, res) => {
  const b = req.body;
  if (!b.clientId) return res.status(400).json({ error: "Select a client." });
  if (!Array.isArray(b.items) || !b.items.some((i) => (i.description || "").trim())) {
    return res.status(400).json({ error: "Add at least one line item." });
  }
  const totals = calcDocTotals(b.items, b.taxRate, b.discount, b.discountType);
  const row = {
    id: uid(),
    number: nextNumber(db, "quotations", b.numberPrefix || "MDT-QT"),
    client_id: b.clientId,
    date: b.date || todayISO(),
    expiry_date: b.expiryDate,
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
    `INSERT INTO quotations (id,number,client_id,date,expiry_date,currency,tax_rate,discount,discount_type,items,subtotal,discount_amt,tax_amt,total,status,notes,created_at,created_by)
     VALUES (@id,@number,@client_id,@date,@expiry_date,@currency,@tax_rate,@discount,@discount_type,@items,@subtotal,@discount_amt,@tax_amt,@total,@status,@notes,@created_at,@created_by)`
  ).run(row);
  res.json(toApi(row));
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM quotations WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Quotation not found." });
  const b = req.body;
  const totals = calcDocTotals(b.items, b.taxRate, b.discount, b.discountType);
  db.prepare(
    `UPDATE quotations SET client_id=?, date=?, expiry_date=?, currency=?, tax_rate=?, discount=?, discount_type=?, items=?, subtotal=?, discount_amt=?, tax_amt=?, total=?, notes=? WHERE id=?`
  ).run(
    b.clientId, b.date, b.expiryDate, b.currency, Number(b.taxRate) || 0, Number(b.discount) || 0, b.discountType || "percent",
    JSON.stringify(b.items), totals.subtotal, totals.discountAmt, totals.taxAmt, totals.total, b.notes || "", req.params.id
  );
  res.json(toApi(db.prepare("SELECT * FROM quotations WHERE id = ?").get(req.params.id)));
});

router.patch("/:id/status", (req, res) => {
  const { status } = req.body;
  const allowed = ["draft", "sent", "accepted", "rejected", "expired", "invoiced"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status." });
  db.prepare("UPDATE quotations SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json(toApi(db.prepare("SELECT * FROM quotations WHERE id = ?").get(req.params.id)));
});

router.post("/:id/convert", (req, res) => {
  const quote = db.prepare("SELECT * FROM quotations WHERE id = ?").get(req.params.id);
  if (!quote) return res.status(404).json({ error: "Quotation not found." });
  const settingsRow = db.prepare("SELECT data FROM settings WHERE id = 1").get();
  const settings = JSON.parse(settingsRow.data);

  const invoice = {
    id: uid(),
    number: nextNumber(db, "invoices", settings.invoicePrefix || "MDT-INV"),
    quotation_id: quote.id,
    quotation_number: quote.number,
    client_id: quote.client_id,
    date: todayISO(),
    due_date: addDays(todayISO(), settings.invoiceDueDays || 14),
    currency: quote.currency,
    tax_rate: quote.tax_rate,
    discount: quote.discount,
    discount_type: quote.discount_type,
    items: quote.items,
    subtotal: quote.subtotal,
    discount_amt: quote.discount_amt,
    tax_amt: quote.tax_amt,
    total: quote.total,
    status: "sent",
    notes: quote.notes,
    created_at: todayISO(),
    created_by: req.user.id,
  };
  db.prepare(
    `INSERT INTO invoices (id,number,quotation_id,quotation_number,client_id,date,due_date,currency,tax_rate,discount,discount_type,items,subtotal,discount_amt,tax_amt,total,status,notes,created_at,created_by)
     VALUES (@id,@number,@quotation_id,@quotation_number,@client_id,@date,@due_date,@currency,@tax_rate,@discount,@discount_type,@items,@subtotal,@discount_amt,@tax_amt,@total,@status,@notes,@created_at,@created_by)`
  ).run(invoice);
  db.prepare("UPDATE quotations SET status = 'invoiced' WHERE id = ?").run(quote.id);

  res.json({
    quotation: toApi(db.prepare("SELECT * FROM quotations WHERE id = ?").get(quote.id)),
    invoice: {
      id: invoice.id, number: invoice.number, clientId: invoice.client_id, date: invoice.date, dueDate: invoice.due_date,
      currency: invoice.currency, taxRate: invoice.tax_rate, discount: invoice.discount, discountType: invoice.discount_type,
      items: JSON.parse(invoice.items), subtotal: invoice.subtotal, discountAmt: invoice.discount_amt, taxAmt: invoice.tax_amt,
      total: invoice.total, status: invoice.status, notes: invoice.notes, quotationNumber: invoice.quotation_number,
      createdAt: invoice.created_at, payments: [],
    },
  });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM quotations WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
