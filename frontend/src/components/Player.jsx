import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, GripVertical, Heart, ListMusic, Mic2, Moon, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
import axios from "axios";
import { extractDominantColor } from "../utils/colorExtract";
import { assetUrl } from "../utils/apiBase";

const SLEEP_OPTIONS = [0, 15, 30, 45, 60];

function parseSyncedLyrics(lrc) {
    if (!lrc) return null;
    const lines = [];
    for (const line of lrc.split("\n")) {
        const m = line.match(/^\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/);
        if (m) {
            const t = parseInt(m[1]) * 60 + parseFloat(m[2]);
            const text = m[3].trim();
            if (text) lines.push({ t, text });
        }
    }
    return lines.length > 0 ? lines : null;
}

const EQ_PRESETS = {
    plano:  [0, 0, 0],
    baixos: [8, 2, -2],
    agudos: [-2, 0, 8],
    vocal:  [-3, 5, 3],
};

function makeShuffled(length, currentIdx) {
    const rest = Array.from({ length }, (_, i) => i).filter(i => i !== currentIdx);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [currentIdx, ...rest];
}

export function Player({ queue, initialIndex, onClose, xfadeSecs = 3, onTrackChange }) {
    const audioRef = useRef(null);
    const [order, setOrder] = useState(() => queue.map((_, i) => i));
    const [pos, setPos] = useState(initialIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [repeat, setRepeat] = useState("none");
    const [showQueue, setShowQueue] = useState(false);
    const [showNowPlaying, setShowNowPlaying] = useState(false);
    const [accentColor, setAccentColor] = useState(null);
    const [isLiked, setIsLiked] = useState(false);
    const [sleepMins, setSleepMins] = useState(0);
    const [crossfade, setCrossfade] = useState(xfadeSecs > 0);
    const [dragOver, setDragOver] = useState(null);
    const [eqGains, setEqGains] = useState([0, 0, 0]); // bass, mid, treble (dB)
    const [showEQ, setShowEQ] = useState(false);
    const [lyrics, setLyrics] = useState(null); // null=loading, {found,lines,plain}
    const [showLyrics, setShowLyrics] = useState(false);
    const [currentLyricIdx, setCurrentLyricIdx] = useState(-1);

    // refs que não causam re-render
    const dragIdxRef = useRef(null);
    const currentRowRef = useRef(null);
    const sleepTimerRef = useRef(null);
    const prevQueueLen = useRef(queue.length);
    const durationRef = useRef(0);
    const volumeRef = useRef(1);
    const mutedRef = useRef(false);
    const xfadeActive = useRef(false);
    const xfadeIntervalRef = useRef(null);
    const xfadeSecsRef = useRef(xfadeSecs);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const bassNodeRef = useRef(null);
    const midNodeRef = useRef(null);
    const trebleNodeRef = useRef(null);
    const orderRef = useRef(order);
    const repeatRef = useRef(repeat);

    // Sincronizar refs com state e props
    useEffect(() => { volumeRef.current = volume; }, [volume]);
    useEffect(() => { mutedRef.current = muted; }, [muted]);
    useEffect(() => { xfadeSecsRef.current = xfadeSecs; }, [xfadeSecs]);
    useEffect(() => { orderRef.current = order; }, [order]);
    useEffect(() => { repeatRef.current = repeat; }, [repeat]);

    // Aplicar ganhos do equalizador
    useEffect(() => {
        if (bassNodeRef.current) bassNodeRef.current.gain.value = eqGains[0];
        if (midNodeRef.current) midNodeRef.current.gain.value = eqGains[1];
        if (trebleNodeRef.current) trebleNodeRef.current.gain.value = eqGains[2];
    }, [eqGains]);

    const setupAudioCtx = useCallback(() => {
        if (audioCtxRef.current || !audioRef.current) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = ctx.createMediaElementSource(audioRef.current);

            const bass = ctx.createBiquadFilter();
            bass.type = "lowshelf";
            bass.frequency.value = 200;

            const mid = ctx.createBiquadFilter();
            mid.type = "peaking";
            mid.frequency.value = 1000;
            mid.Q.value = 1;

            const treble = ctx.createBiquadFilter();
            treble.type = "highshelf";
            treble.frequency.value = 8000;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.8;

            source.connect(bass);
            bass.connect(mid);
            mid.connect(treble);
            treble.connect(analyser);
            analyser.connect(ctx.destination);

            audioCtxRef.current = ctx;
            analyserRef.current = analyser;
            bassNodeRef.current = bass;
            midNodeRef.current = mid;
            trebleNodeRef.current = treble;
        } catch (_) {}
    }, []);

    const index = order[pos];
    const track = queue[index];

    // Carregar e tocar faixa (com suporte a fade-in de crossfade)
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !track) return;

        // Actualizar Media Session ANTES de tocar — evita gap na notificação Android
        if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || "",
                artist: track.artist || "",
                album: track.album || "",
                artwork: track.has_cover ? [{ src: assetUrl(`/cover/${track.path}`), sizes: "512x512", type: "image/jpeg" }] : [],
            });
        }

        clearInterval(xfadeIntervalRef.current);
        audio.src = track.blobUrl || assetUrl(`/files/${track.path}`);
        audio.load();
        const vol = mutedRef.current ? 0 : volumeRef.current;
        const wasFading = xfadeActive.current;
        audio.volume = wasFading ? 0 : vol;
        xfadeActive.current = false;

        // Retomar AudioContext se suspenso (background → foreground)
        if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
        }

        audio.play().then(() => {
            setIsPlaying(true);
            setupAudioCtx();
            if (wasFading && vol > 0) {
                let step = 0;
                const steps = (xfadeSecsRef.current || 3) * 10;
                const iv = setInterval(() => {
                    step++;
                    if (!audio.paused) audio.volume = Math.min(vol, vol * step / steps);
                    if (step >= steps) clearInterval(iv);
                }, 100);
            }
        }).catch(() => setIsPlaying(false));
    }, [pos, order, setupAudioCtx]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Cor de destaque da capa
    useEffect(() => {
        if (!track?.has_cover) { setAccentColor(null); return; }
        extractDominantColor(assetUrl(`/cover/${track.path}`)).then(setAccentColor);
    }, [track?.path]); // eslint-disable-line react-hooks/exhaustive-deps

    // Estado liked da faixa actual
    useEffect(() => {
        setIsLiked(!!track?.liked);
    }, [track?.path]); // eslint-disable-line react-hooks/exhaustive-deps

    // Título do separador
    useEffect(() => {
        if (!track) return;
        document.title = `♪ ${track.artist ? track.artist + " — " : ""}${track.title}`;
    }, [track]);
    useEffect(() => () => { document.title = "Playlistr"; }, []);

    // Sleep timer
    useEffect(() => {
        if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
        if (sleepMins > 0) {
            sleepTimerRef.current = setTimeout(() => { audioRef.current?.pause(); setSleepMins(0); }, sleepMins * 60 * 1000);
        }
        return () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); };
    }, [sleepMins]);

    // Retomar AudioContext ao voltar ao primeiro plano (fix: app "reinicia" após Spotify)
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible' && audioCtxRef.current?.state === 'suspended') {
                audioCtxRef.current.resume().catch(() => {});
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    // Notificar App.js da faixa actual (para highlight na biblioteca)
    useEffect(() => {
        if (track?.path) onTrackChange?.(track.path);
    }, [track?.path]); // eslint-disable-line react-hooks/exhaustive-deps

    // Crescimento da fila (add-to-queue externo)
    useEffect(() => {
        if (queue.length > prevQueueLen.current) {
            const newIdx = Array.from({ length: queue.length - prevQueueLen.current }, (_, i) => prevQueueLen.current + i);
            setOrder(prev => [...prev, ...newIdx]);
        }
        prevQueueLen.current = queue.length;
    }, [queue.length]);

    // Media Session API — handlers e metadados
    useEffect(() => {
        if (!("mediaSession" in navigator) || !track) return;
        // Metadata já definida no efeito de carregamento — redefinir aqui garante consistência
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || "",
            artist: track.artist || "",
            album: track.album || "",
            artwork: track.has_cover ? [{ src: assetUrl(`/cover/${track.path}`), sizes: "512x512", type: "image/jpeg" }] : [],
        });
        const resumeCtx = () => {
            if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
        };
        // Handlers usam refs para evitar closures stale (fix: botões lockscreen precisam de pressão forte)
        navigator.mediaSession.setActionHandler("play", () => {
            resumeCtx();
            audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
        });
        navigator.mediaSession.setActionHandler("pause", () => { audioRef.current?.pause(); });
        navigator.mediaSession.setActionHandler("previoustrack", () => {
            resumeCtx();
            setPos(p => {
                const len = orderRef.current.length;
                if (p > 0) return p - 1;
                if (repeatRef.current === "all") return len - 1;
                return p;
            });
        });
        navigator.mediaSession.setActionHandler("nexttrack", () => {
            resumeCtx();
            setPos(p => {
                const len = orderRef.current.length;
                if (p < len - 1) return p + 1;
                if (repeatRef.current === "all") return 0;
                return p;
            });
        });
        navigator.mediaSession.setActionHandler("seekto", (d) => {
            if (audioRef.current) audioRef.current.currentTime = d.seekTime;
        });
    }, [track]); // order e repeat acedidos via ref — sem re-registar desnecessariamente

    // Registar reprodução (play count + recentes)
    useEffect(() => {
        if (!track?.path) return;
        axios.post("/library/play", { path: track.path }).catch(() => {});
    }, [track?.path]); // eslint-disable-line react-hooks/exhaustive-deps

    // Buscar letras ao mudar de faixa
    useEffect(() => {
        if (!track?.title) { setLyrics(null); setCurrentLyricIdx(-1); return; }
        setLyrics(null);
        setCurrentLyricIdx(-1);
        axios.get("/lyrics", { params: { title: track.title, artist: track.artist || "" } })
            .then((r) => {
                const d = r.data;
                if (!d.found) { setLyrics({ found: false }); return; }
                const lines = parseSyncedLyrics(d.synced);
                setLyrics({ found: true, lines, plain: d.plain });
            })
            .catch(() => setLyrics({ found: false }));
    }, [track?.path]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Retomar AudioContext suspenso antes de tentar reproduzir
        if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            // Se o audio está em estado de erro, recarregar antes de tentar
            if (audio.error) audio.load();
            audio.play().then(() => setIsPlaying(true)).catch(() => {});
        }
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
            else if (e.key === "Escape") { setShowNowPlaying(false); }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [togglePlay, goNext, goPrev]);

    const toggleShuffle = () => {
        setShuffle(s => {
            const next = !s;
            if (next) { setOrder(makeShuffled(queue.length, index)); setPos(0); }
            else { setOrder(queue.map((_, i) => i)); setPos(index); }
            return next;
        });
    };

    const cycleRepeat = () => setRepeat(r => r === "none" ? "all" : r === "all" ? "one" : "none");
    const cycleSleep = () => setSleepMins(prev => SLEEP_OPTIONS[(SLEEP_OPTIONS.indexOf(prev) + 1) % SLEEP_OPTIONS.length]);

    const toggleLike = async () => {
        if (!track) return;
        const next = !isLiked;
        setIsLiked(next);
        try { await axios.patch("/library/like", { path: track.path, liked: next }); } catch (_) {}
    };

    const seek = (e) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        audio.currentTime = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * duration;
    };

    // Crossfade — verificar proximidade do fim
    const handleTimeUpdate = (e) => {
        const t = e.target.currentTime;
        setCurrentTime(t);

        // Sincronizar linha de letras
        const lines = lyrics?.lines;
        if (lines?.length) {
            let idx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].t <= t) idx = i; else break;
            }
            setCurrentLyricIdx(idx);
        }

        // Actualizar posição no Media Session
        if ("mediaSession" in navigator && durationRef.current > 0) {
            try {
                navigator.mediaSession.setPositionState({ duration: durationRef.current, playbackRate: 1, position: t });
            } catch (_) {}
        }

        const xfs = xfadeSecsRef.current;
        if (!crossfade || !xfs || !durationRef.current || xfadeActive.current) return;
        if (t >= durationRef.current - xfs) {
            xfadeActive.current = true;
            const startVol = mutedRef.current ? 0 : volumeRef.current;
            let step = 0;
            const steps = xfs * 10;
            clearInterval(xfadeIntervalRef.current);
            xfadeIntervalRef.current = setInterval(() => {
                step++;
                if (audioRef.current) audioRef.current.volume = startVol * Math.max(0, 1 - step / steps);
                if (step >= steps) clearInterval(xfadeIntervalRef.current);
            }, 100);
        }
    };

    // Drag & drop
    const handleDragStart = (i, e) => { dragIdxRef.current = i; e.dataTransfer.effectAllowed = "move"; };
    const handleDragOver = (i, e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOver(i); };
    const handleDrop = (toPos, e) => {
        e.preventDefault();
        const fromPos = dragIdxRef.current;
        dragIdxRef.current = null; setDragOver(null);
        if (fromPos === null || fromPos === toPos) return;
        setOrder(prev => { const n = [...prev]; const [m] = n.splice(fromPos, 1); n.splice(toPos, 0, m); return n; });
        setPos(p => {
            if (p === fromPos) return toPos;
            if (fromPos < p && p <= toPos) return p - 1;
            if (toPos <= p && p < fromPos) return p + 1;
            return p;
        });
    };
    const handleDragEnd = () => { dragIdxRef.current = null; setDragOver(null); };

    const pct = duration ? (currentTime / duration) * 100 : 0;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const canPrev = pos > 0 || repeat === "all";
    const canNext = pos < order.length - 1 || repeat === "all";

    return (
        <>
            {/* Now Playing — ecrã cheio */}
            {showNowPlaying && (
                <NowPlaying
                    track={track}
                    accentColor={accentColor}
                    isPlaying={isPlaying}
                    isLiked={isLiked}
                    currentTime={currentTime}
                    duration={duration}
                    pct={pct}
                    shuffle={shuffle}
                    repeat={repeat}
                    canPrev={canPrev}
                    canNext={canNext}
                    volume={volume}
                    muted={muted}
                    crossfade={crossfade}
                    xfadeSecs={xfadeSecs}
                    analyserRef={analyserRef}
                    lyrics={lyrics}
                    currentLyricIdx={currentLyricIdx}
                    showLyrics={showLyrics}
                    onToggleLyrics={() => setShowLyrics(l => !l)}
                    onClose={() => setShowNowPlaying(false)}
                    onTogglePlay={togglePlay}
                    onPrev={goPrev}
                    onNext={goNext}
                    onSeek={seek}
                    onToggleShuffle={toggleShuffle}
                    onCycleRepeat={cycleRepeat}
                    onToggleLike={toggleLike}
                    onToggleCrossfade={() => setCrossfade(c => !c)}
                    onVolume={(v) => { setVolume(v); if (v > 0) setMuted(false); }}
                    onToggleMute={() => setMuted(m => !m)}
                    fmt={fmt}
                />
            )}

            {/* Painel EQ */}
            {showEQ && !showNowPlaying && (
                <div className="fixed bottom-[68px] left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
                    <div className="w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-t-xl shadow-2xl p-4 pointer-events-auto">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-semibold text-neutral-300">Equalizador</span>
                            <div className="flex gap-1">
                                {Object.entries(EQ_PRESETS).map(([key, gains]) => {
                                    const active = gains.every((g, i) => g === eqGains[i]);
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setEqGains(gains)}
                                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all border capitalize ${
                                                active
                                                    ? "bg-[#1DB954]/20 text-[#1DB954] border-[#1DB954]/40"
                                                    : "bg-white/5 text-neutral-500 hover:text-white border-white/10"
                                            }`}
                                        >
                                            {key}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex justify-around gap-2">
                            {[["Baixos", 0], ["Médios", 1], ["Agudos", 2]].map(([label, idx]) => (
                                <div key={label} className="flex flex-col items-center gap-2">
                                    <span className="text-[10px] text-neutral-500 font-mono w-8 text-center">
                                        {eqGains[idx] >= 0 ? "+" : ""}{eqGains[idx]}dB
                                    </span>
                                    <div className="flex items-center justify-center" style={{ height: "80px" }}>
                                        <input
                                            type="range" min="-12" max="12" step="1"
                                            value={eqGains[idx]}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value);
                                                setEqGains((prev) => { const n = [...prev]; n[idx] = v; return n; });
                                            }}
                                            className="accent-[#1DB954] cursor-pointer"
                                            style={{ width: "72px", transform: "rotate(-90deg)" }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-neutral-500">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Fila */}
            {showQueue && !showNowPlaying && (
                <div className="fixed bottom-[68px] left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
                    <div className="w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-t-xl shadow-2xl max-h-80 overflow-y-auto pointer-events-auto" style={{ scrollbarWidth: "thin" }}>
                        <div className="sticky top-0 bg-[#1a1a1a] px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs font-semibold text-neutral-300">Fila de reprodução</span>
                            <span className="text-[11px] text-neutral-500">{order.length} faixas</span>
                        </div>
                        {order.map((qIdx, i) => {
                            const t = queue[qIdx];
                            const isCurrent = i === pos;
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
                                        ${dragOver === i ? "border-t border-[#1DB954]" : ""}`}
                                >
                                    <GripVertical className="w-4 h-4 text-neutral-600 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                                    <div className="w-7 h-7 rounded overflow-hidden bg-white/5 flex-shrink-0">
                                        {t?.has_cover
                                            ? <img src={assetUrl(`/cover/${t.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                                            : <div className="w-full h-full flex items-center justify-center"><Music2 className="w-3 h-3 text-neutral-700" /></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs truncate font-medium ${isCurrent ? "text-[#1DB954]" : ""}`}>{t?.title}</p>
                                        <p className="text-[11px] text-neutral-500 truncate">{t?.artist}</p>
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
            <div
                className="fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t border-white/10 px-4 py-2.5 z-50 transition-colors duration-700"
                style={{ backgroundColor: accentColor ? `color-mix(in srgb, ${accentColor} 18%, #111 82%)` : "#111" }}
            >
                <audio
                    ref={audioRef}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={(e) => { const d = e.target.duration; setDuration(d); durationRef.current = d; }}
                    onEnded={handleEnded}
                    onPlay={() => {
                        setIsPlaying(true);
                        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
                    }}
                    onPause={() => {
                        setIsPlaying(false);
                        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
                    }}
                    onError={() => setIsPlaying(false)}
                />

                <div className="max-w-3xl mx-auto flex items-center gap-2 sm:gap-4">
                    {/* Capa + info → abre Now Playing */}
                    <button
                        onClick={() => setShowNowPlaying(true)}
                        className="flex items-center gap-2 sm:gap-3 w-28 sm:w-44 flex-shrink-0 min-w-0 hover:opacity-80 transition-opacity text-left"
                    >
                        <div className="w-9 h-9 rounded-md overflow-hidden bg-white/5 flex-shrink-0">
                            {track?.has_cover
                                ? <img src={assetUrl(`/cover/${track.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                                : <div className="w-full h-full flex items-center justify-center"><Music2 className="w-4 h-4 text-neutral-700" /></div>}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-semibold truncate leading-tight">{track?.title}</p>
                            <p className="text-[11px] text-neutral-500 truncate mt-0.5">{track?.artist}</p>
                        </div>
                    </button>

                    {/* Controlos centrais */}
                    <div className="flex-1 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-3 sm:gap-4">
                            <button onClick={toggleShuffle} className={`transition-colors ${shuffle ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}><Shuffle className="w-4 h-4" /></button>
                            <button onClick={goPrev} disabled={!canPrev} className="text-neutral-400 hover:text-white disabled:opacity-25 transition-colors"><SkipBack className="w-4 h-4" /></button>
                            <button onClick={togglePlay} className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
                                {isPlaying ? <Pause className="w-3.5 h-3.5 text-black fill-black" /> : <Play className="w-3.5 h-3.5 text-black fill-black ml-0.5" />}
                            </button>
                            <button onClick={goNext} disabled={!canNext} className="text-neutral-400 hover:text-white disabled:opacity-25 transition-colors"><SkipForward className="w-4 h-4" /></button>
                            <button onClick={cycleRepeat} className={`transition-colors ${repeat !== "none" ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                                {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="w-full flex items-center gap-2">
                            <span className="text-[10px] text-neutral-600 font-mono w-7 text-right tabular-nums">{fmt(currentTime)}</span>
                            <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group relative" onClick={seek}>
                                <div className="h-full bg-[#1DB954] rounded-full transition-[width] duration-100" style={{ width: `${pct}%` }} />
                                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity -ml-1.5" style={{ left: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-neutral-600 font-mono w-7 tabular-nums">{fmt(duration)}</span>
                        </div>
                    </div>

                    {/* Direita */}
                    <div className="flex items-center gap-1 sm:gap-2 w-auto sm:w-36 flex-shrink-0 justify-end">
                        <button onClick={toggleLike} className={`transition-colors ${isLiked ? "text-red-500" : "text-neutral-500 hover:text-white"}`}>
                            <Heart className={`w-4 h-4 ${isLiked ? "fill-red-500" : ""}`} />
                        </button>
                        <button onClick={() => { setShowQueue(q => !q); setShowEQ(false); }} className={`transition-colors ${showQueue ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                            <ListMusic className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setShowEQ(e => !e); setShowQueue(false); }} title="Equalizador" className={`hidden sm:block transition-colors ${showEQ || eqGains.some(g => g !== 0) ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                            <SlidersHorizontal className="w-4 h-4" />
                        </button>
                        {xfadeSecs > 0 && (
                            <button onClick={() => setCrossfade(c => !c)} title={crossfade ? "Crossfade ligado" : "Crossfade desligado"} className={`hidden sm:block transition-colors ${crossfade ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                                <Activity className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={cycleSleep} title={sleepMins > 0 ? `Sleep: ${sleepMins}m` : "Sleep timer"} className={`relative transition-colors ${sleepMins > 0 ? "text-[#1DB954]" : "text-neutral-500 hover:text-white"}`}>
                            <Moon className="w-4 h-4" />
                            {sleepMins > 0 && <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-[#1DB954] text-black rounded-full px-0.5 min-w-[14px] text-center leading-none">{sleepMins}</span>}
                        </button>
                        <button onClick={() => setMuted(m => !m)} className="text-neutral-400 hover:text-white transition-colors">
                            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume}
                            onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (v > 0) setMuted(false); }}
                            className="hidden sm:block w-16 accent-[#1DB954] cursor-pointer" />
                        {onClose && (
                            <button onClick={onClose} className="ml-1 text-neutral-600 hover:text-neutral-300 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

// ── Visualizador de áudio ─────────────────────────────────────────

function Visualizer({ analyserRef }) {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const W = canvas.width;
        const H = canvas.height;

        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            const analyser = analyserRef.current;
            if (!analyser) { ctx.clearRect(0, 0, W, H); return; }
            const bins = analyser.frequencyBinCount;
            const data = new Uint8Array(bins);
            analyser.getByteFrequencyData(data);

            ctx.clearRect(0, 0, W, H);
            const barCount = Math.min(40, bins);
            const gap = 2;
            const barW = (W - gap * (barCount - 1)) / barCount;
            for (let i = 0; i < barCount; i++) {
                const val = data[i] / 255;
                const h = Math.max(3, val * H);
                const alpha = 0.35 + val * 0.65;
                ctx.fillStyle = `rgba(29,185,84,${alpha})`;
                ctx.fillRect(i * (barW + gap), H - h, barW, h);
            }
        };
        draw();
        return () => cancelAnimationFrame(rafRef.current);
    }, [analyserRef]);

    return <canvas ref={canvasRef} width={320} height={56} className="w-full opacity-80 mt-4" />;
}

// ── Now Playing overlay ───────────────────────────────────────────

function NowPlaying({ track, accentColor, isPlaying, isLiked, currentTime, duration, pct, shuffle, repeat, canPrev, canNext, volume, muted, crossfade, xfadeSecs, analyserRef, lyrics, currentLyricIdx, showLyrics, onToggleLyrics, onClose, onTogglePlay, onPrev, onNext, onSeek, onToggleShuffle, onCycleRepeat, onToggleLike, onToggleCrossfade, onVolume, onToggleMute, fmt }) {
    const lyricRef = useRef(null);
    // Auto-scroll para a linha actual
    useEffect(() => {
        if (lyricRef.current && showLyrics) {
            lyricRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }, [currentLyricIdx, showLyrics]);

    const gradient = accentColor
        ? `linear-gradient(180deg, ${accentColor}cc 0%, #0e0e0e 58%, #080808 100%)`
        : "linear-gradient(180deg, #1e1e1e 0%, #080808 100%)";

    return (
        <div
            className="fixed inset-0 z-[60] flex flex-col items-center justify-between py-8 px-6 overflow-y-auto"
            style={{ background: gradient }}
        >
            {/* Topo */}
            <div className="w-full max-w-sm flex items-center justify-between">
                <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors p-1">
                    <ChevronDown className="w-6 h-6" />
                </button>
                <p className="text-xs font-semibold tracking-widest uppercase text-neutral-400">A reproduzir</p>
                <button
                    onClick={onToggleLyrics}
                    disabled={!lyrics || !lyrics.found}
                    title={lyrics?.found ? (showLyrics ? "Ver capa" : "Ver letras") : "Letras não disponíveis"}
                    className={`p-1 transition-colors ${showLyrics ? "text-[#1DB954]" : lyrics?.found ? "text-neutral-400 hover:text-white" : "text-neutral-700 cursor-default"}`}
                >
                    <Mic2 className="w-5 h-5" />
                </button>
            </div>

            {/* Capa grande ou letras */}
            {!showLyrics ? (
                <div className="w-full max-w-xs aspect-square rounded-2xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.7)] mt-4">
                    {track?.has_cover
                        ? <img src={assetUrl(`/cover/${track.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                        : <div className="w-full h-full bg-white/5 flex items-center justify-center"><Music2 className="w-20 h-20 text-neutral-700" /></div>}
                </div>
            ) : (
                <div className="w-full max-w-sm mt-4 flex-1 overflow-y-auto max-h-72 space-y-3 px-1" style={{ scrollbarWidth: "thin" }}>
                    {lyrics?.lines ? lyrics.lines.map((line, i) => (
                        <p
                            key={i}
                            ref={i === currentLyricIdx ? lyricRef : null}
                            className={`text-center text-base leading-relaxed transition-all duration-300 ${
                                i === currentLyricIdx
                                    ? "text-white font-bold scale-105 origin-center"
                                    : i < currentLyricIdx
                                    ? "text-neutral-600 text-sm"
                                    : "text-neutral-500 text-sm"
                            }`}
                        >
                            {line.text}
                        </p>
                    )) : lyrics?.plain ? (
                        <p className="text-center text-sm text-neutral-400 whitespace-pre-line leading-relaxed">{lyrics.plain}</p>
                    ) : (
                        <p className="text-center text-sm text-neutral-600 py-8">Letras não disponíveis</p>
                    )}
                </div>
            )}

            {/* Info + like */}
            <div className="w-full max-w-sm mt-5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-2xl font-bold truncate leading-tight">{track?.title}</p>
                        <p className="text-neutral-400 text-sm mt-1 truncate">{track?.artist}</p>
                    </div>
                    <button onClick={onToggleLike} className={`mt-1 flex-shrink-0 transition-colors ${isLiked ? "text-red-500" : "text-neutral-500 hover:text-white"}`}>
                        <Heart className={`w-6 h-6 ${isLiked ? "fill-red-500" : ""}`} />
                    </button>
                </div>

                {/* Visualizador */}
                <Visualizer analyserRef={analyserRef} />

                {/* Scrubber */}
                <div className="mt-4">
                    <div className="h-1.5 bg-white/10 rounded-full cursor-pointer group relative" onClick={onSeek}>
                        <div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />
                        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity -ml-2" style={{ left: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                        <span className="text-[11px] text-neutral-500 font-mono tabular-nums">{fmt(currentTime)}</span>
                        <span className="text-[11px] text-neutral-500 font-mono tabular-nums">{fmt(duration)}</span>
                    </div>
                </div>

                {/* Controlos */}
                <div className="flex items-center justify-between mt-4">
                    <button onClick={onToggleShuffle} className={`transition-colors ${shuffle ? "text-white" : "text-neutral-600 hover:text-white"}`}><Shuffle className="w-5 h-5" /></button>
                    <button onClick={onPrev} disabled={!canPrev} className="text-white disabled:opacity-25 transition-colors"><SkipBack className="w-7 h-7" /></button>
                    <button onClick={onTogglePlay} className="w-16 h-16 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl">
                        {isPlaying ? <Pause className="w-7 h-7 text-black fill-black" /> : <Play className="w-7 h-7 text-black fill-black ml-1" />}
                    </button>
                    <button onClick={onNext} disabled={!canNext} className="text-white disabled:opacity-25 transition-colors"><SkipForward className="w-7 h-7" /></button>
                    <button onClick={onCycleRepeat} className={`transition-colors ${repeat !== "none" ? "text-white" : "text-neutral-600 hover:text-white"}`}>
                        {repeat === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                    </button>
                </div>

                {/* Volume + Crossfade */}
                <div className="flex items-center gap-3 mt-5">
                    <button onClick={onToggleMute} className="text-neutral-400 hover:text-white transition-colors">
                        {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : volume}
                        onChange={(e) => onVolume(parseFloat(e.target.value))}
                        className="flex-1 accent-white cursor-pointer" />
                    <Volume2 className="w-4 h-4 text-neutral-400" />
                </div>

                {/* Crossfade toggle */}
                {xfadeSecs > 0 && (
                <button
                    onClick={onToggleCrossfade}
                    className={`mt-4 w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${crossfade ? "border-[#1DB954]/40 bg-[#1DB954]/10 text-[#1DB954]" : "border-white/10 text-neutral-500 hover:text-white"}`}
                >
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        <span className="text-sm font-medium">Crossfade</span>
                    </div>
                    <span className="text-xs">{crossfade ? `${xfadeSecs}s · ligado` : "desligado"}</span>
                </button>
                )}
            </div>
        </div>
    );
}

