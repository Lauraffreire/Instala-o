"""Verifica a instalação com Supabase, câmara e modelos de visão simulados.

Executar: python tests/check_site.py (a partir de pages-of-you).
Não requer pacotes Python adicionais. CHROME_PATH permite escolher o navegador.
"""
import functools
import http.server
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import socket
import base64
import hashlib
import json
import struct
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASELINE = '--baseline' in sys.argv


def source_file(name):
    if BASELINE:
        return subprocess.check_output(['git', 'show', 'HEAD:' + name], cwd=ROOT).decode('utf-8')
    return (ROOT / name).read_text(encoding='utf-8')


MOCK = (ROOT / 'tests/mock.js').read_text(encoding='utf-8')
CHECKS = (ROOT / 'tests/checks.js').read_text(encoding='utf-8')


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        if self.path == '/test-mock.js' or self.path == '/test-checks.js':
            body = (MOCK if self.path == '/test-mock.js' else CHECKS).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.end_headers()
            self.wfile.write(body)
        elif self.path == '/test.html':
            html = source_file('index.html')
            html = re.sub(r'    <script src="(?:instalacao/)?supabase/[^\"]+" defer></script>\n', '', html)
            html = html.replace('<head>', '<head><script src="/test-mock.js" defer></script>')
            html = html.replace('</head>', '<script src="/test-checks.js" defer></script></head>')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(html.encode())
        elif self.path.endswith(('.css', '.js')):
            try:
                source = source_file(self.path.lstrip('/'))
            except (OSError, subprocess.CalledProcessError):
                self.send_error(404)
                return
            if self.path.endswith('.js'):
                source = re.sub(r"await import\('https://cdn.jsdelivr.net/npm/@mediapipe/[^']+'\)", 'await window.testVisionImport()', source)
            if self.path.endswith('.css'):
                source = re.sub(r"@import url\(['\"]https://fonts.googleapis.com/.*?\);", '', source)
            self.send_response(200)
            self.send_header('Content-Type', ('text/css' if self.path.endswith('.css') else 'text/javascript') + '; charset=utf-8')
            self.end_headers()
            self.wfile.write(source.encode())
        else:
            super().do_GET()


def evaluate(ws_url, expression):
    """Pedido CDP por WebSocket, apenas com a biblioteca padrão de Python."""
    url = urlsplit(ws_url)
    with socket.create_connection((url.hostname, url.port), timeout=5) as connection:
        key = base64.b64encode(os.urandom(16)).decode()
        connection.sendall((f'GET {url.path} HTTP/1.1\r\nHost: {url.netloc}\r\n'
                            'Upgrade: websocket\r\nConnection: Upgrade\r\n'
                            f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        response = b''
        while not response.endswith(b'\r\n\r\n'):
            response += connection.recv(1)
        expected = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest())
        if b' 101 ' not in response or expected.lower() not in response.lower():
            raise RuntimeError('Falha na ligação ao navegador de teste: ' + response.decode())
        payload = json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expression, 'returnByValue': True}}).encode()
        mask = os.urandom(4)
        header = bytes([0x81, 0x80 | len(payload)]) if len(payload) < 126 else bytes([0x81, 0xfe]) + struct.pack('!H', len(payload))
        connection.sendall(header + mask + bytes(value ^ mask[i % 4] for i, value in enumerate(payload)))

        def read(size):
            data = b''
            while len(data) < size:
                part = connection.recv(size - len(data))
                if not part:
                    raise RuntimeError('O navegador fechou a ligação.')
                data += part
            return data

        while True:
            first, second = read(2)
            length = second & 127
            if length == 126:
                length = struct.unpack('!H', read(2))[0]
            elif length == 127:
                length = struct.unpack('!Q', read(8))[0]
            data = read(length)
            if first & 15 == 1:
                message = json.loads(data)
                if message.get('id') == 1:
                    return message.get('result', {}).get('result', {}).get('value')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    candidates = [os.environ.get('CHROME_PATH', ''),
                  'C:/Program Files/Google/Chrome/Application/chrome.exe',
                  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    browser = next((path for path in candidates if path and Path(path).is_file()), None)
    if not browser:
        raise SystemExit('Defina CHROME_PATH com o caminho de um navegador Chromium.')
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with tempfile.TemporaryDirectory(prefix='poy-test-') as profile:
            process = subprocess.Popen([browser, '--headless', '--disable-gpu',
                                     '--no-first-run', '--no-default-browser-check',
                                     '--disable-background-networking',
                                     '--user-data-dir=' + profile, '--remote-debugging-port=0',
                                     f'http://127.0.0.1:{server.server_port}/test.html'],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            result = None
            try:
                deadline = time.monotonic() + 30
                port_file = Path(profile) / 'DevToolsActivePort'
                while not port_file.exists() and time.monotonic() < deadline:
                    time.sleep(.1)
                port = int(port_file.read_text().splitlines()[0])
                while time.monotonic() < deadline:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/json') as response:
                        pages = json.load(response)
                    page = next((item for item in pages if item.get('type') == 'page'), None)
                    if page:
                        result = evaluate(page['webSocketDebuggerUrl'], 'document.getElementById("test-result")?.textContent')
                        if result:
                            break
                    time.sleep(.1)
                if not result and page:
                    result = 'FAIL: Tempo excedido. ' + str(evaluate(page['webSocketDebuggerUrl'], 'JSON.stringify({errors:window.testErrors, text:document.querySelector("main")?.innerText})'))
            finally:
                process.terminate()
                process.wait(timeout=10)
                time.sleep(.3)
        server.shutdown()
    if not result:
        raise SystemExit('O navegador não terminou a verificação.')
    print(result)
    if not result.startswith('PASS'):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
