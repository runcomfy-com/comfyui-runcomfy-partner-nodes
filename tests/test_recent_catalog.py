"""Every curated model must have a usable, consistent offline node contract."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import torch

from runcomfy.catalog import MODELS
from runcomfy.inputs import build_inputs, media_ports, node_input_types

ROOT = Path(__file__).resolve().parents[1]


def generation_values(model):
    """Supply only required media and intentional prompts; retain published defaults."""
    values = {}
    required = set(model.schema.get('required', []))
    ports = media_ports(model)
    for key, spec in model.schema['properties'].items():
        if key in ports:
            if key not in required:
                continue
            native, names = ports[key]
            count = max(1, spec.get('minItems', 0))
            if native == 'IMAGE':
                values[names[0]] = torch.zeros(count, 64, 64, 3)
            elif native == 'AUDIO':
                for name in names[:count]:
                    seconds = 60 if model.model_id == 'acestep-ai/ace-step/audio-inpaint' else 6
                    values[name] = {'waveform': torch.zeros(1, 1, 8000 * seconds), 'sample_rate': 8000}
            else:
                values.update({name: object() for name in names[:count]})
        elif 'default' in spec:
            values[key] = spec['default']
            if spec['type'] == 'string' and 'enum' not in spec and not values[key] and (key in required or key == 'prompt'):
                values[key] = 'An offline test scene.'
        elif key in required:
            if 'enum' in spec:
                values[key] = spec['enum'][0]
            else:
                values[key] = {'string': 'An offline test scene.', 'integer': spec.get('minimum', 1),
                               'number': spec.get('minimum', 1.0), 'float': spec.get('minimum', 1.0), 'boolean': False}[spec['type']]
    return values


class RecentCatalogTests(unittest.TestCase):
    def test_backend_and_browser_catalogs_are_identical(self):
        source = (ROOT / 'web/runcomfy-models.mjs').read_text()
        frontend = json.loads(source.split('export const MODELS = ', 1)[1].strip().removesuffix(';'))
        self.assertEqual(set(frontend), {model.node_class for model in MODELS.values()})
        for model in MODELS.values():
            with self.subTest(model=model.model_id):
                item = frontend[model.node_class]
                self.assertEqual(item['modelId'], model.model_id)
                self.assertEqual(item['outputType'], model.output_type)
                self.assertEqual(item['pricingMode'], model.pricing_mode)
                duration = model.schema['properties'].get('duration', {})
                if duration.get('enum'):
                    self.assertEqual(item['durationChoices'], duration['enum'])

    def test_every_model_compiles_and_generates_only_documented_api_fields(self):
        for model in MODELS.values():
            with self.subTest(model=model.model_id), \
                    patch('runcomfy.inputs.video_data_uri', return_value='data:video/mp4;base64,eA=='), \
                    patch('runcomfy.inputs.audio_data_uri', return_value='data:audio/wav;base64,eA=='):
                inputs = node_input_types(model)
                names = [name for fields in ('required', 'optional') for name in inputs[fields]]
                self.assertEqual(len(names), len(set(names)), 'every widget/socket must have a distinct name')
                payload = build_inputs(model, generation_values(model))
                self.assertLessEqual(set(payload), set(model.schema['properties']))
                self.assertLessEqual(set(model.schema.get('required', [])), set(payload))
                self.assertNotIn('resume_request_id', payload)
                self.assertNotIn('generation_seed', payload)

    def test_every_required_reference_fails_before_any_encoding_if_missing(self):
        for model in MODELS.values():
            for key, (_, names) in media_ports(model).items():
                if key not in model.schema.get('required', []):
                    continue
                values = generation_values(model)
                for name in names:
                    values.pop(name, None)
                with self.subTest(model=model.model_id, field=key), \
                        patch('runcomfy.inputs.image_data_uris') as image, \
                        patch('runcomfy.inputs.video_data_uri') as video, \
                        patch('runcomfy.inputs.audio_data_uri') as audio, self.assertRaisesRegex(ValueError, 'Connect'):
                    build_inputs(model, values)
                image.assert_not_called()
                video.assert_not_called()
                audio.assert_not_called()

    def test_required_fields_exist_and_structured_omissions_are_disclosed(self):
        for model in MODELS.values():
            with self.subTest(model=model.model_id):
                self.assertLessEqual(set(model.schema.get('required', [])), set(model.schema['properties']))
                self.assertTrue(set(model.omitted_inputs).isdisjoint(model.schema['properties']))
                if model.omitted_inputs:
                    self.assertTrue(model.limitations)
                for key, spec in model.schema['properties'].items():
                    if 'default' in spec and 'enum' in spec:
                        self.assertIn(spec['default'], spec['enum'], '%s has an unusable default' % key)

    def test_recent_visual_examples_preserve_widget_order_and_native_connections(self):
        examples = sorted((ROOT / 'examples').glob('*.json'))
        self.assertEqual(len(examples), 5)
        by_class = {item.node_class: item for item in MODELS.values()}
        for path in examples:
            with self.subTest(example=path.name):
                workflow = json.loads(path.read_text())
                nodes = {node['id']: node for node in workflow['nodes']}
                generation = next(node for node in nodes.values() if node['type'] in by_class)
                model = by_class[generation['type']]
                widgets = iter(generation['widgets_values'])
                values = {}
                specs = node_input_types(model)
                for group in ('required', 'optional'):
                    for name, (kind, options) in specs[group].items():
                        if (isinstance(kind, str) and kind in ('IMAGE', 'VIDEO', 'AUDIO')) or options.get('forceInput'):
                            continue
                        value = next(widgets)
                        values[name] = value
                        if isinstance(kind, list):
                            self.assertIn(value, kind)
                        if options.get('control_after_generate'):
                            self.assertEqual(next(widgets), 'fixed')
                self.assertIsNone(next(widgets, None))
                self.assertEqual(values['resume_request_id'], '')
                self.assertTrue(values.get('prompt') or values.get('tags'))
                for link_id, origin, output_slot, target, input_slot, native_type in workflow['links']:
                    self.assertIn(link_id, nodes[origin]['outputs'][output_slot]['links'])
                    self.assertEqual(nodes[target]['inputs'][input_slot]['link'], link_id)
                    self.assertEqual(nodes[origin]['outputs'][output_slot]['type'], native_type)
                    self.assertEqual(nodes[target]['inputs'][input_slot]['type'], native_type)
                save = next(node for node in nodes.values() if node['type'].startswith('Save'))
                self.assertEqual(save['type'], {'IMAGE': 'SaveImage', 'VIDEO': 'SaveVideo', 'AUDIO': 'SaveAudioAdvanced'}[model.output_type])

    def test_curated_models_match_live_snapshot_if_available(self):
        snapshot = ROOT / '.runtime/model-catalog-2026-09-23.json'
        if not snapshot.exists():
            self.skipTest('Optional read-only live catalog snapshot is not distributed with the package.')
        live = {item['model_id']: item for item in json.loads(snapshot.read_text())['models']}
        for model in MODELS.values():
            with self.subTest(model=model.model_id):
                self.assertIn(model.model_id, live)
                source = live[model.model_id]['input_schema']
                self.assertEqual(set(model.schema.get('required', [])), set(source.get('required', [])))
                self.assertLessEqual(set(model.schema['properties']), set(source['properties']))
                for key, spec in model.schema['properties'].items():
                    original = source['properties'][key]
                    normalize_type = lambda kind: 'number' if kind.lower() == 'float' else kind.lower()
                    self.assertEqual(normalize_type(spec['type']), normalize_type(original['type']))
                    self.assertEqual(spec.get('format'), original.get('format'))
                    for constraint in ('minimum', 'maximum', 'minItems'):
                        if constraint in original:
                            self.assertEqual(spec.get(constraint), original[constraint])
                    if 'enum' in original:
                        self.assertLessEqual(set(spec['enum']), set(original['enum']))
                    if 'maxItems' in original:
                        self.assertLessEqual(spec['maxItems'], original['maxItems'])
