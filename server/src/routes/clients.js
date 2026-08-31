import { Router } from "express";
import { db } from "../db.js";
import { uid, todayISO } from "../utils/domain.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const toApi = (c) => ({
  id: c.id,
  name: c.name,
  contactPerson: c.contact_person,
  email: c.email,
  phone: c.phone,
  address: c.address,
  taxNumber: c.tax_number,
  createdAt: c.created_at,
});

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all();
  res.json(rows.map(toApi));
});

router.post("/", (req, res) => {
  const b = req.body;
  if (!b.name || !b.name.trim()) return res.status(400).json({ error: "Enter a client name." });
  const row = {
    id: uid(),
    name: b.name.trim(),
    contact_person: b.contactPerson || null,
    email: b.email || null,
    phone: b.phone || null,
    address: b.address || null,
    tax_number: b.taxNumber || null,
    created_at: todayISO(),
    created_by: req.user.id,
  };
  db.prepare(
    "INSERT INTO clients (id,name,contact_person,email,phone,address,tax_number,created_at,created_by) VALUES (@id,@name,@contact_person,@email,@phone,@address,@tax_number,@created_at,@created_by)"
  ).run(row);
  res.json(toApi(row));
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Client not found." });
  const b = req.body;
  db.prepare(
    "UPDATE clients SET name=?, contact_person=?, email=?, phone=?, address=?, tax_number=? WHERE id=?"
  ).run(b.name, b.contactPerson || null, b.email || null, b.phone || null, b.address || null, b.taxNumber || null, req.params.id);
  res.json(toApi(db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id)));
});

router.delete("/:id", (req, res) => {
  const inUse =
    db.prepare("SELECT COUNT(*) c FROM quotations WHERE client_id = ?").get(req.params.id).c +
    db.prepare("SELECT COUNT(*) c FROM invoices WHERE client_id = ?").get(req.params.id).c;
  if (inUse > 0) return res.status(400).json({ error: "This client has quotations or invoices on record and can't be deleted." });
  db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
