import json
import hashlib
import hmac
import os
import re
import threading
from pathlib import Path
from uuid import UUID

from .errors import RunComfyError
from .storage import atomic_write_json

_lock = threading.RLock()
_scope_key = os.urandom(32)
PLUGIN_ROOT = Path(__file__).resolve().parent.parent
ACCOUNT_MOUNT = Path('/user')
MOUNTINFO_PATH = Path('/proc/self/mountinfo')
_removed_legacy = set()


def remove_hosted_legacy_credentials():
    """Unowned snapshot credentials must never be imported into another account.

    Unlink only our known credential file and its atomic-write leftovers, without
    opening them (including symlink targets). Run at startup, before Cloud Save.
    """
    if 'RUNCOMFY_API_TOKEN_FILE' not in os.environ:
        return
    with _lock:
        for path in [PLUGIN_ROOT / 'runcomfy_config.json',
                     *PLUGIN_ROOT.glob('runcomfy_config.json.*')]:
            try:
                path.unlink()
                _removed_legacy.add(PLUGIN_ROOT)
            except FileNotFoundError:
                pass


def private_account_path():
    """Use only the hosting service's persistent, owner-specific bind mount.

    /user can also be a team or ephemeral directory. Check Linux mountinfo,
    including bind mounts on the same filesystem, rather than directory existence
    or ismount(). Never create /user or fall back into the container image.
    """
    try:
        owner = str(UUID(os.environ.get('USER_ID', '')))
        mount = ACCOUNT_MOUNT.absolute()
        environment = os.environ.get('RUNCOMFY_API_ENVIRONMENT', 'production')
        if environment not in ('production', 'development'):
            raise ValueError('Invalid environment')
        path = mount / '.runcomfy' / 'partner-nodes' / environment / 'runcomfy_config.json'
        if not mount.is_dir() or path.resolve() != path:
            raise ValueError('Unsafe private path')
        found = False
        for line in MOUNTINFO_PATH.read_text().splitlines():
            fields = line.split()
            if len(fields) < 7:
                continue
            decode = lambda value: re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), value)
            root, target = decode(fields[3]), Path(decode(fields[4]))
            if target == mount:
                found = root.endswith('/users/user_' + owner) and 'rw' in fields[5].split(',')
            elif target.is_relative_to(mount) and path.is_relative_to(target):
                raise ValueError('Unexpected nested mount')
        if not found:
            raise ValueError('Missing owner mount')
        return path
    except (OSError, ValueError, RuntimeError):
        raise RunComfyError(
            'RunComfy private account storage is unavailable. Restart the machine or ask support to restore its private account mount.',
            'private_storage_unavailable', 503) from None


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
        self._local_path = Path(path or os.environ.get('RUNCOMFY_CONFIG_PATH') or
                                PLUGIN_ROOT / 'runcomfy_config.json')

    @property
    def path(self):
        if 'RUNCOMFY_API_TOKEN_FILE' in os.environ:
            remove_hosted_legacy_credentials()
            # Ignore local path overrides inherited from a saved machine image.
            return private_account_path()
        return self._local_path

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
        status = {'configured': bool(token), 'source': source}
        if 'RUNCOMFY_API_TOKEN_FILE' in os.environ:
            status.update(storage_scope='account', legacy_config_removed=PLUGIN_ROOT in _removed_legacy)
        return status

    def save(self, token):
        token = validate_token(token)
        with _lock:
            path = self.path
            if 'RUNCOMFY_API_TOKEN_FILE' in os.environ:
                # The mount has already been checked; new private directories
                # and the atomic token file receive owner-only permissions.
                for directory in reversed(path.parent.relative_to(ACCOUNT_MOUNT).parents):
                    (ACCOUNT_MOUNT / directory).mkdir(mode=0o700, exist_ok=True)
                path.parent.mkdir(mode=0o700, exist_ok=True)
                path.parent.chmod(0o700)
            atomic_write_json(path, {'token': token})

    def delete(self):
        with _lock:
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass
