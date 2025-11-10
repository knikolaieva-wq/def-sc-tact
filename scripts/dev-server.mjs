#!/usr/bin/env node
// Minimal static file server for local dev on http://localhost:5500
// Serves files from repo root (where index.html and tonconnect-manifest.json live)

import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import core from '@ton/core';
const { beginCell, Address } = core;

const PORT = Number(process.env.PORT || 5500);
const host = process.env.HOST || 'localhost';

// Serve from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = normalize(join(__filename, '..', '..'));
const root = __dirname;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function safeJoin(base, target) {
  const targetPath = normalize(join(base, target));
  if (!targetPath.startsWith(base)) return null; // prevent path traversal
  return targetPath;
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = (req.url || '/').split('?')[0];
    // CORS for API and manifest when accessed cross-origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    // Dynamic TonConnect manifest that always matches current origin
    if (urlPath === '/tonconnect-manifest.json') {
      const proto = (req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http'));
      const hostHeader = req.headers.host || `${host}:${PORT}`;
      const origin = `${proto}://${hostHeader}`;
      const body = JSON.stringify({
        url: origin,
        name: 'TON Payment Demo',
        iconUrl: `${origin}/icon.svg`
      });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(200).end(body);
      return;
    }

    // Simple API: build payload for Transfer
    if (urlPath === '/api/transfer' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const { req: pr, deadline } = data;
          if (!pr || !pr.buyer || !pr.seller || !pr.amount || deadline == null) {
            res.writeHead(400).end('Bad params');
            return;
          }
          const header = 1120014202; // from ABI
          const b0 = beginCell();
          b0.storeUint(header, 32);
          // PaymentRequest
          b0.storeAddress(Address.parse(pr.buyer));
          b0.storeAddress(Address.parse(pr.seller));
          b0.storeInt(BigInt(pr.amount), 257);
          b0.storeBit(!!pr.buyerPaysCommission);
          const bOpt = beginCell();
          bOpt.storeAddress(pr.optionalCommissionWallet ? Address.parse(pr.optionalCommissionWallet) : null);
          b0.storeRef(bOpt.endCell());
          // deadline as separate ref, Int257
          const bDl = beginCell();
          bDl.storeInt(BigInt(deadline), 257);
          b0.storeRef(bDl.endCell());
          const cell = b0.endCell();
          const payloadB64 = cell.toBoc({ idx: false }).toString('base64');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.writeHead(200).end(JSON.stringify({ payload: payloadB64 }));
        } catch (e) {
          res.writeHead(500).end('Encode error');
        }
      });
      return;
    }
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = safeJoin(root, urlPath);
    if (!filePath) {
      res.writeHead(400).end('Bad request');
      return;
    }
    const st = await stat(filePath).catch(() => null);
    if (!st || !st.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    const ext = extname(filePath).toLowerCase();
    const type = types[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, host, () => {
  const base = `http://${host}:${PORT}`;
  // Helpful startup printouts
  console.log('Dev server running:');
  console.log('  - Page:   ', `${base}/index.html`);
  console.log('  - Manifest', `${base}/tonconnect-manifest.json`);
  console.log('  - Icon:   ', `${base}/icon.svg`);
});
