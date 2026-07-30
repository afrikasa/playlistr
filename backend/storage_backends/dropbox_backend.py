"""
storage_backends/dropbox_backend.py
───────────────────────────────────
Backend para Dropbox usando o SDK oficial.

⚠️  DESACTIVADO TEMPORARIAMENTE — VER NOTA ABAIXO

Razão da desactivação:
- O SDK oficial `DropboxOAuth2Flow` não suporta o parâmetro `state` externo (CSRF token).
- Incompatível com o design centralizado de validação OAuth em `oauth_state.py`.
- gdrive.py e onedrive.py usam validação de state externa; Dropbox exigiria implementação
  do fluxo OAuth2 à mão (sem usar DropboxOAuth2Flow).

Para reactivar:
1. Implementar fluxo OAuth2 manual (request → /authorize → callback → /token)
2. Usar `store_oauth_state()` para guardar state antes de redirecionar
3. Usar `validate_oauth_state()` no callback para validar
4. Remover `_DROPBOX_OAUTH_SESSION` (hack de sessão em memória)
5. Testar end-to-end com o callback genérico em main.py

Nota de implementação original:
Usamos DropboxOAuth2Flow (fluxo web com redirect) em vez de OAuth2FlowNoRedirect (fluxo CLI)
porque precisamos de suporte ao parâmetro `state` para validação CSRF no callback OAuth.
DropboxOAuth2Flow segue o padrão OAuth2 web standard usado por gdrive.py e onedrive.py.
(Não funcionou — o SDK não suporta state externo.)

Para armazenar o state entre pedidos, usamos um dicionário em memória como "sessão" fake,
compatível com a interface que DropboxOAuth2Flow espera.
"""

import asyncio
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional, Callable

from storage_backends.base import StorageBackend, StorageConfig

# Importar função de validação de OAuth state
sys.path.insert(0, str(Path(__file__).parent.parent))
from oauth_state import store_oauth_state

log = logging.getLogger(__name__)

# Sessão fake em memória para guardar CSRF tokens entre pedidos OAuth
# DropboxOAuth2Flow espera um objecto dict-like com __getitem__, __setitem__, etc.
_DROPBOX_OAUTH_SESSION: dict = {}


class DropboxBackend(StorageBackend):
    """Backend para Dropbox com OAuth2 (fluxo web com redirect)."""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.client = None
        self.pending_auth_url: Optional[str] = None  # URL para autenticação OAuth pendente

    async def authenticate(self) -> bool:
        """
        Realiza OAuth2 com Dropbox (fluxo web com redirect + state CSRF).

        NOTA: Este método está desactivado. Ver comentário do ficheiro.
        """
        raise NotImplementedError(
            "Dropbox OAuth está temporariamente indisponível. "
            "O SDK não suporta state externo (CSRF) compatível com o design centralizado. "
            "Ver TODO em storage_backends/dropbox_backend.py para reactivar."
        )

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
            import dropbox

            artist = track_meta.get("artist", "Unknown")
            album = track_meta.get("album", "Unknown")
            title = track_meta.get("title", local_path.stem)

            # Path no Dropbox
            remote_path = f"/Playlistr/{artist}/{album}/{title}.mp3"

            file_size = local_path.stat().st_size
            log.info("A fazer upload para Dropbox: %s (%d bytes)", remote_path, file_size)

            with open(local_path, "rb") as f:
                file_data = f.read()

            # Envolver em asyncio.to_thread para não bloquear event loop
            await asyncio.to_thread(
                self.client.files_upload,
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

    async def exchange_code_for_token(self, code: str) -> bool:
        """Troca authorization code por access token (OAuth2 callback).

        NOTA: Este método está desactivado. Ver comentário do ficheiro.
        """
        raise NotImplementedError(
            "Dropbox OAuth está temporariamente indisponível. "
            "Ver TODO em storage_backends/dropbox_backend.py para reactivar."
        )

    def is_connected(self) -> bool:
        """Verifica se está conectado."""
        return self.connected and self.client is not None

    @property
    def display_name(self) -> str:
        """Nome amigável."""
        return f"Dropbox ({self.config.name})"
