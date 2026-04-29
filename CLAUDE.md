# [CLAUDE.md](http://CLAUDE.md)

This file provides guidance to Claude Code ([claude.ai/code](http://claude.ai/code)) when working with code in this repository.

## Visão Geral

Descarregador de playlists Spotify como MP3 com UI React + API FastAPI.

**Fluxo:** React UI → POST /download → FastAPI → spotify_downloader.py → yt-dlp + ffmpeg → MP3

## Ferramentas do Sistema (Windows)

FerramentaCaminhoyt-dlp`C:\Users\marcu\yt-dlp-new.exe`ffmpeg`C:\Users\marcu\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe`Python`C:\Users\marcu\AppData\Local\Programs\Python\Python39\python.exe`

## Estrutura

```
spotify-downloader/
├── spotify_downloader.py   ← core: Spotify API + yt-dlp + ffmpeg
├── backend/
│   ├── main.py             ← FastAPI: /download, /progress (SSE), /status, /cancel
│   └── requirements.txt    ← fastapi, uvicorn, python-dotenv
├── frontend/src/
│   └── App.js              ← React: chama API, subscreve SSE (copiar para o repo)
├── .env                    ← SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET
├── start.bat               ← inicia backend + frontend
└── requirements.txt        ← spotipy, yt-dlp, mutagen
```

## Comandos

```bash
# Instalar dependências Python (core + backend)
pip install -r requirements.txt
pip install -r backend/requirements.txt

# Iniciar tudo de uma vez (Windows)
start.bat

# Ou manualmente:
# Backend (porta 8000)
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir backend/

# Frontend (porta 3000) — na pasta do repo clonado
cd ..\Spotify-Playlist-Downloader\frontend && npm start

# CLI standalone (sem UI)
python spotify_downloader.py "https://open.spotify.com/playlist/..." -o "D:/Música" -q 320
```

## Credenciais

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```

O `.env` é carregado automaticamente — o `_load_dotenv()` procura primeiro no CWD, depois na pasta do script.

## Arquitetura do Backend ([main.py](http://main.py))

EndpointMétodoDescrição`/download`POSTBusca playlist Spotify, devolve tracks com `id`/`cover`/`duration`, inicia thread de download`/progress`GETSSE: emite eventos `track_start`, `track_done`, `completed`, `cancelled/status`GETEstado atual (`idle`/`fetching`/`downloading`/`completed`)`/cancel`POSTSinaliza `threading.Event` para cancelar

**Thread model:** download corre em `threading.Thread(daemon=True)`. Eventos são enviados via `loop.call_soon_threadsafe` para `asyncio.Queue`, consumida pelo gerador SSE.

**Formato SSE:**

```json
{"type": "track_start", "index": 0, "current": 1, "total": 20}
{"type": "track_done",  "index": 0, "status": "done|failed|skipped", "current": 1, "total": 20}
{"type": "completed",   "done": 18, "failed": 1, "skipped": 1, "total": 20}
{"type": "cancelled"}
```

## Arquitetura do spotify_downloader.py

FunçãoResponsabilidade`get_spotify_client()`Auth Spotify via Client Credentials`fetch_playlist_tracks()`Pagina playlist, devolve lista com `title/artist/album/cover_url/duration_mssearch_youtube()ytsearch1: artista título audio` via yt-dlp`download_as_mp3()`Download + FFmpeg → MP3; aceita `cancel_event` via progress hook`write_id3_tags()`Tags EasyID3 + capa APIC com mutagen`build_output_path()`Sanitiza nomes → `OUTPUT_DIR/Artista/Álbum/Título.mp3process_track()`Pipeline por faixa; aceita `cancel_eventrun_download()`Loop de download para o backend: emite eventos SSE, verifica cancelamento`main()`CLI argparse standalone

## Arquitetura do Frontend (App.js)

- `handleStart()` → `POST /download` → recebe tracks → subscreve `EventSource(/progress)`
- SSE `track_start` → `setActiveIndex` + `setStatuses({id: "downloading"})`
- SSE `track_done` → `setStatuses({id: "done|failed|skipped"})`
- SSE `completed` → transição para fase "completed"
- `handleCancel()` → `POST /cancel` + fecha EventSource

## Constantes Configuráveis (spotify_downloader.py)

ConstanteDefaultDescrição`AUDIO_QUALITY"192"`kbps do MP3 (overridden pelo backend)`SEARCH_RETRIES3`Tentativas YouTube`SLEEP_BETWEEN1.5`Pausa entre downloads (s)

## start.bat

Ajustar `FRONTEND_DIR` no topo do ficheiro para o caminho correto do repo clonado.

## Convenções

- Type hints onde aplicável (Python 3.9+: `Optional[X]` em vez de `X | None`)
- `logging` stdlib no downloader, `uvicorn` logs no backend
- Variáveis em inglês, comentários em PT-PT
- Para verbose do yt-dlp: mudar `quiet=False` em `download_as_mp3()`
