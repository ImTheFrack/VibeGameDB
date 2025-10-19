def handle(req):
    return {"msg": "hello", "method": req["method"], "query": req["query"]}