import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from runcomfy.config import TokenStore
from runcomfy.journal import RequestJournal
from runcomfy.pricing import MODEL_ID, parse_price
from runcomfy.catalog import MODELS

try:
    from runcomfy.routes import create_routes
except ImportError:
    create_routes = None


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.assertIsNotNone(create_routes, 'ComfyUI routes not implemented yet')
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = TokenStore(Path(self.directory.name) / 'config.json')
        self.client_api = Mock()
        self.client_api.price.return_value = parse_price({'model_id': MODEL_ID,
                                                         'base_price_usd': 0.63, 'price_unit': 'second'})
        app = web.Application()
        self.factory = Mock(return_value=self.client_api)
        self.queue = Mock()
        self.queue.get_current_queue_volatile.return_value = ([], [])
        self.queue.get_history.return_value = {}
        app.add_routes(create_routes(self.store, client_factory=self.factory, prompt_queue=self.queue))
        self.http = TestClient(TestServer(app))
        await self.http.start_server()

    async def asyncTearDown(self):
        if hasattr(self, 'http'):
            await self.http.close()

    async def test_price_route_is_no_store_and_reads_each_time(self):
        self.store.save('unit-test-token')
        for _ in range(2):
            response = await self.http.get('/runcomfy/seedance-25/price')
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual((await response.json())['unit_price_usd'], 0.63)
        self.assertEqual(self.client_api.price.call_count, 2)

    async def test_model_price_route_selects_each_canonical_model_without_cache(self):
        self.store.save('unit-test-token')
        for mid, model in MODELS.items():
            self.client_api.price.return_value = parse_price(
                {'model_id': mid, 'base_price_usd': .123, 'price_unit': model.price_unit}, mid)
            response = await self.http.get('/runcomfy/models/price', params={'model_id': mid})
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual((await response.json())['model_id'], mid)
            self.factory.assert_called_with(self.store.get(), model_id=mid)
        self.assertEqual(self.client_api.price.call_count, len(MODELS))

    async def test_unknown_model_is_rejected_before_external_request(self):
        response = await self.http.get('/runcomfy/models/price', params={'model_id': 'unknown/model'})
        self.assertEqual(response.status, 400)
        self.factory.assert_not_called()

    async def test_credential_mutation_requires_custom_header_and_same_origin(self):
        for headers in [{}, {'X-RunComfy-Client': 'comfyui', 'Origin': 'https://evil.example'}]:
            response = await self.http.post('/runcomfy/config', json={'token': 'new-token'}, headers=headers)
            self.assertEqual(response.status, 403)
        self.assertFalse(self.store.path.exists())

    async def test_save_validates_token_and_never_echoes_it(self):
        response = await self.http.post('/runcomfy/config', json={'token': 'new-token'},
                                        headers={'X-RunComfy-Client': 'comfyui'})
        self.assertEqual(response.status, 200)
        self.assertNotIn('new-token', await response.text())

    async def test_same_host_wrong_scheme_is_not_same_origin(self):
        origin = str(self.http.make_url('/')).rstrip('/').replace('http:', 'https:')
        response = await self.http.post('/runcomfy/config', json={'token': 'new-token'},
                                        headers={'X-RunComfy-Client': 'comfyui', 'Origin': origin})
        self.assertEqual(response.status, 403)
        response = await self.http.get('/runcomfy/config')
        self.assertNotIn('new-token', await response.text())

    async def test_recent_requests_survive_journal_reload_and_do_not_expose_owner(self):
        self.store.save('unit-test-token')
        journal = RequestJournal(self.store.get(), self.store.path.with_name('runcomfy_requests.json'))
        journal.prepare()
        journal.record({'request_id': 'existing-job', 'node_id': '2', 'state': 'interrupted'})
        response = await self.http.get('/runcomfy/requests')
        self.assertEqual(response.status, 200)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        result = await response.json()
        self.assertEqual(result['requests'][0]['request_id'], 'existing-job')
        self.assertNotIn('owner', result['requests'][0])

    def scoped_item(self):
        return (1, 'prompt-existing', {
            '4:7': {'class_type': 'RunComfyNanoBanana2LiteT2I', 'inputs': {'prompt': 'private prompt'}},
            '8': {'class_type': 'SaveImage', 'inputs': {'images': ['4:7', 0]}},
        }, {'extra_pnginfo': {'workflow': {'id': 'workflow-a', 'private': 'private workflow'}},
            'auth_token_comfy_org': 'private-token'}, ['8'])

    async def test_execution_scope_uses_current_queue_and_returns_only_public_identity(self):
        for running, pending in [([self.scoped_item()], []), ([], [self.scoped_item()])]:
            self.queue.get_current_queue_volatile.return_value = (running, pending)
            response = await self.http.get('/runcomfy/execution-scope', params={'prompt_id': 'prompt-existing'})
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            result = await response.json()
            self.assertEqual(result, {'prompt_id': 'prompt-existing', 'workflow_id': 'workflow-a',
                                      'nodes': {'4:7': 'RunComfyNanoBanana2LiteT2I'}})
            self.assertNotIn('private', str(result))
        self.factory.assert_not_called()

    async def test_execution_scope_uses_history_after_prompt_finishes(self):
        def get_history(prompt_id, map_function):
            return {prompt_id: map_function({'prompt': self.scoped_item(), 'outputs': {'private': 'outputs'}})}
        self.queue.get_history.side_effect = get_history
        response = await self.http.get('/runcomfy/execution-scope', params={'prompt_id': 'prompt-existing'})
        self.assertEqual(response.status, 200)
        self.assertEqual((await response.json())['workflow_id'], 'workflow-a')

    async def test_execution_scope_rejects_unknown_invalid_and_cross_origin_requests(self):
        response = await self.http.get('/runcomfy/execution-scope', params={'prompt_id': 'missing'})
        self.assertEqual(response.status, 404)
        response = await self.http.get('/runcomfy/execution-scope', params={'prompt_id': '../bad'})
        self.assertEqual(response.status, 400)
        response = await self.http.get('/runcomfy/execution-scope', params={'prompt_id': 'prompt-existing'},
                                      headers={'Origin': 'https://other.example'})
        self.assertEqual(response.status, 403)


if __name__ == '__main__':
    unittest.main()
