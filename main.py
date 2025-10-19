import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

#!/usr/bin/env python3

class RequestHandler(BaseHTTPRequestHandler):
    server_version = "BasicPythonServer/1.0"

    def _send(self, status=200, body=b"", content_type="text/plain; charset=utf-8", extra_headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def send_text(self, text, status=200, content_type="text/plain; charset=utf-8", extra_headers=None):
        self._send(status=status, body=text.encode("utf-8"), content_type=content_type, extra_headers=extra_headers)

    def send_json(self, obj, status=200, extra_headers=None):
        body = json.dumps(obj).encode("utf-8")
        self._send(status=status, body=body, content_type="application/json; charset=utf-8", extra_headers=extra_headers)

    def parse_body_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return None
        data = self.rfile.read(length)
        if not data:
            return None
        try:
            return json.loads(data.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/":
            html = (
                "<!doctype html><html><head><meta charset='utf-8'>"
                "<title>Basic Python Server</title></head>"
                "<body><h1>It works!</h1>"
                "<p>Try GET /health, GET /echo?msg=hello, or POST /echo with JSON.</p>"
                "</body></html>"
            )
            self.send_text(html, content_type="text/html; charset=utf-8")
        elif path == "/health":
            self.send_json({"status": "ok"})
        elif path == "/echo":
            msg = qs.get("msg", [""])[0]
            self.send_json({"echo": msg})
        else:
            self.send_text("Not Found", status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/echo":
            body = self.parse_body_json()
            if body is None:
                self.send_json({"error": "Invalid or missing JSON body"}, status=400)
            else:
                self.send_json({"echo": body})
        else:
            self.send_text("Not Found", status=404)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/health", "/echo"):
            self._send(status=200, body=b"")
        else:
            self._send(status=404, body=b"")

    def log_message(self, fmt, *args):
        # Cleaner console logs
        print(f"{self.address_string()} - - [{self.log_date_time_string()}] {fmt % args}")

def run(host="0.0.0.0", port=8000):
    server = ThreadingHTTPServer((host, port), RequestHandler)
    print(f"Serving on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("Server stopped.")

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    run(host, port)