import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { uid, todayISO } from "../utils/domain.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const sign = (user) =>
  jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.get("/status", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  res.json({ hasUsers: count > 0 });
});

router.post("/setup", (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  if (count > 0) return res.status(400).json({ error: "Setup already completed. Please sign in." });
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: "Enter a name, email, and a password of at least 8 characters." });
  }
  const user = {
    id: uid(),
    name,
    email: email.toLowerCase().trim(),
    password_hash: bcrypt.hashSync(password, 10),
    role: "admin",
    active: 1,
    created_at: todayISO(),
  };
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, active, created_at) VALUES (@id,@name,@email,@password_hash,@role,@active,@created_at)"
  ).run(user);
  const token = sign(user);
  res.json({ token, user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get((email || "").toLowerCase().trim());
  if (!user || !user.active || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "That email or password isn't right." });
  }
  const token = sign(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
