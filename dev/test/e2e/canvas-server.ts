// Starts the mock Canvas for a test worker. Uses dev/mock-canvas/server.mjs
// when it exists, else a minimal stub (enough for core plumbing tests).
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';

const DEV = path.resolve(import.meta.dirname, '../..');

async function freePort(): Promise<number> {
  return new Promise(res => {
    const s = net.createServer().listen(0, () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => res(p));
    });
  });
}

function stubCert() {
  const dir = path.join(DEV, '.scratch/stub-cert');
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  if (!fs.existsSync(cert)) {
    // Workers race here: generate into a private dir, then rename into place.
    const tmp = `${dir}.${process.pid}`;
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650', '-subj', '/CN=canvas.b2c-mock.test',
      '-addext', 'subjectAltName=DNS:canvas.b2c-mock.test', '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], { stdio: 'ignore' });
    try {
      fs.renameSync(tmp, dir);
    } catch {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

const STUB_PAGE = (title: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<script>ENV = {"current_user_id":"1001","current_user":{"id":"1001","display_name":"Test Student"},"TIMEZONE":"America/Los_Angeles","LOCALE":"en"};</script>
<style>body{margin:0;background:#fff;color:#2d3b45;font-family:sans-serif}#header{position:fixed;left:0;top:0;bottom:0;width:84px;background:var(--ic-brand-global-nav-bgd,#003a5d)}#wrapper{margin-left:84px;padding:24px}</style>
</head><body><header id="header" class="ic-app-header"></header><div id="wrapper"><div id="main"><div id="content-wrapper"><h1>${title}</h1>
<div id="DashboardCard_Container"></div></div></div></div></body></html>`;

export interface CanvasServer {
  port: number;
  kind: 'mock' | 'stub';
  /** Reset the mock's in-memory state (writes from earlier tests in this worker). */
  reset(): Promise<void>;
  close(): Promise<void>;
}

const resetMock = (port: number) =>
  new Promise<void>(resolve => {
    const req = https.request({ host: '127.0.0.1', port, path: '/__mock/reset', method: 'POST', rejectUnauthorized: false }, res => {
      res.resume();
      res.on('end', () => resolve());
    });
    req.on('error', () => resolve());
    req.end();
  });

export async function startCanvas(): Promise<CanvasServer> {
  const port = await freePort();
  const mock = path.join(DEV, 'mock-canvas/server.mjs');
  if (fs.existsSync(mock) && !process.env.B2C_STUB) {
    let child: ChildProcess | null = spawn(process.execPath, [mock, '--port', String(port)], { cwd: path.dirname(mock), stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('mock-canvas did not start')), 15_000);
      const poll = () => {
        const s = net.connect(port, '127.0.0.1', () => { s.end(); clearTimeout(t); resolve(); });
        s.on('error', () => setTimeout(poll, 100));
      };
      poll();
    });
    return { port, kind: 'mock', reset: () => resetMock(port), close: async () => { child?.kill(); child = null; } };
  }
  const srv = https.createServer(stubCert(), (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(STUB_PAGE(req.url ?? '/'));
  });
  await new Promise<void>(r => srv.listen(port, '127.0.0.1', r));
  return { port, kind: 'stub', reset: async () => {}, close: () => new Promise(r => srv.close(() => r())) };
}
