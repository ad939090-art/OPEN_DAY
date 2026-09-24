import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const server = http.createServer((req, res) => {
  if (req.url === '/api/ws' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('NEXUS RACCOON WebSocket relay');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const wss = new WebSocketServer({ server });
const clients = new Set();
const espClients = new Set();

function sendJSON(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcastToBrowsers(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of clients) {
    if (!espClients.has(ws) && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function sendToESP(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of espClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

wss.on('connection', (ws, req) => {
  clients.add(ws);
  ws.isAlive = true;
  ws.isESP = false;

  console.log('WebSocket connected:', req.url);

  sendJSON(ws, { type: 'relay_connected' });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    const text = raw.toString();
    console.log('WS RX:', text);

    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      sendJSON(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    if (msg.type === 'register_esp') {
      ws.isESP = true;
      espClients.add(ws);
      sendJSON(ws, { type: 'register_ok' });
      console.log('ESP registered. ESP count:', espClients.size);
      return;
    }

    if (msg.type === 'controller_request') {
      sendToESP(msg);
      return;
    }

    if (msg.type === 'controller') {
      broadcastToBrowsers(msg);
      return;
    }

    // Allow a browser/client to send any game packet through the relay.
    if (!ws.isESP) {
      sendToESP(msg);
    } else {
      broadcastToBrowsers(msg);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    espClients.delete(ws);
    console.log('WebSocket closed. ESP count:', espClients.size);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// Keep idle connections alive and remove dead sockets.
setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, 25000);

export default server;
