"""
storage_backends/smb_sftp.py
────────────────────────────
Backends para SMB (Windows shares) e SFTP.
"""

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Optional, Callable

from storage_backends.base import StorageBackend, StorageConfig

log = logging.getLogger(__name__)


class SMBBackend(StorageBackend):
    """Backend para SMB (Windows shares) usando smbprotocol."""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.connection = None

    async def authenticate(self) -> bool:
        """Testa conexão SMB."""
        try:
            from smbprotocol.session import Session
            from smbprotocol.connection import Connection
        except ImportError:
            log.error("smbprotocol não instalado: pip install smbprotocol")
            return False

        if not self.config.smb_host or not self.config.smb_user:
            log.error("smb_host e smb_user obrigatórios para SMB")
            return False

        try:
            # Criar conexão
            conn = Connection(
                uuid.UUID(int=0),  # GUID fixo para teste
                (self.config.smb_host, 445),
                require_signing=False,
            )
            session = Session(
                conn,
                username=self.config.smb_user,
                password=self.config.smb_password or "",
            )
            session.connect()

            # Testar ligação
            try:
                tree = conn.tree_connect_andx(self.config.smb_share or "music")
                tree.disconnect()
            except Exception:
                pass  # Pode falhar se share não existe, mas autenticação passou

            self.connection = conn
            self.connected = True
            log.info("SMB autenticado com sucesso: %s", self.config.smb_host)
            return True

        except Exception as exc:
            log.error("Erro ao autenticar SMB: %s", exc)
            return False

    async def upload(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        """Faz upload via SMB: \\host\share\Playlistr\{artist}\{album}\{title}.mp3"""
        if not self.connected or not self.connection:
            log.warning("SMB não conectado")
            return False

        try:
            artist = track_meta.get("artist", "Unknown")
            album = track_meta.get("album", "Unknown")
            title = track_meta.get("title", local_path.stem)

            # Caminho remoto
            remote_path = f"Playlistr\\{artist}\\{album}\\{title}.mp3"

            file_size = local_path.stat().st_size
            log.info(
                "A fazer upload via SMB: \\%s\\%s\\%s (%d bytes)",
                self.config.smb_host,
                self.config.smb_share,
                remote_path,
                file_size,
            )

            # Tree connect
            tree = self.connection.tree_connect_andx(self.config.smb_share or "music")

            # Criar pastas se não existirem
            for folder in ["Playlistr", f"Playlistr\\{artist}", remote_path.rsplit("\\", 1)[0]]:
                try:
                    tree.open(
                        uuid.UUID(int=0),
                        folder,
                        desired_access=0x00120089,  # write + read + sync
                        file_attributes=0x00000010,  # directory
                        share_access=0x00000007,
                        create_disposition=0x00000001,  # open or create
                        create_options=0x00000001,  # directory
                    ).close()
                except Exception:
                    pass  # Pasta pode já existir

            # Upload do ficheiro
            with open(local_path, "rb") as local_file:
                file_obj = tree.open(
                    uuid.UUID(int=0),
                    remote_path,
                    desired_access=0x00120089,
                    share_access=0x00000000,
                    create_disposition=0x00000002,  # create or truncate
                )

                file_obj.write(local_file.read())
                file_obj.close()

            tree.disconnect()

            if progress_callback:
                progress_callback(1.0)

            log.info("Upload SMB concluído: %s", remote_path)
            return True

        except Exception as exc:
            log.error("Erro ao fazer upload via SMB: %s", exc)
            return False

    def is_connected(self) -> bool:
        """Verifica se está conectado."""
        return self.connected and self.connection is not None

    @property
    def display_name(self) -> str:
        """Nome amigável."""
        return f"SMB ({self.config.name})"


class SFTPBackend(StorageBackend):
    """Backend para SFTP usando paramiko."""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.ssh_client = None
        self.sftp_client = None

    async def authenticate(self) -> bool:
        """Conecta via SFTP."""
        try:
            import paramiko
        except ImportError:
            log.error("paramiko não instalado: pip install paramiko")
            return False

        if not self.config.sftp_host or not self.config.sftp_user:
            log.error("sftp_host e sftp_user obrigatórios para SFTP")
            return False

        try:
            import paramiko

            self.ssh_client = paramiko.SSHClient()
            self.ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            # Conectar com password ou key
            if self.config.sftp_key_path:
                self.ssh_client.connect(
                    self.config.sftp_host,
                    port=self.config.sftp_port or 22,
                    username=self.config.sftp_user,
                    key_filename=self.config.sftp_key_path,
                    timeout=10,
                )
            else:
                self.ssh_client.connect(
                    self.config.sftp_host,
                    port=self.config.sftp_port or 22,
                    username=self.config.sftp_user,
                    password=self.config.sftp_password or "",
                    timeout=10,
                )

            self.sftp_client = self.ssh_client.open_sftp()
            self.connected = True
            log.info("SFTP autenticado com sucesso: %s@%s", self.config.sftp_user, self.config.sftp_host)
            return True

        except Exception as exc:
            log.error("Erro ao autenticar SFTP: %s", exc)
            return False

    async def upload(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        """Faz upload via SFTP: sftp_path/{artist}/{album}/{title}.mp3"""
        if not self.connected or not self.sftp_client:
            log.warning("SFTP não conectado")
            return False

        try:
            artist = track_meta.get("artist", "Unknown")
            album = track_meta.get("album", "Unknown")
            title = track_meta.get("title", local_path.stem)

            # Caminho remoto
            base_path = self.config.sftp_path or "/music"
            remote_dir = f"{base_path}/{artist}/{album}"
            remote_file = f"{remote_dir}/{title}.mp3"

            file_size = local_path.stat().st_size
            log.info("A fazer upload via SFTP: %s (%d bytes)", remote_file, file_size)

            # Criar pastas se não existirem
            for folder in [
                f"{base_path}/{artist}",
                remote_dir,
            ]:
                try:
                    self.sftp_client.stat(folder)
                except FileNotFoundError:
                    self.sftp_client.mkdir(folder)

            # Upload do ficheiro
            def progress_handler(transferred, total):
                if progress_callback:
                    progress_callback(transferred / total if total > 0 else 0)

            self.sftp_client.put(str(local_path), remote_file, callback=progress_handler)

            log.info("Upload SFTP concluído: %s", remote_file)
            return True

        except Exception as exc:
            log.error("Erro ao fazer upload via SFTP: %s", exc)
            return False

    def is_connected(self) -> bool:
        """Verifica se está conectado."""
        return self.connected and self.sftp_client is not None

    @property
    def display_name(self) -> str:
        """Nome amigável."""
        return f"SFTP ({self.config.name})"
