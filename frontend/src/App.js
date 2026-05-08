import { useEffect, useRef, useState } from "react";
import { Music4, Github, Download, Library, BarChart2, Settings, WifiOff, History } from "lucide-react";
import "@/App.css";
import "@/index.css";
import { HomeView } from "./views/HomeView";
import { LibraryView } from "./views/LibraryView";
import { StatsView } from "./views/StatsView";
import { SettingsView } from "./views/SettingsView";
import { DownloadsView } from "./views/DownloadsView";
import { Player } from "./components/Player";
import { Toaster, toast } from "sonner";
import axios from "axios";

export default function App() {
    const [tab, setTab] = useState("download"); // download | library | stats | settings
    const [phase, setPhase] = useState("home"); // home | downloading | completed
    const [settings, setSettings] = useState(() => {
        try { return JSON.parse(localStorage.getItem("playlistr_settings") || "{}"); } catch { return {}; }
    });
    const updateSettings = (next) => {
        setSettings(next);
        localStorage.setItem("playlistr_settings", JSON.stringify(next));
    };

    // URL base do backend — vazio = mesmo servidor (produção), ou URL remoto (Tailscale/servidor)
    const apiBase = (settings.serverUrl || "").replace(/\/$/, "");
    useEffect(() => {
        axios.defaults.baseURL = apiBase || undefined;
    }, [apiBase]);
    const [serverOnline, setServerOnline] = useState(true);
    const [tracks, setTracks] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [statuses, setStatuses] = useState({});
    const [config, setConfig] = useState(null);
    const [playerQueue, setPlayerQueue] = useState(() => {
        try {
            const s = JSON.parse(sessionStorage.getItem("playlistr_queue") || "null");
            return s?.queue?.length ? s.queue : null;
        } catch { return null; }
    });
    const [playerIndex, setPlayerIndex] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem("playlistr_queue") || "null")?.index ?? 0; } catch { return 0; }
    });
    const [playerKey, setPlayerKey] = useState(0);
    const [currentPath, setCurrentPath] = useState(null);
    const [downloadHistory, setDownloadHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem("playlistr_dl_history") || "[]"); } catch { return []; }
    });
    const esRef = useRef(null);
    const configRef = useRef(null);

    // Manter configRef sincronizado para usar em closures SSE
    useEffect(() => { configRef.current = config; }, [config]);

    // Restaurar estado de download do sessionStorage ao arrancar
    useEffect(() => {
        try {
            const saved = sessionStorage.getItem("playlistr_dl_state");
            if (!saved) return;
            const s = JSON.parse(saved);
            if (s.phase && s.phase !== "home") {
                setPhase(s.phase);
                setTracks(s.tracks || []);
                setStatuses(s.statuses || {});
                setActiveIndex(s.activeIndex || 0);
                setConfig(s.config || null);
                setTab("downloads");
                if (s.phase === "downloading") {
                    subscribeToProgress(s.tracks || []);
                }
            }
        } catch (_) {}
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Guardar estado de download no sessionStorage (sobrevive a mudanças de aba/reload)
    useEffect(() => {
        if (phase !== "home") {
            sessionStorage.setItem("playlistr_dl_state", JSON.stringify({ phase, tracks, statuses, activeIndex, config }));
        } else {
            sessionStorage.removeItem("playlistr_dl_state");
        }
    }, [phase, tracks, statuses, activeIndex, config]);

    // Verificar se o servidor está acessível
    useEffect(() => {
        const check = () => {
            axios.get("/auth-status", { timeout: 3000 })
                .then(() => setServerOnline(true))
                .catch(() => setServerOnline(false));
        };
        check();
        const id = setInterval(check, 30000);
        return () => clearInterval(id);
    }, [apiBase]);

    const closeSSE = () => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
    };

    const subscribeToProgress = (trackList) => {
        closeSSE();
        const es = new EventSource(`${apiBase}/progress`);
        esRef.current = es;

        es.onmessage = (e) => {
            const event = JSON.parse(e.data);

            if (event.type === "track_start") {
                const id = trackList[event.index]?.id;
                if (id) {
                    setActiveIndex(event.index);
                    setStatuses((prev) => ({ ...prev, [id]: "downloading" }));
                }
            } else if (event.type === "track_done") {
                const id = trackList[event.index]?.id;
                if (id) {
                    setStatuses((prev) => ({ ...prev, [id]: event.status }));
                }
            } else if (event.type === "completed") {
                closeSSE();
                // Guardar no histórico
                const cfg = configRef.current;
                const entry = {
                    id: Date.now(),
                    date: new Date().toISOString(),
                    playlistName: cfg?.url?.split("/playlist/")?.[1]?.split("?")?.[0] ?? "playlist",
                    total: event.total,
                    done: event.done,
                    failed: event.failed ?? 0,
                    skipped: event.skipped ?? 0,
                };
                setDownloadHistory((prev) => {
                    const next = [entry, ...prev].slice(0, 10);
                    localStorage.setItem("playlistr_dl_history", JSON.stringify(next));
                    return next;
                });
                setTimeout(() => {
                    setPhase("completed");
                    toast.success("Download complete", {
                        description: `${event.done} tracks downloaded`,
                    });
                }, 600);
            } else if (event.type === "cancelled") {
                closeSSE();
                toast.error("Download cancelled");
                setPhase("home");
            } else if (event.type === "error") {
                closeSSE();
                toast.error("Download error", { description: event.message });
                setPhase("home");
            }
        };

        es.onerror = () => {
            // SSE fechado pelo servidor após conclusão — ignorar
        };
    };

    const handleStart = async (cfg) => {
        setConfig(cfg);
        setTracks([]);
        setStatuses({});
        setActiveIndex(0);
        setPhase("downloading");

        try {
            const res = await axios.post(`${apiBase}/download`, {
                playlist_url: cfg.url,
                ...(cfg.folder ? { output_dir: cfg.folder } : {}),
                quality: cfg.quality,
            });

            if (res.data.error === "not_authenticated") {
                setPhase("home");
                window.location.href = `${apiBase}/auth`;
                return;
            }
            if (res.data.error) {
                toast.error(res.data.error);
                setPhase("home");
                return;
            }
            const { tracks: apiTracks } = res.data;
            if (!apiTracks?.length) {
                toast.error("Playlist vazia ou URL inválida");
                setPhase("home");
                return;
            }

            setTracks(apiTracks);
            const init = {};
            apiTracks.forEach((t) => (init[t.id] = "queued"));
            setStatuses(init);

            subscribeToProgress(apiTracks);
            setTab("downloads");
        } catch (err) {
            toast.error("Failed to start download", {
                description: err.response?.data?.error ?? err.message,
            });
            setPhase("home");
        }
    };

    const handleCancel = async () => {
        try {
            await axios.post(`${apiBase}/cancel`);
        } catch (_) {}
        closeSSE();
        sessionStorage.removeItem("playlistr_dl_state");
        toast.error("Download cancelled");
        setPhase("home");
    };

    const handleRestart = () => {
        setPhase("home");
        setTracks([]);
        setStatuses({});
        setActiveIndex(0);
        sessionStorage.removeItem("playlistr_dl_state");
        setTab("download");
    };

    const handleOpenFolder = () => {
        axios.post("/open-folder", null, {
            params: config?.folder ? { folder: config.folder } : {},
        }).catch(() => {});
    };

    const handlePlay = (queue, index) => {
        setPlayerQueue([...queue]);
        setPlayerIndex(index);
        setPlayerKey((k) => k + 1);
    };

    const handleAddToQueue = (tracks) => {
        if (!playerQueue) {
            handlePlay(tracks, 0);
            return;
        }
        // Acrescenta à fila sem reiniciar o player (playerKey não muda)
        setPlayerQueue((prev) => [...prev, ...tracks]);
    };

    const handleRetryFailed = () => {
        toast("Retrying failed tracks…", { description: "Searching alternate sources" });
        const failedIds = tracks
            .filter((t) => statuses[t.id] === "failed")
            .map((t) => t.id);
        setTimeout(() => {
            setStatuses((prev) => {
                const next = { ...prev };
                failedIds.forEach((id) => (next[id] = "done"));
                return next;
            });
            toast.success("Retry complete", {
                description: `${failedIds.length} track(s) recovered`,
            });
        }, 1400);
    };

    // Guardar fila no sessionStorage
    useEffect(() => {
        if (playerQueue) {
            sessionStorage.setItem("playlistr_queue", JSON.stringify({ queue: playerQueue, index: playerIndex }));
        } else {
            sessionStorage.removeItem("playlistr_queue");
        }
    }, [playerQueue, playerIndex]);

    // Limpar SSE ao desmontar
    useEffect(() => () => closeSSE(), []);

    const total = tracks.length;
    const completedCount = Object.values(statuses).filter(
        (s) => s === "done" || s === "failed" || s === "skipped"
    ).length;
    const progressPct =
        phase === "completed" ? 100 : total > 0 ? (completedCount / total) * 100 : 0;

    return (
        <div className={`app-bg min-h-screen flex items-start justify-center py-6 md:py-12 px-4 relative${playerQueue ? " pb-24" : ""}`}>
            <Toaster
                position="bottom-right"
                theme="dark"
                toastOptions={{
                    style: {
                        background: "#121212",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                    },
                }}
            />

            <div className="w-full max-w-3xl relative z-10">
                {/* App chrome */}
                <header className="flex items-center justify-between mb-5 px-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[#1DB954] flex items-center justify-center shadow-[0_4px_20px_rgba(29,185,84,0.4)]">
                            <Music4 className="w-5 h-5 text-black" strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="font-display font-bold text-sm leading-tight">
                                Playlistr
                            </p>
                            <p className="text-[10px] text-neutral-500 leading-tight">
                                Spotify · Local · MP3
                            </p>
                        </div>
                    </div>
                    <a
                        href="https://github.com/afrikasa/playlistr"
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs"
                        data-testid="header-github-link"
                    >
                        <Github className="w-4 h-4" />
                        <span className="px-1.5 py-0.5 rounded-md bg-white/8 text-neutral-300 font-mono">v2.3.0</span>
                    </a>
                </header>

                {/* Banner offline */}
                {!serverOnline && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                        <WifiOff className="w-3.5 h-3.5 shrink-0" />
                        <span>Servidor offline — funcionalidades limitadas</span>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 mb-4 bg-white/[0.03] rounded-2xl p-1 border border-white/10">
                    {[
                        { key: "download",  icon: <Download className="w-4 h-4" />,  label: "Download" },
                        { key: "downloads", icon: <History className="w-4 h-4" />,    label: "Downloads", badge: phase !== "home" },
                        { key: "library",   icon: <Library className="w-4 h-4" />,   label: "Biblioteca" },
                        { key: "stats",     icon: <BarChart2 className="w-4 h-4" />, label: "Stats" },
                        { key: "settings",  icon: <Settings className="w-4 h-4" />,  label: "Definições" },
                    ].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                                tab === t.key
                                    ? "bg-white/10 text-white shadow"
                                    : "text-neutral-500 hover:text-neutral-300"
                            }`}
                        >
                            <div className="relative inline-flex">
                                {t.icon}
                                {t.badge && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#1DB954]" />}
                            </div>
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </div>

                {/* Painel principal */}
                <main
                    className="rounded-3xl bg-white/[0.025] backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6 md:p-10"
                    data-testid="app-main-panel"
                >
                    {tab === "download" && <HomeView onStart={handleStart} />}

                    {tab === "downloads" && (
                        <DownloadsView
                            phase={phase}
                            tracks={tracks}
                            statuses={statuses}
                            activeIndex={activeIndex}
                            progressPct={progressPct}
                            config={config}
                            history={downloadHistory}
                            onCancel={handleCancel}
                            onRestart={handleRestart}
                            onOpenFolder={handleOpenFolder}
                            onRetryFailed={handleRetryFailed}
                            onClearHistory={() => {
                                setDownloadHistory([]);
                                localStorage.removeItem("playlistr_dl_history");
                            }}
                        />
                    )}

                    {tab === "library" && (
                        <LibraryView onPlay={handlePlay} onAddToQueue={handleAddToQueue} currentPath={currentPath} />
                    )}

                    {tab === "stats" && <StatsView />}

                    {tab === "settings" && (
                        <SettingsView settings={settings} onUpdate={updateSettings} />
                    )}
                </main>

            </div>

            {/* Player global */}
            {playerQueue && (
                <Player
                    key={playerKey}
                    queue={playerQueue}
                    initialIndex={playerIndex}
                    xfadeSecs={settings.xfadeSecs ?? 3}
                    onClose={() => setPlayerQueue(null)}
                    onTrackChange={setCurrentPath}
                />
            )}
        </div>
    );
}
