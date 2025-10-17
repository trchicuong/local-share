import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
// Signaling server (Express + ws) used to relay WebRTC offers/answers/ICE; no file data stored.
import express from 'express';
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Server host/port and basic knobs
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://your-frontend.example.com',
    process.env.FRONTEND_URL,
    // CORS allowlist; use FRONTEND_URL to add your deployment domain.
].filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (CORS_ORIGIN === '*' || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            const msg =
                'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
        optionsSuccessStatus: 200,
    }),
);

app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Local Share Signaling Server is running',
        timestamp: new Date().toISOString(),
        // Health endpoint
        clients: clients.size,
        uptime: process.uptime(),
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        connectedClients: clients.size,
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        // Stats endpoint
        timestamp: new Date().toISOString(),
    });
});

const wss = new WebSocketServer({ server });
const clients = new Map();

function heartbeat() {
    this.isAlive = true;
    // WebSocket signaling hub
}
// Map socket -> peerId

wss.on('connection', (ws) => {
    // Mark connections alive on pong
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    const id = `los-${Math.random().toString(36).substr(2, 9)}`;
    clients.set(ws, id);
    console.log(`[Connect] ${id}. Total: ${clients.size}`);
    // Init liveness & heartbeat
    ws.send(JSON.stringify({ type: 'your-id', id }));
    broadcast({ type: 'new-peer', id }, ws);
    const peers = Array.from(clients.values()).filter((pId) => pId !== id);
    // Generate short peer ID
    if (peers.length) {
        ws.send(JSON.stringify({ type: 'peer-list', peers }));
    }
    ws.on('message', (msg) => {
        // Send own ID and notify others
        try {
            const data = JSON.parse(msg);
            const senderId = clients.get(ws);
            // Send current peer list (excluding self)
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                return;
            }
            const target = findClientById(data.target);
            if (target) {
                data.sender = senderId;
                target.send(JSON.stringify(data));
            }
        } catch (error) {
            // Ping/pong for latency diagnostics
            console.error('Error handling message:', error);
        }
    });
    ws.on('close', () => {
        const id = clients.get(ws);
        // Relay signaling to target peer
        if (id) {
            clients.delete(ws);
            console.log(`[Disconnect] ${id}. Total: ${clients.size}`);
            broadcast({ type: 'peer-disconnect', id });
        }
    });
});

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            const id = clients.get(ws);
            if (id) console.log(`[Heartbeat] Terminating dead connection for ${id}`);
            return ws.terminate();
        }
        // Notify others that this peer left
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_INTERVAL);

// Heartbeat: terminate sockets that stopped responding
wss.on('close', () => {
    clearInterval(interval);
});

function broadcast(msg, sender) {
    for (const client of clients.keys()) {
        if (client !== sender && client.readyState === 1) {
            client.send(JSON.stringify(msg));
        }
    }
}

function findClientById(id) {
    for (const [socket, clientId] of clients.entries()) {
        if (clientId === id) return socket;
    }
    // Broadcast to all except sender
    return null;
}

server.listen(PORT, HOST, () => {
    console.log(`🚀 Local Share Server running on ${HOST}:${PORT}`);
    console.log(`📊 Health check: http://${HOST}:${PORT}/`);
    console.log(`📈 Stats API: http://${HOST}:${PORT}/api/stats`);
    console.log(`💓 Heartbeat interval: ${HEARTBEAT_INTERVAL}ms`);
    // Find socket by peer ID
});
