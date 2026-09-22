import base64
import io
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import requests
from PIL import Image

from .errors import RunComfyError

MAX_IMAGE_BYTES = 6 * 1024 * 1024
MAX_VIDEO_BYTES = 512 * 1024 * 1024


def image_data_uri(image):
    if len(image.shape) != 4 or image.shape[0] != 1 or image.shape[3] not in (3, 4):
        raise ValueError('This input requires exactly one image. Select a single RGB/RGBA image from the batch.')
    if image.shape[1] * image.shape[2] > 32_000_000:
        raise ValueError('Input exceeds 32 megapixels. Resize it before sending to RunComfy.')
    pixels = image.detach().cpu().numpy()[0]
    if not np.isfinite(pixels).all():
        raise ValueError('Input image contains invalid pixel values.')
    pixels = np.clip(pixels * 255, 0, 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(pixels).save(buffer, format='PNG')
    payload = buffer.getvalue()
    if len(payload) > MAX_IMAGE_BYTES:
        raise ValueError('PNG input exceeds 6 MiB. Resize the image to fit the Model API request limit.')
    return 'data:image/png;base64,' + base64.b64encode(payload).decode('ascii')


def validate_output_url(url):
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower()
    if (parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443)
            or not (host == 'runcomfy.net' or host.endswith('.runcomfy.net'))):
        raise ValueError('Expected a RunComfy-hosted HTTPS media output.')


def download_video(url, directory, check_interrupt=lambda: None, get=requests.get):
    validate_output_url(url)
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        # Deliberately do not reuse the authenticated API client for hosted files.
        response = get(url, stream=True, timeout=(10, 60), allow_redirects=False)
        try:
            if response.status_code != 200:
                raise RunComfyError('Could not download the generated video. Resume the request to try again.',
                                    'download_failed')
            content_type = response.headers.get('Content-Type', '').split(';')[0].lower()
            if content_type and not (content_type.startswith('video/') or content_type in
                                     ('application/octet-stream', 'binary/octet-stream')):
                raise RunComfyError('The output URL did not return a video file.', 'download_failed')
            fd, temp_path = tempfile.mkstemp(prefix='runcomfy-seedance-', suffix='.mp4', dir=directory)
            with os.fdopen(fd, 'wb') as stream:
                size = 0
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    check_interrupt()
                    size += len(chunk)
                    if size > MAX_VIDEO_BYTES:
                        raise RunComfyError('Output exceeds the 512 MiB download limit.', 'video_too_large')
                    stream.write(chunk)
                if not size:
                    raise RunComfyError('The video download was empty.', 'download_failed')
        finally:
            response.close()
        path, temp_path = temp_path, None
        return path
    except requests.RequestException:
        raise RunComfyError('Video download interrupted. Resume the existing request to download again.',
                            'download_failed') from None
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
