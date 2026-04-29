# CHANGELOG

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
