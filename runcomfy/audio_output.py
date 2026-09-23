"""Bounded hosted audio decoding into ComfyUI's native AUDIO value."""
import asyncio
import io
import threading

import aiohttp

from .async_media import _download
from .async_utils import interruptible
from .errors import RunComfyError
from .media import validate_output_url

MAX_AUDIO_OUTPUT_BYTES = 64 * 1024 * 1024
MAX_AUDIO_SAMPLES = 64_000_000  # Channel samples; at most 256 MB of decoded float32.
MAX_AUDIO_SECONDS = 600


def decode_audio(payload, check_interrupt=lambda: None):
    import av
    import numpy as np
    import torch

    try:
        # Custom in-memory IO only. Playlists and demuxer side-channel URL/file
        # requests must not turn a trusted download into an untrusted fetch.
        with av.open(io.BytesIO(payload), options={
            'protocol_whitelist': 'pipe',
            'format_whitelist': 'wav,mp3,flac,ogg,mov,matroska,webm,aac',
        }) as container:
            if len(container.streams.audio) != 1:
                raise RunComfyError('Expected exactly one generated audio stream.', 'missing_output')
            stream = container.streams.audio[0]
            rate, channels = stream.codec_context.sample_rate, stream.codec_context.channels
            if not isinstance(rate, int) or not 8000 <= rate <= 192000 or channels not in (1, 2):
                raise RunComfyError('Generated audio must be mono or stereo at 8–192 kHz.', 'unsupported_audio')
            resampler = av.AudioResampler(format='fltp', layout='mono' if channels == 1 else 'stereo', rate=rate)
            chunks, samples = [], 0

            def append(frame):
                nonlocal samples
                check_interrupt()
                samples += frame.samples * channels
                if samples > MAX_AUDIO_SAMPLES or samples > MAX_AUDIO_SECONDS * rate * channels:
                    raise RunComfyError('Generated audio exceeds the native audio size or 10-minute limit. '
                                        'Download the full result from RunComfy Generations.', 'audio_too_large')
                chunk = frame.to_ndarray()
                if not np.isfinite(chunk).all():
                    raise RunComfyError('Generated audio contains invalid samples.', 'invalid_audio')
                chunks.append(torch.from_numpy(chunk.copy()))

            for decoded in container.decode(stream):
                check_interrupt()
                for frame in resampler.resample(decoded):
                    append(frame)
            for frame in resampler.resample(None):
                append(frame)
            if not chunks:
                raise RunComfyError('The generated audio contains no samples.', 'missing_output')
            check_interrupt()
            return {'waveform': torch.cat(chunks, dim=1).unsqueeze(0), 'sample_rate': rate}
    except (av.FFmpegError, OSError, ValueError):
        raise RunComfyError('Could not decode the generated audio. Resume the request to try again.',
                            'download_failed') from None


async def download_audio(url, check_interrupt=lambda: None, session_factory=aiohttp.ClientSession):
    validate_output_url(url)
    stop = threading.Event()

    def check():
        if stop.is_set():
            raise asyncio.CancelledError()
        check_interrupt()

    try:
        payload = io.BytesIO()
        async with session_factory() as session:
            await interruptible(_download(url, payload.write, MAX_AUDIO_OUTPUT_BYTES, 'audio', session), check)
        return await interruptible(asyncio.to_thread(decode_audio, payload.getvalue(), check), check)
    except (aiohttp.ClientError, asyncio.TimeoutError):
        raise RunComfyError('Audio download interrupted. Resume the existing request to download again.',
                            'download_failed') from None
    finally:
        stop.set()
