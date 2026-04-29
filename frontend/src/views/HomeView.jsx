import { useEffect, useState } from "react";
import {
    Link2,
    ClipboardPaste,
    FolderOpen,
    Download,
    Music2,
    Sparkles,
    Library,
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import axios from "axios";

export const HomeView = ({ onStart }) => {
    const [url, setUrl] = useState("");
    const [folder, setFolder] = useState("");
    const [quality, setQuality] = useState("320");
    const [playlists, setPlaylists] = useState([]);
    const [loadingPlaylists, setLoadingPlaylists] = useState(true);
    const [selectedId, setSelectedId] = useState("");

    useEffect(() => {
        axios.get("/playlists")
            .then((res) => {
                if (res.data.playlists?.length) {
                    setPlaylists(res.data.playlists);
                }
            })
            .catch(() => {})
            .finally(() => setLoadingPlaylists(false));
    }, []);

    const handlePlaylistSelect = (id) => {
        setSelectedId(id);
        const p = playlists.find((x) => x.id === id);
        if (p) setUrl(p.url);
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setUrl(text);
                setSelectedId("");
            }
        } catch {
            // clipboard inaccessível
        }
    };

    const isValid = url.trim().length > 10;

    return (
        <div className="space-y-8 fade-up" data-testid="home-view">
            {/* Hero */}
            <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] uppercase tracking-[0.2em] text-neutral-400 font-semibold">
                    <Sparkles className="w-3 h-3 text-[#1DB954]" />
                    Local · Offline · MP3
                </div>
                <h1 className="font-display text-4xl md:text-5xl font-extrabold leading-[1.05] tracking-tight">
                    Rip a playlist.
                    <br />
                    <span className="text-[#1DB954]">Keep it forever.</span>
                </h1>
                <p className="text-neutral-400 text-sm md:text-base max-w-lg">
                    Escolhe uma das tuas playlists ou cola qualquer URL público do Spotify.
                </p>
            </div>

            {/* As tuas playlists */}
            <div className="space-y-3">
                <label className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400 flex items-center gap-2">
                    <Library className="w-3.5 h-3.5" />
                    As Tuas Playlists
                </label>

                {loadingPlaylists ? (
                    <div className="flex items-center gap-2.5 text-sm text-neutral-500 py-2">
                        <div className="w-4 h-4 rounded-full border-2 border-[#1DB954] border-t-transparent animate-spin shrink-0" />
                        A carregar playlists…
                    </div>
                ) : playlists.length > 0 ? (
                    <Select value={selectedId} onValueChange={handlePlaylistSelect}>
                        <SelectTrigger
                            data-testid="playlist-select"
                            className="bg-[#121212] border-white/10 rounded-xl px-4 py-3.5 h-auto text-white focus:ring-[#1DB954]/40 focus:ring-2 focus:ring-offset-0"
                        >
                            <SelectValue placeholder="Escolhe uma playlist…" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#121212] border-white/10 text-white max-h-72 overflow-auto">
                            {playlists.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    <span className="flex items-center gap-2">
                                        {p.image && (
                                            <img
                                                src={p.image}
                                                alt=""
                                                className="w-6 h-6 rounded object-cover shrink-0"
                                            />
                                        )}
                                        <span className="truncate">{p.name}</span>
                                        <span className="text-neutral-500 shrink-0 text-xs">
                                            {p.total} faixas
                                        </span>
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <p className="text-sm text-neutral-600 py-1">
                        Não foi possível carregar playlists — usa o URL abaixo.
                    </p>
                )}
            </div>

            {/* URL externo */}
            <div className="space-y-3">
                <label
                    className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400 flex items-center gap-2"
                    htmlFor="playlist-url"
                >
                    <Link2 className="w-3.5 h-3.5" />
                    {playlists.length > 0 ? "Ou cola um URL público externo" : "Playlist URL"}
                </label>
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <input
                            id="playlist-url"
                            type="text"
                            value={url}
                            onChange={(e) => { setUrl(e.target.value); setSelectedId(""); }}
                            placeholder="https://open.spotify.com/playlist/..."
                            data-testid="playlist-input"
                            className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#1DB954]/40 focus:border-[#1DB954]/60 transition-all font-mono text-sm"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handlePaste}
                        data-testid="paste-btn"
                        className="px-4 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all flex items-center gap-2 text-sm font-medium shrink-0"
                    >
                        <ClipboardPaste className="w-4 h-4" />
                        <span className="hidden sm:inline">Paste</span>
                    </button>
                </div>
            </div>

            {/* Settings grid */}
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                <div className="space-y-3">
                    <label
                        className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400 flex items-center gap-2"
                        htmlFor="output-folder"
                    >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Output Folder
                    </label>
                    <input
                        id="output-folder"
                        type="text"
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                        placeholder="downloads/ (pasta do projeto)"
                        data-testid="output-folder-input"
                        className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#1DB954]/40 focus:border-[#1DB954]/60 transition-all text-sm"
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-xs uppercase tracking-[0.2em] font-bold text-neutral-400 flex items-center gap-2">
                        <Music2 className="w-3.5 h-3.5" />
                        Quality
                    </label>
                    <Select value={quality} onValueChange={setQuality}>
                        <SelectTrigger
                            data-testid="quality-select"
                            className="bg-[#121212] border-white/10 rounded-xl px-4 py-3 h-auto text-white focus:ring-[#1DB954]/40 focus:ring-2 focus:ring-offset-0"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#121212] border-white/10 text-white">
                            <SelectItem value="128" data-testid="quality-128">
                                128 kbps · Standard
                            </SelectItem>
                            <SelectItem value="192" data-testid="quality-192">
                                192 kbps · High
                            </SelectItem>
                            <SelectItem value="320" data-testid="quality-320">
                                320 kbps · Premium
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* CTA */}
            <div className="pt-2">
                <button
                    type="button"
                    onClick={() => onStart({ url, folder, quality })}
                    disabled={!isValid}
                    data-testid="start-download-btn"
                    className="group w-full bg-[#1DB954] text-black font-bold rounded-full px-8 py-4 flex items-center justify-center gap-3 hover:bg-[#1ed760] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_8px_30px_rgba(29,185,84,0.25)]"
                >
                    <Download className="w-5 h-5 transition-transform group-hover:translate-y-0.5" />
                    <span className="text-base tracking-wide">Start Download</span>
                </button>
            </div>
        </div>
    );
};
