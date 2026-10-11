import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initPreferences } from "./lib/preferences";
import "./index.css";

// Applied before the first paint, otherwise a dark-theme user gets a flash of
// the light palette on every page load.
initPreferences();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
