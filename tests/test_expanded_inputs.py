"""Offline fixtures from RunComfy's public model contracts (2026-09-23)."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import torch

from runcomfy.catalog import get_model
from runcomfy.inputs import MAX_MEDIA_ITEMS, build_inputs, media_ports, node_input_types


def model(properties, required=()):
    return SimpleNamespace(schema={'properties': properties, 'required': list(required)})


class ExpandedInputTests(unittest.TestCase):
    def test_seed_audio_numeric_parameters_are_float_widgets_with_finite_bounds(self):
        # Seed Audio 1.0 publishes speed/volume as number and pitch as integer.
        item = model({'speed': {'type': 'number', 'default': 1, 'minimum': .5, 'maximum': 2},
                      'volume': {'type': 'number', 'default': 1, 'minimum': .5, 'maximum': 2},
                      'pitch': {'type': 'integer', 'default': 0, 'minimum': -12, 'maximum': 12}})
        inputs = node_input_types(item)
        self.assertEqual(inputs['required']['speed'][0], 'FLOAT')
        self.assertEqual(inputs['required']['speed'][1]['min'], .5)
        self.assertEqual(build_inputs(item, {'speed': .75, 'pitch': -12}), {'speed': .75, 'volume': 1, 'pitch': -12})
        for value in (True, '1', float('nan'), float('inf'), float('-inf'), .49, 2.01):
            with self.subTest(value=value), self.assertRaises(ValueError):
                build_inputs(item, {'speed': value})

    def test_catalog_float_alias_and_negative_seed_without_invented_api_bounds(self):
        item = model({'guidance_scale': {'type': 'float', 'default': 3.5, 'minimum': 0, 'maximum': 10},
                      'seed': {'type': 'integer', 'default': -1}})
        self.assertEqual(node_input_types(item)['required']['guidance_scale'][0], 'FLOAT')
        self.assertEqual(node_input_types(item)['required']['seed'][1]['min'], -1)
        self.assertEqual(build_inputs(item, {})['seed'], -1)
        self.assertEqual(build_inputs(item, {'seed': 2**32})['seed'], 2**32)

    def test_h3_first_and_last_images_keep_distinct_sources(self):
        # MiniMax H3 calls its second frame last_image; Wan uses end_image_url.
        item = model({'image': {'type': 'string', 'format': 'image_uri'},
                      'last_image': {'type': 'string', 'format': 'image_uri'}}, ['image'])
        self.assertEqual(media_ports(item), {'image': ('IMAGE', ['image']), 'last_image': ('IMAGE', ['last_image'])})
        first, last = torch.zeros(1, 16, 16, 3), torch.ones(1, 16, 16, 3)
        result = build_inputs(item, {'image': first, 'last_image': last})
        self.assertNotEqual(result['image'], result['last_image'])

    def test_omni_video_edit_and_ltx_audio_to_video_use_singular_native_sockets(self):
        omni = model({'video_url': {'type': 'string', 'format': 'video_uri'}}, ['video_url'])
        ltx = model({'audio_url': {'type': 'string', 'format': 'audio_uri'},
                     'image_url': {'type': 'string', 'format': 'image_uri'},
                     'guidance_scale': {'type': 'number', 'default': 9, 'minimum': 1, 'maximum': 50}}, ['audio_url'])
        self.assertEqual(node_input_types(omni)['optional']['video'][0], 'VIDEO')
        self.assertEqual(node_input_types(ltx)['optional']['audio'][0], 'AUDIO')
        with patch('runcomfy.inputs.video_data_uri', return_value='encoded-video') as video, \
                patch('runcomfy.inputs.audio_data_uri', return_value='encoded-audio') as audio:
            self.assertEqual(build_inputs(omni, {'video': 'native-video'}), {'video_url': 'encoded-video'})
            self.assertEqual(build_inputs(ltx, {'audio': 'native-audio'}),
                             {'audio_url': 'encoded-audio', 'guidance_scale': 9})
            video.assert_called_once_with('native-video')
            audio.assert_called_once_with('native-audio')
        with self.assertRaisesRegex(ValueError, 'Connect'):
            build_inputs(ltx, {})

    def test_ltx_optional_camera_motion_is_omitted_until_explicitly_selected(self):
        item = model({'camera_motion': {'type': 'string', 'enum': ['dolly_in', 'dolly_out', 'static']},
                      'prompt': {'type': 'string', 'default': ''}}, ['prompt'])
        choices, options = node_input_types(item)['optional']['camera_motion']
        self.assertEqual(choices, ['', 'dolly_in', 'dolly_out', 'static'])
        self.assertEqual(options['default'], '')
        self.assertEqual(build_inputs(item, {'prompt': 'test'}), {'prompt': 'test'})
        self.assertEqual(build_inputs(item, {'prompt': 'test', 'camera_motion': ''}), {'prompt': 'test'})
        self.assertEqual(build_inputs(item, {'prompt': 'test', 'camera_motion': 'static'})['camera_motion'], 'static')

    def test_optional_primitives_without_api_defaults_do_not_invent_values(self):
        item = model({'text': {'type': 'string'}, 'count': {'type': 'integer'},
                      'enabled': {'type': 'boolean'}, 'scale': {'type': 'number'}})
        inputs = node_input_types(item)['optional']
        self.assertEqual(build_inputs(item, {}), {})
        self.assertEqual(build_inputs(item, {'text': '', 'count': None}), {})
        for name in ('count', 'enabled', 'scale'):
            self.assertTrue(inputs[name][1]['forceInput'])
            self.assertNotIn('default', inputs[name][1])
        self.assertEqual(build_inputs(item, {'count': 0, 'enabled': False, 'scale': .3}),
                         {'count': 0, 'enabled': False, 'scale': .3})

    def test_seed_audio_rejects_combined_image_and_audio_before_encoding(self):
        item = model({'image_url': {'type': 'string', 'format': 'image_uri'},
                      'audio_urls': {'type': 'array', 'format': 'audio_uris', 'maxItems': 3}})
        item.model_id = 'bytedance/seed-audio-1.0/text-to-audio'
        with patch('runcomfy.inputs.image_data_uris') as images, \
                patch('runcomfy.inputs.audio_data_uri') as audio, self.assertRaisesRegex(ValueError, 'cannot combine'):
            build_inputs(item, {'image': torch.zeros(1, 16, 16, 3), 'audio_1': object()})
        images.assert_not_called()
        audio.assert_not_called()

    def test_declared_file_size_limits_measure_decoded_media_bytes(self):
        spec = {'type': 'string', 'format': 'video_uri', 'validations': [
            {'validation_rule': 'file_size_mb<', 'validation_value': .000002,
             'validation_error': 'Reference must be smaller than two bytes.'}]}
        item = model({'video_url': spec}, ['video_url'])
        with patch('runcomfy.inputs.video_data_uri', return_value='data:video/mp4;base64,eHg='):
            with self.assertRaisesRegex(ValueError, 'two bytes'):
                build_inputs(item, {'video': object()})
        with patch('runcomfy.inputs.video_data_uri', return_value='data:video/mp4;base64,eA=='):
            self.assertIn('video_url', build_inputs(item, {'video': object()}))

    def test_seed_audio_rejects_long_reference_before_encoding(self):
        item = model({'audio_urls': {'type': 'array', 'format': 'audio_uris', 'maxItems': 3}})
        item.model_id = 'bytedance/seed-audio-1.0/text-to-audio'
        source = {'waveform': torch.zeros(1, 1, 8000 * 31), 'sample_rate': 8000}
        with patch('runcomfy.inputs.audio_data_uri') as audio, self.assertRaisesRegex(ValueError, '30 seconds'):
            build_inputs(item, {'audio_1': source})
        audio.assert_not_called()

    def test_ltx_audio_requires_prompt_or_image(self):
        item = model({'audio_url': {'type': 'string', 'format': 'audio_uri'},
                      'image_url': {'type': 'string', 'format': 'image_uri'},
                      'prompt': {'type': 'string', 'default': ''}}, ['audio_url'])
        item.model_id = 'lightricks/ltx-2.5/audio-to-video/fast'
        with patch('runcomfy.inputs.audio_data_uri') as audio, self.assertRaisesRegex(ValueError, 'prompt or'):
            build_inputs(item, {'audio': object()})
        audio.assert_not_called()
        with patch('runcomfy.inputs.audio_data_uri', return_value='encoded-audio'):
            self.assertEqual(build_inputs(item, {'audio': object(), 'prompt': 'motion'})['prompt'], 'motion')

    def test_ltx_audio_duration_is_validated_before_encoding(self):
        for variant in ('fast', 'pro'):
            item = model({'audio_url': {'type': 'string', 'format': 'audio_uri'},
                          'prompt': {'type': 'string', 'default': ''}}, ['audio_url'])
            item.model_id = 'lightricks/ltx-2.5/audio-to-video/' + variant
            for samples in (15999, 16000, 160000, 160001):
                values = {'prompt': 'motion', 'audio': {'waveform': torch.zeros(1, 1, samples), 'sample_rate': 8000}}
                with self.subTest(variant=variant, samples=samples), \
                        patch('runcomfy.inputs.audio_data_uri', return_value='encoded-audio') as encode:
                    if 16000 <= samples <= 160000:
                        self.assertEqual(build_inputs(item, values)['audio_url'], 'encoded-audio')
                    else:
                        with self.assertRaisesRegex(ValueError, 'between 2 and 20'):
                            build_inputs(item, values)
                        encode.assert_not_called()

    def test_audio_inpaint_resolves_relative_bounds_against_native_duration(self):
        item = model({'audio': {'type': 'string', 'format': 'audio_uri'},
                      'start_time': {'type': 'number', 'default': 0, 'minimum': 0, 'maximum': 240},
                      'end_time': {'type': 'number', 'default': 30, 'minimum': 0, 'maximum': 240},
                      'start_time_relative_to': {'type': 'string', 'default': 'start', 'enum': ['start', 'end']},
                      'end_time_relative_to': {'type': 'string', 'default': 'start', 'enum': ['start', 'end']}}, ['audio'])
        item.model_id = 'acestep-ai/ace-step/audio-inpaint'
        audio = {'waveform': torch.zeros(1, 1, 80000), 'sample_rate': 8000}
        for bounds in ({}, {'start_time': 4, 'end_time': 4}, {'start_time': 6, 'end_time': 4},
                       {'start_time': 1, 'start_time_relative_to': 'end', 'end_time': 3, 'end_time_relative_to': 'end'}):
            with self.subTest(bounds=bounds), patch('runcomfy.inputs.audio_data_uri') as encode, self.assertRaisesRegex(ValueError, 'interval'):
                build_inputs(item, {'audio': audio, **bounds})
            encode.assert_not_called()
        with patch('runcomfy.inputs.audio_data_uri', return_value='encoded-audio'):
            result = build_inputs(item, {'audio': audio, 'start_time': 3, 'end_time': 1, 'start_time_relative_to': 'end', 'end_time_relative_to': 'end'})
        self.assertEqual((result['start_time'], result['end_time']), (3, 1))

    def test_required_scalars_without_defaults_cannot_be_silently_omitted(self):
        for kind in ('string', 'integer', 'number', 'float', 'boolean'):
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'Enter'):
                build_inputs(model({'value': {'type': kind}}, ['value']), {})

    def test_media_names_cannot_collide_with_scalars_or_other_media(self):
        item = model({'image': {'type': 'string', 'default': 'label'},
                      'image_url': {'type': 'string', 'format': 'image_uri'},
                      'mask_url': {'type': 'string', 'format': 'image_uri'},
                      'source_images': {'type': 'array', 'format': 'image_uris', 'maxItems': 2},
                      'style_images': {'type': 'array', 'format': 'image_uris', 'maxItems': 3},
                      'video_url': {'type': 'string', 'format': 'video_uri'},
                      'motion_url': {'type': 'string', 'format': 'video_uri'},
                      'videos': {'type': 'array', 'format': 'video_uris', 'maxItems': 2}})
        ports = media_ports(item)
        names = [name for _, names in ports.values() for name in names]
        self.assertEqual(len(names), len(set(names)))
        self.assertNotIn('image', names)
        self.assertIn('mask', names)
        self.assertIn('source_images', names)
        self.assertEqual(ports['videos'][1], ['video_1', 'video_2'])

    def test_reference_counts_are_validated_before_encoding_other_references(self):
        item = model({'images': {'type': 'array', 'format': 'image_uris', 'minItems': 2, 'maxItems': 3},
                      'audios': {'type': 'array', 'format': 'audio_uris', 'minItems': 2, 'maxItems': 3}}, ['images'])
        for count in (0, 1, 4):
            with self.subTest(count=count), patch('runcomfy.inputs.image_data_uris') as encode, self.assertRaises(ValueError):
                build_inputs(item, {'images': torch.zeros(count, 16, 16, 3)})
            encode.assert_not_called()
        with patch('runcomfy.inputs.image_data_uris') as encode, self.assertRaises(ValueError):
            build_inputs(item, {'images': torch.zeros(2, 16, 16, 3), 'audio_1': object()})
        encode.assert_not_called()
        with patch('runcomfy.inputs.audio_data_uri', side_effect=lambda item: item):
            result = build_inputs(item, {'images': torch.zeros(2, 16, 16, 3), 'audio_1': 'one', 'audio_3': 'three'})
        self.assertEqual(result['audios'], ['one', 'three'])

    def test_unbounded_omni_reference_images_have_explicit_local_safety_cap(self):
        item = model({'image_urls': {'type': 'array', 'format': 'image_uris', 'minItems': 1}}, ['image_urls'])
        self.assertIn(str(MAX_MEDIA_ITEMS), node_input_types(item)['optional']['images'][1]['tooltip'])
        with patch('runcomfy.inputs.image_data_uris') as encode, self.assertRaises(ValueError):
            build_inputs(item, {'images': torch.zeros(MAX_MEDIA_ITEMS + 1, 16, 16, 3)})
        encode.assert_not_called()

    def test_single_image_socket_rejects_batch_instead_of_dropping_frames(self):
        item = model({'image_url': {'type': 'string', 'format': 'image_uri'}}, ['image_url'])
        with patch('runcomfy.inputs.image_data_uris') as encode, self.assertRaises(ValueError):
            build_inputs(item, {'image': torch.zeros(2, 16, 16, 3)})
        encode.assert_not_called()

    def test_unknown_complex_fields_fail_closed_in_schema_and_payload(self):
        for spec in ({'type': 'object'}, {'type': 'array', 'items': {'type': 'string'}},
                     {'type': 'string', 'anyOf': []},
                     {'type': 'string', 'format': 'image_uri_with_mask_image_ideogramv3'}):
            item = model({'complex': spec})
            for operation in (node_input_types, lambda item: build_inputs(item, {'complex': '{}'})):
                with self.subTest(spec=spec), self.assertRaisesRegex(ValueError, 'Unsupported'):
                    operation(item)

    def test_schema_may_omit_required_list_and_enforces_text_lengths(self):
        item = SimpleNamespace(schema={'properties': {'prompt': {'type': 'string', 'default': '', 'maxLength': 5}}})
        self.assertEqual(build_inputs(item, {}), {'prompt': ''})
        with self.assertRaises(ValueError):
            build_inputs(item, {'prompt': 'too long'})

    def test_published_widget_order_and_media_names_remain_unchanged(self):
        expectations = {
            'bytedance/seedance-2.5/image-to-video/1080p': (['prompt', 'duration', 'generate_audio'], ['image', 'resume_request_id', 'generation_seed']),
            'bytedance/seedance-2.5/reference-to-video/1080p': (['prompt', 'aspect_ratio', 'duration', 'generate_audio'], ['images', 'video_1', 'video_2', 'video_3', 'audio_1', 'audio_2', 'audio_3', 'resume_request_id', 'generation_seed']),
            'wan-ai/wan-3.0/image-to-video': (['prompt', 'aspect_ratio', 'resolution', 'duration', 'enable_audio', 'prompt_extend', 'seed'], ['image', 'end_image', 'resume_request_id']),
            'google/nano-banana-2-lite/edit': (['prompt', 'aspect_ratio'], ['images', 'resume_request_id', 'generation_seed']),
            'bytedance/seedream-5.0-pro/image-to-image': (['prompt', 'aspect_ratio', 'resolution', 'output_format'], ['images', 'resume_request_id', 'generation_seed']),
        }
        for model_id, (required, optional) in expectations.items():
            with self.subTest(model_id=model_id):
                actual = node_input_types(get_model(model_id))
                self.assertEqual(list(actual['required']), required)
                self.assertEqual(list(actual['optional']), optional)
