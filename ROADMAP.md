# ROADMAP — Playlistr

## Para agora (v1.1.0)

- [ ] Endpoint `/files/{path}` para servir MP3s locais via HTTP
- [ ] Scan da pasta downloads/ e endpoint GET /library (lista faixas descarregadas)
- [ ] Player de audio na UI — barra inferior com play/pause/anterior/seguinte, scrubber, volume
- [ ] Vista Biblioteca — grid/lista de todas as faixas locais com capa, artista, album

## Proximo (v1.2.0)

- [ ] SQLite para persistencia local (playlists, biblioteca indexada)
- [ ] Playlists locais — criar, editar, apagar, adicionar/remover faixas
- [ ] Sync inteligente — ao descarregar playlist Spotify, saltar faixas ja existentes localmente
- [ ] Auto-sync agendado — verificar playlists Spotify e descarregar novas faixas automaticamente

## Futuro (v2.0.0)

- [ ] Vista por artista e album com navegacao
- [ ] Fila de reproducao com drag & drop
- [ ] Shuffle e repeat
- [ ] UI mobile-friendly
- [ ] Importar playlists locais do Windows Media Player / iTunes
