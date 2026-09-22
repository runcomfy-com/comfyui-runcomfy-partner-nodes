import tempfile
import os
import unittest
from pathlib import Path

try:
    from runcomfy.journal import RequestJournal
except ImportError:
    RequestJournal = None


class JournalTests(unittest.TestCase):
    def test_request_survives_reload_and_other_accounts_cannot_see_it(self):
        self.assertIsNotNone(RequestJournal, 'Persistent request recovery is not implemented yet')
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'requests.json'
            first = RequestJournal('account-a-token', path)
            first.prepare()
            first.record({'request_id': 'job-a', 'node_id': '2', 'state': 'submitted'})
            first.record({'request_id': 'job-a', 'node_id': '2', 'state': 'interrupted'})
            again = RequestJournal('account-a-token', path)
            self.assertEqual(again.recent()[0]['request_id'], 'job-a')
            self.assertEqual(again.recent()[0]['state'], 'interrupted')
            self.assertEqual(RequestJournal('other-token', path).recent(), [])
            self.assertNotIn('account-a-token', path.read_text())
            if os.name != 'nt':
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
