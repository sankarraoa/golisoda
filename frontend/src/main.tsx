import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/admin.css";
import "./styles/public-feedback.css";
import "./styles/public-feedback-kiosk.css";
import "./styles/public-feedback-heritage.css";
import "./styles/public-feedback-jewelry-card.css";
import "./styles/public-feedback-phone-portrait.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
