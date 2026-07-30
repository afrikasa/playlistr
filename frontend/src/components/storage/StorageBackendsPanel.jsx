import { Cloud } from "lucide-react";
import { useStorageBackends } from "@/hooks/useStorageBackends";
import { PROVIDERS, LOCAL_PROVIDER } from "@/types/storage";
import { StorageProviderCard } from "./StorageProviderCard";
import { OAuthConnectButton } from "./OAuthConnectButton";
import { DirectConnectForm } from "./DirectConnectForm";

export function StorageBackendsPanel() {
    const { providers, loading, error, connectOAuth, connectDirect, disconnect, testConnection } = useStorageBackends();

    // Backend deve retornar um campo "name" (ou "instance_name") para suportar múltiplas contas de um mesmo provider.
    // Por enquanto, usamos providerId como name. Isto funciona se há apenas uma instância por provider.
    const getProviderStatus = (id) => {
        return providers.find((p) => p.id === id);
    };

    const handleConnect = (providerId) => {
        const providerInfo = PROVIDERS.find((p) => p.id === providerId);
        const providerStatus = getProviderStatus(providerId);
        if (providerInfo?.type === "oauth") {
            // Para OAuth, passamos provider (id), name (identificador único do backend), e status
            return connectOAuth(providerId, providerId, providerStatus?.status);
        }
    };

    const handleDirectConnect = (providerId, credentials) => {
        // connectDirect espera: provider, credentials (inclui name, access_token, etc), e status
        const providerStatus = getProviderStatus(providerId);
        return connectDirect(providerId, credentials, providerStatus?.status);
    };

    const handleDisconnect = (providerId) => {
        // Desconectar usando provider ID
        return disconnect(providerId, providerId);
    };

    const handleTest = (providerId) => {
        // Testar usando provider ID
        return testConnection(providerId, providerId);
    };

    return (
        <div className="space-y-6 fade-up">
            <div>
                <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
                    <Cloud className="w-5 h-5" />
                    Cloud Backends
                </h2>
                <p className="text-sm text-neutral-400">
                    Escolhe onde guardar automaticamente as tuas músicas descarregadas
                </p>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                    Erro ao carregar backends: {error}
                </div>
            )}

            {/* Local storage — sempre ativo, não pode desligar */}
            <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                    Armazenamento Local
                </p>
                <StorageProviderCard
                    provider={{ status: "connected", account_info: "Pasta de Downloads" }}
                    onConnect={() => {}}
                    onDisconnect={() => {}}
                    onTest={() => Promise.resolve()}
                    providerInfo={LOCAL_PROVIDER}
                />
            </div>

            {/* Cloud providers grid */}
            <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                    Cloud Services
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PROVIDERS.map((providerInfo) => {
                        const status = getProviderStatus(providerInfo.id);

                        return (
                            <div key={providerInfo.id}>
                                {providerInfo.type === "oauth" ? (
                                    <StorageProviderCard
                                        provider={status}
                                        onConnect={() => handleConnect(providerInfo.id)}
                                        onDisconnect={() => handleDisconnect(providerInfo.id)}
                                        onTest={() => handleTest(providerInfo.id)}
                                        providerInfo={providerInfo}
                                    />
                                ) : (
                                    <div className={`p-4 rounded-2xl border transition-all ${
                                        status?.status === "connected"
                                            ? "bg-white/[0.03] border-white/10 hover:border-white/20"
                                            : "bg-white/[0.02] border-white/8 hover:border-white/15"
                                    }`}>
                                        {/* Header com icon e nome */}
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <span className="text-2xl shrink-0 mt-0.5">{providerInfo.icon}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-white">{providerInfo.name}</p>
                                                    <p className="text-xs text-neutral-400 mt-0.5">{providerInfo.description}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Form direto para Telegram/SMB/SFTP */}
                                        {!status || (status.status === "not_configured") ? (
                                            <DirectConnectForm
                                                providerId={providerInfo.id}
                                                onConnect={handleDirectConnect}
                                            />
                                        ) : (
                                            <StorageProviderCard
                                                provider={status}
                                                onConnect={() => {}}
                                                onDisconnect={() => handleDisconnect(providerInfo.id)}
                                                onTest={() => handleTest(providerInfo.id)}
                                                providerInfo={providerInfo}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {loading && (
                <div className="text-center py-8 text-neutral-400">
                    <p className="text-sm">A carregar backends...</p>
                </div>
            )}
        </div>
    );
}
