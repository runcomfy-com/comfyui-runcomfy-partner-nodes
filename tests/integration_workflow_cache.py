"""Real ComfyUI execution/cache integration with an offline provider transport."""
import asyncio
import copy
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, os.environ['COMFYUI_PATH'])

from comfy.cli_args import args

args.cpu = True

import torch
import execution
import nodes
from runcomfy.partner_nodes import PARTNER_NODE_MAPPINGS
from runcomfy.pricing import parse_price


class OfflineClient:
    submissions = []

    def __init__(self, token, model_id):
        self.model_id = model_id

    async def price(self):
        return parse_price({'model_id': self.model_id, 'base_price_usd': 0.1,
                            'price_unit': 'output'}, self.model_id)

    async def submit(self, inputs):
        self.submissions.append(copy.deepcopy(inputs))
        return 'offline-job-' + str(len(self.submissions))

    async def result(self, request_id):
        return {'status': 'completed', 'model_id': self.model_id, 'cost': 0.1,
                'output': {'image': 'https://storage.runcomfy.net/offline.png'}}

    async def close(self):
        pass


class OfflineOutput:
    FUNCTION = 'save'
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    seen = []

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'image': ('IMAGE',), 'filename': ('STRING', {})}}

    def save(self, image, filename):
        assert image.shape == (1, 8, 8, 3)
        self.seen.append(filename)
        return ()


class OfflineServer:
    client_id = None
    last_node_id = None

    def send_sync(self, *args, **kwargs):
        pass


async def main():
    model_class = 'RunComfyNanoBanana2LiteT2I'
    prompt = {
        '1': {'class_type': model_class, 'inputs': {
            'prompt': 'Offline cache fixture', 'aspect_ratio': 'auto',
            'resume_request_id': '', 'generation_seed': 42}},
        '2': {'class_type': 'RunComfyOfflineOutput', 'inputs': {
            'image': ['1', 0], 'filename': 'first'}},
    }
    account = ['offline-account-one']
    image = torch.full((1, 8, 8, 3), 0.5)
    with tempfile.TemporaryDirectory(prefix='runcomfy-cache-test-') as directory, \
            patch.dict(os.environ, {'RUNCOMFY_CONFIG_PATH': str(Path(directory) / 'config.json')}), \
            patch('runcomfy.config.TokenStore._read', side_effect=lambda: (account[0], 'offline')), \
            patch('runcomfy.partner_nodes.AsyncRunComfyClient', OfflineClient), \
            patch('runcomfy.partner_nodes.download_images', new_callable=AsyncMock, return_value=image) as download, \
            patch.dict(nodes.NODE_CLASS_MAPPINGS, {
                model_class: PARTNER_NODE_MAPPINGS[model_class],
                'RunComfyOfflineOutput': OfflineOutput}), \
            patch('aiohttp.ClientSession', side_effect=AssertionError('Real HTTP is forbidden in this test')):
        executor = execution.PromptExecutor(OfflineServer(), cache_type=execution.CacheType.CLASSIC,
                                           cache_args={'ram': 0, 'ram_inactive': 0})

        async def run(name):
            await executor.execute_async(copy.deepcopy(prompt), name, execute_outputs=['2'])
            assert executor.success, executor.status_messages

        await run('first')
        assert len(OfflineClient.submissions) == 1
        prompt['2']['inputs']['filename'] = 'downstream-only'
        await run('downstream')
        assert len(OfflineClient.submissions) == 1, 'Downstream edit resubmitted a paid generation'
        assert download.await_count == 1
        assert OfflineOutput.seen[-1] == 'downstream-only'

        prompt['1']['inputs']['generation_seed'] = 43
        await run('explicit-rerun')
        assert len(OfflineClient.submissions) == 2
        assert all('generation_seed' not in item for item in OfflineClient.submissions)

        account[0] = 'offline-account-two'
        await run('account-change')
        assert len(OfflineClient.submissions) == 3, 'Account change incorrectly reused another account cache'

        prompt['1']['inputs']['resume_request_id'] = 'imported-offline-job'
        await run('resume')
        assert len(OfflineClient.submissions) == 3, 'Resume submitted a new generation'
        downloads_after_resume = download.await_count
        prompt['2']['inputs']['filename'] = 'resumed-downstream-only'
        await run('resume-cached')
        assert len(OfflineClient.submissions) == 3
        assert download.await_count == downloads_after_resume, 'Fixed resume downloaded again'

    print('PASS: real ComfyUI executor caches downstream-only edits and fixed resumes; '
          'nonce/account changes invalidate; resume never submits. Offline transport only.')


if __name__ == '__main__':
    asyncio.run(main())
