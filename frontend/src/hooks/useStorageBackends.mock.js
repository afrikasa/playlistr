// Mock para testes locais — comentar axios e usar esta versão
// Para ativar: renomear useStorageBackends.js para useStorageBackends.real.js
// e renomear este ficheiro para useStorageBackends.js

import { useState, useEffect, useCallback } from "react";

// Mock de providers com diferentes estados
const MOCK_PROVIDERS = [
    {
        id: "gdrive",
        status: "connected",
        account_info: "marcus.costa.1988@gmail.com",
        error_message: null,
    },
    {
        id: "dropbox",
        status: "unavailable",
        account_info: null,
        error_message: null,
        message: "Este provedor está indisponível. Será reativado em breve.",
    },
    {
        id: "onedrive",
        status: "not_configured",
        account_info: null,
        error_message: null,
    },
    {
        id: "telegram",
        status: "not_configured",
        account_info: null,
        error_message: null,
    },
    {
        id: "smb",
        status: "error",
        account_info: null,
        error_message: "Rede indisponível",
    },
    {
        id: "sftp",
        status: "not_configured",
        account_info: null,
        error_message: null,
    },
];

export function useStorageBackends() {
    const [providers, setProviders] = useState(MOCK_PROVIDERS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch providers — simular com delay
    const fetchProviders = useCallback(async () => {
        setLoading(true);
        await new Promise((r) => setTimeout(r, 500));
        setProviders(MOCK_PROVIDERS);
        setError(null);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchProviders();
        const interval = setInterval(fetchProviders, 30000);
        return () => clearInterval(interval);
    }, [fetchProviders]);

    const connectOAuth = useCallback(async (providerId, name, providerStatus) => {
        console.log("MOCK: connectOAuth", providerId, name, providerStatus);

        // Bloqueia se provider está unavailable
        if (providerStatus === "unavailable") {
            return Promise.reject(new Error("Este provedor está indisponível no momento"));
        }

        // Simular OAuth popup
        const popup = window.open("about:blank", "_blank", "width=600,height=700");

        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (popup?.closed) {
                    clearInterval(checkInterval);

                    // Simular conexão bem-sucedida
                    setProviders((prev) =>
                        prev.map((p) =>
                            p.id === providerId
                                ? { ...p, status: "connected", account_info: "user@example.com", error_message: null }
                                : p
                        )
                    );

                    resolve();
                }
            }, 500);
        });
    }, []);

    const connectDirect = useCallback(async (providerId, credentials, providerStatus) => {
        console.log("MOCK: connectDirect", providerId, credentials, providerStatus);

        // Bloqueia se provider está unavailable
        if (providerStatus === "unavailable") {
            return Promise.reject(new Error("Este provedor está indisponível no momento"));
        }

        // Simular delay de conexão
        await new Promise((r) => setTimeout(r, 1000));

        // Sempre conectar com sucesso no mock
        setProviders((prev) =>
            prev.map((p) =>
                p.id === providerId
                    ? { ...p, status: "connected", account_info: credentials.host || credentials.botToken || "connected", error_message: null }
                    : p
            )
        );
    }, []);

    const disconnect = useCallback(async (providerId) => {
        console.log("MOCK: disconnect", providerId);

        await new Promise((r) => setTimeout(r, 500));

        setProviders((prev) =>
            prev.map((p) =>
                p.id === providerId
                    ? { ...p, status: "not_configured", account_info: null, error_message: null }
                    : p
            )
        );
    }, []);

    const testConnection = useCallback(async (providerId) => {
        console.log("MOCK: testConnection", providerId);

        await new Promise((r) => setTimeout(r, 1000));

        // Simular 80% sucesso, 20% falha
        if (Math.random() > 0.2) {
            return Promise.resolve({ status: "ok" });
        } else {
            return Promise.reject(new Error("Simulado: Teste de ligação falhou"));
        }
    }, []);

    return {
        providers,
        loading,
        error,
        fetchProviders,
        connectOAuth,
        connectDirect,
        disconnect,
        testConnection,
    };
}
