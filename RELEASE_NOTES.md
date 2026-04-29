# RELEASE NOTES

Versao actual: 1.0.0 | Data: 29 de Abril de 2026

## Novidades desta versao

Primeiro release funcional do Playlistr. Abre o browser, escolhes uma playlist da tua conta Spotify no dropdown (ou colas qualquer URL publico), clicas Start Download e os MP3 ficam organizados por artista e album na pasta de downloads. Sem limites de rate, sem necessidade de Extended Access da Spotify API.

## Como funciona

- Autenticacao: OAuth Spotify (token em cache, renovado automaticamente)
- Faixas: web player interno do Spotify via Playwright — os mesmos dados que o browser usa
- Download: yt-dlp pesquisa o YouTube e descarrega como MP3 com tags ID3 e capa do album

## Historico

| Versao | Data       | Descricao             |
|--------|------------|-----------------------|
| 1.0.0  | 2026-04-29 | Primeiro release      |
