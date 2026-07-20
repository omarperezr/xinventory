import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // The build id names the service worker's cache. Without it a deploy kept
    // serving the previous build's hashed chunks, so lazily-loaded routes
    // failed to import and rendered a blank page.
    navigator.serviceWorker
      .register(`/sw.js?v=${__BUILD_ID__}`)
      .then((registration) => {
        // On a first visit there is no controller yet, and the worker taking
        // over is expected - reloading then would just be a wasted round trip.
        // A change of controller on a page that already had one means a new
        // build activated underneath us, so reload once onto it.
        const hadController = !!navigator.serviceWorker.controller;
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!hadController || reloading) return;
          reloading = true;
          window.location.reload();
        });
        registration.update().catch(() => {});
      })
      .catch(() => {});
  });
}
