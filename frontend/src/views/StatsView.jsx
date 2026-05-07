import { useEffect, useState } from "react";
import { assetUrl } from "../utils/apiBase";
import { BarChart2, Clock, Heart, Mic2, Music2, Play } from "lucide-react";
import axios from "axios";

export function StatsView() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get("/library/stats").then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-[#1DB954] border-t-transparent animate-spin" />
            </div>
        );
    }

    if (!stats || stats.total_tracks === 0) {
        return (
            <div className="text-center py-16 text-neutral-500">
                <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Sem dados ainda.</p>
                <p className="text-xs mt-1 text-neutral-600">Ouve algumas músicas para ver estatísticas.</p>
            </div>
        );
    }

    const totalDur = fmtDuration(stats.total_duration_s);

    return (
        <div className="space-y-6 fade-up">
            <h2 className="text-lg font-bold">Estatísticas</h2>

            {/* Cards principais */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon={<Music2 className="w-5 h-5" />} label="Faixas" value={stats.total_tracks} color="text-[#1DB954]" />
                <StatCard icon={<Mic2 className="w-5 h-5" />} label="Artistas" value={stats.unique_artists} color="text-blue-400" />
                <StatCard icon={<Play className="w-5 h-5 fill-current" />} label="Reproduções" value={stats.total_plays} color="text-purple-400" />
                <StatCard icon={<Clock className="w-5 h-5" />} label="Duração total" value={totalDur} color="text-orange-400" />
                <StatCard icon={<Heart className="w-5 h-5 fill-current" />} label="Favoritas" value={stats.liked_count} color="text-red-400" />
                <StatCard icon={<BarChart2 className="w-5 h-5" />} label="Álbuns" value={stats.unique_albums} color="text-yellow-400" />
            </div>

            {/* Top Faixas */}
            {stats.top_tracks?.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Mais ouvidas</p>
                    <div className="space-y-2">
                        {stats.top_tracks.map((t, i) => (
                            <div key={t.path} className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.02] border border-white/5">
                                <span className="text-sm font-bold text-neutral-600 w-5 text-center">{i + 1}</span>
                                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                                    {t.has_cover
                                        ? <img src={assetUrl(`/cover/${t.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                                        : <div className="w-full h-full flex items-center justify-center"><Music2 className="w-4 h-4 text-neutral-700" /></div>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{t.title}</p>
                                    <p className="text-xs text-neutral-500 truncate">{t.artist}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Play className="w-3 h-3 text-neutral-600 fill-current" />
                                    <span className="text-xs text-neutral-500 font-mono">{t.play_count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Artistas */}
            {stats.top_artists?.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Artistas mais ouvidos</p>
                    <div className="space-y-2">
                        {stats.top_artists.map((a, i) => {
                            const max = stats.top_artists[0].plays;
                            const pct = Math.round((a.plays / max) * 100);
                            return (
                                <div key={a.artist} className="flex items-center gap-3">
                                    <span className="text-xs text-neutral-600 w-4 text-right">{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm truncate">{a.artist}</span>
                                            <span className="text-xs text-neutral-500 font-mono ml-2 flex-shrink-0">{a.plays}×</span>
                                        </div>
                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-[#1DB954] rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ icon, label, value, color }) {
    return (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-2">
            <div className={color}>{icon}</div>
            <p className="text-xl font-bold leading-tight">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
        </div>
    );
}

function fmtDuration(secs) {
    if (!secs) return "0 min";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
}

