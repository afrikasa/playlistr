import { Settings2, Music2, Wifi, Radio, Palette, ExternalLink, Check, Cloud } from "lucide-react";
import { useState } from "react";
import axios from "axios";
import { StorageBackendsPanel } from "../components/storage/StorageBackendsPanel";

const XFADE_OPTIONS = [
    { value: 0, label: "Desligado" },
    { value: 1, label: "1s" },
    { value: 2, label: "2s" },
    { value: 3, label: "3s" },
    { value: 5, label: "5s" },
];

const QUALITY_OPTIONS = [
    { value: "128", label: "128 kbps" },
    { value: "192", label: "192 kbps" },
    { value: "320", label: "320 kbps" },
];

const THEME_COLORS = [
    { value: "#1DB954", label: "Spotify Green" },
    { value: "#3B82F6", label: "Azul" },
    { value: "#8B5CF6", label: "Violeta" },
    { value: "#EC4899", label: "Rosa" },
    { value: "#F97316", label: "Laranja" },
    { value: "#EAB308", label: "Amarelo" },
    { value: "#14B8A6", label: "Teal" },
    { value: "#EF4444", label: "Vermelho" },
];

export function SettingsView({ settings, onUpdate }) {
    const [activeTab, setActiveTab] = useState("geral"); // geral | cloud

    return (
        <div className="space-y-6 fade-up">
            {/* Tabs */}
            <div className="flex gap-2 bg-white/[0.02] rounded-xl p-1 border border-white/5">
                <button
                    onClick={() => setActiveTab("geral")}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "geral"
                            ? "bg-white/10 text-white shadow-sm"
                            : "text-neutral-400 hover:text-white"
                    }`}
                >
                    Geral
                </button>
                <button
                    onClick={() => setActiveTab("cloud")}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                        activeTab === "cloud"
                            ? "bg-white/10 text-white shadow-sm"
                            : "text-neutral-400 hover:text-white"
                    }`}
                >
                    <Cloud className="w-4 h-4" />
                    <span className="hidden sm:inline">Cloud</span>
                </button>
            </div>

            {/* Tab: Geral */}
            {activeTab === "geral" && (
                <SettingsGeneralTab settings={settings} onUpdate={onUpdate} />
            )}

            {/* Tab: Cloud */}
            {activeTab === "cloud" && (
                <StorageBackendsPanel />
            )}
        </div>
    );
}

function SettingsGeneralTab({ settings, onUpdate }) {
    const xfade = settings.xfadeSecs ?? 3;
    const quality = settings.defaultQuality || "192";
    const accent = settings.accentColor || "#1DB954";
    const isLfmConnected = Boolean(settings.lastfmSessionKey);
    const [urlDraft, setUrlDraft] = useState(settings.serverUrl || "");
    const [testStatus, setTestStatus] = useState(null);
    const [lfmKey, setLfmKey] = useState(settings.lastfmApiKey || "");
    const [lfmSecret, setLfmSecret] = useState(settings.lastfmApiSecret || "");
    const [lfmStatus, setLfmStatus] = useState(null);
    const [lfmError, setLfmError] = useState("");

    return (
        <div className="space-y-6 fade-up">
            <h2 className="text-lg font-bold">Definições</h2>

            <Section title="Reprodução" icon={<Settings2 className="w-4 h-4" />}>
                <SettingRow label="Crossfade" sub="Duração da transição suave entre faixas">
                    <div className="flex gap-1.5 flex-wrap justify-end">
                        {XFADE_OPTIONS.map((o) => (
                            <Chip key={o.value} active={xfade === o.value} onClick={() => onUpdate({ ...settings, xfadeSecs: o.value })}>{o.label}</Chip>
                        ))}
                    </div>
                </SettingRow>
                <SettingRow label="Normalização de volume" sub="Iguala o volume entre faixas com diferentes níveis">
                    <Toggle
                        value={!!settings.normalizeVolume}
                        onChange={(v) => onUpdate({ ...settings, normalizeVolume: v })}
                    />
                </SettingRow>
            </Section>

            <Section title="Download" icon={<Music2 className="w-4 h-4" />}>
                <SettingRow label="Qualidade padrão" sub="Bitrate dos ficheiros MP3 descarregados">
                    <div className="flex gap-1.5 flex-wrap justify-end">
                        {QUALITY_OPTIONS.map((o) => (
                            <Chip key={o.value} active={quality === o.value} onClick={() => onUpdate({ ...settings, defaultQuality: o.value })}>{o.value} kbps</Chip>
                        ))}
                    </div>
                </SettingRow>
            </Section>

            <Section title="Aparência" icon={<Palette className="w-4 h-4" />}>
                <div className="px-4 py-3.5 space-y-3">
                    <p className="text-sm font-medium">Cor de destaque</p>
                    <div className="flex flex-wrap gap-2">
                        {THEME_COLORS.map((c) => (
                            <button
                                key={c.value}
                                title={c.label}
                                onClick={() => onUpdate({ ...settings, accentColor: c.value })}
                                className="relative w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                                style={{ backgroundColor: c.value, borderColor: accent === c.value ? "#fff" : "transparent" }}
                            >
                                {accent === c.value && <Check className="w-4 h-4 text-black absolute inset-0 m-auto" strokeWidth={3} />}
                            </button>
                        ))}
                        <input
                            type="color"
                            value={accent}
                            onChange={(e) => onUpdate({ ...settings, accentColor: e.target.value })}
                            title="Cor personalizada"
                            className="w-8 h-8 rounded-full cursor-pointer border-2 border-white/20 bg-transparent p-0.5"
                        />
                    </div>
                </div>
            </Section>

            <Section title="Last.fm" icon={<Radio className="w-4 h-4" />}>
                <div className="px-4 py-3.5 space-y-3">
                    {isLfmConnected ? (
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-[#1DB954]">✓ Ligado como <strong>{settings.lastfmUsername}</strong></p>
                                <p className="text-xs text-neutral-500 mt-0.5">Scrobbling activo — cada música é registada após 30s</p>
                            </div>
                            <button onClick={handleLastfmDisconnect} className="text-xs text-neutral-500 hover:text-red-400 transition-colors">Desligar</button>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-neutral-500">
                                Precisas de uma conta Last.fm e de criar uma{" "}
                                <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer" className="text-[#1DB954] underline inline-flex items-center gap-0.5">
                                    API Application <ExternalLink className="w-3 h-3" />
                                </a>{" "}para obter a key e o secret.
                            </p>
                            <div className="space-y-2">
                                <input value={lfmKey} onChange={(e) => setLfmKey(e.target.value)}
                                    placeholder="API Key"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50 font-mono" />
                                <input value={lfmSecret} onChange={(e) => setLfmSecret(e.target.value)}
                                    placeholder="API Secret"
                                    type="password"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50 font-mono" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleLastfmConnect}
                                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/30 hover:bg-[#1DB954]/20 transition-colors">
                                    1. Autorizar no Last.fm
                                </button>
                                <button onClick={handleLastfmVerify} disabled={lfmStatus !== "waiting"}
                                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-neutral-400 border border-white/10 hover:text-white disabled:opacity-40 transition-colors">
                                    2. Confirmar ligação
                                </button>
                            </div>
                            {lfmStatus === "waiting" && <p className="text-xs text-neutral-400">Autoriza no Last.fm e depois clica "Confirmar ligação".</p>}
                            {lfmError && <p className="text-xs text-red-400">{lfmError}</p>}
                        </>
                    )}
                </div>
            </Section>

            <Section title="Servidor" icon={<Wifi className="w-4 h-4" />}>
                <div className="px-4 py-3.5 space-y-2">
                    <div>
                        <p className="text-sm font-medium">URL do backend</p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                            Deixa vazio para usar o servidor local. Para aceder do telemóvel via Tailscale, coloca o URL Tailscale.
                        </p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <input type="url" value={urlDraft}
                            onChange={(e) => { setUrlDraft(e.target.value); setTestStatus(null); }}
                            onBlur={(e) => saveUrl(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveUrl(e.target.value)}
                            placeholder="http://100.x.x.x:8000"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none focus:border-[#1DB954]/50 focus:ring-1 focus:ring-[#1DB954]/30 font-mono" />
                        <button onClick={testConnection}
                            className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 border border-white/10 hover:border-white/20 text-neutral-400 hover:text-white transition-all whitespace-nowrap">
                            Testar
                        </button>
                    </div>
                    {testStatus === "ok" && <p className="text-xs text-[#1DB954]">✓ Ligação estabelecida</p>}
                    {testStatus === "erro" && <p className="text-xs text-red-400">✗ Sem resposta — verifica o URL e o Tailscale</p>}
                    {settings.serverUrl && (
                        <button onClick={() => { setUrlDraft(""); saveUrl(""); }}
                            className="text-xs text-neutral-500 hover:text-red-400 transition-colors">
                            Usar servidor local
                        </button>
                    )}
                </div>
            </Section>
        </div>
    );

    function saveUrl(val) {
        const trimmed = val.trim();
        setUrlDraft(trimmed);
        onUpdate({ ...settings, serverUrl: trimmed || undefined });
        setTestStatus(null);
    }

    async function testConnection() {
        const base = (urlDraft || "").replace(/\/$/, "");
        try {
            const res = await fetch(`${base}/auth-status`, { signal: AbortSignal.timeout(4000) });
            setTestStatus(res.ok ? "ok" : "erro");
        } catch {
            setTestStatus("erro");
        }
    }

    function saveLastfm(key, secret) {
        onUpdate({ ...settings, lastfmApiKey: key || undefined, lastfmApiSecret: secret || undefined });
    }

    function handleLastfmConnect() {
        if (!lfmKey.trim()) { setLfmError("Insere a API Key primeiro"); return; }
        saveLastfm(lfmKey.trim(), lfmSecret.trim());
        setLfmStatus("waiting");
        setLfmError("");
        window.open(`/lastfm/auth?api_key=${encodeURIComponent(lfmKey.trim())}`, "_blank", "width=600,height=600");
    }

    async function handleLastfmVerify() {
        if (!lfmKey.trim() || !lfmSecret.trim()) { setLfmError("Insere a API Key e o Secret"); return; }
        try {
            const r = await axios.post("/lastfm/verify", { api_key: lfmKey.trim(), api_secret: lfmSecret.trim() });
            if (r.data.ok) {
                onUpdate({ ...settings, lastfmApiKey: lfmKey.trim(), lastfmApiSecret: lfmSecret.trim(), lastfmSessionKey: r.data.session_key, lastfmUsername: r.data.username });
                setLfmStatus("ok");
            } else {
                setLfmError(r.data.error || "Falhou");
                setLfmStatus("error");
            }
        } catch {
            setLfmError("Erro de rede");
            setLfmStatus("error");
        }
    }

    function handleLastfmDisconnect() {
        onUpdate({ ...settings, lastfmSessionKey: undefined, lastfmUsername: undefined });
        setLfmStatus(null);
    }
}

function Section({ title, icon, children }) {
    return (
        <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                {icon}{title}
            </p>
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.08] divide-y divide-white/5">
                {children}
            </div>
        </div>
    );
}

function SettingRow({ label, sub, children }) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
            </div>
            <div className="flex-shrink-0">{children}</div>
        </div>
    );
}

function Chip({ active, onClick, children }) {
    return (
        <button onClick={onClick}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${active ? "bg-[#1DB954] text-black border-[#1DB954]" : "bg-white/5 text-neutral-400 hover:text-white border-white/10"}`}>
            {children}
        </button>
    );
}

function Toggle({ value, onChange }) {
    return (
        <button onClick={() => onChange(!value)}
            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${value ? "bg-[#1DB954]" : "bg-white/10"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
    );
}
