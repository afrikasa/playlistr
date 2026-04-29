# ROADMAP — Playlistr

## Concluído (v1.1.x)

- [x] Endpoint `/files/{path}` para servir MP3s locais via HTTP
- [x] Scan da pasta downloads/ e endpoint GET /library (lista faixas descarregadas)
- [x] Player de áudio na UI — barra inferior com play/pause/anterior/seguinte, scrubber, volume
- [x] Vista Biblioteca — Todas / Artistas / Álbuns / Playlists
- [x] Artistas: foto do Spotify, hierarquia Artista → Álbum → Faixas
- [x] Playlists locais — criar, renomear, apagar, adicionar/remover faixas
- [x] Frontend migrado para repo único, npm start arranca tudo

## Próximo (v1.2.0)

- [ ] SQLite para persistência local (biblioteca indexada, histórico)
- [ ] Sync inteligente — ao descarregar playlist Spotify, saltar faixas já existentes localmente
- [ ] Auto-sync agendado — verificar playlists Spotify e descarregar novas faixas automaticamente

## Futuro (v2.0.0)

- [ ] Vista por artista e album com navegacao
- [ ] Fila de reproducao com drag & drop
- [ ] Shuffle e repeat
- [ ] UI mobile-friendly
- [ ] Importar playlists locais do Windows Media Player / iTunes
