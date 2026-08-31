import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || "./data/mdt-billing.db";
const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.join(__dirname, "..", dbPath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new Database(resolvedPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_number TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  client_id TEXT NOT NULL,
  date TEXT,
  expiry_date TEXT,
  currency TEXT,
  tax_rate REAL,
  discount REAL,
  discount_type TEXT,
  items TEXT,
  subtotal REAL,
  discount_amt REAL,
  tax_amt REAL,
  total REAL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  quotation_id TEXT,
  quotation_number TEXT,
  client_id TEXT NOT NULL,
  date TEXT,
  due_date TEXT,
  currency TEXT,
  tax_rate REAL,
  discount REAL,
  discount_type TEXT,
  items TEXT,
  subtotal REAL,
  discount_amt REAL,
  tax_amt REAL,
  total REAL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (quotation_id) REFERENCES quotations(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  date TEXT,
  amount REAL,
  method TEXT,
  reference TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
`);

export const DEFAULT_SETTINGS = {
  companyName: "Marrs Digital Technology",
  companyShort: "MDT",
  tagline: "Smart Software for African Business",
  email: "enquiries@mdt.co.zw",
  phone: "+263 772 902 269",
  phone2: "+263 773 812 069",
  address: "Harare, Zimbabwe",
  website: "www.mdt.co.zw",
  logo: null,
  currency: "USD",
  taxRate: 15,
  taxLabel: "VAT",
  quotationPrefix: "MDT-QT",
  invoicePrefix: "MDT-INV",
  quoteValidDays: 14,
  invoiceDueDays: 14,
  bankName: "",
  accountName: "",
  accountNumber: "",
  branch: "",
  swift: "",
  ecocashNumber: "",
  terms: "Payment is due within the stated terms from the invoice date. Late payments may incur additional charges. Goods and services remain the property of the issuing company until paid in full.",
  quoteNotes: "This quotation is valid for the period stated above. Prices are subject to change thereafter.",
  theme: {
    primary: "#0B1E3D",
    secondary: "#142A4D",
    accent: "#C9A227",
    success: "#0E7C5A",
    danger: "#C0392B",
    warning: "#D9822B",
    bg: "#F7F6F2",
  },
};

const existingSettings = db.prepare("SELECT * FROM settings WHERE id = 1").get();
if (!existingSettings) {
  db.prepare("INSERT INTO settings (id, data) VALUES (1, ?)").run(JSON.stringify(DEFAULT_SETTINGS));
}
