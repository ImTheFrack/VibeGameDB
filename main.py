import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote, quote
import mimetypes
import html
import importlib.util
import importlib
import threading
import sqlite3
import re

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

# Handlers directory (module plugins live here). Keep minimal and local to the repo.
HANDLERS_DIR = os.path.join(os.path.dirname(__file__), "handlers")
# Simple cache: name -> (module, mtime)
_PLUGIN_CACHE = {}
_PLUGIN_LOCK = threading.Lock()

# Add project root to sys.path to allow importing from handlers
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from handlers.database_handler import _get_conn, _ensure_schema

def _load_plugin(name: str):
    """Load (and cache) a plugin module from HANDLERS_DIR/name.py.
    Returns (module, None) or (None, error_message).
    """
    # Basic safety: only allow simple names
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        return None, "invalid plugin name"
    path = os.path.join(HANDLERS_DIR, f"{name}.py")
    if not os.path.isfile(path):
        return None, "not found"
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None, "cannot stat plugin file"

    with _PLUGIN_LOCK:
        cached = _PLUGIN_CACHE.get(name)
        if cached and cached[1] == mtime:
            return cached[0], None
        try:
            spec = importlib.util.spec_from_file_location(f"vibegamedb.handlers.{name}", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            _PLUGIN_CACHE[name] = (module, mtime)
            return module, None
        except Exception as e:
            return None, f"failed to load plugin: {e}"

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

    def _serve_plugin(self, name: str, subpath: str) -> bool:
        """Attempt to load and invoke a plugin handler.
        Returns True if handled (response sent), False otherwise.
        Plugin API: handle(req) -> (status,int, headers:dict, body:bytes/str) OR dict (then returned as JSON).
        """
        module, err = _load_plugin(name)
        if module is None:
            if err == "not found":
                self.send_text("Not Found", status=404)
            else:
                self.send_text(f"Plugin error: {err}", status=500)
            return True

        if not hasattr(module, "handle") or not callable(module.handle):
            self.send_text("Plugin has no handle(req) function", status=500)
            return True

        parsed = urlparse(self.path)
        req = {
            "method": self.command,
            "path": parsed.path,
            "subpath": subpath,
            "query": parse_qs(parsed.query),
            "headers": dict(self.headers),
            "body": b"",
            "json": None,
        }

        # Read body for POST/PUT-like methods (do not consume for other handlers)
        if self.command in ("POST", "PUT", "PATCH"):
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length > 0:
                try:
                    req["body"] = self.rfile.read(length)
                except Exception:
                    req["body"] = b""
            # Try to parse JSON if content-type indicates JSON
            ctype = self.headers.get("Content-Type", "")
            if "application/json" in ctype:
                try:
                    req["json"] = json.loads(req["body"].decode("utf-8"))
                except Exception:
                    req["json"] = None

        try:
            result = module.handle(req)
        except Exception as e:
            # Plugin raised; surface as 500 with short message
            self.send_text(f"Plugin raised exception: {e}", status=500)
            return True

        # Normalize result
        if isinstance(result, dict):
            self.send_json(result)
            return True

        if isinstance(result, (list, tuple)) and len(result) >= 2:
            # (status, body) or (status, headers, body)
            status = int(result[0])
            if len(result) == 2:
                body = result[1]
                headers = {}
            else:
                headers = result[1] or {}
                body = result[2]

            # Convert body
            if isinstance(body, (dict, list)):
                # JSON payload
                self.send_json(body, status=status, extra_headers=headers)
                return True
            if isinstance(body, bytes):
                content_type = headers.pop("Content-Type", "application/octet-stream")
                self._send(status=status, body=body, content_type=content_type, extra_headers=headers)
                return True
            # treat as text
            self.send_text(str(body), status=status, extra_headers=headers)
            return True

        # Fallback: string body
        self.send_text(str(result), status=200)
        return True

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # Plugin route: /plugins/<name> (single-name, no slashes)
        if path.startswith("/plugins/"):
            rest = path[len("/plugins/"):]

            name = rest.split("/", 1)[0]
            subpath = "/" + rest.split("/", 1)[1] if "/" in rest else ""
            if name:
                if self._serve_plugin(name, subpath):
                    return

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

        # Plugin route for POST as well
        if path.startswith("/plugins/"):
            rest = path[len("/plugins/"):]

            name = rest.split("/", 1)[0]
            subpath = "/" + rest.split("/", 1)[1] if "/" in rest else ""
            if name:
                if self._serve_plugin(name, subpath):
                    return

        if path == "/echo":
            body = self.parse_body_json()
            if body is None:
                self.send_json({"error": "Invalid or missing JSON body"}, status=400)
            else:
                self.send_json({"echo": body})
        else:
            self.send_text("Not Found", status=404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/plugins/"):
            rest = path[len("/plugins/"):]
            name = rest.split("/", 1)[0]
            subpath = "/" + rest.split("/", 1)[1] if "/" in rest else ""
            if name and self._serve_plugin(name, subpath):
                return
        self.send_text("Method Not Allowed", status=405)

    def do_PATCH(self):
        # Treat PATCH the same as PUT for our plugin system
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/plugins/"):
            rest = path[len("/plugins/"):]
            name = rest.split("/", 1)[0]
            subpath = "/" + rest.split("/", 1)[1] if "/" in rest else ""
            if name and self._serve_plugin(name, subpath):
                return
        self.send_text("Method Not Allowed", status=405)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/plugins/"):
            rest = path[len("/plugins/"):]
            name = rest.split("/", 1)[0]
            subpath = "/" + rest.split("/", 1)[1] if "/" in rest else ""
            if name and self._serve_plugin(name, subpath):
                return
        self.send_text("Method Not Allowed", status=405)

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
        
def _check_sqlite_features():
    """Checks for critical SQLite features like FTS5 and prints status."""
    print("\n--- SQLite Feature Check ---")
    conn = None
    try:
        conn = _get_conn()
        _ensure_schema(conn) # Ensure DB and tables exist
        
        py_arch = "64-bit" if sys.maxsize > 2**32 else "32-bit"
        print(f"[*] Python Arch:    {py_arch}")
        
        cur = conn.cursor()
        cur.execute("SELECT sqlite_version()")
        version = cur.fetchone()[0]
        print(f"[*] SQLite Version: {version}")
        
        # Check if FTS5 was a compile-time option. This is the most reliable check.
        cur.execute("SELECT sqlite_compileoption_used('SQLITE_ENABLE_FTS5')")
        fts5_enabled = cur.fetchone()[0]
        
        if fts5_enabled:
            print(f"[*] FTS5 Support:   Enabled")
        else:
            print("[!] FTS5 Support:   DISABLED. Full-text search will not work.")
    except sqlite3.OperationalError as e:
        print(f"[!] Database Error during feature check: {e}")
    finally:
        if conn:
            conn.close()
        print("--------------------------\n")
        
def run(host="0.0.0.0", port=5000):
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
    _check_sqlite_features()
    run(host, port)