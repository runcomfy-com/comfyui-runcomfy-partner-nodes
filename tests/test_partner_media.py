import base64
import io
import unittest
import wave
from unittest.mock import Mock

import torch
from PIL import Image

from runcomfy.native_media import audio_data_uri, image_data_uris, download_images


class PartnerMediaTests(unittest.TestCase):
    def test_audio_encodes_valid_wav_and_rejects_batches(self):
        uri = audio_data_uri({'waveform': torch.ones(1, 2, 480) * .1, 'sample_rate': 48000})
        with wave.open(io.BytesIO(base64.b64decode(uri.split(',')[1]))) as wav:
            self.assertEqual((wav.getnchannels(), wav.getnframes(), wav.getframerate()), (2, 480, 48000))
        with self.assertRaises(ValueError):
            audio_data_uri({'waveform': torch.zeros(2, 2, 480), 'sample_rate': 48000})

    def test_image_batch_enforces_count_and_nonfinite_values(self):
        self.assertEqual(len(image_data_uris(torch.zeros(2, 16, 16, 3), 3)), 2)
        for data in [torch.zeros(4, 16, 16, 3), torch.full((1, 16, 16, 3), float('nan'))]:
            with self.assertRaises(ValueError):
                image_data_uris(data, 3)

    def test_downloaded_png_becomes_native_image_without_credentials(self):
        buffer = io.BytesIO()
        Image.new('RGB', (16, 24), 'red').save(buffer, format='PNG')
        response = Mock(status_code=200, headers={'Content-Type': 'image/png'})
        response.iter_content.return_value = [buffer.getvalue()]
        get = Mock(return_value=response)
        result = download_images(['https://storage.runcomfy.net/result.png'], get=get)
        self.assertEqual(tuple(result.shape), (1, 24, 16, 3))
        self.assertEqual(float(result[0, 0, 0, 0]), 1)
        self.assertNotIn('headers', get.call_args.kwargs)
        self.assertFalse(get.call_args.kwargs['allow_redirects'])
        response.close.assert_called_once()
        with self.assertRaises(ValueError):
            download_images(['http://127.0.0.1/private'], get=get)
        self.assertEqual(get.call_count, 1)
