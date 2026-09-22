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
        self.path = Path(path or os.environ.get('RUNCOMFY_CONFIG_PATH') or
                         Path(__file__).resolve().parent.parent / 'runcomfy_config.json')

    def _read(self):
        if 'RUNCOMFY_API_TOKEN_FILE' in os.environ:
            # Hosted startup owns this credential. An empty injected value must
            # not revive another account's config embedded in a saved image.
            token = os.environ.get('RUNCOMFY_API_TOKEN', '').strip()
            return (validate_token(token), 'environment') if token else (None, 'none')
        for key in ('RUNCOMFY_API_TOKEN', 'RUNCOMFY_TOKEN'):
            if os.environ.get(key, '').strip():
                return validate_token(os.environ[key]), 'environment'
        with _lock:
            if self.path.exists():
                try:
                    data = json.loads(self.path.read_text())
                    if data.get('token'):
                        return validate_token(data['token']), 'file'
                except (OSError, ValueError, AttributeError):
                    raise RunComfyError('Cannot read RunComfy token configuration. Configure it again.',
                                        'config_error', 400) from None
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
