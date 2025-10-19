import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote, quote
import mimetypes
import html

#!/usr/bin/env python3

# Resolve document root for static files: env DOC_ROOT > ./public (if exists) > CWD
DOC_ROOT = os.path.realpath(
    os.environ.get("DOC_ROOT")
    or (
        os.path.join(os.getcwd(), "public")
        if os.path.isdir(os.path.join(os.getcwd(), "public"))
        else os.getcwd()
    )
)


def _resolve_fs_path(url_path: str):
    """Map a URL path to a filesystem path under DOC_ROOT, preventing traversal.
    Returns absolute fs path if within DOC_ROOT, else None.
    """
    # Decode % escapes and remove leading slash
    clean = unquote(url_path)
    rel = clean.lstrip("/")
    fs_path = os.path.realpath(os.path.join(DOC_ROOT, rel))
    try:
        # Ensure the resulting path stays within the DOC_ROOT
        if os.path.commonpath([DOC_ROOT, fs_path]) != DOC_ROOT:
            return None
    except ValueError:
        return None
    return fs_path


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

    def _serve_static(self, url_path: str, allow_listing: bool = True) -> bool:
        """Try to serve a static file under DOC_ROOT. Returns True if handled.
        If a directory is requested and allow_listing is True, serves a simple listing.
        If a directory contains index.html/htm, serves that file.
        """
        fs_path = _resolve_fs_path(url_path)
        if fs_path is None:
            # Attempted traversal or invalid path
            self.send_text("Forbidden", status=403)
            return True

        if os.path.isdir(fs_path):
            # Serve index file if present
            for index in ("index.html", "index.htm"):
                candidate = os.path.join(fs_path, index)
                if os.path.isfile(candidate):
                    fs_path = candidate
                    break
            else:
                if not allow_listing:
                    return False
                try:
                    entries = sorted(os.listdir(fs_path))
                except OSError:
                    self.send_text("Forbidden", status=403)
                    return True
                # Build a very simple directory listing
                display_path = url_path if url_path.endswith('/') else url_path + '/'
                items = []
                for name in entries:
                    href = display_path + quote(name)
                    label = html.escape(name)
                    # Mark directories with a trailing /
                    if os.path.isdir(os.path.join(fs_path, name)):
                        href += "/"
                        label += "/"
                    items.append(f"<li><a href='{href}'>{label}</a></li>")
                html_doc = (
                    "<!doctype html><html><head><meta charset='utf-8'>"
                    f"<title>Index of {html.escape(display_path)}</title></head>"
                    f"<body><h1>Index of {html.escape(display_path)}</h1>"
                    "<ul>" + "".join(items) + "</ul>"
                    "</body></html>"
                )
                self.send_text(html_doc, content_type="text/html; charset=utf-8")
                return True

        if os.path.isfile(fs_path):
            try:
                with open(fs_path, "rb") as f:
                    data = f.read()
            except OSError:
                self.send_text("Not Found", status=404)
                return True
            ctype, _ = mimetypes.guess_type(fs_path)
            if not ctype:
                ctype = "application/octet-stream"
            # Add charset for text types
            if ctype.startswith("text/"):
                ctype = ctype + "; charset=utf-8"
            self._send(status=200, body=data, content_type=ctype)
            return True

        # Not a file or directory we can serve
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/":
            # Prefer serving an index file if present; otherwise show landing
            if self._serve_static(path, allow_listing=False):
                return
            html_page = (
                "<!doctype html><html><head><meta charset='utf-8'>"
                "<title>Basic Python Server</title></head>"
                "<body><h1>It works!</h1>"
                "<p>Try GET /health, GET /echo?msg=hello, or POST /echo with JSON.</p>"
                "</body></html>"
            )
            self.send_text(html_page, content_type="text/html; charset=utf-8")
        elif path == "/health":
            self.send_json({"status": "ok"})
        elif path == "/echo":
            msg = qs.get("msg", [""])[0]
            self.send_json({"echo": msg})
        else:
            # Attempt to serve a static file or directory listing
            if self._serve_static(path, allow_listing=True):
                return
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
        path = parsed.path
        if path in ("/health", "/echo"):
            # Keep simple HEAD responses for JSON/text endpoints
            self._send(status=200, body=b"")
        elif path == "/":
            # Serve index headers if present; otherwise simple OK
            if self._serve_static(path, allow_listing=False):
                return
            self._send(status=200, body=b"")
        else:
            if self._serve_static(path, allow_listing=True):
                return
            self._send(status=404, body=b"")

    def log_message(self, fmt, *args):
        # Cleaner console logs
        print(f"{self.address_string()} - - [{self.log_date_time_string()}] {fmt % args}")

def run(host="0.0.0.0", port=8000):
    server = ThreadingHTTPServer((host, port), RequestHandler)
    print(f"Serving on http://{host}:{port}\nDoc root: {DOC_ROOT}")
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