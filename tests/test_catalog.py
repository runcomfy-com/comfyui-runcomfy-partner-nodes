import unittest

from runcomfy.catalog import MODELS, get_model


class CatalogTests(unittest.TestCase):
    def test_all_twelve_distinct_model_contracts_are_registered(self):
        self.assertEqual(len(MODELS), 12)
        self.assertEqual(len({m.node_class for m in MODELS.values()}), 12)
        self.assertEqual(sum(m.output_type == 'IMAGE' for m in MODELS.values()), 3)

    def test_canonical_flux_endpoint_and_4k_required_reference(self):
        flux = get_model('blackforestlabs/flux-3/text-to-video')
        self.assertEqual(flux.schema['properties']['duration']['default'], 'auto')
        ref = get_model('bytedance/seedance-2.5/reference-to-video/4k')
        self.assertIn('videos', ref.schema['required'])
        self.assertEqual(ref.schema['properties']['videos']['minItems'], 1)

    def test_unknown_model_cannot_turn_client_into_arbitrary_path(self):
        for name in ['https://example.com', '../requests', 'blackforestlabs/flux-3/video']:
            with self.assertRaises(ValueError):
                get_model(name)

    def test_catalog_does_not_bundle_prices_or_media_defaults(self):
        for model in MODELS.values():
            for field in model.schema['properties'].values():
                if field.get('format', '').endswith(('uri', 'uris')):
                    self.assertNotIn('default', field)
            self.assertNotIn('base_price_usd', model.schema)
