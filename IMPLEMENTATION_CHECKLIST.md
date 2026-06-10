# Storage Backends Multi-Provider — Checklist de Implementação

## Ficheiros Criados

### Core System
- [x] `backend/storage_backends/__init__.py` — Package marker
- [x] `backend/storage_backends/base.py` — Classes base abstractas
- [x] `backend/credentials.py` — Gestão encriptada de credenciais (Fernet)
- [x] `backend/storage_manager.py` — Gestor singleton centralizado

### Providers Implementados
- [x] `backend/storage_backends/gdrive.py` — Google Drive (OAuth2)
- [x] `backend/storage_backends/dropbox_backend.py` — Dropbox (OAuth2 PKCE)
- [x] `backend/storage_backends/onedrive.py` — OneDrive (Microsoft Graph)
- [x] `backend/storage_backends/telegram_backend.py` — Telegram (Bot API)
- [x] `backend/storage_backends/smb_sftp.py` — SMB + SFTP

### Backend Integration
- [x] `backend/main.py` — 5 novos endpoints para storage
  - `GET /storage/providers` — Listar backends
  - `POST /storage/providers/connect` — Adicionar/actualizar
  - `POST /storage/providers/{provider}/{name}/disconnect` — Remover
  - `POST /storage/providers/{provider}/{name}/test` — Testar conexão
  - `POST /storage/providers/{provider}/{name}/authenticate` — OAuth
- [x] Integração com `/download` — Uploads automáticos após sucesso

### Dependências
- [x] `backend/requirements.txt` — Atualizado com:
  - cryptography
  - google-api-python-client
  - google-auth-oauthlib
  - dropbox
  - msal
  - python-telegram-bot
  - paramiko
  - smbprotocol
  - aiohttp

### Documentação
- [x] `STORAGE_BACKENDS_README.md` — Guia completo
- [x] `STORAGE_BACKENDS_ENV_EXAMPLE` — Exemplo de variáveis

## Fluxo de Funcionamento

### 1. Configuração Inicial

```bash
# Instalar dependências
pip install -r backend/requirements.txt

# Configurar .env (variáveis OAuth)
cat > .env << EOF
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
GDRIVE_CLIENT_ID=...
GDRIVE_CLIENT_SECRET=...
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
ONEDRIVE_CLIENT_ID=...
EOF
```

### 2. Adicionar Backend (API)

```bash
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"gdrive",
    "name":"pessoal",
    "enabled":true,
    "access_token":"...",
    "refresh_token":"..."
  }'
```

### 3. Download com Uploads Automáticos

```bash
# POST /download como usual
# Backend faz:
# 1. Download + conversão MP3
# 2. Upload paralelo (max 3 workers)
# 3. Emite SSE eventos para progresso
```

### 4. Credenciais Encriptadas

- Guardadas em `~/.playlistr/backends.json`
- Encriptadas com Fernet
- Chave em `~/.playlistr/.key` (ou derivada de `SECRET_KEY`)

## Padrões Implementados

### Autenticação por Provider

| Provider   | Tipo       | Flow                      | Renovação    |
|----------|-----------|--------------------------|-------------|
| Google Drive | OAuth2   | Authorization Code       | Auto-refresh |
| Dropbox    | OAuth2   | PKCE                     | Não impl.   |
| OneDrive   | OAuth2   | Authorization Code       | Não impl.   |
| Telegram   | Token    | Manual (BotFather)       | N/A         |
| SMB        | Basic    | Username/Password        | N/A         |
| SFTP       | Key/Pass | SSH Key ou Password      | N/A         |

### Estrutura de Pastas Remota

Todos os provedores (excepto Telegram) seguem:
```
{root}/Playlistr/{artist}/{album}/{title}.mp3
```

Telegram envia como áudio directo (sem pastas).

### Tratamento de Erros

- **Upload falha**: Não interrompe download
- **Provider desconectado**: Skipped (logged)
- **Timeout (30s)**: Retorna "failed"
- **Paralelo**: Max 3 uploads simultâneos (ThreadPoolExecutor)

## Testes Recomendados

### 1. Teste Unitário

```python
# backend/test_storage.py
import pytest
from storage_manager import get_storage_manager

@pytest.mark.asyncio
async def test_gdrive_upload():
    mgr = get_storage_manager()
    # Testar upload simulado
    pass
```

### 2. Teste Manual

```bash
# 1. Listar providers
curl http://localhost:8000/storage/providers

# 2. Conectar Telegram (mais fácil)
curl -X POST http://localhost:8000/storage/providers/connect \
  -H "Content-Type: application/json" \
  -d '{
    "provider":"telegram",
    "name":"backup",
    "bot_token":"...",
    "chat_id":"..."
  }'

# 3. Testar conexão
curl -X POST http://localhost:8000/storage/providers/telegram/backup/test

# 4. Download e verificar se upload ocorreu
```

### 3. Teste de Encriptação

```bash
# Verificar que credentials.json está encriptado
file ~/.playlistr/backends.json
# Deve retornar: "data" (ficheiro binário)

# Verificar chave
ls -la ~/.playlistr/.key
# Deve ter permissões 0600
```

## Monitorização

### Logs

```bash
# Backend logs (durante execução)
tail -f /tmp/playlistr.log

# Credenciais (não logar tokens!)
grep "Backend carregado" /tmp/playlistr.log
```

### Debugging

```python
# Em main.py, para verbose:
log.setLevel(logging.DEBUG)

# Storage backends individuais:
import logging
logging.getLogger("storage_backends").setLevel(logging.DEBUG)
```

## Melhorias Futuras

### Fase 2
- [ ] OAuth callback handlers específicos por provider
- [ ] Retry automático com backoff exponencial
- [ ] Dashboard de status de uploads (frontend React)
- [ ] Notificações (email, webhook) após upload

### Fase 3
- [ ] S3/MinIO backend
- [ ] Backblaze B2 backend
- [ ] WebDAV backend
- [ ] FTP backend
- [ ] Sincronização bidirecional (download de remoto)

### Fase 4
- [ ] CLI para gestão de backends (`playlistr storage list`)
- [ ] Agendamento de uploads (cron)
- [ ] Encriptação E2E de ficheiros
- [ ] Deduplicação automática

## Performance Expected

- **Google Drive**: ~500KB/s (limitado por API)
- **Dropbox**: ~1MB/s
- **OneDrive**: ~500KB/s
- **Telegram**: ~200KB/s (limite Telegram)
- **SMB**: ~5MB/s (LAN)
- **SFTP**: ~2MB/s (internet)

Upload em paralelo: 3x mais rápido (máximo).

## Segurança Notas

1. **Tokens armazenados localmente**: Encriptados em repouso
2. **HTTPS recomendado**: Para callbacks OAuth
3. **Permissões**: `.key` com modo 0600
4. **Rotação**: Alterar `SECRET_KEY` invalida credenciais (gerar novas)
5. **Audit**: Logs não contêm tokens ou passwords

## Deployment

### Desenvolvimento
```bash
cd backend
python -m uvicorn main:app --reload
```

### Produção
```bash
cd backend
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app \
  --bind 0.0.0.0:8000 \
  --log-level info
```

## Troubleshooting

### "ImportError: No module named 'google_auth_oauthlib'"
```bash
pip install -r backend/requirements.txt
```

### "Chave Fernet inválida"
```bash
# Remover chave e regenerar
rm ~/.playlistr/.key
# Próxima execução gera nova chave (mas credenciais ficarão invalidas)
```

### "Bot token Telegram rejeitado"
```bash
# Verificar:
1. Token correcto de @BotFather
2. Chat_id correcto (pode ser negativo para grupos)
3. Bot tem permissões para enviar áudio
```

### Upload lento
```bash
# Verificar:
1. Conexão de rede (speedtest)
2. Rate limits do provider
3. Logs para ver qual backend é lento
```

## Referências

- [Google Drive API](https://developers.google.com/drive/api/v3/about-sdk)
- [Dropbox API](https://www.dropbox.com/developers/documentation/python)
- [Microsoft Graph](https://learn.microsoft.com/en-us/graph/overview)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Paramiko (SFTP)](https://www.paramiko.org/)
- [smbprotocol](https://github.com/jborean93/smbprotocol)
