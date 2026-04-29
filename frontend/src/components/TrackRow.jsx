import { StatusIcon } from "./StatusIcon";

export const TrackRow = ({ track, status, index, isActive }) => {
    const baseClasses =
        "grid grid-cols-[28px_44px_1fr_auto_28px] items-center gap-4 px-3 py-2.5 rounded-xl border border-transparent transition-colors";
    const activeClasses = isActive
        ? "bg-[#1DB954]/10 border-[#1DB954]/25"
        : "hover:bg-white/[0.04] hover:border-white/5";

    return (
        <div
            className={`${baseClasses} ${activeClasses} fade-up`}
            style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
            data-testid={`track-row-${track.id}`}
        >
            <span
                className={`text-xs font-mono tabular-nums ${
                    isActive ? "text-[#1DB954]" : "text-neutral-500"
                }`}
            >
                {String(index + 1).padStart(2, "0")}
            </span>

            <div className="relative w-11 h-11 rounded-md overflow-hidden bg-neutral-900 shrink-0">
                <img
                    src={track.cover}
                    alt={track.album}
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                {isActive && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-[2px]">
                        <span
                            className="w-[2px] h-3 bg-[#1DB954] wave-bar"
                            style={{ animationDelay: "0ms" }}
                        />
                        <span
                            className="w-[2px] h-3 bg-[#1DB954] wave-bar"
                            style={{ animationDelay: "150ms" }}
                        />
                        <span
                            className="w-[2px] h-3 bg-[#1DB954] wave-bar"
                            style={{ animationDelay: "300ms" }}
                        />
                    </div>
                )}
            </div>

            <div className="min-w-0">
                <p
                    className={`text-sm font-semibold truncate ${
                        isActive ? "text-[#1DB954]" : "text-white"
                    }`}
                    data-testid={`track-title-${track.id}`}
                >
                    {track.title}
                </p>
                <p className="text-xs text-neutral-400 truncate">
                    {track.artist} · {track.album}
                </p>
            </div>

            <span className="text-xs text-neutral-500 font-mono tabular-nums hidden sm:inline">
                {track.duration}
            </span>

            <StatusIcon status={status} />
        </div>
    );
};
