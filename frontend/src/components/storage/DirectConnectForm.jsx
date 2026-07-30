import { useState } from "react";
import { ExternalLink, Loader2, Eye, EyeOff } from "lucide-react";

export function DirectConnectForm({
    providerId,
    onConnect,
    disabled = false,
}) {
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState(getInitialData(providerId));

    function getInitialData(id) {
        // Gera um nome único baseado no provider e timestamp
        const backendName = `${id}_${Date.now()}`;

        switch (id) {
            case "telegram":
                return { name: backendName, bot_token: "", chat_id: "" };
            case "smb":
                return { name: backendName, smb_host: "", smb_user: "", smb_password: "", smb_share: "", smb_path: "" };
            case "sftp":
                return { name: backendName, sftp_host: "", sftp_port: 22, sftp_user: "", sftp_password: "", sftp_path: "" };
            default:
                return { name: backendName };
        }
    }

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onConnect(providerId, formData);
        } catch (err) {
            console.error("Direct connect failed:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            {providerId === "telegram" && (
                <>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Bot Token
                        </label>
                        <input
                            type="password"
                            value={formData.bot_token || ""}
                            onChange={(e) => handleChange("bot_token", e.target.value)}
                            placeholder="123456:ABC-DEF..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50 font-mono"
                            required
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                            Criar bot:{" "}
                            <a
                                href="https://t.me/BotFather"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#1DB954] underline inline-flex items-center gap-0.5"
                            >
                                @BotFather <ExternalLink className="w-3 h-3" />
                            </a>
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Chat ID
                        </label>
                        <input
                            type="text"
                            value={formData.chat_id || ""}
                            onChange={(e) => handleChange("chat_id", e.target.value)}
                            placeholder="123456789"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50 font-mono"
                            required
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                            Obter ID:{" "}
                            <a
                                href="https://t.me/getidsbot"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#1DB954] underline inline-flex items-center gap-0.5"
                            >
                                @getidsbot <ExternalLink className="w-3 h-3" />
                            </a>
                        </p>
                    </div>
                </>
            )}

            {providerId === "smb" && (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                                Host
                            </label>
                            <input
                                type="text"
                                value={formData.smb_host || ""}
                                onChange={(e) => handleChange("smb_host", e.target.value)}
                                placeholder="192.168.1.100"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                                Share
                            </label>
                            <input
                                type="text"
                                value={formData.smb_share || ""}
                                onChange={(e) => handleChange("smb_share", e.target.value)}
                                placeholder="Música"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Utilizador
                        </label>
                        <input
                            type="text"
                            value={formData.smb_user || ""}
                            onChange={(e) => handleChange("smb_user", e.target.value)}
                            placeholder="user"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={formData.smb_password || ""}
                                onChange={(e) => handleChange("smb_password", e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Pasta (opcional)
                        </label>
                        <input
                            type="text"
                            value={formData.smb_path || ""}
                            onChange={(e) => handleChange("smb_path", e.target.value)}
                            placeholder="Playlists/Spotify"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                        />
                    </div>
                </>
            )}

            {providerId === "sftp" && (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                                Host
                            </label>
                            <input
                                type="text"
                                value={formData.sftp_host || ""}
                                onChange={(e) => handleChange("sftp_host", e.target.value)}
                                placeholder="sftp.example.com"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                                Port
                            </label>
                            <input
                                type="number"
                                value={formData.sftp_port || "22"}
                                onChange={(e) => handleChange("sftp_port", parseInt(e.target.value) || 22)}
                                placeholder="22"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Utilizador
                        </label>
                        <input
                            type="text"
                            value={formData.sftp_user || ""}
                            onChange={(e) => handleChange("sftp_user", e.target.value)}
                            placeholder="user"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={formData.sftp_password || ""}
                                onChange={(e) => handleChange("sftp_password", e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                            Pasta (opcional)
                        </label>
                        <input
                            type="text"
                            value={formData.sftp_path || ""}
                            onChange={(e) => handleChange("sftp_path", e.target.value)}
                            placeholder="/home/user/Música"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50"
                        />
                    </div>
                </>
            )}

            <button
                type="submit"
                disabled={loading || disabled}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/30 hover:bg-[#1DB954]/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Ligando..." : "Ligar"}
            </button>
        </form>
    );
}
