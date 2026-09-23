import math
import asyncio

from .client import validate_request_id
from .errors import RunComfyError
from .async_utils import interruptible


def cost_from_result(result):
    cost = result.get('cost')
    if isinstance(cost, (int, float)) and not isinstance(cost, bool) and math.isfinite(cost) and cost >= 0:
        return cost
    return None


def output_video(result):
    output = result.get('output') or {}
    if not isinstance(output, dict):
        return None
    video = output.get('video')
    if isinstance(video, str) and video:
        return video
    videos = output.get('videos')
    if isinstance(videos, list) and len(videos) == 1 and isinstance(videos[0], str):
        return videos[0]
    return None


def output_images(result):
    output = result.get('output') or {}
    if not isinstance(output, dict):
        return None
    images = output.get('images')
    if isinstance(images, list) and images and all(isinstance(url, str) and url for url in images):
        return images
    image = output.get('image')
    return [image] if isinstance(image, str) and image else None


def output_audio(result):
    output = result.get('output') or {}
    if not isinstance(output, dict):
        return None
    audios = output.get('audios')
    # A native AUDIO socket holds one clip. Never silently discard extra clips.
    if isinstance(audios, list) and audios:
        unique = list(dict.fromkeys(audios)) if all(isinstance(url, str) and url for url in audios) else []
        return unique[0] if len(unique) == 1 else None
    audio = output.get('audio')
    return audio if isinstance(audio, str) and audio else None


async def async_run_generation(client, inputs, resume_request_id='', on_event=lambda event: None,
                               check_interrupt=lambda: None, timeout=1800, output_type='VIDEO',
                               model_id=None, poll_interval=5, cancel_timeout=5):
    """One paid submission, interruptible polling, and bounded best-effort cancellation."""
    output_handlers = {'IMAGE': (output_images, 'image_urls'), 'VIDEO': (output_video, 'video_url'),
                       'AUDIO': (output_audio, 'audio_url')}
    if output_type not in output_handlers:
        raise ValueError('Unsupported native output type.')
    extract_output, output_key = output_handlers[output_type]
    request_id = resume_request_id.strip()
    quote = None
    interrupted = False
    submission_started = False

    def emit(state, **extra):
        on_event({'state': state, 'request_id': request_id or None, 'quote': quote, **extra})

    def check():
        nonlocal interrupted
        try:
            check_interrupt()
        except BaseException:
            interrupted = True
            raise

    try:
        check()
        if request_id:
            validate_request_id(request_id)
            emit('resuming', message='Retrieving an existing request; no new generation will be submitted.')
        else:
            price = await interruptible(client.price(), check)
            estimate = price.estimate(inputs)
            quote = {**price.as_dict(), 'estimated_cost_usd': float(estimate) if estimate is not None else None}
            emit('submitting', message='Submitting generation. Model usage is charged separately from machine usage.')
            check()
            submission_started = True
            request_id = await interruptible(client.submit(inputs), check)
            emit('submitted', message='Request submitted.')

        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while True:
            check()
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise asyncio.TimeoutError
            try:
                result = await asyncio.wait_for(interruptible(client.result(request_id), check), remaining)
            except RunComfyError as exc:
                emit('error', message='Could not read the existing request. Resume to retrieve it.')
                raise RunComfyError('%s Request ID: %s. Set resume_request_id to this ID; do not submit '
                                    'a new generation to retry the download.' % (exc, request_id), exc.code, exc.status) from None
            state = result.get('status')
            if model_id and result.get('model_id') and result['model_id'] != model_id:
                raise RunComfyError('This request belongs to a different RunComfy model.', 'model_mismatch', 400)
            if state in ('completed', 'succeeded'):
                url = extract_output(result)
                if not url:
                    raise RunComfyError('Request %s completed without usable %s output. '
                                        'Check RunComfy Generations.' % (request_id, output_type.lower()), 'missing_output')
                return {'state': 'completed', 'request_id': request_id,
                        output_key: url,
                        'cost_usd': cost_from_result(result), 'quote': quote}
            if state in ('failed', 'cancelled'):
                emit(state, message='RunComfy request %s.' % state)
                raise RunComfyError('RunComfy request %s %s. See RunComfy Generations for details.' %
                                    (request_id, state), 'generation_' + state, 400)
            if state not in ('in_queue', 'in_progress', 'pending', 'waiting', 'starting', 'processing'):
                raise RunComfyError('Unknown state for request %s. Use resume_request_id to check it again.' %
                                    request_id, 'unknown_state')
            emit(state, message='Waiting in queue.' if state in ('in_queue', 'pending', 'waiting') else 'Generating…')
            await interruptible(asyncio.sleep(min(poll_interval, max(0, deadline - loop.time()))), check)
    except asyncio.TimeoutError:
        emit('timeout', message='Polling timed out. The remote request may still be running.')
        raise RunComfyError('Polling timed out for %s. Set resume_request_id to %s to retrieve it '
                            'without submitting a new paid generation.' % (request_id, request_id),
                            'poll_timeout', 504) from None
    except BaseException as exc:
        if interrupted or isinstance(exc, asyncio.CancelledError):
            if request_id:
                try:
                    result = await asyncio.wait_for(client.cancel(request_id), cancel_timeout)
                    if result.get('status') == 'cancelled' or result.get('outcome') == 'cancelled':
                        message = 'The queued request was cancelled.'
                    else:
                        message = ('The remote request is already running or completed and may be charged. '
                                   'Use resume_request_id to retrieve it.')
                except (Exception, asyncio.CancelledError):
                    message = ('Remote cancellation could not be confirmed. Check RunComfy Generations; '
                               'use resume_request_id to retrieve the existing request.')
            elif submission_started:
                message = ('Submission was interrupted and its outcome is unknown. Check RunComfy Generations '
                           'before submitting again to avoid duplicate charges.')
            else:
                message = 'Stopped before submitting a generation.'
            emit('interrupted', message=message)
        raise
