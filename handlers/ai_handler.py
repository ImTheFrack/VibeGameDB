"""
AI handler stub.

This module will be responsible for enriching game metadata using an AI or
external APIs (for example: IGDB for game metadata, or a local OpenAI-compatible
endpoint for text enrichment). For now, it returns a not-implemented message.

Coding rules:
- All AI endpoint configuration must come from `config.AI_ENDPOINT_URL`.
- Add comments describing how the module will handle "chain-of-thought" or
  streaming/thinking outputs from the AI in the future.
"""

import json
try:
    import config
except Exception:
    # If config isn't present yet during early development, fall back to None.
    config = None


def handle(req):
    """
    Placeholder handler for AI-related enrichment endpoints.

    Notes / future strategy for AI output parsing and chain-of-thought:
    - Use `config.AI_ENDPOINT_URL` for all outbound AI calls so the endpoint
      can be changed centrally without editing code.
    - Prefer structured output (JSON) from the model: request a final `result`
      field containing the machine-readable answer and, if needed, a
      `thoughts` field for internal chain-of-thought. Treat `thoughts` as
      non-authoritative and do not expose it to end users by default.
    - If streaming responses are used, buffer the stream and only accept the
      final validated JSON object. Validate types and required keys before
      persisting any data.
    - Sanitize any URLs, IDs, or markdown returned by the model before saving
      to the database to avoid injection and broken assets.

    For now, return a harmless placeholder that indicates the handler is not
    implemented. We include the configured AI endpoint (if available) so
    frontend or diagnostics can show where the service would connect.
    """

    ai_url = getattr(config, 'AI_ENDPOINT_URL', None)
    return (200, {"status": "ok", "message": "AI handler not implemented yet.", "ai_endpoint": ai_url})
