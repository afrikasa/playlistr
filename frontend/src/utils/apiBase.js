/**
 * Devolve o URL base do backend configurado nas Definições.
 * Vazio = servidor local (URLs relativas funcionam normalmente).
 */
export function getApiBase() {
    try {
        const s = JSON.parse(localStorage.getItem("playlistr_settings") || "{}");
        return (s.serverUrl || "").replace(/\/$/, "");
    } catch { return ""; }
}

/** Prefixo de URL para assets estáticos servidos pelo backend (/files/, /cover/, etc.) */
export function assetUrl(path) {
    const base = getApiBase();
    return base ? `${base}${path}` : path;
}
