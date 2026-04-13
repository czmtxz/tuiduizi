import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import httpProxy from 'http-proxy';
import selfsigned from 'selfsigned';

const HOST_IP = process.env.DEV_HOST_IP || '192.168.31.86';
const certDir = path.resolve('.certs');
const keyPath = path.join(certDir, 'lan-dev-key.pem');
const certPath = path.join(certDir, 'lan-dev-cert.pem');

const appTarget = 'http://127.0.0.1:5173';
const tokenTarget = 'http://127.0.0.1:8787';
const livekitTarget = 'http://127.0.0.1:7880';

const ensureCertificate = () => {
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
    };
  }

  fs.mkdirSync(certDir, { recursive: true });
  const attrs = [{ name: 'commonName', value: HOST_IP }];
  const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 3650,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: HOST_IP },
          { type: 2, value: 'localhost' },
        ],
      },
    ],
  });
  fs.writeFileSync(keyPath, pems.private, 'utf8');
  fs.writeFileSync(certPath, pems.cert, 'utf8');
  return { key: pems.private, cert: pems.cert };
};

const { key, cert } = ensureCertificate();

const createHttpsProxyServer = ({ port, target, label, ws = false, routeSelector }) => {
  const proxy = httpProxy.createProxyServer({
    target,
    ws,
    changeOrigin: true,
    secure: false,
  });

  proxy.on('error', (error, _req, res) => {
    if (res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res?.end?.(`[${label}] proxy error: ${error.message}`);
  });

  const server = https.createServer({ key, cert }, (req, res) => {
    if (routeSelector) {
      const nextTarget = routeSelector(req);
      proxy.web(req, res, { target: nextTarget });
      return;
    }
    proxy.web(req, res);
  });

  if (ws) {
    server.on('upgrade', (req, socket, head) => {
      if (routeSelector) {
        const nextTarget = routeSelector(req);
        proxy.ws(req, socket, head, { target: nextTarget });
        return;
      }
      proxy.ws(req, socket, head);
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`[https-gateway] ${label}: https://${HOST_IP}:${port} -> ${target}`);
  });
};

createHttpsProxyServer({
  port: 5443,
  target: appTarget,
  label: 'app',
  ws: true,
  routeSelector: (req) => {
    const url = req.url || '';
    if (url.startsWith('/rtc/token')) return tokenTarget;
    if (url.startsWith('/rtc')) return livekitTarget;
    return appTarget;
  },
});
createHttpsProxyServer({ port: 9443, target: tokenTarget, label: 'token' });
createHttpsProxyServer({ port: 7443, target: livekitTarget, label: 'livekit', ws: true });

console.log(`[https-gateway] cert: ${certPath}`);
console.log('[https-gateway] on other devices, trust this self-signed cert if the browser blocks microphone access');

