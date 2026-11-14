"""Create the usine prompts in Langfuse when they are missing (MEM-16).

    uv run python -m usine_api.prompt_seed

The code defaults (graph/prompts.py) become version 1, label `production`. A
prompt that already exists is left alone: once in Langfuse, its text is edited
there, and the version in service is the one Langfuse labels `production`.
"""

from __future__ import annotations

from langfuse import get_client

from usine_api.graph.prompts import DEFAULTS
from usine_api.observability import tracing_configured


def missing(names: list[str]) -> list[str]:
    client = get_client()
    absent = []
    for name in names:
        try:
            client.get_prompt(name, cache_ttl_seconds=0, max_retries=0)
        except Exception:  # noqa: BLE001 - not found is an exception in the SDK
            absent.append(name)
    return absent


def main() -> None:
    if not tracing_configured():
        raise SystemExit("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are not set")
    client = get_client()
    for name in missing(sorted(DEFAULTS)):
        client.create_prompt(name=name, prompt=DEFAULTS[name], labels=["production"], type="text")
        print(f"created {name}")
    for name in sorted(DEFAULTS):
        prompt = client.get_prompt(name, cache_ttl_seconds=0)
        print(f"{name}: version {prompt.version}, fallback={prompt.is_fallback}")
    client.flush()


if __name__ == "__main__":
    main()
