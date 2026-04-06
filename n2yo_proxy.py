#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 9000

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/n2yo":
            self.send_response(404)
            self._cors()
            self.end_headers()
            self.wfile.write(b"Not found")
            return

        qs = urllib.parse.parse_qs(parsed.query)
        upstream = qs.get("url", [""])[0]
        if not upstream.startswith("https://api.n2yo.com/"):
            self.send_response(400)
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"error":"url must start with https://api.n2yo.com/"}')
            return

        try:
            req = urllib.request.Request(
                upstream,
                headers={"User-Agent": "issdisplay-proxy/1.0"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                status = getattr(resp, "status", 200)
                content_type = resp.headers.get("Content-Type", "application/json")
        except Exception as e:
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body)

if __name__ == "__main__":
    print(f"N2YO proxy listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
