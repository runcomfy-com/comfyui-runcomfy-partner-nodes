"""Cooperative interruption without blocking ComfyUI's execution event loop."""
import asyncio
import contextlib


async def interruptible(awaitable, check_interrupt=lambda: None, interval=0.1):
    task = asyncio.ensure_future(awaitable)
    try:
        while True:
            check_interrupt()
            done, _ = await asyncio.wait({task}, timeout=interval)
            if done:
                # Consume a completed paid submit before checking interruption again:
                # its request ID is needed to cancel/recover the remote generation.
                return await task
    finally:
        if not task.done():
            task.cancel()
        with contextlib.suppress(BaseException):
            await task
