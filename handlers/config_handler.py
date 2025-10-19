"""
Simple plugin to expose selected runtime configuration to the frontend.

Returned JSON shape:
{
  "platform_filter_and": true|false
}
"""
from .. import config

def handle(req):
    # Only support GET
    if req.get('method', 'GET').upper() != 'GET':
        return (405, {'error': 'Method not allowed'})

    return {'platform_filter_and': bool(getattr(config, 'PLATFORM_FILTER_AND', False))}
