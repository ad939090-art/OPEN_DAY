const http = require("http");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

// The complete NEXUS RACCOON game is embedded below.
const GAME_PAGE = "\n<!DOCTYPE html>\n<html>\n\n<head>\n\n<meta name=\"viewport\"\n      content=\"width=device-width,initial-scale=1.0\">\n\n<title>NEXUS RACCOON</title>\n\n<style>\n\n*{\nbox-sizing:border-box;\n}\n\nhtml,body{\nmargin:0;\npadding:0;\nwidth:100%;\nheight:100%;\nbackground:#080b16;\ncolor:white;\nfont-family:monospace;\noverflow:hidden;\n}\n\nbody{\ndisplay:flex;\nalign-items:center;\njustify-content:center;\n}\n\n#container{\nwidth:96vw;\nmax-width:900px;\ntext-align:center;\n}\n\n#hud{\ndisplay:flex;\njustify-content:space-between;\nalign-items:center;\nflex-wrap:wrap;\ngap:6px;\npadding:8px;\nbackground:#151a2d;\nborder:3px solid #39456d;\nborder-radius:10px;\nfont-size:13px;\nfont-weight:bold;\n}\n\n#hud div{\nwhite-space:nowrap;\n}\n\n#hud span{\ncolor:#ffe45c;\n}\n\ncanvas{\ndisplay:block;\nwidth:100%;\nheight:auto;\nmargin-top:8px;\nborder:5px solid #39456d;\nborder-radius:10px;\nbackground:#111827;\nimage-rendering:pixelated;\nbox-shadow:0 0 25px #000;\n}\n\n#controls{\nmargin-top:6px;\nfont-size:11px;\ncolor:#bfc7e8;\nline-height:1.5;\n}\n\n#message{\nposition:fixed;\nleft:50%;\ntop:50%;\ntransform:translate(-50%,-50%);\nbackground:#101522;\nborder:4px solid #ffe45c;\nborder-radius:12px;\npadding:22px;\nmin-width:300px;\ndisplay:none;\nz-index:10;\nfont-size:17px;\nline-height:1.6;\nbox-shadow:0 0 30px #000;\ntext-align:left;\n}\n\n.messageTitle{\nfont-size:20px;\nfont-weight:bold;\ncolor:#ffe45c;\ntext-align:center;\nmargin-bottom:15px;\n}\n\n.messageText{\ntext-align:left;\n}\n\n</style>\n\n</head>\n\n<body>\n\n<div id=\"container\">\n\n<div id=\"hud\">\n<div>NEXUS</div>\n\n<div>\nSCORE:\n<span id=\"score\">0</span>\n</div>\n\n<div>\nBEST:\n<span id=\"high\">0</span>\n</div>\n\n<div>\nCOINS:\n<span id=\"coins\">0</span>\n</div>\n\n<div>\nDIST:\n<span id=\"distance\">0</span>\n</div>\n\n<div>\nLIVES:\n<span id=\"lives\">3</span>\n</div>\n\n<div>\nPIZZAS:\n<span id=\"pizza\">0</span>\n</div>\n\n<div id=\"status\">\nREADY\n</div>\n\n</div>\n\n<canvas\nid=\"game\"\nwidth=\"480\"\nheight=\"270\">\n</canvas>\n\n<div id=\"controls\">\nJOYSTICK LEFT / RIGHT\n&nbsp; | &nbsp;\nCENTER = HOME / MODE\n&nbsp; | &nbsp;\nD3 = JUMP\n&nbsp; | &nbsp;\nD4 = FLY &nbsp; | &nbsp; D5 = RESET &nbsp; | &nbsp; D6 = PAUSE\n</div>\n\n</div>\n\n<div id=\"message\"></div>\n\n<script>\n\nconst canvas = document.getElementById(\"game\");\nconst ctx = canvas.getContext(\"2d\");\nctx.imageSmoothingEnabled = false;\n\nlet input = {\n  direction:\"CENTER\",\n  jump:false,\n  fly:false,\n  reset:false,\n  pause:false,\n  center:false\n};\n\nlet previous = {\n  jump:false,\n  fly:false,\n  reset:false,\n  pause:false,\n  center:false\n};\n\nlet state = \"START\";\nlet gameMode = \"EASY\";\nconst EASY_SPEED = 1.60;\nconst HARD_SPEED = 1.80;\nlet score = 0;\nlet lives = 3;\nlet pizzaCount = 0;\nlet pizzasCollectedTotal = 0;\nlet coinsCollected = 0;\nlet distanceScore = 0;\nlet highScore = Number(localStorage.getItem(\"nexusHighScore\") || 0);\nlet leaderboard = JSON.parse(localStorage.getItem(\"nexusLeaderboard\") || \"[]\");\nlet cameraX = 0;\nlet flightUnlocked = false;\nlet flying = false;\nlet flightTime = 0;\nlet laserTime = 0;\nlet lasers = [];\nlet boss = {\n  x:5400,\n  y:150,\n  width:58,\n  height:65,\n  hp:8,\n  maxHp:8,\n  active:false,\n  defeated:false,\n  vx:0.7,\n  dir:1\n};\nlet gameDistance = 0;\nlet lastShot = 0;\nlet bossLasers = [];\nlet lastBossShot = 0;\n\nlet audioContext = null;\n\nfunction beep(frequency = 600,duration = 0.08){\n  try{\n    audioContext = audioContext || new(window.AudioContext || window.webkitAudioContext)();\n    let oscillator = audioContext.createOscillator();\n    let gain = audioContext.createGain();\n    oscillator.type = \"square\";\n    oscillator.frequency.value = frequency;\n    gain.gain.value = 0.035;\n    oscillator.connect(gain);\n    gain.connect(audioContext.destination);\n    oscillator.start();\n    gain.gain.exponentialRampToValueAtTime(\n      0.001,\n      audioContext.currentTime + duration\n    );\n    oscillator.stop(audioContext.currentTime + duration);\n  }\n  catch(e){}\n}\n\nasync function readController(){\n  try{\n    let response = await fetch(\n      \"/controller?time=\" + Date.now(),\n      {cache:\"no-store\"}\n    );\n    input = await response.json();\n  }\n  catch(error){\n    // ESP8266 temporarily unavailable.\n  }\n}\n\nsetInterval(readController,70);\n\nfunction pressed(button){\n  return input[button] === true && previous[button] !== true;\n}\n\nfunction showMessage(title,text){\n  let message = document.getElementById(\"message\");\n  message.innerHTML =\n    \"<div class='messageTitle'>\" + title + \"</div>\" +\n    \"<div class='messageText'>\" + text + \"</div>\";\n  message.style.display = \"block\";\n}\n\nfunction hideMessage(){\n  document.getElementById(\"message\").style.display = \"none\";\n}\n\nlet player = {\n  x:45,\n  y:100,\n  width:22,\n  height:30,\n  vx:0,\n  vy:0,\n  onGround:false\n};\n\nconst platforms = [\n{x:0,y:235,w:260,h:35},\n{x:290,y:215,w:170,h:55},\n{x:500,y:190,w:150,h:80},\n{x:690,y:220,w:170,h:50},\n{x:900,y:180,w:150,h:90},\n{x:1090,y:215,w:170,h:55},\n{x:1300,y:185,w:180,h:85},\n{x:1510,y:220,w:160,h:50},\n{x:1710,y:175,w:190,h:95},\n{x:1940,y:210,w:170,h:60},\n{x:2150,y:180,w:180,h:90},\n{x:2380,y:220,w:180,h:50},\n{x:2600,y:175,w:180,h:95},\n{x:2830,y:205,w:170,h:65},\n{x:3040,y:160,w:200,h:110},\n{x:3290,y:215,w:180,h:55},\n{x:3520,y:180,w:190,h:90},\n{x:3760,y:220,w:180,h:50},\n{x:3990,y:165,w:200,h:105},\n{x:4240,y:210,w:180,h:60},\n{x:4470,y:180,w:190,h:90},\n{x:4710,y:220,w:190,h:50},\n{x:4950,y:175,w:220,h:95},\n{x:5220,y:205,w:240,h:65},\n{x:5520,y:190,w:220,h:80},\n{x:5800,y:220,w:300,h:50}\n];\n\nlet coins = [];\nfor(let i=0;i<115;i++){\n  coins.push({\n    x:80+i*50,\n    y:125-(i%5)*14,\n    collected:false\n  });\n}\n\nlet pizzas = [\n{x:360,y:175,collected:false},\n{x:1020,y:145,collected:false},\n{x:1560,y:175,collected:false},\n{x:2220,y:145,collected:false},\n{x:2860,y:170,collected:false},\n{x:3500,y:145,collected:false},\n{x:4140,y:150,collected:false},\n{x:4750,y:175,collected:false},\n{x:5150,y:155,collected:false},\n{x:5650,y:150,collected:false}\n];\n\nlet enemies = [\n{x:620,y:165,width:18,height:25,vx:0.55,min:540,max:790,dir:1},\n{x:1160,y:185,width:18,height:25,vx:0.48,min:1110,max:1260,dir:1},\n{x:1760,y:145,width:18,height:25,vx:0.52,min:1690,max:1870,dir:1},\n{x:2360,y:190,width:18,height:25,vx:0.50,min:2290,max:2500,dir:-1},\n{x:3000,y:135,width:18,height:25,vx:0.58,min:2930,max:3200,dir:1},\n{x:3650,y:155,width:18,height:25,vx:0.55,min:3570,max:3740,dir:-1},\n{x:4300,y:185,width:18,height:25,vx:0.50,min:4230,max:4400,dir:1},\n{x:4870,y:150,width:18,height:25,vx:0.58,min:4760,max:5050,dir:-1}\n];\n\nfunction collision(a,b){\n  return(\n    a.x < b.x + b.width &&\n    a.x + a.width > b.x &&\n    a.y < b.y + b.height &&\n    a.y + a.height > b.y\n  );\n}\n\nfunction saveRun(){\n  const entry={\n    score:score,\n    coins:coinsCollected,\n    distance:Math.floor(gameDistance)\n  };\n  leaderboard.push(entry);\n  leaderboard.sort((a,b)=>b.score-a.score);\n  leaderboard=leaderboard.slice(0,5);\n  localStorage.setItem(\n    \"nexusLeaderboard\",\n    JSON.stringify(leaderboard)\n  );\n  if(score>highScore){\n    highScore=score;\n    localStorage.setItem(\"nexusHighScore\",highScore);\n  }\n}\n\nfunction leaderboardHTML(){\n  let h=\"<br><b>LEADERBOARD</b><br>\";\n  if(!leaderboard.length) return h+\"No runs yet\";\n  leaderboard.forEach((r,i)=>{\n    h+=(i+1)+\". \"+r.score+\" pts | \"+r.coins+\" coins | \"+r.distance+\"m<br>\";\n  });\n  return h;\n}\n\nfunction resetGame(){\n  state=\"PLAYING\";\n  score=0;\n  lives=3;\n  pizzaCount=0;\n  pizzasCollectedTotal=0;\n  coinsCollected=0;\n  distanceScore=0;\n  flightUnlocked=false;\n  flying=false;\n  flightTime=0;\n  laserTime=0;\n  lasers=[];\n  bossLasers=[];\n  cameraX=0;\n  gameDistance=0;\n  lastShot=0;\n  lastBossShot=0;\n\n  player.x=45;\n  player.y=100;\n  player.vx=0;\n  player.vy=0;\n  player.onGround=false;\n\n  coins.forEach(c=>c.collected=false);\n  pizzas.forEach(p=>p.collected=false);\n\n  enemies=[\n    {x:620,y:165,width:18,height:25,vx:0.55,min:540,max:790,dir:1},\n    {x:1160,y:185,width:18,height:25,vx:0.48,min:1110,max:1260,dir:1},\n    {x:1760,y:145,width:18,height:25,vx:0.52,min:1690,max:1870,dir:1},\n    {x:2360,y:190,width:18,height:25,vx:0.50,min:2290,max:2500,dir:-1},\n    {x:3000,y:135,width:18,height:25,vx:0.58,min:2930,max:3200,dir:1},\n    {x:3650,y:155,width:18,height:25,vx:0.55,min:3570,max:3740,dir:-1},\n    {x:4300,y:185,width:18,height:25,vx:0.50,min:4230,max:4400,dir:1},\n    {x:4870,y:150,width:18,height:25,vx:0.58,min:4760,max:5050,dir:-1}\n  ];\n\n  if(gameMode === \"HARD\"){\n    enemies.push(\n      {x:850,y:185,width:18,height:25,vx:0.52,min:810,max:900,dir:1},\n      {x:2050,y:180,width:18,height:25,vx:0.54,min:1980,max:2110,dir:-1},\n      {x:3970,y:135,width:18,height:25,vx:0.56,min:3890,max:4070,dir:1}\n    );\n  }\n\n  boss={\n    x:5400,\n    y:140,\n    width:58,\n    height:65,\n    hp:gameMode===\"HARD\"?10:5,\n    maxHp:gameMode===\"HARD\"?10:5,\n    active:false,\n    defeated:false,\n    vx:gameMode===\"HARD\"?0.55:0.45,\n    dir:1\n  };\n\n  hideMessage();\n  beep(700,0.1);\n  updateHUD();\n}\n\nfunction gameOver(){\n  saveRun();\n  state=\"GAMEOVER\";\n  updateHUD();\n  showMessage(\n    \"GAME OVER\",\n    \"SCORE: \"+score+\"<br>COINS: \"+coinsCollected+\n    \"<br>DISTANCE: \"+Math.floor(gameDistance)+\"m\"+\n    leaderboardHTML()+\n    \"<br><br>PRESS D5 TO RESET\"\n  );\n}\n\nfunction victory(){\n  if(state!==\"PLAYING\") return;\n  state=\"VICTORY\";\n  saveRun();\n  beep(1200,0.25);\n  showMessage(\n    \"BOSS DEFEATED\",\n    \"FINAL SCORE: \"+score+\n    \"<br>COINS: \"+coinsCollected+\n    \"<br>DISTANCE: \"+Math.floor(gameDistance)+\"m\"+\n    leaderboardHTML()+\n    \"<br><br>PRESS D5 TO RESET\"\n  );\n}\n\nfunction hitPlayer(){\n  if(flying) return;\n  lives--;\n  beep(150,0.15);\n  if(lives<=0){\n    gameOver();\n    return;\n  }\n  player.x=Math.max(45,player.x-150);\n  player.y=100;\n  player.vx=0;\n  player.vy=0;\n  updateHUD();\n}\n\nfunction shootLaser(){\n  if(state!==\"PLAYING\" || laserTime<=0) return;\n  const now=performance.now();\n  if(now-lastShot<260) return;\n  lastShot=now;\n  lasers.push({\n    x:player.x+player.width,\n    y:player.y+12,\n    width:90,\n    height:4,\n    w:90,\n    h:4,\n    life:18\n  });\n  beep(1050,0.04);\n}\n\nfunction update(){\n\n  if(pressed(\"reset\")){\n    resetGame();\n    previous=Object.assign({},input);\n    return;\n  }\n\n  if(pressed(\"center\")){\n    if(state !== \"START\"){\n      state=\"START\";\n      hideMessage();\n      player.x=45;\n      player.y=100;\n      player.vx=0;\n      player.vy=0;\n      flying=false;\n      laserTime=0;\n      lasers=[];\n      bossLasers=[];\n      lastBossShot=0;\n      updateHUD();\n    }\n    previous=Object.assign({},input);\n    return;\n  }\n\n  if(state === \"START\"){\n    if(pressed(\"jump\")){\n      gameMode = gameMode === \"EASY\" ? \"HARD\" : \"EASY\";\n      beep(gameMode === \"HARD\" ? 850 : 500,0.08);\n      updateHUD();\n    }\n    previous=Object.assign({},input);\n    return;\n  }\n\n  if(pressed(\"pause\")){\n    if(state===\"PLAYING\"){\n      state=\"PAUSED\";\n      showMessage(\"GAME PAUSED\",\"D6 PAUSE / RESUME\");\n    }\n    else if(state===\"PAUSED\"){\n      state=\"PLAYING\";\n      hideMessage();\n    }\n    previous=Object.assign({},input);\n    return;\n  }\n\n  if(state!==\"PLAYING\"){\n    previous=Object.assign({},input);\n    return;\n  }\n\n  if(input.direction===\"LEFT\")\n    player.vx=gameMode===\"HARD\"?-HARD_SPEED:-EASY_SPEED;\n  else if(input.direction===\"RIGHT\")\n    player.vx=gameMode===\"HARD\"?HARD_SPEED:EASY_SPEED;\n  else\n    player.vx*=0.78;\n\n  if(pressed(\"fly\")){\n    if(laserTime>0){\n      shootLaser();\n    }\n    else if(flightUnlocked && !flying){\n      flying=true;\n      flightTime=720;\n      beep(850,0.1);\n    }\n  }\n\n  if(flying){\n    flightTime-=16;\n    player.vy=-0.20;\n    if(input.direction===\"RIGHT\")\n      player.vx=gameMode===\"HARD\"?3.00:2.10;\n    else if(input.direction===\"LEFT\")\n      player.vx=gameMode===\"HARD\"?-3.00:-2.10;\n\n    if(flightTime<=0){\n      flying=false;\n      flightTime=0;\n      beep(250,0.1);\n    }\n  }\n  else player.vy+=0.42;\n\n  if(pressed(\"jump\") && player.onGround && !flying){\n    player.vy=-7.4;\n    beep(500,0.08);\n  }\n\n  player.x+=player.vx;\n  player.y+=player.vy;\n\n  if(player.x<0) player.x=0;\n\n  player.onGround=false;\n\n  if(!flying){\n    for(const platform of platforms){\n      if(\n        player.x<platform.x+platform.w &&\n        player.x+player.width>platform.x &&\n        player.y+player.height>=platform.y &&\n        player.y+player.height<=platform.y+18 &&\n        player.vy>=0\n      ){\n        player.y=platform.y-player.height;\n        player.vy=0;\n        player.onGround=true;\n      }\n    }\n  }\n\n  for(const coin of coins){\n    if(\n      !coin.collected &&\n      collision(player,{x:coin.x,y:coin.y,width:12,height:12})\n    ){\n      coin.collected=true;\n      coinsCollected++;\n      score+=25;\n      beep(900,0.035);\n    }\n  }\n\n  for(const pizza of pizzas){\n    if(\n      !pizza.collected &&\n      collision(player,{x:pizza.x,y:pizza.y,width:16,height:14})\n    ){\n      pizza.collected=true;\n      pizzaCount++;\n      pizzasCollectedTotal++;\n      score+=150;\n      beep(1100,0.08);\n\n      if(pizzasCollectedTotal>=4)\n        flightUnlocked=true;\n\n      if(pizzaCount>=2){\n        pizzaCount-=2;\n        laserTime=600;\n        score+=25;\n        beep(1350,0.12);\n        showMessage(\n          \"LASER READY\",\n          \"10 SEC - PRESS D4 TO FIRE\"\n        );\n        setTimeout(()=>{\n          if(state===\"PLAYING\") hideMessage();\n        },900);\n      }\n    }\n  }\n\n  if(laserTime>0) laserTime-=1;\n\n  for(const l of lasers){\n    l.x+=6;\n    l.life--;\n  }\n\n  lasers=lasers.filter(l=>l.life>0);\n\n  for(const enemy of enemies){\n    enemy.x += enemy.vx*enemy.dir*(gameMode === \"HARD\" ? 1.15 : 1);\n\n    if(enemy.x<enemy.min){\n      enemy.x=enemy.min;\n      enemy.dir=1;\n    }\n\n    if(enemy.x>enemy.max){\n      enemy.x=enemy.max;\n      enemy.dir=-1;\n    }\n\n    if(\n      collision(\n        player,\n        {\n          x:enemy.x,\n          y:enemy.y,\n          width:enemy.width,\n          height:enemy.height\n        }\n      ) && !flying\n    ) hitPlayer();\n\n    for(const l of lasers){\n      if(\n        collision(\n          l,\n          {\n            x:enemy.x,\n            y:enemy.y,\n            width:enemy.width,\n            height:enemy.height\n          }\n        )\n      ){\n        enemy.dead=true;\n        l.life=0;\n        score+=10;\n        beep(700,0.06);\n      }\n    }\n  }\n\n  enemies=enemies.filter(e=>!e.dead);\n\n  if(player.x>5200) boss.active=true;\n\n  if(boss.active&&!boss.defeated){\n    boss.y=145+Math.sin(performance.now()/350)*35;\n    boss.x+=boss.vx*boss.dir;\n\n    if(boss.x<5310||boss.x>5550)\n      boss.dir*=-1;\n\n    for(const l of lasers){\n      if(\n        collision(\n          l,\n          {\n            x:boss.x,\n            y:boss.y,\n            width:boss.width,\n            height:boss.height\n          }\n        )\n      ){\n        l.life=0;\n        boss.hp--;\n        score+=5;\n        beep(780,0.05);\n      }\n    }\n\n    const now=performance.now();\n\n    if(now-lastBossShot>=1800){\n      lastBossShot=now;\n      bossLasers.push({\n        x:boss.x-70,\n        y:boss.y+30,\n        w:70,\n        h:4,\n        vx:-2.0,\n        life:180\n      });\n    }\n\n    for(const bl of bossLasers){\n      bl.x+=bl.vx;\n      bl.life--;\n\n      if(\n        collision(\n          player,\n          {\n            x:bl.x,\n            y:bl.y,\n            width:bl.w,\n            height:bl.h\n          }\n        )\n      ){\n        bl.life=0;\n        hitPlayer();\n      }\n    }\n\n    bossLasers=bossLasers.filter(bl=>bl.life>0);\n\n    if(boss.hp<=0){\n      boss.defeated=true;\n      bossLasers=[];\n      score+=100;\n      victory();\n    }\n\n    if(\n      collision(\n        player,\n        {\n          x:boss.x,\n          y:boss.y,\n          width:boss.width,\n          height:boss.height\n        }\n      ) && !flying\n    ) hitPlayer();\n  }\n\n  if(player.y>330) hitPlayer();\n\n  gameDistance=Math.max(gameDistance,player.x);\n  distanceScore=Math.floor(gameDistance/10);\n\n  score=Math.max(\n    score,\n    coinsCollected*25+\n    distanceScore+\n    pizzasCollectedTotal*150+\n    (boss.defeated?100:0)\n  );\n\n  cameraX=Math.max(0,player.x-110);\n\n  previous=Object.assign({},input);\n  updateHUD();\n}\n\nfunction updateHUD(){\n  document.getElementById(\"score\").textContent=score;\n  document.getElementById(\"high\").textContent=highScore;\n  document.getElementById(\"coins\").textContent=coinsCollected;\n  document.getElementById(\"distance\").textContent=Math.floor(gameDistance);\n  document.getElementById(\"lives\").textContent=lives;\n  document.getElementById(\"pizza\").textContent=pizzaCount;\n\n  if(state===\"PLAYING\")\n    document.getElementById(\"status\").textContent=\n      laserTime>0\n        ?\"LASER \"+Math.ceil(laserTime/60)+\"s\"\n        :(boss.active?\"BOSS\":\"PLAYING\");\n  else if(state===\"START\")\n    document.getElementById(\"status\").textContent=\"MODE \"+gameMode;\n  else\n    document.getElementById(\"status\").textContent=state;\n}\n\nfunction drawBackground(){\n\n  let environment=Math.floor(player.x/500);\n\n  if(environment===0){\n    ctx.fillStyle=\"#65c9ff\";\n    ctx.fillRect(0,0,480,270);\n\n    ctx.fillStyle=\"#ffe76a\";\n    ctx.fillRect(390,25,40,40);\n  }\n\n  else if(environment===1){\n    ctx.fillStyle=\"#6bc5ff\";\n    ctx.fillRect(0,0,480,270);\n\n    ctx.fillStyle=\"#ffffff\";\n    ctx.fillRect(60,45,80,20);\n    ctx.fillRect(85,35,35,30);\n\n    ctx.fillRect(310,70,90,20);\n    ctx.fillRect(335,55,40,35);\n  }\n\n  else if(environment===2){\n    ctx.fillStyle=\"#f08a68\";\n    ctx.fillRect(0,0,480,270);\n\n    ctx.fillStyle=\"#ffd166\";\n    ctx.fillRect(375,30,35,35);\n  }\n\n  else if(environment===3){\n    ctx.fillStyle=\"#18243a\";\n    ctx.fillRect(0,0,480,270);\n\n    ctx.fillStyle=\"#506080\";\n    for(let i=0;i<7;i++){\n      ctx.fillRect(i*90,100+(i%2)*20,60,120);\n    }\n  }\n\n  else if(environment>=4){\n    ctx.fillStyle=\"#0b1020\";\n    ctx.fillRect(0,0,480,270);\n\n    ctx.fillStyle=\"#24324d\";\n    for(let i=0;i<10;i++){\n      ctx.fillRect(i*60,50+(i%4)*25,35,3);\n    }\n\n    ctx.fillStyle=\"#ffe66d\";\n    for(let i=0;i<18;i++){\n      ctx.fillRect(\n        (i*83-cameraX*0.15)%480,\n        20+(i*37)%110,\n        2,\n        2\n      );\n    }\n  }\n}\n\nfunction drawPlatforms(){\n  for(const platform of platforms){\n    let x=platform.x-cameraX;\n    if(x+platform.w<0 || x>480) continue;\n\n    ctx.fillStyle=\"#34415e\";\n    ctx.fillRect(\n      x,\n      platform.y,\n      platform.w,\n      platform.h\n    );\n\n    ctx.fillStyle=\"#6f8ab5\";\n    ctx.fillRect(\n      x,\n      platform.y,\n      platform.w,\n      6\n    );\n  }\n}\n\nfunction drawCoins(){\n  for(const coin of coins){\n    if(!coin.collected){\n      let x=coin.x-cameraX;\n\n      ctx.fillStyle=\"#ffd83d\";\n      ctx.fillRect(x,coin.y,12,12);\n\n      ctx.fillStyle=\"#fff5a3\";\n      ctx.fillRect(x+3,coin.y+2,3,6);\n    }\n  }\n}\n\nfunction drawPizzas(){\n  for(const pizza of pizzas){\n    if(!pizza.collected){\n      let x=pizza.x-cameraX;\n\n      ctx.fillStyle=\"#d99032\";\n      ctx.fillRect(x,pizza.y,16,12);\n\n      ctx.fillStyle=\"#ffe66d\";\n      ctx.fillRect(x+2,pizza.y+2,12,8);\n\n      ctx.fillStyle=\"#e5483e\";\n      ctx.fillRect(x+5,pizza.y+3,3,3);\n    }\n  }\n}\n\nfunction drawEnemies(){\n  for(const enemy of enemies){\n    if(enemy.dead) continue;\n\n    let x=enemy.x-cameraX;\n\n    ctx.fillStyle=\"#9b3aa3\";\n    ctx.fillRect(x,enemy.y,18,25);\n\n    ctx.fillStyle=\"#ffe66d\";\n    ctx.fillRect(x+3,enemy.y+5,4,4);\n    ctx.fillRect(x+11,enemy.y+5,4,4);\n  }\n}\n\nfunction drawCombat(){\n  for(const l of lasers){\n    const x=l.x-cameraX;\n    ctx.fillStyle=\"#ff4040\";\n    ctx.fillRect(x,l.y,Math.min(l.width,55),4);\n    ctx.fillStyle=\"#ffffff\";\n    ctx.fillRect(x,l.y+1,Math.min(l.width,48),2);\n  }\n\n  for(const bl of bossLasers){\n    const x=bl.x-cameraX;\n    ctx.fillStyle=\"#ff9f1c\";\n    ctx.fillRect(x,bl.y,bl.w,bl.h);\n    ctx.fillStyle=\"#ffffff\";\n    ctx.fillRect(x+5,bl.y+1,Math.max(1,bl.w-10),2);\n  }\n\n  if(boss.active&&!boss.defeated){\n    const x=boss.x-cameraX;\n\n    ctx.fillStyle=\"#7d1f2f\";\n    ctx.fillRect(x,boss.y,boss.width,boss.height);\n\n    ctx.fillStyle=\"#ffcc33\";\n    ctx.fillRect(x+8,boss.y+12,10,10);\n    ctx.fillRect(x+40,boss.y+12,10,10);\n\n    ctx.fillStyle=\"#ef4444\";\n    ctx.fillRect(x+10,boss.y-12,38,6);\n\n    ctx.fillStyle=\"#55ff55\";\n    ctx.fillRect(\n      x+10,\n      boss.y-10,\n      38*(boss.hp/boss.maxHp),\n      3\n    );\n\n    ctx.fillStyle=\"#fff\";\n    ctx.font=\"10px monospace\";\n    ctx.fillText(\"BOSS\",x+12,boss.y+58);\n  }\n}\n\nfunction drawPlayer(){\n\n  let x=player.x-cameraX;\n  let y=player.y;\n\n  ctx.fillStyle=\"#765139\";\n  ctx.fillRect(x-10,y+10,10,17);\n\n  ctx.fillStyle=\"#dddddd\";\n  ctx.fillRect(x-10,y+16,10,5);\n\n  ctx.fillStyle=\"#888888\";\n  ctx.fillRect(x+2,y+9,18,18);\n\n  ctx.fillStyle=\"#b96e35\";\n  ctx.fillRect(x+14,y+9,10,15);\n\n  ctx.fillStyle=\"#ffe36b\";\n  ctx.fillRect(x+17,y+14,4,4);\n\n  ctx.fillStyle=\"#999999\";\n  ctx.fillRect(x+2,y,22,15);\n\n  ctx.fillRect(x+2,y-5,7,7);\n  ctx.fillRect(x+17,y-5,7,7);\n\n  ctx.fillStyle=\"#333333\";\n  ctx.fillRect(x+3,y+5,20,7);\n\n  ctx.fillStyle=\"#ffe66d\";\n  ctx.fillRect(x+7,y+6,4,4);\n  ctx.fillRect(x+16,y+6,4,4);\n\n  ctx.fillStyle=\"#222222\";\n  ctx.fillRect(x+12,y+10,4,2);\n\n  ctx.fillStyle=\"#666666\";\n  ctx.fillRect(x+5,y+25,5,7);\n  ctx.fillRect(x+15,y+25,5,7);\n\n  if(flying){\n    ctx.fillStyle=\"#ffe66d\";\n    ctx.fillRect(x-5,y+7,3,20);\n    ctx.fillRect(x+25,y+7,3,20);\n  }\n\n  if(flying && input.jump){\n    ctx.fillStyle=\"#ff4040\";\n    ctx.fillRect(x+24,y+9,55,4);\n\n    ctx.fillStyle=\"#ffffff\";\n    ctx.fillRect(x+27,y+10,48,2);\n  }\n}\n\nfunction drawStart(){\n  ctx.fillStyle=\"#65c9ff\";\n  ctx.fillRect(0,0,480,270);\n\n  ctx.fillStyle=\"#ffe76a\";\n  ctx.fillRect(380,25,40,40);\n\n  ctx.fillStyle=\"#ffffff\";\n  ctx.font=\"bold 30px monospace\";\n  ctx.fillText(\"NEXUS RACCOON\",105,75);\n\n  ctx.font=\"14px monospace\";\n  ctx.fillText(\"WEB ADVENTURE\",160,100);\n\n  ctx.fillStyle=\"#101522\";\n  ctx.fillRect(95,145,290,70);\n\n  ctx.strokeStyle=\"#ffe45c\";\n  ctx.lineWidth=3;\n  ctx.strokeRect(95,145,290,70);\n\n  ctx.fillStyle=\"#ffe66d\";\n  ctx.font=\"bold 16px monospace\";\n  ctx.fillText(\"MODE: \"+gameMode,180,170);\n\n  ctx.fillStyle=\"#ffffff\";\n  ctx.font=\"11px monospace\";\n  ctx.fillText(\"D3 = CHANGE MODE\",160,195);\n  ctx.fillText(\"D5 = START / RESTART\",145,210);\n  ctx.fillText(\"CENTER = RETURN HOME\",145,225);\n}\n\nfunction draw(){\n  if(state===\"START\"){\n    drawStart();\n    return;\n  }\n\n  drawBackground();\n  drawPlatforms();\n  drawCoins();\n  drawPizzas();\n  drawEnemies();\n  drawCombat();\n  drawPlayer();\n\n  ctx.fillStyle=\"#ffffff\";\n  ctx.font=\"12px monospace\";\n  ctx.fillText(\"NEXUS ZONE\",10,20);\n}\n\nfunction gameLoop(){\n  update();\n  draw();\n  requestAnimationFrame(gameLoop);\n}\n\nupdateHUD();\ngameLoop();\n\n</script>\n\n</body>\n\n</html>\n";

const server = http.createServer((req, res) => {
  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });

    res.end(GAME_PAGE);
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });

    res.end(
      JSON.stringify({
        ok:true,
        service:"NEXUS RACCOON relay"
      })
    );

    return;
  }

  res.writeHead(404, {
    "Content-Type":"text/plain; charset=utf-8"
  });

  res.end("NEXUS RACCOON: Not Found");
});

const wss = new WebSocket.Server({
  server,
  path:"/ws"
});

let esp8266 = null;
const websites = new Set();

function sendJSON(socket, object) {
  if(socket && socket.readyState === WebSocket.OPEN){
    socket.send(JSON.stringify(object));
  }
}

wss.on("connection",(socket)=>{

  socket.role="unknown";

  sendJSON(socket,{
    type:"hello",
    message:"NEXUS RACCOON relay connected"
  });

  socket.on("message",(raw)=>{
    let msg;

    try{
      msg=JSON.parse(raw.toString());
    }
    catch{
      return;
    }

    if(msg.type==="register_esp"){

      if(esp8266 && esp8266!==socket){
        try{
          esp8266.close();
        }
        catch{}
      }

      esp8266=socket;
      socket.role="esp";

      sendJSON(socket,{
        type:"registered",
        role:"esp"
      });

      for(const website of websites){
        sendJSON(website,{
          type:"controller_status",
          connected:true
        });
      }

      return;
    }

    if(msg.type==="controller_request"){

      if(
        esp8266 &&
        esp8266.readyState===WebSocket.OPEN
      ){
        sendJSON(
          esp8266,
          {type:"controller_request"}
        );
      }
      else{
        sendJSON(socket,{
          type:"controller_status",
          connected:false
        });
      }

      return;
    }

    if(
      msg.type==="controller" &&
      socket===esp8266
    ){

      for(const website of websites){
        sendJSON(website,{
          type:"controller",
          data:msg.data || {}
        });
      }

      return;
    }
  });

  socket.on("close",()=>{

    if(socket===esp8266){
      esp8266=null;

      for(const website of websites){
        sendJSON(website,{
          type:"controller_status",
          connected:false
        });
      }
    }

    websites.delete(socket);
  });

  socket.on("error",()=>{
    websites.delete(socket);

    if(socket===esp8266)
      esp8266=null;
  });

  if(socket.role!=="esp"){
    websites.add(socket);

    sendJSON(socket,{
      type:"controller_status",
      connected:!!(
        esp8266 &&
        esp8266.readyState===WebSocket.OPEN
      )
    });
  }

});

server.listen(PORT,()=>{
  console.log(
    `NEXUS RACCOON server running on port ${PORT}`
  );

  console.log(
    `WebSocket endpoint: /ws`
  );
});
{
  "name": "nexus-raccoon-relay",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "ws": "^8.18.0"
  },
  "engines": {
    "node": ">=18"
  }
}
