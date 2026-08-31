import "dotenv/config";
import express from "express";
import cors from "cors";
import "./db.js";

import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import settingsRoutes from "./routes/settings.js";
import clientsRoutes from "./routes/clients.js";
import quotationsRoutes from "./routes/quotations.js";
import invoicesRoutes from "./routes/invoices.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/quotations", quotationsRoutes);
app.use("/api/invoices", invoicesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end. Try again." });
});

app.listen(PORT, () => {
  console.log(`MDT billing API running on http://localhost:${PORT}`);
});
