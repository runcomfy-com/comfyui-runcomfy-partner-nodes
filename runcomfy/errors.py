class RunComfyError(RuntimeError):
    """A user-facing error that contains no credentials or upstream response body."""

    def __init__(self, message, code='api_error', status=502):
        super().__init__(message)
        self.code = code
        self.status = status
