"""Offline managed-machine and Cloud Save fixtures; never use real credentials."""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from runcomfy.config import TokenStore
from runcomfy.errors import RunComfyError
from runcomfy.journal import RequestJournal
from runcomfy.routes import register_routes


class HostedConfigTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.plugin = self.root / 'custom_nodes' / 'partner-nodes'
        self.plugin.mkdir(parents=True)
        for context in [
            patch.dict(os.environ, {'RUNCOMFY_API_TOKEN_FILE': '/offline/never-read',
                                   'RUNCOMFY_API_TOKEN': 'fixture-owner-default'}, clear=True),
            patch('runcomfy.config.PLUGIN_ROOT', self.plugin),
        ]:
            context.start()
            self.addCleanup(context.stop)

    def test_saved_override_survives_reopen_and_clear_restores_default(self):
        store = TokenStore()
        store.save('fixture-explicit-override')
        self.assertEqual(store.path, self.plugin / 'runcomfy_config.json')
        self.assertEqual(TokenStore().get(), 'fixture-explicit-override')
        self.assertEqual(store.status(), {'configured': True, 'source': 'file'})
        self.assertNotIn('fixture-explicit-override', json.dumps(store.status()))
        if os.name != 'nt':
            self.assertEqual(store.path.stat().st_mode & 0o777, 0o600)
        os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-owner-rotated'
        self.assertEqual(TokenStore().get(), 'fixture-explicit-override')
        store.delete()
        self.assertEqual(TokenStore().get(), 'fixture-owner-rotated')

    def test_share_snapshot_retains_saved_override_and_recovery(self):
        store = TokenStore()
        store.save('fixture-shared-override')
        journal = RequestJournal(store.get())
        journal.record({'request_id': 'shared-job', 'state': 'submitted', 'node_id': '1'})
        snapshot = self.root / 'snapshot'
        shutil.copytree(self.plugin, snapshot)
        with patch('runcomfy.config.PLUGIN_ROOT', snapshot):
            os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-recipient-default'
            self.assertEqual(TokenStore().get(), 'fixture-shared-override')
            self.assertEqual(RequestJournal(TokenStore().get()).recent()[0]['request_id'], 'shared-job')
            TokenStore().delete()
            self.assertEqual(TokenStore().get(), 'fixture-recipient-default')
            self.assertEqual(RequestJournal(TokenStore().get()).recent(), [])
        self.assertEqual(store.get(), 'fixture-shared-override')

    def test_snapshot_without_saved_override_uses_recipient_environment(self):
        self.assertEqual(TokenStore().get(), 'fixture-owner-default')
        snapshot = self.root / 'snapshot'
        shutil.copytree(self.plugin, snapshot)
        self.assertEqual(list(snapshot.iterdir()), [])
        with patch('runcomfy.config.PLUGIN_ROOT', snapshot):
            os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-recipient-default'
            self.assertEqual(TokenStore().get(), 'fixture-recipient-default')

    def test_startup_keeps_existing_saved_configuration_and_partial_files(self):
        saved = self.plugin / 'runcomfy_config.json'
        saved.write_text(json.dumps({'token': 'fixture-existing-override'}))
        partial = self.plugin / 'runcomfy_config.json.abandoned'
        partial.write_text('fixture-incomplete-write')
        server = SimpleNamespace(PromptServer=SimpleNamespace(instance=SimpleNamespace(routes=Mock())))
        with patch.dict(sys.modules, {'server': server}):
            register_routes()
        self.assertTrue(saved.exists())
        self.assertTrue(partial.exists())
        self.assertEqual(TokenStore().get(), 'fixture-existing-override')

    def test_partial_file_is_not_a_saved_token(self):
        partial = self.plugin / 'runcomfy_config.json.abandoned'
        partial.write_text('fixture-incomplete-write')
        self.assertEqual(TokenStore().get(), 'fixture-owner-default')
        self.assertTrue(partial.exists())

    def test_shared_config_path_does_not_require_a_personal_mount_or_user_id(self):
        shared = self.root / 'team' / 'runcomfy_config.json'
        os.environ['RUNCOMFY_CONFIG_PATH'] = str(shared)
        TokenStore().save('fixture-team-override')
        self.assertEqual(TokenStore().path, shared)
        os.environ['USER_ID'] = 'another-team-member'
        os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-other-member'
        self.assertEqual(TokenStore().get(), 'fixture-team-override')
        TokenStore().save('fixture-team-latest')
        self.assertEqual(TokenStore().get(), 'fixture-team-latest')
        self.assertFalse((self.plugin / 'runcomfy_config.json').exists())

    def test_explicit_path_precedes_config_environment_on_managed_machines(self):
        os.environ['RUNCOMFY_CONFIG_PATH'] = str(self.root / 'unused.json')
        path = self.root / 'explicit.json'
        store = TokenStore(path)
        store.save('fixture-explicit-path')
        self.assertEqual(store.path, path)
        self.assertEqual(TokenStore(path).get(), 'fixture-explicit-path')
        self.assertFalse((self.root / 'unused.json').exists())

    def test_empty_hosted_marker_blocks_legacy_environment_and_never_reads_token_file(self):
        os.environ['RUNCOMFY_API_TOKEN_FILE'] = ''
        os.environ.pop('RUNCOMFY_API_TOKEN')
        os.environ['RUNCOMFY_TOKEN'] = 'fixture-legacy'
        with patch.object(Path, 'read_text', side_effect=AssertionError('Must not read injected token file')):
            self.assertFalse(TokenStore().status()['configured'])
            with self.assertRaisesRegex(RunComfyError, 'machine account token is unavailable'):
                TokenStore().get()

    def test_managed_missing_default_accepts_saved_override(self):
        os.environ['RUNCOMFY_API_TOKEN'] = ''
        os.environ['RUNCOMFY_TOKEN'] = 'fixture-legacy-account'
        self.assertFalse(TokenStore().status()['configured'])
        TokenStore().save('fixture-explicit')
        self.assertEqual(TokenStore().get(), 'fixture-explicit')
        TokenStore().delete()
        self.assertFalse(TokenStore().status()['configured'])


if __name__ == '__main__':
    unittest.main()
