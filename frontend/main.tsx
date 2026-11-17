import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installBrowserShortcutGuard } from "./browserShortcuts";
import { PluginToaster } from "./components/ui/toaster";
import "sonner/dist/styles.css";
import "./style.css";

installBrowserShortcutGuard(window);
document.addEventListener("contextmenu", (event) => event.preventDefault());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <PluginToaster />
  </React.StrictMode>,
);
