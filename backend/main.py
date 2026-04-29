"""
backend/main.py
───────────────
API FastAPI para o Spotify Downloader.

Endpoints:
    GET  /auth-status — verifica se o utilizador está autenticado
    GET  /auth        — redireciona para o login Spotify
    GET  /callback    — callback OAuth após login
    POST /download    — inicia download, devolve lista de faixas
    GET  /progress    — SSE com eventos de progresso em tempo real
    GET  /status      — estado atual do download
    POST /cancel      — cancela download em curso
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
from pathlib import Path
from typing import Any

import spotipy
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from spotipy import SpotifyOAuth

# Carrega .env do diretório pai
load_dotenv(Path(__file__).parent.parent / ".env")

sys.path.insert(0, str(Path(__file__).parent.parent))
import spotify_downloader as sd

app = FastAPI(title="Spotify Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pastas ───────────────────────────────────────────────────────
_DOWNLOADS_DIR = Path(__file__).parent.parent / "downloads"
_DOWNLOADS_DIR.mkdir(exist_ok=True)

FRONTEND_BUILD = (
    Path(__file__).parent.parent.parent / "Spotify-Playlist-Downloader" / "frontend" / "build"
)

# ── OAuth Spotify ────────────────────────────────────────────────
_REDIRECT_URI = "http://127.0.0.1:8000/callback"
_SCOPE = "playlist-read-private playlist-read-collaborative"
_TOKEN_CACHE = str(Path(__file__).parent.parent / ".spotify_token_cache")

_sp_oauth = SpotifyOAuth(
    client_id=os.getenv("SPOTIFY_CLIENT_ID", ""),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET", ""),
    redirect_uri=_REDIRECT_URI,
    scope=_SCOPE,
    cache_path=_TOKEN_CACHE,
    open_browser=False,
)


def _get_sp_client() -> spotipy.Spotify | None:
    """Devolve cliente autenticado via token em cache, ou None se não autenticado."""
    token_info = _sp_oauth.get_cached_token()
    if not token_info:
        return None
    if _sp_oauth.is_token_expired(token_info):
        try:
            token_info = _sp_oauth.refresh_access_token(token_info["refresh_token"])
        except Exception:
            return None
    return spotipy.Spotify(auth=token_info["access_token"])


# ── Estado global ────────────────────────────────────────────────
_state: dict[str, Any] = {
    "status": "idle",
    "tracks": [],
    "current": 0,
    "total": 0,
    "done": 0,
    "failed": 0,
    "skipped": 0,
}
_cancel = threading.Event()
_loop: asyncio.AbstractEventLoop | None = None
_queue: asyncio.Queue | None = None


@app.on_event("startup")
async def _startup() -> None:
    global _loop, _queue
    _loop = asyncio.get_event_loop()
    _queue = asyncio.Queue()


# ── Modelos ──────────────────────────────────────────────────────
class DownloadRequest(BaseModel):
    playlist_url: str
    output_dir: str = str(_DOWNLOADS_DIR)
    quality: str = "192"


# ── Helpers ──────────────────────────────────────────────────────
def _emit(event: dict) -> None:
    _update_state(event)
    if _loop and _queue:
        _loop.call_soon_threadsafe(_queue.put_nowait, event)


def _update_state(event: dict) -> None:
    t = event.get("type")
    if t == "track_start":
        _state["current"] = event["current"]
    elif t == "track_done":
        s = event["status"]
        if s == "done":
            _state["done"] += 1
        elif s == "failed":
            _state["failed"] += 1
        elif s == "skipped":
            _state["skipped"] += 1
    elif t in ("completed", "cancelled", "error"):
        _state["status"] = t


def _ms_to_mmss(ms: int | None) -> str:
    if not ms:
        return "--:--"
    s = ms // 1000
    return f"{s // 60}:{s % 60:02d}"


# ── Auth endpoints ───────────────────────────────────────────────
@app.get("/auth-status")
def auth_status():
    return {"authenticated": _get_sp_client() is not None}


@app.get("/auth")
def start_auth():
    return RedirectResponse(url=_sp_oauth.get_authorize_url())


@app.get("/callback")
def auth_callback(code: str = None, error: str = None):
    if code:
        try:
            _sp_oauth.get_access_token(code, check_cache=False)
        except Exception:
            import traceback
            traceback.print_exc()
    return RedirectResponse(url="/")


# ── Download endpoints ───────────────────────────────────────────
@app.post("/download")
def start_download(req: DownloadRequest):
    global _cancel, _state

    if _state["status"] in ("fetching", "downloading"):
        return {"error": "Download já em curso"}

    _cancel = threading.Event()
    _state = {
        "status": "fetching",
        "tracks": [],
        "current": 0,
        "total": 0,
        "done": 0,
        "failed": 0,
        "skipped": 0,
    }

    try:
        raw_tracks = sd.fetch_playlist_tracks(req.playlist_url)
    except Exception as exc:
        _state["status"] = "error"
        return {"error": str(exc)}

    if not raw_tracks:
        _state["status"] = "idle"
        return {"error": "Playlist vazia ou sem faixas acessíveis"}

    tracks = [
        {
            "id": f"t{i + 1:02d}",
            "title": t["title"],
            "artist": t["artist"],
            "album": t["album"],
            "cover": t.get("cover_url") or "",
            "duration": _ms_to_mmss(t.get("duration_ms")),
        }
        for i, t in enumerate(raw_tracks)
    ]

    _state["tracks"] = tracks
    _state["total"] = len(tracks)
    _state["status"] = "downloading"

    def _worker() -> None:
        sd.run_download(
            raw_tracks=raw_tracks,
            output_dir=Path(req.output_dir),
            quality=req.quality,
            cancel_event=_cancel,
            on_event=_emit,
        )

    threading.Thread(target=_worker, daemon=True).start()
    return {"tracks": tracks, "total": len(tracks)}


@app.get("/progress")
async def progress_stream(request: Request):
    async def _gen():
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(_queue.get(), timeout=15.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("completed", "cancelled", "error"):
                    break
            except asyncio.TimeoutError:
                if _state["status"] not in ("downloading", "fetching"):
                    break
                yield ": keep-alive\n\n"

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/playlists")
async def get_user_playlists():
    loop = asyncio.get_event_loop()
    playlists = await loop.run_in_executor(None, sd.fetch_user_playlists)
    return {"playlists": playlists}


@app.get("/status")
def get_status():
    return _state


@app.post("/cancel")
def cancel():
    _cancel.set()
    return {"ok": True}


@app.post("/open-folder")
def open_folder(folder: str = None):
    import subprocess
    target = Path(folder) if folder else _DOWNLOADS_DIR
    if not target.exists():
        target = _DOWNLOADS_DIR
    subprocess.Popen(["explorer", str(target)])
    return {"ok": True}


# ── Biblioteca local ──────────────────────────────────────────────
@app.get("/library")
def get_library():
    from mutagen.id3 import ID3, ID3NoHeaderError
    from mutagen.mp3 import MP3

    tracks = []
    for mp3_file in sorted(_DOWNLOADS_DIR.rglob("*.mp3")):
        try:
            rel_path = mp3_file.relative_to(_DOWNLOADS_DIR).as_posix()
            duration_s = 0
            try:
                audio = MP3(str(mp3_file))
                if audio.info:
                    duration_s = int(audio.info.length)
            except Exception:
                pass

            title = mp3_file.stem
            artist = ""
            album = ""
            has_cover = False
            try:
                tags = ID3(str(mp3_file))
                title = str(tags["TIT2"]) if "TIT2" in tags else title
                artist = str(tags["TPE1"]) if "TPE1" in tags else ""
                album = str(tags["TALB"]) if "TALB" in tags else ""
                has_cover = any(k.startswith("APIC") for k in tags.keys())
            except ID3NoHeaderError:
                pass

            tracks.append({
                "path": rel_path,
                "title": title,
                "artist": artist,
                "album": album,
                "duration": f"{duration_s // 60}:{duration_s % 60:02d}",
                "has_cover": has_cover,
            })
        except Exception:
            pass

    return {"tracks": tracks}


@app.get("/files/{path:path}")
def serve_file(path: str):
    target = (_DOWNLOADS_DIR / path).resolve()
    if not str(target).startswith(str(_DOWNLOADS_DIR.resolve())):
        return Response(status_code=403)
    if not target.exists() or not target.is_file():
        return Response(status_code=404)
    return FileResponse(str(target), media_type="audio/mpeg")


@app.get("/cover/{path:path}")
def serve_cover(path: str):
    from mutagen.id3 import ID3, ID3NoHeaderError

    target = (_DOWNLOADS_DIR / path).resolve()
    if not str(target).startswith(str(_DOWNLOADS_DIR.resolve())):
        return Response(status_code=403)
    if not target.exists():
        return Response(status_code=404)
    try:
        tags = ID3(str(target))
        for key in tags.keys():
            if key.startswith("APIC"):
                apic = tags[key]
                return Response(content=apic.data, media_type=apic.mime)
    except ID3NoHeaderError:
        pass
    except Exception:
        pass
    return Response(status_code=404)


# ── Frontend estático ────────────────────────────────────────────
if FRONTEND_BUILD.exists():
    app.mount(
        "/static",
        StaticFiles(directory=str(FRONTEND_BUILD / "static")),
        name="static",
    )

    @app.get("/")
    async def serve_root():
        return FileResponse(str(FRONTEND_BUILD / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        file = FRONTEND_BUILD / full_path
        if file.exists() and file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(FRONTEND_BUILD / "index.html"))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
