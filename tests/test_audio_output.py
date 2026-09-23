import asyncio
import io
import unittest
import wave
from unittest.mock import AsyncMock, patch

import torch

from runcomfy.audio_output import decode_audio, download_audio
from runcomfy.errors import RunComfyError
from runcomfy.execution import async_run_generation, output_audio
from test_async_transport import Response, Session


def wav_bytes(channels=2, rate=24000):
    payload = io.BytesIO()
    with wave.open(payload, 'wb') as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b'\x00\x20' * channels * rate)
    return payload.getvalue()


class AudioOutputTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_audio_shape_rate_samples_and_isolated_transport(self):
        response = Response(mime='audio/wav', chunks=[wav_bytes()])
        session = Session(response)
        output = await download_audio('https://storage.runcomfy.net/offline.wav', session_factory=lambda: session)
        self.assertEqual(output['sample_rate'], 24000)
        self.assertEqual(output['waveform'].shape, (1, 2, 24000))
        self.assertEqual(output['waveform'].dtype, torch.float32)
        self.assertAlmostEqual(float(output['waveform'][0, 0, 0]), .25)
        self.assertNotIn('headers', session.calls[0][2])
        self.assertFalse(session.calls[0][2]['allow_redirects'])
        self.assertTrue(response.closed and session.closed)

    async def test_stop_closes_stalled_audio_download(self):
        response = Response(mime='audio/wav', chunks=[b'partial'], stall=True)
        session = Session(response)
        class Stop(Exception):
            pass
        def check():
            if response.started.is_set():
                raise Stop()
        with self.assertRaises(Stop):
            await asyncio.wait_for(download_audio('https://storage.runcomfy.net/offline.wav',
                check_interrupt=check, session_factory=lambda: session), .5)
        self.assertTrue(response.closed and session.closed)

    async def test_output_size_limit_is_enforced_before_decode(self):
        session = Session(Response(mime='audio/wav', chunks=[b'12345']))
        with patch('runcomfy.audio_output.MAX_AUDIO_OUTPUT_BYTES', 4), self.assertRaises(RunComfyError):
            await download_audio('https://storage.runcomfy.net/offline.wav', session_factory=lambda: session)

    async def test_untrusted_url_never_opens_transport(self):
        def forbidden():
            self.fail('Audio URL reached the transport')
        with self.assertRaises(ValueError):
            await download_audio('http://127.0.0.1/private', session_factory=forbidden)

    async def test_audio_resume_retains_request_and_never_submits(self):
        client = AsyncMock()
        client.result.return_value = {'status': 'completed', 'output': {'audio': 'https://storage.runcomfy.net/a.wav'}}
        result = await async_run_generation(client, {}, 'existing-audio', output_type='AUDIO')
        self.assertEqual(result['audio_url'], 'https://storage.runcomfy.net/a.wav')
        client.price.assert_not_called()
        client.submit.assert_not_called()

    def test_audio_result_rejects_multiple_outputs_instead_of_dropping_them(self):
        self.assertEqual(output_audio({'output': {'audio': 'one', 'audios': ['one']}}), 'one')
        self.assertEqual(output_audio({'output': {'audios': ['one', 'one']}}), 'one')
        for output in [{'audio': 'one', 'audios': ['one', 'two']}, {'audios': [{}]}, {'audio': {}}, []]:
            self.assertIsNone(output_audio({'output': output}))

    def test_mono_decode_and_sample_limit(self):
        self.assertEqual(decode_audio(wav_bytes(channels=1))['waveform'].shape, (1, 1, 24000))
        with patch('runcomfy.audio_output.MAX_AUDIO_SAMPLES', 100), self.assertRaises(RunComfyError):
            decode_audio(wav_bytes())
        with patch('runcomfy.audio_output.MAX_AUDIO_SECONDS', .1), self.assertRaises(RunComfyError):
            decode_audio(wav_bytes())

    def test_model_output_containers_decode_to_native_audio(self):
        import av
        import numpy as np
        for container_format, codec, rate in [('mp3', 'libmp3lame', 24000),
                                               ('ogg', 'libopus', 48000), ('flac', 'flac', 44100)]:
            with self.subTest(format=container_format):
                payload = io.BytesIO()
                with av.open(payload, 'w', format=container_format) as container:
                    stream = container.add_stream(codec, rate=rate)
                    stream.layout = 'stereo'
                    frame = av.AudioFrame.from_ndarray(np.full((2, rate), .25, dtype=np.float32),
                                                      format='fltp', layout='stereo')
                    frame.sample_rate = rate
                    for packet in stream.encode(frame):
                        container.mux(packet)
                    for packet in stream.encode(None):
                        container.mux(packet)
                output = decode_audio(payload.getvalue())
                self.assertEqual(output['sample_rate'], rate)
                self.assertEqual(output['waveform'].shape, (1, 2, rate))
                self.assertTrue(torch.isfinite(output['waveform']).all())

    def test_decoder_rejects_raw_pcm_playlists_and_corrupt_audio(self):
        for payload in [b'\x00' * 100, b'#EXTM3U\nhttp://127.0.0.1/private\n', b'invalid audio']:
            with self.assertRaises(RunComfyError):
                decode_audio(payload)

    def test_decode_observes_interrupt(self):
        class Stop(Exception):
            pass
        def stop():
            raise Stop()
        with self.assertRaises(Stop):
            decode_audio(wav_bytes(), stop)
