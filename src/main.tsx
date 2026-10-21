import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SERVER } from "./auth/api";
import { AuthGate } from "./auth/AuthGate";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <React.StrictMode>
    {SERVER ? <AuthGate><App /></AuthGate> : <App />}
  </React.StrictMode>
);
