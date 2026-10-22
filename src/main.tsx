import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LibraryPage } from "./routes/index";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <LibraryPage />
    </StrictMode>,
  );
}
