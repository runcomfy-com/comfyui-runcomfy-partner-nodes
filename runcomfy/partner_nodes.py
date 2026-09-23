"""Native IMAGE/VIDEO/AUDIO adapters for the RunComfy model contracts."""
import asyncio

from .catalog import MODELS, get_model
from .client import AsyncRunComfyClient, validate_request_id
from .config import TokenStore, account_scope
from .errors import RunComfyError
from .execution import cost_from_result, async_run_generation
from .inputs import build_inputs, node_input_types
from .journal import RequestJournal
from .async_media import download_video, download_images
from .audio_output import download_audio
from .async_utils import interruptible
from .cache_scope import execution_context, expected_account_scope, remember_account_scope
from .pricing import MODEL_ID as ORIGINAL_MODEL_ID


class PartnerNode:
    FUNCTION = 'generate'

    @classmethod
    def INPUT_TYPES(cls):
        return node_input_types(get_model(cls.MODEL_ID))

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # ComfyUI fingerprints scalar and connected inputs; add account identity.
        # This process-local HMAC never reveals a token in workflow/cache metadata.
        return remember_account_scope(account_scope(TokenStore().get()), execution_context())

    async def generate(self, resume_request_id='', unique_id=None, extra_pnginfo=None, generation_seed=0, **values):
        if not isinstance(resume_request_id, str):
            raise ValueError('resume_request_id must be a string.')
        request_id = resume_request_id.strip()
        if request_id:
            validate_request_id(request_id)
        model = get_model(self.MODEL_ID)
        if isinstance(generation_seed, bool) or not isinstance(generation_seed, int) or not 0 <= generation_seed <= 0xFFFFFFFFFFFFFFFF:
            raise ValueError('generation_seed must be an integer between 0 and 18446744073709551615.')
        token = TokenStore().get()  # Fail immediately before media encoding if no account is configured.
        try:
            import folder_paths
            import comfy.model_management as model_management
            if model.output_type == 'VIDEO':
                from comfy_api.latest import InputImpl
        except ImportError:
            raise RunComfyError('Update ComfyUI to a version with native VIDEO / Save Video support.',
                               'comfyui_version', 400) from None
        interrupted = False

        def check():
            nonlocal interrupted
            try:
                # The throwing helper consumes ComfyUI's global interrupt flag.
                # Async siblings must all observe Stop, as official API nodes do.
                if hasattr(model_management, 'processing_interrupted'):
                    if model_management.processing_interrupted():
                        raise model_management.InterruptProcessingException()
                else:
                    model_management.throw_exception_if_processing_interrupted()
            except BaseException:
                interrupted = True
                raise

        prompt_id, node_id = None, str(unique_id) if unique_id is not None else None
        context = execution_context()
        if context is not None:
            prompt_id, node_id = context.prompt_id, str(context.node_id)
        expected_scope = expected_account_scope(context)
        if expected_scope is not None and expected_scope != account_scope(token):
            raise RunComfyError('The RunComfy account changed after this workflow was queued. '
                               'Run the workflow again with the intended account; no new generation was submitted.',
                               'account_changed', 409)
        workflow = extra_pnginfo.get('workflow') if isinstance(extra_pnginfo, dict) else None
        workflow_id = workflow.get('id') if isinstance(workflow, dict) else None
        if not isinstance(workflow_id, str):
            workflow_id = None
        # Capture the submitting client once, before another async task can change it.
        server, client_id = None, None
        try:
            from server import PromptServer
            server = PromptServer.instance
            client_id = getattr(server, 'client_id', None)
        except (ImportError, AttributeError):
            pass

        inputs = {} if request_id else await interruptible(
            asyncio.to_thread(build_inputs, model, values, check_interrupt=check), check)
        journal = RequestJournal(token, model_id=model.model_id)
        try:
            if request_id:
                journal.validate_resume(request_id)
            journal.prepare()
        except OSError:
            raise RunComfyError('Cannot write RunComfy recovery records. Check configuration directory permissions.',
                               'journal_error') from None
        last_event = {}

        def emit(event):
            nonlocal last_event
            event = {'node_id': node_id, 'prompt_id': prompt_id, 'workflow_id': workflow_id,
                     'model_id': model.model_id, 'account_scope': account_scope(token), **event}
            try:
                journal.record(event)
            except OSError:
                event = {**event, 'message': 'Recovery record could not be saved. Request ID: ' +
                         str(event.get('request_id'))}
            last_event = event
            try:
                if server is not None and client_id:
                    server.send_sync('runcomfy.status', event, client_id)
            except (ImportError, AttributeError, RuntimeError):
                pass

        client = AsyncRunComfyClient(token, model_id=model.model_id)
        try:
            result = await async_run_generation(client, inputs, request_id, on_event=emit, check_interrupt=check,
                                                output_type=model.output_type, model_id=model.model_id)
            request_id = result['request_id']
            emit({**result, 'state': 'downloading', 'message': 'Downloading result…'})
            if model.output_type == 'VIDEO':
                path = await download_video(result['video_url'], folder_paths.get_temp_directory(), check_interrupt=check)
                output = InputImpl.VideoFromFile(path)
            elif model.output_type == 'AUDIO':
                output = await download_audio(result['audio_url'], check_interrupt=check)
            else:
                output = await download_images(result['image_urls'], check_interrupt=check)
            try:
                cost = cost_from_result(await interruptible(client.result(request_id), check))
                if cost is not None:
                    result['cost_usd'] = cost
            except RunComfyError:
                pass
            emit({**result, 'state': 'completed', 'message': 'Result ready. Cost is reported by the Model API.'})
            return {'ui': {'runcomfy': [last_event]}, 'result': (output,)}
        except (RunComfyError, ValueError, OSError) as exc:
            request_id = request_id or last_event.get('request_id')
            message = str(exc) if not isinstance(exc, OSError) else 'Cannot read or save generated media.'
            if request_id and request_id not in message:
                message += ' Request ID: %s. Use resume_request_id to retrieve it without a new generation.' % request_id
            emit({'state': 'error', 'request_id': request_id, 'message': message})
            raise RunComfyError(message, getattr(exc, 'code', 'generation_error'), getattr(exc, 'status', 400)) from None
        except BaseException as exc:
            if (interrupted or isinstance(exc, asyncio.CancelledError)) and last_event.get('state') != 'interrupted':
                request_id = request_id or last_event.get('request_id')
                emit({'state': 'interrupted', 'request_id': request_id,
                      'message': 'Local retrieval stopped. The remote generation may be charged. '
                                 'Use resume_request_id to retrieve it without a new generation.'})
            raise
        finally:
            await client.close()


PARTNER_NODE_MAPPINGS = {}
for _model in MODELS.values():
    if _model.model_id == ORIGINAL_MODEL_ID:
        continue
    PARTNER_NODE_MAPPINGS[_model.node_class] = type(_model.node_class, (PartnerNode,), {
        '__module__': __name__, 'MODEL_ID': _model.model_id,
        'CATEGORY': 'RunComfy/' + _model.output_type.title(),
        'DESCRIPTION': _model.display_name + '. New generations are paid. Fixed inputs reuse cached output; '
                       'change the seed or rerun control for a new generation. ' + ' '.join(_model.limitations),
        'RETURN_TYPES': (_model.output_type,), 'RETURN_NAMES': (_model.output_type.lower(),),
    })
