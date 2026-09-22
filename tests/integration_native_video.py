"""Offline native ComfyUI check: COMFYUI_PATH=/path/to/ComfyUI python this_file.py."""
import os
import asyncio
import sys
import tempfile
from fractions import Fraction
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, os.environ['COMFYUI_PATH'])

import av
import torch
import folder_paths
from comfy.cli_args import args

args.cpu = True
args.disable_metadata = True

from comfy_api.latest import InputImpl, Types
from comfy_extras.nodes_video import SaveVideo
from runcomfy.config import TokenStore
from runcomfy.journal import RequestJournal
from runcomfy.nodes import RunComfySeedance25I2V1080p


with tempfile.TemporaryDirectory() as directory:
    source = str(Path(directory) / 'source.mp4')
    components = Types.VideoComponents(
        images=torch.full((12, 64, 64, 3), 0.35), frame_rate=Fraction(12, 1),
        audio={'waveform': torch.zeros((1, 2, 48000)), 'sample_rate': 48000})
    InputImpl.VideoFromComponents(components).save_to(source, format=Types.VideoContainer.MP4,
                                                    codec=Types.VideoCodec.H264)
    journal = RequestJournal('offline-test-token', Path(directory) / 'requests.json')
    result = {'state': 'completed', 'request_id': 'offline-job',
              'video_url': 'https://playgrounds-storage-public.runcomfy.net/offline.mp4',
              'cost_usd': 2.85, 'quote': None}
    with patch.object(TokenStore, 'get', return_value='offline-test-token'), \
            patch('runcomfy.partner_nodes.RequestJournal', return_value=journal), \
            patch('runcomfy.partner_nodes.AsyncRunComfyClient') as client, \
            patch('runcomfy.partner_nodes.async_run_generation', return_value=result), \
            patch('runcomfy.partner_nodes.download_video', return_value=source), \
            patch.object(folder_paths, 'get_output_directory', return_value=directory):
        client.return_value = AsyncMock()
        client.return_value.result.return_value = {'status': 'completed', 'cost': 2.85}
        node_output = asyncio.run(RunComfySeedance25I2V1080p().generate(None, 'offline test', 5,
                                                        resume_request_id='offline-job'))
        video = node_output['result'][0]
        SaveVideo.execute(video, 'verified', {'format': 'auto', 'codec': {'codec': 'auto'}})
    saved = list(Path(directory).glob('verified*.mp4'))
    assert len(saved) == 1, saved
    with av.open(str(saved[0])) as container:
        assert len(container.streams.video) == 1
        assert len(container.streams.audio) == 1, 'Audio was lost'
        assert sum(1 for _ in container.decode(video=0)) == 12
    assert journal.recent()[0]['state'] == 'completed'
    print('PASS: native node VIDEO → SaveVideo preserves 12 frames and embedded audio; no network or paid calls.')
