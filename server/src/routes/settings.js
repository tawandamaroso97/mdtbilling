import { Router } from "express";
import { db, DEFAULT_SETTINGS } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const row = db.prepare("SELECT data FROM settings WHERE id = 1").get();
  res.json(row ? JSON.parse(row.data) : DEFAULT_SETTINGS);
});

router.put("/", requireAdmin, (req, res) => {
  const merged = { ...DEFAULT_SETTINGS, ...req.body, theme: { ...DEFAULT_SETTINGS.theme, ...(req.body.theme || {}) } };
  db.prepare("UPDATE settings SET data = ? WHERE id = 1").run(JSON.stringify(merged));
  res.json(merged);
});

export default router;
