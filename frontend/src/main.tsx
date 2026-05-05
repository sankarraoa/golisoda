import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/admin.css";
import "./styles/public-feedback.css";
import "./styles/public-feedback-kiosk.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
