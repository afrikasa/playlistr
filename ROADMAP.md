# ROADMAP — Playlistr

## Concluído (v1.1.x)

- [x] Endpoint `/files/{path}` para servir MP3s locais via HTTP
- [x] Scan da pasta downloads/ e endpoint GET /library (lista faixas descarregadas)
- [x] Player de áudio na UI — barra inferior com play/pause/anterior/seguinte, scrubber, volume
- [x] Vista Biblioteca — Todas / Artistas / Álbuns / Playlists
- [x] Artistas: foto do Spotify, hierarquia Artista → Álbum → Faixas
- [x] Playlists locais — criar, renomear, apagar, adicionar/remover faixas
- [x] Frontend migrado para repo único, npm start arranca tudo

## Concluído (v1.2.0)

- [x] SQLite para persistência local (biblioteca indexada)
- [x] Sync inteligente — salta faixas já existentes no DB por título+artista
- [x] Auto-sync agendado — playlists guardadas com intervalo configurável e sync manual

## Concluído (v1.x)

- [x] Vista por artista e álbum com navegação (drill-down Artista → Álbum → Faixas)

## Concluído (v2.0.0)

- [x] Shuffle e repeat
- [x] Fila de reprodução com drag & drop
- [x] UI mobile-friendly

## Futuro (comercial / v3.0.0)

- [ ] Importar playlists do Windows Media Player / iTunes
