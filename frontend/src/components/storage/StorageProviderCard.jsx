import { useState } from "react";
import { ExternalLink, Trash2, CheckCircle2, AlertCircle, Loader2, WifiOff } from "lucide-react";

export function StorageProviderCard({
    provider,
    onConnect,
    onDisconnect,
    onTest,
    providerInfo,
}) {
    const [testLoading, setTestLoading] = useState(false);
    const [testMessage, setTestMessage] = useState(null);

    const isConnected = provider?.status === "connected";
    const isError = provider?.status === "error";
    const isNotConfigured = provider?.status === "not_configured";
    const isUnavailable = provider?.status === "unavailable";

    const handleTest = async () => {
        setTestLoading(true);
        setTestMessage(null);
        try {
            await onTest();
            setTestMessage({ type: "ok", text: "Ligação OK" });
            setTimeout(() => setTestMessage(null), 3000);
        } catch (err) {
            setTestMessage({ type: "error", text: err.response?.data?.error || "Falhou" });
        } finally {
            setTestLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (window.confirm(`Desligar ${providerInfo.name}?`)) {
            await onDisconnect();
        }
    };

    return (
        <div
            className={`p-4 rounded-2xl border transition-all ${
                isConnected
                    ? "bg-white/[0.03] border-white/10 hover:border-white/20"
                    : isError
                    ? "bg-red-500/5 border-red-500/30 hover:border-red-500/40"
                    : isUnavailable
                    ? "bg-neutral-500/5 border-neutral-500/20 opacity-50 cursor-not-allowed"
                    : "bg-white/[0.02] border-white/8 hover:border-white/15"
            }`}
        >
            {/* Header com icon e nome */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-2xl shrink-0 mt-0.5">{providerInfo.icon}</span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{providerInfo.name}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">{providerInfo.description}</p>
                    </div>
                </div>

                {/* Status badge */}
                <div className="shrink-0">
                    {isConnected && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-xs font-medium text-green-400">Ligado</span>
                        </div>
                    )}
                    {isError && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-xs font-medium text-red-400">Erro</span>
                        </div>
                    )}
                    {isNotConfigured && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-500/10 border border-neutral-500/30">
                            <WifiOff className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="text-xs font-medium text-neutral-400">Inativo</span>
                        </div>
                    )}
                    {isUnavailable && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-xs font-medium text-amber-400">Em breve</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Conta info */}
            {isConnected && provider?.account_info && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-xs text-neutral-300">
                        {provider.account_info}
                    </p>
                </div>
            )}

            {/* Erro info */}
            {isError && provider?.error_message && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
                    <p className="text-xs text-red-300">{provider.error_message}</p>
                </div>
            )}

            {/* Unavailable info */}
            {isUnavailable && provider?.message && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                    <p className="text-xs text-amber-300">{provider.message}</p>
                </div>
            )}

            {/* Test message */}
            {testMessage && (
                <div
                    className={`mb-3 px-3 py-2 rounded-lg text-xs ${
                        testMessage.type === "ok"
                            ? "bg-green-500/10 border border-green-500/20 text-green-300"
                            : "bg-red-500/10 border border-red-500/20 text-red-300"
                    }`}
                >
                    {testMessage.text}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
                {isConnected ? (
                    <>
                        <button
                            onClick={handleTest}
                            disabled={testLoading}
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-neutral-300 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                            {testLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {!testLoading && "Testar"}
                        </button>
                        <button
                            onClick={handleDisconnect}
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Desligar</span>
                        </button>
                    </>
                ) : isUnavailable ? (
                    <button
                        disabled
                        className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 cursor-not-allowed opacity-50 flex items-center justify-center gap-1.5"
                    >
                        <span>Em breve</span>
                    </button>
                ) : (
                    <button
                        onClick={onConnect}
                        className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/30 hover:bg-[#1DB954]/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <span>Ligar</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
