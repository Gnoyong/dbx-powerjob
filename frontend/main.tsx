import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";

document.addEventListener("contextmenu", (event) => event.preventDefault());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
