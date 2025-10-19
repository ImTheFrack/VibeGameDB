def handle(req):
    # echo query param or json body
    name = None
    q = req.get('query', {})
    if 'name' in q and q['name']:
        name = q['name'][0]
    elif req.get('json') and isinstance(req['json'], dict):
        name = req['json'].get('name')
    if not name:
        name = 'world'
    return {'greeting': f'hello {name}'}
