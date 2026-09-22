import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

try:
    from runcomfy.storage import atomic_write_json
except ImportError:
    atomic_write_json = None


class StorageTests(unittest.TestCase):
    def test_windows_acl_is_applied_before_writing_private_data(self):
        self.assertIsNotNone(atomic_write_json)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            def run(command, **kwargs):
                self.assertNotIn('secret-token', str(command))
                if command[0].endswith('whoami.exe'):
                    return Mock(stdout='"DOMAIN\\User","S-1-5-21-123-456-789-1001"\n')
                self.assertEqual(command[2:], ['/inheritance:r', '/grant:r', '*S-1-5-21-123-456-789-1001:(F)'])
                self.assertEqual(Path(command[1]).read_bytes(), b'')
                return Mock(stdout='')
            with patch('runcomfy.storage.sys.platform', 'win32'), \
                    patch('runcomfy.storage.subprocess.run', side_effect=run) as command:
                atomic_write_json(path, {'token': 'secret-token'})
            self.assertEqual(command.call_count, 2)
            self.assertEqual(json.loads(path.read_text())['token'], 'secret-token')

    def test_windows_acl_failure_preserves_previous_file_and_removes_temp(self):
        self.assertIsNotNone(atomic_write_json)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            path.write_text('previous')
            with patch('runcomfy.storage.sys.platform', 'win32'), \
                    patch('runcomfy.storage.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'icacls')):
                with self.assertRaises(OSError):
                    atomic_write_json(path, {'token': 'secret-token'})
            self.assertEqual(path.read_text(), 'previous')
            self.assertEqual(list(Path(directory).iterdir()), [path])
