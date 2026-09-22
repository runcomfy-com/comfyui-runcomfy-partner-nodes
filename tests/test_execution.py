import asyncio
import unittest
from unittest.mock import AsyncMock

from runcomfy.errors import RunComfyError
from runcomfy.execution import async_run_generation
from runcomfy.pricing import parse_price, MODEL_ID


class Interrupted(Exception):
    pass


class ExecutionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = AsyncMock()
        self.client.price.return_value = parse_price({
            'model_id': MODEL_ID, 'base_price_usd': 0.63, 'price_unit': 'second'})
        self.client.submit.return_value = 'job-1'
        self.completed = {'status': 'completed', 'output': {'video': 'https://storage.runcomfy.net/x.mp4'}, 'cost': 3.15}
        self.client.result.return_value = self.completed
        self.client.cancel.return_value = {'status': 'cancelled', 'outcome': 'cancellation_requested'}
        self.events = []
        self.inputs = {'prompt': 'motion', 'duration': 5, 'image': 'data:image/png;base64,AA==', 'generate_audio': True}
        self.stopped = False

    def check(self):
        if self.stopped:
            raise Interrupted()

    async def run_job(self, **kwargs):
        return await async_run_generation(self.client, self.inputs, on_event=self.events.append,
                                           check_interrupt=self.check, poll_interval=.001, **kwargs)

    async def test_price_then_one_submit_then_wait_for_video(self):
        self.client.result.side_effect = [{'status': 'in_queue'}, {'status': 'in_progress'}, self.completed]
        result = await self.run_job()
        self.assertEqual(result['request_id'], 'job-1')
        self.assertEqual(result['cost_usd'], 3.15)
        self.assertEqual(result['quote']['unit_price_usd'], .63)
        self.assertEqual(self.client.method_calls[0][0], 'price')
        self.client.submit.assert_awaited_once()

    async def test_price_failure_never_submits(self):
        self.client.price.side_effect = RunComfyError('price unavailable')
        with self.assertRaises(RunComfyError):
            await self.run_job()
        self.client.submit.assert_not_called()

    async def test_resume_skips_submit_and_price(self):
        result = await self.run_job(resume_request_id='job-existing')
        self.assertEqual(result['request_id'], 'job-existing')
        self.client.submit.assert_not_called()
        self.client.price.assert_not_called()

    async def test_failed_remote_job_is_not_retried_and_hides_provider_body(self):
        self.client.result.return_value = {'status': 'failed', 'error': 'provider-secret'}
        with self.assertRaises(RunComfyError) as caught:
            await self.run_job()
        self.assertIn('job-1', str(caught.exception))
        self.assertNotIn('provider-secret', str(caught.exception))
        self.client.submit.assert_awaited_once()

    async def test_interrupt_after_submit_preserves_request_id_and_reports_actual_outcome(self):
        async def submit(_):
            self.stopped = True
            return 'job-1'
        self.client.submit.side_effect = submit
        self.client.cancel.return_value = {'outcome': 'not_cancellable'}
        with self.assertRaises(Interrupted):
            await self.run_job()
        self.client.cancel.assert_awaited_once_with('job-1')
        self.assertEqual(self.events[-1]['request_id'], 'job-1')
        self.assertIn('already running', self.events[-1]['message'])

    async def test_interrupt_during_waiting_request_cancels_transport_and_remote_job(self):
        transport_closed = asyncio.Event()
        async def slow_result(_):
            self.stopped = True
            try:
                await asyncio.Event().wait()
            finally:
                transport_closed.set()
        self.client.result.side_effect = slow_result
        with self.assertRaises(Interrupted):
            await asyncio.wait_for(self.run_job(), .5)
        self.assertTrue(transport_closed.is_set())
        self.client.cancel.assert_awaited_once_with('job-1')
        self.assertEqual(self.events[-1]['message'], 'The queued request was cancelled.')

    async def test_remote_cancellation_has_a_short_bound(self):
        async def slow_result(_):
            self.stopped = True
            await asyncio.Event().wait()
        async def slow_cancel(_):
            await asyncio.Event().wait()
        self.client.result.side_effect = slow_result
        self.client.cancel.side_effect = slow_cancel
        with self.assertRaises(Interrupted):
            await asyncio.wait_for(self.run_job(cancel_timeout=.01), .5)
        self.assertIn('could not be confirmed', self.events[-1]['message'])

    async def test_interrupt_during_submit_reports_unknown_outcome_without_retry(self):
        async def slow_submit(_):
            self.stopped = True
            await asyncio.Event().wait()
        self.client.submit.side_effect = slow_submit
        with self.assertRaises(Interrupted):
            await asyncio.wait_for(self.run_job(), .5)
        self.client.submit.assert_awaited_once()
        self.client.cancel.assert_not_called()
        self.assertIsNone(self.events[-1]['request_id'])
        self.assertIn('outcome is unknown', self.events[-1]['message'])

    async def test_async_task_cancellation_also_attempts_remote_cancellation(self):
        started = asyncio.Event()
        async def slow_result(_):
            started.set()
            await asyncio.Event().wait()
        self.client.result.side_effect = slow_result
        task = asyncio.create_task(self.run_job())
        await started.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.client.cancel.assert_awaited_once_with('job-1')

    async def test_timeout_retains_request_for_resume_without_claiming_cancellation(self):
        async def slow_result(_):
            await asyncio.Event().wait()
        self.client.result.side_effect = slow_result
        with self.assertRaises(RunComfyError) as caught:
            await self.run_job(timeout=.01)
        self.assertIn('job-1', str(caught.exception))
        self.assertIn('resume_request_id', str(caught.exception))
        self.client.submit.assert_awaited_once()
        self.client.cancel.assert_not_called()

    async def test_independent_generations_overlap_on_the_execution_loop(self):
        active, peak = 0, 0
        async def result(_):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(.01)
            active -= 1
            return self.completed
        self.client.result.side_effect = result
        await asyncio.gather(self.run_job(), self.run_job())
        self.assertEqual(peak, 2)
