NEXUS RACCOON - RENDER READY

IMPORTANT: The contents of THIS folder must be at the ROOT of the GitHub repository.
Do not put this folder inside another folder in the repository.

Files:
- index.html
- server.js
- package.json

Render settings:
- Root Directory: leave EMPTY
- Build Command: npm install
- Start Command: npm start
- Environment Variables: none

WebSocket endpoint:
https://YOUR-RENDER-SERVICE.onrender.com/api/ws

ESP8266 settings:
relayHost = "YOUR-RENDER-SERVICE.onrender.com"
relayPort = 443
relayPath = "/api/ws"

Do not change the rest of the ESP8266 sketch.


CONTROLLER FIX: Browser now uses /api/ws WebSocket relay for ESP controller input.
