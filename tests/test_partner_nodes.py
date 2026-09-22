import sys
import asyncio
import threading
import types
import unittest
from unittest.mock import Mock, AsyncMock, patch

import torch

from runcomfy.catalog import MODELS
from runcomfy.errors import RunComfyError
from runcomfy.partner_nodes import PARTNER_NODE_MAPPINGS
from runcomfy.pricing import parse_price


def comfy_modules():
    latest = types.ModuleType('comfy_api.latest')
    latest.InputImpl = types.SimpleNamespace(VideoFromFile=lambda path: ('native-video', path))
    folder = types.ModuleType('folder_paths')
    folder.get_temp_directory = lambda: '/tmp'
    mm = types.ModuleType('comfy.model_management')
    mm.throw_exception_if_processing_interrupted = lambda: None
    server = types.ModuleType('server')
    server.PromptServer = types.SimpleNamespace(instance=None)
    return {'comfy_api': types.ModuleType('comfy_api'), 'comfy_api.latest': latest,
            'folder_paths': folder, 'comfy': types.ModuleType('comfy'),
            'comfy.model_management': mm, 'server': server}


class PartnerNodeTests(unittest.IsolatedAsyncioTestCase):
    async def test_account_switch_after_cache_fingerprint_blocks_generation_before_network(self):
        Node = PARTNER_NODE_MAPPINGS['RunComfyNanoBanana2LiteT2I']
        context = types.SimpleNamespace(prompt_id='account-race', node_id='1:7')
        with patch.dict(sys.modules, comfy_modules()), \
                patch('runcomfy.partner_nodes.execution_context', return_value=context), \
                patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient') as client:
            store.return_value.get.return_value = 'synthetic-account-a'
            original = Node.IS_CHANGED()
            store.return_value.get.return_value = 'synthetic-account-b'
            self.assertEqual(Node.IS_CHANGED(), original, 'fingerprints stay stable within the same prompt')
            with self.assertRaisesRegex(RunComfyError, 'account changed'):
                await Node().generate(prompt='test')
            client.assert_not_called()

    async def test_stop_while_encoding_never_constructs_network_client(self):
        Node = PARTNER_NODE_MAPPINGS['RunComfyNanoBanana2LiteT2I']
        modules = comfy_modules()
        started, release = threading.Event(), threading.Event()
        stopped = False
        class Stop(Exception):
            pass
        def check():
            if stopped:
                raise Stop()
        def encode(*args, **kwargs):
            started.set()
            release.wait(.5)
            return {'prompt': 'test'}
        modules['comfy.model_management'].throw_exception_if_processing_interrupted = check
        with patch.dict(sys.modules, modules), patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.build_inputs', side_effect=encode), \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient') as client:
            store.return_value.get.return_value = 'synthetic-token'
            task = asyncio.create_task(Node().generate(prompt='test'))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, .5))
                stopped = True
                with self.assertRaises(Stop):
                    await asyncio.wait_for(task, .5)
                client.assert_not_called()
            finally:
                release.set()

    async def test_download_stop_retains_request_without_claiming_remote_cancellation(self):
        Node = PARTNER_NODE_MAPPINGS['RunComfyNanoBanana2LiteT2I']
        modules = comfy_modules()
        class Stop(Exception):
            pass
        modules['comfy.model_management'].throw_exception_if_processing_interrupted = Mock(side_effect=Stop())
        client = AsyncMock()
        async def download(*args, check_interrupt, **kwargs):
            check_interrupt()
        with patch.dict(sys.modules, modules), patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.RequestJournal') as journal, \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient', return_value=client), \
                patch('runcomfy.partner_nodes.async_run_generation', return_value={
                    'request_id': 'already-complete', 'image_urls': ['https://storage.runcomfy.net/image.png']}), \
                patch('runcomfy.partner_nodes.download_images', side_effect=download):
            store.return_value.get.return_value = 'synthetic-token'
            with self.assertRaises(Stop):
                await Node().generate(resume_request_id='already-complete')
        client.cancel.assert_not_called()
        event = journal.return_value.record.call_args.args[0]
        self.assertEqual(event['state'], 'interrupted')
        self.assertEqual(event['request_id'], 'already-complete')
        self.assertIn('Local retrieval stopped', event['message'])
        client.close.assert_awaited_once()

    async def test_cache_fingerprint_is_stable_account_bound_and_secret_free(self):
        Node = PARTNER_NODE_MAPPINGS['RunComfyNanoBanana2LiteT2I']
        with patch('runcomfy.partner_nodes.TokenStore') as store:
            store.return_value.get.return_value = 'synthetic-account-a'
            first = Node.IS_CHANGED(prompt='one', generation_seed=0)
            self.assertEqual(first, Node.IS_CHANGED(prompt='two', generation_seed=1))
            self.assertNotIn('synthetic-account-a', str(first))
            store.return_value.get.return_value = 'synthetic-account-b'
            self.assertNotEqual(first, Node.IS_CHANGED())

    async def test_events_keep_full_prompt_workflow_identity_and_original_client(self):
        Node = PARTNER_NODE_MAPPINGS['RunComfyNanoBanana2LiteT2I']
        modules = comfy_modules()
        context_module = types.ModuleType('comfy_execution.utils')
        context_module.get_executing_context = lambda: types.SimpleNamespace(prompt_id='prompt-a', node_id='4:7')
        modules['comfy_execution'] = types.ModuleType('comfy_execution')
        modules['comfy_execution.utils'] = context_module
        server = Mock(client_id='client-a')
        modules['server'].PromptServer.instance = server
        image = torch.zeros(1, 16, 16, 3)
        client = AsyncMock()
        client.result.return_value = {'status': 'completed'}
        async def download(*args, **kwargs):
            server.client_id = 'client-b'
            return image
        with patch.dict(sys.modules, modules), patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.RequestJournal'), \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient', return_value=client), \
                patch('runcomfy.partner_nodes.async_run_generation', return_value={
                    'request_id': 'job-existing', 'image_urls': ['https://storage.runcomfy.net/image.png']}), \
                patch('runcomfy.partner_nodes.download_images', side_effect=download):
            store.return_value.get.return_value = 'synthetic-token'
            result = await Node().generate(resume_request_id='job-existing', unique_id='7',
                                           extra_pnginfo={'workflow': {'id': 'workflow-a'}})
        event = result['ui']['runcomfy'][0]
        self.assertEqual((event['node_id'], event['prompt_id'], event['workflow_id']), ('4:7', 'prompt-a', 'workflow-a'))
        self.assertTrue(all(call.args[2] == 'client-a' for call in server.send_sync.call_args_list))
        self.assertNotIn('synthetic-token', str(event))
        client.close.assert_awaited_once()

    async def test_parallel_nodes_observe_stop_without_consuming_global_flag(self):
        Node = PARTNER_NODE_MAPPINGS['RunComfyNanoBanana2LiteT2I']
        modules = comfy_modules()
        mm = modules['comfy.model_management']
        class Stop(Exception):
            pass
        mm.InterruptProcessingException = Stop
        started = 0
        mm.processing_interrupted = lambda: started == 2
        mm.throw_exception_if_processing_interrupted = Mock(side_effect=AssertionError('consumed interrupt'))
        client = AsyncMock()
        async def result(_):
            nonlocal started
            started += 1
            await asyncio.Event().wait()
        client.result.side_effect = result
        client.cancel.return_value = {'status': 'cancelled'}
        with patch.dict(sys.modules, modules), patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.RequestJournal'), \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient', return_value=client):
            store.return_value.get.return_value = 'synthetic-token'
            results = await asyncio.wait_for(asyncio.gather(
                Node().generate(resume_request_id='job-one'),
                Node().generate(resume_request_id='job-two'), return_exceptions=True), .5)
        self.assertTrue(all(isinstance(result, Stop) for result in results))
        self.assertEqual(client.cancel.await_count, 2)
        self.assertEqual(client.close.await_count, 2)
        mm.throw_exception_if_processing_interrupted.assert_not_called()

    async def test_all_eleven_adapters_return_only_the_native_output(self):
        self.assertEqual(len(PARTNER_NODE_MAPPINGS), 11)
        image = torch.zeros(1, 16, 16, 3)
        for node_class, Node in PARTNER_NODE_MAPPINGS.items():
            model = MODELS[Node.MODEL_ID]
            client = AsyncMock()
            client.price.return_value = parse_price({'model_id': model.model_id,
                'base_price_usd': .1, 'price_unit': model.price_unit}, model.model_id)
            client.submit.return_value = 'job-1'
            client.result.return_value = {'model_id': model.model_id, 'status': 'completed', 'cost': .1,
                'output': {'video': 'https://storage.runcomfy.net/out.mp4', 'image': 'https://storage.runcomfy.net/out.png'}}
            args = {'prompt': 'a tree', 'image': image, 'images': image}
            if 'reference-to-video/4k' in model.model_id:
                args['video_1'] = object()
            with self.subTest(node=node_class), patch.dict(sys.modules, comfy_modules()), \
                    patch('runcomfy.partner_nodes.TokenStore') as store, \
                    patch('runcomfy.partner_nodes.RequestJournal'), \
                    patch('runcomfy.partner_nodes.AsyncRunComfyClient', return_value=client) as constructor, \
                    patch('runcomfy.partner_nodes.download_video', return_value='/tmp/video.mp4'), \
                    patch('runcomfy.partner_nodes.download_images', return_value=image), \
                    patch('runcomfy.inputs.video_data_uri', return_value='data:video/mp4;base64,eA=='):
                store.return_value.get.return_value = 'test-token'
                result = await Node().generate(**args)
                constructor.assert_called_once_with('test-token', model_id=model.model_id)
                client.submit.assert_called_once()
                client.close.assert_called_once()
                self.assertEqual(Node.RETURN_TYPES, (model.output_type,))
                self.assertEqual(len(result['result']), 1)
                self.assertEqual(result['ui']['runcomfy'][0]['model_id'], model.model_id)

    async def test_missing_token_fails_before_media_encoding_or_submission(self):
        Node = PARTNER_NODE_MAPPINGS['RunComfySeedance25Reference4K']
        with patch.dict(sys.modules, comfy_modules()), patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.build_inputs') as encode, \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient') as client:
            store.return_value.get.side_effect = RunComfyError('Configure your API Token', 'not_configured', 401)
            with self.assertRaises(RunComfyError):
                await Node().generate(prompt='tree')
            encode.assert_not_called()
            client.assert_not_called()
