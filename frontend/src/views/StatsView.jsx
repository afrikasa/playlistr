import { useEffect, useState } from "react";
import { assetUrl } from "../utils/apiBase";
import { BarChart2, Calendar, Clock, Heart, Mic2, Music2, Play, ChevronLeft, ChevronRight } from "lucide-react";
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

            <WrappedSection />
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

// ── Wrapped / Year in Review ──────────────────────────────────────

function WrappedSection() {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = (y) => {
        setLoading(true);
        setData(null);
        axios.get("/library/wrapped", { params: { year: y } })
            .then((r) => { setData(r.data); setLoaded(true); })
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    };

    const changeYear = (delta) => {
        const next = year + delta;
        setYear(next);
        setLoaded(false);
        setData(null);
    };

    return (
        <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Year in Review
            </p>

            {/* Selector de ano */}
            <div className="flex items-center justify-between mb-3 px-1">
                <button onClick={() => changeYear(-1)} className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-lg font-bold">{year}</span>
                <button onClick={() => changeYear(1)} disabled={year >= currentYear} className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white disabled:opacity-25 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {!loaded && (
                <button
                    onClick={() => load(year)}
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-neutral-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
                >
                    {loading ? "A carregar…" : `Ver resumo de ${year}`}
                </button>
            )}

            {loaded && !data && (
                <p className="text-center text-sm text-neutral-500 py-4">Sem dados para {year}.</p>
            )}

            {data && data.total_plays > 0 && (
                <div className="space-y-4">
                    {/* Resumo */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gradient-to-br from-[#1DB954]/20 to-transparent border border-[#1DB954]/20 rounded-2xl p-4">
                            <p className="text-3xl font-bold text-[#1DB954]">{data.total_plays}</p>
                            <p className="text-xs text-neutral-400 mt-1">reproduções em {year}</p>
                        </div>
                        {data.best_month && (
                            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
                                <p className="text-xl font-bold">{data.best_month}</p>
                                <p className="text-xs text-neutral-400 mt-1">mês mais activo</p>
                            </div>
                        )}
                    </div>

                    {/* Primeira e última */}
                    {(data.first_track || data.last_track) && (
                        <div className="grid grid-cols-2 gap-3">
                            {data.first_track && (
                                <div className="bg-white/[0.02] border border-white/8 rounded-xl p-3">
                                    <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">Primeira de {year}</p>
                                    <p className="text-xs font-medium truncate">{data.first_track.title}</p>
                                    <p className="text-[11px] text-neutral-500 truncate">{data.first_track.artist}</p>
                                </div>
                            )}
                            {data.last_track && (
                                <div className="bg-white/[0.02] border border-white/8 rounded-xl p-3">
                                    <p className="text-[10px] text-neutral-500 uppercase tracking-wide mb-1">Última de {year}</p>
                                    <p className="text-xs font-medium truncate">{data.last_track.title}</p>
                                    <p className="text-[11px] text-neutral-500 truncate">{data.last_track.artist}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Top faixas */}
                    {data.top_tracks?.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Top faixas {year}</p>
                            <div className="space-y-1.5">
                                {data.top_tracks.slice(0, 5).map((t, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.02] border border-white/5">
                                        <span className="text-xs font-bold text-neutral-600 w-4 text-center">{i + 1}</span>
                                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                                            {t.has_cover
                                                ? <img src={assetUrl(`/cover/${t.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                                                : <div className="w-full h-full flex items-center justify-center"><Music2 className="w-3.5 h-3.5 text-neutral-700" /></div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{t.title}</p>
                                            <p className="text-[11px] text-neutral-500 truncate">{t.artist}</p>
                                        </div>
                                        <span className="text-xs text-neutral-500 font-mono flex-shrink-0">{t.plays}×</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top artistas */}
                    {data.top_artists?.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Top artistas {year}</p>
                            <div className="space-y-1.5">
                                {data.top_artists.map((a, i) => {
                                    const max = data.top_artists[0].plays;
                                    const pct = Math.round((a.plays / max) * 100);
                                    return (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="text-[11px] text-neutral-600 w-4 text-right">{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <span className="text-xs truncate">{a.artist}</span>
                                                    <span className="text-[11px] text-neutral-500 font-mono ml-2 flex-shrink-0">{a.plays}×</span>
                                                </div>
                                                <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-[#1DB954]/60 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {data && data.total_plays === 0 && (
                <p className="text-center text-sm text-neutral-500 py-4">Sem reproduções registadas em {year}.</p>
            )}
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

