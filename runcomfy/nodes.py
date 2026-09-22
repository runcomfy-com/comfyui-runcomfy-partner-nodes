"""Original node ID and positional call contract, backed by the shared runtime."""
from .partner_nodes import PartnerNode
from .pricing import MODEL_ID


class RunComfySeedance25I2V1080p(PartnerNode):
    MODEL_ID = MODEL_ID
    CATEGORY = 'RunComfy/Video'
    DESCRIPTION = ('Generate a 1080p video using your RunComfy account. A new generation is paid. '
                   'Keep generation_seed fixed to reuse cached output or randomize to generate again. '
                   'Use resume_request_id to retrieve an existing request without submitting another.')
    RETURN_TYPES = ('VIDEO',)
    RETURN_NAMES = ('video',)

    async def generate(self, image=None, prompt='', duration=5, generate_audio=True,
                       resume_request_id='', unique_id=None, generation_seed=0, extra_pnginfo=None):
        return await super().generate(image=image, prompt=prompt, duration=duration,
            generate_audio=generate_audio, resume_request_id=resume_request_id, unique_id=unique_id,
            generation_seed=generation_seed, extra_pnginfo=extra_pnginfo)
