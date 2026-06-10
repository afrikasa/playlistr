"""
storage_backends/dropbox_backend.py
───────────────────────────────────
Backend para Dropbox usando o SDK oficial.
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import Optional, Callable

from storage_backends.base import StorageBackend, StorageConfig

log = logging.getLogger(__name__)


class DropboxBackend(StorageBackend):
    """Backend para Dropbox com OAuth2 PKCE."""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.client = None

    async def authenticate(self) -> bool:
        """Realiza OAuth2 com Dropbox via PKCE."""
        try:
            import dropbox
            from dropbox.oauth import OAuth2FlowNoRedirect
        except ImportError:
            log.error("dropbox SDK não instalado: pip install dropbox")
            return False

        app_key = os.getenv("DROPBOX_APP_KEY")
        app_secret = os.getenv("DROPBOX_APP_SECRET")

        if not app_key or not app_secret:
            log.error("DROPBOX_APP_KEY ou DROPBOX_APP_SECRET não definidos no .env")
            return False

        try:
            # Se já tem access_token, apenas usar
            if self.config.access_token:
                self.client = dropbox.Dropbox(self.config.access_token)
                try:
                    self.client.users_get_current_account()
                    self.connected = True
                    log.info("Dropbox autenticado com token existente")
                    return True
                except Exception:
                    log.warning("Token Dropbox inválido ou expirado")
                    self.connected = False

            # Flow OAuth novo (PKCE)
            auth_flow = OAuth2FlowNoRedirect(
                app_key,
                app_secret,
                oauth_code_grant=True,
            )
            authorize_url = auth_flow.get_authorize_url()
            log.info("Dropbox auth URL: %s", authorize_url)
            # Em produção, redirecionar utilizador para authorize_url
            # Após obter code, guardar access_token
            return False  # Aguardar callback

        except Exception as exc:
            log.error("Erro ao autenticar Dropbox: %s", exc)
            return False

    async def upload(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        """Faz upload para Dropbox: /Playlistr/{artist}/{album}/{title}.mp3"""
        if not self.connected or not self.client:
            log.warning("Dropbox não conectado")
            return False

        try:
            artist = track_meta.get("artist", "Unknown")
            album = track_meta.get("album", "Unknown")
            title = track_meta.get("title", local_path.stem)

            # Path no Dropbox
            remote_path = f"/Playlistr/{artist}/{album}/{title}.mp3"

            file_size = local_path.stat().st_size
            log.info("A fazer upload para Dropbox: %s (%d bytes)", remote_path, file_size)

            with open(local_path, "rb") as f:
                file_data = f.read()

            self.client.files_upload(
                file_data,
                remote_path,
                autorename=True,
                mode=dropbox.files.WriteMode("add"),
            )

            if progress_callback:
                progress_callback(1.0)

            log.info("Upload Dropbox concluído: %s", remote_path)
            return True

        except Exception as exc:
            log.error("Erro ao fazer upload para Dropbox: %s", exc)
            return False

    def is_connected(self) -> bool:
        """Verifica se está conectado."""
        return self.connected and self.client is not None

    @property
    def display_name(self) -> str:
        """Nome amigável."""
        return f"Dropbox ({self.config.name})"
