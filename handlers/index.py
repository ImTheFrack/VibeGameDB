def handle(req):
    """Server-rendered index page.
    Query param 'name' is optional.
    Returns: (status, headers, body) as supported by the plugin loader.
    """
    import html, time
    name = "world"
    q = req.get("query") or {}
    if "name" in q and isinstance(q["name"], list) and q["name"]:
        name = q["name"][0]
    safe_name = html.escape(name)
    body = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Dynamic Index (server)</title></head>
<body>
  <h1>Hello, {safe_name}!</h1>
  <p>Served by plugin at {time.ctime()}</p>
  <p>Request method: {html.escape(req.get('method',''))}</p>
</body></html>"""
    return 200, {"Content-Type": "text/html; charset=utf-8"}, body