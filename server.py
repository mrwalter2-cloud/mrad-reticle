#!/usr/bin/env python3
"""Serve the built PWA (dist/) or tell the user to run npm run build."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
PORT = int(os.environ.get("PORT", "8787"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    if not DIST.is_dir() or not (DIST / "index.html").exists():
        print(
            "No production build found.\n"
            "  npm install\n"
            "  npm run build\n"
            "Then run this server again, or use: npm run dev",
            file=sys.stderr,
        )
        sys.exit(1)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Serving {DIST} on http://0.0.0.0:{PORT}", flush=True)
    httpd.serve_forever()
