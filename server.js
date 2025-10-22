import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS) || 100;
const MAX_MESSAGE_SIZE = parseInt(process.env.MAX_MESSAGE_SIZE) || 1024 * 1024;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy - Required for rate limiting behind reverse proxy/load balancer
// Only trust proxy in production when behind nginx/cloudflare/etc
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://your-frontend.example.com',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (CORS_ORIGIN === '*' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json({ limit: '10kb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Local Share Signaling Server is running',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    clients: clientsById.size,
    uptime: Math.floor(process.uptime()),
  });
});

app.get('/api/stats', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    connectedClients: clientsById.size,
    maxConnections: MAX_CONNECTIONS,
    serverUptime: Math.floor(process.uptime()),
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  const healthy =
    clientsById.size < MAX_CONNECTIONS && process.memoryUsage().heapUsed < 500 * 1024 * 1024;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks: {
      connections: clientsById.size < MAX_CONNECTIONS,
      memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024,
    },
  });
});

const wss = new WebSocketServer({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024,
  },
  maxPayload: MAX_MESSAGE_SIZE,
  clientTracking: true,
});

const clientsById = new Map();
const clientsBySocket = new Map();
const deviceInfo = new Map();

const messageRateLimits = new Map();
const MESSAGE_RATE_LIMIT = 50;
const MESSAGE_RATE_WINDOW = 10000;

function checkMessageRateLimit(peerId) {
  const now = Date.now();
  const record = messageRateLimits.get(peerId) || {
    count: 0,
    resetTime: now + MESSAGE_RATE_WINDOW,
  };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + MESSAGE_RATE_WINDOW;
  } else {
    record.count++;
  }

  messageRateLimits.set(peerId, record);
  return record.count <= MESSAGE_RATE_LIMIT;
}

function cleanupPeer(ws, id) {
  if (!id) return;

  clientsById.delete(id);
  clientsBySocket.delete(ws);
  deviceInfo.delete(id);
  messageRateLimits.delete(id);

  broadcast({ type: 'peer-disconnect', id });
  logInfo(`[Disconnect] ${id}. Total: ${clientsById.size}`);
}

function heartbeat() {
  this.isAlive = true;
}

function validateMessage(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.type || typeof data.type !== 'string') return false;
  if (data.type.length > 50) return false;

  const validTypes = ['ping', 'device-info', 'offer', 'answer', 'candidate', 'ice-candidate'];
  if (!validTypes.includes(data.type)) {
    if (!data.target || typeof data.target !== 'string') return false;
  }

  return true;
}

wss.on('connection', (ws, req) => {
  if (clientsById.size >= MAX_CONNECTIONS) {
    ws.close(1008, 'Server at maximum capacity');
    logWarn(`[Reject] Max connections reached (${MAX_CONNECTIONS})`);
    return;
  }

  // Security: Check WebSocket origin in production
  if (NODE_ENV === 'production' && CORS_ORIGIN !== '*') {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      ws.close(1008, 'Unauthorized origin');
      logWarn(`[Reject] Unauthorized origin: ${origin}`);
      return;
    }
  }

  ws.isAlive = true;
  ws.on('pong', heartbeat);

  const id = `los-${nanoid(10)}`;
  clientsById.set(id, ws);
  clientsBySocket.set(ws, id);

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logInfo(`[Connect] ${id} from ${clientIp}. Total: ${clientsById.size}`);

  ws.send(JSON.stringify({ type: 'your-id', id }));
  broadcast({ type: 'new-peer', id }, ws);

  const peers = Array.from(clientsById.keys()).filter((pId) => pId !== id);
  if (peers.length) {
    ws.send(JSON.stringify({ type: 'peer-list', peers }));

    peers.forEach((peerId) => {
      const peerDeviceInfo = deviceInfo.get(peerId);
      if (peerDeviceInfo) {
        ws.send(
          JSON.stringify({
            type: 'peer-device-info',
            peerId: peerId,
            deviceInfo: peerDeviceInfo,
          }),
        );
      }
    });
  }

  ws.on('message', (msg) => {
    const senderId = clientsBySocket.get(ws);
    if (!senderId) return;

    if (!checkMessageRateLimit(senderId)) {
      logWarn(`[Rate Limit] ${senderId} exceeded message rate limit`);
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
      return;
    }

    try {
      if (msg.length > MAX_MESSAGE_SIZE) {
        logWarn(`[Large Message] ${senderId} sent message exceeding size limit`);
        return;
      }

      const data = JSON.parse(msg);

      if (!validateMessage(data)) {
        logWarn(`[Invalid Message] ${senderId} sent invalid message`);
        return;
      }

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }

      if (data.type === 'device-info') {
        if (!data.deviceInfo || typeof data.deviceInfo !== 'object') {
          logWarn(`[Invalid Device Info] ${senderId}`);
          return;
        }

        const sanitizedInfo = {
          deviceName: String(data.deviceInfo.deviceName || 'Unknown').substring(0, 100),
          icon: String(data.deviceInfo.icon || '').substring(0, 1000),
          deviceType: String(data.deviceInfo.deviceType || 'desktop').substring(0, 20),
        };

        deviceInfo.set(senderId, sanitizedInfo);
        logInfo(`[Device Info] ${senderId}: ${sanitizedInfo.deviceName}`);

        broadcast(
          {
            type: 'peer-device-info',
            peerId: senderId,
            deviceInfo: sanitizedInfo,
          },
          ws,
        );
        return;
      }

      const targetSocket = clientsById.get(data.target);
      if (targetSocket && targetSocket.readyState === 1) {
        data.sender = senderId;
        targetSocket.send(JSON.stringify(data));
      }
    } catch (error) {
      logError(`[Message Error] ${senderId}:`, error.message);
    }
  });

  ws.on('error', (error) => {
    const id = clientsBySocket.get(ws);
    logError(`[WebSocket Error] ${id || 'unknown'}:`, error.message);
    cleanupPeer(ws, id);
  });

  ws.on('close', () => {
    const id = clientsBySocket.get(ws);
    cleanupPeer(ws, id);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      const id = clientsBySocket.get(ws);
      if (id) {
        logWarn(`[Heartbeat] Terminating dead connection for ${id}`);
        cleanupPeer(ws, id);
      }
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

function broadcast(msg, sender) {
  const msgStr = JSON.stringify(msg);
  let sent = 0;

  for (const [id, client] of clientsById.entries()) {
    if (client !== sender && client.readyState === 1) {
      try {
        client.send(msgStr);
        sent++;
      } catch (error) {
        logError(`[Broadcast Error] Failed to send to ${id}:`, error.message);
      }
    }
  }

  return sent;
}

function logInfo(message) {
  console.log(`[${new Date().toISOString()}] INFO: ${message}`);
}

function logWarn(message) {
  console.warn(`[${new Date().toISOString()}] WARN: ${message}`);
}

function logError(message, error) {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error || '');
}

process.on('SIGTERM', () => {
  logInfo('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logInfo('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logInfo('SIGINT received, shutting down gracefully');
  server.close(() => {
    logInfo('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logError('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise, 'reason:', reason);
});

server.listen(PORT, HOST, () => {
  logInfo(`🚀 Local Share Server v2.0 running on ${HOST}:${PORT}`);
  logInfo(`📊 Health check: http://${HOST}:${PORT}/health`);
  logInfo(`📈 Stats API: http://${HOST}:${PORT}/api/stats`);
  logInfo(`💓 Heartbeat interval: ${HEARTBEAT_INTERVAL}ms`);
  logInfo(`🔒 Max connections: ${MAX_CONNECTIONS}`);
  logInfo(`📦 Max message size: ${MAX_MESSAGE_SIZE / 1024}KB`);
  logInfo(`🌍 Environment: ${NODE_ENV}`);
});
