"""Translate explicit native node inputs to each model's documented API fields."""
import json
import math

from .client import MAX_REQUEST_BYTES
from .native_media import audio_data_uri, image_data_uris, video_data_uri

# Bound native reference sockets/batches even where the API omits maxItems.
MAX_MEDIA_ITEMS = 16
_MEDIA_TYPES = {kind + suffix: (kind.upper(), suffix == '_uris')
                for kind in ('image', 'video', 'audio') for suffix in ('_uri', '_uris')}
_SCALAR_TYPES = {'string': 'STRING', 'integer': 'INT', 'boolean': 'BOOLEAN',
                 'number': 'FLOAT', 'float': 'FLOAT'}


def _media_limits(spec):
    if not _MEDIA_TYPES[spec['format']][1]:
        return 1, 1
    minimum, maximum = spec.get('minItems', 0), spec.get('maxItems', MAX_MEDIA_ITEMS)
    if (isinstance(minimum, bool) or not isinstance(minimum, int) or minimum < 0
            or isinstance(maximum, bool) or not isinstance(maximum, int) or maximum < max(1, minimum)):
        raise ValueError('Invalid reference count in the model schema.')
    if minimum > MAX_MEDIA_ITEMS:
        raise ValueError('This model requires more references than the node supports.')
    return minimum, min(maximum, MAX_MEDIA_ITEMS)


def _validate_spec(key, spec):
    if not isinstance(spec, dict) or any(name in spec for name in ('oneOf', 'anyOf', 'allOf', '$ref')):
        raise ValueError('Unsupported input schema for %s.' % key)
    if spec.get('format') in _MEDIA_TYPES:
        _, multiple = _MEDIA_TYPES[spec['format']]
        if spec.get('type') != ('array' if multiple else 'string'):
            raise ValueError('Invalid media schema for %s.' % key)
        _media_limits(spec)
    elif spec.get('type') not in _SCALAR_TYPES or spec.get('format', '').startswith(('image_uri', 'video_uri', 'audio_uri')):
        raise ValueError('Unsupported input schema for %s. A dedicated input adapter is required.' % key)
    if 'enum' in spec and (not isinstance(spec['enum'], list) or not spec['enum']
                           or any(isinstance(value, (dict, list)) or value is None for value in spec['enum'])):
        raise ValueError('Unsupported choices for %s.' % key)


def media_ports(model):
    """Keep published aliases, using API field names when aliases would collide."""
    fields = model.schema['properties']
    ports = {}
    occupied = {key for key, spec in fields.items() if spec.get('format') not in _MEDIA_TYPES}
    occupied.update(('resume_request_id', 'generation_seed', 'unique_id', 'extra_pnginfo'))
    formats = [spec.get('format') for spec in fields.values()]
    for key, spec in fields.items():
        _validate_spec(key, spec)
        kind = spec.get('format')
        if kind not in _MEDIA_TYPES:
            continue
        native_type, multiple = _MEDIA_TYPES[kind]
        singular = native_type.lower()
        if kind == 'image_uri':
            base = 'end_image' if key == 'end_image_url' else 'image'
            if formats.count(kind) > 1 and key not in ('image', 'image_url', 'end_image_url'):
                base = key.removesuffix('_url')
        elif kind == 'image_uris':
            base = 'images' if formats.count(kind) == 1 else key.removesuffix('_urls')
        else:
            base = singular if formats.count(kind) == 1 else key.removesuffix('_urls' if multiple else '_url')
        count = _media_limits(spec)[1] if multiple and native_type != 'IMAGE' else 1
        names = [base + '_' + str(i) for i in range(1, count + 1)] if multiple and native_type != 'IMAGE' else [base]
        if any(name in occupied for name in names):
            base = key
            names = [base + '_' + str(i) for i in range(1, count + 1)] if multiple and native_type != 'IMAGE' else [base]
            suffix = 2
            while any(name in occupied for name in names):
                names = [base + '_' + str(suffix) + ('_' + str(i) if count > 1 else '') for i in range(1, count + 1)]
                suffix += 1
        occupied.update(names)
        ports[key] = (native_type, names)
    return ports


def node_input_types(model):
    required, optional = {}, {}
    fields = model.schema['properties']
    required_fields = set(model.schema.get('required', []))
    ports = media_ports(model)
    for key, spec in fields.items():
        if key in ports:
            native_type, names = ports[key]
            for name in names:
                options = {}
                if spec.get('format') == 'image_uris':
                    options['tooltip'] = 'Connect an IMAGE batch with up to %s reference images.' % _media_limits(spec)[1]
                elif key in required_fields:
                    options['tooltip'] = 'Required for a new generation; optional when resuming an existing request.'
                optional[name] = (native_type, options)
            continue
        has_default = 'default' in spec and spec['default'] is not None
        omittable = key not in required_fields and not has_default
        options = {'default': spec['default']} if has_default else {}
        if spec.get('description'):
            options['tooltip'] = spec['description']
        kind = spec['type']
        if 'enum' in spec:
            choices = list(spec['enum'])
            if omittable:
                if '' not in choices:
                    choices.insert(0, '')
                options['default'] = ''
            input_type = choices
        else:
            input_type = _SCALAR_TYPES[kind]
            if kind in ('integer', 'number', 'float'):
                for source, target in (('minimum', 'min'), ('maximum', 'max')):
                    if source in spec:
                        options[target] = spec[source]
                options['step'] = 1 if kind == 'integer' else spec.get('multipleOf', 0.01)
                # ComfyUI otherwise assumes nonnegative integers, excluding API seed=-1.
                if has_default and isinstance(spec['default'], (int, float)) and spec['default'] < 0 and 'min' not in options:
                    options['min'] = spec['default']
                if key == 'seed':
                    options['control_after_generate'] = True
            elif kind == 'string':
                if key in ('prompt', 'lyrics'):
                    options['multiline'] = True
                if not has_default:
                    options['default'] = ''
            if omittable and kind != 'string':
                # An absent socket remains absent; no fabricated 0/false reaches the API.
                options['forceInput'] = True
        if omittable:
            options['tooltip'] = (options.get('tooltip', '') + ' Leave unset to use the model default.').strip()
        (optional if omittable else required)[key] = (input_type, options)
    optional['resume_request_id'] = ('STRING', {'default': ''})
    # Append after all legacy widgets so saved workflows keep their old values.
    if 'seed' not in fields:
        optional['generation_seed'] = ('INT', {'default': 0, 'min': 0, 'max': 0xFFFFFFFFFFFFFFFF,
            'step': 1, 'control_after_generate': True,
            'tooltip': 'Rerun control only; this model does not accept a reproducible seed. '
                       'Keep fixed to reuse cached output; randomize for a new paid generation.'})
    return {'required': required, 'optional': optional,
            'hidden': {'unique_id': 'UNIQUE_ID', 'extra_pnginfo': 'EXTRA_PNGINFO'}}


def _scalar_value(key, spec, value, required):
    kind = spec['type']
    if ((kind == 'string' and not isinstance(value, str))
            or (kind == 'integer' and (isinstance(value, bool) or not isinstance(value, int)))
            or (kind in ('number', 'float') and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)))
            or (kind == 'boolean' and not isinstance(value, bool))):
        raise ValueError('Invalid %s for this model.' % key)
    if isinstance(value, str):
        value = value.strip()
    if required and value == '':
        raise ValueError('Enter %s before generating.' % key)
    if 'enum' in spec and value not in spec['enum']:
        raise ValueError('Choose a supported %s for this model.' % key)
    if kind in ('integer', 'number', 'float'):
        if (('minimum' in spec and value < spec['minimum']) or ('maximum' in spec and value > spec['maximum'])
                or ('exclusiveMinimum' in spec and value <= spec['exclusiveMinimum'])
                or ('exclusiveMaximum' in spec and value >= spec['exclusiveMaximum'])):
            raise ValueError('%s is outside this model\'s supported range.' % key)
        if 'multipleOf' in spec and not math.isclose(value / spec['multipleOf'], round(value / spec['multipleOf']), abs_tol=1e-9):
            raise ValueError('%s must be a multiple of %s.' % (key, spec['multipleOf']))
    if kind == 'string' and (len(value) < spec.get('minLength', 0) or len(value) > spec.get('maxLength', float('inf'))):
        raise ValueError('%s is outside this model\'s supported text length.' % key)
    return value


def _validate_related_inputs(model, values, scalars, ports):
    """Enforce documented cross-field rules only for the identified API contracts."""
    model_id = getattr(model, 'model_id', '')

    def sources(key):
        return [values[name] for name in ports.get(key, (None, []))[1] if values.get(name) is not None]

    if model_id == 'bytedance/seed-audio-1.0/text-to-audio':
        if sources('image_url') and sources('audio_urls'):
            raise ValueError('Seed Audio cannot combine an image reference with audio references. Choose one reference type.')
        for audio in sources('audio_urls'):
            waveform = audio.get('waveform') if isinstance(audio, dict) else None
            rate = audio.get('sample_rate') if isinstance(audio, dict) else None
            if (hasattr(waveform, 'shape') and len(waveform.shape) == 3
                    and isinstance(rate, int) and not isinstance(rate, bool) and rate > 0
                    and waveform.shape[-1] / rate > 30):
                raise ValueError('Seed Audio reference clips must be no longer than 30 seconds.')
    if model_id.startswith('lightricks/ltx-2.5/audio-to-video/'):
        if not sources('image_url') and not scalars.get('prompt'):
            raise ValueError('LTX audio-to-video requires a prompt or a reference image.')
        audio = next(iter(sources('audio_url')), None)
        if isinstance(audio, dict):
            waveform, rate = audio.get('waveform'), audio.get('sample_rate')
            if (hasattr(waveform, 'shape') and len(waveform.shape) == 3
                    and isinstance(rate, int) and not isinstance(rate, bool) and rate > 0
                    and not 2 <= waveform.shape[-1] / rate <= 20):
                raise ValueError('LTX audio-to-video requires an audio clip between 2 and 20 seconds.')
    if model_id == 'acestep-ai/ace-step/audio-inpaint':
        audio = next(iter(sources('audio')), None)
        if not isinstance(audio, dict):
            return  # The native encoder reports invalid AUDIO inputs.
        waveform, rate = audio.get('waveform'), audio.get('sample_rate')
        if not hasattr(waveform, 'shape') or len(waveform.shape) != 3 or isinstance(rate, bool) or not isinstance(rate, int) or rate <= 0:
            return
        duration = waveform.shape[-1] / rate
        start = scalars['start_time']
        end = scalars['end_time']
        if scalars['start_time_relative_to'] == 'end':
            start = duration - start
        if scalars['end_time_relative_to'] == 'end':
            end = duration - end
        if not 0 <= start < end <= duration:
            raise ValueError('The audio inpaint interval must start before it ends and stay inside the reference audio.')


def _validate_encoded_reference(model, spec, uri):
    rules = [rule for rule in spec.get('validations', [])
             if rule.get('validation_rule') in ('file_size_mb<', 'file_size_mb>')]
    if getattr(model, 'model_id', '') == 'bytedance/seed-audio-1.0/text-to-audio':
        rules.append({'validation_rule': 'file_size_mb<', 'validation_value': 10,
                      'validation_error': 'Seed Audio references must be smaller than 10 MB each.'})
    if not rules:
        return
    # Our native encoders produce unwrapped base64. Count decoded bytes without
    # allocating another complete copy of a potentially large reference.
    header, payload = uri.split(',', 1)
    if not header.endswith(';base64') or len(payload) % 4:
        raise ValueError('The encoded media reference is invalid.')
    padding = len(payload) - len(payload.rstrip('='))
    size = len(payload) // 4 * 3 - padding
    for rule in rules:
        limit = rule['validation_value'] * 1_000_000
        if ((rule['validation_rule'].endswith('<') and size >= limit)
                or (rule['validation_rule'].endswith('>') and size <= limit)):
            raise ValueError(rule.get('validation_error', 'The reference exceeds the model file-size limit.'))


def build_inputs(model, values, check_interrupt=lambda: None):
    fields, result = model.schema['properties'], {}
    required_fields = set(model.schema.get('required', []))
    ports = media_ports(model)
    # Validate every scalar and reference count before encoding potentially large media.
    for key, spec in fields.items():
        if key in ports:
            native_type, names = ports[key]
            sources = [values[name] for name in names if values.get(name) is not None]
            if not sources:
                if key in required_fields:
                    raise ValueError('Connect %s before starting this model.' % ('a reference video' if native_type == 'VIDEO' else names[0]))
                continue
            count = 0
            for source in sources:
                if native_type == 'IMAGE':
                    validate_image_dimensions(source, spec)
                    count += source.shape[0]
                else:
                    count += 1
            minimum, maximum = _media_limits(spec)
            if not max(1, minimum) <= count <= maximum:
                raise ValueError('%s requires %s–%s references.' % (key, max(1, minimum), maximum))
            continue
        has_default = 'default' in spec and spec['default'] is not None
        if key not in values or values[key] is None:
            if has_default:
                value = spec['default']
            elif key not in required_fields:
                continue
            else:
                raise ValueError('Enter %s before generating.' % key)
        else:
            value = values[key]
        # Blank optional controls with no API default mean omission, not an empty API value.
        if key not in required_fields and not has_default and isinstance(value, str) and not value.strip():
            if value not in spec.get('enum', []):
                continue
        result[key] = _scalar_value(key, spec, value, key in required_fields)
    _validate_related_inputs(model, values, result, ports)
    encoded_size = len(json.dumps(result, allow_nan=False).encode('utf-8'))
    for key, (native_type, names) in ports.items():
        sources = [values[name] for name in names if values.get(name) is not None]
        if not sources:
            continue
        spec, encoded = fields[key], []
        for source in sources:
            check_interrupt()
            if native_type == 'IMAGE':
                items = image_data_uris(source, _media_limits(spec)[1])
            else:
                items = [(video_data_uri if native_type == 'VIDEO' else audio_data_uri)(source)]
            for item in items:
                _validate_encoded_reference(model, spec, item)
            encoded_size += sum(len(item) for item in items)
            if encoded_size > MAX_REQUEST_BYTES:
                raise ValueError('Combined references exceed the 64 MiB request limit. Use shorter or compressed media.')
            encoded.extend(items)
        result[key] = encoded if _MEDIA_TYPES[spec['format']][1] else encoded[0]
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
        # File-size rules are checked after encoding by _validate_encoded_reference.
        if rule[:-1] not in dimensions:
            continue
        actual, expected = dimensions[rule[:-1]], validation['validation_value']
        if (rule.endswith('>') and actual <= expected) or (rule.endswith('<') and actual >= expected):
            raise ValueError(validation['validation_error'])
