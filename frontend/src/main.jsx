// ── main.jsx ──────────────────────────────────────────────────────────────────
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./app.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <NotificationProvider>
            <App />
          </NotificationProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: "10px",
                fontFamily: "Inter, sans-serif",
                fontSize: "0.9rem",
              },
              success: { iconTheme: { primary: "#3B6D11", secondary: "#fff" } },
              error:   { iconTheme: { primary: "#DC2626", secondary: "#fff" } },
            }}
          />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);