import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { uid, todayISO } from "../utils/domain.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active, createdAt: u.created_at });

router.get("/", (req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all();
  res.json(users.map(publicUser));
});

router.post("/", (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: "Enter a name, email, and a password of at least 8 characters." });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: "Someone already uses that email." });
  const user = {
    id: uid(),
    name,
    email: email.toLowerCase().trim(),
    password_hash: bcrypt.hashSync(password, 10),
    role: role === "admin" ? "admin" : "staff",
    active: 1,
    created_at: todayISO(),
  };
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, active, created_at) VALUES (@id,@name,@email,@password_hash,@role,@active,@created_at)"
  ).run(user);
  res.json(publicUser(user));
});

router.patch("/:id", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "That team member wasn't found." });
  const { role, active, password } = req.body;
  if (role) db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role === "admin" ? "admin" : "staff", user.id);
  if (typeof active === "boolean") {
    if (user.id === req.user.id && !active) return res.status(400).json({ error: "You can't deactivate your own account." });
    db.prepare("UPDATE users SET active = ? WHERE id = ?").run(active ? 1 : 0, user.id);
  }
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: "Password needs at least 8 characters." });
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), user.id);
  }
  res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)));
});

router.delete("/:id", (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't remove your own account." });
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
