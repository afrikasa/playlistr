# CHANGELOG

## [2.0.0] - 2026-05-01

### Adicionado
- Shuffle: baralha a fila de reprodução mantendo a faixa actual em primeiro; botão fica verde quando activo
- Repeat: cicla entre desligado → repetir tudo → repetir uma faixa; ícone `Repeat1` quando em modo "uma faixa"
- Fila de reprodução: painel deslizante acima do player com todas as faixas em ordem
- Drag & drop na fila para reordenar faixas; clique para saltar directamente para uma faixa
- Faixa actual destacada a verde com animação de barras na fila
- UI mobile-friendly: layout responsivo para ecrãs pequenos
  - Player: track info mais estreita, volume slider oculto em mobile
  - ModeToggle: labels abreviados em mobile (All/Art./Álb./PL)
  - Sync cards: wrap em mobile para não sobrepor botões ao nome
  - Removido `minWidth` fixo que bloqueava layouts estreitos

---

## [1.2.0] - 2026-04-30

### Adicionado
- SQLite (`downloads/library.db`) para indexar biblioteca — `/library` instantâneo, sem varrer ficheiros a cada chamada
- Scan automático no arranque do servidor + após cada download
- Endpoint `POST /library/scan` para re-scan manual
- Sync inteligente: ao descarregar, verifica DB por título+artista antes de ir ao YouTube
- Auto-sync agendado: playlists guardadas com toggle on/off, intervalo configurável (6h/12h/24h/48h)
- Endpoints CRUD `/sync-playlists` + `POST /sync-playlists/{id}/sync`
- Secção "Playlists Guardadas" na tab Download com botão Guardar, Sync agora, Remover
- `start.bat` recompila sempre o frontend e abre o browser automaticamente
- Header `Cache-Control: no-cache` no `index.html` para evitar browser cache após actualizações

---

## [1.1.2] - 2026-04-29

### Adicionado
- Favicon SVG verde com nota musical, título da aba alterado para "Playlistr"

### Corrigido
- Player: clicar noutra faixa mudava UI mas não o áudio (fix com key remount)
- npm start abria duas janelas do browser (removido withVisualEdits do Emergent)

### Removido
- Badge "Made with Emergent" e tracking PostHog do index.html

---

## [1.1.1] - 2026-04-29

### Adicionado
- Playlists locais: criar, renomear, apagar
- Adicionar e remover faixas de uma playlist com pesquisa
- Persistência em `downloads/playlists.json`
- Endpoints `/local-playlists` CRUD no backend

---

## [1.1.0] - 2026-04-29

### Adicionado
- Player de áudio global na barra inferior (play/pause, anterior/seguinte, scrubber, volume, fechar)
- Vista Biblioteca com 4 modos: Todas, Artistas, Álbuns, Playlists
- Modo Artistas: foto do Spotify em círculo, hierarquia Artista → Álbum → Faixas
- Agrupamento por artista principal (features com outros artistas agrupam no artista principal)
- Endpoints `/library`, `/files/{path}`, `/cover/{path}` para servir MP3s e capas locais
- Endpoint `/artist-image` para ir buscar foto do artista ao Spotify (com cache)
- Frontend migrado para repo único (`spotify-downloader/frontend/`)
- `npm start` arranca backend (uvicorn --reload) + frontend (hot reload) em simultâneo

---

## [1.0.0] - 2026-04-29

### Adicionado
- Dropdown com playlists da conta Spotify do utilizador (OAuth token via spotipy)
- Obtencao de faixas via web player Spotify: Playwright intercepta GraphQL interno (sem Extended Access, sem rate limits)
- Paginacao completa de playlists grandes (testado com 393 faixas)
- Endpoint GET /playlists no backend FastAPI
- Endpoint POST /open-folder abre pasta de downloads no Explorer
- Botao Open Folder funcional na UI apos conclusao do download

### Corrigido
- Pesquisa YouTube corrigida: prefixo ytsearch1: direto em vez de default_search
- Download MP3 usa yt-dlp-new.exe (v2026.03.17) via subprocess, evitando HTTP 403 do modulo Python desatualizado
- fetch_user_playlists usa OAuth token (200 OK) em vez de web player token (429)
- Campo items.total em vez de tracks.total na resposta /me/playlists (mudanca API Spotify)
- Filtragem de items sem URL Spotify valido (podcast shows)
