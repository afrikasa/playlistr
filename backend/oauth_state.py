"""
backend/oauth_state.py
──────────────────────
Gerenciamento de OAuth state para validação CSRF nos storage backends.

Uso:
    1. Ao iniciar fluxo OAuth: state = store_oauth_state("gdrive", "meu-drive")
    2. Incluir state no URL de OAuth: auth_url + f"&state={state}"
    3. No callback OAuth: is_valid, provider, name = validate_oauth_state(state, "gdrive")
"""

import secrets
import threading
import time
import logging
from typing import Optional

log = logging.getLogger(__name__)

# Dicionário de estados pendentes: {state → (provider, backend_name, timestamp)}
_oauth_pending_states: dict[str, tuple[str, str, float]] = {}
_oauth_state_lock = threading.Lock()


def generate_oauth_state() -> str:
    """Gera um state aleatório e seguro para OAuth (CSRF protection)."""
    return secrets.token_urlsafe(32)


def store_oauth_state(provider: str, backend_name: str) -> str:
    """Gera e armazena state para um fluxo OAuth. Retorna o state gerado.

    Args:
        provider: "gdrive", "dropbox", "onedrive", etc.
        backend_name: Nome identificador do backend (ex: "meu-drive")

    Returns:
        state: String aleatória segura para incluir no URL de OAuth
    """
    state = generate_oauth_state()
    with _oauth_state_lock:
        _oauth_pending_states[state] = (provider, backend_name, time.time())
    return state


def validate_oauth_state(state: str, expected_provider: Optional[str] = None) -> tuple[bool, str, str]:
    """Valida um state recebido no callback OAuth.

    SEGURANÇA:
    - Remove o state após validação (um único uso, protege contra replay attacks)
    - Valida expiração (10 minutos)
    - Verifica provider esperado se fornecido

    Args:
        state: State recebido no callback OAuth
        expected_provider: Provider esperado (ex: "gdrive"), ou None para aceitar qualquer

    Returns:
        (is_valid, provider, backend_name)
        Se inválido: (False, "", "")
    """
    with _oauth_state_lock:
        entry = _oauth_pending_states.pop(state, None)

    if not entry:
        log.warning("OAuth state não encontrado ou já usado: %s", state[:8] + "...")
        return False, "", ""

    provider, backend_name, timestamp = entry

    # Verificar expiração (10 minutos)
    if time.time() - timestamp > 600:
        log.warning("OAuth state expirado para %s:%s", provider, backend_name)
        return False, "", ""

    # Verificar provider
    if expected_provider and provider != expected_provider:
        log.warning(
            "OAuth state para provider errado: esperado %s, recebido %s",
            expected_provider, provider
        )
        return False, "", ""

    return True, provider, backend_name
