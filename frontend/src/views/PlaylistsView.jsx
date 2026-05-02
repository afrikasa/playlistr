import { useEffect, useState } from "react";
import { ListMusic, Music2, Play, Plus, Trash2, Pencil, Check, X, ChevronLeft } from "lucide-react";
import axios from "axios";

function PlaylistCover({ tracks, library }) {
    const covered = tracks
        .map((path) => library.find((t) => t.path === path))
        .filter((t) => t?.has_cover);

    if (covered.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <ListMusic className="w-4 h-4 text-neutral-500" />
            </div>
        );
    }

    if (covered.length < 4) {
        return <img src={`/cover/${covered[0].path}`} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />;
    }

    return (
        <div className="grid grid-cols-2 w-full h-full">
            {covered.slice(0, 4).map((t, i) => (
                <img key={i} src={`/cover/${t.path}`} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
            ))}
        </div>
    );
}

export function PlaylistsView({ onPlay }) {
    const [playlists, setPlaylists] = useState([]);
    const [openId, setOpenId] = useState(null);       // playlist aberta
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [renamingId, setRenamingId] = useState(null);
    const [renameVal, setRenameVal] = useState("");
    const [library, setLibrary] = useState([]);        // todas as faixas locais
    const [addingTrack, setAddingTrack] = useState(false);
    const [trackSearch, setTrackSearch] = useState("");

    const load = async () => {
        const [pl, lib] = await Promise.all([
            axios.get("/local-playlists").then((r) => r.data.playlists || []),
            axios.get("/library").then((r) => r.data.tracks || []),
        ]);
        setPlaylists(pl);
        setLibrary(lib);
    };

    useEffect(() => { load(); }, []);

    // ── criar playlist ───────────────────────────────────────────
    const handleCreate = async () => {
        if (!newName.trim()) return;
        await axios.post("/local-playlists", { name: newName.trim() });
        setNewName("");
        setCreating(false);
        load();
    };

    // ── apagar playlist ──────────────────────────────────────────
    const handleDelete = async (id) => {
        await axios.delete(`/local-playlists/${id}`);
        if (openId === id) setOpenId(null);
        load();
    };

    // ── renomear ─────────────────────────────────────────────────
    const startRename = (p) => { setRenamingId(p.id); setRenameVal(p.name); };
    const confirmRename = async (id) => {
        if (!renameVal.trim()) return;
        await axios.put(`/local-playlists/${id}`, { name: renameVal.trim() });
        setRenamingId(null);
        load();
    };

    // ── adicionar faixa ──────────────────────────────────────────
    const handleAddTrack = async (playlistId, track) => {
        const pl = playlists.find((p) => p.id === playlistId);
        if (!pl || pl.tracks.includes(track.path)) return;
        await axios.put(`/local-playlists/${playlistId}`, {
            tracks: [...pl.tracks, track.path],
        });
        load();
    };

    // ── remover faixa ────────────────────────────────────────────
    const handleRemoveTrack = async (playlistId, path) => {
        const pl = playlists.find((p) => p.id === playlistId);
        if (!pl) return;
        await axios.put(`/local-playlists/${playlistId}`, {
            tracks: pl.tracks.filter((t) => t !== path),
        });
        load();
    };

    // ── playlist aberta ──────────────────────────────────────────
    const openPlaylist = playlists.find((p) => p.id === openId);
    const openTracks = openPlaylist
        ? openPlaylist.tracks.map((path) => library.find((t) => t.path === path)).filter(Boolean)
        : [];

    const tracksNotInPlaylist = library.filter(
        (t) => !openPlaylist?.tracks.includes(t.path)
    );
    const filteredAddable = tracksNotInPlaylist.filter((t) => {
        const q = trackSearch.toLowerCase();
        return (
            t.title.toLowerCase().includes(q) ||
            t.artist.toLowerCase().includes(q) ||
            t.album.toLowerCase().includes(q)
        );
    });

    // ── vista de detalhe de playlist ─────────────────────────────
    if (openPlaylist) {
        return (
            <div className="space-y-4 fade-up">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setOpenId(null); setAddingTrack(false); setTrackSearch(""); }}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <h2 className="text-lg font-display font-bold flex-1 truncate">{openPlaylist.name}</h2>
                    <span className="text-xs text-neutral-500">{openTracks.length} faixas</span>
                    {openTracks.length > 0 && (
                        <button
                            onClick={() => onPlay(openTracks, 0)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1DB954] text-black text-xs font-semibold hover:bg-[#1ed760] transition-colors"
                        >
                            <Play className="w-3.5 h-3.5 fill-black" />
                            Reproduzir
                        </button>
                    )}
                </div>

                {/* Lista de faixas da playlist */}
                <div className="space-y-0.5 max-h-[320px] overflow-y-auto thin-scroll pr-1">
                    {openTracks.length === 0 ? (
                        <p className="text-center text-sm text-neutral-500 py-8">
                            Sem faixas. Adiciona abaixo.
                        </p>
                    ) : (
                        openTracks.map((track, i) => (
                            <div
                                key={track.path}
                                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 group"
                            >
                                <button
                                    onClick={() => onPlay(openTracks, i)}
                                    className="relative w-9 h-9 rounded-lg overflow-hidden bg-white/5 flex-shrink-0"
                                >
                                    {track.has_cover ? (
                                        <img src={`/cover/${track.path}`} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Music2 className="w-4 h-4 text-neutral-600" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                        <Play className="w-3.5 h-3.5 text-white fill-white" />
                                    </div>
                                </button>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{track.title}</p>
                                    <p className="text-xs text-neutral-500 truncate">{track.artist}{track.album ? ` · ${track.album}` : ""}</p>
                                </div>
                                <span className="text-xs text-neutral-600 font-mono">{track.duration}</span>
                                <button
                                    onClick={() => handleRemoveTrack(openPlaylist.id, track.path)}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-600 hover:text-red-400 transition-all"
                                    title="Remover da playlist"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Adicionar faixas */}
                <div className="border-t border-white/10 pt-3">
                    <button
                        onClick={() => setAddingTrack((v) => !v)}
                        className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors mb-3"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {addingTrack ? "Fechar" : "Adicionar faixas"}
                    </button>

                    {addingTrack && (
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={trackSearch}
                                onChange={(e) => setTrackSearch(e.target.value)}
                                placeholder="Pesquisar faixas…"
                                className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2 text-sm placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#1DB954]/40 focus:border-[#1DB954]/60 transition-all"
                                autoFocus
                            />
                            <div className="space-y-0.5 max-h-[200px] overflow-y-auto thin-scroll pr-1">
                                {filteredAddable.length === 0 ? (
                                    <p className="text-xs text-neutral-600 text-center py-4">
                                        {tracksNotInPlaylist.length === 0 ? "Todas as faixas já estão na playlist." : "Sem resultados."}
                                    </p>
                                ) : filteredAddable.map((track) => (
                                    <button
                                        key={track.path}
                                        onClick={() => handleAddTrack(openPlaylist.id, track)}
                                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group"
                                    >
                                        <Plus className="w-3.5 h-3.5 text-neutral-600 group-hover:text-[#1DB954] flex-shrink-0 transition-colors" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm truncate">{track.title}</p>
                                            <p className="text-xs text-neutral-500 truncate">{track.artist}</p>
                                        </div>
                                        <span className="text-xs text-neutral-600 font-mono flex-shrink-0">{track.duration}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── lista de playlists ────────────────────────────────────────
    return (
        <div className="space-y-4 fade-up">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-display font-bold">Playlists</h2>
                <button
                    onClick={() => setCreating(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1DB954]/10 text-[#1DB954] text-xs font-semibold hover:bg-[#1DB954]/20 transition-colors border border-[#1DB954]/20"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Nova Playlist
                </button>
            </div>

            {/* Formulário nova playlist */}
            {creating && (
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
                        placeholder="Nome da playlist…"
                        className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-neutral-600"
                        autoFocus
                    />
                    <button onClick={handleCreate} className="text-[#1DB954] hover:text-[#1ed760] transition-colors"><Check className="w-4 h-4" /></button>
                    <button onClick={() => { setCreating(false); setNewName(""); }} className="text-neutral-600 hover:text-neutral-300 transition-colors"><X className="w-4 h-4" /></button>
                </div>
            )}

            {playlists.length === 0 && !creating ? (
                <div className="text-center py-16 text-neutral-500">
                    <ListMusic className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Ainda não tens playlists.</p>
                    <p className="text-xs mt-1 text-neutral-600">Clica em "Nova Playlist" para começar.</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {playlists.map((p) => (
                        <div
                            key={p.id}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 group cursor-pointer transition-colors"
                            onClick={() => setOpenId(p.id)}
                        >
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                                <PlaylistCover tracks={p.tracks} library={library} />
                            </div>
                            <div className="flex-1 min-w-0">
                                {renamingId === p.id ? (
                                    <input
                                        type="text"
                                        value={renameVal}
                                        onChange={(e) => setRenameVal(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") confirmRename(p.id); if (e.key === "Escape") setRenamingId(null); }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-transparent text-sm font-medium focus:outline-none border-b border-[#1DB954]/60 w-full"
                                        autoFocus
                                    />
                                ) : (
                                    <p className="text-sm font-medium truncate">{p.name}</p>
                                )}
                                <p className="text-xs text-neutral-600 mt-0.5">{p.tracks.length} {p.tracks.length === 1 ? "faixa" : "faixas"}</p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => { e.stopPropagation(); startRename(p); }}
                                    className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white transition-colors"
                                    title="Renomear"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-500 hover:text-red-400 transition-colors"
                                    title="Apagar"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
