import "@fontsource-variable/archivo/standard.css";
import "@fontsource-variable/geist-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/primitives.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

// Until the settings are in: the first screen stands on the vibrancy view too.
document.documentElement.classList.toggle(
  "vibrant",
  window.omadia.platform === "darwin",
);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
