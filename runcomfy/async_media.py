"""Unauthenticated, interruptible hosted-media downloads for node execution."""
import asyncio
import io
import os
import tempfile
from pathlib import Path

import aiohttp
import numpy as np
from PIL import Image, ImageOps

from .async_utils import interruptible
from .errors import RunComfyError
from .media import MAX_VIDEO_BYTES, validate_output_url
from .native_media import MAX_IMAGE_OUTPUT_BYTES


async def _download(url, write, limit, kind, session):
    validate_output_url(url)
    timeout = aiohttp.ClientTimeout(total=600, connect=10, sock_read=60)
    # No account token, session defaults, or redirects are shared with API transport.
    async with session.get(url, timeout=timeout, allow_redirects=False) as response:
        mime = response.headers.get('Content-Type', '').split(';')[0].lower()
        if response.status != 200 or (mime and not mime.startswith(kind + '/') and
                mime not in ('application/octet-stream', 'binary/octet-stream')):
            raise RunComfyError('Could not download the generated %s. Resume the request to try again.' % kind,
                                'download_failed')
        size = 0
        async for chunk in response.content.iter_chunked(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise RunComfyError('Output exceeds the %s MiB download limit.' % (limit // 1024 // 1024),
                                    kind + '_too_large')
            write(chunk)
        if not size:
            raise RunComfyError('The %s download was empty.' % kind, 'download_failed')


async def download_video(url, directory, check_interrupt=lambda: None, session_factory=aiohttp.ClientSession):
    validate_output_url(url)
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(prefix='runcomfy-', suffix='.mp4', dir=directory)
    complete = False
    try:
        with os.fdopen(fd, 'wb') as output:
            async with session_factory() as session:
                await interruptible(_download(url, output.write, MAX_VIDEO_BYTES, 'video', session), check_interrupt)
        complete = True
        return path
    except (aiohttp.ClientError, asyncio.TimeoutError):
        raise RunComfyError('Video download interrupted. Resume the existing request to download again.',
                            'download_failed') from None
    finally:
        if not complete:
            Path(path).unlink(missing_ok=True)


def _decode_image(payload, remaining_pixels):
    import torch
    try:
        with Image.open(io.BytesIO(payload)) as source:
            pixels = source.width * source.height
            if pixels > 32_000_000 or pixels > remaining_pixels:
                raise RunComfyError('Image output exceeds the pixel limit.', 'image_too_large')
            image = ImageOps.exif_transpose(source).convert('RGB')
            return torch.from_numpy(np.array(image, dtype=np.float32) / 255.0).unsqueeze(0), pixels
    except (OSError, Image.DecompressionBombError):
        raise RunComfyError('Could not decode the generated image. Resume the request to try again.',
                            'download_failed') from None


async def download_images(urls, check_interrupt=lambda: None, session_factory=aiohttp.ClientSession):
    import torch
    if not isinstance(urls, list) or not 1 <= len(urls) <= 16:
        raise RunComfyError('Expected 1–16 image outputs.', 'missing_output')
    for url in urls:
        validate_output_url(url)
    tensors, remaining_pixels = [], 64_000_000
    try:
        async with session_factory() as session:
            for url in urls:
                payload = io.BytesIO()
                await interruptible(_download(url, payload.write, MAX_IMAGE_OUTPUT_BYTES, 'image', session), check_interrupt)
                tensor, pixels = await interruptible(
                    asyncio.to_thread(_decode_image, payload.getvalue(), remaining_pixels), check_interrupt)
                remaining_pixels -= pixels
                if tensors and tensor.shape[1:] != tensors[0].shape[1:]:
                    raise RunComfyError('Output images have different dimensions and cannot form one IMAGE batch. '
                                        'Retrieve the individual outputs from RunComfy Generations.', 'image_size_mismatch')
                tensors.append(tensor)
        return torch.cat(tensors, dim=0)
    except (aiohttp.ClientError, asyncio.TimeoutError):
        raise RunComfyError('Image download interrupted. Resume the request to download again.',
                            'download_failed') from None
