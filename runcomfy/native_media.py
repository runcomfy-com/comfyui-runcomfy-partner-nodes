"""Convert native ComfyUI media without persisting user credentials or inputs."""
import base64
import io
import math
import tempfile
import wave
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageOps

from .errors import RunComfyError
from .media import image_data_uri, validate_output_url

MAX_REFERENCE_BYTES = 32 * 1024 * 1024
MAX_AUDIO_BYTES = 16 * 1024 * 1024
MAX_IMAGE_OUTPUT_BYTES = 32 * 1024 * 1024


def image_data_uris(images, maximum):
    if not hasattr(images, 'shape') or len(images.shape) != 4 or not 1 <= images.shape[0] <= maximum:
        raise ValueError('Connect an IMAGE batch containing 1–%s images.' % maximum)
    return [image_data_uri(images[index:index + 1]) for index in range(images.shape[0])]


def video_data_uri(video):
    if not callable(getattr(video, 'save_to', None)) or not callable(getattr(video, 'get_duration', None)):
        raise ValueError('Connect a native VIDEO reference.')
    duration = video.get_duration()
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('The reference video has no valid duration.')
    from comfy_api.latest import Types
    with tempfile.TemporaryDirectory(prefix='runcomfy-reference-') as directory:
        path = Path(directory) / 'reference.mp4'
        video.save_to(str(path), format=Types.VideoContainer.MP4)
        if not 0 < path.stat().st_size <= MAX_REFERENCE_BYTES:
            raise ValueError('Reference video exceeds 32 MiB or is empty. Use a shorter or compressed clip.')
        return 'data:video/mp4;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def audio_data_uri(audio):
    if not isinstance(audio, dict):
        raise ValueError('Connect a native AUDIO reference.')
    waveform, rate = audio.get('waveform'), audio.get('sample_rate')
    if (not hasattr(waveform, 'shape') or len(waveform.shape) != 3 or waveform.shape[0] != 1
            or waveform.shape[1] not in (1, 2) or waveform.shape[2] <= 0
            or isinstance(rate, bool) or not isinstance(rate, int) or not 8000 <= rate <= 192000):
        raise ValueError('Audio must contain one mono/stereo clip with a valid sample rate.')
    if waveform.shape[1] * waveform.shape[2] * 2 > MAX_AUDIO_BYTES:
        raise ValueError('Reference audio exceeds 16 MiB as WAV. Use a shorter clip.')
    values = waveform.detach().cpu().numpy()[0]
    if not np.isfinite(values).all():
        raise ValueError('Reference audio contains invalid sample values.')
    pcm = (np.clip(values, -1, 1).T * 32767).astype('<i2')
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as stream:
        stream.setnchannels(values.shape[0])
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(pcm.tobytes())
    return 'data:audio/wav;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')


def download_images(urls, check_interrupt=lambda: None, get=requests.get):
    import torch
    if not isinstance(urls, list) or not 1 <= len(urls) <= 16:
        raise RunComfyError('Expected 1–16 image outputs.', 'missing_output')
    for url in urls:
        validate_output_url(url)
    tensors = []
    total_pixels = 0
    try:
        for url in urls:
            check_interrupt()
            # Separate unauthenticated transport; never send the account token to media storage.
            response = get(url, stream=True, timeout=(10, 60), allow_redirects=False)
            try:
                content_type = response.headers.get('Content-Type', '').split(';')[0].lower()
                if response.status_code != 200 or (content_type and not content_type.startswith('image/')
                        and content_type not in ('application/octet-stream', 'binary/octet-stream')):
                    raise RunComfyError('Could not download the generated image.', 'download_failed')
                buffer = io.BytesIO()
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    check_interrupt()
                    if buffer.tell() + len(chunk) > MAX_IMAGE_OUTPUT_BYTES:
                        raise RunComfyError('Image output exceeds 32 MiB.', 'image_too_large')
                    buffer.write(chunk)
            finally:
                response.close()
            buffer.seek(0)
            with Image.open(buffer) as source:
                pixels = source.width * source.height
                total_pixels += pixels
                if pixels > 32_000_000 or total_pixels > 64_000_000:
                    raise RunComfyError('Image output exceeds the pixel limit.', 'image_too_large')
                image = ImageOps.exif_transpose(source).convert('RGB')
                tensor = torch.from_numpy(np.array(image, dtype=np.float32) / 255.0).unsqueeze(0)
            if tensors and tensor.shape[1:] != tensors[0].shape[1:]:
                raise RunComfyError('Output images have different dimensions and cannot form one IMAGE batch. '
                                    'Retrieve the individual outputs from RunComfy Generations.', 'image_size_mismatch')
            tensors.append(tensor)
        return torch.cat(tensors, dim=0)
    except requests.RequestException:
        raise RunComfyError('Image download interrupted. Resume the request to download again.', 'download_failed') from None
    except (OSError, Image.DecompressionBombError):
        raise RunComfyError('Could not decode the generated image. Resume the request to try again.', 'download_failed') from None
