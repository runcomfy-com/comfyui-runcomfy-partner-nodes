import asyncio
import os
from urllib.parse import urlparse

from aiohttp import web

from .client import RunComfyClient, validate_request_id
from .catalog import MODELS, get_model
from .config import TokenStore, validate_token
from .errors import RunComfyError
from .journal import RequestJournal


def guard_request(request, mutation=False):
    origin = request.headers.get('Origin')
    if origin:
        parsed = urlparse(origin)
        expected = os.environ.get('RUNCOMFY_PUBLIC_ORIGIN') or '%s://%s' % (request.scheme, request.host)
        if parsed.scheme not in ('http', 'https') or origin != expected.rstrip('/'):
            raise web.HTTPForbidden(text='Cross-origin RunComfy requests are not allowed.')
    if mutation:
        if request.headers.get('X-RunComfy-Client') != 'comfyui' or request.content_type != 'application/json':
            raise web.HTTPForbidden(text='RunComfy configuration requires a same-origin JSON request.')


def json_response(data, status=200):
    return web.json_response(data, status=status, headers={'Cache-Control': 'no-store'})


def execution_scope(prompt_id, queue):
    """Only public execution identity; never serialize queue inputs or extra_data."""
    supported = {model.node_class for model in MODELS.values()}

    def from_item(item):
        if not isinstance(item, (tuple, list)) or len(item) < 4 or item[1] != prompt_id:
            return None
        prompt, extra = item[2], item[3]
        info = extra.get('extra_pnginfo') if isinstance(extra, dict) else None
        workflow = info.get('workflow') if isinstance(info, dict) else None
        workflow_id = workflow.get('id') if isinstance(workflow, dict) else None
        if not isinstance(prompt, dict) or not isinstance(workflow_id, str) or not workflow_id:
            return None
        node_types = {str(key): value['class_type'] for key, value in prompt.items()
                      if isinstance(value, dict) and value.get('class_type') in supported}
        return {'prompt_id': prompt_id, 'workflow_id': workflow_id, 'nodes': node_types}

    # The queue's volatile snapshot avoids copying image inputs; items are immutable.
    read_queue = getattr(queue, 'get_current_queue_volatile', queue.get_current_queue)
    running, pending = read_queue()
    for item in [*running, *pending]:
        result = from_item(item)
        if result is not None:
            return result
    history = queue.get_history(prompt_id=prompt_id, map_function=lambda entry: from_item(entry.get('prompt')))
    result = history.get(prompt_id)
    if result is None:
        raise RunComfyError('Execution scope is unavailable for this prompt.', 'execution_not_found', 404)
    return result


def create_routes(store=None, client_factory=RunComfyClient, prompt_queue=None):
    store = store or TokenStore()
    routes = web.RouteTableDef()

    async def respond(operation):
        try:
            return json_response(await asyncio.to_thread(operation))
        except RunComfyError as exc:
            return json_response({'error': str(exc), 'code': exc.code}, exc.status)
        except ValueError as exc:
            return json_response({'error': str(exc), 'code': 'invalid_config'}, 400)
        except OSError:
            return json_response({'error': 'Cannot access RunComfy configuration or request records. Check file permissions.',
                                  'code': 'config_error'}, 500)

    @routes.get('/runcomfy/config')
    async def get_config(request):
        guard_request(request)
        return await respond(store.status)

    @routes.post('/runcomfy/config')
    async def save_config(request):
        guard_request(request, mutation=True)
        if request.content_length and request.content_length > 16384:
            return json_response({'error': 'Token configuration is too large.', 'code': 'invalid_config'}, 400)
        try:
            data = await request.json()
            token = validate_token(data.get('token') if isinstance(data, dict) else None)
        except ValueError:
            return json_response({'error': 'Enter a valid RunComfy API Token.', 'code': 'invalid_config'}, 400)

        def save():
            client = client_factory(token)
            try:
                client.price()  # Validate with a read-only API request before saving.
                store.save(token)
                return store.status()
            finally:
                client.close()
        return await respond(save)

    @routes.delete('/runcomfy/config')
    async def delete_config(request):
        guard_request(request, mutation=True)
        def clear():
            store.delete()
            return store.status()
        return await respond(clear)

    @routes.get('/runcomfy/seedance-25/price')
    async def get_price(request):
        guard_request(request)
        def read():
            client = client_factory(store.get())
            try:
                return client.price().as_dict()
            finally:
                client.close()
        return await respond(read)

    @routes.get('/runcomfy/requests')
    async def get_requests(request):
        guard_request(request)
        def read():
            journal = RequestJournal(store.get(), store.path.with_name('runcomfy_requests.json'))
            return {'requests': journal.recent()}
        return await respond(read)

    @routes.get('/runcomfy/execution-scope')
    async def get_execution_scope(request):
        guard_request(request)
        def read():
            prompt_id = validate_request_id(request.query.get('prompt_id'))
            queue = prompt_queue
            if queue is None:
                from server import PromptServer
                queue = PromptServer.instance.prompt_queue
            return execution_scope(prompt_id, queue)
        return await respond(read)

    @routes.get('/runcomfy/models/price')
    async def get_model_price(request):
        guard_request(request)
        def read():
            model = get_model(request.query.get('model_id'))
            client = client_factory(store.get(), model_id=model.model_id)
            try:
                return client.price().as_dict()
            finally:
                client.close()
        return await respond(read)

    return routes


def register_routes():
    from server import PromptServer
    for route in create_routes():
        PromptServer.instance.routes.route(route.method, route.path)(route.handler)
