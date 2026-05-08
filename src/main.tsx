import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// App is always dark — add class once at startup
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
