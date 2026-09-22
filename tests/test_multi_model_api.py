import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, AsyncMock

from runcomfy.catalog import MODELS
from runcomfy.client import RunComfyClient
from runcomfy.errors import RunComfyError
from runcomfy.execution import async_run_generation as run_generation
from runcomfy.journal import RequestJournal
from runcomfy.pricing import parse_price
from test_client import Response, Session


class MultiModelApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_wrong_node_resume_does_not_assign_unknown_request_to_wrong_model(self):
        first, second = list(MODELS)[:2]
        with tempfile.TemporaryDirectory() as d:
            journal = RequestJournal('token', Path(d) / 'requests.json', model_id=first)
            client = AsyncMock()
            client.result.return_value = {'status': 'completed', 'model_id': second}
            with self.assertRaisesRegex(RunComfyError, 'different'):
                await run_generation(client, {}, 'unknown-job', model_id=first, on_event=journal.record)
            journal.record({'state': 'error', 'request_id': 'unknown-job'})
            RequestJournal('token', journal.path, model_id=second).validate_resume('unknown-job')
            client.submit.assert_not_called()

    async def test_every_node_prices_and_submits_to_its_own_model(self):
        for mid, model in MODELS.items():
            transport = Session(Response({'model_id': mid, 'base_price_usd': .123,
                                          'price_unit': model.price_unit}), Response({'request_id': 'job-1'}))
            client = RunComfyClient('test-token', session=transport, model_id=mid)
            self.assertEqual(client.price().as_dict()['model_id'], mid)
            client.submit({'prompt': 'test'})
            self.assertTrue(all(call[1].endswith('/v1/models/' + mid) for call in transport.calls))

    async def test_different_model_quote_is_rejected(self):
        with self.assertRaises(RunComfyError):
            parse_price({'model_id': 'google/nano-banana-2-lite/edit', 'base_price_usd': .1,
                         'price_unit': 'output'}, 'google/nano-banana-2-lite/text-to-image')

    async def test_quotes_identify_account_without_exposing_token(self):
        from runcomfy.config import account_scope
        mid = next(iter(MODELS))
        response = {'model_id': mid, 'base_price_usd': .1, 'price_unit': 'second'}
        scope = RunComfyClient('secret-one', Session(Response(response))).price().as_dict()['account_scope']
        self.assertEqual(scope, account_scope('secret-one'))
        self.assertNotEqual(scope, account_scope('secret-two'))
        self.assertNotIn('secret-one', scope)

    async def test_variable_pricing_and_auto_duration_have_no_fabricated_total(self):
        for mid, model in MODELS.items():
            price = parse_price({'model_id': mid, 'base_price_usd': .123, 'price_unit': model.price_unit}, mid)
            if model.pricing_mode == 'base':
                self.assertIsNone(price.estimate({'duration': 5, 'resolution': '1080p'}))
                self.assertFalse(price.as_dict()['estimate_supported'])
            elif model.output_type == 'IMAGE':
                self.assertEqual(float(price.estimate({})), .123)
            else:
                self.assertIsNone(price.estimate({'duration': 'auto'}))

    async def test_image_generation_uses_image_output_and_one_submission(self):
        mid = 'google/nano-banana-2-lite/text-to-image'
        client = AsyncMock()
        client.price.return_value = parse_price({'model_id': mid, 'base_price_usd': .036, 'price_unit': 'output'}, mid)
        client.submit.return_value = 'image-job'
        client.result.return_value = {'status': 'completed', 'model_id': mid,
                                      'output': {'images': ['https://storage.runcomfy.net/image.png']}, 'cost': .036}
        result = await run_generation(client, {'prompt': 'a tree'}, output_type='IMAGE', model_id=mid)
        self.assertEqual(result['image_urls'], ['https://storage.runcomfy.net/image.png'])
        self.assertAlmostEqual(result['quote']['estimated_cost_usd'], .036)
        client.submit.assert_called_once()

    async def test_request_journal_retains_actual_model_and_rejects_cross_model_resume(self):
        first, second = list(MODELS)[:2]
        with tempfile.TemporaryDirectory() as d:
            journal = RequestJournal('token', Path(d) / 'requests.json', model_id=first)
            journal.record({'request_id': 'job-1', 'state': 'submitted', 'node_id': '1'})
            self.assertEqual(journal.recent()[0]['model_id'], first)
            RequestJournal('token', journal.path, model_id=first).validate_resume('job-1')
            with self.assertRaises(RunComfyError):
                RequestJournal('token', journal.path, model_id=second).validate_resume('job-1')
