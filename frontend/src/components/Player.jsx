import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, GripVertical, Heart, ListMusic, Mic2, Moon, Music2, Pause, PictureInPicture2, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
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

export function Player({ queue, initialIndex, onClose, xfadeSecs = 3, normalizeVolume = false, lastfm = null, onTrackChange }) {
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
    const [mini, setMini] = useState(false);
    const [pip, setPip] = useState(false);
    const pipWinRef = useRef(null);
    const pipElRef = useRef(null);
    const pipGoPrevRef = useRef(null);
    const pipGoNextRef = useRef(null);
    const pipTogglePlayRef = useRef(null);
    const [related, setRelated] = useState(null); // null | []
    const [showRelated, setShowRelated] = useState(false);
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
    const normalizeNodeRef = useRef(null);
    const scrobbledRef = useRef(false); // evitar scrobble duplo por faixa
    const preloadRef = useRef(null); // elemento Audio oculto para pré-carregar a faixa seguinte

    // Normalização de volume (compressor bypass via gain)
    useEffect(() => {
        if (!normalizeNodeRef.current) return;
        normalizeNodeRef.current.ratio.value = normalizeVolume ? 12 : 1;
        normalizeNodeRef.current.threshold.value = normalizeVolume ? -24 : 0;
    }, [normalizeVolume]);

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
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 30;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            treble.connect(analyser);
            analyser.connect(compressor);
            compressor.connect(ctx.destination);
            normalizeNodeRef.current = compressor;

            audioCtxRef.current = ctx;
            analyserRef.current = analyser;
            bassNodeRef.current = bass;
            midNodeRef.current = mid;
            trebleNodeRef.current = treble;
        } catch (_) {}
    }, []);

    const index = order[pos];
    const track = queue[index];

    // Valores derivados do state — declarados aqui (antes de qualquer effect)
    // para evitar TDZ quando usados em dependency arrays de useEffect abaixo.
    const pct = duration ? (currentTime / duration) * 100 : 0;
    const canPrev = pos > 0 || repeat === "all";
    const canNext = pos < order.length - 1 || repeat === "all";

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
        xfadeActive.current = false;
        audio.src = track.blobUrl || assetUrl(`/files/${track.path}`);
        audio.load();
        audio.volume = mutedRef.current ? 0 : volumeRef.current;

        // Retomar AudioContext se suspenso (background → foreground)
        if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
        }

        audio.play().then(() => {
            setIsPlaying(true);
            setupAudioCtx();
        }).catch(() => setIsPlaying(false));
    }, [pos, order, setupAudioCtx]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = muted ? 0 : volume;
    }, [volume, muted]);

    // Pré-carregar a faixa seguinte para eliminar atraso de buffering no Next
    useEffect(() => {
        const nextPos = pos + 1;
        if (nextPos >= order.length) return;
        const nextTrack = queue[order[nextPos]];
        if (!nextTrack) return;
        const url = nextTrack.blobUrl || assetUrl(`/files/${nextTrack.path}`);
        if (!preloadRef.current) preloadRef.current = new Audio();
        preloadRef.current.preload = "auto";
        preloadRef.current.src = url;
    }, [pos, order, queue]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Last.fm: Now Playing ao mudar de faixa
    useEffect(() => {
        scrobbledRef.current = false;
        if (!lastfm || !track?.title) return;
        axios.post("/lastfm/now-playing", {
            api_key: lastfm.apiKey, api_secret: lastfm.apiSecret,
            session_key: lastfm.sessionKey, title: track.title,
            artist: track.artist || "", timestamp: Math.floor(Date.now() / 1000),
        }).catch(() => {});
    }, [track?.path]); // eslint-disable-line react-hooks/exhaustive-deps

    // Músicas relacionadas via Last.fm (se API key disponível)
    useEffect(() => {
        if (!track?.title || !lastfm?.apiKey) { setRelated(null); return; }
        setRelated(null);
        axios.get("/lastfm/similar", { params: { artist: track.artist || "", title: track.title, api_key: lastfm.apiKey } })
            .then((r) => setRelated(r.data.tracks || []))
            .catch(() => setRelated([]));
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

    const openPip = async () => {
        if (!("documentPictureInPicture" in window)) { setMini(true); return; }
        try {
            const pipWin = await window.documentPictureInPicture.requestWindow({
                width: 300, height: 92, disallowReturnToOpener: false,
            });
            // Copiar estilos para o documento PiP
            [...document.styleSheets].forEach((ss) => {
                try {
                    const style = pipWin.document.createElement("style");
                    style.textContent = [...ss.cssRules].map(r => r.cssText).join("");
                    pipWin.document.head.appendChild(style);
                } catch (_) {
                    if (ss.href) {
                        const link = pipWin.document.createElement("link");
                        link.rel = "stylesheet"; link.href = ss.href;
                        pipWin.document.head.appendChild(link);
                    }
                }
            });
            pipWin.document.body.style.cssText = "margin:0;padding:0;background:#111;overflow:hidden;font-family:system-ui,sans-serif";
            const el = pipWin.document.createElement("div");
            el.style.cssText = "display:flex;align-items:center;gap:12px;padding:12px 16px;box-sizing:border-box;height:92px";
            pipWin.document.body.appendChild(el);
            pipElRef.current = el;
            pipWinRef.current = pipWin;
            // Clicks usam refs para evitar closures stale (events não borbulham entre documentos)
            el.addEventListener("click", (e) => {
                const a = e.target.closest("[data-pip]")?.dataset.pip;
                if (a === "prev" && pipGoPrevRef.current) pipGoPrevRef.current();
                else if (a === "play" && pipTogglePlayRef.current) pipTogglePlayRef.current();
                else if (a === "next" && pipGoNextRef.current) pipGoNextRef.current();
            });
            setPip(true);
            pipWin.addEventListener("pagehide", () => {
                pipElRef.current = null;
                pipWinRef.current = null;
                setPip(false);
            });
        } catch (_) { setMini(true); }
    };

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
        // Transição manual — cancelar crossfade para a nova faixa começar imediatamente
        xfadeActive.current = false;
        clearInterval(xfadeIntervalRef.current);
        setPos(p => {
            if (p < order.length - 1) return p + 1;
            if (repeat === "all") return 0;
            return p;
        });
    }, [repeat, order.length]);

    const goPrev = useCallback(() => {
        xfadeActive.current = false;
        clearInterval(xfadeIntervalRef.current);
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

    // Manter refs dos callbacks PiP actualizadas (evita closures stale na janela flutuante)
    useEffect(() => { pipGoPrevRef.current = goPrev; }, [goPrev]);
    useEffect(() => { pipGoNextRef.current = goNext; }, [goNext]);
    useEffect(() => { pipTogglePlayRef.current = togglePlay; }, [togglePlay]);

    // Re-render estrutural do PiP quando a faixa, cor ou capacidade muda
    useEffect(() => {
        const el = pipElRef.current;
        if (!el || !el.isConnected) return;
        const t = track;
        const color = accentColor || "#1DB954";
        const coverSrc = t?.has_cover ? assetUrl(`/cover/${t.path}`) : "";
        const esc = (s) => String(s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        el.innerHTML = `
            <div style="width:44px;height:44px;border-radius:10px;overflow:hidden;flex-shrink:0;background:${color}33;display:flex;align-items:center;justify-content:center">
                ${coverSrc ? `<img src="${coverSrc}" style="width:100%;height:100%;object-fit:cover" />` : '<span style="font-size:18px;color:#555">♪</span>'}
            </div>
            <div style="flex:1;min-width:0">
                <p style="margin:0;font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t?.title)}</p>
                <p style="margin:2px 0 0;font-size:11px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t?.artist)}</p>
                <div style="margin-top:6px;height:2px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
                    <div id="pip-prog" style="height:100%;background:${color};width:${pct}%;transition:width 0.3s linear"></div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
                <button data-pip="prev" style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:${canPrev ? "#ccc" : "#444"};cursor:${canPrev ? "pointer" : "default"};font-size:14px">⏮</button>
                <button id="pip-play" data-pip="play" style="width:36px;height:36px;border-radius:50%;background:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${isPlaying ? "⏸" : "▶"}</button>
                <button data-pip="next" style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:${canNext ? "#ccc" : "#444"};cursor:${canNext ? "pointer" : "default"};font-size:14px">⏭</button>
            </div>
        `;
    }, [pip, track, accentColor, canPrev, canNext]); // eslint-disable-line react-hooks/exhaustive-deps

    // Actualizar progresso e play/pause no PiP (executa frequentemente com o timeupdate)
    useEffect(() => {
        const win = pipWinRef.current;
        if (!win || !pip) return;
        const prog = win.document.getElementById("pip-prog");
        if (prog) prog.style.width = `${pct}%`;
        const playBtn = win.document.getElementById("pip-play");
        if (playBtn) playBtn.textContent = isPlaying ? "⏸" : "▶";
    }, [pct, isPlaying, pip]);

    // Fechar janela PiP ao desmontar o Player
    useEffect(() => {
        return () => {
            if (pipWinRef.current) {
                try { pipWinRef.current.close(); } catch (_) {}
                pipWinRef.current = null;
                pipElRef.current = null;
            }
        };
    }, []);

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

        // Last.fm scrobble: após 30s e > 50% da faixa
        if (lastfm && !scrobbledRef.current && durationRef.current > 0) {
            const pct = t / durationRef.current;
            if (t > 30 && pct > 0.5) {
                scrobbledRef.current = true;
                const tr = track;
                axios.post("/lastfm/scrobble", {
                    api_key: lastfm.apiKey, api_secret: lastfm.apiSecret,
                    session_key: lastfm.sessionKey, title: tr?.title || "",
                    artist: tr?.artist || "", timestamp: Math.floor((Date.now() - t * 1000) / 1000),
                }).catch(() => {});
            }
        }

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

    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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
                    related={related}
                    showRelated={showRelated}
                    onToggleRelated={() => setShowRelated(r => !r)}
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

            {/* Mini-player */}
            {mini && (
                <div
                    className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full backdrop-blur-xl border border-white/15 shadow-2xl cursor-pointer"
                    style={{ backgroundColor: accentColor ? `color-mix(in srgb, ${accentColor} 25%, #111 75%)` : "#1a1a1a" }}
                    onClick={() => setMini(false)}
                >
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                        {track?.has_cover
                            ? <img src={assetUrl(`/cover/${track.path}`)} alt="" className="w-full h-full object-cover" />
                            : <Music2 className="w-4 h-4 text-neutral-500 m-auto mt-1.5" />}
                    </div>
                    <p className="text-xs font-medium max-w-[140px] truncate">{track?.title}</p>
                    <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                        {isPlaying ? <Pause className="w-3 h-3 text-black fill-black" /> : <Play className="w-3 h-3 text-black fill-black ml-0.5" />}
                    </button>
                </div>
            )}

            {/* Barra do player */}
            <div
                className={`fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t border-white/10 px-4 py-2.5 z-50 transition-all duration-300 ${mini ? "translate-y-full pointer-events-none" : ""}`}
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
                        <button
                            onClick={() => "documentPictureInPicture" in window ? openPip() : setMini(true)}
                            title={"documentPictureInPicture" in window ? "Overlay por cima de tudo" : "Mini-player"}
                            className={`transition-colors ${pip ? "text-[#1DB954]" : "text-neutral-400 hover:text-white"}`}
                        >
                            {"documentPictureInPicture" in window
                                ? <PictureInPicture2 className="w-4 h-4" />
                                : <ChevronDown className="w-4 h-4" />}
                        </button>
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

function NowPlaying({ track, accentColor, isPlaying, isLiked, currentTime, duration, pct, shuffle, repeat, canPrev, canNext, volume, muted, crossfade, xfadeSecs, analyserRef, lyrics, currentLyricIdx, showLyrics, onToggleLyrics, related, showRelated, onToggleRelated, onClose, onTogglePlay, onPrev, onNext, onSeek, onToggleShuffle, onCycleRepeat, onToggleLike, onToggleCrossfade, onVolume, onToggleMute, fmt }) {
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

                {/* Músicas relacionadas (Last.fm) */}
                {related !== null && (
                    <button
                        onClick={onToggleRelated}
                        className={`mt-3 w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${showRelated ? "border-white/20 bg-white/8 text-white" : "border-white/10 text-neutral-500 hover:text-white"}`}
                    >
                        <div className="flex items-center gap-2">
                            <Music2 className="w-4 h-4" />
                            <span className="text-sm font-medium">Relacionadas</span>
                        </div>
                        <span className="text-xs">{related.length > 0 ? `${related.length} sugestões` : "nenhuma"}</span>
                    </button>
                )}
                {showRelated && related?.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-52 overflow-y-auto rounded-xl" style={{ scrollbarWidth: "thin" }}>
                        {related.map((r, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                                <div className="w-7 h-7 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0 text-neutral-600">
                                    <Music2 className="w-3 h-3" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{r.title}</p>
                                    <p className="text-[11px] text-neutral-500 truncate">{r.artist}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

