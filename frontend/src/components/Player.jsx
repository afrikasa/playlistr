import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";

export function Player({ queue, initialIndex, onClose }) {
    const audioRef = useRef(null);
    const [index, setIndex] = useState(initialIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);

    const track = queue[index];

    // Trocar de faixa → carregar e reproduzir automaticamente
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !track) return;
        audio.src = `/files/${track.path}`;
        audio.load();
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sincronizar volume/mute com o elemento de áudio
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = muted ? 0 : volume;
    }, [volume, muted]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play().then(() => setIsPlaying(true)).catch(() => {});
        }
    };

    const prev = () => setIndex((i) => Math.max(0, i - 1));
    const next = () => setIndex((i) => Math.min(queue.length - 1, i + 1));

    const seek = (e) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * duration;
    };

    const pct = duration ? (currentTime / duration) * 100 : 0;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-[#111]/95 backdrop-blur-xl border-t border-white/10 px-4 py-2.5 z-50">
            <audio
                ref={audioRef}
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.target.duration)}
                onEnded={next}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />

            <div className="max-w-3xl mx-auto flex items-center gap-4">
                {/* Capa + informação */}
                <div className="flex items-center gap-3 w-44 flex-shrink-0 min-w-0">
                    <div className="w-9 h-9 rounded-md overflow-hidden bg-white/5 flex-shrink-0">
                        {track?.has_cover ? (
                            <img
                                src={`/cover/${track.path}`}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.style.display = "none"; }}
                            />
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
                    <div className="flex items-center gap-5">
                        <button
                            onClick={prev}
                            disabled={index === 0}
                            className="text-neutral-400 hover:text-white disabled:opacity-25 transition-colors"
                        >
                            <SkipBack className="w-4 h-4" />
                        </button>

                        <button
                            onClick={togglePlay}
                            className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                        >
                            {isPlaying
                                ? <Pause className="w-3.5 h-3.5 text-black fill-black" />
                                : <Play className="w-3.5 h-3.5 text-black fill-black ml-0.5" />}
                        </button>

                        <button
                            onClick={next}
                            disabled={index === queue.length - 1}
                            className="text-neutral-400 hover:text-white disabled:opacity-25 transition-colors"
                        >
                            <SkipForward className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Scrubber */}
                    <div className="w-full flex items-center gap-2">
                        <span className="text-[10px] text-neutral-600 font-mono w-7 text-right tabular-nums">
                            {fmt(currentTime)}
                        </span>
                        <div
                            className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group relative"
                            onClick={seek}
                        >
                            <div
                                className="h-full bg-[#1DB954] rounded-full transition-[width] duration-100"
                                style={{ width: `${pct}%` }}
                            />
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity -ml-1.5"
                                style={{ left: `${pct}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-neutral-600 font-mono w-7 tabular-nums">
                            {fmt(duration)}
                        </span>
                    </div>
                </div>

                {/* Volume + fechar */}
                <div className="flex items-center gap-2 w-28 flex-shrink-0 justify-end">
                    <button
                        onClick={() => setMuted((m) => !m)}
                        className="text-neutral-400 hover:text-white transition-colors"
                    >
                        {muted || volume === 0
                            ? <VolumeX className="w-4 h-4" />
                            : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        value={muted ? 0 : volume}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setVolume(v);
                            if (v > 0) setMuted(false);
                        }}
                        className="w-16 accent-[#1DB954] cursor-pointer"
                    />
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="ml-1 text-neutral-600 hover:text-neutral-300 transition-colors"
                            title="Fechar player"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
