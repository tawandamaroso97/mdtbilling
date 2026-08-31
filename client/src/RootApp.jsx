import React from "react";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import AuthScreen from "./pages/AuthScreen.jsx";
import App from "./App.jsx";
import "./styles.css";

function Root() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <div className="mdt-app" style={{ "--app-bg": "#F7F6F2" }}>
        <div className="loading-screen"><div className="spinner" /><span>Loading…</span></div>
      </div>
    );
  }
  if (status === "needs-setup" || status === "needs-login") {
    return <AuthScreen mode={status} />;
  }
  return <App />;
}

export default function Wrapped() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
