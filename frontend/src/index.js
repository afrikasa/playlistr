import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Registar service worker para suporte offline e instalação como PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Forçar verificação de update em cada visita
        reg.update();
        // Verificar de hora a hora
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {});

    // Recarregar quando o SW activo mudar (novo SW tomou controlo via skipWaiting + clients.claim)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  });
}
