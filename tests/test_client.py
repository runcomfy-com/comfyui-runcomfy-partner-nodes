import os
import unittest
from decimal import Decimal
from unittest.mock import patch

import requests

try:
    from runcomfy.client import RunComfyClient, RunComfyError
    from runcomfy.pricing import MODEL_ID, parse_price
except ImportError:
    RunComfyClient = None
    MODEL_ID = 'bytedance/seedance-2.5/image-to-video/1080p'


class Response:
    def __init__(self, data, status=200):
        self.data = data
        self.status_code = status

    def json(self):
        return self.data

    def close(self):
        pass


class Session:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def catalog(price=0.57, **kwargs):
    return {'model_id': MODEL_ID, 'base_price_usd': price, 'price_unit': 'second', **kwargs}


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(RunComfyClient, 'RunComfy API client is not implemented yet')

    def test_each_price_read_fetches_current_api_price(self):
        transport = Session(Response(catalog()), Response(catalog(0.63)))
        client = RunComfyClient('secret-test-token', session=transport)
        first, second = client.price(), client.price()
        self.assertEqual(first.estimate(5), Decimal('2.85'))
        self.assertEqual(second.estimate(5), Decimal('3.15'))
        self.assertEqual(len(transport.calls), 2)
        for method, url, kw in transport.calls:
            self.assertEqual(method, 'GET')
            self.assertEqual(url, 'https://model-api.runcomfy.net/v1/models/' + MODEL_ID)
            self.assertEqual(kw['headers']['Cache-Control'], 'no-cache')
            self.assertFalse(kw['allow_redirects'])

    def test_development_environment_uses_its_own_api_for_all_operations(self):
        transport = Session(Response(catalog()), Response({'request_id': 'job-1'}),
                            Response({'status': 'completed'}), Response({}))
        with patch.dict(os.environ, {'RUNCOMFY_API_ENVIRONMENT': 'development'}):
            client = RunComfyClient('development-token', session=transport)
        client.price()
        client.submit({'prompt': 'motion'})
        client.result('job-1')
        client.cancel('job-1')
        self.assertEqual(len(transport.calls), 4)
        for _, url, kwargs in transport.calls:
            self.assertTrue(url.startswith('https://model-api-int.runcomfy.net/v1/'))
            self.assertEqual(kwargs['headers']['Authorization'], 'Bearer development-token')
            self.assertFalse(kwargs['allow_redirects'])

    def test_unknown_api_environment_is_rejected_before_sending_credentials(self):
        transport = Session()
        with patch.dict(os.environ, {'RUNCOMFY_API_ENVIRONMENT': 'https://untrusted.example'}):
            with self.assertRaises(RunComfyError) as caught:
                RunComfyClient('private-token', session=transport).price()
        self.assertEqual(caught.exception.code, 'config_error')
        self.assertEqual(transport.calls, [])
        self.assertNotIn('private-token', str(caught.exception))

    def test_missing_or_invalid_price_never_becomes_free(self):
        for value in [None, True, -1, float('nan'), float('inf'), '0.57']:
            with self.subTest(price=value), self.assertRaises(RunComfyError):
                parse_price(catalog(value))
        for changes in [{'price_unit': 'output'}, {'model_id': 'different-model'}]:
            with self.assertRaises(RunComfyError):
                parse_price(catalog(**changes))
        self.assertEqual(parse_price(catalog(0)).estimate(5), Decimal(0))

    def test_price_failure_does_not_fall_back_to_previous_quote(self):
        client = RunComfyClient('token', session=Session(Response(catalog()), Response({}, 503)))
        client.price()
        with self.assertRaises(RunComfyError):
            client.price()

    def test_submit_timeout_is_never_retried(self):
        transport = Session(requests.Timeout('sensitive network detail'))
        client = RunComfyClient('secret', session=transport)
        with self.assertRaises(RunComfyError) as caught:
            client.submit({'prompt': 'motion', 'image': 'data:image/png;base64,AA=='})
        self.assertEqual(len(transport.calls), 1)
        self.assertIn('not automatically retried', str(caught.exception))
        self.assertNotIn('sensitive', str(caught.exception))

    def test_result_uses_own_api_origin_and_includes_cost(self):
        transport = Session(Response({'request_id': 'job-1'}), Response({'status': 'completed', 'cost': 2.85}))
        client = RunComfyClient('token', session=transport)
        self.assertEqual(client.submit({'prompt': 'motion'}), 'job-1')
        self.assertEqual(client.result('job-1')['cost'], 2.85)
        self.assertTrue(transport.calls[-1][1].endswith('/v1/requests/job-1/result'))
        self.assertEqual(transport.calls[-1][2]['params'], {'include_cost': 'true'})
        with self.assertRaises(RunComfyError):
            client.result('../another')

    def test_ambiguous_submit_responses_advise_recovery_and_never_retry(self):
        for response in [Response({}, 502), Response([]), Response({})]:
            transport = Session(response)
            with self.subTest(response=response), self.assertRaises(RunComfyError) as caught:
                RunComfyClient('token', session=transport).submit({'prompt': 'motion'})
            self.assertIn('before submitting again', str(caught.exception))
            self.assertEqual(len(transport.calls), 1)

    def test_api_errors_do_not_leak_token_or_provider_body(self):
        client = RunComfyClient('private-token', session=Session(Response({'error': 'private-token'}, 401)))
        with self.assertRaises(RunComfyError) as caught:
            client.price()
        self.assertNotIn('private-token', str(caught.exception))
        self.assertEqual(caught.exception.code, 'unauthorized')


if __name__ == '__main__':
    unittest.main()
