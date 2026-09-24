import json
import hashlib
import hmac
import os
import threading
from pathlib import Path

from .errors import RunComfyError
from .storage import atomic_write_json

_lock = threading.RLock()
_scope_key = os.urandom(32)
PLUGIN_ROOT = Path(__file__).resolve().parent.parent


def account_scope(token):
    """Opaque process-local marker to discard late events after an account switch."""
    return hmac.new(_scope_key, token.encode('utf-8'), hashlib.sha256).hexdigest()


def validate_token(token):
    if not isinstance(token, str):
        raise ValueError('Enter a RunComfy API Token.')
    token = token.strip()
    if not token or len(token) > 8192 or any(c.isspace() or ord(c) < 33 or ord(c) > 126 for c in token):
        raise ValueError('Enter a valid RunComfy API Token without whitespace.')
    return token


class TokenStore:
    def __init__(self, path=None):
        # Keep manually saved overrides with the plugin so Cloud Save retains
        # them. A configured shared path is also valid on managed machines.
        self.path = Path(path or os.environ.get('RUNCOMFY_CONFIG_PATH') or
                         PLUGIN_ROOT / 'runcomfy_config.json')

    def _read(self):
        # Settings is an explicit account override, including on hosted machines.
        # Invalid overrides fail closed instead of charging the default account.
        with _lock:
            path = self.path
            if path.exists():
                try:
                    data = json.loads(path.read_text())
                    token = data.get('token')
                    if isinstance(token, str):
                        token = token.strip()
                    if token is not None and token != '':
                        return validate_token(token), 'file'
                except (OSError, ValueError, AttributeError):
                    raise RunComfyError('Cannot read RunComfy token configuration. Configure it again.',
                                        'config_error', 400) from None
        if 'RUNCOMFY_API_TOKEN_FILE' in os.environ:
            # Startup owns the default account. Without an explicit override,
            # a missing injected token must not revive legacy credentials.
            token = os.environ.get('RUNCOMFY_API_TOKEN', '').strip()
            return (validate_token(token), 'environment') if token else (None, 'none')
        for key in ('RUNCOMFY_API_TOKEN', 'RUNCOMFY_TOKEN'):
            if os.environ.get(key, '').strip():
                return validate_token(os.environ[key]), 'environment'
        return None, 'none'

    def get(self):
        token, _ = self._read()
        if not token:
            if 'RUNCOMFY_API_TOKEN_FILE' in os.environ:
                raise RunComfyError('The machine account token is unavailable. Restart your RunComfy machine to reconnect.',
                                    'not_configured', 401)
            raise RunComfyError('Configure your API Token in ComfyUI Settings > RunComfy before continuing.',
                                'not_configured', 401)
        return token

    def status(self):
        token, source = self._read()
        return {'configured': bool(token), 'source': source}

    def save(self, token):
        token = validate_token(token)
        with _lock:
            atomic_write_json(self.path, {'token': token})

    def delete(self):
        with _lock:
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass
