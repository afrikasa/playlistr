"""
storage_backends/gdrive.py
──────────────────────────
Backend para Google Drive usando google-api-python-client.
"""

import asyncio
import logging
import os
import sys
import urllib.parse
from pathlib import Path
from typing import Optional, Callable, Dict

from storage_backends.base import StorageBackend, StorageConfig

# Importar função de validação de OAuth state
sys.path.insert(0, str(Path(__file__).parent.parent))
from oauth_state import store_oauth_state

log = logging.getLogger(__name__)


class GoogleDriveBackend(StorageBackend):
    """Backend para Google Drive com OAuth2."""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.service = None
        self.folder_cache: Dict[str, str] = {}  # path → folder_id
        self.pending_auth_url: Optional[str] = None  # URL para autenticação OAuth pendente

    async def authenticate(self) -> bool:
        """Realiza OAuth2 com Google Drive."""
        try:
            from google_auth_oauthlib.flow import Flow
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
        except ImportError:
            log.error("google-auth-oauthlib não instalado: pip install google-auth-oauthlib")
            return False

        client_id = os.getenv("GDRIVE_CLIENT_ID")
        client_secret = os.getenv("GDRIVE_CLIENT_SECRET")

        if not client_id or not client_secret:
            log.error("GDRIVE_CLIENT_ID ou GDRIVE_CLIENT_SECRET não definidos no .env")
            return False

        try:
            # Se já tem access_token, apenas refrescar se expirado
            if self.config.access_token:
                creds = Credentials(
                    token=self.config.access_token,
                    refresh_token=self.config.refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=client_id,
                    client_secret=client_secret,
                )
                if creds.expired and creds.refresh_token:
                    req = Request()
                    creds.refresh(req)
                    self.config.access_token = creds.token
                    if creds.refresh_token:
                        self.config.refresh_token = creds.refresh_token
                    if creds.expiry:
                        self.config.expires_at = creds.expiry.timestamp()
                    log.info("Google Drive token refrescado")
            else:
                # Flow OAuth novo — usar client_config em vez de arquivo
                client_config = {
                    "web": {
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                        "token_uri": "https://oauth2.googleapis.com/token",
                        "redirect_uris": ["http://localhost:8000/storage/auth/gdrive/callback"],
                    }
                }
                flow = Flow.from_client_config(
                    client_config,
                    scopes=["https://www.googleapis.com/auth/drive.file"],
                )
                flow.redirect_uri = "http://localhost:8000/storage/auth/gdrive/callback"

                # SEGURANÇA: Gerar e guardar state PRIMEIRO, depois usar na auth_url
                # Isto garante que o state na auth_url é exactamente o que validaremos no callback
                state = store_oauth_state("gdrive", self.config.name)
                auth_url = flow.authorization_url(state=state, access_type="offline")

                # Guardar URL para retornar ao endpoint de autenticação
                self.pending_auth_url = auth_url

                log.info("Google Drive auth iniciado: %s (state: %s...)", self.config.name, state[:8])
                return False  # Aguardar callback com code + state

            from googleapiclient.discovery import build

            self.service = build("drive", "v3", credentials=creds)
            self.connected = True
            log.info("Google Drive autenticado com sucesso")
            return True

        except Exception as exc:
            log.error("Erro ao autenticar Google Drive: %s", exc)
            return False

    async def upload(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        """Faz upload para Google Drive: Playlistr/{artist}/{album}/{title}.mp3"""
        if not self.connected or not self.service:
            log.warning("Google Drive não conectado")
            return False

        try:
            artist = track_meta.get("artist", "Unknown")
            album = track_meta.get("album", "Unknown")
            title = track_meta.get("title", local_path.stem)

            # Criar estrutura de pastas
            root_id = await self._get_or_create_folder("Playlistr", parent_id=None)
            artist_id = await self._get_or_create_folder(artist, parent_id=root_id)
            album_id = await self._get_or_create_folder(album, parent_id=artist_id)

            # Upload do ficheiro
            file_metadata = {
                "name": f"{title}.mp3",
                "parents": [album_id],
            }

            file_size = local_path.stat().st_size
            log.info("A fazer upload para Google Drive: %s (%d bytes)", title, file_size)

            from googleapiclient.http import MediaFileUpload

            media = MediaFileUpload(str(local_path), mimetype="audio/mpeg")
            file = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id",
            ).execute()

            if progress_callback:
                progress_callback(1.0)

            log.info("Upload Google Drive concluído: %s (ID: %s)", title, file["id"])
            return True

        except Exception as exc:
            log.error("Erro ao fazer upload para Google Drive: %s", exc)
            return False

    async def exchange_code_for_token(self, code: str) -> bool:
        """Troca authorization code por access/refresh token (OAuth2 callback)."""
        try:
            from google_auth_oauthlib.flow import Flow
            from google.auth.transport.requests import Request
        except ImportError:
            log.error("google-auth-oauthlib não instalado: pip install google-auth-oauthlib")
            return False

        client_id = os.getenv("GDRIVE_CLIENT_ID")
        client_secret = os.getenv("GDRIVE_CLIENT_SECRET")

        if not client_id or not client_secret:
            log.error("GDRIVE_CLIENT_ID ou GDRIVE_CLIENT_SECRET não definidos no .env")
            return False

        try:
            client_config = {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": ["http://localhost:8000/storage/auth/gdrive/callback"],
                }
            }
            flow = Flow.from_client_config(
                client_config,
                scopes=["https://www.googleapis.com/auth/drive.file"],
            )
            flow.redirect_uri = "http://localhost:8000/storage/auth/gdrive/callback"
            flow.fetch_token(code=code)

            # Guardar tokens
            self.config.access_token = flow.credentials.token
            self.config.refresh_token = flow.credentials.refresh_token
            if flow.credentials.expiry:
                self.config.expires_at = flow.credentials.expiry.timestamp()

            # Importar e guardar config
            sys.path.insert(0, str(Path(__file__).parent.parent))
            from credentials import add_or_update_config
            add_or_update_config(self.config)

            # Tentar usar o service imediatamente
            from googleapiclient.discovery import build
            self.service = build("drive", "v3", credentials=flow.credentials)
            self.connected = True
            log.info("Google Drive autenticado com sucesso via OAuth")
            return True

        except Exception as exc:
            log.error("Erro ao trocar code por token (Google Drive): %s", exc)
            return False

    def is_connected(self) -> bool:
        """Verifica se está conectado."""
        return self.connected and self.service is not None

    @property
    def display_name(self) -> str:
        """Nome amigável."""
        return f"Google Drive ({self.config.name})"

    @staticmethod
    def _escape_drive_query(value: str) -> str:
        """Escapa aspas simples e barras invertidas para queries da Drive API."""
        return value.replace("\\", "\\\\").replace("'", "\\'")

    async def _get_or_create_folder(
        self, folder_name: str, parent_id: Optional[str] = None
    ) -> str:
        """
        Procura ou cria uma pasta no Google Drive.

        Retorna o ID da pasta.
        """
        import re
        cache_key = f"{parent_id}:{folder_name}"
        if cache_key in self.folder_cache:
            return self.folder_cache[cache_key]

        try:
            safe_name = self._escape_drive_query(folder_name)
            query = f"name = '{safe_name}' and trashed = false and mimeType = 'application/vnd.google-apps.folder'"
            if parent_id:
                # Validar parent_id — apenas caracteres alfanuméricos, traços e underscores
                if not re.match(r'^[A-Za-z0-9_-]+$', parent_id):
                    raise ValueError(f"parent_id inválido: {parent_id!r}")
                query += f" and '{parent_id}' in parents"

            results = self.service.files().list(q=query, spaces="drive", pageSize=1).execute()
            items = results.get("files", [])

            if items:
                folder_id = items[0]["id"]
                self.folder_cache[cache_key] = folder_id
                return folder_id

            # Criar nova pasta
            metadata = {
                "name": folder_name,
                "mimeType": "application/vnd.google-apps.folder",
            }
            if parent_id:
                metadata["parents"] = [parent_id]

            folder = self.service.files().create(body=metadata, fields="id").execute()
            folder_id = folder["id"]
            self.folder_cache[cache_key] = folder_id
            log.info("Pasta criada no Google Drive: %s (ID: %s)", folder_name, folder_id)
            return folder_id

        except Exception as exc:
            log.error("Erro ao criar/procurar pasta Google Drive: %s", exc)
            raise
