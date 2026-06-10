"""
storage_backends/telegram_backend.py
────────────────────────────────────
Backend para Telegram usando python-telegram-bot.
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Optional, Callable

from storage_backends.base import StorageBackend, StorageConfig

log = logging.getLogger(__name__)


class TelegramBackend(StorageBackend):
    """Backend para Telegram (envia ficheiros para um chat)."""

    def __init__(self, config: StorageConfig):
        super().__init__(config)
        self.bot = None

    async def authenticate(self) -> bool:
        """Valida bot_token e chat_id."""
        try:
            from telegram import Bot
            from telegram.error import InvalidToken, TelegramError
        except ImportError:
            log.error("python-telegram-bot não instalado: pip install python-telegram-bot")
            return False

        if not self.config.bot_token or not self.config.chat_id:
            log.error("bot_token e chat_id obrigatórios para Telegram")
            return False

        try:
            self.bot = Bot(token=self.config.bot_token)
            # Testar conexão
            await self.bot.get_me()
            self.connected = True
            log.info("Telegram autenticado com sucesso")
            return True
        except InvalidToken:
            log.error("Bot token Telegram inválido")
            return False
        except TelegramError as exc:
            log.error("Erro ao autenticar Telegram: %s", exc)
            return False

    async def upload(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> bool:
        """Envia áudio para Telegram."""
        if not self.connected or not self.bot:
            log.warning("Telegram não conectado")
            return False

        try:
            from telegram import InputFile
        except ImportError:
            return False

        try:
            artist = track_meta.get("artist", "Unknown")
            album = track_meta.get("album", "Unknown")
            title = track_meta.get("title", local_path.stem)

            # Caption com metadados
            caption = f"{artist} — {title}\n({album})"

            file_size = local_path.stat().st_size
            log.info("A enviar áudio para Telegram: %s (%d bytes)", title, file_size)

            # Enviar como audio
            await self.bot.send_audio(
                chat_id=self.config.chat_id,
                audio=InputFile(open(local_path, "rb")),
                caption=caption[:1024],  # limite Telegram
                performer=artist,
                title=title,
            )

            if progress_callback:
                progress_callback(1.0)

            log.info("Envio Telegram concluído: %s", title)
            return True

        except Exception as exc:
            log.error("Erro ao enviar para Telegram: %s", exc)
            return False

    def is_connected(self) -> bool:
        """Verifica se está conectado."""
        return self.connected and self.bot is not None

    @property
    def display_name(self) -> str:
        """Nome amigável."""
        return f"Telegram ({self.config.name})"
