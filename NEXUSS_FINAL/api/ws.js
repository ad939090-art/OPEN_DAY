import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("NEXUS RACCOON WebSocket relay");
});

const wss = new WebSocketServer({
  server
});

const clients = new Set();
const espClients = new Set();

function sendJSON(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendToESP(data) {
  const message = JSON.stringify(data);

  for (const ws of espClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function sendToBrowsers(data) {
  const message = JSON.stringify(data);

  for (const ws of clients) {
    if (
      !espClients.has(ws) &&
      ws.readyState === WebSocket.OPEN
    ) {
      ws.send(message);
    }
  }
}

wss.on("connection", (ws, req) => {
  console.log("=================================");
  console.log("WEBSOCKET CONNECTED");
  console.log("URL:", req.url);
  console.log("=================================");

  clients.add(ws);

  ws.isESP = false;
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Tell every newly connected client that the relay is alive.
  sendJSON(ws, {
    type: "hello",
    message: "NEXUS RACCOON relay connected"
  });

  ws.on("message", (raw) => {
    const text = raw.toString();

    console.log("WS RX:", text);

    let msg;

    try {
      msg = JSON.parse(text);
    } catch (err) {
      console.log("BAD JSON");

      sendJSON(ws, {
        type: "error",
        message: "Invalid JSON"
      });

      return;
    }

    // ESP registers itself
    if (msg.type === "register_esp") {
      ws.isESP = true;
      espClients.add(ws);

      console.log(
        "ESP REGISTERED. ESP COUNT:",
        espClients.size
      );

      sendJSON(ws, {
        type: "registered",
        role: "esp"
      });

      return;
    }

    // Browser asks ESP for controller data
    if (msg.type === "controller_request") {
      console.log("CONTROLLER REQUEST FROM BROWSER");

      sendToESP(msg);

      return;
    }

    // ESP sends controller data to browser
    if (msg.type === "controller") {
      console.log("CONTROLLER FROM ESP");

      sendToBrowsers(msg);

      return;
    }

    // Other messages
    if (ws.isESP) {
      sendToBrowsers(msg);
    } else {
      sendToESP(msg);
    }
  });

  ws.on("close", (code, reason) => {
    console.log("WEBSOCKET CLOSED");
    console.log("CODE:", code);
    console.log(
      "REASON:",
      reason ? reason.toString() : ""
    );

    clients.delete(ws);
    espClients.delete(ws);

    console.log(
      "ESP COUNT:",
      espClients.size
    );
  });

  ws.on("error", (err) => {
    console.log(
      "WEBSOCKET ERROR:",
      err.message
    );
  });
});

// Keep connections alive.
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
      console.log(
        "PING ERROR:",
        err.message
      );
    }
  }
}, 20000);

export default server;
