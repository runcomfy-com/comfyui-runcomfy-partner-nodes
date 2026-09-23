import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    from runcomfy.config import TokenStore
except ImportError:
    TokenStore = None


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(TokenStore, 'Token storage is not implemented yet')
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.path = Path(self.directory.name) / 'config.json'
        self.store = TokenStore(self.path)

    def test_owner_only_storage_and_secret_free_status(self):
        self.store.save('test-token')
        self.assertEqual(self.store.get(), 'test-token')
        if os.name != 'nt':
            self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.store.status(), {'configured': True, 'source': 'file'})
        self.assertNotIn('test-token', json.dumps(self.store.status()))
        self.store.delete()
        self.assertEqual(self.store.status(), {'configured': False, 'source': 'none'})

    def test_saved_token_precedence_replacement_and_clear(self):
        self.store.save('file-token')
        os.environ['RUNCOMFY_TOKEN'] = 'compat-token'
        os.environ['RUNCOMFY_API_TOKEN'] = 'preferred-token'
        self.assertEqual(self.store.get(), 'file-token')
        self.assertEqual(self.store.status()['source'], 'file')
        self.store.save('latest-file-token')
        self.assertEqual(TokenStore(self.path).get(), 'latest-file-token')
        self.store.delete()
        self.assertEqual(self.store.get(), 'preferred-token')
        self.assertEqual(self.store.status()['source'], 'environment')
        del os.environ['RUNCOMFY_API_TOKEN']
        self.assertEqual(self.store.get(), 'compat-token')

    def test_blank_or_header_injection_token_is_rejected(self):
        for token in ['', 'a\nb', 'a\rb', 'a b', None]:
            with self.subTest(token=token), self.assertRaises(ValueError):
                self.store.save(token)

    def test_empty_saved_configuration_uses_environment(self):
        os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-environment'
        for data in [{}, {'token': ''}, {'token': '   '}]:
            self.path.write_text(json.dumps(data))
            self.assertEqual(self.store.get(), 'fixture-environment')

    def test_invalid_saved_override_does_not_silently_bill_environment_account(self):
        os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-environment'
        self.path.write_text('{broken')
        with self.assertRaisesRegex(Exception, 'Cannot read RunComfy token configuration'):
            self.store.get()


if __name__ == '__main__':
    unittest.main()
