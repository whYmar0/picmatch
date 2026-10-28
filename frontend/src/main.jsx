import React from "react";
import ReactDOM from "react-dom/client";
import { IconContext } from "@phosphor-icons/react";
import App from "./App.jsx";
import "./index.css";

// Global icon theme: Bold for a strong, clear visual style.
// Individual icons can still override with weight="regular" | "duotone" | "fill" | ...
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <IconContext.Provider value={{ weight: "bold" }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>
);
