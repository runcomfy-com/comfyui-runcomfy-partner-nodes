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

    def test_environment_precedence_and_clear(self):
        self.store.save('file-token')
        os.environ['RUNCOMFY_TOKEN'] = 'compat-token'
        os.environ['RUNCOMFY_API_TOKEN'] = 'preferred-token'
        self.assertEqual(self.store.get(), 'preferred-token')
        self.assertEqual(self.store.status()['source'], 'environment')
        self.store.delete()
        self.assertEqual(self.store.get(), 'preferred-token')

    def test_blank_or_header_injection_token_is_rejected(self):
        for token in ['', 'a\nb', 'a\rb', 'a b', None]:
            with self.subTest(token=token), self.assertRaises(ValueError):
                self.store.save(token)

    def test_hosted_token_is_used_without_creating_configuration(self):
        os.environ['RUNCOMFY_API_TOKEN_FILE'] = '/run/runcomfy-credentials/api-token'
        os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-machine-owner'
        os.environ['RUNCOMFY_TOKEN'] = 'fixture-legacy-account'
        self.assertEqual(self.store.get(), 'fixture-machine-owner')
        self.assertEqual(self.store.status(), {'configured': True, 'source': 'environment'})
        self.assertFalse(self.path.exists())

    def test_missing_hosted_token_cannot_revive_saved_or_legacy_account(self):
        self.store.save('fixture-saved-other-account')
        os.environ['RUNCOMFY_TOKEN'] = 'fixture-legacy-other-account'
        for marker in ['/run/runcomfy-credentials/api-token', '']:
            for token in [None, '', '   ']:
                with self.subTest(marker=marker, token=token):
                    os.environ['RUNCOMFY_API_TOKEN_FILE'] = marker
                    if token is None:
                        os.environ.pop('RUNCOMFY_API_TOKEN', None)
                    else:
                        os.environ['RUNCOMFY_API_TOKEN'] = token
                    self.assertEqual(self.store.status(), {'configured': False, 'source': 'none'})
                    with self.assertRaisesRegex(Exception, 'machine account token is unavailable'):
                        self.store.get()

    def test_hosted_environment_overrides_saved_config_and_tracks_rotation(self):
        self.store.save('fixture-saved-other-account')
        os.environ['RUNCOMFY_API_TOKEN_FILE'] = '/run/runcomfy-credentials/api-token'
        for value in ['fixture-owner-original', 'fixture-owner-rotated']:
            os.environ['RUNCOMFY_API_TOKEN'] = value
            self.assertEqual(self.store.get(), value)


if __name__ == '__main__':
    unittest.main()
