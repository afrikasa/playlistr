import { History, CheckCircle2, XCircle, SkipForward, Trash2 } from "lucide-react";
import { useState } from "react";
import { ProgressView } from "./ProgressView";
import { CompletedView } from "./CompletedView";

export function DownloadsView({ phase, tracks, statuses, activeIndex, progressPct, config, history, onCancel, onRestart, onOpenFolder, onRetryFailed, onClearHistory }) {
    const hasActive = phase !== "home";

    return (
        <div className="space-y-6">
            {/* Download activo */}
            {hasActive && (
                <div>
                    <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-3">Download Activo</h3>

                    {phase === "downloading" && tracks.length === 0 && (
                        <div className="flex items-center justify-center gap-3 py-10">
                            <div className="w-5 h-5 rounded-full border-2 border-[#1DB954] border-t-transparent animate-spin" />
                            <p className="text-sm text-neutral-400">A carregar playlist…</p>
                        </div>
                    )}

                    {phase === "downloading" && tracks.length > 0 && (
                        <ProgressView
                            tracks={tracks}
                            statuses={statuses}
                            activeIndex={activeIndex}
                            progressPct={progressPct}
                            onCancel={onCancel}
                        />
                    )}

                    {phase === "completed" && (
                        <CompletedView
                            tracks={tracks}
                            statuses={statuses}
                            onOpenFolder={onOpenFolder}
                            onRestart={onRestart}
                            onRetryFailed={onRetryFailed}
                        />
                    )}
                </div>
            )}

            {/* Histórico */}
            {history.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5" />
                            Histórico
                        </h3>
                        <button
                            onClick={onClearHistory}
                            className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                            Limpar
                        </button>
                    </div>
                    <div className="space-y-2">
                        {history.map((entry) => (
                            <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-neutral-200 truncate font-mono">{entry.playlistName}</p>
                                    <p className="text-xs text-neutral-500">{new Date(entry.date).toLocaleString("pt-PT")}</p>
                                </div>
                                <div className="flex items-center gap-2.5 text-xs shrink-0">
                                    <span className="flex items-center gap-1 text-[#1DB954]">
                                        <CheckCircle2 className="w-3 h-3" />{entry.done}
                                    </span>
                                    {entry.skipped > 0 && (
                                        <span className="flex items-center gap-1 text-neutral-400">
                                            <SkipForward className="w-3 h-3" />{entry.skipped}
                                        </span>
                                    )}
                                    {entry.failed > 0 && (
                                        <span className="flex items-center gap-1 text-red-400">
                                            <XCircle className="w-3 h-3" />{entry.failed}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Estado vazio */}
            {!hasActive && history.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <History className="w-8 h-8 text-neutral-600" />
                    <p className="text-sm text-neutral-500">Nenhum download ainda</p>
                </div>
            )}
        </div>
    );
}
