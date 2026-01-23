import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import url from 'url';

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

// Security hardening configuration
const CONNECTION_TIMEOUT = parseInt(process.env.CONNECTION_TIMEOUT) || 300000;
const WS_MESSAGE_RATE_LIMIT = parseInt(process.env.WS_MESSAGE_RATE_LIMIT) || 30;
const WS_MESSAGE_RATE_WINDOW = parseInt(process.env.WS_MESSAGE_RATE_WINDOW) || 10000;
const CONNECTION_RATE_LIMIT = new Map();
const MAX_CONNECTIONS_PER_IP = 5;
const CONNECTION_RATE_WINDOW = 60000;
const MAX_JSON_DEPTH = 5;
const MAX_STRING_LENGTH = 10000;
const MAX_ARRAY_LENGTH = 100;
const MEMORY_WARNING_THRESHOLD = 400 * 1024 * 1024;
const MEMORY_CRITICAL_THRESHOLD = 500 * 1024 * 1024;

if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'no-referrer' },
    xssFilter: true,
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logWarn(`[Rate Limit] Blocked request from ${req.ip}`);
    res.status(429).json({ error: 'Too many requests, please slow down.' });
  },
});

app.use(limiter);

// Tightened CORS configuration - DO NOT use wildcard in production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173', // Vite preview
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  process.env.FRONTEND_URL,
  process.env.PRODUCTION_URL,
].filter(Boolean);

// Add your production domains here
if (NODE_ENV === 'production') {
  // Example: allowedOrigins.push('https://yourdomain.com', 'https://www.yourdomain.com');
  logInfo(`[CORS] Production mode - allowed origins: ${allowedOrigins.join(', ')}`);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl, etc.)
      if (!origin) {
        // In production, you may want to restrict this
        if (NODE_ENV === 'production') {
          logWarn('[CORS] Request with no origin in production mode');
          return callback(new Error('CORS: No origin header'), false);
        }
        return callback(null, true);
      }

      // In development, allow all origins if CORS_ORIGIN is wildcard
      if (NODE_ENV === 'development' && CORS_ORIGIN === '*') {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const msg = `CORS policy violation: Origin ${origin} not allowed.`;
      logWarn(`[CORS] Blocked origin: ${origin}`);
      return callback(new Error(msg), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 200,
    maxAge: 86400, // Cache preflight requests for 24 hours
  }),
);

app.use(express.json({ limit: '10kb', strict: true }));

app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Local Share Signaling Server',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    clients: wss.clients.size,
    rooms: rooms.size,
    uptime: Math.floor(process.uptime()),
  });
});

app.get('/api/stats', (req, res) => {
  const memUsage = process.memoryUsage();
  const isHealthy =
    wss.clients.size < MAX_CONNECTIONS && memUsage.heapUsed < MEMORY_CRITICAL_THRESHOLD;

  res.json({
    connectedClients: wss.clients.size,
    maxConnections: MAX_CONNECTIONS,
    activeRooms: rooms.size,
    serverUptime: Math.floor(process.uptime()),
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    },
    health: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const healthy =
    wss.clients.size < MAX_CONNECTIONS && memUsage.heapUsed < MEMORY_CRITICAL_THRESHOLD;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks: {
      connections: wss.clients.size < MAX_CONNECTIONS,
      memory: memUsage.heapUsed < MEMORY_CRITICAL_THRESHOLD,
      uptime: process.uptime() > 10,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
  logError('[Express Error]', err.message);
  res.status(err.status || 500).json({
    error: NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
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
  skipUTF8Validation: false,
});

const rooms = new Map();
const clientsBySocket = new Map();
const deviceInfo = new Map();
const messageRateLimits = new Map();
const connectionTimeouts = new Map();

function checkConnectionRateLimit(ip) {
  const now = Date.now();
  const record = CONNECTION_RATE_LIMIT.get(ip) || {
    count: 0,
    resetTime: now + CONNECTION_RATE_WINDOW,
  };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + CONNECTION_RATE_WINDOW;
  } else {
    record.count++;
  }

  CONNECTION_RATE_LIMIT.set(ip, record);
  return record.count <= MAX_CONNECTIONS_PER_IP;
}

function checkMessageRateLimit(peerId) {
  const now = Date.now();
  const record = messageRateLimits.get(peerId) || {
    count: 0,
    resetTime: now + WS_MESSAGE_RATE_WINDOW,
  };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + WS_MESSAGE_RATE_WINDOW;
  } else {
    record.count++;
  }

  messageRateLimits.set(peerId, record);
  return record.count <= WS_MESSAGE_RATE_LIMIT;
}

function safeJSONParse(jsonString) {
  try {
    if (jsonString.length > MAX_MESSAGE_SIZE) {
      return { error: 'Message too large' };
    }
    const obj = JSON.parse(jsonString);
    const sanitized = validateAndSanitizeObject(obj, 0);
    if (sanitized === null) {
      return { error: 'Invalid JSON structure: too deep or malformed' };
    }
    return { data: sanitized };
  } catch (error) {
    return { error: `JSON parse error: ${error.message}` };
  }
}

function validateAndSanitizeObject(obj, depth) {
  if (depth > MAX_JSON_DEPTH) {
    return null;
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj.length > MAX_STRING_LENGTH ? obj.substring(0, MAX_STRING_LENGTH) : obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length > MAX_ARRAY_LENGTH) {
      return null;
    }
    return obj
      .map((item) => validateAndSanitizeObject(item, depth + 1))
      .filter((item) => item !== null);
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    let propCount = 0;

    for (const key in obj) {
      if (propCount++ > 50) break;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      const sanitizedKey = String(key).substring(0, 100);
      const sanitizedValue = validateAndSanitizeObject(obj[key], depth + 1);
      if (sanitizedValue !== null) {
        sanitized[sanitizedKey] = sanitizedValue;
      }
    }
    return sanitized;
  }

  return null;
}

function validateMessage(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Invalid data structure' };
  }

  if (!data.type || typeof data.type !== 'string') {
    return { valid: false, reason: 'Missing or invalid type field' };
  }

  if (data.type.length > 50) {
    return { valid: false, reason: 'Type field too long' };
  }

  // Messages that require a target field (peer-to-peer messages)
  const peerToPeerTypes = ['offer', 'answer', 'candidate', 'ice-candidate'];

  // Messages that don't require a target field (broadcast messages)
  const broadcastTypes = ['ping', 'device-info'];

  // Check target field for peer-to-peer messages
  if (peerToPeerTypes.includes(data.type)) {
    if (!data.target || typeof data.target !== 'string') {
      return { valid: false, reason: 'Missing or invalid target field for peer-to-peer message' };
    }
    if (data.target.length > 50) {
      return { valid: false, reason: 'Target field too long' };
    }
  }

  // Minimal validation for specific types
  if (data.type === 'device-info') {
    if (!data.deviceInfo || typeof data.deviceInfo !== 'object') {
      return { valid: false, reason: 'Invalid device-info payload' };
    }
  }

  // For offer/answer/candidate: just check they exist, don't validate structure
  // This allows flexibility in WebRTC implementations

  return { valid: true };
}

function sanitizeDeviceInfo(deviceInfo) {
  if (!deviceInfo || typeof deviceInfo !== 'object') {
    return {
      deviceName: 'Unknown',
      icon: '',
      deviceType: 'desktop',
    };
  }

  return {
    deviceName: String(deviceInfo.deviceName || 'Unknown').substring(0, 100),
    icon: String(deviceInfo.icon || '').substring(0, 5000),
    deviceType: ['desktop', 'mobile', 'tablet'].includes(deviceInfo.deviceType)
      ? deviceInfo.deviceType
      : 'desktop',
  };
}

function cleanupPeer(ws) {
  const clientInfo = clientsBySocket.get(ws);
  if (!clientInfo) return;

  const { id, roomId } = clientInfo;

  const timeoutId = connectionTimeouts.get(ws);
  if (timeoutId) {
    clearTimeout(timeoutId);
    connectionTimeouts.delete(ws);
  }

  const room = rooms.get(roomId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  clientsBySocket.delete(ws);
  deviceInfo.delete(id);
  messageRateLimits.delete(id);

  broadcast(roomId, { type: 'peer-disconnect', id }, ws);
  logInfo(`[Disconnect] ${id} from room ${roomId}. Total clients: ${wss.clients.size}`);
}

function heartbeat() {
  this.isAlive = true;

  const timeoutId = connectionTimeouts.get(this);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  const newTimeoutId = setTimeout(() => {
    const clientInfo = clientsBySocket.get(this);
    if (clientInfo) {
      logWarn(`[Timeout] Force disconnecting idle client ${clientInfo.id}`);
    }
    this.terminate();
  }, CONNECTION_TIMEOUT);

  connectionTimeouts.set(this, newTimeoutId);
}

function checkMemoryPressure() {
  const memUsage = process.memoryUsage();
  const heapUsed = memUsage.heapUsed;

  if (heapUsed > MEMORY_CRITICAL_THRESHOLD) {
    logError('[Memory] CRITICAL - Forcing garbage collection and dropping oldest connections');

    if (global.gc) {
      global.gc();
    }

    const sortedClients = Array.from(clientsBySocket.entries()).sort(
      (a, b) => a[1].connectedAt - b[1].connectedAt,
    );

    const dropCount = Math.ceil(sortedClients.length * 0.1);
    for (let i = 0; i < dropCount && i < sortedClients.length; i++) {
      const [ws] = sortedClients[i];
      ws.close(1008, 'Server under memory pressure');
    }

    return true;
  } else if (heapUsed > MEMORY_WARNING_THRESHOLD) {
    logWarn(`[Memory] Warning - Heap usage at ${Math.round(heapUsed / 1024 / 1024)}MB`);
    return false;
  }

  return false;
}

wss.on('connection', (ws, req) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();

  // Enhanced origin validation for WebSocket connections
  const origin = req.headers.origin || req.headers.referer;
  if (NODE_ENV === 'production' && CORS_ORIGIN !== '*') {
    if (!origin) {
      ws.close(1008, 'Missing origin header');
      logWarn(`[Reject] WebSocket connection without origin from ${clientIp}`);
      return;
    }

    // Extract origin from referer if needed
    let originToCheck = origin;
    if (origin.startsWith('http')) {
      try {
        const originUrl = new URL(origin);
        originToCheck = originUrl.origin;
      } catch (err) {
        ws.close(1008, 'Invalid origin format');
        logWarn(`[Reject] Invalid origin format from ${clientIp}: ${origin}`);
        return;
      }
    }

    // Check against allowed origins
    if (!allowedOrigins.includes(originToCheck)) {
      ws.close(1008, 'Unauthorized origin');
      logWarn(`[Reject] Unauthorized WebSocket origin: ${originToCheck} from ${clientIp}`);
      return;
    }
  }

  if (!checkConnectionRateLimit(clientIp)) {
    ws.close(1008, 'Connection rate limit exceeded');
    logWarn(`[Reject] IP ${clientIp} exceeded connection rate limit`);
    return;
  }

  if (wss.clients.size >= MAX_CONNECTIONS) {
    ws.close(1008, 'Server at maximum capacity');
    logWarn(`[Reject] Max connections reached (${MAX_CONNECTIONS})`);
    return;
  }

  // Check memory but don't reject, just log warning
  checkMemoryPressure();

  const { query } = url.parse(req.url, true);
  let roomId = query.roomId;

  if (roomId) {
    if (typeof roomId !== 'string' || roomId.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(roomId)) {
      ws.close(1008, 'Invalid room ID');
      logWarn(`[Reject] Invalid room ID format: ${roomId}`);
      return;
    }
  } else {
    roomId = nanoid(6);
  }

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  const room = rooms.get(roomId);

  const MAX_PEERS_PER_ROOM = 10;
  if (room.size >= MAX_PEERS_PER_ROOM) {
    ws.close(1008, 'Room is full');
    logWarn(`[Reject] Room ${roomId} is full`);
    return;
  }

  room.add(ws);

  ws.isAlive = true;
  ws.on('pong', heartbeat);

  const id = `los-${nanoid(10)}`;
  const connectedAt = Date.now();

  clientsBySocket.set(ws, { id, roomId, connectedAt, ip: clientIp });

  const timeoutId = setTimeout(() => {
    logWarn(`[Timeout] Force disconnecting idle client ${id}`);
    ws.terminate();
  }, CONNECTION_TIMEOUT);
  connectionTimeouts.set(ws, timeoutId);

  logInfo(`[Connect] ${id} to room ${roomId} from ${clientIp}. Total: ${wss.clients.size}`);

  try {
    ws.send(JSON.stringify({ type: 'your-id', id, roomId }));
  } catch (error) {
    logError(`[Send Error] Failed to send your-id to ${id}:`, error.message);
    cleanupPeer(ws);
    return;
  }

  const peersInRoom = [];
  room.forEach((client) => {
    if (client !== ws) {
      const clientInfo = clientsBySocket.get(client);
      if (clientInfo) peersInRoom.push(clientInfo.id);
    }
  });

  if (peersInRoom.length > 0) {
    try {
      ws.send(JSON.stringify({ type: 'peer-list', peers: peersInRoom }));

      peersInRoom.forEach((peerId) => {
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
    } catch (error) {
      logError(`[Send Error] Failed to send peer-list to ${id}:`, error.message);
    }
  }

  broadcast(roomId, { type: 'new-peer', id }, ws);

  ws.on('message', (msg) => {
    const senderInfo = clientsBySocket.get(ws);
    if (!senderInfo) {
      logWarn('[Message] Received message from unknown client');
      return;
    }

    const { id: senderId, roomId: senderRoomId } = senderInfo;

    if (!checkMessageRateLimit(senderId)) {
      logWarn(`[Rate Limit] ${senderId} exceeded message rate limit`);
      try {
        ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
      } catch (e) {
        // Ignore
      }
      return;
    }

    if (msg.length > MAX_MESSAGE_SIZE) {
      logWarn(
        `[Large Message] ${senderId} sent message exceeding size limit (${msg.length} bytes)`,
      );
      // Don't close connection, just skip this message
      return;
    }

    const parseResult = safeJSONParse(msg);

    if (parseResult.error) {
      logWarn(`[Parse Error] ${senderId}: ${parseResult.error}`);
      // Don't close connection, just skip this message
      return;
    }

    const data = parseResult.data;

    const validationResult = validateMessage(data);

    if (!validationResult.valid) {
      logWarn(`[Validation Error] ${senderId}: ${validationResult.reason}`);
      // Don't close connection, just skip this message
      return;
    }

    if (data.type === 'ping') {
      try {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      } catch (error) {
        logError(`[Pong Error] ${senderId}:`, error.message);
      }
      return;
    }

    if (data.type === 'device-info') {
      const sanitizedInfo = sanitizeDeviceInfo(data.deviceInfo);
      deviceInfo.set(senderId, sanitizedInfo);

      logInfo(`[Device Info] ${senderId}: ${sanitizedInfo.deviceName}`);

      broadcast(
        senderRoomId,
        {
          type: 'peer-device-info',
          peerId: senderId,
          deviceInfo: sanitizedInfo,
        },
        ws,
      );
      return;
    }

    const room = rooms.get(senderRoomId);
    if (!room) {
      logWarn(`[Message] ${senderId} sent message to non-existent room ${senderRoomId}`);
      return;
    }

    let targetSocket = null;
    for (const client of room) {
      const clientInfo = clientsBySocket.get(client);
      if (clientInfo && clientInfo.id === data.target) {
        targetSocket = client;
        break;
      }
    }

    if (!targetSocket) {
      logWarn(`[Message] ${senderId} target ${data.target} not found in room`);
      return;
    }

    if (targetSocket.readyState !== 1) {
      logWarn(`[Message] ${senderId} target ${data.target} not in OPEN state`);
      return;
    }

    try {
      data.sender = senderId;
      targetSocket.send(JSON.stringify(data));
    } catch (error) {
      logError(`[Forward Error] ${senderId} -> ${data.target}:`, error.message);
    }
  });

  ws.on('error', (error) => {
    const clientInfo = clientsBySocket.get(ws);
    logError(`[WebSocket Error] ${clientInfo ? clientInfo.id : 'unknown'}:`, error.message);
    cleanupPeer(ws);
  });

  ws.on('close', (code, reason) => {
    const clientInfo = clientsBySocket.get(ws);
    logInfo(
      `[Close] ${clientInfo ? clientInfo.id : 'unknown'} - Code: ${code}, Reason: ${
        reason || 'none'
      }`,
    );
    cleanupPeer(ws);
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      const clientInfo = clientsBySocket.get(ws);
      if (clientInfo) {
        logWarn(`[Heartbeat] Terminating dead connection for ${clientInfo.id}`);
        cleanupPeer(ws);
      }
      return ws.terminate();
    }

    ws.isAlive = false;
    try {
      ws.ping();
    } catch (error) {
      logError('[Ping Error]', error.message);
    }
  });
}, HEARTBEAT_INTERVAL);

const memoryCheckInterval = setInterval(() => {
  checkMemoryPressure();
}, 60000);

const cleanupInterval = setInterval(() => {
  const now = Date.now();

  for (const [peerId, record] of messageRateLimits.entries()) {
    if (now > record.resetTime + 60000) {
      messageRateLimits.delete(peerId);
    }
  }

  for (const [ip, record] of CONNECTION_RATE_LIMIT.entries()) {
    if (now > record.resetTime + 60000) {
      CONNECTION_RATE_LIMIT.delete(ip);
    }
  }

  logInfo(
    `[Cleanup] Rate limit maps cleaned. Active entries: ${
      messageRateLimits.size + CONNECTION_RATE_LIMIT.size
    }`,
  );
}, 300000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
  clearInterval(memoryCheckInterval);
  clearInterval(cleanupInterval);
});

function broadcast(roomId, msg, sender) {
  const room = rooms.get(roomId);
  if (!room) return 0;

  const msgStr = JSON.stringify(msg);
  let sent = 0;

  for (const client of room) {
    if (client !== sender && client.readyState === 1) {
      try {
        client.send(msgStr);
        sent++;
      } catch (error) {
        const clientInfo = clientsBySocket.get(client);
        logError(
          `[Broadcast Error] Failed to send to ${clientInfo ? clientInfo.id : 'unknown'}:`,
          error.message,
        );
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

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  logInfo('Shutdown signal received, closing connections...');

  server.close(() => {
    logInfo('HTTP server closed');
  });

  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });

  setTimeout(() => {
    logInfo('Forcing remaining connections to close');
    wss.clients.forEach((ws) => {
      ws.terminate();
    });

    clearInterval(heartbeatInterval);
    clearInterval(memoryCheckInterval);
    clearInterval(cleanupInterval);

    process.exit(0);
  }, 5000);
}

process.on('uncaughtException', (error) => {
  logError('Uncaught Exception - Server will exit:', error);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise);
  logError('Reason:', reason);
});

server.listen(PORT, HOST, () => {
  logInfo(`🚀 Local Share Server v2.1.0 running on ${HOST}:${PORT}`);
  logInfo(`📊 Health check: http://${HOST}:${PORT}/health`);
  logInfo(`📈 Stats API: http://${HOST}:${PORT}/api/stats`);
  logInfo(`💓 Heartbeat interval: ${HEARTBEAT_INTERVAL}ms`);
  logInfo(`⏱️  Connection timeout: ${CONNECTION_TIMEOUT}ms`);
  logInfo(`🔒 Max connections: ${MAX_CONNECTIONS}`);
  logInfo(`📦 Max message size: ${MAX_MESSAGE_SIZE / 1024}KB`);
  logInfo(`🚦 WS rate limit: ${WS_MESSAGE_RATE_LIMIT} msg/${WS_MESSAGE_RATE_WINDOW}ms`);
  logInfo(`🌍 Environment: ${NODE_ENV}`);
  logInfo(`🧠 Memory warning: ${Math.round(MEMORY_WARNING_THRESHOLD / 1024 / 1024)}MB`);
  logInfo(`🔥 Memory critical: ${Math.round(MEMORY_CRITICAL_THRESHOLD / 1024 / 1024)}MB`);

  if (global.gc) {
    logInfo(`♻️  Manual GC available (started with --expose-gc)`);
  } else {
    logWarn(`⚠️  Manual GC not available. Start with: node --expose-gc server.js`);
  }
});
