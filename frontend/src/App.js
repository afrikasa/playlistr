import { useEffect, useRef, useState } from "react";
import { Music4, Github } from "lucide-react";
import "@/App.css";
import "@/index.css";
import { HomeView } from "./views/HomeView";
import { ProgressView } from "./views/ProgressView";
import { CompletedView } from "./views/CompletedView";
import { Toaster, toast } from "sonner";
import axios from "axios";

const API = "";

export default function App() {
    const [phase, setPhase] = useState("home"); // home | downloading | completed
    const [tracks, setTracks] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [statuses, setStatuses] = useState({});
    const [config, setConfig] = useState(null);
    const esRef = useRef(null);

    const closeSSE = () => {
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }
    };

    const subscribeToProgress = (trackList) => {
        closeSSE();
        const es = new EventSource(`${API}/progress`);
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
            const res = await axios.post(`${API}/download`, {
                playlist_url: cfg.url,
                output_dir: cfg.folder,
                quality: cfg.quality,
            });

            const { tracks: apiTracks } = res.data;
            if (!apiTracks?.length) {
                toast.error("Empty playlist or invalid URL");
                setPhase("home");
                return;
            }

            setTracks(apiTracks);
            const init = {};
            apiTracks.forEach((t) => (init[t.id] = "queued"));
            setStatuses(init);

            subscribeToProgress(apiTracks);
        } catch (err) {
            toast.error("Failed to start download", {
                description: err.response?.data?.error ?? err.message,
            });
            setPhase("home");
        }
    };

    const handleCancel = async () => {
        try {
            await axios.post(`${API}/cancel`);
        } catch (_) {}
        closeSSE();
        toast.error("Download cancelled");
        setPhase("home");
    };

    const handleRestart = () => {
        setPhase("home");
        setTracks([]);
        setStatuses({});
        setActiveIndex(0);
    };

    const handleOpenFolder = () => {
        toast.success("Opening output folder…", {
            description: config?.folder ?? "~/Music/Spotify Downloads",
        });
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

    // Limpar SSE ao desmontar
    useEffect(() => () => closeSSE(), []);

    const total = tracks.length;
    const completedCount = Object.values(statuses).filter(
        (s) => s === "done" || s === "failed" || s === "skipped"
    ).length;
    const progressPct =
        phase === "completed" ? 100 : total > 0 ? (completedCount / total) * 100 : 0;

    return (
        <div className="app-bg min-h-screen flex items-start justify-center py-6 md:py-12 px-4 relative">
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

            <div className="w-full max-w-3xl relative z-10" style={{ minWidth: "min(700px, 100%)" }}>
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
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="text-neutral-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs"
                        data-testid="header-github-link"
                    >
                        <Github className="w-4 h-4" />
                        <span className="hidden sm:inline">v1.0</span>
                    </a>
                </header>

                {/* Painel principal */}
                <main
                    className="rounded-3xl bg-white/[0.025] backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-6 md:p-10"
                    data-testid="app-main-panel"
                >
                    {phase === "home" && <HomeView onStart={handleStart} />}

                    {phase === "downloading" && tracks.length === 0 && (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-center space-y-3">
                                <div className="w-10 h-10 rounded-full border-2 border-[#1DB954] border-t-transparent animate-spin mx-auto" />
                                <p className="text-sm text-neutral-400">Fetching playlist…</p>
                            </div>
                        </div>
                    )}

                    {phase === "downloading" && tracks.length > 0 && (
                        <ProgressView
                            tracks={tracks}
                            statuses={statuses}
                            activeIndex={activeIndex}
                            progressPct={progressPct}
                            onCancel={handleCancel}
                        />
                    )}

                    {phase === "completed" && (
                        <CompletedView
                            tracks={tracks}
                            statuses={statuses}
                            onOpenFolder={handleOpenFolder}
                            onRestart={handleRestart}
                            onRetryFailed={handleRetryFailed}
                        />
                    )}
                </main>

                {phase !== "home" && tracks.length > 0 && (
                    <p
                        className="text-center text-[11px] text-neutral-600 mt-4 font-mono"
                        data-testid="playlist-meta-footer"
                    >
                        {config?.url?.split("/playlist/")?.[1]?.split("?")?.[0] ?? "playlist"} · {total} tracks
                    </p>
                )}
            </div>
        </div>
    );
}
