# Check 6: Cross-Cutting Spec Compliance

List all specs in `.context-index/specs/cross-cutting/`. For each cross-cutting spec relevant to the implementation:

1. Read the spec's requirements (e.g., error handling conventions, API versioning rules, auth flow requirements).
2. Verify the implementation follows those requirements.

Relevance is determined by the domain: if a cross-cutting spec covers error handling and the implementation includes error handling code, that spec is relevant.

If no cross-cutting specs exist or none are relevant, record PASS (no applicable cross-cutting specs).
