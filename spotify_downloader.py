#!/usr/bin/env python3
"""
spotify_downloader.py
─────────────────────
Descarrega uma playlist do Spotify como MP3 via YouTube.

Requisitos:
    pip install spotipy yt-dlp mutagen
    ffmpeg instalado e disponível no PATH

Configuração (variáveis de ambiente ou editar as constantes abaixo):
    SPOTIFY_CLIENT_ID      → https://developer.spotify.com/dashboard
    SPOTIFY_CLIENT_SECRET  → idem
"""

import os
import re
import sys
import time
import argparse
import logging
import threading
from pathlib import Path
from typing import Any, Callable, Optional

import requests as _req

# ──────────────────────────────────────────────
# Dependências externas
# ──────────────────────────────────────────────
def _load_dotenv() -> None:
    """Carrega variáveis do .env — procura no CWD e na pasta do script."""
    candidates = [Path(".env"), Path(__file__).parent / ".env"]
    for path in candidates:
        if path.exists():
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        os.environ.setdefault(key.strip(), value.strip())
            break

_load_dotenv()

try:
    import spotipy
    from spotipy.oauth2 import SpotifyClientCredentials
except ImportError:
    sys.exit("❌  Instala o spotipy:   pip install spotipy")

try:
    import yt_dlp
except ImportError:
    sys.exit("❌  Instala o yt-dlp:   pip install yt-dlp")

try:
    from mutagen.easyid3 import EasyID3
    from mutagen.id3 import ID3, APIC, error as MutagenError
    from mutagen.mp3 import MP3
    MUTAGEN_OK = True
except ImportError:
    MUTAGEN_OK = False
    print("⚠️  mutagen não encontrado — metadados ID3 serão ignorados.\n"
          "   Instala com:  pip install mutagen")

# ──────────────────────────────────────────────
# Configuração
# ──────────────────────────────────────────────
SPOTIFY_CLIENT_ID     = os.getenv("SPOTIFY_CLIENT_ID",     "COLOCA_AQUI_O_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "COLOCA_AQUI_O_CLIENT_SECRET")
SP_DC                 = os.getenv("SP_DC", "")

OUTPUT_DIR      = Path(__file__).parent / "downloads"  # pasta raiz de saída
AUDIO_QUALITY   = "192"                   # kbps do MP3 final
SEARCH_RETRIES  = 2                       # tentativas por fonte
SLEEP_BETWEEN   = 1.5                     # segundos entre downloads (cortesia)

# Fontes de pesquisa em cascata (tentadas por esta ordem até encontrar resultado)
# Valores válidos: "youtube", "soundcloud", "ytmusic"
SEARCH_SOURCES  = ["youtube", "soundcloud", "ytmusic"]

_SOURCE_PREFIXES = {
    "youtube":    "ytsearch1:",
    "soundcloud": "scsearch1:",
    "ytmusic":    "ytmsearch1:",
}

def _detect_tool(env_var: str, windows_default: str, linux_cmd: str) -> str:
    """Env var > default Windows > comando no PATH (Linux/Mac)."""
    import platform, shutil
    if val := os.getenv(env_var):
        return val
    if platform.system() == "Windows":
        return windows_default
    found = shutil.which(linux_cmd)
    return found or linux_cmd

FFMPEG_PATH = _detect_tool(
    "FFMPEG_PATH",
    (r"C:\Users\marcu\AppData\Local\Microsoft\WinGet\Packages"
     r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
     r"\ffmpeg-8.1-full_build\bin"),
    "ffmpeg",
)
YT_DLP_EXE = _detect_tool("YT_DLP_EXE", r"C:\Users\marcu\yt-dlp-new.exe", "yt-dlp")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════

def sanitize(name: str) -> str:
    """Remove caracteres inválidos em nomes de ficheiro/pasta."""
    name = re.sub(r'[\\/*?:"<>|]', "_", name)
    name = name.strip(". ")
    return name or "Desconhecido"


def build_output_path(artist: str, album: str, title: str) -> Path:
    """Constrói  OUTPUT_DIR / Artista / Álbum / Título.mp3"""
    folder = OUTPUT_DIR / sanitize(artist) / sanitize(album)
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{sanitize(title)}.mp3"


# ═══════════════════════════════════════════════════════════════
# Spotify — extracção de playlist
# ═══════════════════════════════════════════════════════════════

def get_spotify_client() -> spotipy.Spotify:
    if "COLOCA_AQUI" in SPOTIFY_CLIENT_ID:
        sys.exit(
            "❌  Define as variáveis de ambiente SPOTIFY_CLIENT_ID e "
            "SPOTIFY_CLIENT_SECRET\n"
            "   ou edita as constantes no topo do script."
        )
    auth = SpotifyClientCredentials(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
    )
    return spotipy.Spotify(auth_manager=auth)


def _get_web_player_token() -> Optional[str]:
    """Obtém token do web player Spotify via Playwright + cookie sp_dc (acesso total)."""
    import json as _json
    import time as _time

    if not SP_DC:
        return None

    cache_path = Path(__file__).parent / ".spotify_web_token"

    # Verificar cache em disco
    if cache_path.exists():
        try:
            data = _json.loads(cache_path.read_text())
            if data.get("expires_at", 0) > _time.time() + 60:
                log.info("Token web player em cache ainda válido.")
                return data["token"]
        except Exception:
            pass

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.error("playwright não instalado: pip install playwright && playwright install chromium")
        return None

    log.info("A iniciar browser para obter token Spotify (pode demorar ~5s)…")
    captured: dict = {}

    def _on_response(response: Any) -> None:
        if "open.spotify.com/api/token" in response.url:
            try:
                data = response.json()
                token = data.get("accessToken")
                if token:
                    captured["token"] = token
                    captured["expires_ms"] = data.get("accessTokenExpirationTimestampMs", 0)
            except Exception:
                pass

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context()
            ctx.add_cookies([{
                "name": "sp_dc", "value": SP_DC,
                "domain": ".spotify.com", "path": "/",
                "secure": True, "httpOnly": True,
            }])
            page = ctx.new_page()
            page.on("response", _on_response)
            page.goto("https://open.spotify.com/", timeout=30000)
            page.wait_for_timeout(5000)
            browser.close()
    except Exception as exc:
        log.error("Erro Playwright: %s", exc)
        return None

    token = captured.get("token")
    if not token:
        log.error("Token não capturado — sp_dc pode estar expirado.")
        return None

    # Guardar cache
    expires_ms = captured.get("expires_ms", 0)
    expires_at = (expires_ms / 1000) if expires_ms > 0 else (_time.time() + 3600)
    try:
        cache_path.write_text(_json.dumps({"token": token, "expires_at": expires_at}))
    except Exception:
        pass

    log.info("Token web player obtido com sucesso.")
    return token


def _get_oauth_token() -> Optional[str]:
    """Lê o token OAuth em cache e refresca-o se necessário."""
    import base64 as _b64
    import json as _json
    import time as _time

    cache_path = Path(__file__).parent / ".spotify_token_cache"
    if not cache_path.exists():
        cache_path = Path(__file__).parent.parent / ".spotify_token_cache"
    if not cache_path.exists():
        return None

    try:
        cache = _json.loads(cache_path.read_text())
        if cache.get("expires_at", 0) > _time.time() + 60:
            log.info("Token OAuth em cache ainda válido.")
            return cache["access_token"]

        refresh_token = cache.get("refresh_token")
        if not refresh_token or "COLOCA_AQUI" in SPOTIFY_CLIENT_ID:
            return None

        creds_b64 = _b64.b64encode(
            f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
        ).decode()
        r = _req.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {creds_b64}"},
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            timeout=10,
        )
        if r.status_code != 200:
            log.warning("Falha ao refrescar token OAuth (%d).", r.status_code)
            return None

        new_data = r.json()
        cache.update(new_data)
        cache["expires_at"] = _time.time() + new_data.get("expires_in", 3600)
        cache_path.write_text(_json.dumps(cache))
        log.info("Token OAuth refrescado com sucesso.")
        return new_data["access_token"]
    except Exception as exc:
        log.warning("Erro ao ler token OAuth: %s", exc)
        return None


def fetch_user_playlists() -> list[dict]:
    """Devolve as playlists do utilizador autenticado via OAuth token."""
    token = _get_oauth_token() or _get_web_player_token()
    if not token:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    playlists: list[dict] = []
    next_url: Optional[str] = "https://api.spotify.com/v1/me/playlists?limit=50"

    while next_url:
        try:
            r = _req.get(next_url, headers=headers, timeout=10)
            for _attempt in range(3):
                if r.status_code != 429:
                    break
                retry_after = int(r.headers.get("Retry-After", 10)) + 5
                log.warning("Rate limit — a aguardar %ds… (tentativa %d/3)", retry_after, _attempt + 1)
                time.sleep(retry_after)
                r = _req.get(next_url, headers=headers, timeout=10)
            if r.status_code != 200:
                log.error("Erro ao obter playlists (%d): %s", r.status_code, r.text[:200])
                break
            data = r.json()
            for p in (data.get("items") or []):
                if not p:
                    continue
                images = p.get("images") or []
                ext_urls = p.get("external_urls") or {}
                spotify_url = ext_urls.get("spotify", "")
                if not spotify_url:
                    continue
                # API retorna "items" (novo) ou "tracks" (legado) com .total
                items_info = p.get("items") or p.get("tracks") or {}
                total = items_info.get("total", 0) if isinstance(items_info, dict) else 0
                playlists.append({
                    "id":    p["id"],
                    "name":  p.get("name", "Sem nome"),
                    "total": total,
                    "url":   spotify_url,
                    "image": images[0]["url"] if images else None,
                })
            next_url = data.get("next")
        except Exception as exc:
            log.error("Erro ao paginar playlists: %s", exc)
            break

    log.info("✅  %d playlists encontradas.", len(playlists))
    return playlists


def _fetch_tracks_via_web_player(playlist_id: str) -> list[dict]:
    """
    Usa o Spotify web player (sessão do utilizador via sp_dc) para obter faixas.

    Fase 1 — Playwright: captura o token e o hash da query GraphQL persistida.
    Fase 2 — Python: faz chamadas paginadas diretas à API interna (sem UI, sem scroll).
    Sem restrições de Extended Access, sem rate limits da API pública.
    """
    if not SP_DC:
        log.warning("SP_DC não configurado — não é possível usar o web player.")
        return []

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.error("playwright não instalado")
        return []

    import json as _json

    # ── Fase 1: capturar token + hash da query via Playwright ────────────────
    captured: dict = {}

    def _on_request(request: Any) -> None:
        if "api-partner.spotify.com/pathfinder" not in request.url:
            return
        try:
            body_str = request.post_data or ""
            body_json = _json.loads(body_str) if body_str else {}
            op = body_json.get("operationName", "")
            if op == "fetchPlaylist" and "hash" not in captured:
                h = request.headers
                captured["token"] = h.get("authorization", "").replace("Bearer ", "")
                captured["client_token"] = h.get("client-token", "")
                captured["app_version"] = h.get("spotify-app-version", "1.0.0.0")
                captured["hash"] = body_json["extensions"]["persistedQuery"]["sha256Hash"]
        except Exception:
            pass

    log.info("A capturar sessão do web player para playlist %s…", playlist_id)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context()
            ctx.add_cookies([{
                "name": "sp_dc", "value": SP_DC,
                "domain": ".spotify.com", "path": "/",
                "secure": True, "httpOnly": True,
            }])
            page = ctx.new_page()
            page.on("request", _on_request)
            page.goto(
                f"https://open.spotify.com/playlist/{playlist_id}",
                timeout=30_000,
                wait_until="networkidle",
            )
            # Aguardar até capturar ou timeout
            for _ in range(30):
                if "hash" in captured:
                    break
                page.wait_for_timeout(500)
            page.wait_for_timeout(1_000)
            browser.close()
    except Exception as exc:
        log.error("Erro Playwright: %s", exc)
        return []

    if not captured.get("token") or not captured.get("hash"):
        log.error("Não foi possível capturar token/hash do web player.")
        return []

    log.info("Token e hash capturados — a paginar faixas via API interna…")

    # ── Fase 2: chamadas POST paginadas diretas à API interna ───────────────
    api_token = captured["token"]
    sha_hash = captured["hash"]
    req_headers = {
        "Authorization": f"Bearer {api_token}",
        "client-token": captured.get("client_token", ""),
        "spotify-app-version": captured.get("app_version", "1.0.0.0"),
        "App-Platform": "WebPlayer",
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json",
        "Accept-Language": "en",
        "Referer": "https://open.spotify.com/",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    }

    all_tracks: list[dict] = []
    seen: set[str] = set()
    offset = 0
    page_size = 100
    api_url = "https://api-partner.spotify.com/pathfinder/v2/query"

    while True:
        body = {
            "variables": {
                "uri": f"spotify:playlist:{playlist_id}",
                "offset": offset,
                "limit": page_size,
                "enableWatchFeedEntrypoint": True,
                "includeEpisodeContentRatingsV2": False,
            },
            "operationName": "fetchPlaylist",
            "extensions": {
                "persistedQuery": {"version": 1, "sha256Hash": sha_hash},
            },
        }
        try:
            r = _req.post(api_url, headers=req_headers, json=body, timeout=15)
            if r.status_code != 200:
                log.error("API interna retornou %d: %s", r.status_code, r.text[:200])
                break
            data = r.json()
            content = data.get("data", {}).get("playlistV2", {}).get("content", {})
            items = content.get("items", [])
            if not items:
                break
            for item in items:
                td = item.get("itemV2", {}).get("data", {})
                if td.get("__typename") not in ("Track", ""):
                    continue
                name = td.get("name", "")
                if not name:
                    continue
                artists = [
                    a.get("profile", {}).get("name", "")
                    for a in td.get("artists", {}).get("items", [])
                ]
                artist = ", ".join(a for a in artists if a)
                album_obj = td.get("albumOfTrack", {})
                album = album_obj.get("name", "")
                sources = album_obj.get("coverArt", {}).get("sources", [])
                cover_url = sources[0].get("url") if sources else None
                duration_ms = td.get("trackDuration", {}).get("totalMilliseconds")
                key = f"{name}|{artist}"
                if key not in seen and artist:
                    seen.add(key)
                    all_tracks.append({
                        "title":       name,
                        "artist":      artist,
                        "album":       album,
                        "cover_url":   cover_url,
                        "duration_ms": duration_ms,
                    })
            total_count = content.get("totalCount", 0)
            offset += len(items)
            log.info("  %d / %d faixas carregadas…", len(all_tracks), total_count)
            if offset >= total_count or not items:
                break
        except Exception as exc:
            log.error("Erro ao paginar: %s", exc)
            break

    log.info("✅  %d faixas obtidas via web player.", len(all_tracks))
    return all_tracks


def fetch_playlist_tracks(playlist_url: str) -> list[dict]:
    """Extrai faixas de uma playlist Spotify."""
    playlist_id = playlist_url.split("/playlist/")[-1].split("?")[0]
    log.info("A carregar playlist %s …", playlist_id)

    # Método principal: web player GraphQL (sem rate limits, sem Extended Access)
    if SP_DC:
        tracks = _fetch_tracks_via_web_player(playlist_id)
        if tracks:
            return tracks
        log.warning("Web player não devolveu faixas — a tentar API pública…")

    # Fallback: API pública com web player token (pode ter rate limit)
    token = _get_web_player_token() or _get_oauth_token()
    if not token:
        log.error("Sem token disponível.")
        return []

    headers = {"Authorization": f"Bearer {token}"}
    tracks: list[dict] = []
    url = f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit=100"

    while url:
        try:
            r = _req.get(url, headers=headers, timeout=15)
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 30)) + 5
                log.warning("Rate limit — a aguardar %ds…", wait)
                time.sleep(wait)
                r = _req.get(url, headers=headers, timeout=15)
            if r.status_code != 200:
                log.error("Spotify API retornou %d: %s", r.status_code, r.text[:300])
                break
            data = r.json()
            for item in (data.get("items") or []):
                track = item.get("track")
                if not track or track.get("type") != "track":
                    continue
                images = track.get("album", {}).get("images") or []
                tracks.append({
                    "title":       track.get("name") or "Desconhecido",
                    "artist":      ", ".join(a["name"] for a in track.get("artists", [])) or "Desconhecido",
                    "album":       track.get("album", {}).get("name") or "Desconhecido",
                    "cover_url":   images[0]["url"] if images else None,
                    "duration_ms": track.get("duration_ms"),
                })
            url = data.get("next")
        except Exception as exc:
            log.error("Erro ao paginar faixas: %s", exc)
            break

    log.info("✅  %d faixas encontradas na playlist.", len(tracks))
    return tracks


# ═══════════════════════════════════════════════════════════════
# Pesquisa multi-fonte + download
# ═══════════════════════════════════════════════════════════════

def _search_source(source: str, query: str) -> Optional[str]:
    """Pesquisa numa fonte específica. Devolve URL directa ou None."""
    import subprocess, json as _json
    prefix = _SOURCE_PREFIXES.get(source)
    if not prefix:
        return None
    try:
        result = subprocess.run(
            [YT_DLP_EXE, "--flat-playlist", "-j", "--no-warnings",
             f"{prefix}{query}"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            data = _json.loads(result.stdout.strip().splitlines()[0])
            url = data.get("webpage_url") or data.get("url")
            if url:
                return url
            vid_id = data.get("id")
            if vid_id and source in ("youtube", "ytmusic"):
                return f"https://www.youtube.com/watch?v={vid_id}"
    except Exception as exc:
        log.debug("_search_source(%s) erro: %s", source, exc)
    return None


def search_track(artist: str, title: str) -> Optional[str]:
    """Pesquisa em múltiplas fontes em cascata (SEARCH_SOURCES). Devolve a primeira URL encontrada."""
    query = f"{artist} {title} audio"
    for source in SEARCH_SOURCES:
        url = _search_source(source, query)
        if url:
            log.info("  Encontrado em %s", source)
            return url
        log.debug("  Não encontrado em %s — a tentar próxima fonte…", source)
    return None


def search_youtube(query: str) -> Optional[str]:
    """Compatibilidade — usa apenas YouTube (preferir search_track para multi-fonte)."""
    return _search_source("youtube", query)


def download_as_mp3(
    youtube_url: str,
    output_path: Path,
    cancel_event: Optional[threading.Event] = None,
) -> bool:
    """Descarrega o áudio e converte para MP3 via ffmpeg (usa yt-dlp-new.exe)."""
    import subprocess
    outtmpl = str(output_path.with_suffix("")) + ".%(ext)s"
    cmd = [
        YT_DLP_EXE,
        "-f", "bestaudio/best",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", AUDIO_QUALITY,
        "--no-warnings",
        "-o", outtmpl,
        youtube_url,
    ]
    # Só passa --ffmpeg-location se for um caminho explícito (não comando no PATH)
    if len(FFMPEG_PATH) > 20 or "/" in FFMPEG_PATH or "\\" in FFMPEG_PATH:
        cmd = cmd[:-1] + ["--ffmpeg-location", FFMPEG_PATH] + [cmd[-1]]
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        while proc.poll() is None:
            if cancel_event and cancel_event.is_set():
                proc.terminate()
                return False
            time.sleep(0.5)
        if proc.returncode != 0:
            err = (proc.stderr.read() if proc.stderr else "").strip()
            log.error("Erro ao descarregar %s → %s", youtube_url, err[:200])
            return False
        return output_path.exists()
    except Exception as exc:
        log.error("Erro ao descarregar %s → %s", youtube_url, exc)
        return False


# ═══════════════════════════════════════════════════════════════
# Metadados ID3
# ═══════════════════════════════════════════════════════════════

def write_id3_tags(mp3_path: Path, track: dict) -> None:
    """Escreve tags ID3 (título, artista, álbum) e capa do álbum."""
    if not MUTAGEN_OK:
        return

    try:
        audio = EasyID3(mp3_path)
    except MutagenError:
        audio = MP3(mp3_path)
        audio.add_tags()
        audio = EasyID3(mp3_path)

    audio["title"]  = track["title"]
    audio["artist"] = track["artist"]
    audio["album"]  = track["album"]
    audio.save()

    # capa do álbum (APIC)
    if track.get("cover_url"):
        try:
            import urllib.request
            with urllib.request.urlopen(track["cover_url"], timeout=10) as resp:
                cover_data = resp.read()

            tags = ID3(mp3_path)
            tags.add(APIC(
                encoding=3,
                mime="image/jpeg",
                type=3,          # Front cover
                desc="Cover",
                data=cover_data,
            ))
            tags.save()
        except Exception as exc:
            log.warning("Não foi possível adicionar a capa: %s", exc)


# ═══════════════════════════════════════════════════════════════
# Pipeline principal
# ═══════════════════════════════════════════════════════════════

def process_track(
    track: dict,
    idx: int,
    total: int,
    redownload: bool = False,
    cancel_event: Optional[threading.Event] = None,
) -> bool:
    title  = track["title"]
    artist = track["artist"]
    album  = track["album"]

    log.info("[%d/%d]  %s — %s", idx, total, artist, title)

    out_path = build_output_path(artist, album, title)
    if out_path.exists() and not redownload:
        log.info("  ↩️  Já existe, a saltar.")
        return True

    # 1. Usar URL pré-fornecida (import directo) ou pesquisar em múltiplas fontes
    yt_url = track.get("_yt_url") or None
    if not yt_url:
        for attempt in range(1, SEARCH_RETRIES + 1):
            yt_url = search_track(artist, title)
            if yt_url:
                break
            log.warning("  Tentativa %d/%d falhou, a retentar…", attempt, SEARCH_RETRIES)
            time.sleep(2)

    if not yt_url:
        log.error("  ❌  Não encontrado em nenhuma fonte: %s", f"{artist} {title}")
        return False

    log.info("  🔗  %s", yt_url)

    # 2. Download + conversão
    ok = download_as_mp3(yt_url, out_path, cancel_event=cancel_event)
    if not ok:
        log.error("  ❌  Falha no download de '%s'", title)
        return False

    # 3. Metadados ID3
    write_id3_tags(out_path, track)
    log.info("  ✅  Guardado em: %s", out_path)
    return True


def run_download(
    raw_tracks: list,
    output_dir: Path,
    quality: str,
    cancel_event: threading.Event,
    on_event: Callable[[dict], None],
    library_keys: Optional[set] = None,
) -> None:
    """Pipeline de download chamado pelo backend FastAPI."""
    global OUTPUT_DIR, AUDIO_QUALITY
    OUTPUT_DIR = output_dir
    AUDIO_QUALITY = quality

    total = len(raw_tracks)
    done = failed = skipped = 0

    for idx, track in enumerate(raw_tracks):
        if cancel_event.is_set():
            on_event({"type": "cancelled"})
            return

        on_event({"type": "track_start", "index": idx, "current": idx + 1, "total": total})

        # Verificar no DB por título+artista (mais fiável que só o path)
        track_key = f"{track['title'].lower()}|{track['artist'].lower()}"
        if library_keys and track_key in library_keys:
            skipped += 1
            on_event({"type": "track_done", "index": idx, "status": "skipped", "current": idx + 1, "total": total})
            continue

        out_path = build_output_path(track["artist"], track["album"], track["title"])
        if out_path.exists():
            skipped += 1
            on_event({"type": "track_done", "index": idx, "status": "skipped", "current": idx + 1, "total": total})
            continue

        # redownload=True: existência já verificada acima
        ok = process_track(track, idx + 1, total, redownload=True, cancel_event=cancel_event)

        if cancel_event.is_set():
            on_event({"type": "cancelled"})
            return

        status = "done" if ok else "failed"
        if ok:
            done += 1
        else:
            failed += 1
        on_event({"type": "track_done", "index": idx, "status": status, "current": idx + 1, "total": total})

        if idx < total - 1:
            time.sleep(SLEEP_BETWEEN)

    on_event({"type": "completed", "done": done, "failed": failed, "skipped": skipped, "total": total})


def main() -> None:
    global OUTPUT_DIR, AUDIO_QUALITY
    parser = argparse.ArgumentParser(
        description="Descarrega uma playlist do Spotify como MP3 via YouTube."
    )
    parser.add_argument("playlist_url", help="URL da playlist do Spotify")
    parser.add_argument(
        "-o", "--output", default=str(OUTPUT_DIR),
        help=f"Pasta de saída (default: {OUTPUT_DIR})",
    )
    parser.add_argument(
        "-q", "--quality", default=AUDIO_QUALITY,
        help=f"Qualidade do MP3 em kbps (default: {AUDIO_QUALITY})",
    )
    parser.add_argument(
        "--redownload", action="store_true", default=False,
        help="Força re-download de faixas já existentes",
    )
    args = parser.parse_args()

    OUTPUT_DIR    = Path(args.output)
    AUDIO_QUALITY = args.quality

    # Inicializa clientes
    sp     = get_spotify_client()
    tracks = fetch_playlist_tracks(sp, args.playlist_url)

    if not tracks:
        sys.exit("⚠️  A playlist está vazia ou não foi possível aceder.")

    total     = len(tracks)
    successes = 0
    failures  = []

    for idx, track in enumerate(tracks, start=1):
        ok = process_track(track, idx, total, redownload=args.redownload)
        if ok:
            successes += 1
        else:
            failures.append(f"{track['artist']} — {track['title']}")
        time.sleep(SLEEP_BETWEEN)

    # Relatório final
    print("\n" + "═" * 50)
    print(f"✅  Concluído:  {successes}/{total} faixas descarregadas")
    print(f"📁  Pasta:      {OUTPUT_DIR.resolve()}")
    if failures:
        print(f"\n❌  Falharam ({len(failures)}):")
        for f in failures:
            print(f"    • {f}")
    print("═" * 50)


if __name__ == "__main__":
    main()
