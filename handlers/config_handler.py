"""
Simple plugin to expose selected runtime configuration to the frontend.

Returned JSON shape:
{
  "platform_filter_and": true|false
}
"""
try:
  import config
except Exception:
  # Fallback in case config isn't importable for some reason
  class _C:
    PLATFORM_FILTER_AND = False
  config = _C()


def handle(req):
  # Only support GET
  if req.get('method', 'GET').upper() != 'GET':
    return (405, {'error': 'Method not allowed'})

  return {'platform_filter_and': bool(getattr(config, 'PLATFORM_FILTER_AND', False))}
