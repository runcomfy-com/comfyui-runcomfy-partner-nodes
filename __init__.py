from .runcomfy.nodes import RunComfySeedance25I2V1080p
from .runcomfy.catalog import MODELS
from .runcomfy.partner_nodes import PARTNER_NODE_MAPPINGS
from .runcomfy.routes import register_routes

NODE_CLASS_MAPPINGS = {'RunComfySeedance25I2V1080p': RunComfySeedance25I2V1080p, **PARTNER_NODE_MAPPINGS}
NODE_DISPLAY_NAME_MAPPINGS = {model.node_class: model.display_name for model in MODELS.values()}
WEB_DIRECTORY = './web'

register_routes()

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
