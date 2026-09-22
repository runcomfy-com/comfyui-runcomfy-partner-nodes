"""Allowlisted, offline input contracts for the supported RunComfy models."""
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Model:
    model_id: str
    node_class: str
    display_name: str
    output_type: str
    pricing_mode: str
    schema: dict

    @property
    def price_unit(self):
        return 'output' if self.output_type == 'IMAGE' else 'second'


MODELS = {item['model_id']: Model(**item)
          for item in json.loads(Path(__file__).with_name('models.json').read_text())}


def get_model(model_id):
    if not isinstance(model_id, str) or model_id not in MODELS:
        raise ValueError('Select a supported RunComfy model.')
    return MODELS[model_id]
