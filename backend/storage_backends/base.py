"""
storage_backends/base.py
────────────────────────
Classe base abstracta para todos os storage backends.
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional, Callable
from pydantic import BaseModel


class StorageConfig(BaseModel):
    """Configuração genérica para qualquer storage backend."""
    provider: str
    name: str
    enabled: bool = True

    # OAuth
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[float] = None

    # Telegram
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None

    # SMB
    smb_host: Optional[str] = None
    smb_user: Optional[str] = None
    smb_password: Optional[str] = None
    smb_share: Optional[str] = None
    smb_path: Optional[str] = None

    # SFTP
    sftp_host: Optional[str] = None
    sftp_port: int = 22
    sftp_user: Optional[str] = None
    sftp_password: Optional[str] = None
    sftp_key_path: Optional[str] = None
    sftp_path: Optional[str] = None


class StorageBackend(ABC):
    """Classe base para todos os backends de armazenamento."""

    def __init__(self, config: StorageConfig):
        """Inicializa o backend com a configuração fornecida."""
        self.config = config
        self.connected = False

    @abstractmethod
    async def authenticate(self) -> bool:
        """
        Autentica com o serviço de cloud/remote.

        Retorna True se autenticação bem-sucedida, False caso contrário.
        Para OAuth, pode gerar auth_url e guardar tokens no config.
        """
        pass

    @abstractmethod
    async def upload(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        """
        Faz upload de um ficheiro MP3 para o backend.

        Args:
            local_path: Caminho local do ficheiro MP3
            track_meta: Metadados da faixa {"title", "artist", "album"}
            progress_callback: Função de callback de progresso (0.0 a 1.0)

        Retorna True se sucesso, False se falha.
        """
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Verifica se o backend está conectado/autenticado."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Nome amigável para exibição na UI."""
        pass
