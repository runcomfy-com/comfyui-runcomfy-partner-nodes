import hashlib
import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from .config import TokenStore
from .pricing import MODEL_ID
from .catalog import get_model
from .errors import RunComfyError
from .storage import atomic_write_json

_lock = threading.RLock()


class RequestJournal:
    """Local recovery metadata, partitioned by a hash of the configured token."""

    def __init__(self, token, path=None, model_id=MODEL_ID):
        self.model_id = get_model(model_id).model_id
        self.owner = hashlib.sha256(token.encode('utf-8')).hexdigest()
        self.path = Path(path or TokenStore().path.with_name('runcomfy_requests.json'))

    def _read(self):
        if not self.path.exists():
            return []
        try:
            records = json.loads(self.path.read_text())
            if not isinstance(records, list) or any(not isinstance(r, dict) for r in records):
                raise ValueError('Invalid journal')
            return records
        except (ValueError, UnicodeError):
            raise OSError('Cannot read RunComfy request recovery records.') from None

    def _write(self, records):
        atomic_write_json(self.path, records)

    def prepare(self):
        # Verify durable recovery is writable before submitting a paid request.
        with _lock:
            self._write(self._read())

    def record(self, event):
        request_id = event.get('request_id')
        if not request_id:
            return
        with _lock:
            records = self._read()
            previous = next((r for r in records if r.get('owner') == self.owner and
                             r.get('request_id') == request_id), None)
            if previous and previous.get('state') == event.get('state') and previous.get('node_id') == event.get('node_id'):
                return
            now = datetime.now(timezone.utc).isoformat()
            # Only a successful submission proves which model owns a new local record.
            # An imported request may be resumed on the wrong node; do not assign it
            # that node's identity before the remote model can be verified.
            known_model = previous.get('model_id') if previous else None
            if event.get('state') == 'submitted':
                known_model = self.model_id
            record = {'owner': self.owner, 'request_id': request_id, 'model_id': known_model,
                      'node_id': event.get('node_id'), 'state': event.get('state'),
                      'created_at': previous['created_at'] if previous else now, 'updated_at': now}
            remaining = [r for r in records if not (r.get('owner') == self.owner and r.get('request_id') == request_id)]
            self._write([record, *remaining][:100])

    def recent(self):
        with _lock:
            return [{k: v for k, v in record.items() if k != 'owner'}
                    for record in self._read() if record.get('owner') == self.owner][:20]

    def validate_resume(self, request_id):
        with _lock:
            for record in self._read():
                if record.get('owner') == self.owner and record.get('request_id') == request_id:
                    if record.get('model_id') and record['model_id'] != self.model_id:
                        raise RunComfyError('This request belongs to a different RunComfy model.', 'model_mismatch', 400)
