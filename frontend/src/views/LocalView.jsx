import { useEffect, useRef, useState } from "react";
import { FolderOpen, ListEnd, Music2, RefreshCw, Smartphone } from "lucide-react";
import { loadDirHandle, loadLocalTracks, saveDirHandle, saveLocalTracks } from "../utils/localDb";

const DIR_KEY = "local_music_dir";
const AUDIO_EXTS = /\.(mp3|m4a|flac|ogg|wav)$/i;

export function LocalView({ onPlay, onAddToQueue }) {
    const [tracks, setTracks]   = useState([]);
    const [loading, setLoading] = useState(false);
    const [ready, setReady]     = useState(false); // blob URLs criados e válidos
    const blobUrls  = useRef({}); // id → blob URL
    const dirRef    = useRef(null);
    const supported = "showDirectoryPicker" in window;

    useEffect(() => {
        init();
        return () => { Object.values(blobUrls.current).forEach(URL.revokeObjectURL); };
    }, []);

    async function init() {
        const saved = await loadLocalTracks();
        if (!saved.length) return;
        setTracks(saved);
        const dirHandle = await loadDirHandle(DIR_KEY);
        if (!dirHandle) return;
        dirRef.current = dirHandle;
        // Verificar permissão sem mostrar prompt
        const perm = await dirHandle.queryPermission({ mode: "read" }).catch(() => "denied");
        if (perm === "granted") {
            await buildBlobUrls(dirHandle);
            setReady(true);
        }
    }

    async function buildBlobUrls(dirHandle) {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind !== "file" || !AUDIO_EXTS.test(name)) continue;
            const id = makeId(dirHandle.name, name);
            if (!blobUrls.current[id]) {
                const file = await handle.getFile();
                blobUrls.current[id] = URL.createObjectURL(file);
            }
        }
    }

    async function openFolder() {
        if (!window.showDirectoryPicker) return;
        setLoading(true);
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: "read" });
            dirRef.current = dirHandle;

            // Limpar blob URLs anteriores
            Object.values(blobUrls.current).forEach(URL.revokeObjectURL);
            blobUrls.current = {};

            const newTracks = [];
            for await (const [name, handle] of dirHandle.entries()) {
                if (handle.kind !== "file" || !AUDIO_EXTS.test(name)) continue;
                const file = await handle.getFile();
                const id   = makeId(dirHandle.name, name);
                const blob = URL.createObjectURL(file);
                blobUrls.current[id] = blob;

                newTracks.push({
                    id,
                    path: id,
                    title: name.replace(/\.[^.]+$/, ""),
                    artist: "—",
                    album: dirHandle.name,
                    duration: await getAudioDuration(blob),
                    has_cover: false,
                    liked: false,
                    play_count: 0,
                    isLocal: true,
                });
            }

            newTracks.sort((a, b) => a.title.localeCompare(b.title));
            setTracks(newTracks);
            setReady(true);
            await saveDirHandle(DIR_KEY, dirHandle);
            await saveLocalTracks(newTracks);
        } catch (e) {
            if (e.name !== "AbortError") console.error(e);
        }
        setLoading(false);
    }

    async function reload() {
        if (!dirRef.current) { openFolder(); return; }
        setLoading(true);
        try {
            const perm = await dirRef.current.requestPermission({ mode: "read" });
            if (perm === "granted") {
                await buildBlobUrls(dirRef.current);
                setReady(true);
            }
        } catch (_) {}
        setLoading(false);
    }

    function withBlob(track) {
        return { ...track, blobUrl: blobUrls.current[track.id] };
    }

    function handlePlay(index) {
        onPlay(tracks.map(withBlob), index);
    }

    // ── UI ──────────────────────────────────────────────────────────────

    if (!supported) {
        return (
            <div className="text-center py-12 space-y-2">
                <Smartphone className="w-10 h-10 text-neutral-600 mx-auto" />
                <p className="text-sm text-neutral-400">O teu browser não suporta acesso a ficheiros locais.</p>
                <p className="text-xs text-neutral-600">Usa o Chrome para Android.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 fade-up">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold">Músicas locais</h3>
                    <p className="text-xs text-neutral-500">
                        {tracks.length > 0 ? `${tracks.length} ficheiros` : "Nenhuma pasta selecionada"}
                    </p>
                </div>
                <div className="flex gap-2">
                    {tracks.length > 0 && !ready && (
                        <button
                            onClick={reload}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 hover:border-white/20 text-neutral-400 hover:text-white transition-all"
                        >
                            <RefreshCw className="w-3.5 h-3.5" /> Recarregar
                        </button>
                    )}
                    <button
                        onClick={openFolder}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#1DB954]/10 border border-[#1DB954]/30 hover:bg-[#1DB954]/20 text-[#1DB954] transition-all disabled:opacity-50"
                    >
                        <FolderOpen className="w-3.5 h-3.5" />
                        {loading ? "A carregar…" : tracks.length ? "Mudar pasta" : "Abrir pasta"}
                    </button>
                </div>
            </div>

            {/* Aviso de permissão expirada */}
            {tracks.length > 0 && !ready && (
                <p className="text-xs text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                    Permissão expirou — clica em "Recarregar" para ativar a reprodução.
                </p>
            )}

            {/* Botão reproduzir tudo */}
            {tracks.length > 0 && ready && (
                <button
                    onClick={() => handlePlay(0)}
                    className="w-full py-2 rounded-xl bg-[#1DB954] text-black text-sm font-semibold hover:bg-[#1ed760] transition-colors"
                >
                    Reproduzir tudo
                </button>
            )}

            {/* Lista de faixas */}
            {tracks.map((track, i) => (
                <div
                    key={track.id}
                    onClick={() => ready && handlePlay(i)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl group transition-colors ${
                        ready ? "hover:bg-white/[0.04] cursor-pointer" : "opacity-50 cursor-default"
                    }`}
                >
                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Music2 className="w-4 h-4 text-neutral-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{track.title}</p>
                        <p className="text-xs text-neutral-500 truncate">{track.album}</p>
                    </div>
                    {ready && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onAddToQueue([withBlob(track)]); }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-all"
                        >
                            <ListEnd className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ))}

            {/* Estado vazio */}
            {tracks.length === 0 && !loading && (
                <div className="text-center py-12 space-y-3">
                    <Smartphone className="w-10 h-10 text-neutral-600 mx-auto" />
                    <p className="text-sm text-neutral-400">Seleciona uma pasta com ficheiros de música</p>
                    <p className="text-xs text-neutral-600">MP3 · M4A · FLAC · WAV</p>
                </div>
            )}
        </div>
    );
}

function makeId(dirName, fileName) {
    return `local_${dirName}_${fileName}`;
}

function getAudioDuration(blobUrl) {
    return new Promise((resolve) => {
        const a = new Audio();
        a.onloadedmetadata = () => { resolve(Math.round(a.duration)); a.src = ""; };
        a.onerror = () => { resolve(0); a.src = ""; };
        a.src = blobUrl;
    });
}
