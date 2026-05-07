# CHANGELOG

## [2.2.0] - 2026-05-07

### Adicionado
- PWA: manifest completo, Service Worker com cache-first strategy para funcionar offline
- Tab "Local" na Biblioteca: abre pasta do telemóvel via File System Access API, persiste handle em IndexedDB entre sessões
- Multi-backend: campo "Servidor" nas Definições para configurar URL remoto (Tailscale/IP)
- Modo offline: biblioteca guardada em localStorage, carregada automaticamente quando servidor inacessível
- Banner "Servidor offline" na app e na Biblioteca quando o backend não responde
- Download de faixas para o telemóvel: opção no menu de contexto cria `<a download>` com o MP3
- `start.bat` configura Tailscale Serve automaticamente (reset + serve 8000) e mostra URL do telemóvel

### Corrigido
- `API` undefined em App.js na chamada `/download` (era `apiBase`)
- Service Worker v3: substituído `addAll` por fetches individuais — instalação nunca aborta por um asset em falta
- Verificação de estado do servidor a cada 30s com timeout de 3s

---

## [2.1.0] - 2026-05-03

### Adicionado
- Equalizador Web Audio API: bass (lowshelf 200 Hz) / mid (peaking 1 kHz) / treble (highshelf 8 kHz), sliders verticais, presets (plano/baixos/agudos/vocal)
- Visualizador de áudio: canvas com 40 barras FFT via AnalyserNode
- Crossfade configurável nas Definições (0 / 1 / 2 / 3 / 5 s)
- Sleep timer: cicla 0 → 15 → 30 → 45 → 60 min (ícone Moon)
- Atalhos de teclado: Space, ←/→, M, Escape
- Título do separador: `♪ Artista — Título` durante reprodução
- Ordenação na Biblioteca: Artista / A-Z / Reproduções / Recentes
- Vista Stats: faixas, artistas, reproduções, duração, favoritas, top 5 faixas e artistas
- Vista Definições: crossfade, qualidade padrão
- PlaylistCover: mosaico 2×2 de capas das faixas

---

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
