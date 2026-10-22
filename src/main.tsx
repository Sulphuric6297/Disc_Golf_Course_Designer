import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SERVER } from "./auth/api";
import { AuthGate } from "./auth/AuthGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PublicSite, SITE_TOKEN } from "./auth/PublicSite";
import { ezReady } from "./three/ezShapes";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

// (the trees' generator first: the course's trees are grown with it from the first frame)
void ezReady.catch(() => {}).finally(() => createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {SERVER && SITE_TOKEN ? <PublicSite><App /></PublicSite> : SERVER ? <AuthGate><App /></AuthGate> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
));
