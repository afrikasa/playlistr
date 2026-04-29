import { useEffect, useRef, useState } from "react";
import { Music2, Play, RefreshCw, ListMusic, Mic2, Disc3, ChevronDown, ChevronRight } from "lucide-react";
import axios from "axios";
import { PlaylistsView } from "./PlaylistsView";

export function LibraryView({ onPlay }) {
    const [mode, setMode] = useState("all"); // all | artists | albums | playlists
    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [openGroup, setOpenGroup] = useState(null);
    const [artistImages, setArtistImages] = useState({});
    const fetchedArtists = useRef(new Set());

    const load = async () => {
        setLoading(true);
        try {
            const res = await axios.get("/library");
            setTracks(res.data.tracks || []);
        } catch (_) {}
        setLoading(false);
    };

    useEffect(() => { load(); }, []);
    // Reset grupo aberto ao mudar de modo
    useEffect(() => { setOpenGroup(null); setSearch(""); }, [mode]);

    const filtered = tracks.filter((t) => {
        const q = search.toLowerCase();
        return (
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q) ||
            t.album.toLowerCase().includes(q)
        );
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

    if (mode === "artists") {
        const groups = groupBy(tracks, (t) => primaryArtist(t.artist));
        const filteredGroups = filterGroups(groups, search);

        // Buscar imagens dos artistas visíveis (lazy, sem repetir)
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
                    icon={<Disc3 className="w-4 h-4 text-neutral-500" />}
                    subLabel={(t) => t.artist}
                    showCover
                />
            </div>
        );
    }

    // ── modo "all" ───────────────────────────────────────────────
    return (
        <div className="space-y-4 fade-up">
            <ModeToggle mode={mode} setMode={setMode} />
            <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">{tracks.length} faixas</span>
                <button onClick={load} className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors" title="Atualizar">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {tracks.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <SearchBox value={search} onChange={setSearch} placeholder="Pesquisar título, artista ou álbum…" />
                    {filtered.length === 0 ? (
                        <p className="text-center text-sm text-neutral-500 py-8">Sem resultados para &ldquo;{search}&rdquo;</p>
                    ) : (
                        <div className="space-y-0.5 max-h-[460px] overflow-y-auto thin-scroll pr-1">
                            {filtered.map((track, i) => (
                                <LibraryRow key={track.path} track={track} onPlay={() => onPlay(filtered, i)} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── helpers ──────────────────────────────────────────────────────

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

// ── subcomponentes ────────────────────────────────────────────────

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

function GroupedList({ groups, openGroup, setOpenGroup, onPlay, icon, subLabel, showCover, groupImages, roundedImage }) {
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

                // Dentro do artista: agrupar por álbum
                const albumGroups = roundedImage
                    ? groupBy(groupTracks, (t) => t.album || "Álbum desconhecido")
                    : null;

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
                                    <img src={`/cover/${cover.path}`} alt="" className={imgClass} onError={(e) => { e.target.style.display = "none"; }} />
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
                                    title="Reproduzir tudo"
                                >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                </button>
                                {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-neutral-500 flex-shrink-0" />}
                            </div>
                        </button>

                        {isOpen && (
                            <div className="ml-4 border-l border-white/5 pl-3 space-y-0.5 mb-1">
                                {/* Artistas: sub-agrupa por álbum */}
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
                                                            <img src={`/cover/${albumCover.path}`} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
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
                                                            <TrackRow key={track.path} track={track} onPlay={() => onPlay(albumTracks, i)} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                    : groupTracks.map((track, i) => (
                                        <TrackRow key={track.path} track={track} onPlay={() => onPlay(groupTracks, i)} label={subLabel?.(track)} />
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

function TrackRow({ track, onPlay, label }) {
    return (
        <button
            onClick={onPlay}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group text-left"
        >
            <div className="relative w-8 h-8 rounded-md overflow-hidden bg-white/5 flex-shrink-0">
                {track.has_cover ? (
                    <img src={`/cover/${track.path}`} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="w-3 h-3 text-neutral-600" />
                    </div>
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
                    <Play className="w-3 h-3 text-white fill-white" />
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{track.title}</p>
                {label && <p className="text-xs text-neutral-500 truncate">{label}</p>}
            </div>
            <span className="text-xs text-neutral-600 font-mono flex-shrink-0">{track.duration}</span>
        </button>
    );
}

function LibraryRow({ track, onPlay }) {
    return (
        <button
            onClick={onPlay}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group text-left"
        >
            <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                {track.has_cover ? (
                    <img src={`/cover/${track.path}`} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="w-4 h-4 text-neutral-600" />
                    </div>
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    <Play className="w-4 h-4 text-white fill-white" />
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-tight">{track.title}</p>
                <p className="text-xs text-neutral-500 truncate mt-0.5">
                    {track.artist || "Artista desconhecido"}
                    {track.album ? ` · ${track.album}` : ""}
                </p>
            </div>
            <span className="text-xs text-neutral-600 font-mono flex-shrink-0">{track.duration}</span>
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
        { key: "all",      label: "Todas",    icon: <Music2 className="w-3.5 h-3.5" /> },
        { key: "artists",  label: "Artistas", icon: <Mic2 className="w-3.5 h-3.5" /> },
        { key: "albums",   label: "Álbuns",   icon: <Disc3 className="w-3.5 h-3.5" /> },
        { key: "playlists",label: "Playlists",icon: <ListMusic className="w-3.5 h-3.5" /> },
    ];
    return (
        <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/10">
            {tabs.map((t) => (
                <button
                    key={t.key}
                    onClick={() => setMode(t.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        mode === t.key ? "bg-white/10 text-white" : "text-neutral-500 hover:text-neutral-300"
                    }`}
                >
                    {t.icon}
                    {t.label}
                </button>
            ))}
        </div>
    );
}
