import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const server = http.createServer((req, res) => {
  if (req.url === "/api/ws" || req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8"
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
  perMessageDeflate: false
});

const espClients = new Set();
const browserClients = new Set();

wss.on("connection", (ws, req) => {
  console.log("WebSocket connected:", req.url);

  ws.isAlive = true;
  ws.role = null;

  // ---------------------------------------------------
  // Initial connection message
  // ---------------------------------------------------

  ws.send(
    JSON.stringify({
      type: "hello",
      message: "NEXUS RACCOON relay connected"
    })
  );

  // ---------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // ---------------------------------------------------
  // Incoming messages
  // ---------------------------------------------------

  ws.on("message", (message) => {
    try {
      const text = message.toString();

      console.log("WS MESSAGE:", text);

      const data = JSON.parse(text);

      // -------------------------------------------------
      // ESP8266 registration
      // -------------------------------------------------

      if (data.type === "register_esp") {
        ws.role = "esp";

        espClients.add(ws);

        ws.send(
          JSON.stringify({
            type: "registered",
            role: "esp"
          })
        );

        console.log(
          "ESP registered. ESP count:",
          espClients.size
        );

        return;
      }

      // -------------------------------------------------
      // Browser registration
      // -------------------------------------------------

      if (data.type === "register_browser") {
        ws.role = "browser";

        browserClients.add(ws);

        ws.send(
          JSON.stringify({
            type: "registered",
            role: "browser"
          })
        );

        console.log(
          "Browser registered. Browser count:",
          browserClients.size
        );

        // Ask ESP for current controller state
        for (const esp of espClients) {
          if (esp.readyState === WebSocket.OPEN) {
            esp.send(
              JSON.stringify({
                type: "controller_request"
              })
            );
          }
        }

        return;
      }

      // -------------------------------------------------
      // ESP controller data
      // -------------------------------------------------

      if (data.type === "controller") {
        console.log(
          "CONTROLLER DATA:",
          JSON.stringify(data)
        );

        for (const browser of browserClients) {
          if (browser.readyState === WebSocket.OPEN) {
            browser.send(
              JSON.stringify(data)
            );
          }
        }

        return;
      }

      // -------------------------------------------------
      // Browser asks for controller
      // -------------------------------------------------

      if (data.type === "controller_request") {
        for (const esp of espClients) {
          if (esp.readyState === WebSocket.OPEN) {
            esp.send(
              JSON.stringify({
                type: "controller_request"
              })
            );
          }
        }

        return;
      }

      // -------------------------------------------------
      // Generic relay
      // -------------------------------------------------

      if (data.type === "broadcast") {
        for (const client of wss.clients) {
          if (
            client !== ws &&
            client.readyState === WebSocket.OPEN
          ) {
            client.send(
              JSON.stringify(data.data ?? data)
            );
          }
        }

        return;
      }

    } catch (error) {
      console.error(
        "WS MESSAGE ERROR:",
        error
      );

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid JSON message"
          })
        );
      }
    }
  });

  // ---------------------------------------------------
  // Error logging
  // ---------------------------------------------------

  ws.on("error", (error) => {
    console.error(
      "WebSocket client error:",
      error
    );
  });

  // ---------------------------------------------------
  // Connection closed
  // ---------------------------------------------------

  ws.on("close", (code, reason) => {
    const reasonText =
      reason
        ? reason.toString()
        : "";

    console.log(
      "WebSocket closed.",
      "Code:",
      code,
      "Reason:",
      reasonText
    );

    espClients.delete(ws);
    browserClients.delete(ws);

    console.log(
      "ESP count:",
      espClients.size
    );

    console.log(
      "Browser count:",
      browserClients.size
    );
  });
});

// -----------------------------------------------------
// Server errors
// -----------------------------------------------------

wss.on("error", (error) => {
  console.error(
    "WebSocketServer error:",
    error
  );
});

// -----------------------------------------------------
// Heartbeat checker
// -----------------------------------------------------

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {

    if (ws.isAlive === false) {
      console.log(
        "Terminating dead WebSocket"
      );

      ws.terminate();

      continue;
    }

    ws.isAlive = false;

    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }
}, 30000);

// -----------------------------------------------------
// Cleanup
// -----------------------------------------------------

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

// -----------------------------------------------------
// Vercel / Node server
// -----------------------------------------------------

export default server;
