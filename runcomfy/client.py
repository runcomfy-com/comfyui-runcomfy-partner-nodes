import json
import os
import re
from dataclasses import replace

import requests
import aiohttp
import asyncio

from .config import account_scope, validate_token
from .catalog import get_model
from .errors import RunComfyError
from .pricing import MODEL_ID, parse_price

API_BASE = 'https://model-api.runcomfy.net'
API_ENVIRONMENTS = {
    'production': API_BASE,
    'development': 'https://model-api-int.runcomfy.net',
}
MAX_REQUEST_BYTES = 64 * 1024 * 1024


def configured_api_base():
    environment = os.environ.get('RUNCOMFY_API_ENVIRONMENT', 'production')
    if environment not in API_ENVIRONMENTS:
        raise RunComfyError('Set RUNCOMFY_API_ENVIRONMENT to production or development.',
                           'config_error', 400)
    return API_ENVIRONMENTS[environment]


def validate_request_id(request_id):
    if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', request_id):
        raise RunComfyError('Invalid RunComfy request ID.', 'invalid_request_id', 400)
    return request_id


class RunComfyClient:
    def __init__(self, token, session=None, model_id=MODEL_ID):
        self.model_id = get_model(model_id).model_id
        self.api_base = configured_api_base()
        self.token = validate_token(token)
        self.session = session or requests.Session()

    def close(self):
        self.session.close()

    def _request(self, method, path, **kwargs):
        # Authentication stays on the selected RunComfy origin, never on output URLs.
        headers = {
            'Authorization': 'Bearer ' + self.token,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'RunComfy-ComfyUI/0.2.0',
        }
        try:
            response = self.session.request(method, self.api_base + path, headers=headers,
                                            timeout=(10, 90 if method == 'POST' else 20),
                                            allow_redirects=False, **kwargs)
        except requests.RequestException:
            message = 'RunComfy could not be reached. Check the connection and try again.'
            if method == 'POST':
                message = ('The request outcome is unknown and was not automatically retried. '
                           'Check RunComfy Generations before submitting again to avoid duplicate charges.')
            raise RunComfyError(message, 'network_error') from None
        try:
            status = response.status_code
            if status in (401, 403):
                raise RunComfyError('The RunComfy API Token is invalid or cannot access this model.',
                                    'unauthorized', 401)
            if status == 402:
                raise RunComfyError('Insufficient RunComfy balance. Add funds to your account.',
                                    'insufficient_balance', 402)
            if not 200 <= status < 300:
                raise RunComfyError('RunComfy returned HTTP %s. Check your account or retry later.' % status,
                                    'api_error', 502)
            try:
                data = response.json()
            except ValueError:
                raise RunComfyError('RunComfy returned an unreadable response.', 'invalid_response') from None
            if not isinstance(data, dict):
                raise RunComfyError('RunComfy returned an unexpected response.', 'invalid_response')
            return data
        finally:
            response.close()

    def price(self):
        # Intentionally uncached: an updated deployed price is visible on the next read.
        price = parse_price(self._request('GET', '/v1/models/' + self.model_id), self.model_id)
        return replace(price, account_scope=account_scope(self.token))

    def submit(self, inputs):
        # Never retry a paid POST; this API has no documented idempotency contract.
        if len(json.dumps(inputs, allow_nan=False).encode('utf-8')) > MAX_REQUEST_BYTES:
            raise ValueError('Combined media exceeds the 64 MiB request limit. Use shorter or compressed references.')
        try:
            data = self._request('POST', '/v1/models/' + self.model_id, json=inputs)
        except RunComfyError as exc:
            if exc.code in ('api_error', 'invalid_response'):
                raise RunComfyError('Submission could not be confirmed. Check RunComfy Generations '
                                    'before submitting again; the request was not automatically retried.',
                                    'unknown_submission') from None
            raise
        try:
            return validate_request_id(data.get('request_id'))
        except RunComfyError:
            raise RunComfyError('Submission returned no usable request ID. Check RunComfy Generations '
                                'before submitting again; the request was not automatically retried.',
                                'unknown_submission') from None

    def result(self, request_id):
        request_id = validate_request_id(request_id)
        return self._request('GET', '/v1/requests/' + request_id + '/result',
                             params={'include_cost': 'true'})

    def cancel(self, request_id):
        request_id = validate_request_id(request_id)
        return self._request('POST', '/v1/requests/' + request_id + '/cancel')


class AsyncRunComfyClient:
    """Generation transport; configuration routes retain the synchronous client.

    Sessions carry no default credentials. Authentication is attached only to the
    selected RunComfy API origin, and paid POSTs are never retried.
    """
    def __init__(self, token, session=None, model_id=MODEL_ID):
        self.model_id = get_model(model_id).model_id
        self.api_base = configured_api_base()
        self.token = validate_token(token)
        self.session = session or aiohttp.ClientSession()

    async def close(self):
        await self.session.close()

    async def _request(self, method, path, **kwargs):
        headers = {'Authorization': 'Bearer ' + self.token, 'Accept': 'application/json',
                   'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
                   'User-Agent': 'RunComfy-ComfyUI/0.2.0'}
        timeout = aiohttp.ClientTimeout(total=100 if method == 'POST' else 30,
                                        connect=10, sock_read=90 if method == 'POST' else 20)
        try:
            async with self.session.request(method, self.api_base + path, headers=headers,
                                            timeout=timeout, allow_redirects=False, **kwargs) as response:
                status = response.status
                if status in (401, 403):
                    raise RunComfyError('The RunComfy API Token is invalid or cannot access this model.',
                                        'unauthorized', 401)
                if status == 402:
                    raise RunComfyError('Insufficient RunComfy balance. Add funds to your account.',
                                        'insufficient_balance', 402)
                if not 200 <= status < 300:
                    raise RunComfyError('RunComfy returned HTTP %s. Check your account or retry later.' % status,
                                        'api_error', 502)
                try:
                    data = await response.json()
                except (ValueError, aiohttp.ContentTypeError):
                    raise RunComfyError('RunComfy returned an unreadable response.', 'invalid_response') from None
                if not isinstance(data, dict):
                    raise RunComfyError('RunComfy returned an unexpected response.', 'invalid_response')
                return data
        except (aiohttp.ClientError, asyncio.TimeoutError):
            message = 'RunComfy could not be reached. Check the connection and try again.'
            if method == 'POST':
                message = ('The request outcome is unknown and was not automatically retried. '
                           'Check RunComfy Generations before submitting again to avoid duplicate charges.')
            raise RunComfyError(message, 'network_error') from None

    async def price(self):
        price = parse_price(await self._request('GET', '/v1/models/' + self.model_id), self.model_id)
        return replace(price, account_scope=account_scope(self.token))

    async def submit(self, inputs):
        if len(json.dumps(inputs, allow_nan=False).encode('utf-8')) > MAX_REQUEST_BYTES:
            raise ValueError('Combined media exceeds the 64 MiB request limit. Use shorter or compressed references.')
        try:
            data = await self._request('POST', '/v1/models/' + self.model_id, json=inputs)
        except RunComfyError as exc:
            if exc.code in ('api_error', 'invalid_response'):
                raise RunComfyError('Submission could not be confirmed. Check RunComfy Generations '
                                    'before submitting again; the request was not automatically retried.',
                                    'unknown_submission') from None
            raise
        try:
            return validate_request_id(data.get('request_id'))
        except RunComfyError:
            raise RunComfyError('Submission returned no usable request ID. Check RunComfy Generations '
                                'before submitting again; the request was not automatically retried.',
                                'unknown_submission') from None

    async def result(self, request_id):
        return await self._request('GET', '/v1/requests/' + validate_request_id(request_id) + '/result',
                                   params={'include_cost': 'true'})

    async def cancel(self, request_id):
        return await self._request('POST', '/v1/requests/' + validate_request_id(request_id) + '/cancel')
