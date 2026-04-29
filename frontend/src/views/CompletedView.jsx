import { CheckCircle2, FolderOpen, RotateCcw, RefreshCw, XCircle, MinusCircle } from "lucide-react";

const StatBlock = ({ label, value, color, testId }) => (
    <div
        className="flex-1 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 p-5"
        data-testid={testId}
    >
        <p className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400">
            {label}
        </p>
        <p
            className="font-display text-4xl font-extrabold mt-2 tabular-nums"
            style={{ color }}
        >
            {value}
        </p>
    </div>
);

export const CompletedView = ({
    tracks,
    statuses,
    onOpenFolder,
    onRestart,
    onRetryFailed,
}) => {
    const downloaded = tracks.filter((t) => statuses[t.id] === "done").length;
    const failed = tracks.filter((t) => statuses[t.id] === "failed");
    const skipped = tracks.filter((t) => statuses[t.id] === "skipped").length;

    return (
        <div className="space-y-7 fade-up" data-testid="completed-view">
            {/* Header */}
            <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-7 h-7 text-[#1DB954]" />
                </div>
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#1DB954]">
                        Completed
                    </p>
                    <h2 className="font-display text-3xl md:text-4xl font-extrabold mt-1 leading-tight">
                        All done.
                    </h2>
                    <p className="text-sm text-neutral-400 mt-1">
                        Files saved and tagged. Album art embedded.
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="flex flex-col sm:flex-row gap-3">
                <StatBlock
                    label="Downloaded"
                    value={downloaded}
                    color="#1DB954"
                    testId="stat-downloaded"
                />
                <StatBlock
                    label="Skipped"
                    value={skipped}
                    color="#eab308"
                    testId="stat-skipped"
                />
                <StatBlock
                    label="Failed"
                    value={failed.length}
                    color={failed.length > 0 ? "#ef4444" : "#525252"}
                    testId="stat-failed"
                />
            </div>

            {/* Failed tracks */}
            {failed.length > 0 && (
                <div className="rounded-2xl bg-red-500/[0.04] border border-red-500/20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-red-500/10 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-400" />
                            <span className="text-xs uppercase tracking-[0.2em] font-bold text-red-300">
                                Failed Tracks
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onRetryFailed}
                            data-testid="retry-failed-btn"
                            className="px-3 py-1.5 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
                        >
                            <RefreshCw className="w-3 h-3" />
                            Retry all
                        </button>
                    </div>
                    <div className="p-2 space-y-1">
                        {failed.map((t) => (
                            <div
                                key={t.id}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03]"
                                data-testid={`failed-row-${t.id}`}
                            >
                                <img
                                    src={t.cover}
                                    alt={t.album}
                                    className="w-10 h-10 rounded-md object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold truncate">
                                        {t.title}
                                    </p>
                                    <p className="text-xs text-neutral-500 truncate">
                                        {t.artist}
                                    </p>
                                </div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 px-2 py-1 rounded-full bg-red-500/10">
                                    Audio not found
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {skipped > 0 && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <MinusCircle className="w-3.5 h-3.5 text-yellow-500" />
                    <span>{skipped} track(s) already existed locally and were skipped.</span>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                    type="button"
                    onClick={onOpenFolder}
                    data-testid="open-folder-btn"
                    className="flex-1 bg-[#1DB954] text-black font-bold rounded-full px-6 py-3.5 flex items-center justify-center gap-2 hover:bg-[#1ed760] hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_8px_30px_rgba(29,185,84,0.25)]"
                >
                    <FolderOpen className="w-5 h-5" />
                    Open Folder
                </button>
                <button
                    type="button"
                    onClick={onRestart}
                    data-testid="restart-btn"
                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full px-6 py-3.5 flex items-center justify-center gap-2 transition-all font-semibold"
                >
                    <RotateCcw className="w-5 h-5" />
                    Download Another Playlist
                </button>
            </div>
        </div>
    );
};
