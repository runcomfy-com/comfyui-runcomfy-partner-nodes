"""Bind a prompt's cached identity to its execution account without storing tokens."""
from collections import OrderedDict
import threading

_lock = threading.RLock()
_prompts = OrderedDict()
MAX_PROMPTS = 32


def execution_context():
    try:
        from comfy_execution.utils import get_executing_context
        return get_executing_context()
    except ImportError:
        return None


def remember_account_scope(scope, context):
    if context is None:
        return scope
    with _lock:
        scopes = _prompts.setdefault(context.prompt_id, {})
        _prompts.move_to_end(context.prompt_id)
        # Repeated fingerprint calls within one prompt retain its original account.
        scope = scopes.setdefault(str(context.node_id), scope)
        while len(_prompts) > MAX_PROMPTS:
            _prompts.popitem(last=False)
        return scope


def expected_account_scope(context):
    if context is None:
        return None
    with _lock:
        return _prompts.get(context.prompt_id, {}).get(str(context.node_id))
