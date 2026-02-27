import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Non-blocking: app works without push support.
    });
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <Toaster
              position="bottom-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: "var(--surface)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  border: "1px solid var(--line)",
                  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.25)",
                },
                success: { iconTheme: { primary: "#22c55e", secondary: "var(--surface)" } },
                error: { iconTheme: { primary: "#ef4444", secondary: "var(--surface)" } },
              }}
            />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
