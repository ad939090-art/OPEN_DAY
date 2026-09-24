const { createServer } = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const server = createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });

  res.end("NEXUS RACCOON WebSocket relay");
});

const wss = new WebSocketServer({ server });

let esp8266 = null;
const websites = new Set();

function sendJSON(socket, data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

wss.on("connection", (socket) => {
  socket.role = "unknown";

  sendJSON(socket, {
    type: "hello",
    message: "NEXUS RACCOON relay connected",
  });

  socket.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ESP8266 registers itself with the relay
    if (msg.type === "register_esp") {
      if (esp8266 && esp8266 !== socket) {
        try {
          esp8266.close();
        } catch {}
      }

      esp8266 = socket;
      socket.role = "esp";

      sendJSON(socket, {
        type: "registered",
        role: "esp",
      });

      // Tell all connected websites that ESP8266 is online
      for (const website of websites) {
        sendJSON(website, {
          type: "controller_status",
          connected: true,
        });
      }

      return;
    }

    // Website asks the ESP8266 for controller data
    if (msg.type === "controller_request") {
      websites.add(socket);

      if (
        esp8266 &&
        esp8266.readyState === WebSocket.OPEN
      ) {
        sendJSON(esp8266, {
          type: "controller_request",
        });
      } else {
        sendJSON(socket, {
          type: "controller_status",
          connected: false,
        });
      }

      return;
    }

    // ESP8266 sends controller data to the website
    if (
      msg.type === "controller" &&
      socket === esp8266
    ) {
      for (const website of websites) {
        sendJSON(website, {
          type: "controller",
          data: msg.data || {},
        });
      }
    }
  });

  socket.on("close", () => {
    websites.delete(socket);

    if (socket === esp8266) {
      esp8266 = null;

      for (const website of websites) {
        sendJSON(website, {
          type: "controller_status",
          connected: false,
        });
      }
    }
  });

  socket.on("error", () => {
    websites.delete(socket);

    if (socket === esp8266) {
      esp8266 = null;
    }
  });
});

export default server;
