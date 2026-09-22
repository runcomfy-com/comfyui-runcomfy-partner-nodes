import unittest
from unittest.mock import patch

import torch

from runcomfy.catalog import get_model
from runcomfy.inputs import build_inputs, node_input_types


class PartnerInputTests(unittest.TestCase):
    def test_seed_controls_append_after_legacy_widgets_and_do_not_enter_api_payload(self):
        model = get_model('google/nano-banana-2-lite/text-to-image')
        inputs = node_input_types(model)
        self.assertEqual(list(inputs['optional']), ['resume_request_id', 'generation_seed'])
        self.assertTrue(inputs['optional']['generation_seed'][1]['control_after_generate'])
        self.assertEqual(inputs['optional']['generation_seed'][1]['max'], 0xFFFFFFFFFFFFFFFF)
        self.assertNotIn('generation_seed', build_inputs(model, {'prompt': 'test', 'generation_seed': 42}))
        wan = node_input_types(get_model('wan-ai/wan-3.0/image-to-video'))
        self.assertTrue(wan['required']['seed'][1]['control_after_generate'])
        self.assertNotIn('generation_seed', wan['optional'])

    def test_seedream_rejects_invalid_reference_dimensions_before_encoding(self):
        model = get_model('bytedance/seedream-5.0-pro/image-to-image')
        for height, width in [(8, 8), (16, 1024), (1024, 16), (16, 256), (256, 16)]:
            with self.subTest(height=height, width=width), \
                    patch('runcomfy.inputs.image_data_uris') as encode:
                with self.assertRaisesRegex(ValueError, 'image|ratio|pixels'):
                    build_inputs(model, {'prompt': 'edit', 'images': torch.zeros(1, height, width, 3)})
                encode.assert_not_called()

    def test_wan_first_last_frames_and_two_second_duration(self):
        model = get_model('wan-ai/wan-3.0-prime/image-to-video')
        first, last = torch.zeros(1, 16, 16, 3), torch.ones(1, 16, 16, 3)
        actual = build_inputs(model, {'prompt': 'motion', 'image': first, 'end_image': last, 'duration': 2})
        self.assertTrue(actual['image_url'].startswith('data:image/png;base64,'))
        self.assertNotEqual(actual['image_url'], actual['end_image_url'])
        self.assertEqual(actual['duration'], 2)
        self.assertTrue(actual['enable_audio'])
        self.assertEqual(actual['resolution'], '720p')

    def test_image_batches_map_to_each_models_actual_array_field(self):
        for mid, key in [('google/nano-banana-2-lite/edit', 'image_urls'),
                         ('bytedance/seedream-5.0-pro/image-to-image', 'image')]:
            actual = build_inputs(get_model(mid), {'prompt': 'edit', 'images': torch.zeros(2, 16, 16, 3)})
            self.assertEqual(len(actual[key]), 2)
            self.assertTrue(all(x.startswith('data:image/png;base64,') for x in actual[key]))
            with self.assertRaises(ValueError):
                build_inputs(get_model(mid), {'prompt': 'edit', 'images': torch.zeros(11, 16, 16, 3)})

    def test_reference_4k_requires_video_before_converting_other_media(self):
        model = get_model('bytedance/seedance-2.5/reference-to-video/4k')
        with patch('runcomfy.inputs.image_data_uris') as image:
            with self.assertRaisesRegex(ValueError, 'video'):
                build_inputs(model, {'prompt': 'motion', 'images': torch.zeros(1, 16, 16, 3)})
            image.assert_not_called()

    def test_reference_video_audio_ports_preserve_order(self):
        model = get_model('bytedance/seedance-2.5/reference-to-video/1080p')
        with patch('runcomfy.inputs.video_data_uri', side_effect=lambda v: 'video:' + v), \
                patch('runcomfy.inputs.audio_data_uri', side_effect=lambda v: 'audio:' + v):
            result = build_inputs(model, {'prompt': 'motion', 'video_1': 'one', 'video_3': 'three', 'audio_2': 'two'})
        self.assertEqual(result['videos'], ['video:one', 'video:three'])
        self.assertEqual(result['audios'], ['audio:two'])

    def test_flux_auto_duration_and_schema_constraints(self):
        model = get_model('blackforestlabs/flux-3/text-to-video')
        self.assertEqual(build_inputs(model, {'prompt': 'a tree'})['duration'], 'auto')
        self.assertEqual(build_inputs(model, {'prompt': 'a tree', 'duration': '20'})['duration'], '20')
        for values in [{'duration': 5}, {'duration': '30'}, {'safety_tolerance': True}, {'resolution': '4k'}]:
            with self.assertRaises(ValueError):
                build_inputs(model, {'prompt': 'a tree', **values})

    def test_node_ports_are_native_and_have_no_metadata_outputs(self):
        model = get_model('bytedance/seedance-2.5/reference-to-video/4k')
        inputs = node_input_types(model)
        self.assertEqual(inputs['optional']['images'][0], 'IMAGE')
        self.assertEqual(inputs['optional']['video_1'][0], 'VIDEO')
        self.assertEqual(inputs['optional']['audio_3'][0], 'AUDIO')
        self.assertNotIn('api_token', inputs['required'])
        self.assertNotIn('model_id', inputs['required'])
