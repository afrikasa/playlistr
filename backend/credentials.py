"""
backend/credentials.py
──────────────────────
Gestão de credenciais encriptadas para storage backends.
"""

import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional, List, Dict

from cryptography.fernet import Fernet

# Garantir importação de storage_backends
sys.path.insert(0, str(Path(__file__).parent))
from storage_backends.base import StorageConfig

log = logging.getLogger(__name__)

# Pasta ~/.playlistr/ para guardar configurações
_PLAYLISTR_HOME = Path.home() / ".playlistr"
_BACKENDS_FILE = _PLAYLISTR_HOME / "backends.json"
_KEY_FILE = _PLAYLISTR_HOME / ".key"


def _ensure_dir() -> None:
    """Cria a pasta ~/.playlistr se não existir."""
    _PLAYLISTR_HOME.mkdir(parents=True, exist_ok=True)


def _get_or_create_key() -> str:
    """
    Obtém a chave Fernet:
    1. Se SECRET_KEY existir no .env, deriva Fernet de 32 bytes com salt aleatório
    2. Se não existir, gera uma chave aleatória e guarda em ~/.playlistr/.key

    Retorna a chave base64 codificada.
    """
    _ensure_dir()

    # Tentar usar SECRET_KEY do .env
    secret_key = os.getenv("SECRET_KEY")
    if secret_key:
        # Derivar Fernet key de 44 bytes (base64) de uma string arbitrária
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes
        import base64

        # Ler ou gerar salt
        salt_file = _PLAYLISTR_HOME / ".salt"
        if salt_file.exists():
            salt = salt_file.read_bytes()
        else:
            salt = os.urandom(16)
            salt_file.write_bytes(salt)
            salt_file.chmod(0o600)

        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
        key_bytes = kdf.derive(secret_key.encode())
        key_b64 = base64.urlsafe_b64encode(key_bytes)
        return key_b64.decode()

    # Fallback: ler ou gerar chave em disco
    if _KEY_FILE.exists():
        return _KEY_FILE.read_text().strip()

    # Gerar nova chave
    key = Fernet.generate_key().decode()
    _KEY_FILE.write_text(key)
    _KEY_FILE.chmod(0o600)  # Apenas utilizador pode ler
    log.info("Chave Fernet gerada em %s", _KEY_FILE)
    return key


def _get_cipher() -> Fernet:
    """Retorna uma instância Fernet com a chave actual."""
    key = _get_or_create_key()
    return Fernet(key.encode() if isinstance(key, str) else key)


def load_configs() -> List[StorageConfig]:
    """Carrega e desencripta as configurações de backends."""
    _ensure_dir()

    if not _BACKENDS_FILE.exists():
        return []

    try:
        encrypted_data = _BACKENDS_FILE.read_bytes()
        cipher = _get_cipher()
        decrypted = cipher.decrypt(encrypted_data).decode()
        data = json.loads(decrypted)

        configs = []
        for cfg in data:
            configs.append(StorageConfig(**cfg))
        return configs
    except Exception as exc:
        log.error("Erro ao carregar configs: %s", exc)
        return []


def save_configs(configs: List[StorageConfig]) -> None:
    """Encripta e guarda as configurações."""
    _ensure_dir()

    try:
        data = [cfg.model_dump(exclude_none=True) for cfg in configs]
        json_str = json.dumps(data, ensure_ascii=False, indent=2)
        cipher = _get_cipher()
        encrypted = cipher.encrypt(json_str.encode())
        _BACKENDS_FILE.write_bytes(encrypted)
        log.info("Configs guardadas em %s (encriptadas)", _BACKENDS_FILE)
    except Exception as exc:
        log.error("Erro ao guardar configs: %s", exc)


def add_or_update_config(config: StorageConfig) -> None:
    """Adiciona ou atualiza uma configuração de backend."""
    configs = load_configs()

    # Procurar existente pelo provider + name
    found = False
    for i, cfg in enumerate(configs):
        if cfg.provider == config.provider and cfg.name == config.name:
            configs[i] = config
            found = True
            break

    if not found:
        configs.append(config)

    save_configs(configs)
    log.info("Config %s/%s adicionada/actualizada", config.provider, config.name)


def remove_config(provider: str, name: str) -> None:
    """Remove uma configuração de backend."""
    configs = load_configs()
    configs = [c for c in configs if not (c.provider == provider and c.name == name)]
    save_configs(configs)
    log.info("Config %s/%s removida", provider, name)


def get_config(provider: str, name: str) -> Optional[StorageConfig]:
    """Retorna uma configuração específica."""
    configs = load_configs()
    for cfg in configs:
        if cfg.provider == provider and cfg.name == name:
            return cfg
    return None


def list_configs_by_provider(provider: str) -> List[StorageConfig]:
    """Retorna todas as configs de um provider."""
    configs = load_configs()
    return [c for c in configs if c.provider == provider]
