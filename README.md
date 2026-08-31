# MDT Billing — Quotations & Invoicing

A standalone quotation-to-cash system for Marrs Digital Technology: create quotations,
convert accepted ones into invoices, track payments, and see collections/aging analytics.
Multiple people can sign in from different computers at once. Fully white-label —
company details, currency, and theme colors are editable in Settings.

The project has two parts:

- **`server/`** — Node.js/Express API with a built-in SQLite database (no external database
  service to set up). Handles logins, clients, quotations, invoices, and payments.
- **`client/`** — React app (built with Vite) that people actually use in the browser.

---

## 1. Run it locally (fastest way to try it out)

You'll need [Node.js](https://nodejs.org) 18 or newer installed.

**Start the backend:**
```bash
cd server
cp .env.example .env      # edit JWT_SECRET to a long random string
npm install
npm start
```
This starts the API at `http://localhost:4000`. A `data/` folder with the SQLite database
file is created automatically on first run.

**Start the frontend** (in a new terminal):
```bash
cd client
cp .env.example .env      # leave as-is for local use
npm install
npm run dev
```
This opens the app at `http://localhost:5173`.

Open that URL in your browser. The first time, you'll be asked to create the first admin
account — that's you. After that, go to **Settings → Team** to add the rest of your staff
so each person can sign in from their own computer with their own login.

---

## 2. Making it available to multiple computers on your network

If everyone is in the same office, the simplest option: run the backend and frontend on
one computer (or a small always-on machine / Raspberry Pi), then have colleagues open
`http://<that-computer's-IP-address>:5173` in their browser. You'll need to:

1. In `server/.env`, set `FRONTEND_ORIGIN` to `http://<that-computer's-IP>:5173`
2. In `client/.env`, set `VITE_API_URL` to `http://<that-computer's-IP>:4000/api`
3. Restart both

## 3. Putting it on mdt.co.zw for free (step by step)

This gets you a real URL like `billing.mdt.co.zw`, reachable from anywhere, at no cost.
It uses Render (free) for the backend and Vercel (free) for the frontend — both have
free tiers that don't require a credit card.

### Step 1 — Put the code on GitHub
1. Create a free [GitHub](https://github.com) account if you don't have one.
2. Create a new **private** repository, e.g. `mdt-billing`.
3. Upload this whole folder to it (easiest way: on the repo page, "Add file" →
   "Upload files", drag in everything, commit). If you're comfortable with git instead:
   ```bash
   cd mdt-billing
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/mdt-billing.git
   git push -u origin main
   ```

### Step 2 — Deploy the backend on Render
1. Create a free [Render](https://render.com) account and sign in with GitHub.
2. Click **New +** → **Blueprint**, and pick your `mdt-billing` repo. Render will read
   the included `render.yaml` and set up the API service automatically (free plan,
   `JWT_SECRET` generated for you).
3. Click **Apply** / **Deploy**. Wait for the build to finish, then copy the URL Render
   gives you — something like `https://mdt-billing-api.onrender.com`.

   *(No `render.yaml`/Blueprint option showing? Use **New +** → **Web Service** instead,
   point it at the repo, set **Root Directory** to `server`, **Build Command** to
   `npm install`, **Start Command** to `npm start`, and manually add a `JWT_SECRET`
   environment variable with a long random value.)*

### Step 3 — Deploy the frontend on Vercel
1. Create a free [Vercel](https://vercel.com) account and sign in with GitHub.
2. Click **Add New** → **Project**, pick the same `mdt-billing` repo.
3. Set **Root Directory** to `client`.
4. Add an environment variable: `VITE_API_URL` = `https://mdt-billing-api.onrender.com/api`
   (use the exact URL Render gave you in Step 2, with `/api` on the end).
5. Click **Deploy**. Vercel gives you a URL like `https://mdt-billing.vercel.app`.

### Step 4 — Connect it to mdt.co.zw
1. In Vercel, open the project → **Settings** → **Domains** → add `billing.mdt.co.zw`.
   Vercel will show you a CNAME record to create.
2. Go to wherever mdt.co.zw's DNS is managed (your domain registrar or DNS provider),
   and add that CNAME record: host `billing`, pointing to the value Vercel gave you.
3. Wait a few minutes for DNS to propagate. `https://billing.mdt.co.zw` will start
   working automatically with a free SSL certificate.

### Step 5 — Tighten CORS and go live
1. Back in Render, open the backend service → **Environment**, and change
   `FRONTEND_ORIGIN` from `*` to `https://billing.mdt.co.zw`. Save (it'll redeploy).
2. Open `https://billing.mdt.co.zw`, complete the first-run admin setup, and invite your
   team from **Settings → Team**.

### The one honest catch with this free path
Render's free web service doesn't include a persistent disk, so the SQLite file that
holds your clients, quotes, and invoices can be reset if Render redeploys or migrates
your service (it won't happen on every restart, but it can happen without warning). For
poking around and getting comfortable with the app, that's fine. Before you trust it with
real client invoices, do one of:

- **Cheapest fix (~$1–2/month):** upgrade the Render service to a paid instance and
  attach the small persistent disk block already included (commented out) in
  `render.yaml` — this makes storage permanent for a couple of dollars a month.
- **Stay fully free:** ask me to migrate the database from local SQLite to
  [Turso](https://turso.tech) (a free, hosted, SQLite-compatible database built exactly
  for this — 5GB storage, no card required, and it won't get wiped). It's a contained
  change to the `server/` code and keeps the rest of the app exactly as it is.

Either way, once it's live, `https://billing.mdt.co.zw` works from any computer, phone,
or browser your team uses.

---

## Everyday use

- **Clients** → add companies you quote and bill.
- **Quotations** → create, send, mark Accepted/Rejected, then **Convert to invoice** once
  a client agrees.
- **Invoices** → record part or full payments as they come in; status updates automatically
  (Sent → Partially paid → Paid, or Overdue if past due date and unpaid).
- **Dashboard** → collections, outstanding balance, aging report, win rate, top clients.
- **Settings** → company details, bank/EcoCash details, tax rate, numbering, and full theme
  colors — change these to re-brand the whole app for another company.
- **Team** (admin only) → add/remove staff logins, promote to admin, disable access.

## Selling this to other companies

Because company branding and theme colors live in the database (not hardcoded), you can
stand up a **separate deployment per client** (their own server + database + Settings),
each fully re-branded in a couple of minutes. That's the simplest form of white-labeling
with this architecture. Turning it into a single multi-tenant SaaS product (one deployment
serving many companies with data walls between them) is a further step — happy to help
scope that out if/when you're ready to sell it that way.

## Security notes before going live

- Always set a strong, random `JWT_SECRET` in production — never use the example value.
- Serve both frontend and backend over HTTPS (Render/Vercel/Netlify give you this for free).
- Back up the `server/data/mdt-billing.db` file regularly if you're on a VPS.
