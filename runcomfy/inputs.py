"""Translate explicit native node inputs to each model's documented API fields."""
import json

from .client import MAX_REQUEST_BYTES
from .native_media import audio_data_uri, image_data_uris, video_data_uri


def media_ports(model):
    ports = {}
    for key, spec in model.schema['properties'].items():
        kind = spec.get('format')
        if kind == 'image_uri':
            ports[key] = ('IMAGE', ['end_image' if key == 'end_image_url' else 'image'])
        elif kind == 'image_uris':
            ports[key] = ('IMAGE', ['images'])
        elif kind in ('video_uris', 'audio_uris'):
            singular = 'video' if kind == 'video_uris' else 'audio'
            ports[key] = (singular.upper(), [singular + '_' + str(i) for i in range(1, spec['maxItems'] + 1)])
    return ports


def node_input_types(model):
    required, optional = {}, {}
    ports = media_ports(model)
    for key, spec in model.schema['properties'].items():
        if key in ports:
            native_type, names = ports[key]
            for name in names:
                options = {}
                if spec.get('format') == 'image_uris':
                    options['tooltip'] = 'Connect an IMAGE batch with up to %s reference images.' % spec['maxItems']
                elif key in model.schema['required']:
                    options['tooltip'] = 'Required for a new generation; optional when resuming an existing request.'
                optional[name] = (native_type, options)
            continue
        options = {'default': spec.get('default', '')}
        if 'enum' in spec:
            required[key] = (list(spec['enum']), options)
        elif spec['type'] == 'integer':
            options.update(min=spec.get('minimum', 0), max=spec.get('maximum', 2147483647), step=1)
            if key == 'seed':
                options['control_after_generate'] = True
            required[key] = ('INT', options)
        elif spec['type'] == 'boolean':
            required[key] = ('BOOLEAN', options)
        else:
            if key == 'prompt':
                options.update(multiline=True)
            required[key] = ('STRING', options)
    optional['resume_request_id'] = ('STRING', {'default': ''})
    # Append after all legacy widgets so saved workflows keep their old values.
    if 'seed' not in model.schema['properties']:
        optional['generation_seed'] = ('INT', {'default': 0, 'min': 0, 'max': 0xFFFFFFFFFFFFFFFF,
            'step': 1, 'control_after_generate': True,
            'tooltip': 'Rerun control only; this model does not accept a reproducible seed. '
                       'Keep fixed to reuse cached output; randomize for a new paid generation.'})
    return {'required': required, 'optional': optional,
            'hidden': {'unique_id': 'UNIQUE_ID', 'extra_pnginfo': 'EXTRA_PNGINFO'}}


def build_inputs(model, values, check_interrupt=lambda: None):
    fields, result = model.schema['properties'], {}
    ports = media_ports(model)
    # Validate every scalar and required reference before encoding potentially large media.
    for key, spec in fields.items():
        if key in ports:
            _, names = ports[key]
            if key in model.schema['required'] and not any(values.get(name) is not None for name in names):
                raise ValueError('Connect %s before starting this model.' % ('a reference video' if key == 'videos' else names[0]))
            continue
        value = values.get(key, spec.get('default'))
        kind = spec['type']
        if ((kind == 'string' and not isinstance(value, str))
                or (kind == 'integer' and (isinstance(value, bool) or not isinstance(value, int)))
                or (kind == 'boolean' and not isinstance(value, bool))):
            raise ValueError('Invalid %s for this model.' % key)
        if isinstance(value, str):
            value = value.strip()
        if key in model.schema['required'] and value == '':
            raise ValueError('Enter %s before generating.' % key)
        if 'enum' in spec and value not in spec['enum']:
            raise ValueError('Choose a supported %s for this model.' % key)
        if kind == 'integer' and not spec.get('minimum', 0) <= value <= spec.get('maximum', 2147483647):
            raise ValueError('%s is outside this model\'s supported range.' % key)
        result[key] = value
    encoded_size = len(json.dumps(result).encode('utf-8'))
    for key, (native_type, names) in ports.items():
        sources = [values[name] for name in names if values.get(name) is not None]
        if not sources:
            continue
        spec, encoded = fields[key], []
        for source in sources:
            check_interrupt()
            if native_type == 'IMAGE':
                validate_image_dimensions(source, spec)
                items = image_data_uris(source, spec.get('maxItems', 1))
            else:
                items = [(video_data_uri if native_type == 'VIDEO' else audio_data_uri)(source)]
            encoded_size += sum(len(item) for item in items)
            if encoded_size > MAX_REQUEST_BYTES:
                raise ValueError('Combined references exceed the 64 MiB request limit. Use shorter or compressed media.')
            encoded.extend(items)
        result[key] = encoded[0] if spec['type'] == 'string' else encoded
    return result


def validate_image_dimensions(images, spec):
    if not hasattr(images, 'shape') or len(images.shape) != 4:
        raise ValueError('Connect a native image batch.')
    height, width = images.shape[1:3]
    if height <= 0 or width <= 0:
        raise ValueError('The reference image is empty.')
    dimensions = {'width_pixels': width, 'height_pixels': height, 'width/height': width / height}
    for validation in spec.get('validations', []):
        rule = validation['validation_rule']
        # Encoded PNG size is already capped below the catalog's file-size limit.
        if rule[:-1] not in dimensions:
            continue
        actual, expected = dimensions[rule[:-1]], validation['validation_value']
        if (rule.endswith('>') and actual <= expected) or (rule.endswith('<') and actual >= expected):
            raise ValueError(validation['validation_error'])
