// ── main.jsx ──────────────────────────────────────────────────────────────────
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./app.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import "./styles/global.css";
import "./styles/ui.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <NotificationProvider>
            <ErrorBoundary>
            <App />
          </ErrorBoundary>
          </NotificationProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: "10px",
                fontFamily: "Plus Jakarta Sans, sans-serif",
                fontSize: "0.9rem",
                color: "#14201A",
              },
              success: { iconTheme: { primary: "#13703C", secondary: "#fff" } },
              error:   { iconTheme: { primary: "#B8401F", secondary: "#fff" } },
            }}
          />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);