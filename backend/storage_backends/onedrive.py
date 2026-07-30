"""
storage_backends/onedrive.py
────────────────────────────
Backend para OneDrive usando Microsoft Graph API.
"""

import asyncio
import logging
import os
import re
import sys
from pathlib import Path
from typing import Optional, Callable, Dict
from datetime import datetime

from storage_backends.base import StorageBackend, StorageConfig

# Importar função de validação de OAuth state
sys.path.insert(0, str(Path(__file__).parent.parent))
from oauth_state import store_oauth_state

log = logging.getLogger(__name__)


class OneDriveBackend(StorageBackend):
    """Backend para OneDrive com OAuth2 Authorization Code."""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.session = None
        self.folder_cache: Dict[str, str] = {}  # path → folder_id
        self.pending_auth_url: Optional[str] = None  # URL para autenticação OAuth pendente

    async def authenticate(self) -> bool:
        """Realiza OAuth2 com Microsoft Graph."""
        try:
            import msal
            import aiohttp
        except ImportError:
            log.error("msal ou aiohttp não instalado: pip install msal aiohttp")
            return False

        client_id = os.getenv("ONEDRIVE_CLIENT_ID")

        if not client_id:
            log.error("ONEDRIVE_CLIENT_ID não definido no .env")
            return False

        try:
            app = msal.PublicClientApplication(client_id)

            # Se já tem access_token, verificar expiração
            if self.config.access_token:
                # Verificar se token está expirado
                if self.config.expires_at and datetime.fromtimestamp(self.config.expires_at) > datetime.now():
                    self.session = aiohttp.ClientSession()
                    self.connected = True
                    log.info("OneDrive autenticado com token existente")
                    return True
                else:
                    log.warning("Token OneDrive expirado")

            # Flow OAuth novo
            # SEGURANÇA: Gerar e guardar state PRIMEIRO, depois usar na auth_url
            state = store_oauth_state("onedrive", self.config.name)

            # Nota: msal.get_authorization_request_url retorna (auth_url, state) se state=None,
            # ou apenas a string URL se state é fornecido explicitamente
            result = app.get_authorization_request_url(
                scopes=["files.readwrite.all"],
                redirect_uri="http://localhost:8000/storage/auth/onedrive/callback",
                state=state,  # Usar nosso state controlado
            )
            # Pegar na URL (pode ser primeira posição de tuple ou diretamente string)
            auth_url = result[0] if isinstance(result, (list, tuple)) else result

            # Guardar URL para retornar ao endpoint de autenticação
            self.pending_auth_url = auth_url

            log.info("OneDrive auth iniciado: %s (state: %s...)", self.config.name, state[:8])
            return False  # Aguardar callback com code + state

        except Exception as exc:
            log.error("Erro ao autenticar OneDrive: %s", exc)
            return False

    async def upload(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        """Faz upload para OneDrive: /Playlistr/{artist}/{album}/{title}.mp3"""
        if not self.connected or not self.session:
            log.warning("OneDrive não conectado")
            return False

        try:
            artist = track_meta.get("artist", "Unknown")
            album = track_meta.get("album", "Unknown")
            title = track_meta.get("title", local_path.stem)

            # Validar nomes de pasta (caracteres proibidos OneDrive)
            artist = self._sanitize_folder_name(artist)
            album = self._sanitize_folder_name(album)
            title = self._sanitize_folder_name(title)

            # Obter ou criar pastas
            root_id = await self._get_or_create_folder("Playlistr", parent_id="root")
            artist_id = await self._get_or_create_folder(artist, parent_id=root_id)
            album_id = await self._get_or_create_folder(album, parent_id=artist_id)

            file_size = local_path.stat().st_size
            log.info(
                "A fazer upload para OneDrive: %s/%s/%s.mp3 (%d bytes)",
                artist,
                album,
                title,
                file_size,
            )

            # Upload via PUT /drive/items/{parent_id}:/{filename}:/content
            upload_url = (
                f"https://graph.microsoft.com/v1.0/drive/items/{album_id}:/{title}.mp3:/content"
            )

            with open(local_path, "rb") as f:
                async with self.session.put(
                    upload_url,
                    data=f,
                    headers={"Authorization": f"Bearer {self.config.access_token}"},
                ) as resp:
                    if resp.status not in (200, 201):
                        log.error(
                            "Erro ao fazer upload para OneDrive (%d): %s",
                            resp.status,
                            await resp.text(),
                        )
                        return False

            if progress_callback:
                progress_callback(1.0)

            log.info("Upload OneDrive concluído: %s/%s/%s.mp3", artist, album, title)
            return True

        except Exception as exc:
            log.error("Erro ao fazer upload para OneDrive: %s", exc)
            return False

    async def exchange_code_for_token(self, code: str) -> bool:
        """Troca authorization code por access token (OAuth2 callback)."""
        try:
            import msal
            import aiohttp
        except ImportError:
            log.error("msal ou aiohttp não instalado: pip install msal aiohttp")
            return False

        client_id = os.getenv("ONEDRIVE_CLIENT_ID")

        if not client_id:
            log.error("ONEDRIVE_CLIENT_ID não definido no .env")
            return False

        try:
            app = msal.PublicClientApplication(client_id)

            # Trocar code por token
            token_response = app.acquire_token_by_authorization_code(
                code=code,
                scopes=["files.readwrite.all"],
                redirect_uri="http://localhost:8000/storage/auth/onedrive/callback",
            )

            if "error" in token_response:
                log.error("Erro ao trocar code por token (OneDrive): %s", token_response.get("error_description"))
                return False

            # Guardar tokens
            self.config.access_token = token_response.get("access_token")
            self.config.refresh_token = token_response.get("refresh_token")

            if "expires_in" in token_response:
                self.config.expires_at = datetime.now().timestamp() + token_response["expires_in"]

            # Importar e guardar config
            sys.path.insert(0, str(Path(__file__).parent.parent))
            from credentials import add_or_update_config
            add_or_update_config(self.config)

            # Criar sessão HTTP com o token
            self.session = aiohttp.ClientSession()
            self.connected = True
            log.info("OneDrive autenticado com sucesso via OAuth")
            return True

        except Exception as exc:
            log.error("Erro ao trocar code por token (OneDrive): %s", exc)
            return False

    def is_connected(self) -> bool:
        """Verifica se está conectado."""
        return self.connected and self.session is not None

    @property
    def display_name(self) -> str:
        """Nome amigável."""
        return f"OneDrive ({self.config.name})"

    def _sanitize_folder_name(self, name: str) -> str:
        """Remove caracteres proibidos em nomes OneDrive."""
        # Caracteres proibidos: < > : " / \ | ? *
        name = re.sub(r'[<>:"/\\|?*]', '_', name)
        return name.strip('._') or 'Unknown'

    async def _get_or_create_folder(
        self, folder_name: str, parent_id: str = "root"
    ) -> str:
        """Procura ou cria uma pasta no OneDrive."""
        cache_key = f"{parent_id}:{folder_name}"
        if cache_key in self.folder_cache:
            return self.folder_cache[cache_key]

        try:
            # Procurar pasta existente
            search_url = (
                f"https://graph.microsoft.com/v1.0/drive/items/{parent_id}/children"
            )
            async with self.session.get(
                search_url,
                headers={"Authorization": f"Bearer {self.config.access_token}"},
            ) as resp:
                data = await resp.json()
                for item in data.get("value", []):
                    if (
                        item.get("name") == folder_name
                        and "folder" in item
                    ):
                        folder_id = item["id"]
                        self.folder_cache[cache_key] = folder_id
                        return folder_id

            # Criar nova pasta
            create_url = (
                f"https://graph.microsoft.com/v1.0/drive/items/{parent_id}/children"
            )
            async with self.session.post(
                create_url,
                json={"name": folder_name, "folder": {}},
                headers={"Authorization": f"Bearer {self.config.access_token}"},
            ) as resp:
                data = await resp.json()
                folder_id = data["id"]
                self.folder_cache[cache_key] = folder_id
                log.info("Pasta criada no OneDrive: %s (ID: %s)", folder_name, folder_id)
                return folder_id

        except Exception as exc:
            log.error("Erro ao criar/procurar pasta OneDrive: %s", exc)
            raise
