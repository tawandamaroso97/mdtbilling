import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  LayoutDashboard, FileText, Receipt, Users, Settings as SettingsIcon, Plus, Trash2, Edit3,
  Printer, CheckCircle2, Clock, XCircle, Send, ArrowRight, X, Search, Building2, CreditCard,
  DollarSign, Percent, ArrowUpRight, ArrowDownRight, Mail, Phone, MapPin, Image as ImageIcon,
  Save, RotateCcw, FileDown, Ban, Menu as MenuIcon, LogOut, ShieldCheck, UserPlus
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useAuth } from "./context/AuthContext.jsx";
import { useStore } from "./hooks/useStore.js";
import { api } from "./lib/api.js";
import {
  CURRENCIES, QUOTE_STATUSES, INVOICE_STATUSES, PIPELINE_STAGES,
  uid, todayISO, addDays, daysBetween, fmtMoney, fmtDate, fmtMonth,
  calcLineTotal, calcDocTotals, amountPaidOf, downloadCSV,
} from "./lib/domain.js";

/* ---------------------------- shared bits ---------------------------- */

const Badge = ({ color = "gray", children }) => <span className={`badge badge-${color}`}>{children}</span>;
const StatusBadge = ({ status, map }) => { const s = map[status] || map.draft; return <Badge color={s.color}>{s.label}</Badge>; };

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div className="modal-backdrop no-print" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal-panel ${wide ? "modal-wide" : ""}`}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

const EmptyState = ({ icon, title, subtitle }) => (
  <div className="empty-state"><div className="empty-icon">{icon}</div><h4>{title}</h4><p>{subtitle}</p></div>
);

const StatCard = ({ label, value, sub, icon, trend }) => (
  <div className="stat-card">
    <div className="stat-top"><span className="stat-label">{label}</span><span className="stat-icon">{icon}</span></div>
    <div className="stat-value">{value}</div>
    {sub && <div className={`stat-sub ${trend === "up" ? "stat-up" : trend === "down" ? "stat-down" : ""}`}>{trend === "up" && <ArrowUpRight size={13} />}{trend === "down" && <ArrowDownRight size={13} />}{sub}</div>}
  </div>
);

const FlowTracker = ({ stage, rejected, cancelled, compact }) => {
  const idx = PIPELINE_STAGES.indexOf(stage);
  const labels = ["Drafted", "Sent", "Accepted", "Invoiced", "Paid"];
  const failed = rejected || cancelled;
  return (
    <div className={`flow-tracker ${compact ? "flow-compact" : ""}`}>
      {PIPELINE_STAGES.map((s, i) => {
        const done = !failed && i <= idx;
        const isCurrent = !failed && i === idx;
        const isFailedHere = failed && i === idx;
        return (
          <React.Fragment key={s}>
            <div className="flow-node-wrap">
              <div className={`flow-node ${done ? "flow-done" : ""} ${isCurrent ? "flow-current" : ""} ${isFailedHere ? "flow-failed" : ""}`}>
                {isFailedHere ? <X size={11} /> : done ? <CheckCircle2 size={11} /> : null}
              </div>
              {!compact && <span className={`flow-label ${done ? "flow-label-done" : ""}`}>{isFailedHere ? (rejected ? "Rejected" : "Cancelled") : labels[i]}</span>}
            </div>
            {i < PIPELINE_STAGES.length - 1 && <div className={`flow-line ${i < idx && !failed ? "flow-line-done" : ""}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const LineItemsEditor = ({ items, setItems }) => {
  const addItem = () => setItems([...items, { id: uid(), description: "", qty: 1, unitPrice: 0 }]);
  const removeItem = (id) => setItems(items.filter((i) => i.id !== id));
  const updateItem = (id, field, value) => setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  return (
    <div className="line-items">
      <div className="line-items-head"><span className="li-col-desc">Description</span><span className="li-col-qty">Qty</span><span className="li-col-price">Unit price</span><span className="li-col-total">Total</span><span className="li-col-action"></span></div>
      {items.map((item) => (
        <div className="line-item-row" key={item.id}>
          <input className="li-desc" placeholder="Item or service description" value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} />
          <input className="li-qty" type="number" min="0" step="1" value={item.qty} onChange={(e) => updateItem(item.id, "qty", e.target.value)} />
          <input className="li-price" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)} />
          <span className="li-total">{fmtMoney(calcLineTotal(item))}</span>
          <button type="button" className="icon-btn icon-btn-danger" onClick={() => removeItem(item.id)}><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}><Plus size={14} /> Add line item</button>
    </div>
  );
};

/* ------------------------------- app ---------------------------------- */

export default function App() {
  const { user, token, logout } = useAuth();
  const { settings, clients, quotations, invoices, loading, error, reload } = useStore();

  const [tab, setTab] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [clientModal, setClientModal] = useState(null);
  const [quoteModal, setQuoteModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [quoteDetail, setQuoteDetail] = useState(null);
  const [invoiceDetail, setInvoiceDetail] = useState(null);
  const [paymentModal, setPaymentModal] = useState(null);
  const [busyMsg, setBusyMsg] = useState("");

  const themeVars = settings ? {
    "--primary": settings.theme.primary, "--secondary": settings.theme.secondary, "--accent": settings.theme.accent,
    "--success": settings.theme.success, "--danger": settings.theme.danger, "--warning": settings.theme.warning, "--app-bg": settings.theme.bg,
  } : {};

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const isAdmin = user?.role === "admin";

  const runAction = async (fn) => {
    try { await fn(); } catch (e) { alert(e.message); }
  };

  /* ------------------------------ analytics ------------------------------ */

  const analytics = useMemo(() => {
    const decided = quotations.filter((q) => ["accepted", "rejected", "expired", "invoiced"].includes(q.status));
    const won = quotations.filter((q) => q.status === "accepted" || q.status === "invoiced");
    const conversionRate = decided.length ? (won.length / decided.length) * 100 : 0;

    const activeInvoices = invoices.filter((i) => i.status !== "cancelled");
    const totalInvoiced = activeInvoices.reduce((s, i) => s + (i.total || 0), 0);
    const totalCollected = activeInvoices.reduce((s, i) => s + amountPaidOf(i), 0);
    const outstanding = Math.max(totalInvoiced - totalCollected, 0);

    const overdueInvoices = activeInvoices.filter((i) => i.status === "overdue");
    const overdueAmount = overdueInvoices.reduce((s, i) => s + Math.max((i.total || 0) - amountPaidOf(i), 0), 0);

    const monthBuckets = {};
    activeInvoices.forEach((inv) => (inv.payments || []).forEach((p) => {
      const key = fmtMonth(p.date);
      monthBuckets[key] = (monthBuckets[key] || 0) + (Number(p.amount) || 0);
    }));
    const now = new Date();
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = fmtMonth(d);
      monthlyRevenue.push({ month: key, revenue: Math.round((monthBuckets[key] || 0) * 100) / 100 });
    }

    const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    activeInvoices.forEach((inv) => {
      const bal = Math.max((inv.total || 0) - amountPaidOf(inv), 0);
      if (bal <= 0) return;
      const days = daysBetween(inv.dueDate || inv.date, todayISO());
      if (days <= 0) aging.current += bal;
      else if (days <= 30) aging["1-30"] += bal;
      else if (days <= 60) aging["31-60"] += bal;
      else if (days <= 90) aging["61-90"] += bal;
      else aging["90+"] += bal;
    });

    const byClient = {};
    activeInvoices.forEach((inv) => { byClient[inv.clientId] = (byClient[inv.clientId] || 0) + amountPaidOf(inv); });
    const topClients = Object.entries(byClient)
      .map(([clientId, amount]) => ({ client: clientMap[clientId], amount }))
      .filter((x) => x.client && x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);

    const paidInvoices = activeInvoices.filter((i) => i.status === "paid" && (i.payments || []).length);
    const daysToPayList = paidInvoices.map((i) => daysBetween(i.date, i.payments[i.payments.length - 1].date));
    const avgDaysToPay = daysToPayList.length ? Math.round(daysToPayList.reduce((a, b) => a + b, 0) / daysToPayList.length) : null;

    return {
      conversionRate, totalCollected, outstanding, overdueAmount, monthlyRevenue, aging, topClients, avgDaysToPay,
      openQuotesCount: quotations.filter((q) => q.status === "sent").length,
      openQuotesValue: quotations.filter((q) => q.status === "sent").reduce((s, q) => s + q.total, 0),
    };
  }, [quotations, invoices, clientMap]);

  /* -------------------------------- actions ------------------------------- */

  const saveClient = (data) => runAction(async () => {
    if (data.id) await api.updateClient(token, data.id, data);
    else await api.createClient(token, data);
    await reload();
    setClientModal(null);
  });

  const deleteClient = (id) => runAction(async () => { await api.deleteClient(token, id); await reload(); });

  const saveQuotation = (data) => runAction(async () => {
    if (data.id) await api.updateQuotation(token, data.id, data);
    else await api.createQuotation(token, { ...data, numberPrefix: settings.quotationPrefix });
    await reload();
    setQuoteModal(null);
  });

  const setQuoteStatus = (id, status) => runAction(async () => {
    const updated = await api.setQuotationStatus(token, id, status);
    await reload();
    setQuoteDetail((d) => (d && d.id === id ? updated : d));
  });

  const deleteQuotation = (id) => runAction(async () => { await api.deleteQuotation(token, id); await reload(); setQuoteDetail(null); });

  const convertToInvoice = (quote) => runAction(async () => {
    const { invoice } = await api.convertQuotation(token, quote.id);
    await reload();
    setQuoteDetail(null);
    setTab("invoices");
    setInvoiceDetail(invoice);
  });

  const saveInvoiceDoc = (data) => runAction(async () => {
    if (data.id) await api.updateInvoice(token, data.id, data);
    else await api.createInvoice(token, data);
    await reload();
    setInvoiceModal(null);
  });

  const deleteInvoice = (id) => runAction(async () => { await api.deleteInvoice(token, id); await reload(); setInvoiceDetail(null); });

  const setInvoiceStatus = (id, status) => runAction(async () => {
    const updated = await api.setInvoiceStatus(token, id, status);
    await reload();
    setInvoiceDetail((d) => (d && d.id === id ? updated : d));
  });

  const recordPayment = (invoiceId, payment) => runAction(async () => {
    const updated = await api.addPayment(token, invoiceId, payment);
    await reload();
    setInvoiceDetail(updated);
    setPaymentModal(null);
  });

  const removePayment = (invoiceId, paymentId) => runAction(async () => {
    const updated = await api.removePayment(token, invoiceId, paymentId);
    await reload();
    setInvoiceDetail(updated);
  });

  const printDoc = (doc, docType) => {
    const client = clientMap[doc.clientId];
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { alert("Please allow pop-ups to print or save as PDF."); return; }
    const cur = doc.currency || settings.currency;
    const paid = docType === "invoice" ? amountPaidOf(doc) : 0;
    const balance = docType === "invoice" ? Math.max((doc.total || 0) - paid, 0) : 0;
    const itemsRows = (doc.items || []).map((it) => `
      <tr><td>${(it.description || "—").replace(/</g, "&lt;")}</td><td>${it.qty}</td><td>${fmtMoney(it.unitPrice, cur)}</td><td>${fmtMoney(calcLineTotal(it), cur)}</td></tr>
    `).join("");
    w.document.write(`
      <html><head><title>${doc.number}</title><meta charset="utf-8"/>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#1A2332;margin:40px;}
        h1{font-size:26px;margin:0;color:${settings.theme.primary};}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${settings.theme.accent};padding-bottom:16px;margin-bottom:20px;}
        .co-name{font-weight:bold;font-size:16px;color:${settings.theme.primary};}
        .meta{color:#555;font-size:12px;line-height:1.5;}
        table{width:100%;border-collapse:collapse;margin-top:20px;}
        th{background:${settings.theme.primary};color:#fff;text-align:left;padding:8px;font-size:12px;}
        td{padding:8px;border-bottom:1px solid #eee;font-size:13px;}
        .totals{width:280px;margin-left:auto;margin-top:16px;font-size:13px;}
        .totals div{display:flex;justify-content:space-between;padding:4px 0;}
        .final{font-weight:bold;font-size:15px;border-top:2px solid ${settings.theme.primary};padding-top:8px;color:${settings.theme.primary};}
        .balance{font-weight:bold;color:${settings.theme.danger};}
        .section{margin-top:24px;font-size:12px;}
        .section b{display:block;margin-bottom:4px;color:${settings.theme.primary};}
        .footer{margin-top:40px;text-align:center;color:#888;font-size:11px;border-top:1px solid #eee;padding-top:12px;}
      </style></head><body>
      <div class="head">
        <div><div class="co-name">${settings.companyName}</div><div class="meta">${settings.address}<br/>${settings.email} · ${settings.phone}<br/>${settings.website || ""}</div></div>
        <div style="text-align:right"><h1>${docType === "invoice" ? "INVOICE" : "QUOTATION"}</h1><div style="font-size:13px;margin-top:4px;">${doc.number}</div></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;">
        <div><b style="color:${settings.theme.primary}">Billed to</b><br/>${client?.name || ""}<br/>${client?.address || ""}<br/>${client?.email || ""}</div>
        <div style="text-align:right">
          <div>Date issued: <b>${fmtDate(doc.date)}</b></div>
          ${docType === "quotation" ? `<div>Valid until: <b>${fmtDate(doc.expiryDate)}</b></div>` : `<div>Due date: <b>${fmtDate(doc.dueDate)}</b></div>`}
        </div>
      </div>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${itemsRows}</tbody></table>
      <div class="totals">
        <div><span>Subtotal</span><span>${fmtMoney(doc.subtotal, cur)}</span></div>
        ${doc.discountAmt > 0 ? `<div><span>Discount</span><span>-${fmtMoney(doc.discountAmt, cur)}</span></div>` : ""}
        <div><span>${settings.taxLabel} (${doc.taxRate}%)</span><span>${fmtMoney(doc.taxAmt, cur)}</span></div>
        <div class="final"><span>Total</span><span>${fmtMoney(doc.total, cur)}</span></div>
        ${docType === "invoice" ? `<div><span>Amount paid</span><span>${fmtMoney(paid, cur)}</span></div><div class="balance"><span>Balance due</span><span>${fmtMoney(balance, cur)}</span></div>` : ""}
      </div>
      ${docType === "invoice" && settings.bankName ? `<div class="section"><b>Payment details</b>Bank: ${settings.bankName}<br/>Account name: ${settings.accountName}<br/>Account number: ${settings.accountNumber}<br/>${settings.branch ? "Branch: " + settings.branch + "<br/>" : ""}${settings.ecocashNumber ? "EcoCash: " + settings.ecocashNumber : ""}</div>` : ""}
      <div class="section"><b>Terms & conditions</b>${docType === "invoice" ? settings.terms : settings.quoteNotes}</div>
      <div class="footer">${settings.companyName} · ${settings.email} · ${settings.phone}</div>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  if (loading || !settings) {
    return <div className="mdt-app" style={themeVars}><div className="loading-screen"><div className="spinner" /><span>Loading your workspace…</span></div></div>;
  }

  if (error) {
    return (
      <div className="mdt-app" style={themeVars}>
        <div className="loading-screen">
          <span>{error}</span>
          <button className="btn btn-primary btn-sm" onClick={reload} style={{ marginTop: 12 }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mdt-app" style={themeVars}>
      <div className={`sidebar no-print ${navOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          {settings.logo ? <img src={settings.logo} className="brand-logo" alt="" /> : <div className="brand-mark">{(settings.companyShort || "MD").slice(0, 2)}</div>}
          <div><div className="brand-name">{settings.companyShort || settings.companyName}</div><div className="brand-tag">Quotes & invoicing</div></div>
        </div>
        <nav className="sidebar-nav">
          {[
            ["dashboard", "Dashboard", <LayoutDashboard size={17} />],
            ["quotations", "Quotations", <FileText size={17} />],
            ["invoices", "Invoices", <Receipt size={17} />],
            ["clients", "Clients", <Users size={17} />],
            ...(isAdmin ? [["team", "Team", <ShieldCheck size={17} />]] : []),
            ["settings", "Settings", <SettingsIcon size={17} />],
          ].map(([key, label, icon]) => (
            <button key={key} className={`nav-item ${tab === key ? "nav-active" : ""}`} onClick={() => { setTab(key); setNavOpen(false); }}>{icon}<span>{label}</span></button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-name">{user?.name}</div>
          <div className="sidebar-user-role">{user?.role === "admin" ? "Admin" : "Staff"}</div>
        </div>
        <button className="nav-item" onClick={logout}><LogOut size={17} /><span>Sign out</span></button>
      </div>

      <div className="main-area">
        <div className="topbar no-print">
          <button className="icon-btn mobile-menu-btn" onClick={() => setNavOpen((v) => !v)}><MenuIcon size={20} /></button>
          <div className="topbar-title">{{ dashboard: "Dashboard", quotations: "Quotations", invoices: "Invoices", clients: "Clients", team: "Team", settings: "Settings" }[tab]}</div>
          <div className="topbar-actions">
            {tab === "quotations" && <button className="btn btn-primary btn-sm" onClick={() => setQuoteModal({})}><Plus size={15} /> New quotation</button>}
            {tab === "invoices" && <button className="btn btn-primary btn-sm" onClick={() => setInvoiceModal({})}><Plus size={15} /> New invoice</button>}
            {tab === "clients" && <button className="btn btn-primary btn-sm" onClick={() => setClientModal({})}><Plus size={15} /> New client</button>}
          </div>
        </div>

        <div className="content">
          {tab === "dashboard" && <Dashboard analytics={analytics} settings={settings} quotations={quotations} invoices={invoices} clientMap={clientMap} onOpenQuote={setQuoteDetail} onOpenInvoice={setInvoiceDetail} />}
          {tab === "quotations" && <QuotationsList quotations={quotations} clientMap={clientMap} onOpen={setQuoteDetail} onEdit={setQuoteModal} onDelete={(id) => { if (confirm("Delete this quotation?")) deleteQuotation(id); }} />}
          {tab === "invoices" && <InvoicesList invoices={invoices} clientMap={clientMap} onOpen={setInvoiceDetail} onEdit={setInvoiceModal} onDelete={(id) => { if (confirm("Delete this invoice?")) deleteInvoice(id); }} />}
          {tab === "clients" && <ClientsList clients={clients} quotations={quotations} invoices={invoices} settings={settings} onEdit={setClientModal} onDelete={deleteClient} />}
          {tab === "team" && isAdmin && <TeamPanel token={token} currentUser={user} />}
          {tab === "settings" && <SettingsPanel settings={settings} isAdmin={isAdmin} token={token} reload={reload} />}
        </div>
      </div>

      <Modal open={!!clientModal} onClose={() => setClientModal(null)} title={clientModal?.id ? "Edit client" : "New client"}>
        {clientModal && <ClientForm initial={clientModal} onSave={saveClient} onCancel={() => setClientModal(null)} />}
      </Modal>

      <Modal open={!!quoteModal} onClose={() => setQuoteModal(null)} title={quoteModal?.id ? "Edit quotation" : "New quotation"} wide>
        {quoteModal && <DocFormBase initial={quoteModal} clients={clients} settings={settings} kind="quotation" onSave={saveQuotation} onCancel={() => setQuoteModal(null)} onNewClient={() => setClientModal({})} />}
      </Modal>

      <Modal open={!!invoiceModal} onClose={() => setInvoiceModal(null)} title={invoiceModal?.id ? "Edit invoice" : "New invoice"} wide>
        {invoiceModal && <DocFormBase initial={invoiceModal} clients={clients} settings={settings} kind="invoice" onSave={saveInvoiceDoc} onCancel={() => setInvoiceModal(null)} onNewClient={() => setClientModal({})} />}
      </Modal>

      <Modal open={!!quoteDetail} onClose={() => setQuoteDetail(null)} title={quoteDetail?.number || ""} wide>
        {quoteDetail && (
          <QuoteDetail quote={quoteDetail} client={clientMap[quoteDetail.clientId]} settings={settings}
            onEdit={() => { setQuoteModal(quoteDetail); setQuoteDetail(null); }}
            onDelete={() => { if (confirm("Delete this quotation?")) deleteQuotation(quoteDetail.id); }}
            onStatus={(s) => setQuoteStatus(quoteDetail.id, s)}
            onConvert={() => convertToInvoice(quoteDetail)}
            onPrint={() => printDoc(quoteDetail, "quotation")} />
        )}
      </Modal>

      <Modal open={!!invoiceDetail} onClose={() => setInvoiceDetail(null)} title={invoiceDetail?.number || ""} wide>
        {invoiceDetail && (
          <InvoiceDetail invoice={invoiceDetail} client={clientMap[invoiceDetail.clientId]} settings={settings}
            onEdit={() => { setInvoiceModal(invoiceDetail); setInvoiceDetail(null); }}
            onDelete={() => { if (confirm("Delete this invoice?")) deleteInvoice(invoiceDetail.id); }}
            onStatus={(s) => setInvoiceStatus(invoiceDetail.id, s)}
            onAddPayment={() => setPaymentModal(invoiceDetail)}
            onRemovePayment={(pid) => removePayment(invoiceDetail.id, pid)}
            onPrint={() => printDoc(invoiceDetail, "invoice")} />
        )}
      </Modal>

      <Modal open={!!paymentModal} onClose={() => setPaymentModal(null)} title="Record a payment">
        {paymentModal && <PaymentForm invoice={paymentModal} onSave={(p) => recordPayment(paymentModal.id, p)} onCancel={() => setPaymentModal(null)} />}
      </Modal>
    </div>
  );
}

/* ------------------------------- dashboard ------------------------------ */

function Dashboard({ analytics, settings, quotations, invoices, clientMap, onOpenQuote, onOpenInvoice }) {
  const cur = settings.currency;
  const recentQuotes = [...quotations].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
  const recentInvoices = [...invoices].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
  const maxAging = Math.max(1, ...Object.values(analytics.aging));

  return (
    <div>
      <div className="stat-grid">
        <StatCard label="Total collected" value={fmtMoney(analytics.totalCollected, cur)} sub="All-time payments received" icon={<DollarSign size={16} />} />
        <StatCard label="Outstanding" value={fmtMoney(analytics.outstanding, cur)} sub={`${fmtMoney(analytics.overdueAmount, cur)} overdue`} icon={<Clock size={16} />} trend={analytics.overdueAmount > 0 ? "down" : undefined} />
        <StatCard label="Quote win rate" value={`${analytics.conversionRate.toFixed(0)}%`} sub="Accepted vs. decided quotes" icon={<ArrowUpRight size={16} />} />
        <StatCard label="Open pipeline" value={fmtMoney(analytics.openQuotesValue, cur)} sub={`${analytics.openQuotesCount} quote(s) awaiting reply`} icon={<Send size={16} />} />
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Revenue collected, last 6 months</h3></div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={analytics.monthlyRevenue} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E1D8" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={{ stroke: "#E4E1D8" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} width={70} tickFormatter={(v) => fmtMoney(v, cur)} />
                <Tooltip formatter={(v) => fmtMoney(v, cur)} contentStyle={{ borderRadius: 8, border: "1px solid #E4E1D8", fontSize: 12 }} />
                <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Outstanding by age</h3></div>
          <div className="aging-list">
            {Object.entries(analytics.aging).map(([bucket, amt]) => (
              <div className="aging-row" key={bucket}>
                <span className="aging-bucket">{bucket === "current" ? "Not yet due" : `${bucket} days`}</span>
                <div className="aging-bar-track"><div className="aging-bar-fill" style={{ width: `${(amt / maxAging) * 100}%`, background: bucket === "current" ? "var(--success)" : bucket === "90+" ? "var(--danger)" : "var(--warning)" }} /></div>
                <span className="aging-amount">{fmtMoney(amt, cur)}</span>
              </div>
            ))}
          </div>
          {analytics.avgDaysToPay != null && <div className="hint-row"><Clock size={13} /> Clients pay in {analytics.avgDaysToPay} days on average</div>}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h3>Recent quotations</h3></div>
          {recentQuotes.length === 0 ? <EmptyState icon={<FileText size={28} />} title="No quotations yet" subtitle="Create your first quotation to start tracking deals." /> : (
            <div className="mini-list">
              {recentQuotes.map((q) => (
                <button className="mini-row" key={q.id} onClick={() => onOpenQuote(q)}>
                  <div><div className="mini-row-title">{q.number}</div><div className="mini-row-sub">{clientMap[q.clientId]?.name || "Unknown client"}</div></div>
                  <div className="mini-row-right"><span className="mini-row-amt">{fmtMoney(q.total, q.currency)}</span><StatusBadge status={q.status} map={QUOTE_STATUSES} /></div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Recent invoices</h3></div>
          {recentInvoices.length === 0 ? <EmptyState icon={<Receipt size={28} />} title="No invoices yet" subtitle="Convert an accepted quotation or create an invoice directly." /> : (
            <div className="mini-list">
              {recentInvoices.map((inv) => (
                <button className="mini-row" key={inv.id} onClick={() => onOpenInvoice(inv)}>
                  <div><div className="mini-row-title">{inv.number}</div><div className="mini-row-sub">{clientMap[inv.clientId]?.name || "Unknown client"}</div></div>
                  <div className="mini-row-right"><span className="mini-row-amt">{fmtMoney(inv.total, inv.currency)}</span><StatusBadge status={inv.status} map={INVOICE_STATUSES} /></div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {analytics.topClients.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Top clients by revenue</h3></div>
          <div className="mini-list">
            {analytics.topClients.map(({ client, amount }) => (
              <div className="mini-row mini-row-static" key={client.id}>
                <div><div className="mini-row-title">{client.name}</div><div className="mini-row-sub">{client.contactPerson || client.email}</div></div>
                <span className="mini-row-amt">{fmtMoney(amount, cur)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ list views ------------------------------ */

function QuotationsList({ quotations, clientMap, onOpen, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filtered = quotations.filter((quote) => {
    const client = clientMap[quote.clientId];
    const matchesQ = !q || quote.number.toLowerCase().includes(q.toLowerCase()) || (client?.name || "").toLowerCase().includes(q.toLowerCase());
    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
    return matchesQ && matchesStatus;
  }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return (
    <div>
      <div className="list-toolbar">
        <div className="search-box"><Search size={15} /><input placeholder="Search quotations or clients" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(QUOTE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV("quotations.csv", [
          ["Number", "Client", "Date", "Expiry", "Status", "Total", "Currency"],
          ...filtered.map((qt) => [qt.number, clientMap[qt.clientId]?.name || "", qt.date, qt.expiryDate, QUOTE_STATUSES[qt.status]?.label, qt.total.toFixed(2), qt.currency]),
        ])}><FileDown size={14} /> Export CSV</button>
      </div>
      {filtered.length === 0 ? <EmptyState icon={<FileText size={28} />} title="No quotations found" subtitle="Try a different filter, or create a new quotation." /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Number</th><th>Client</th><th>Date</th><th>Valid until</th><th>Status</th><th className="ta-right">Total</th><th></th></tr></thead>
            <tbody>
              {filtered.map((quote) => (
                <tr key={quote.id} onClick={() => onOpen(quote)} className="clickable-row">
                  <td className="mono">{quote.number}</td>
                  <td>{clientMap[quote.clientId]?.name || "—"}</td>
                  <td>{fmtDate(quote.date)}</td>
                  <td>{fmtDate(quote.expiryDate)}</td>
                  <td><StatusBadge status={quote.status} map={QUOTE_STATUSES} /></td>
                  <td className="ta-right mono">{fmtMoney(quote.total, quote.currency)}</td>
                  <td className="ta-right" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" onClick={() => onEdit(quote)}><Edit3 size={14} /></button>
                    <button className="icon-btn icon-btn-danger" onClick={() => onDelete(quote.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InvoicesList({ invoices, clientMap, onOpen, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filtered = invoices.filter((inv) => {
    const client = clientMap[inv.clientId];
    const matchesQ = !q || inv.number.toLowerCase().includes(q.toLowerCase()) || (client?.name || "").toLowerCase().includes(q.toLowerCase());
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesQ && matchesStatus;
  }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  return (
    <div>
      <div className="list-toolbar">
        <div className="search-box"><Search size={15} /><input placeholder="Search invoices or clients" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(INVOICE_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV("invoices.csv", [
          ["Number", "Client", "Date", "Due", "Status", "Total", "Paid", "Balance", "Currency"],
          ...filtered.map((inv) => [inv.number, clientMap[inv.clientId]?.name || "", inv.date, inv.dueDate, INVOICE_STATUSES[inv.status]?.label, inv.total.toFixed(2), amountPaidOf(inv).toFixed(2), Math.max(inv.total - amountPaidOf(inv), 0).toFixed(2), inv.currency]),
        ])}><FileDown size={14} /> Export CSV</button>
      </div>
      {filtered.length === 0 ? <EmptyState icon={<Receipt size={28} />} title="No invoices found" subtitle="Try a different filter, or create a new invoice." /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Number</th><th>Client</th><th>Date</th><th>Due</th><th>Status</th><th className="ta-right">Total</th><th className="ta-right">Balance</th><th></th></tr></thead>
            <tbody>
              {filtered.map((inv) => {
                const balance = Math.max(inv.total - amountPaidOf(inv), 0);
                return (
                  <tr key={inv.id} onClick={() => onOpen(inv)} className="clickable-row">
                    <td className="mono">{inv.number}</td>
                    <td>{clientMap[inv.clientId]?.name || "—"}</td>
                    <td>{fmtDate(inv.date)}</td>
                    <td>{fmtDate(inv.dueDate)}</td>
                    <td><StatusBadge status={inv.status} map={INVOICE_STATUSES} /></td>
                    <td className="ta-right mono">{fmtMoney(inv.total, inv.currency)}</td>
                    <td className="ta-right mono">{balance > 0 ? fmtMoney(balance, inv.currency) : "—"}</td>
                    <td className="ta-right" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" onClick={() => onEdit(inv)}><Edit3 size={14} /></button>
                      <button className="icon-btn icon-btn-danger" onClick={() => onDelete(inv.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClientsList({ clients, quotations, invoices, settings, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const filtered = clients.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="list-toolbar"><div className="search-box"><Search size={15} /><input placeholder="Search clients" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      {filtered.length === 0 ? <EmptyState icon={<Users size={28} />} title="No clients yet" subtitle="Add a client to start creating quotations and invoices." /> : (
        <div className="client-grid">
          {filtered.map((client) => {
            const clientInvoices = invoices.filter((i) => i.clientId === client.id && i.status !== "cancelled");
            const revenue = clientInvoices.reduce((s, i) => s + amountPaidOf(i), 0);
            const outstanding = clientInvoices.reduce((s, i) => s + Math.max(i.total - amountPaidOf(i), 0), 0);
            const quoteCount = quotations.filter((qt) => qt.clientId === client.id).length;
            return (
              <div className="client-card" key={client.id}>
                <div className="client-card-head">
                  <div className="client-avatar">{client.name.slice(0, 2).toUpperCase()}</div>
                  <div className="client-card-actions">
                    <button className="icon-btn" onClick={() => onEdit(client)}><Edit3 size={14} /></button>
                    <button className="icon-btn icon-btn-danger" onClick={() => onDelete(client.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="client-name">{client.name}</div>
                {client.contactPerson && <div className="client-sub">{client.contactPerson}</div>}
                <div className="client-meta">
                  {client.email && <div><Mail size={12} /> {client.email}</div>}
                  {client.phone && <div><Phone size={12} /> {client.phone}</div>}
                  {client.address && <div><MapPin size={12} /> {client.address}</div>}
                </div>
                <div className="client-stats">
                  <div><span>{quoteCount}</span>quotes</div>
                  <div><span>{fmtMoney(revenue, settings.currency)}</span>revenue</div>
                  <div><span className={outstanding > 0 ? "text-danger" : ""}>{fmtMoney(outstanding, settings.currency)}</span>owed</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- forms -------------------------------- */

function ClientForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ name: "", contactPerson: "", email: "", phone: "", address: "", taxNumber: "", ...initial });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => { e.preventDefault(); if (!form.name.trim()) return; onSave(form); };
  return (
    <form onSubmit={submit} className="form-grid">
      <label className="field field-full">Company / client name<input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme Retailers Pvt Ltd" /></label>
      <label className="field">Contact person<input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} placeholder="Jane Moyo" /></label>
      <label className="field">Tax / VAT number<input value={form.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} /></label>
      <label className="field">Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@client.com" /></label>
      <label className="field">Phone<input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+263 7X XXX XXXX" /></label>
      <label className="field field-full">Address<textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, city, country" /></label>
      <div className="form-actions field-full">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary"><Save size={15} /> Save client</button>
      </div>
    </form>
  );
}

function DocFormBase({ initial, clients, settings, kind, onSave, onCancel, onNewClient }) {
  const isInvoice = kind === "invoice";
  const [form, setForm] = useState(() => ({
    id: initial.id,
    clientId: initial.clientId || "",
    date: initial.date || todayISO(),
    expiryDate: initial.expiryDate || addDays(todayISO(), settings.quoteValidDays),
    dueDate: initial.dueDate || addDays(todayISO(), settings.invoiceDueDays),
    currency: initial.currency || settings.currency,
    taxRate: initial.taxRate ?? settings.taxRate,
    discount: initial.discount ?? 0,
    discountType: initial.discountType || "percent",
    items: initial.items && initial.items.length ? initial.items : [{ id: uid(), description: "", qty: 1, unitPrice: 0 }],
    notes: initial.notes || "",
    status: initial.status || "draft",
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItems = (items) => setForm((f) => ({ ...f, items }));
  const totals = calcDocTotals(form.items, form.taxRate, form.discount, form.discountType);

  const submit = (e) => {
    e.preventDefault();
    if (!form.clientId) { alert("Please select a client."); return; }
    if (!form.items.some((i) => i.description.trim())) { alert("Add at least one line item."); return; }
    onSave(form);
  };

  return (
    <form onSubmit={submit} className="doc-form">
      <div className="form-grid">
        <label className="field">
          Client
          <div className="field-with-btn">
            <select required value={form.clientId} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onNewClient}><Plus size={13} /></button>
          </div>
        </label>
        <label className="field">Currency<select value={form.currency} onChange={(e) => set("currency", e.target.value)}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} — {v.label}</option>)}</select></label>
        <label className="field">Date issued<input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label>
        {isInvoice ? (
          <label className="field">Due date<input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
        ) : (
          <label className="field">Valid until<input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></label>
        )}
        <label className="field">Tax rate ({settings.taxLabel}) %<input type="number" min="0" step="0.5" value={form.taxRate} onChange={(e) => set("taxRate", e.target.value)} /></label>
        <label className="field">
          Discount
          <div className="field-with-btn">
            <input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => set("discount", e.target.value)} />
            <select value={form.discountType} onChange={(e) => set("discountType", e.target.value)} style={{ maxWidth: 90 }}>
              <option value="percent">%</option>
              <option value="fixed">{CURRENCIES[form.currency]?.symbol}</option>
            </select>
          </div>
        </label>
      </div>

      <LineItemsEditor items={form.items} setItems={setItems} />

      <div className="totals-preview">
        <div><span>Subtotal</span><span>{fmtMoney(totals.subtotal, form.currency)}</span></div>
        {totals.discountAmt > 0 && <div><span>Discount</span><span>-{fmtMoney(totals.discountAmt, form.currency)}</span></div>}
        <div><span>{settings.taxLabel} ({form.taxRate}%)</span><span>{fmtMoney(totals.taxAmt, form.currency)}</span></div>
        <div className="totals-preview-final"><span>Total</span><span>{fmtMoney(totals.total, form.currency)}</span></div>
      </div>

      <label className="field field-full">Notes (optional, shown on the document)<textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary"><Save size={15} /> {form.id ? "Save changes" : `Create ${isInvoice ? "invoice" : "quotation"}`}</button>
      </div>
    </form>
  );
}

function PaymentForm({ invoice, onSave, onCancel }) {
  const balance = Math.max((invoice.total || 0) - amountPaidOf(invoice), 0);
  const [form, setForm] = useState({ date: todayISO(), amount: balance.toFixed(2), method: "Bank transfer", reference: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => { e.preventDefault(); if (!(Number(form.amount) > 0)) { alert("Enter a payment amount greater than zero."); return; } onSave(form); };
  return (
    <form onSubmit={submit} className="form-grid">
      <div className="field-full hint-row"><Receipt size={13} /> Balance due: <strong>{fmtMoney(balance, invoice.currency)}</strong></div>
      <label className="field">Payment date<input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label>
      <label className="field">Amount ({invoice.currency})<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></label>
      <label className="field">Method<select value={form.method} onChange={(e) => set("method", e.target.value)}><option>Bank transfer</option><option>EcoCash</option><option>Cash</option><option>Card</option><option>Cheque</option><option>Other</option></select></label>
      <label className="field">Reference / notes<input value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Transaction ref" /></label>
      <div className="form-actions field-full">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary"><Save size={15} /> Record payment</button>
      </div>
    </form>
  );
}

/* -------------------------------- details ------------------------------- */

function DetailHead({ doc, client }) {
  return (
    <div className="detail-head">
      <div><div className="detail-number mono">{doc.number}</div><div className="detail-client">{client?.name || "Unknown client"}</div></div>
      <div className="detail-total"><div className="detail-total-label">Total</div><div className="detail-total-amt">{fmtMoney(doc.total, doc.currency)}</div></div>
    </div>
  );
}

function QuoteDetail({ quote, client, settings, onEdit, onDelete, onStatus, onConvert, onPrint }) {
  return (
    <div>
      <DetailHead doc={quote} client={client} />
      <FlowTracker stage={quote.status === "invoiced" ? "invoiced" : quote.status === "accepted" ? "accepted" : quote.status === "sent" ? "sent" : "draft"} rejected={quote.status === "rejected" || quote.status === "expired"} />
      <div className="detail-toolbar">
        {quote.status === "draft" && <button className="btn btn-secondary btn-sm" onClick={() => onStatus("sent")}><Send size={14} /> Mark as sent</button>}
        {quote.status === "sent" && <>
          <button className="btn btn-secondary btn-sm" style={{ color: "var(--success)" }} onClick={() => onStatus("accepted")}><CheckCircle2 size={14} /> Mark accepted</button>
          <button className="btn btn-secondary btn-sm" style={{ color: "var(--danger)" }} onClick={() => onStatus("rejected")}><XCircle size={14} /> Mark rejected</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onStatus("expired")}><Clock size={14} /> Mark expired</button>
        </>}
        {quote.status === "accepted" && <button className="btn btn-primary btn-sm" onClick={onConvert}><ArrowRight size={14} /> Convert to invoice</button>}
        <button className="btn btn-ghost btn-sm" onClick={onPrint}><Printer size={14} /> Print / PDF</button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}><Edit3 size={14} /> Edit</button>
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={onDelete}><Trash2 size={14} /> Delete</button>
      </div>
      <ItemsPreview doc={quote} settings={settings} />
      <div className="detail-info-grid">
        <div><span style={{ color: "var(--text-muted)" }}>Date issued</span><div>{fmtDate(quote.date)}</div></div>
        <div><span style={{ color: "var(--text-muted)" }}>Valid until</span><div>{fmtDate(quote.expiryDate)}</div></div>
        {quote.notes && <div className="field-full"><span style={{ color: "var(--text-muted)" }}>Notes</span><div>{quote.notes}</div></div>}
      </div>
    </div>
  );
}

function InvoiceDetail({ invoice, client, settings, onEdit, onDelete, onStatus, onAddPayment, onRemovePayment, onPrint }) {
  const status = invoice.status;
  const paid = amountPaidOf(invoice);
  const balance = Math.max(invoice.total - paid, 0);
  return (
    <div>
      <DetailHead doc={invoice} client={client} />
      <FlowTracker stage={status === "paid" ? "paid" : "invoiced"} cancelled={status === "cancelled"} />
      <div className="detail-toolbar">
        {status !== "paid" && status !== "cancelled" && <button className="btn btn-primary btn-sm" onClick={onAddPayment}><CreditCard size={14} /> Record payment</button>}
        <button className="btn btn-ghost btn-sm" onClick={onPrint}><Printer size={14} /> Print / PDF</button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}><Edit3 size={14} /> Edit</button>
        {status !== "cancelled" && <button className="btn btn-ghost btn-sm" onClick={() => onStatus("cancelled")}><Ban size={14} /> Cancel invoice</button>}
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={onDelete}><Trash2 size={14} /> Delete</button>
      </div>
      <div className="balance-strip">
        <div><span>Total</span><strong>{fmtMoney(invoice.total, invoice.currency)}</strong></div>
        <div><span>Paid</span><strong className="text-success">{fmtMoney(paid, invoice.currency)}</strong></div>
        <div><span>Balance</span><strong className={balance > 0 ? "text-danger" : ""}>{fmtMoney(balance, invoice.currency)}</strong></div>
      </div>
      <ItemsPreview doc={invoice} settings={settings} />
      {(invoice.payments || []).length > 0 && (
        <div className="payments-list">
          <div className="print-section-title">Payment history</div>
          {invoice.payments.map((p) => (
            <div className="payment-row" key={p.id}>
              <div><div className="mini-row-title">{fmtMoney(p.amount, invoice.currency)} — {p.method}</div><div className="mini-row-sub">{fmtDate(p.date)}{p.reference ? ` · ${p.reference}` : ""}</div></div>
              <button className="icon-btn icon-btn-danger" onClick={() => onRemovePayment(p.id)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="detail-info-grid">
        <div><span style={{ color: "var(--text-muted)" }}>Date issued</span><div>{fmtDate(invoice.date)}</div></div>
        <div><span style={{ color: "var(--text-muted)" }}>Due date</span><div>{fmtDate(invoice.dueDate)}</div></div>
        {invoice.quotationNumber && <div><span style={{ color: "var(--text-muted)" }}>From quotation</span><div className="mono">{invoice.quotationNumber}</div></div>}
        {invoice.notes && <div className="field-full"><span style={{ color: "var(--text-muted)" }}>Notes</span><div>{invoice.notes}</div></div>}
      </div>
    </div>
  );
}

function ItemsPreview({ doc, settings }) {
  return (
    <div className="items-preview">
      <div className="line-items-head"><span className="li-col-desc">Description</span><span className="li-col-qty">Qty</span><span className="li-col-price">Price</span><span className="li-col-total">Amount</span></div>
      {(doc.items || []).map((it) => (
        <div className="items-preview-row" key={it.id}><span>{it.description}</span><span>{it.qty}</span><span>{fmtMoney(it.unitPrice, doc.currency)}</span><span className="mono">{fmtMoney(calcLineTotal(it), doc.currency)}</span></div>
      ))}
      <div className="totals-preview">
        <div><span>Subtotal</span><span>{fmtMoney(doc.subtotal, doc.currency)}</span></div>
        {doc.discountAmt > 0 && <div><span>Discount</span><span>-{fmtMoney(doc.discountAmt, doc.currency)}</span></div>}
        <div><span>{settings.taxLabel} ({doc.taxRate}%)</span><span>{fmtMoney(doc.taxAmt, doc.currency)}</span></div>
        <div className="totals-preview-final"><span>Total</span><span>{fmtMoney(doc.total, doc.currency)}</span></div>
      </div>
    </div>
  );
}

/* -------------------------------- team panel ----------------------------- */

function TeamPanel({ token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.getUsers(token)); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (u) => {
    try { await api.updateUser(token, u.id, { active: !u.active }); await load(); } catch (e) { alert(e.message); }
  };
  const changeRole = async (u, role) => {
    try { await api.updateUser(token, u.id, { role }); await load(); } catch (e) { alert(e.message); }
  };
  const removeUser = async (u) => {
    if (!confirm(`Remove ${u.name} from the workspace?`)) return;
    try { await api.deleteUser(token, u.id); await load(); } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="list-toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => setInviteOpen(true)}><UserPlus size={15} /> Add team member</button>
      </div>
      {loading ? <div className="hint-row">Loading team…</div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}{u.id === currentUser.id && <span style={{ color: "#6B7280" }}> (you)</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={u.id === currentUser.id} onChange={(e) => changeRole(u, e.target.value)} className="select-filter" style={{ padding: "5px 8px" }}>
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                    </select>
                  </td>
                  <td><Badge color={u.active ? "success" : "gray"}>{u.active ? "Active" : "Disabled"}</Badge></td>
                  <td className="ta-right">
                    {u.id !== currentUser.id && <>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>{u.active ? "Disable" : "Enable"}</button>
                      <button className="icon-btn icon-btn-danger" onClick={() => removeUser(u)}><Trash2 size={14} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Add team member">
        <InviteForm token={token} onDone={async () => { setInviteOpen(false); await load(); }} onCancel={() => setInviteOpen(false)} />
      </Modal>
    </div>
  );
}

function InviteForm({ token, onDone, onCancel }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try { await api.createUser(token, form); onDone(); } catch (e) { setError(e.message); }
  };
  return (
    <form onSubmit={submit} className="form-grid">
      <label className="field field-full">Full name<input required value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label className="field field-full">Work email<input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
      <label className="field">Temporary password<input type="password" required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" /></label>
      <label className="field">Role<select value={form.role} onChange={(e) => set("role", e.target.value)}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
      {error && <div className="auth-error field-full">{error}</div>}
      <div className="form-actions field-full">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary"><UserPlus size={15} /> Add member</button>
      </div>
    </form>
  );
}

/* -------------------------------- settings ------------------------------- */

function SettingsPanel({ settings, isAdmin, token, reload }) {
  const [form, setForm] = useState(settings);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => setForm(settings), [settings]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setTheme = (k, v) => setForm((f) => ({ ...f, theme: { ...f.theme, [k]: v } }));

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("logo", reader.result);
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.updateSettings(token, form);
      await reload();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) { alert(e.message); }
  };

  const resetTheme = () => setForm((f) => ({ ...f, theme: settings.theme }));

  return (
    <form onSubmit={save} className="settings-form">
      {!isAdmin && <div className="hint-row" style={{ marginBottom: 12 }}>Only admins can change company settings. Ask an admin if something needs updating.</div>}
      <fieldset disabled={!isAdmin} style={{ border: "none", padding: 0, margin: 0 }}>
        <div className="panel">
          <div className="panel-head"><h3><Building2 size={16} /> Company profile</h3></div>
          <div className="form-grid">
            <label className="field">Company name<input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} /></label>
            <label className="field">Short name / initials<input value={form.companyShort} onChange={(e) => set("companyShort", e.target.value)} maxLength={5} /></label>
            <label className="field">Email<input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
            <label className="field">Phone<input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
            <label className="field">Secondary phone<input value={form.phone2} onChange={(e) => set("phone2", e.target.value)} /></label>
            <label className="field">Website<input value={form.website} onChange={(e) => set("website", e.target.value)} /></label>
            <label className="field field-full">Address<input value={form.address} onChange={(e) => set("address", e.target.value)} /></label>
            <div className="field">
              Logo
              <div className="logo-upload">
                {form.logo ? <img src={form.logo} alt="logo" /> : <ImageIcon size={20} color="var(--text-muted)" />}
                <div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()}>Upload logo</button>
                  {form.logo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("logo", null)}>Remove</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogo} />
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3><DollarSign size={16} /> Billing defaults</h3></div>
          <div className="form-grid">
            <label className="field">Default currency<select value={form.currency} onChange={(e) => set("currency", e.target.value)}>{Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{k} — {v.label}</option>)}</select></label>
            <label className="field">Tax label<input value={form.taxLabel} onChange={(e) => set("taxLabel", e.target.value)} /></label>
            <label className="field">Default tax rate %<input type="number" min="0" step="0.5" value={form.taxRate} onChange={(e) => set("taxRate", e.target.value)} /></label>
            <label className="field">Quote valid for (days)<input type="number" min="1" value={form.quoteValidDays} onChange={(e) => set("quoteValidDays", e.target.value)} /></label>
            <label className="field">Invoice due in (days)<input type="number" min="1" value={form.invoiceDueDays} onChange={(e) => set("invoiceDueDays", e.target.value)} /></label>
            <label className="field">Quotation number prefix<input value={form.quotationPrefix} onChange={(e) => set("quotationPrefix", e.target.value)} /></label>
            <label className="field">Invoice number prefix<input value={form.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} /></label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3><CreditCard size={16} /> Payment details</h3></div>
          <div className="form-grid">
            <label className="field">Bank name<input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} /></label>
            <label className="field">Account name<input value={form.accountName} onChange={(e) => set("accountName", e.target.value)} /></label>
            <label className="field">Account number<input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} /></label>
            <label className="field">Branch<input value={form.branch} onChange={(e) => set("branch", e.target.value)} /></label>
            <label className="field">Swift code<input value={form.swift} onChange={(e) => set("swift", e.target.value)} /></label>
            <label className="field">EcoCash / mobile money<input value={form.ecocashNumber} onChange={(e) => set("ecocashNumber", e.target.value)} /></label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3><FileText size={16} /> Document text</h3></div>
          <div className="form-grid">
            <label className="field field-full">Quotation notes<textarea rows={2} value={form.quoteNotes} onChange={(e) => set("quoteNotes", e.target.value)} /></label>
            <label className="field field-full">Invoice terms & conditions<textarea rows={3} value={form.terms} onChange={(e) => set("terms", e.target.value)} /></label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3><Percent size={16} /> Theme — white-label ready</h3></div>
          <p className="panel-sub">Customize the colors below to re-brand this system for another company. Changes apply instantly across the app.</p>
          <div className="theme-grid">
            {["primary", "secondary", "accent", "success", "warning", "danger", "bg"].map((k) => (
              <label className="theme-swatch-label" key={k}><input type="color" value={form.theme[k]} onChange={(e) => setTheme(k, e.target.value)} /><span>{k}</span></label>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetTheme}><RotateCcw size={13} /> Reset changes</button>
        </div>

        <div className="form-actions">
          {savedFlash && <span className="hint-row" style={{ color: "var(--success)" }}><CheckCircle2 size={14} /> Settings saved</span>}
          <button type="submit" className="btn btn-primary"><Save size={15} /> Save settings</button>
        </div>
      </fieldset>
    </form>
  );
}
