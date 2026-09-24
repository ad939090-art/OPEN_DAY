import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const server = http.createServer((req, res) => {
  // Normal HTTP test
  if (req.url === "/api/ws" || req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("NEXUS RACCOON WebSocket relay");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({
  server,
  clientTracking: true,
});

const clients = new Set();
const espClients = new Set();

function sendJSON(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendToESP(data) {
  const msg = JSON.stringify(data);

  for (const ws of espClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcast(data) {
  const msg = JSON.stringify(data);

  for (const ws of clients) {
    if (
      !espClients.has(ws) &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(msg);
    }
  }
}

wss.on("connection", (ws, req) => {
  console.log("WS CONNECTED:", req.url);

  clients.add(ws);

  ws.isAlive = true;
  ws.isESP = false;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("error", (err) => {
    console.error("WS ERROR:", err.message);
  });

  ws.on("message", (raw) => {
    const text = raw.toString();

    console.log("WS RX:", text);

    let msg;

    try {
      msg = JSON.parse(text);
    } catch {
      console.log("BAD JSON");
      sendJSON(ws, {
        type: "error",
        message: "Invalid JSON",
      });
      return;
    }

    // ESP announces itself
    if (msg.type === "register_esp") {
      ws.isESP = true;
      espClients.add(ws);

      console.log(
        "ESP REGISTERED. COUNT:",
        espClients.size
      );

      sendJSON(ws, {
        type: "register_ok",
      });

      return;
    }

    // Browser asks ESP for controller state
    if (msg.type === "controller_request") {
      sendToESP(msg);
      return;
    }

    // ESP sends controller state
    if (msg.type === "controller") {
      console.log("CONTROLLER FROM ESP");
      broadcast(msg);
      return;
    }

    // Other packets
    if (ws.isESP) {
      broadcast(msg);
    } else {
      sendToESP(msg);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(
      "WS CLOSED:",
      code,
      reason?.toString() || ""
    );

    clients.delete(ws);
    espClients.delete(ws);

    console.log(
      "ESP COUNT:",
      espClients.size
    );
  });

  // IMPORTANT:
  // Do NOT immediately send a relay_connected packet.
  // Let the ESP send register_esp first.
});

setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      console.log("TERMINATING DEAD SOCKET");
      ws.terminate();
      continue;
    }

    ws.isAlive = false;

    try {
      ws.ping();
    } catch (err) {
      console.error("PING ERROR:", err.message);
    }
  }
}, 20000);

export default server;
