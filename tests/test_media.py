import base64
import io
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

try:
    from runcomfy.media import image_data_uri, download_video
except ImportError:
    image_data_uri = None


class Tensor:
    def __init__(self, array):
        self.array = array
        self.shape = array.shape

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return self.array


class MediaTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(image_data_uri, 'Media conversion is not implemented yet')

    def test_single_image_becomes_png_data_uri(self):
        uri = image_data_uri(Tensor(np.ones((1, 8, 10, 3), dtype=np.float32)))
        self.assertTrue(uri.startswith('data:image/png;base64,'))
        image = Image.open(io.BytesIO(base64.b64decode(uri.split(',', 1)[1])))
        self.assertEqual(image.size, (10, 8))
        self.assertEqual(image.getpixel((0, 0)), (255, 255, 255))

    def test_batch_is_rejected_instead_of_silently_dropped(self):
        with self.assertRaisesRegex(ValueError, 'one image'):
            image_data_uri(Tensor(np.zeros((2, 8, 10, 3))))

    def test_untrusted_video_url_is_rejected_before_fetch(self):
        with tempfile.TemporaryDirectory() as d:
            for url in ['http://localhost/x.mp4', 'https://127.0.0.1/x.mp4',
                        'https://runcomfy.net.evil.example/x.mp4', 'https://user:password@playgrounds-storage-public.runcomfy.net/x.mp4']:
                with self.subTest(url=url), self.assertRaises(ValueError):
                    download_video(url, Path(d))

    def test_download_has_no_account_authorization(self):
        class Response:
            status_code = 200
            headers = {'Content-Type': 'video/mp4'}
            def iter_content(self, chunk_size):
                yield b'video-bytes'
            def close(self):
                pass
        calls = []
        def get(url, **kwargs):
            calls.append(kwargs)
            return Response()
        with tempfile.TemporaryDirectory() as d:
            path = download_video('https://playgrounds-storage-public.runcomfy.net/x.mp4', Path(d), get=get)
            self.assertEqual(Path(path).read_bytes(), b'video-bytes')
        self.assertNotIn('Authorization', calls[0].get('headers', {}))
        self.assertFalse(calls[0]['allow_redirects'])


if __name__ == '__main__':
    unittest.main()
