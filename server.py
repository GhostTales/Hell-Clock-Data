import http.server
import socketserver
import os
import sys

PORT = 8000

class JavascriptMimeHandler(http.server.SimpleHTTPRequestHandler):
    """
    Custom handler to ensure .js files are served with the correct MIME type.
    This fixes issues on Windows where .js files might default to 'text/plain'.
    """
    def guess_type(self, path):
        base, ext = os.path.splitext(path)
        if ext.lower() == '.js':
            return 'application/javascript'
        return super().guess_type(path)

    def end_headers(self):
        # Disable caching to ensure changes are seen immediately during development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

if __name__ == '__main__':
    # Ensure we serve from the directory containing this script
    web_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(web_dir)

    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer(("", PORT), JavascriptMimeHandler) as httpd:
        print(f"Serving HTTP on 0.0.0.0 port {PORT} (http://localhost:{PORT}) ...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            sys.exit(0)