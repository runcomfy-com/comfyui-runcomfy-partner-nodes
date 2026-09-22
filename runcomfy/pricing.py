import math
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from .errors import RunComfyError
from .catalog import get_model

MODEL_ID = 'bytedance/seedance-2.5/image-to-video/1080p'
MODEL_URL = 'https://www.runcomfy.com/models/' + MODEL_ID


@dataclass(frozen=True)
class Price:
    rate: Decimal
    fetched_at: str
    note: str = ''
    model_id: str = MODEL_ID
    price_unit: str = 'second'
    estimate_supported: bool = True
    account_scope: str | None = None

    def estimate(self, duration):
        if not self.estimate_supported:
            return None
        if self.price_unit == 'output':
            return self.rate
        if isinstance(duration, dict):
            duration = duration.get('duration')
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
            return None
        return self.rate * Decimal(str(duration))

    def as_dict(self):
        return {
            'model_id': self.model_id,
            'unit_price_usd': float(self.rate),
            'price_unit': self.price_unit,
            'currency': 'USD',
            'fetched_at': self.fetched_at,
            'pricing_note': self.note,
            'estimate_supported': self.estimate_supported,
            **({'account_scope': self.account_scope} if self.account_scope else {}),
        }


def parse_price(data, model_id=MODEL_ID):
    model = get_model(model_id)
    value = data.get('base_price_usd')
    if (data.get('model_id') != model_id or data.get('price_unit') != model.price_unit
            or isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or value < 0):
        raise RunComfyError(
            'The Model API did not return a valid price for this model. Try again before generating.',
            code='price_unavailable',
        )
    return Price(Decimal(str(value)), datetime.now(timezone.utc).isoformat(),
                 str(data.get('pricing_note') or ''), model_id, model.price_unit, model.pricing_mode == 'fixed')
