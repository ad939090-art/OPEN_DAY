import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const server = http.createServer((req, res) => {
  if (req.url === "/api/ws" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("NEXUS RACCOON WebSocket relay");
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({
  server,
  clientTracking: true,
  perMessageDeflate: false
});

const espClients = new Set();
const browserClients = new Set();

wss.on("connection", (ws, req) => {
  console.log("WebSocket connected:", req.url);
  ws.isAlive = true;
  ws.role = null;

  ws.send(JSON.stringify({
    type: "hello",
    message: "NEXUS RACCOON relay connected"
  }));

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("WS MESSAGE:", JSON.stringify(data));

      if (data.type === "register_esp") {
        ws.role = "esp";
        espClients.add(ws);
        ws.send(JSON.stringify({ type: "registered", role: "esp" }));
        console.log("ESP registered. ESP count:", espClients.size);
        return;
      }

      if (data.type === "register_browser") {
        ws.role = "browser";
        browserClients.add(ws);
        ws.send(JSON.stringify({ type: "registered", role: "browser" }));
        console.log("Browser registered. Browser count:", browserClients.size);
        for (const esp of espClients) {
          if (esp.readyState === WebSocket.OPEN) {
            esp.send(JSON.stringify({ type: "controller_request" }));
          }
        }
        return;
      }

      if (data.type === "controller") {
        for (const browser of browserClients) {
          if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(data));
        }
        return;
      }

      if (data.type === "controller_request") {
        for (const esp of espClients) {
          if (esp.readyState === WebSocket.OPEN) esp.send(JSON.stringify({ type: "controller_request" }));
        }
        return;
      }

      if (data.type === "broadcast") {
        for (const client of wss.clients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data.data ?? data));
        }
      }
    } catch (error) {
      console.error("WS MESSAGE ERROR:", error);
    }
  });

  ws.on("error", (error) => console.error("WebSocket client error:", error));

  ws.on("close", (code, reason) => {
    espClients.delete(ws);
    browserClients.delete(ws);
    console.log("WebSocket closed. Code:", code, "Reason:", reason?.toString() || "", "ESP count:", espClients.size, "Browser count:", browserClients.size);
  });
});

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }
}, 30000);

wss.on("close", () => clearInterval(heartbeatInterval));

export default server;
