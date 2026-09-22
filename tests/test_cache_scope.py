import unittest
from types import SimpleNamespace
from unittest.mock import patch
from collections import OrderedDict

from runcomfy.cache_scope import remember_account_scope, expected_account_scope, MAX_PROMPTS


class CacheScopeTests(unittest.TestCase):
    def test_prompt_scopes_are_bounded_and_repeat_fingerprints_retain_original_identity(self):
        with patch('runcomfy.cache_scope._prompts', OrderedDict()) as prompts:
            original = SimpleNamespace(prompt_id='original', node_id='1:2')
            self.assertEqual(remember_account_scope('opaque-a', original), 'opaque-a')
            self.assertEqual(remember_account_scope('opaque-b', original), 'opaque-a')
            self.assertEqual(expected_account_scope(original), 'opaque-a')
            for index in range(MAX_PROMPTS):
                remember_account_scope('opaque-c', SimpleNamespace(prompt_id=str(index), node_id='1:2'))
            self.assertEqual(len(prompts), MAX_PROMPTS)
            self.assertIsNone(expected_account_scope(original))
            self.assertEqual(expected_account_scope(SimpleNamespace(prompt_id='0', node_id='1:2')), 'opaque-c')
            self.assertIsNone(expected_account_scope(SimpleNamespace(prompt_id='0', node_id='2')))
