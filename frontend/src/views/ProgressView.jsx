import { X, Disc3 } from "lucide-react";
import { TrackRow } from "../components/TrackRow";

export const ProgressView = ({
    tracks,
    statuses,
    activeIndex,
    progressPct,
    onCancel,
}) => {
    const total = tracks.length;
    const doneCount = Object.values(statuses).filter(
        (s) => s === "done" || s === "failed" || s === "skipped"
    ).length;
    const activeTrack = tracks[activeIndex] ?? tracks[0];

    return (
        <div className="space-y-6 fade-up" data-testid="progress-view">
            {/* Top: counts + cancel */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400">
                        Downloading
                    </p>
                    <h2
                        className="font-display text-2xl md:text-3xl font-bold mt-1"
                        data-testid="progress-counts"
                    >
                        <span className="text-[#1DB954] tabular-nums">
                            {doneCount}
                        </span>
                        <span className="text-neutral-500 mx-2">/</span>
                        <span className="tabular-nums">{total}</span>
                        <span className="text-neutral-400 text-base font-medium ml-2">
                            tracks
                        </span>
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    data-testid="cancel-btn"
                    className="px-5 py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all flex items-center gap-2 text-sm font-medium"
                >
                    <X className="w-4 h-4" />
                    Cancel
                </button>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
                <div
                    className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5"
                    data-testid="progress-bar"
                >
                    <div
                        className="relative h-full bg-[#1DB954] rounded-full transition-[width] duration-500 ease-out progress-shimmer overflow-hidden"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-neutral-500">
                    <span>{Math.round(progressPct)}%</span>
                    <span>{total - doneCount} remaining</span>
                </div>
            </div>

            {/* Now Downloading hero card */}
            {activeTrack && (
                <div
                    className="flex items-center gap-5 p-5 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10"
                    data-testid="current-track-card"
                >
                    <div className="relative">
                        <img
                            src={activeTrack.cover}
                            alt={activeTrack.album}
                            className="w-20 h-20 rounded-xl object-cover shadow-lg"
                        />
                        <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-[#1DB954] flex items-center justify-center pulse-glow">
                            <Disc3 className="w-5 h-5 text-black animate-spin" style={{ animationDuration: "2.5s" }} />
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#1DB954] mb-1">
                            Now Downloading
                        </p>
                        <p
                            className="font-display text-xl font-bold truncate"
                            data-testid="current-track-title"
                        >
                            {activeTrack.title}
                        </p>
                        <p className="text-sm text-neutral-400 truncate">
                            {activeTrack.artist}
                            <span className="text-neutral-600 mx-1.5">·</span>
                            {activeTrack.album}
                        </p>
                    </div>
                </div>
            )}

            {/* Track list */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400">
                        Queue
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-neutral-600">
                        {total} items
                    </span>
                </div>
                <div
                    className="thin-scroll overflow-y-auto max-h-[360px] p-2"
                    data-testid="track-list"
                >
                    {tracks.map((t, i) => (
                        <TrackRow
                            key={t.id}
                            track={t}
                            status={statuses[t.id] ?? "queued"}
                            index={i}
                            isActive={i === activeIndex}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
