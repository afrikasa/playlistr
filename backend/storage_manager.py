"""
backend/storage_manager.py
──────────────────────────
Gestor centralizado para múltiplos storage backends.
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, Callable, Dict, List

try:
    from credentials import load_configs, add_or_update_config, remove_config
except ImportError:
    # Se importar do backend directamente
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from credentials import load_configs, add_or_update_config, remove_config

try:
    from storage_backends.base import StorageBackend, StorageConfig
    from storage_backends.gdrive import GoogleDriveBackend
    from storage_backends.dropbox_backend import DropboxBackend
    from storage_backends.onedrive import OneDriveBackend
    from storage_backends.telegram_backend import TelegramBackend
    from storage_backends.smb_sftp import SMBBackend, SFTPBackend
except ImportError as e:
    # Fallback se importar falhar
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from storage_backends.base import StorageBackend, StorageConfig
    from storage_backends.gdrive import GoogleDriveBackend
    from storage_backends.dropbox_backend import DropboxBackend
    from storage_backends.onedrive import OneDriveBackend
    from storage_backends.telegram_backend import TelegramBackend
    from storage_backends.smb_sftp import SMBBackend, SFTPBackend

log = logging.getLogger(__name__)

# Mapa de providers para classes
_PROVIDER_CLASSES = {
    "gdrive": GoogleDriveBackend,
    "dropbox": DropboxBackend,
    "onedrive": OneDriveBackend,
    "telegram": TelegramBackend,
    "smb": SMBBackend,
    "sftp": SFTPBackend,
}

# Providers temporariamente indisponíveis
# Mapeia provider → razão (mensagem para mostrar ao utilizador)
_UNAVAILABLE_PROVIDERS = {
    "dropbox": {
        "reason": "OAuth SDK incompatível com validação de state externa",
        "message": "Dropbox está temporariamente indisponível. Será retomado em breve.",
    }
}


class StorageManager:
    """Gestor singleton para todos os storage backends."""

    _instance: Optional["StorageManager"] = None

    def __new__(cls) -> "StorageManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.backends: Dict[str, StorageBackend] = {}
        self.executor = ThreadPoolExecutor(max_workers=3)
        self._load_backends()

    def _load_backends(self) -> None:
        """Carrega os backends activos de credentials.py.

        Nota: Backends em _UNAVAILABLE_PROVIDERS são ignorados durante o carregamento.
        """
        configs = load_configs()
        for config in configs:
            if not config.enabled:
                continue

            # Saltar providers temporariamente indisponíveis
            if config.provider in _UNAVAILABLE_PROVIDERS:
                log.info(
                    "Backend '%s' ignorado: %s",
                    config.provider,
                    _UNAVAILABLE_PROVIDERS[config.provider]["reason"]
                )
                continue

            backend_id = f"{config.provider}:{config.name}"
            try:
                backend_class = _PROVIDER_CLASSES.get(config.provider)
                if not backend_class:
                    log.warning("Provider desconhecido: %s", config.provider)
                    continue
                backend = backend_class(config)
                self.backends[backend_id] = backend
                log.info("Backend carregado: %s", backend_id)
            except Exception as exc:
                log.error("Erro ao carregar backend %s: %s", backend_id, exc)

    def add_backend(self, config: StorageConfig) -> bool:
        """Adiciona um novo backend."""
        try:
            backend_class = _PROVIDER_CLASSES.get(config.provider)
            if not backend_class:
                log.error("Provider desconhecido: %s", config.provider)
                return False

            backend = backend_class(config)
            backend_id = f"{config.provider}:{config.name}"
            self.backends[backend_id] = backend

            # Guardar em disco
            add_or_update_config(config)
            log.info("Backend adicionado: %s", backend_id)
            return True

        except Exception as exc:
            log.error("Erro ao adicionar backend: %s", exc)
            return False

    def remove_backend(self, provider: str, name: str) -> bool:
        """Remove um backend."""
        try:
            backend_id = f"{provider}:{name}"
            if backend_id in self.backends:
                del self.backends[backend_id]

            # Remover de disco
            remove_config(provider, name)
            log.info("Backend removido: %s", backend_id)
            return True

        except Exception as exc:
            log.error("Erro ao remover backend: %s", exc)
            return False

    async def authenticate_backend(self, provider: str, name: str) -> bool:
        """Autentica um backend específico."""
        backend_id = f"{provider}:{name}"
        backend = self.backends.get(backend_id)
        if not backend:
            log.error("Backend não encontrado: %s", backend_id)
            return False

        try:
            ok = await backend.authenticate()
            if ok:
                log.info("Backend autenticado: %s", backend_id)
            return ok
        except Exception as exc:
            log.error("Erro ao autenticar %s: %s", backend_id, exc)
            return False

    async def test_backend(self, provider: str, name: str) -> bool:
        """Testa se um backend está conectado."""
        backend_id = f"{provider}:{name}"
        backend = self.backends.get(backend_id)
        if not backend:
            log.error("Backend não encontrado: %s", backend_id)
            return False

        try:
            return backend.is_connected()
        except Exception as exc:
            log.error("Erro ao testar %s: %s", backend_id, exc)
            return False

    async def upload_to_all(
        self,
        local_path: Path,
        track_meta: dict,
        progress_callback: Optional[Callable[[str, float], None]] = None,
    ) -> Dict[str, str]:
        """
        Faz upload para todos os backends activos e conectados.

        Args:
            local_path: Caminho local do ficheiro MP3
            track_meta: Metadados {"title", "artist", "album"}
            progress_callback: Função chamada com (backend_id, progress 0-1)

        Retorna dict com resultados: {backend_id: "ok" | "failed" | "skipped"}
        """
        results = {}

        tasks = []
        for backend_id, backend in self.backends.items():
            if not backend.is_connected():
                results[backend_id] = "skipped"
                log.info("Backend desconectado, a saltar: %s", backend_id)
                continue

            # Criar tarefa assíncrona
            async def _upload(bid: str, be: StorageBackend) -> tuple[str, str]:
                try:
                    def progress_cb(progress: float):
                        if progress_callback:
                            progress_callback(bid, progress)

                    ok = await be.upload(local_path, track_meta, progress_cb)
                    return bid, "ok" if ok else "failed"
                except Exception as exc:
                    log.error("Erro ao fazer upload em %s: %s", bid, exc)
                    return bid, "failed"

            tasks.append(_upload(backend_id, backend))

        # Executar uploads em paralelo
        if tasks:
            upload_results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in upload_results:
                if isinstance(result, Exception):
                    log.error("Erro em upload assíncrono: %s", result)
                else:
                    bid, status = result
                    results[bid] = status

        log.info("Uploads concluídos: %s", results)
        return results

    def list_backends(self) -> List[Dict]:
        """Retorna lista de backends com informações.

        Inclui backends normais (carregados) e também info sobre providers
        temporariamente indisponíveis.
        """
        result = [
            {
                "id": backend_id,
                "provider": backend.config.provider,
                "name": backend.config.name,
                "display_name": backend.display_name,
                "connected": backend.is_connected(),
                "enabled": backend.config.enabled,
                "status": "available",
            }
            for backend_id, backend in self.backends.items()
        ]

        # Adicionar info sobre providers indisponíveis
        # (para o frontend mostrar "Em breve" em vez de deixar tentar)
        for provider, info in _UNAVAILABLE_PROVIDERS.items():
            result.append({
                "id": f"{provider}:unavailable",
                "provider": provider,
                "name": "unavailable",
                "display_name": f"{provider.capitalize()} (indisponível)",
                "connected": False,
                "enabled": False,
                "status": "unavailable",
                "message": info["message"],
            })

        return result

    async def shutdown(self) -> None:
        """Encerra o gestor e fecha conexões."""
        self.executor.shutdown(wait=True)
        for backend in self.backends.values():
            try:
                if hasattr(backend, "ssh_client") and backend.ssh_client:
                    backend.ssh_client.close()
                if hasattr(backend, "session") and backend.session:
                    await backend.session.close()
            except Exception:
                pass
        log.info("StorageManager encerrado")


# Singleton global
def get_storage_manager() -> StorageManager:
    """Retorna a instância singleton do StorageManager."""
    return StorageManager()
