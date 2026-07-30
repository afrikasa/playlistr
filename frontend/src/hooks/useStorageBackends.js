import { useState, useEffect, useCallback } from "react";
import axios from "axios";

// Hook para gerenciar storage backends com polling
export function useStorageBackends() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch providers — polling a cada 30s
    const fetchProviders = useCallback(async () => {
        try {
            const res = await axios.get("/storage/providers");
            setProviders(res.data.providers || []);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProviders();
        const interval = setInterval(fetchProviders, 30000);
        return () => clearInterval(interval);
    }, [fetchProviders]);

    const connectOAuth = useCallback((provider, name, providerStatus) => {
        // Bloqueia se provider está unavailable
        if (providerStatus === "unavailable") {
            return Promise.reject(new Error("Este provedor está indisponível no momento"));
        }
        // Inicia autenticação OAuth — o backend retorna auth_url ou abre popup
        return axios.post(`/storage/providers/${provider}/${name}/authenticate`)
            .then((res) => {
                // Refetch providers após OAuth completado
                setTimeout(fetchProviders, 1000);
            });
    }, [fetchProviders]);

    const connectDirect = useCallback((provider, credentials, providerStatus) => {
        // Bloqueia se provider está unavailable
        if (providerStatus === "unavailable") {
            return Promise.reject(new Error("Este provedor está indisponível no momento"));
        }
        // Conecta com credenciais directo (Telegram, SMB, SFTP)
        // body inclui: provider, name, enabled, + campos específicos do provider
        return axios.post(`/storage/providers/connect`, {
            provider,
            ...credentials,
        })
            .then(() => {
                fetchProviders();
            });
    }, [fetchProviders]);

    const disconnect = useCallback((provider, name) => {
        return axios.post(`/storage/providers/${provider}/${name}/disconnect`)
            .then(() => {
                fetchProviders();
            });
    }, [fetchProviders]);

    const testConnection = useCallback((provider, name) => {
        return axios.post(`/storage/providers/${provider}/${name}/test`);
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
