import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { SERVER } from "./auth/api";
import { AuthGate } from "./auth/AuthGate";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PublicSite, SITE_TOKEN } from "./auth/PublicSite";
import "./index.css";

// The editor (the map, 3D, the painter) loads on its own: the sign-in and the course list show
// without waiting for it. The trees' generator first: the course's trees are grown with it from
// the first frame.
const App = lazy(() => Promise.all([import("./App"), import("./three/ezShapes").then(m => m.ezReady.catch(() => {}))]).then(([m]) => m));

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const app = <Suspense fallback={null}><App /></Suspense>;
createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {SERVER && SITE_TOKEN ? <PublicSite>{app}</PublicSite> : SERVER ? <AuthGate>{app}</AuthGate> : app}
    </ErrorBoundary>
  </React.StrictMode>
);
