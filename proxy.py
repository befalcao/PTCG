import http.server
import os
import socketserver
import urllib.parse
import urllib.request

PORT = int(os.environ.get("PORT", "8787"))
UPSTREAM = "https://api.pokemontcg.io"
API_KEY = os.environ.get("POKEMON_TCG_API_KEY", "")


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def _set_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/healthz"):
            self.send_response(200)
            self._set_cors()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self._proxy()

    def do_POST(self):
        self._proxy()

    def _proxy(self):
        parsed = urllib.parse.urlsplit(self.path)
        if not parsed.path.startswith("/v2/"):
            self.send_response(404)
            self._set_cors()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Not Found")
            return
        target = urllib.parse.urljoin(UPSTREAM, parsed.path)
        if parsed.query:
            target = f"{target}?{parsed.query}"

        headers = {k: v for k, v in self.headers.items()}
        if API_KEY and "X-Api-Key" not in headers:
            headers["X-Api-Key"] = API_KEY

        data = None
        if self.command not in ("GET", "HEAD"):
            length = int(self.headers.get("Content-Length", "0"))
            data = self.rfile.read(length) if length > 0 else None

        req = urllib.request.Request(target, data=data, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.send_response(resp.status)
                for key, value in resp.headers.items():
                    if key.lower() == "transfer-encoding":
                        continue
                    self.send_header(key, value)
                self._set_cors()
                self.end_headers()
                self.wfile.write(resp.read())
        except Exception as exc:
            try:
                print(f"Proxy error: {exc}")
            except Exception:
                pass
            self.send_response(502)
            self._set_cors()
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Bad Gateway")


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"Proxy running on http://localhost:{PORT}")
        httpd.serve_forever()
