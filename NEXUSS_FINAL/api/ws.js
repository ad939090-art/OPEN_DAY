const { createServer } = require("http");
const { WebSocketServer } = require("ws");

const server = createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.end("NEXUS RACCOON WebSocket server is running.");
});

const wss = new WebSocketServer({ server });

let esp8266 = null;
const websites = new Set();

function sendJSON(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws) => {
  let role = "unknown";

  console.log("WebSocket connected");

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      console.log("Invalid JSON received");
      return;
    }

    // ESP8266 identifies itself
    if (msg.type === "register_esp") {
      role = "esp";
      esp8266 = ws;

      console.log("ESP8266 registered");

      sendJSON(ws, {
        type: "relay_status",
        connected: true
      });

      // Tell all websites that the controller is online
      for (const client of websites) {
        sendJSON(client, {
          type: "controller_status",
          connected: true
        });
      }

      return;
    }

    // Website identifies itself
    if (msg.type === "controller_request") {
      role = "website";
      websites.add(ws);

      // Ask ESP8266 for the latest controller state
      if (esp8266) {
        sendJSON(esp8266, {
          type: "controller_request"
        });
      } else {
        sendJSON(ws, {
          type: "controller_status",
          connected: false
        });
      }

      return;
    }

    // ESP8266 sends controller data
    if (msg.type === "controller" && role === "esp") {
      for (const client of websites) {
        sendJSON(client, msg);
      }

      return;
    }

    // Optional ping/pong
    if (msg.type === "ping") {
      sendJSON(ws, {
        type: "pong"
      });
    }
  });

  ws.on("close", () => {
    console.log("WebSocket disconnected");

    if (role === "esp") {
      if (esp8266 === ws) {
        esp8266 = null;
      }

      for (const client of websites) {
        sendJSON(client, {
          type: "controller_status",
          connected: false
        });
      }
    }

    if (role === "website") {
      websites.delete(ws);
    }
  });

  ws.on("error", (err) => {
    console.log("WebSocket error:", err.message);
  });
});

module.exports = server;
