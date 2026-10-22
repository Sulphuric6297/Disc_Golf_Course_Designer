import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SERVER } from "./auth/api";
import { AuthGate } from "./auth/AuthGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {SERVER ? <AuthGate><App /></AuthGate> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
