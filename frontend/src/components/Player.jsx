import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, ListMusic, Moon, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";

const SLEEP_OPTIONS = [0, 15, 30, 45, 60];

function makeShuffled(length, currentIdx) {
    const rest = Array.from({ length }, (_, i) => i).filter(i => i !== currentIdx);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [currentIdx, ...rest];
}

export function Player({ queue, initialIndex, onClose }) {
    const audioRef = useRef(null);
    const [order, setOrder] = useState(() => queue.map((_, i) => i));
    const [pos, setPos] = useState(initialIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [repeat, setRepeat] = useState("none"); // 'none' | 'all' | 'one'
    const [showQueue, setShowQueue] = useState(false);
    const [dragOver, setDragOver] = useState(null);
    const [sleepMins, setSleepMins] = useState(0);
    const dragIdxRef = useRef(null);
    const currentRowRef = useRef(null);
    const sleepTimerRef = useRef(null);

    const index = order[pos];
    const track = queue[index];

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !track) return;
        audio.src = `/files/${track.path}`;
        audio.load();
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }, [pos, order]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = muted ? 0 : volume;
    }, [volume, muted]);

    // Rolar faixa actual para o centro quando a fila abre
    useEffect(() => {
        if (showQueue && currentRowRef.current) {
            currentRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }, [showQueue]);

    // Título do separador
    useEffect(() => {
        if (!track) return;
        const prefix = track.artist ? `${track.artist} — ` : "";
        document.title = `♪ ${prefix}${track.title}`;
    }, [track]);

    useEffect(() => {
        return () => { document.title = "Playlistr"; };
    }, []);

    // Sleep timer
    useEffect(() => {
        if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
        if (sleepMins > 0) {
            sleepTimerRef.current = setTimeout(() => {
                audioRef.current?.pause();
                setSleepMins(0);
            }, sleepMins * 60 * 1000);
        }
        return () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); };
    }, [sleepMins]);

    const handleEnded = useCallback(() => {
        if (repeat === "one") {
            const audio = audioRef.current;
            if (audio) { audio.currentTime = 0; audio.play(); }
            return;
        }
        setPos(p => {
            if (p < order.length - 1) return p + 1;
            if (repeat === "all") return 0;
            return p;
        });
    }, [repeat, order.length]);

    const goNext = useCallback(() => {
        setPos(p => {
            if (p < order.length - 1) return p + 1;
            if (repeat === "all") return 0;
            return p;
        });
    }, [repeat, order.length]);

    const goPrev = useCallback(() => {
        setPos(p => {
            if (p > 0) return p - 1;
            if (repeat === "all") return order.length - 1;
            return 0;
        });
    }, [repeat, order.length]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) { audio.pause(); setIsPlaying(false); }
        else audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }, [isPlaying]);

    // Atalhos de teclado
    useEffect(() => {
        const onKey = (e) => {
            const tag = e.target.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
            if (e.key === " ") { e.preventDefault(); togglePlay(); }
            else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
            else if (e.key === "m" || e.key === "M") { setMuted(m => !m); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [togglePlay, goNext, goPrev]);

    const toggleShuffle = () => {
        setShuffle(s => {
            const next = !s;
            if (next) {
                const newOrder = makeShuffled(queue.length, index);
                setOrder(newOrder);
                setPos(0);
            } else {
                setOrder(queue.map((_, i) => i));
                setPos(index);
            }
            return next;
        });
    };

    const cycleRepeat = () => {
        setRepeat(r => r === "none" ? "all" : r === "all" ? "one" : "none");
    };

    const cycleSleep = () => {
        setSleepMins(prev => {
            const idx = SLEEP_OPTIONS.indexOf(prev);
            return SLEEP_OPTIONS[(idx + 1) % SLEEP_OPTIONS.length];
        });
    };

    const seek = (e) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * duration;
    };

    // Drag & drop na fila
    const handleDragStart = (i, e) => {
        dragIdxRef.current = i;
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (i, e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(i);
    };

    const handleDrop = (toPos, e) => {
        e.preventDefault();
        const fromPos = dragIdxRef.current;
        dragIdxRef.current = null;
        setDragOver(null);
        if (fromPos === null || fromPos === toPos) return;

        setOrder(prev => {
            const next = [...prev];
            const [moved] = next.splice(fromPos, 1);
            next.splice(toPos, 0, moved);
            return next;
        });

        setPos(p => {
            if (p === fromPos) return toPos;
            if (fromPos < p && p <= toPos) return p - 1;
            if (toPos <= p && p < fromPos) return p + 1;
            return p;
        });
    };

    const handleDragEnd = () => {
        dragIdxRef.current = null;
        setDragOver(null);
    };

    const pct = duration ? (currentTime / duration) * 100 : 0;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const canPrev = pos > 0 || repeat === "all";
    const canNext = pos < order.length - 1 || repeat === "all";

    return (
        <>
            {/* Painel da fila */}
            {showQueue && (
                <div className="fixed bottom-[68px] left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
                    <div
                        className="w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-t-xl shadow-2xl max-h-80 overflow-y-auto pointer-events-auto"
                        style={{ scrollbarWidth: "thin" }}
                    >
                        <div className="sticky top-0 bg-[#1a1a1a] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs font-semibold text-neutral-300">Fila de reprodução</span>
                            <span className="text-[11px] text-neutral-500">{order.length} faixas</span>
                        </div>
                        {order.map((qIdx, i) => {
                            const t = queue[qIdx];
                            const isCurrent = i === pos;
                            const isDragTarget = dragOver === i;
                            return (
                                <div
                                    key={`${qIdx}-${i}`}
                                    ref={isCurrent ? currentRowRef : null}
                                    draggable
                                    onDragStart={(e) => handleDragStart(i, e)}
                                    onDragOver={(e) => handleDragOver(i, e)}
                                    onDrop={(e) => handleDrop(i, e)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => setPos(i)}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer select-none transition-colors
                                        ${isCurrent ? "bg-white/5" : "hover:bg-white/[0.03]"}
                                        ${isDragTarget ? "border-t border-[#1DB954]" : ""}`}
                                >
                                    <GripVertical className="w-4 h-4 text-neutral-600 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                                    <div className="w-7 h-7 rounded overflow-hidden bg-white/5 flex-shrink-0">
                                        {t?.has_cover ? (
                                            <img src={`/cover/${t.path}`} alt="" className="w-full h-full object-cover"
                                                onError={(e) => { e.target.style.display = "none"; }} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Music2 className="w-3 h-3 text-neutral-700" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs truncate leading-tight font-medium ${isCurrent ? "text-[#1DB954]" : ""}`}>
                                            {t?.title}
                                        </p>
                                        <p className="text-[11px] text-neutral-500 truncate mt-0.5">{t?.artist}</p>
                                    </div>
                                    {isCurrent && (
                                        <div className="flex gap-0.5 items-end h-3 flex-shrink-0">
                                            {[0, 1, 2].map(b => (
                                                <div key={b} className="w-0.5 bg-[#1DB954] rounded-full animate-bounce"
                                                    style={{ height: `${[8, 12, 6][b]}px`, animationDelay: `${b * 0.15}s` }} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Barra do player */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#111]/95 backdrop-blur-xl border-t border-white/10 px-4 py-2.5 z-50">
                <audio
                    ref={audioRef}
                    onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                    onLoadedMetadata={(e) => setDuration(e.target.duration)}
                    onEnded={handleEnded}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                />

                <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-4">
                    {/* Capa + informação */}
                    <div className="flex items-center gap-2 sm:gap-3 w-28 sm:w-44 flex-shrink-0 min-w-0">
                        <div className="w-9 h-9 rounded-md overflow-hidden bg-white/5 flex-shrink-0">
                            {track?.has_cover ? (
                                <img src={`/cover/${track.path}`} alt="" className="w-full h-full object-cover"
                                    onError={(e) => { e.target.style.display = "none"; }} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Music2 className="w-4 h-4 text-neutral-700" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold truncate leading-tight">{track?.title}</p>
                            <p className="text-[11px] text-neutral-500 truncate mt-0.5">{track?.artist}</p>
                        </div>
                    </div>

                    {/* Controlos centrais */}
                    <div className="flex-1 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <button onClick={toggleShuffle} title="Shuffle"
                                className={`transition-colors ${shuffle ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                                <Shuffle className="w-4 h-4" />
                            </button>
                            <button onClick={goPrev} disabled={!canPrev}
                                className="text-neutral-400 hover:text-white disabled:opacity-25 transition-colors">
                                <SkipBack className="w-4 h-4" />
                            </button>
                            <button onClick={togglePlay}
                                className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
                                {isPlaying
                                    ? <Pause className="w-3.5 h-3.5 text-black fill-black" />
                                    : <Play className="w-3.5 h-3.5 text-black fill-black ml-0.5" />}
                            </button>
                            <button onClick={goNext} disabled={!canNext}
                                className="text-neutral-400 hover:text-white disabled:opacity-25 transition-colors">
                                <SkipForward className="w-4 h-4" />
                            </button>
                            <button onClick={cycleRepeat}
                                title={repeat === "none" ? "Repetir desligado" : repeat === "all" ? "Repetir tudo" : "Repetir uma faixa"}
                                className={`transition-colors ${repeat !== "none" ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                                {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                            </button>
                        </div>

                        {/* Scrubber */}
                        <div className="w-full flex items-center gap-2">
                            <span className="text-[10px] text-neutral-600 font-mono w-7 text-right tabular-nums">{fmt(currentTime)}</span>
                            <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group relative" onClick={seek}>
                                <div className="h-full bg-[#1DB954] rounded-full transition-[width] duration-100" style={{ width: `${pct}%` }} />
                                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity -ml-1.5"
                                    style={{ left: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-neutral-600 font-mono w-7 tabular-nums">{fmt(duration)}</span>
                        </div>
                    </div>

                    {/* Fila + Sleep + Volume + fechar */}
                    <div className="flex items-center gap-1 sm:gap-2 w-auto sm:w-36 flex-shrink-0 justify-end">
                        <button onClick={() => setShowQueue(q => !q)} title="Fila de reprodução"
                            className={`transition-colors ${showQueue ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                            <ListMusic className="w-4 h-4" />
                        </button>
                        <button
                            onClick={cycleSleep}
                            title={sleepMins > 0 ? `Sleep timer: ${sleepMins} min` : "Sleep timer desligado"}
                            className={`relative transition-colors ${sleepMins > 0 ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}
                        >
                            <Moon className="w-4 h-4" />
                            {sleepMins > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold leading-none bg-[#1DB954] text-black rounded-full px-0.5 min-w-[14px] text-center">
                                    {sleepMins}
                                </span>
                            )}
                        </button>
                        <button onClick={() => setMuted(m => !m)} className="text-neutral-400 hover:text-white transition-colors">
                            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume}
                            onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (v > 0) setMuted(false); }}
                            className="hidden sm:block w-16 accent-[#1DB954] cursor-pointer" />
                        {onClose && (
                            <button onClick={onClose} title="Fechar player"
                                className="ml-1 text-neutral-600 hover:text-neutral-300 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
