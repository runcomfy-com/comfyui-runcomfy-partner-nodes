import csv
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def _restrict_owner(fd, path):
    if sys.platform != 'win32':
        os.fchmod(fd, 0o600)
        return
    # Windows chmod does not restrict ACLs. Protect the empty temporary file
    # using the current process account's SID before writing any private data.
    system32 = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32')
    try:
        identity = subprocess.run([os.path.join(system32, 'whoami.exe'), '/user', '/fo', 'csv', '/nh'],
                                  capture_output=True, text=True, errors='replace', timeout=15, check=True)
        row = next(csv.reader(io.StringIO(identity.stdout)))
        sid = row[1]
        if not re.fullmatch(r'S-1-(?:\d+-)+\d+', sid):
            raise ValueError('Invalid account SID')
        subprocess.run([os.path.join(system32, 'icacls.exe'), str(path), '/inheritance:r',
                        '/grant:r', '*%s:(F)' % sid], capture_output=True, timeout=15, check=True)
    except (OSError, subprocess.SubprocessError, ValueError, IndexError, StopIteration):
        raise OSError('Cannot restrict RunComfy storage permissions to the current Windows account.') from None


def atomic_write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            _restrict_owner(stream.fileno(), temp)
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
