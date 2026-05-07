import { useEffect, useRef, useState } from "react";
import { Download, Heart, ListEnd, ListMusic, Mic2, MoreHorizontal, Music2, Play, RefreshCw, Disc3, ChevronDown, ChevronRight, Smartphone, WifiOff } from "lucide-react";
import axios from "axios";
import { assetUrl } from "../utils/apiBase";
import { PlaylistsView } from "./PlaylistsView";
import { LocalView } from "./LocalView";

const LIB_CACHE_KEY = "playlistr_lib_cache";

function saveLibCache(tracks, recent, top) {
    try { localStorage.setItem(LIB_CACHE_KEY, JSON.stringify({ tracks, recent, top })); } catch (_) {}
}
function loadLibCache() {
    try { return JSON.parse(localStorage.getItem(LIB_CACHE_KEY) || "null"); } catch { return null; }
}

export function LibraryView({ onPlay, onAddToQueue, currentPath }) {
    const [mode, setMode] = useState("all");
    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [offline, setOffline] = useState(false);
    const [search, setSearch] = useState("");
    const [openGroup, setOpenGroup] = useState(null);
    const [artistImages, setArtistImages] = useState({});
    const [likedSet, setLikedSet] = useState(new Set());
    const [likedOnly, setLikedOnly] = useState(false);
    const [recentTracks, setRecentTracks] = useState([]);
    const [mostPlayed, setMostPlayed] = useState([]);
    const [sortBy, setSortBy] = useState("artist");
    const fetchedArtists = useRef(new Set());

    const load = async () => {
        setLoading(true);
        try {
            const [libRes, recRes, topRes] = await Promise.all([
                axios.get("/library"),
                axios.get("/library/recently-played"),
                axios.get("/library/most-played"),
            ]);
            const t = libRes.data.tracks || [];
            setTracks(t);
            setLikedSet(new Set(t.filter(x => x.liked).map(x => x.path)));
            setRecentTracks(recRes.data.tracks || []);
            setMostPlayed(topRes.data.tracks || []);
            setOffline(false);
            saveLibCache(t, recRes.data.tracks || [], topRes.data.tracks || []);
        } catch (_) {
            const cached = loadLibCache();
            if (cached) {
                setTracks(cached.tracks || []);
                setLikedSet(new Set((cached.tracks || []).filter(x => x.liked).map(x => x.path)));
                setRecentTracks(cached.recent || []);
                setMostPlayed(cached.top || []);
                setOffline(true);
            }
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);
    useEffect(() => { setOpenGroup(null); setSearch(""); setLikedOnly(false); }, [mode]);

    const toggleLike = async (path, e) => {
        e?.stopPropagation();
        const next = !likedSet.has(path);
        setLikedSet(prev => {
            const s = new Set(prev);
            if (next) s.add(path); else s.delete(path);
            return s;
        });
        try { await axios.patch("/library/like", { path, liked: next }); } catch (_) {}
    };

    const filtered = tracks.filter((t) => {
        const q = search.toLowerCase();
        const matchSearch = t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q);
        return matchSearch && (!likedOnly || likedSet.has(t.path));
    });

    const sorted = [...filtered].sort((a, b) => {
        if (sortBy === "title") return a.title.localeCompare(b.title);
        if (sortBy === "plays") return (b.play_count || 0) - (a.play_count || 0);
        if (sortBy === "recent") return (b.added_at || "").localeCompare(a.added_at || "");
        return (a.artist || "").localeCompare(b.artist || "") || (a.album || "").localeCompare(b.album || "") || a.title.localeCompare(b.title);
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-[#1DB954] border-t-transparent animate-spin" />
            </div>
        );
    }

    if (mode === "playlists") {
        return (
            <div className="space-y-4 fade-up">
                <ModeToggle mode={mode} setMode={setMode} />
                <PlaylistsView onPlay={onPlay} />
            </div>
        );
    }

    if (mode === "local") {
        return (
            <div className="space-y-4 fade-up">
                <ModeToggle mode={mode} setMode={setMode} />
                <LocalView onPlay={onPlay} onAddToQueue={onAddToQueue} />
            </div>
        );
    }

    if (mode === "artists") {
        const groups = groupBy(tracks, (t) => primaryArtist(t.artist));
        const filteredGroups = filterGroups(groups, search);

        Object.keys(filteredGroups).forEach((name) => {
            if (!fetchedArtists.current.has(name)) {
                fetchedArtists.current.add(name);
                axios.get("/artist-image", { params: { name } })
                    .then((r) => { if (r.data.url) setArtistImages((prev) => ({ ...prev, [name]: r.data.url })); })
                    .catch(() => {});
            }
        });

        return (
            <div className="space-y-4 fade-up">
                <ModeToggle mode={mode} setMode={setMode} />
                <GroupHeader label="Artistas" count={Object.keys(filteredGroups).length} onRefresh={load} />
                <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar artista…" />
                <GroupedList
                    groups={filteredGroups}
                    openGroup={openGroup}
                    setOpenGroup={setOpenGroup}
                    onPlay={onPlay}
                    onAddToQueue={onAddToQueue}
                    likedSet={likedSet}
                    onToggleLike={toggleLike}
                    icon={<Mic2 className="w-4 h-4 text-neutral-500" />}
                    subLabel={(t) => t.album}
                    groupImages={artistImages}
                    roundedImage
                />
            </div>
        );
    }

    if (mode === "albums") {
        const groups = groupBy(tracks, (t) => t.album || "Álbum desconhecido");
        const filteredGroups = filterGroups(groups, search);
        return (
            <div className="space-y-4 fade-up">
                <ModeToggle mode={mode} setMode={setMode} />
                <GroupHeader label="Álbuns" count={Object.keys(filteredGroups).length} onRefresh={load} />
                <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar álbum…" />
                <GroupedList
                    groups={filteredGroups}
                    openGroup={openGroup}
                    setOpenGroup={setOpenGroup}
                    onPlay={onPlay}
                    onAddToQueue={onAddToQueue}
                    likedSet={likedSet}
                    onToggleLike={toggleLike}
                    icon={<Disc3 className="w-4 h-4 text-neutral-500" />}
                    subLabel={(t) => t.artist}
                    showCover
                />
            </div>
        );
    }

    // ── modo "all" ─────────────────────────────────────────────────
    return (
        <div className="space-y-4 fade-up">
            <ModeToggle mode={mode} setMode={setMode} />
            {offline && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                    <span>Servidor offline — a mostrar biblioteca em cache</span>
                </div>
            )}
            {recentTracks.length > 0 && (
                <HorizontalSection title="Recentes" tracks={recentTracks} onPlay={(t) => onPlay([t], 0)} />
            )}
            {mostPlayed.length > 0 && (
                <HorizontalSection title="Mais ouvidas" tracks={mostPlayed} onPlay={(t) => onPlay([t], 0)} />
            )}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">{tracks.length} faixas</span>
                    {likedSet.size > 0 && (
                        <button
                            onClick={() => setLikedOnly(l => !l)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${likedOnly ? "border-red-500/60 bg-red-500/10 text-red-400" : "border-white/10 text-neutral-500 hover:text-white"}`}
                        >
                            <Heart className={`w-3 h-3 ${likedOnly ? "fill-red-500 text-red-500" : ""}`} />
                            {likedOnly ? "Favoritas" : `${likedSet.size} ♥`}
                        </button>
                    )}
                </div>
                <button onClick={load} className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors" title="Atualizar">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-neutral-600">Ordenar:</span>
                {[
                    { key: "artist",  label: "Artista" },
                    { key: "title",   label: "A-Z" },
                    { key: "plays",   label: "Reproduções" },
                    { key: "recent",  label: "Recentes" },
                ].map((s) => (
                    <button
                        key={s.key}
                        onClick={() => setSortBy(s.key)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                            sortBy === s.key
                                ? "border-[#1DB954]/60 bg-[#1DB954]/10 text-[#1DB954]"
                                : "border-white/10 text-neutral-600 hover:text-white"
                        }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {tracks.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar título, artista ou álbum…" />
                    {sorted.length === 0 ? (
                        <p className="text-center text-sm text-neutral-500 py-8">Sem resultados para &ldquo;{search || "favoritas"}&rdquo;</p>
                    ) : (
                        <div className="space-y-0.5 max-h-[460px] overflow-y-auto thin-scroll pr-1">
                            {sorted.map((track, i) => (
                                <LibraryRow
                                    key={track.path}
                                    track={track}
                                    liked={likedSet.has(track.path)}
                                    isPlaying={currentPath === track.path}
                                    onPlay={() => onPlay(sorted, i)}
                                    onAddToQueue={onAddToQueue ? () => onAddToQueue([track]) : null}
                                    onToggleLike={(e) => toggleLike(track.path, e)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── helpers ────────────────────────────────────────────────────────

function primaryArtist(artist) {
    if (!artist) return "Artista desconhecido";
    return artist.split(/\s*[,&;]\s*/)[0].trim() || "Artista desconhecido";
}

function groupBy(tracks, keyFn) {
    return tracks.reduce((acc, t) => {
        const k = keyFn(t);
        if (!acc[k]) acc[k] = [];
        acc[k].push(t);
        return acc;
    }, {});
}

function filterGroups(groups, search) {
    if (!search) return groups;
    const q = search.toLowerCase();
    return Object.fromEntries(
        Object.entries(groups).filter(([key, tracks]) =>
            key.toLowerCase().includes(q) ||
            tracks.some((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q))
        )
    );
}

// ── Context menu ───────────────────────────────────────────────────

function TrackMenu({ liked, onToggleLike, onAddToQueue, onClose, path, title, artist }) {
    const ref = useRef(null);
    const [playlists, setPlaylists] = useState([]);
    const [showPlaylists, setShowPlaylists] = useState(false);

    useEffect(() => {
        axios.get("/local-playlists").then((r) => setPlaylists(r.data.playlists || [])).catch(() => {});
    }, []);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    const addToPlaylist = async (pl) => {
        if (!path || pl.tracks.includes(path)) return;
        await axios.put(`/local-playlists/${pl.id}`, { tracks: [...pl.tracks, path] }).catch(() => {});
        onClose();
    };

    const downloadTrack = () => {
        const a = document.createElement("a");
        a.href = assetUrl(`/files/${path}`);
        a.download = `${artist ? artist + " - " : ""}${title || "faixa"}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        onClose();
    };

    return (
        <div ref={ref} className="absolute right-0 top-full mt-1 z-50 bg-[#282828] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[180px]" onClick={(e) => e.stopPropagation()}>
            {onAddToQueue && (
                <button onClick={() => { onAddToQueue(); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left">
                    <ListEnd className="w-4 h-4 text-neutral-400" />
                    Adicionar à fila
                </button>
            )}
            <button onClick={() => { onToggleLike(); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left">
                <Heart className={`w-4 h-4 ${liked ? "fill-red-500 text-red-500" : "text-neutral-400"}`} />
                {liked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            </button>
            <button onClick={downloadTrack}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left">
                <Download className="w-4 h-4 text-neutral-400" />
                Descarregar para o telemóvel
            </button>
            {playlists.length > 0 && (
                <div className="border-t border-white/10 mt-1 pt-1">
                    <button
                        onClick={() => setShowPlaylists((s) => !s)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left"
                    >
                        <ListMusic className="w-4 h-4 text-neutral-400" />
                        Adicionar à playlist
                    </button>
                    {showPlaylists && (
                        <div className="pl-3 pb-1">
                            {playlists.map((pl) => (
                                <button
                                    key={pl.id}
                                    onClick={() => addToPlaylist(pl)}
                                    className="w-full flex items-center px-3 py-1.5 text-xs hover:bg-white/5 transition-colors text-left text-neutral-300 hover:text-white truncate"
                                >
                                    {pl.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── subcomponentes ─────────────────────────────────────────────────

function GroupHeader({ label, count, onRefresh }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">{count} {label.toLowerCase()}</span>
            <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors" title="Atualizar">
                <RefreshCw className="w-4 h-4" />
            </button>
        </div>
    );
}

function SearchBox({ value, onChange, placeholder }) {
    return (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-sm placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#1DB954]/40 focus:border-[#1DB954]/60 transition-all"
        />
    );
}

function GroupedList({ groups, openGroup, setOpenGroup, onPlay, onAddToQueue, likedSet, onToggleLike, icon, subLabel, showCover, groupImages, roundedImage }) {
    const [openAlbum, setOpenAlbum] = useState(null);
    const entries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) return <EmptyState />;

    return (
        <div className="space-y-0.5 max-h-[460px] overflow-y-auto thin-scroll pr-1">
            {entries.map(([groupName, groupTracks]) => {
                const isOpen = openGroup === groupName;
                const cover = showCover && groupTracks.find((t) => t.has_cover);
                const externalImg = groupImages?.[groupName];
                const imgClass = `w-full h-full object-cover ${roundedImage ? "rounded-full" : ""}`;
                const containerClass = `w-10 h-10 overflow-hidden bg-white/5 flex items-center justify-center flex-shrink-0 ${roundedImage ? "rounded-full" : "rounded-lg"}`;
                const albumGroups = roundedImage ? groupBy(groupTracks, (t) => t.album || "Álbum desconhecido") : null;

                return (
                    <div key={groupName}>
                        <button
                            onClick={() => { setOpenGroup(isOpen ? null : groupName); setOpenAlbum(null); }}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group text-left"
                        >
                            <div className={containerClass}>
                                {externalImg ? (
                                    <img src={externalImg} alt="" className={imgClass} onError={(e) => { e.target.style.display = "none"; }} />
                                ) : cover ? (
                                    <img src={assetUrl(`/cover/${cover.path}`)} alt="" className={imgClass} onError={(e) => { e.target.style.display = "none"; }} />
                                ) : icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{groupName}</p>
                                <p className="text-xs text-neutral-500 mt-0.5">
                                    {roundedImage && albumGroups
                                        ? `${Object.keys(albumGroups).length} álbuns · ${groupTracks.length} faixas`
                                        : `${groupTracks.length} ${groupTracks.length === 1 ? "faixa" : "faixas"}`}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onPlay(groupTracks, 0); }}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-[#1DB954]/10 text-[#1DB954] hover:bg-[#1DB954]/20 transition-all"
                                >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                </button>
                                {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-neutral-500 flex-shrink-0" />}
                            </div>
                        </button>

                        {isOpen && (
                            <div className="ml-4 border-l border-white/5 pl-3 space-y-0.5 mb-1">
                                {roundedImage && albumGroups
                                    ? Object.entries(albumGroups).sort(([a], [b]) => a.localeCompare(b)).map(([albumName, albumTracks]) => {
                                        const albumOpen = openAlbum === `${groupName}::${albumName}`;
                                        const albumCover = albumTracks.find((t) => t.has_cover);
                                        return (
                                            <div key={albumName}>
                                                <button
                                                    onClick={() => setOpenAlbum(albumOpen ? null : `${groupName}::${albumName}`)}
                                                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group text-left"
                                                >
                                                    <div className="w-8 h-8 rounded-md overflow-hidden bg-white/5 flex items-center justify-center flex-shrink-0">
                                                        {albumCover ? (
                                                            <img src={assetUrl(`/cover/${albumCover.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                                                        ) : <Disc3 className="w-3.5 h-3.5 text-neutral-600" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm truncate">{albumName}</p>
                                                        <p className="text-xs text-neutral-500">{albumTracks.length} {albumTracks.length === 1 ? "faixa" : "faixas"}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPlay(albumTracks, 0); }}
                                                            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-[#1DB954]/10 text-[#1DB954] hover:bg-[#1DB954]/20 transition-all"
                                                        >
                                                            <Play className="w-3 h-3 fill-current" />
                                                        </button>
                                                        {albumOpen ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />}
                                                    </div>
                                                </button>
                                                {albumOpen && (
                                                    <div className="ml-4 border-l border-white/5 pl-3 space-y-0.5 mb-1">
                                                        {albumTracks.map((track, i) => (
                                                            <TrackRow
                                                                key={track.path}
                                                                track={track}
                                                                liked={likedSet?.has(track.path)}
                                                                onPlay={() => onPlay(albumTracks, i)}
                                                                onAddToQueue={onAddToQueue ? () => onAddToQueue([track]) : null}
                                                                onToggleLike={(e) => onToggleLike?.(track.path, e)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                    : groupTracks.map((track, i) => (
                                        <TrackRow
                                            key={track.path}
                                            track={track}
                                            liked={likedSet?.has(track.path)}
                                            onPlay={() => onPlay(groupTracks, i)}
                                            onAddToQueue={onAddToQueue ? () => onAddToQueue([track]) : null}
                                            onToggleLike={(e) => onToggleLike?.(track.path, e)}
                                            label={subLabel?.(track)}
                                        />
                                    ))
                                }
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function TrackRow({ track, onPlay, onAddToQueue, onToggleLike, liked, label }) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="relative group">
            <button
                onClick={onPlay}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
                <div className="relative w-8 h-8 rounded-md overflow-hidden bg-white/5 flex-shrink-0">
                    {track.has_cover ? (
                        <img src={assetUrl(`/cover/${track.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center"><Music2 className="w-3 h-3 text-neutral-600" /></div>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
                        <Play className="w-3 h-3 text-white fill-white" />
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{track.title}</p>
                    {label && <p className="text-xs text-neutral-500 truncate">{label}</p>}
                </div>
                <span className="text-xs text-neutral-600 font-mono flex-shrink-0 group-hover:hidden">{track.duration}</span>
            </button>
            {/* Botões de acção (hover) */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                <button onClick={onToggleLike} className={`p-1 rounded-md transition-colors hover:bg-white/10 ${liked ? "text-red-500" : "text-neutral-500 hover:text-white"}`}>
                    <Heart className={`w-3.5 h-3.5 ${liked ? "fill-red-500" : ""}`} />
                </button>
                {onAddToQueue && (
                    <button onClick={(e) => { e.stopPropagation(); onAddToQueue(); }} className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition-colors" title="Adicionar à fila">
                        <ListEnd className="w-3.5 h-3.5" />
                    </button>
                )}
                <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m); }} className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition-colors">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    {menuOpen && <TrackMenu liked={liked} onToggleLike={onToggleLike} onAddToQueue={onAddToQueue} onClose={() => setMenuOpen(false)} path={track.path} title={track.title} artist={track.artist} />}
                </div>
            </div>
        </div>
    );
}

function LibraryRow({ track, onPlay, onAddToQueue, onToggleLike, liked, isPlaying }) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className={`relative group rounded-xl transition-colors ${isPlaying ? "bg-[#1DB954]/8" : ""}`}>
            <button
                onClick={onPlay}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
                <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                    {track.has_cover ? (
                        <img src={assetUrl(`/cover/${track.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center"><Music2 className="w-4 h-4 text-neutral-600" /></div>
                    )}
                    {isPlaying ? (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
                            <div className="flex gap-0.5 items-end h-4">
                                {[0, 1, 2].map(b => (
                                    <div key={b} className="w-0.5 bg-[#1DB954] rounded-full animate-bounce"
                                        style={{ height: `${[8, 12, 6][b]}px`, animationDelay: `${b * 0.15}s` }} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                            <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate leading-tight ${isPlaying ? "text-[#1DB954]" : ""}`}>{track.title}</p>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                        {track.artist || "Artista desconhecido"}{track.album ? ` · ${track.album}` : ""}
                    </p>
                </div>
                <span className="text-xs text-neutral-600 font-mono flex-shrink-0 group-hover:hidden">{track.duration}</span>
            </button>
            {/* Botões de acção (hover) */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                <button onClick={onToggleLike} className={`p-1 rounded-md transition-colors hover:bg-white/10 ${liked ? "text-red-500" : "text-neutral-500 hover:text-white"}`}>
                    <Heart className={`w-4 h-4 ${liked ? "fill-red-500" : ""}`} />
                </button>
                {onAddToQueue && (
                    <button onClick={(e) => { e.stopPropagation(); onAddToQueue(); }} className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition-colors" title="Adicionar à fila">
                        <ListEnd className="w-4 h-4" />
                    </button>
                )}
                <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpen(m => !m); }} className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/10 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuOpen && <TrackMenu liked={liked} onToggleLike={onToggleLike} onAddToQueue={onAddToQueue} onClose={() => setMenuOpen(false)} path={track.path} title={track.title} artist={track.artist} />}
                </div>
            </div>
        </div>
    );
}

function HorizontalSection({ title, tracks, onPlay }) {
    return (
        <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">{title}</p>
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {tracks.map((track) => (
                    <TrackCard key={track.path} track={track} onPlay={() => onPlay(track)} />
                ))}
            </div>
        </div>
    );
}

function TrackCard({ track, onPlay }) {
    return (
        <button
            onClick={onPlay}
            className="flex-shrink-0 w-24 group text-left"
        >
            <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-white/5 mb-1.5">
                {track.has_cover
                    ? <img src={assetUrl(`/cover/${track.path}`)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                    : <div className="w-full h-full flex items-center justify-center"><Music2 className="w-8 h-8 text-neutral-700" /></div>}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                    <Play className="w-7 h-7 text-white fill-white" />
                </div>
            </div>
            <p className="text-xs font-medium truncate leading-tight">{track.title}</p>
            <p className="text-[10px] text-neutral-500 truncate mt-0.5">{track.artist}</p>
        </button>
    );
}

function EmptyState() {
    return (
        <div className="text-center py-16 text-neutral-500">
            <Music2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Ainda não há faixas descarregadas.</p>
            <p className="text-xs mt-1 text-neutral-600">Vai ao separador Download para começar.</p>
        </div>
    );
}

function ModeToggle({ mode, setMode }) {
    const tabs = [
        { key: "all",      label: "Todas",    short: "All",  icon: <Music2 className="w-3.5 h-3.5" /> },
        { key: "artists",  label: "Artistas", short: "Art.", icon: <Mic2 className="w-3.5 h-3.5" /> },
        { key: "albums",   label: "Álbuns",   short: "Álb.", icon: <Disc3 className="w-3.5 h-3.5" /> },
        { key: "playlists",label: "Playlists",short: "PL",   icon: <ListMusic className="w-3.5 h-3.5" /> },
        { key: "local",    label: "Local",    short: "Local",icon: <Smartphone className="w-3.5 h-3.5" /> },
    ];
    return (
        <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/10">
            {tabs.map((t) => (
                <button
                    key={t.key}
                    onClick={() => setMode(t.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-xs font-medium transition-all ${mode === t.key ? "bg-white/10 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                >
                    {t.icon}
                    <span className="hidden sm:inline">{t.label}</span>
                    <span className="sm:hidden">{t.short}</span>
                </button>
            ))}
        </div>
    );
}

