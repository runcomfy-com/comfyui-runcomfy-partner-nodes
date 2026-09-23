import asyncio
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import aiohttp
from PIL import Image

from runcomfy.async_media import download_images, download_video
from runcomfy.client import AsyncRunComfyClient
from runcomfy.errors import RunComfyError
from runcomfy.pricing import MODEL_ID


class Response:
    def __init__(self, payload=None, status=200, mime='application/json', chunks=(), stall=False):
        self.payload, self.status, self.headers = payload, status, {'Content-Type': mime}
        self.chunks, self.stall, self.closed = chunks, stall, False
        self.content = self
        self.started = asyncio.Event()

    async def __aenter__(self):
        if isinstance(self.payload, BaseException):
            raise self.payload
        return self

    async def __aexit__(self, *args):
        self.closed = True

    async def json(self):
        return self.payload

    async def iter_chunked(self, _):
        for chunk in self.chunks:
            yield chunk
        self.started.set()
        if self.stall:
            await asyncio.Event().wait()


class Session:
    def __init__(self, *responses):
        self.responses, self.calls, self.closed = list(responses), [], False

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        return self.responses.pop(0)

    def get(self, url, **kwargs):
        return self.request('GET', url, **kwargs)

    async def close(self):
        self.closed = True

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()


class AsyncClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_development_environment_applies_to_every_generation_request(self):
        session = Session(Response({'model_id': MODEL_ID, 'base_price_usd': .1, 'price_unit': 'second'}),
                          Response({'request_id': 'job-1'}), Response({'status': 'in_queue'}), Response({}))
        with patch.dict(os.environ, {'RUNCOMFY_API_ENVIRONMENT': 'development'}):
            client = AsyncRunComfyClient('synthetic-token', session=session)
        await client.price()
        await client.submit({'prompt': 'test'})
        await client.result('job-1')
        await client.cancel('job-1')
        await client.close()
        self.assertEqual(len(session.calls), 4)
        for _, url, options in session.calls:
            self.assertTrue(url.startswith('https://model-api-int.runcomfy.net/v1/'))
            self.assertEqual(options['headers']['Authorization'], 'Bearer synthetic-token')
            self.assertFalse(options['allow_redirects'])

    async def test_invalid_environment_fails_before_creating_an_async_session(self):
        with patch.dict(os.environ, {'RUNCOMFY_API_ENVIRONMENT': 'unknown'}), \
                patch('runcomfy.client.aiohttp.ClientSession') as session_factory:
            with self.assertRaises(RunComfyError) as caught:
                AsyncRunComfyClient('synthetic-token')
        self.assertEqual(caught.exception.code, 'config_error')
        session_factory.assert_not_called()

    async def test_price_submit_result_use_fixed_origin_without_redirects(self):
        responses = [Response({'model_id': MODEL_ID, 'base_price_usd': .1, 'price_unit': 'second'}),
                     Response({'request_id': 'job-1'}), Response({'status': 'in_queue'})]
        session = Session(*responses)
        client = AsyncRunComfyClient('synthetic-token', session=session)
        self.assertEqual((await client.price()).model_id, MODEL_ID)
        self.assertEqual(await client.submit({'prompt': 'test'}), 'job-1')
        await client.result('job-1')
        await client.close()
        self.assertTrue(session.closed)
        self.assertTrue(all(r.closed for r in responses))
        for _, url, options in session.calls:
            self.assertTrue(url.startswith('https://model-api.runcomfy.net/v1/'))
            self.assertEqual(options['headers']['Authorization'], 'Bearer synthetic-token')
            self.assertFalse(options['allow_redirects'])
        self.assertEqual(session.calls[-1][2]['params'], {'include_cost': 'true'})

    async def test_unknown_submission_never_retries(self):
        for response in [Response(aiohttp.ClientConnectionError('synthetic-token')),
                         Response({}, status=503), Response({'wrong': 'key'}), Response([])]:
            session = Session(response)
            client = AsyncRunComfyClient('synthetic-token', session=session)
            with self.assertRaises(RunComfyError) as caught:
                await client.submit({'prompt': 'test'})
            self.assertNotIn('synthetic-token', str(caught.exception))
            self.assertIn('before submitting again', str(caught.exception))
            self.assertEqual(len(session.calls), 1)
            await client.close()

    async def test_auth_failure_is_secret_free_and_not_retryable(self):
        session = Session(Response({'error': 'secret-provider-payload'}, status=401))
        client = AsyncRunComfyClient('synthetic-token', session=session)
        with self.assertRaises(RunComfyError) as caught:
            await client.submit({})
        self.assertEqual(caught.exception.code, 'unauthorized')
        self.assertNotIn('secret-provider-payload', str(caught.exception))
        self.assertEqual(len(session.calls), 1)
        await client.close()


class AsyncMediaTests(unittest.IsolatedAsyncioTestCase):
    async def test_image_download_returns_native_batch_without_credentials(self):
        data = io.BytesIO()
        Image.new('RGB', (16, 24), 'red').save(data, format='PNG')
        response = Response(mime='image/png', chunks=[data.getvalue()])
        session = Session(response)
        image = await download_images(['https://storage.runcomfy.net/x.png'], session_factory=lambda: session)
        self.assertEqual(tuple(image.shape), (1, 24, 16, 3))
        self.assertEqual(float(image[0, 0, 0, 0]), 1)
        self.assertNotIn('headers', session.calls[0][2])
        self.assertFalse(session.calls[0][2]['allow_redirects'])
        self.assertTrue(response.closed and session.closed)

    async def test_video_download_can_be_interrupted_during_stalled_read_and_removes_partial(self):
        response = Response(mime='video/mp4', chunks=[b'partial-video'], stall=True)
        session = Session(response)
        class Stop(Exception):
            pass
        def check():
            if response.started.is_set():
                raise Stop()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(Stop):
                await asyncio.wait_for(download_video('https://storage.runcomfy.net/x.mp4', directory,
                    check_interrupt=check, session_factory=lambda: session), .5)
            self.assertEqual(list(Path(directory).iterdir()), [])
        self.assertTrue(response.closed and session.closed)
        self.assertNotIn('headers', session.calls[0][2])

    async def test_external_task_cancel_closes_response_session_and_partial_file(self):
        response = Response(mime='video/mp4', chunks=[b'partial-video'], stall=True)
        session = Session(response)
        with tempfile.TemporaryDirectory() as directory:
            task = asyncio.create_task(download_video('https://storage.runcomfy.net/x.mp4', directory,
                                                        session_factory=lambda: session))
            await response.started.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertEqual(list(Path(directory).iterdir()), [])
        self.assertTrue(response.closed and session.closed)

    async def test_untrusted_outputs_rejected_before_creating_transport(self):
        def forbidden_session():
            self.fail('untrusted output reached network transport')
        with self.assertRaises(ValueError):
            await download_images(['http://127.0.0.1/private'], session_factory=forbidden_session)
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
            await download_video('https://other.example/private', directory, session_factory=forbidden_session)

    async def test_download_http_error_closes_transport_and_cleans_file(self):
        response = Response(status=503, mime='video/mp4')
        session = Session(response)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RunComfyError):
                await download_video('https://storage.runcomfy.net/x.mp4', directory, session_factory=lambda: session)
            self.assertEqual(list(Path(directory).iterdir()), [])
        self.assertTrue(response.closed and session.closed)
