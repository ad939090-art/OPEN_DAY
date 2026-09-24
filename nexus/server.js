import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 10000);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  console.log("HTTP:", req.method, url.pathname);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const file = path.join(__dirname, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) {
        console.error("index.html error:", err);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("NEXUS RACCOON: index.html could not be loaded");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  if (url.pathname === "/api/ws" || url.pathname === "/ws") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("NEXUS RACCOON WebSocket relay");
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, service: "NEXUS RACCOON relay" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

// IMPORTANT: use an explicit upgrade handler so Render's WebSocket upgrade
// is accepted directly and /api/ws routing cannot be ambiguous.
const wss = new WebSocketServer({
  noServer: true,
  clientTracking: true,
  perMessageDeflate: false
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  console.log("WS UPGRADE RECEIVED:", req.url);
  console.log("WS UPGRADE HEADERS:", JSON.stringify(req.headers));

  if (url.pathname !== "/api/ws" && url.pathname !== "/ws") {
    console.log("WS UPGRADE REJECTED: bad path", url.pathname);
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    console.log("WS HANDSHAKE ACCEPTED:", url.pathname);
    wss.emit("connection", ws, req);
  });
});

const espClients = new Set();
const browserClients = new Set();

function sendJSON(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws, req) => {
  console.log("WebSocket CONNECTED:", req.url);

  ws.isAlive = true;
  ws.role = null;

  sendJSON(ws, {
    type: "hello",
    message: "NEXUS RACCOON relay connected"
  });

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    const text = raw.toString();
    console.log("WS MESSAGE:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Invalid JSON:", text);
      sendJSON(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (data.type === "register_esp") {
      ws.role = "esp";
      espClients.add(ws);
      sendJSON(ws, { type: "registered", role: "esp" });
      console.log("ESP registered. ESP count:", espClients.size);
      return;
    }

    if (data.type === "register_browser") {
      ws.role = "browser";
      browserClients.add(ws);
      sendJSON(ws, { type: "registered", role: "browser" });
      console.log("Browser registered. Browser count:", browserClients.size);

      for (const esp of espClients) {
        sendJSON(esp, { type: "controller_request" });
      }
      return;
    }

    if (data.type === "controller") {
      for (const browser of browserClients) {
        sendJSON(browser, data);
      }
      return;
    }

    if (data.type === "controller_request") {
      for (const esp of espClients) {
        sendJSON(esp, { type: "controller_request" });
      }
      return;
    }

    if (data.type === "broadcast") {
      for (const client of wss.clients) {
        if (client !== ws) sendJSON(client, data.data ?? data);
      }
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket ERROR:", err);
  });

  ws.on("close", (code, reason) => {
    espClients.delete(ws);
    browserClients.delete(ws);
    console.log(
      "WebSocket CLOSED. Code:",
      code,
      "Reason:",
      reason?.toString() || "",
      "ESP:",
      espClients.size,
      "Browser:",
      browserClients.size
    );
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      console.log("Terminating dead WebSocket");
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXUS RACCOON server listening on port ${PORT}`);
});
