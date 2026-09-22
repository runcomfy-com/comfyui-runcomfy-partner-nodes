import sys
import types
import unittest
from unittest.mock import Mock, AsyncMock, patch
from test_partner_nodes import comfy_modules

try:
    from runcomfy.nodes import RunComfySeedance25I2V1080p
except ImportError:
    RunComfySeedance25I2V1080p = None


class NodeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(RunComfySeedance25I2V1080p, 'ComfyUI node is not implemented yet')

    async def test_bad_parameters_are_rejected_before_payment(self):
        node = RunComfySeedance25I2V1080p()
        for prompt, duration in [('', 5), ('motion', 3), ('motion', 31), ('motion', True)]:
            with self.subTest(prompt=prompt, duration=duration), patch.dict(sys.modules, comfy_modules()), \
                    patch('runcomfy.partner_nodes.TokenStore') as store, self.assertRaises(ValueError):
                store.return_value.get.return_value = 'test-token'
                await node.generate(None, prompt, duration, True)

    async def test_resume_returns_native_video_and_cost_ui_without_converting_image(self):
        source = object()
        video_type = Mock(return_value=source)
        comfy_latest = types.ModuleType('comfy_api.latest')
        comfy_latest.InputImpl = types.SimpleNamespace(VideoFromFile=video_type)
        folder_paths = types.ModuleType('folder_paths')
        folder_paths.get_temp_directory = lambda: '/tmp'
        model_management = types.ModuleType('comfy.model_management')
        model_management.throw_exception_if_processing_interrupted = lambda: None
        server = types.ModuleType('server')
        server.PromptServer = types.SimpleNamespace(instance=None)
        modules = {'comfy_api': types.ModuleType('comfy_api'), 'comfy_api.latest': comfy_latest,
                   'folder_paths': folder_paths, 'comfy': types.ModuleType('comfy'),
                   'comfy.model_management': model_management, 'server': server}
        result = {'state': 'completed', 'request_id': 'job-1', 'video_url': 'https://playgrounds-storage-public.runcomfy.net/v.mp4',
                  'cost_usd': 3.15, 'quote': None}
        with patch.dict(sys.modules, modules), patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.RequestJournal'), \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient') as client, \
                patch('runcomfy.partner_nodes.async_run_generation', return_value=result) as generation, \
                patch('runcomfy.partner_nodes.build_inputs') as image, \
                patch('runcomfy.partner_nodes.download_video', return_value='/tmp/result.mp4'):
            store.return_value.get.return_value = 'test-token'
            client.return_value = AsyncMock()
            client.return_value.result.return_value = {'cost': 3.15}
            actual = await RunComfySeedance25I2V1080p().generate(resume_request_id='job-1')
        self.assertIs(actual['result'][0], source)
        self.assertEqual(actual['result'], (source,))
        self.assertEqual(RunComfySeedance25I2V1080p.RETURN_TYPES, ('VIDEO',))
        self.assertEqual(RunComfySeedance25I2V1080p.RETURN_NAMES, ('video',))
        self.assertEqual(actual['ui']['runcomfy'][0]['request_id'], 'job-1')
        self.assertEqual(actual['ui']['runcomfy'][0]['cost_usd'], 3.15)
        self.assertEqual(actual['ui']['runcomfy'][0]['model_id'],
                         'bytedance/seedance-2.5/image-to-video/1080p')
        image.assert_not_called()
        video_type.assert_called_once_with('/tmp/result.mp4')
        self.assertEqual(generation.call_args.kwargs['model_id'],
                         'bytedance/seedance-2.5/image-to-video/1080p')

    async def test_image_is_optional_in_schema_so_resume_can_run_without_it(self):
        inputs = RunComfySeedance25I2V1080p.INPUT_TYPES()
        self.assertNotIn('image', inputs['required'])
        self.assertIn('image', inputs['optional'])


if __name__ == '__main__':
    unittest.main()
