import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { CONFIG } from './config.js';
import LoSWsServer from './ws-server.js';
import { getServerStats } from './system-info.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize WebSocket signaling server
const wsServer = new LoSWsServer(server, CONFIG);

// JSON body parser with strict limit
app.use(express.json({ limit: '100kb' }));

// Healthcheck endpoint (Docker / K8s / System monitor)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Client configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    version: '3.1.0',
    appName: 'Local Share (LoS)',
    wsFallback: CONFIG.wsFallback,
    rtcConfig: CONFIG.rtcConfig,
  });
});

// Server telemetry endpoint
app.get('/api/status', (req, res) => {
  res.json(getServerStats(wsServer, wsServer.roomManager));
});

// Serve frontend static assets in production
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(
  express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  })
);

// SPA fallback: return index.html for unknown routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return next();
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Local Share (LoS) Server</title><meta charset="utf-8"></head>
          <body style="font-family:system-ui; background:#000000; color:#f8fafc; padding:40px; text-align:center;">
            <h1>Local Share (LoS) Server</h1>
            <p style="color:#94a3b8">Server is running. Run <code>npm run build</code> in the client directory to build the web client.</p>
          </body>
        </html>
      `);
    }
  });
});

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n[LoS Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[LoS Server] Closed all network connections.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[LoS Server] Forced shutdown.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Start server
server.listen(CONFIG.port, CONFIG.host, () => {
  console.log('\n======================================================');
  console.log(`  Local Share (LoS) Server v3.1 Ready`);
  console.log('======================================================');
  console.log(`  Local:            http://localhost:${CONFIG.port}`);

  const networkInterfaces = os.networkInterfaces();
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Network (LAN):    http://${net.address}:${CONFIG.port}`);
      }
    }
  }
  console.log(`  WebSocket Relay:  ${CONFIG.wsFallback ? 'Enabled' : 'Disabled'}`);
  console.log('======================================================\n');
});
