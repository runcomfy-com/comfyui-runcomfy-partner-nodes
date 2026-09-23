"""Offline Cloud Save boundary fixtures; never access real cloud credentials."""
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from runcomfy.config import TokenStore, remove_hosted_legacy_credentials
from runcomfy.errors import RunComfyError
from runcomfy.journal import RequestJournal

OWNER = '11111111-1111-4111-8111-111111111111'
RECIPIENT = '22222222-2222-4222-8222-222222222222'


class HostedConfigTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.plugin = self.root / 'custom_nodes' / 'partner-nodes'
        self.plugin.mkdir(parents=True)
        self.mount = self.root / 'user'
        self.mount.mkdir()
        self.mountinfo = self.root / 'mountinfo'
        for context in [
            patch.dict(os.environ, {'RUNCOMFY_API_TOKEN_FILE': '/offline/never-read',
                                   'RUNCOMFY_CONFIG_PATH': str(self.plugin / 'runcomfy_config.json'),
                                   'RUNCOMFY_API_TOKEN': 'fixture-owner-default', 'USER_ID': OWNER}, clear=True),
            patch('runcomfy.config.ACCOUNT_MOUNT', self.mount, create=True),
            patch('runcomfy.config.MOUNTINFO_PATH', self.mountinfo, create=True),
            patch('runcomfy.config.PLUGIN_ROOT', self.plugin, create=True),
        ]:
            context.start()
            self.addCleanup(context.stop)
        self.mount_owner(OWNER)

    def mount_owner(self, owner):
        # Linux bind mounts retain the original filesystem root in mountinfo.
        mount = str(self.mount).replace(' ', r'\040')
        self.mountinfo.write_text(f'99 1 0:42 /users/user_{owner} {mount} rw - fuse.juicefs JuiceFS:test rw\n')
        os.environ['USER_ID'] = owner

    def test_same_owner_reopens_and_clear_returns_to_injected_account(self):
        store = TokenStore()
        store.save('fixture-explicit-override')
        self.assertTrue(store.path.is_relative_to(self.mount))
        self.assertFalse((self.plugin / 'runcomfy_config.json').exists())
        self.assertEqual(TokenStore().get(), 'fixture-explicit-override')
        self.assertEqual(store.status()['storage_scope'], 'account')
        self.assertNotIn('fixture-explicit-override', json.dumps(store.status()))
        self.assertEqual(store.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(store.path.parent.stat().st_mode & 0o777, 0o700)
        os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-owner-rotated'
        self.assertEqual(TokenStore().get(), 'fixture-explicit-override')
        store.delete()
        self.assertEqual(TokenStore().get(), 'fixture-owner-rotated')

    def test_share_snapshot_cannot_inherit_creator_override_or_recovery(self):
        owner = TokenStore()
        owner.save('fixture-creator-secret')
        journal = RequestJournal(owner.get())
        journal.prepare()
        journal.record({'request_id': 'creator-job', 'state': 'submitted', 'node_id': '1'})
        snapshot = self.root / 'snapshot'
        shutil.copytree(self.plugin, snapshot)
        self.assertEqual(list(snapshot.iterdir()), [])
        owner_config = owner.path
        # Simulate starting the shared workflow with the recipient's private mount.
        with patch('runcomfy.config.ACCOUNT_MOUNT', self.root / 'recipient-user'):
            self.mount = self.root / 'recipient-user'
            self.mount.mkdir()
            self.mount_owner(RECIPIENT)
            os.environ['RUNCOMFY_API_TOKEN'] = 'fixture-recipient-default'
            self.assertEqual(TokenStore().get(), 'fixture-recipient-default')
            self.assertEqual(RequestJournal(TokenStore().get()).recent(), [])
            TokenStore().save('fixture-recipient-override')
            self.assertEqual(TokenStore().get(), 'fixture-recipient-override')
        self.mount = self.root / 'user'
        self.mount_owner(OWNER)
        self.assertEqual(TokenStore().path, owner_config)
        self.assertEqual(TokenStore().get(), 'fixture-creator-secret')
        self.assertEqual(RequestJournal(TokenStore().get()).recent()[0]['request_id'], 'creator-job')

    def test_legacy_snapshot_token_is_removed_without_import_or_read(self):
        legacy = self.plugin / 'runcomfy_config.json'
        legacy.write_text('not-even-json: fixture-creator-secret')
        partial = self.plugin / 'runcomfy_config.json.abandoned'
        partial.write_text('fixture-partial-secret')
        os.environ['RUNCOMFY_CONFIG_PATH'] = str(legacy)
        self.assertEqual(TokenStore().get(), 'fixture-owner-default')
        self.assertFalse(legacy.exists())
        self.assertFalse(partial.exists())
        self.assertTrue(TokenStore().status()['legacy_config_removed'])
        self.assertFalse(TokenStore().path.exists())

    def test_startup_cleanup_does_not_require_a_config_request_or_follow_symlinks(self):
        target = self.root / 'do-not-read-or-delete.json'
        target.write_text('fixture-unrelated-private-data')
        legacy = self.plugin / 'runcomfy_config.json'
        legacy.symlink_to(target)
        with patch.object(Path, 'read_text', side_effect=AssertionError('Cleanup must not read files')):
            remove_hosted_legacy_credentials()
        self.assertFalse(legacy.is_symlink())
        self.assertTrue(target.exists())

    def test_empty_hosted_marker_and_absent_token_still_block_legacy_environment(self):
        os.environ['RUNCOMFY_API_TOKEN_FILE'] = ''
        os.environ.pop('RUNCOMFY_API_TOKEN')
        os.environ['RUNCOMFY_TOKEN'] = 'fixture-legacy'
        self.assertFalse(TokenStore().status()['configured'])
        self.assertFalse(TokenStore().path.exists())
        with self.assertRaisesRegex(RunComfyError, 'machine account token is unavailable'):
            TokenStore().get()

    def test_environment_config_override_cannot_redirect_managed_storage(self):
        unsafe = self.plugin / 'unsafe.json'
        os.environ['RUNCOMFY_CONFIG_PATH'] = str(unsafe)
        store = TokenStore(unsafe)
        store.save('fixture-private')
        self.assertFalse(unsafe.exists())
        self.assertTrue(store.path.is_relative_to(self.mount))

    def test_missing_wrong_shared_or_nested_mount_fails_before_saving(self):
        valid = self.mountinfo.read_text()
        for contents in ['', valid.replace(OWNER, RECIPIENT),
                         valid.replace('/users/user_' + OWNER, '/groups/team'),
                         valid + f'100 99 0:43 /shared {self.mount}/.runcomfy rw - ext4 /dev/test rw\n']:
            with self.subTest(contents=contents):
                self.mountinfo.write_text(contents)
                with self.assertRaisesRegex(RunComfyError, 'private account storage'):
                    TokenStore().save('fixture-must-not-be-written')
                self.assertEqual(list(self.mount.iterdir()), [])
        self.mountinfo.write_text(valid)
        os.environ.pop('USER_ID')
        with self.assertRaisesRegex(RunComfyError, 'private account storage'):
            TokenStore().get()

    def test_symlink_outside_private_mount_is_rejected_without_reading(self):
        outside = self.root / 'outside'
        outside.mkdir()
        (self.mount / '.runcomfy').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(RunComfyError, 'private account storage'):
            TokenStore().save('fixture-no-escape')
        self.assertEqual(list(outside.iterdir()), [])

    def test_managed_missing_default_accepts_only_private_saved_override(self):
        os.environ['RUNCOMFY_API_TOKEN'] = ''
        os.environ['RUNCOMFY_TOKEN'] = 'fixture-legacy-account'
        self.assertFalse(TokenStore().status()['configured'])
        with self.assertRaisesRegex(RunComfyError, 'machine account token is unavailable'):
            TokenStore().get()
        TokenStore().save('fixture-explicit')
        self.assertEqual(TokenStore().get(), 'fixture-explicit')
        TokenStore().delete()
        self.assertFalse(TokenStore().status()['configured'])

    def test_production_and_development_overrides_are_separate(self):
        TokenStore().save('fixture-production')
        os.environ['RUNCOMFY_API_ENVIRONMENT'] = 'development'
        self.assertEqual(TokenStore().get(), 'fixture-owner-default')
        TokenStore().save('fixture-development')
        self.assertEqual(TokenStore().get(), 'fixture-development')
        os.environ['RUNCOMFY_API_ENVIRONMENT'] = 'production'
        self.assertEqual(TokenStore().get(), 'fixture-production')


if __name__ == '__main__':
    unittest.main()
