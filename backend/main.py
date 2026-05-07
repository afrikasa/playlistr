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
import time
from pathlib import Path
from typing import Any, Optional

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
import db as _db

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

FRONTEND_BUILD = Path(__file__).parent.parent / "frontend" / "build"

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


_auto_sync_lock = threading.Lock()


def _run_auto_sync(playlist: dict) -> None:
    if not _auto_sync_lock.acquire(blocking=False):
        log.info("Sync já em curso, a saltar '%s'", playlist["name"])
        return
    try:
        log.info("Auto-sync a iniciar: '%s'", playlist["name"])
        tracks = sd.fetch_playlist_tracks(playlist["url"])
        if not tracks:
            _db.update_sync_result(playlist["id"], 0)
            return
        cancel = threading.Event()
        new_tracks = 0

        def _on_event(evt: dict) -> None:
            nonlocal new_tracks
            if evt.get("type") == "track_done" and evt.get("status") == "done":
                new_tracks += 1

        sd.run_download(
            raw_tracks=tracks,
            output_dir=_DOWNLOADS_DIR,
            quality="192",
            cancel_event=cancel,
            on_event=_on_event,
            library_keys=_db.get_track_keys(),
        )
        _db.scan_and_index(_DOWNLOADS_DIR)
        _db.update_sync_result(playlist["id"], new_tracks)
        log.info("Auto-sync concluído '%s': %d faixas novas", playlist["name"], new_tracks)
    except Exception as exc:
        log.error("Erro ao sincronizar '%s': %s", playlist["name"], exc)
    finally:
        _auto_sync_lock.release()


def _sync_scheduler_loop() -> None:
    while True:
        time.sleep(3600)
        try:
            due = _db.get_sync_playlists_due()
            for pl in due:
                threading.Thread(target=_run_auto_sync, args=(pl,), daemon=True).start()
        except Exception as exc:
            log.error("Erro no scheduler de sync: %s", exc)


@app.on_event("startup")
async def _startup() -> None:
    global _loop, _queue
    _loop = asyncio.get_event_loop()
    _queue = asyncio.Queue()
    _db.init_db(_DOWNLOADS_DIR / "library.db")
    threading.Thread(target=lambda: _db.scan_and_index(_DOWNLOADS_DIR), daemon=True).start()
    threading.Thread(target=_sync_scheduler_loop, daemon=True).start()


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
            library_keys=_db.get_track_keys(),
        )
        _db.scan_and_index(_DOWNLOADS_DIR)

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


_artist_image_cache: dict[str, str] = {}


@app.get("/artist-image")
def get_artist_image(name: str):
    if name in _artist_image_cache:
        return {"url": _artist_image_cache[name]}
    sp = _get_sp_client()
    if not sp:
        return {"url": None}
    try:
        results = sp.search(q=f"artist:{name}", type="artist", limit=1)
        items = results.get("artists", {}).get("items", [])
        if items and items[0].get("images"):
            url = items[0]["images"][0]["url"]
            _artist_image_cache[name] = url
            return {"url": url}
    except Exception:
        pass
    _artist_image_cache[name] = None
    return {"url": None}


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


# ── Playlists locais ──────────────────────────────────────────────
_PLAYLISTS_FILE = _DOWNLOADS_DIR / "playlists.json"


def _read_playlists() -> list:
    if not _PLAYLISTS_FILE.exists():
        return []
    try:
        return json.loads(_PLAYLISTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _write_playlists(data: list) -> None:
    _PLAYLISTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class PlaylistCreate(BaseModel):
    name: str


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    tracks: Optional[list[str]] = None


@app.get("/local-playlists")
def list_local_playlists():
    return {"playlists": _read_playlists()}


@app.post("/local-playlists")
def create_local_playlist(body: PlaylistCreate):
    import uuid, datetime
    playlists = _read_playlists()
    new = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "created_at": datetime.datetime.utcnow().isoformat(),
        "tracks": [],
    }
    playlists.append(new)
    _write_playlists(playlists)
    return new


@app.put("/local-playlists/{pid}")
def update_local_playlist(pid: str, body: PlaylistUpdate):
    playlists = _read_playlists()
    for p in playlists:
        if p["id"] == pid:
            if body.name is not None:
                p["name"] = body.name.strip()
            if body.tracks is not None:
                p["tracks"] = body.tracks
            _write_playlists(playlists)
            return p
    return Response(status_code=404)


@app.delete("/local-playlists/{pid}")
def delete_local_playlist(pid: str):
    playlists = _read_playlists()
    playlists = [p for p in playlists if p["id"] != pid]
    _write_playlists(playlists)
    return {"ok": True}


# ── Sync agendado ────────────────────────────────────────────────
class SyncPlaylistBody(BaseModel):
    id: str
    name: str
    url: str
    image: Optional[str] = None
    auto_sync: bool = False
    interval_h: int = 24


class SyncPlaylistUpdate(BaseModel):
    auto_sync: Optional[bool] = None
    interval_h: Optional[int] = None


@app.get("/sync-playlists")
def list_sync_playlists():
    return {"playlists": _db.get_sync_playlists()}


@app.post("/sync-playlists")
def add_sync_playlist(body: SyncPlaylistBody):
    return _db.upsert_sync_playlist(
        body.id, body.name, body.url, body.image, int(body.auto_sync), body.interval_h
    )


@app.put("/sync-playlists/{pid}")
def update_sync_playlist(pid: str, body: SyncPlaylistUpdate):
    pl = _db.get_sync_playlist(pid)
    if not pl:
        return Response(status_code=404)
    auto_sync = int(body.auto_sync) if body.auto_sync is not None else pl["auto_sync"]
    interval_h = body.interval_h if body.interval_h is not None else pl["interval_h"]
    return _db.upsert_sync_playlist(pl["id"], pl["name"], pl["url"], pl["image"], auto_sync, interval_h)


@app.delete("/sync-playlists/{pid}")
def delete_sync_playlist_endpoint(pid: str):
    _db.delete_sync_playlist(pid)
    return {"ok": True}


@app.post("/sync-playlists/{pid}/sync")
def trigger_sync(pid: str):
    pl = _db.get_sync_playlist(pid)
    if not pl:
        return Response(status_code=404)
    threading.Thread(target=_run_auto_sync, args=(pl,), daemon=True).start()
    return {"ok": True}


# ── Biblioteca local ──────────────────────────────────────────────
class LikeBody(BaseModel):
    path: str
    liked: bool


@app.get("/library")
def get_library():
    return {"tracks": _db.get_all_tracks()}


@app.patch("/library/like")
def toggle_like(body: LikeBody):
    _db.set_liked(body.path, body.liked)
    return {"ok": True}


class PlayBody(BaseModel):
    path: str


@app.post("/library/play")
def record_play(body: PlayBody):
    _db.increment_play(body.path)
    return {"ok": True}


@app.get("/library/recently-played")
def recently_played():
    return {"tracks": _db.get_recently_played()}


@app.get("/library/most-played")
def most_played():
    return {"tracks": _db.get_most_played()}


@app.get("/library/stats")
def get_library_stats():
    return _db.get_stats()


@app.post("/library/scan")
def scan_library():
    threading.Thread(target=lambda: _db.scan_and_index(_DOWNLOADS_DIR), daemon=True).start()
    return {"ok": True}


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
        return FileResponse(
            str(FRONTEND_BUILD / "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    @app.get("/sw.js")
    async def serve_sw():
        return FileResponse(
            str(FRONTEND_BUILD / "sw.js"),
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )

    @app.get("/reset-app")
    async def reset_app():
        html = """<!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>A atualizar...</title>
        <style>body{background:#111;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px}
        .spin{width:40px;height:40px;border:3px solid #333;border-top-color:#1DB954;border-radius:50%;animation:s 1s linear infinite}
        @keyframes s{to{transform:rotate(360deg)}}</style></head>
        <body><div class="spin"></div><p>A atualizar a app...</p>
        <script>
        async function reset() {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map(r => r.unregister()));
            }
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
            location.replace('/');
        }
        reset();
        </script></body></html>"""
        return Response(content=html, media_type="text/html")

    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        file = FRONTEND_BUILD / full_path
        if file.exists() and file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(FRONTEND_BUILD / "index.html"))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
