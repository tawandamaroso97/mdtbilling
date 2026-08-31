import React, { useState } from "react";
import { Building2, Lock, Mail, User, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function AuthScreen({ mode }) {
  const { login, setup } = useAuth();
  const isSetup = mode === "needs-setup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isSetup) await setup(name, email, password);
      else await login(email, password);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 16 }}>MD</div>
          <div>
            <div className="auth-brand-name">MDT Billing</div>
            <div className="auth-brand-sub">Quotations & invoicing</div>
          </div>
        </div>

        <h2>{isSetup ? "Set up your workspace" : "Welcome back"}</h2>
        <p className="auth-sub">
          {isSetup
            ? "Create the first admin account. You can invite your team afterwards from Settings."
            : "Sign in with your work email to continue."}
        </p>

        <form onSubmit={submit} className="auth-form">
          {isSetup && (
            <label className="field">
              Full name
              <div className="input-icon"><User size={15} /><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tawanda Marrs" /></div>
            </label>
          )}
          <label className="field">
            Email
            <div className="input-icon"><Mail size={15} /><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mdt.co.zw" /></div>
          </label>
          <label className="field">
            Password
            <div className="input-icon"><Lock size={15} /><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? "Please wait…" : isSetup ? "Create workspace" : "Sign in"} <ArrowRight size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
