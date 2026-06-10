# Storage Backends Multi-Provider — Playlistr

Este documento descreve como configurar e usar os backends de armazenamento em nuvem/remoto no Playlistr.

## Visão Geral

Após descarregar uma playlist, o Playlistr pode fazer upload automaticamente dos MP3s para múltiplos destinos:

- **Google Drive** — Pasta compartilhada com estrutura `Playlistr/{artist}/{album}/{title}.mp3`
- **Dropbox** — Mesmo padrão de pastas
- **OneDrive** — Microsoft Graph API
- **Telegram** — Enviar áudio para um chat/canal privado
- **SMB** — Windows shares (`\\host\share`)
- **SFTP** — Servidores SSH/SFTP

## Arquitectura

```
backend/
├── storage_backends/
│   ├── __init__.py
│   ├── base.py                # Classes base abstractas
│   ├── gdrive.py              # Google Drive
│   ├── dropbox_backend.py     # Dropbox
│   ├── onedrive.py            # OneDrive
│   ├── telegram_backend.py    # Telegram
│   └── smb_sftp.py            # SMB + SFTP
├── credentials.py             # Gestão de credenciais (encriptadas)
├── storage_manager.py         # Gestor centralizado
└── main.py                    # Endpoints FastAPI
```

### Fluxo de Upload

1. **POST /download** — inicia download
2. Para cada faixa bem-sucedida:
   - Download e conversão MP3
   - **Trigger**: `upload_to_all()` em background
   - Upload paralelo para até 3 backends
3. **Resultado**: Registado no SSE ou erro silencioso (não interrompe download)

## Configuração de Providers

### 1. Google Drive

#### Pré-requisitos

1. Criar conta Google Cloud Console: https://console.cloud.google.com
2. Criar projecto novo
3. Activar "Google Drive API"
4. Criar credenciais:
   - Tipo: "Credencial OAuth 2.0" → "Aplicação Web"
   - URIs de redireccção autorizado: `http://localhost:8000/storage/auth/gdrive/callback`
   - Descarregar como `credentials.json`

#### Variáveis de Ambiente (`.env`)

```env
GDRIVE_CLIENT_ID=xxx.apps.googleusercontent.com
GDRIVE_CLIENT_SECRET=your-secret
```

#### Conectar via API

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{"provider":"gdrive","name":"pessoal","enabled":true}'
```

### 2. Dropbox

#### Pré-requisitos

1. Criar app em https://www.dropbox.com/developers/apps
2. Tipo: "Scoped app" → "Full Dropbox"
3. Permissões: "files.content.write"

#### Variáveis de Ambiente (`.env`)

```env
DROPBOX_APP_KEY=your-app-key
DROPBOX_APP_SECRET=your-app-secret
```

#### Conectar

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{"provider":"dropbox","name":"principal","enabled":true}'
```

### 3. OneDrive

#### Pré-requisitos

1. Registar app em https://portal.azure.com (Entra ID)
2. Tipo: "Aplicação Web"
3. Permissões: `files.readwrite.all`

#### Variáveis de Ambiente (`.env`)

```env
ONEDRIVE_CLIENT_ID=your-client-id
```

#### Conectar

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{"provider":"onedrive","name":"pessoal","enabled":true}'
```

### 4. Telegram

#### Pré-requisitos

1. Criar bot via @BotFather em Telegram
2. Obter `bot_token`
3. Obter `chat_id` (pode ser ID de canal privado ou chat directo)

#### Conectar

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"telegram",
    "name":"backup",
    "enabled":true,
    "bot_token":"123456:ABC...",
    "chat_id":"-1001234567890"
  }'
```

### 5. SMB (Windows Shares)

#### Conectar

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"smb",
    "name":"nas",
    "enabled":true,
    "smb_host":"192.168.1.100",
    "smb_user":"utilizador",
    "smb_password":"senha",
    "smb_share":"musica",
    "smb_path":"Playlistr"
  }'
```

### 6. SFTP

#### Conectar (com password)

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"sftp",
    "name":"servidor",
    "enabled":true,
    "sftp_host":"sftp.example.com",
    "sftp_port":22,
    "sftp_user":"utilizador",
    "sftp_password":"senha",
    "sftp_path":"/home/user/musica"
  }'
```

#### Conectar (com chave privada)

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"sftp",
    "name":"servidor-key",
    "enabled":true,
    "sftp_host":"sftp.example.com",
    "sftp_port":22,
    "sftp_user":"utilizador",
    "sftp_key_path":"/home/user/.ssh/id_rsa",
    "sftp_path":"/home/user/musica"
  }'
```

## Endpoints da API

### Listar Providers

```bash
GET /storage/providers
```

Resposta:

```json
{
  "providers": [
    {
      "id": "gdrive:pessoal",
      "provider": "gdrive",
      "name": "pessoal",
      "display_name": "Google Drive (pessoal)",
      "connected": true,
      "enabled": true
    }
  ]
}
```

### Conectar Provider

```bash
POST /storage/providers/connect
Content-Type: application/json

{
  "provider": "gdrive",
  "name": "pessoal",
  "enabled": true,
  "access_token": "...",
  "refresh_token": "..."
}
```

### Desconectar Provider

```bash
POST /storage/providers/{provider}/{name}/disconnect
```

### Testar Provider

```bash
POST /storage/providers/{provider}/{name}/test
```

Resposta: `{"ok": true, "connected": true}`

### Autenticar Provider (OAuth)

```bash
POST /storage/providers/{provider}/{name}/authenticate
```

## Encriptação de Credenciais

As credenciais são guardadas em `~/.playlistr/backends.json` encriptadas com Fernet.

- **Chave**: Derivada de `SECRET_KEY` (`.env`) ou gerada em `~/.playlistr/.key`
- **Permissões**: `.key` com modo `0o600` (apenas utilizador)
- **Rotação**: Alterar `SECRET_KEY` invalida todas as credenciais (gerar novas)

## Fluxo de Download + Upload

1. **POST /download** com URL da playlist
2. Backend obtém faixas
3. Para cada faixa:
   - Emite `track_start`
   - Download + conversão MP3
   - **Se sucesso**: dispara uploads em background (paralelamente, max 3)
   - Emite `track_done` com status `done`
4. **POST /cancel**: cancela downloads, não cancela uploads já em cours

## Troubleshooting

### "Provider não encontrado"
Verificar se está instalada a dependência certa e se o `.env` tem as credenciais.

### "Backend não conectado"
Executar `POST /storage/providers/{provider}/{name}/test` para verificar status.

### "Token expirado"
Para OAuth (Google Drive, OneDrive, Dropbox):
- Implementar refresh automático (já feito em `gdrive.py`)
- Ou reconectar manualmente: `POST /storage/providers/{provider}/{name}/authenticate`

### Uploads falhados não interrompem downloads
Por design — se um backend falhar, continua-se com os outros. Logar para diagnosticar.

## Performance

- **Upload paralelo**: Máximo 3 workers simultâneos (ThreadPoolExecutor)
- **Download local**: Síncrono (yt-dlp + ffmpeg)
- **Uploads**: Assíncronos em background (não bloqueia SSE)
- **Timeout**: 30s por upload

## Segurança

1. **Nunca logar credenciais** — verificar `log.error()` não inclui tokens
2. **HTTPS recomendado** em produção
3. **Encriptação em repouso** — Fernet em disco
4. **Encriptação em trânsito** — Google Drive, Dropbox, OneDrive, SFTP over TLS

## Extensão para Novos Providers

Criar novo ficheiro `backend/storage_backends/novo_provider.py`:

```python
from storage_backends.base import StorageBackend, StorageConfig

class NovoBackend(StorageBackend):
    async def authenticate(self) -> bool:
        # Implementar autenticação
        pass

    async def upload(self, local_path: Path, track_meta: dict, progress_callback=None) -> bool:
        # Implementar upload
        pass

    def is_connected(self) -> bool:
        return self.connected

    @property
    def display_name(self) -> str:
        return f"Novo Provider ({self.config.name})"
```

Depois registar em `storage_manager.py`:

```python
from storage_backends.novo_provider import NovoBackend

_PROVIDER_CLASSES = {
    ...
    "novo": NovoBackend,
}
```

## Logs

Verificar em:

```bash
# Terminal onde corre o backend
tail -f /var/log/playlistr.log

# Windows
Get-Content "C:\Users\marcu\Desktop\spotify-downloader\logs\backend.log" -Tail 50
```
