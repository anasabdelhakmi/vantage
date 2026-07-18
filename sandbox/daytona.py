"""
DAYTONA SANDBOX  --  "the isolated room the agent runs its code in"

Job: give Vantage a secure, disposable Linux sandbox (via Daytona) to run
agent/tool code in isolation instead of on the host machine. Useful once the
agent starts executing generated code or handling untrusted input.

Runs in MOCK MODE by default (no sandbox, runs a callable locally) so the app
works with no credentials -- same pattern as signals/oxylabs.py. When
DAYTONA_API_KEY is set, it provisions a real Daytona sandbox.

Docs: https://www.daytona.io/docs/en/getting-started/
"""

from contextlib import contextmanager

import config


def _make_client():
    """Build a real Daytona client. Imported lazily so mock mode needs no deps."""
    from daytona import Daytona, DaytonaConfig  # only needed in real mode

    kwargs = {"api_key": config.DAYTONA_API_KEY}
    if config.DAYTONA_API_URL:
        kwargs["api_url"] = config.DAYTONA_API_URL
    if config.DAYTONA_TARGET:
        kwargs["target"] = config.DAYTONA_TARGET
    return Daytona(DaytonaConfig(**kwargs))


@contextmanager
def sandbox():
    """
    Context manager yielding a Daytona sandbox (real if a key is set, else None).

    Usage:
        with sandbox() as sb:
            if sb:                      # real Daytona sandbox
                sb.process.code_run("print('hi')")
            else:                       # mock mode -- run locally
                ...

    The sandbox is always cleaned up on exit so we don't leak resources.
    """
    if not config.daytona_enabled():
        # Mock mode: no sandbox, caller runs locally.
        yield None
        return

    client = _make_client()
    sb = client.create()          # defaults: 1 vCPU / 1GB RAM / 3GiB disk, Python
    try:
        yield sb
    finally:
        try:
            client.delete(sb)
        except Exception:
            # Best-effort cleanup; don't mask the original error.
            pass


def run_python(code: str) -> str:
    """
    Run a snippet of Python and return its stdout.

    In real mode it executes inside a Daytona sandbox; in mock mode it runs
    the code locally in a throwaway namespace (so demos work with no key).
    """
    with sandbox() as sb:
        if sb is not None:
            result = sb.process.code_run(code)
            # SDK returns an object with .result / .stdout depending on version.
            return getattr(result, "result", None) or getattr(result, "stdout", str(result))

        # Mock fallback: capture stdout from a local exec.
        import io
        import contextlib

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            exec(code, {"__name__": "__sandbox__"})  # noqa: S102 (demo-only mock path)
        return buf.getvalue()


if __name__ == "__main__":
    mode = "DAYTONA" if config.daytona_enabled() else "MOCK (local)"
    print(f"Sandbox mode: {mode}")
    print(run_python("print('hello from the sandbox')"))
