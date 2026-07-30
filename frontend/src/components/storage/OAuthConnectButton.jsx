import { useState } from "react";
import { Loader2 } from "lucide-react";

export function OAuthConnectButton({
    providerId,
    onConnect,
    disabled = false,
}) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            await onConnect(providerId);
        } catch (err) {
            console.error("OAuth connect failed:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={loading || disabled}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/30 hover:bg-[#1DB954]/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Carregando..." : "Ligar"}
        </button>
    );
}
