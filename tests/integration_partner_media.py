"""Offline native reference encoding and IMAGE output → SaveImage integration."""
import base64
import io
import os
import asyncio
import sys
import tempfile
import wave
from fractions import Fraction
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, os.environ['COMFYUI_PATH'])

import av
import torch
import folder_paths
from PIL import Image
from comfy.cli_args import args

args.cpu = True
args.disable_metadata = True

from comfy_api.latest import InputImpl, Types
from nodes import SaveImage
from runcomfy.native_media import audio_data_uri, download_images, video_data_uri
from runcomfy.partner_nodes import PARTNER_NODE_MAPPINGS


class ImageResponse:
    status_code = 200
    headers = {'Content-Type': 'image/png'}

    def iter_content(self, chunk_size):
        output = io.BytesIO()
        Image.new('RGB', (64, 64), '#446688').save(output, 'PNG')
        yield output.getvalue()

    def close(self):
        pass


with tempfile.TemporaryDirectory() as directory:
    audio = {'waveform': torch.zeros((1, 2, 48000)), 'sample_rate': 48000}
    components = Types.VideoComponents(images=torch.full((12, 64, 64, 3), .35),
                                       frame_rate=Fraction(12, 1), audio=audio)
    for video in [InputImpl.VideoFromComponents(components)]:
        uri = video_data_uri(video)
        with av.open(io.BytesIO(base64.b64decode(uri.split(',', 1)[1]))) as container:
            assert len(container.streams.audio) == 1
            assert sum(1 for _ in container.decode(video=0)) == 12
    uri = audio_data_uri(audio)
    with wave.open(io.BytesIO(base64.b64decode(uri.split(',', 1)[1]))) as stream:
        assert stream.getnchannels() == 2 and stream.getnframes() == 48000

    urls = ['https://playgrounds-storage-public.runcomfy.net/offline.png']
    image = download_images(urls, get=lambda *a, **kw: ImageResponse())
    assert image.shape == (1, 64, 64, 3)
    for name, cls in PARTNER_NODE_MAPPINGS.items():
        if cls.RETURN_TYPES != ('IMAGE',):
            continue
        result = {'state': 'completed', 'request_id': 'offline-image', 'image_urls': urls, 'quote': None}
        with patch('runcomfy.partner_nodes.TokenStore') as store, \
                patch('runcomfy.partner_nodes.RequestJournal'), \
                patch('runcomfy.partner_nodes.AsyncRunComfyClient') as client, \
                patch('runcomfy.partner_nodes.async_run_generation', return_value=result), \
                patch('runcomfy.partner_nodes.download_images', return_value=image), \
                patch.object(folder_paths, 'get_output_directory', return_value=directory):
            store.return_value.get.return_value = 'offline-test-token'
            client.return_value = AsyncMock()
            client.return_value.result.return_value = {'status': 'completed'}
            output = asyncio.run(cls().generate(resume_request_id='offline-image'))['result'][0]
            SaveImage().save_images(output, name)
        saved = list(Path(directory).glob(name + '*.png'))
        assert len(saved) == 1
        with Image.open(saved[0]) as actual:
            assert actual.size == (64, 64)
    print('PASS: native VIDEO/AUDIO references preserve frames/audio; all 3 IMAGE nodes connect to SaveImage. No network or paid calls.')
