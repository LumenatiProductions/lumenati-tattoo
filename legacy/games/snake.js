(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 400, H = 320;
  var CELL = 20, COLS = 20, ROWS = 16;

  // SFX
  var sfxCtx;
  function getSfx() { if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); if (sfxCtx.state === 'suspended') { try { sfxCtx.resume(); } catch (e) {} } return sfxCtx; }
  function playSfx(freq, dur, type, vol) {
    try {
      var c = getSfx(), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    } catch(e) {}
  }
  function sfxEat() { playSfx(70, 0.06, 'sawtooth', 0.09); playSfx(700, 0.07, 'square', 0.1); setTimeout(function(){playSfx(1000, 0.08, 'square', 0.1);}, 50); }
  function sfxBonus() { playSfx(900, 0.08, 'square', 0.12); setTimeout(function(){playSfx(1200, 0.08, 'square', 0.12);}, 70); setTimeout(function(){playSfx(1500, 0.12, 'square', 0.12);}, 140); }
  function sfxDie() { playSfx(200, 0.25, 'sawtooth', 0.15); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }


  // Announcer: tiny mp3 one-liners; rooms work fine without them
  var VOICE_CACHE = {};
  var calloutCd = 0;
  function sayCallout(name) {
    if (calloutCd > 0) return;
    calloutCd = 480;
    say(name);
  }
  function say(name, delay) {
    try {
      setTimeout(function() {
        try {
          if (!VOICE_CACHE[name]) {
            VOICE_CACHE[name] = new Audio('/audio/arcade/' + name + '.mp3?v=3');
            VOICE_CACHE[name].volume = 0.5;
          }
          VOICE_CACHE[name].currentTime = 0;
          VOICE_CACHE[name].play().catch(function() {});
        } catch (e) {}
      }, delay || 0);
    } catch (e) {}
  }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#9b59b6', CYAN = '#00FFFF';

  // ── Chiptune: slinky grooves per level, a driving attract loop ──
  var SONGS = [
    { root: 110.00, bass: [0,-1,0,3, -1,3,5,-1, 0,-1,0,3, 7,-1,5,3],   lead: [12,-1,15,-1, 17,15,-1,12, -1,15,17,19, -1,17,15,-1] },
    { root: 123.47, bass: [0,0,-1,5, 3,-1,3,7, 0,0,-1,5, 8,-1,7,5],    lead: [15,-1,12,15, -1,17,19,-1, 15,-1,12,15, 22,-1,19,17] },
    { root: 98.00,  bass: [0,3,0,5, 0,3,0,7, 0,3,0,5, 10,8,7,5],      lead: [19,-1,17,-1, 15,-1,12,-1, 19,-1,17,15, -1,12,-1,-1] },
  ];
  var MENU_SONG = { root: 155.56, bass: [0,-1,3,-1, 5,-1,3,-1, 7,-1,5,-1, 3,-1,0,-1], lead: [12,15,-1,17, -1,15,12,-1, 15,17,19,-1, 17,-1,15,12] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 11 : Math.max(9, 15 - level);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(level - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.045);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.026);
    if (musicStep % 4 === 0) playSfx(65, 0.08, 'sawtooth', 0.04);
    if (musicStep % 8 === 4) playSfx(210, 0.04, 'sawtooth', 0.026);
    if (menu && musicStep % 2 === 1) playSfx(1900, 0.015, 'square', 0.012);
  }
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }

  // Every level re-inks the parlor floor
  var BOARDS = [
    { bg: '#0b1210', chk: 'rgba(127,255,0,0.028)', accent: '#7FFF00' },
    { bg: '#0a0e18', chk: 'rgba(0,255,255,0.03)',  accent: '#00FFFF' },
    { bg: '#140a18', chk: 'rgba(176,38,255,0.035)', accent: '#B026FF' },
    { bg: '#160a0c', chk: 'rgba(255,99,71,0.03)',  accent: '#FF6347' },
  ];

  var mode = 'intro'; // intro | ready | play | over | enter
  var introT = 0;
  var score, lives, frame, snake, dir, turns, food, bonus, bonusT, eaten, stepEvery, respawnT, flashT;
  var blots, level, bannerT, bannerText, bannerColor;
  var eatStreak, lastEat, popups, frenzyT;
  var gold, goldT, stencil, stencilT, mop, particles, shake, lastTail, grew;
  var bestStreak, maxLen, feastWindow;
  var FEAST_WINDOW = 110;
  // Rooms: the parlor is a run of rooms with walls, a door, and a goal.
  var room, roomDef, roomEaten, roomFrames, roomDeaths, roomsCleared, transT, doorOpen, exiting;
  var rival, rivalT, rivalDir, rivalTick, rivalsEaten, client, clientT, cat, power, active, powerT, trail;
  var lineCombo, turnedSinceEat, everAte, speedStep, catsBeaten;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-snake') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-snake', String(best)); } catch(e) {} }
  }

  // ── The rooms of the parlor ──
  // Each room: a wall grid, a door on the edge, a goal of drops, and which
  // hazards live there. The kind cycles with a boss every fifth room.
  var KINDS = ['corridor', 'pillars', 'twin', 'mop', 'spiral', 'checker'];
  function kindFor(n) {
    if (n === 0) return 'floor';
    if (n % 5 === 0) return 'cat';
    return KINDS[(n - 1 - Math.floor(n / 5)) % KINDS.length];
  }
  function roomName(kind) {
    return { floor: 'THE FLOOR', corridor: 'THE CORRIDOR', pillars: 'PILLAR HALL', twin: 'TWO ROOMS', mop: 'WET FLOOR', spiral: 'THE SPIRAL', checker: 'THE STOCKROOM', cat: 'THE CAT' }[kind];
  }
  function buildRoom(n) {
    var kind = kindFor(n);
    var g = [];
    for (var y = 0; y < ROWS; y++) { g[y] = []; for (var x = 0; x < COLS; x++) g[y][x] = false; }
    function wall(x, y) { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) g[y][x] = true; }
    function block(x, y, w, h) { for (var yy = y; yy < y + h; yy++) for (var xx = x; xx < x + w; xx++) wall(xx, yy); }
    var r = {
      n: n, kind: kind, name: roomName(kind), walls: g, wrap: false,
      door: { x: COLS - 1, y: 8 }, spawn: { x: 6, y: 8 }, cap: 7,
      mop: false, rival: n >= 4 && kind !== 'cat', client: n >= 6 && kind !== 'cat', cat: kind === 'cat',
      blots: kind === 'cat' ? 0 : Math.min(2 + n, 10), goal: kind === 'cat' ? 8 : Math.min(6 + n, 12),
    };
    if (kind === 'corridor') {
      for (var x = 0; x < COLS; x++) { if (x < 4 || x > 5) wall(x, 4); if (x < 14 || x > 15) wall(x, 11); }
      r.wrap = true; r.door = { x: 10, y: 0 };
    } else if (kind === 'pillars') {
      block(3, 3, 2, 2); block(15, 3, 2, 2); block(3, 11, 2, 2); block(15, 11, 2, 2); block(9, 4, 2, 2); block(9, 11, 2, 2);
    } else if (kind === 'twin') {
      for (var y2 = 0; y2 < ROWS; y2++) if (y2 < 7 || y2 > 8) wall(9, y2);
      r.door = { x: COLS - 1, y: 2 };
    } else if (kind === 'mop') {
      r.mop = true; r.wrap = true; r.door = { x: 10, y: ROWS - 1 };
    } else if (kind === 'spiral') {
      for (var x2 = 1; x2 <= 18; x2++) { wall(x2, 1); wall(x2, 14); }
      for (var y3 = 1; y3 <= 14; y3++) { wall(1, y3); if (y3 < 7 || y3 > 8) wall(18, y3); }
      for (var x3 = 4; x3 <= 15; x3++) { wall(x3, 4); wall(x3, 11); }
      for (var y4 = 4; y4 <= 11; y4++) { wall(15, y4); if (y4 < 7 || y4 > 8) wall(4, y4); }
      r.spawn = { x: 9, y: 8 }; r.cap = 4;
      r.door = { x: COLS - 1, y: 8 };
      r.blots = Math.min(1 + Math.floor(n / 3), 4);
    } else if (kind === 'checker') {
      var spots = [[2,2],[6,3],[13,2],[17,4],[3,6],[16,7],[12,5],[2,11],[7,12],[12,10],[16,12],[9,13],[5,9],[14,13]];
      for (var i = 0; i < spots.length; i++) wall(spots[i][0], spots[i][1]);
      r.door = { x: 10, y: 0 };
    } else if (kind === 'cat') {
      block(9, 7, 2, 2);
      r.door = { x: 10, y: 0 }; r.spawn = { x: 4, y: 12 }; r.cap = 5;
    }
    // the door cell is never a wall
    g[r.door.y][r.door.x] = false;
    return r;
  }
  function isWall(x, y) { return roomDef.walls[y] && roomDef.walls[y][x]; }
  function isDoor(x, y) { return x === roomDef.door.x && y === roomDef.door.y; }
  function catCell(x, y) { return cat && x >= cat.x && x < cat.x + 2 && y >= cat.y && y < cat.y + 2; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; frame = 0; eaten = 0; stepEvery = 9;
    bonus = null; bonusT = 0; respawnT = 0; flashT = 0; mode = 'intro'; introT = 0;
    blots = []; level = 1; bannerT = 0; bannerText = ''; bannerColor = null;
    eatStreak = 0; lastEat = -999; popups = []; frenzyT = 0;
    gold = null; goldT = 0; stencil = null; stencilT = 0; mop = null; particles = []; shake = 0; lastTail = null; grew = false;
    bestStreak = 0; maxLen = 4;
    room = 0; roomsCleared = 0; transT = 0; exiting = false; rival = null; rivalT = 0; rivalsEaten = 0; client = null; clientT = 0; cat = null;
    power = null; active = null; powerT = 0; trail = []; lineCombo = 0; turnedSinceEat = false; everAte = false; speedStep = 9; catsBeaten = 0;
    musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    enterRoom(0, false);
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Swipe to steer // eat the goal, take the door' : 'Arrows to steer // eat the goal, take the door';
    window.skateRunning = true;
    startLoop();
  }

  function enterRoom(n, carry) {
    room = n; level = n + 1;
    roomDef = buildRoom(n);
    roomEaten = 0; roomFrames = 0; roomDeaths = 0; doorOpen = false; exiting = false;
    blots = []; bonus = null; gold = null; stencil = null; power = null; mop = null; rival = null; client = null; cat = null; trail = [];
    rivalT = roomDef.rival ? 200 : 0; clientT = roomDef.client ? 240 + Math.random() * 200 : 0;
    var len = carry ? Math.min(snake.length, roomDef.cap) : 4;
    resetSnake(len);
    if (roomDef.mop) spawnMop();
    if (roomDef.cat) cat = { x: 9, y: 7, t: 0, phase: 'idle', dirIdx: 0, phaseT: 150, swipes: 0 };
    addBlots(roomDef.blots);
    placeFood();
    var ns = Math.max(4, 9 - Math.floor(n / 2));
    if (ns !== stepEvery) { stepEvery = ns; if (n > 0) popup(W / 2, H / 2 + 20, 'SPEED UP', YELLOW, 60); }
    transT = n > 0 ? 70 : 0;
    bannerT = n > 0 ? 100 : 0;
    bannerText = 'ROOM ' + level + ' // ' + roomDef.name;
    bannerColor = null;
  }

  function resetSnake(len) {
    var s = roomDef.spawn;
    snake = [];
    var n = Math.max(4, len || 4);
    for (var i = 0; i < n; i++) snake.push({ x: s.x - i, y: s.y });
    dir = {x:1,y:0};
    turns = [];
    lastTail = null;
    // Nothing deadly waits on the spawn lane.
    blots = blots.filter(function (b) { return !(b.y >= s.y - 2 && b.y <= s.y + 2 && b.x >= 0 && b.x <= s.x + 6); });
    if (mop && Math.abs(mop.y - s.y) <= 2) mop = null;
    if (rival) rival = rival.filter(function (c) { return !(Math.abs(c.y - s.y) <= 2 && c.x <= s.x + 6); });
    if (rival && rival.length < 2) rival = null;
    if (client && Math.abs(client.y - s.y) <= 2) client = null;
  }

  function cellFree(x, y) {
    if (isWall(x, y) || isDoor(x, y) || catCell(x, y)) return false;
    for (var i = 0; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) return false;
    for (var i = 0; i < blots.length; i++) if (blots[i].x === x && blots[i].y === y) return false;
    if (rival) for (var i = 0; i < rival.length; i++) if (rival[i].x === x && rival[i].y === y) return false;
    if (food && food.x === x && food.y === y) return false;
    if (bonus && bonus.x === x && bonus.y === y) return false;
    if (gold && gold.x === x && gold.y === y) return false;
    if (stencil && stencil.x === x && stencil.y === y) return false;
    if (power && power.x === x && power.y === y) return false;
    if (mop && mop.y === y) return false;
    if (client && client.x === x && client.y === y) return false;
    if (cat && Math.abs(x - cat.x - 0.5) <= 3.5 && Math.abs(y - cat.y - 0.5) <= 3.5) return false; // keep the cat's reach clear
    return true;
  }
  // A cell that is not a wall, not the cat, not off the grid (for movers).
  function walkable(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (isWall(x, y) || catCell(x, y)) return false;
    if (isDoor(x, y)) return false;
    for (var i = 0; i < blots.length; i++) if (blots[i].x === x && blots[i].y === y) return false;
    return true;
  }

  // Dried ink blots: room hazards that stain the floor
  function addBlots(n) {
    var head = snake[0];
    for (var k = 0; k < n && blots.length < 14; k++) {
      var tries = 0, x, y;
      do {
        x = Math.floor(Math.random() * COLS);
        y = Math.floor(Math.random() * ROWS);
        tries++;
      } while ((!cellFree(x, y) || Math.abs(x - head.x) + Math.abs(y - head.y) < 5 || (Math.abs(x - roomDef.door.x) + Math.abs(y - roomDef.door.y) < 3)) && tries < 300);
      if (tries < 300) blots.push({ x: x, y: y, r: Math.random() * 6.28, born: frame });
    }
  }

  function randFree() {
    var x, y, tries = 0;
    do { x = Math.floor(Math.random() * COLS); y = Math.floor(Math.random() * ROWS); tries++; }
    while ((!cellFree(x, y) || !reachable(x, y)) && tries < 500);
    return {x:x, y:y};
  }
  // Rooms with walls: a cell counts only if the walls leave it open on a side.
  function reachable(x, y) {
    return walkable(x - 1, y) || walkable(x + 1, y) || walkable(x, y - 1) || walkable(x, y + 1) || roomDef.wrap;
  }

  function nearBlot(x, y) {
    for (var i = 0; i < blots.length; i++) if (Math.abs(blots[i].x - x) <= 1 && Math.abs(blots[i].y - y) <= 1) return true;
    return false;
  }

  function placeFood() {
    food = randFree();
    food.live = eaten > 0 && eaten % 4 === 3;
    food.born = frame;
    // A drop parked beside a blot pays double: the risky ones wear a red ring.
    food.risky = !food.live && nearBlot(food.x, food.y);
  }

  // The mop: a bucket-and-mop works one row, end to end. Its lane is painted
  // so nobody walks into it blind.
  function spawnMop() {
    var head = snake[0];
    var y, tries = 0;
    do { y = 1 + Math.floor(Math.random() * (ROWS - 2)); tries++; } while ((Math.abs(y - head.y) < 3 || y === roomDef.door.y) && tries < 50);
    mop = { x: 0, y: y, dx: 1, fx: 0, tick: 0, born: frame };
    if (food && food.y === y) placeFood();
  }
  function mopStep() {
    if (!mop) return;
    mop.tick++;
    if (mop.tick % 2 !== 0) return; // half the snake's pace
    mop.x += mop.dx;
    if (mop.x >= COLS - 1) { mop.x = COLS - 1; mop.dx = -1; }
    if (mop.x <= 0) { mop.x = 0; mop.dx = 1; }
    // it wipes any blot it runs over: the mop is a hazard AND a janitor
    for (var i = blots.length - 1; i >= 0; i--) if (blots[i].x === mop.x && blots[i].y === mop.y) { blots.splice(i, 1); burst(mop.x * CELL + 10, mop.y * CELL + 10, '#8fb3c9', 6); }
  }

  // The live one scurries: one hop away from the head every few beats
  function fleeStep() {
    if (!food || !food.live) return;
    var opts = [[1,0],[-1,0],[0,1],[0,-1]];
    var bx = food.x, by = food.y, bd = -1;
    for (var i = 0; i < opts.length; i++) {
      var nx = food.x + opts[i][0], ny = food.y + opts[i][1];
      if (!walkable(nx, ny)) continue;
      var blocked = false;
      for (var j = 0; j < snake.length; j++) if (snake[j].x === nx && snake[j].y === ny) blocked = true;
      if (bonus && bonus.x === nx && bonus.y === ny) blocked = true;
      if (gold && gold.x === nx && gold.y === ny) blocked = true;
      if (stencil && stencil.x === nx && stencil.y === ny) blocked = true;
      if (power && power.x === nx && power.y === ny) blocked = true;
      if (mop && mop.y === ny) blocked = true;
      if (blocked) continue;
      var d = Math.abs(nx - snake[0].x) + Math.abs(ny - snake[0].y);
      if (d > bd) { bd = d; bx = nx; by = ny; }
    }
    // only run when the snake is closing in
    var cur = Math.abs(food.x - snake[0].x) + Math.abs(food.y - snake[0].y);
    if (cur < 7 && bd > cur) { food.x = bx; food.y = by; }
  }

  // Magnet: the drop drifts a cell toward the head every other step.
  function magnetStep() {
    if (!active || active.kind !== 'magnet' || !food || food.live) return;
    var dx = snake[0].x - food.x, dy = snake[0].y - food.y;
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    var nx = food.x + (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0);
    var ny = food.y + (Math.abs(dx) < Math.abs(dy) ? (dy > 0 ? 1 : -1) : 0);
    if (walkable(nx, ny) && !(snake.some(function (s) { return s.x === nx && s.y === ny; }))) { food.x = nx; food.y = ny; food.risky = nearBlot(nx, ny); }
  }

  // ── The rival: a short snake that steals drops. Short, it is lunch. Long, it bites. ──
  function spawnRival() {
    var head = snake[0];
    var x, y, tries = 0;
    do { x = 2 + Math.floor(Math.random() * (COLS - 4)); y = 1 + Math.floor(Math.random() * (ROWS - 2)); tries++; }
    while ((!cellFree(x, y) || !cellFree(x - 1, y) || !cellFree(x - 2, y) || Math.abs(x - head.x) + Math.abs(y - head.y) < 7) && tries < 200);
    if (tries >= 200) { rivalT = 200; return; }
    rival = [{ x: x, y: y }, { x: x - 1, y: y }, { x: x - 2, y: y }];
    rivalDir = { x: 1, y: 0 }; rivalTick = 0;
    popup(x * CELL + 10, y * CELL - 6, 'RIVAL', '#ff9f40', 50);
  }
  function rivalBlocked(x, y) {
    if (!walkable(x, y)) return true;
    for (var i = 0; i < rival.length - 1; i++) if (rival[i].x === x && rival[i].y === y) return true;
    if (mop && mop.y === y) return true;
    if (client && client.x === x && client.y === y) return true;
    return false;
  }
  function rivalStep() {
    if (!rival) return;
    rivalTick++;
    if (rivalTick % 3 === 0) return; // two thirds of the snake's pace
    var h = rival[0];
    var opts = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    var best = null, bestScore = -1e9;
    var chase = food && Math.abs(food.x - h.x) + Math.abs(food.y - h.y) <= 8;
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      if (o.x === -rivalDir.x && o.y === -rivalDir.y) continue;
      var nx = h.x + o.x, ny = h.y + o.y;
      if (roomDef.wrap && (nx < 0 || nx >= COLS)) nx = (nx + COLS) % COLS;
      if (rivalBlocked(nx, ny)) continue;
      var sc = Math.random() * 2;
      if (o.x === rivalDir.x && o.y === rivalDir.y) sc += 3;
      if (chase) sc += 6 - (Math.abs(food.x - nx) + Math.abs(food.y - ny));
      // the rival keeps its distance from a long serpent's head
      var pd = Math.abs(snake[0].x - nx) + Math.abs(snake[0].y - ny);
      if (rival.length <= 4 && pd < 3) sc -= 5;
      if (sc > bestScore) { bestScore = sc; best = { d: o, x: nx, y: ny }; }
    }
    if (!best) return; // cornered: it waits
    rivalDir = best.d;
    var nh = { x: best.x, y: best.y };
    rival.unshift(nh);
    var ate = false;
    if (food && food.x === nh.x && food.y === nh.y) {
      ate = true;
      popup(nh.x * CELL + 10, nh.y * CELL - 4, 'STOLEN', '#ff9f40', 40);
      playSfx(300, 0.08, 'sawtooth', 0.08);
      placeFood();
      if (rival.length > 8) rival.pop();
    }
    // its head on the serpent's body: a bite takes two segments (ghost ink shrugs it off)
    for (var j = 1; j < snake.length; j++) {
      if (snake[j].x === nh.x && snake[j].y === nh.y) {
        if (!(active && active.kind === 'ghost')) {
          var cut = Math.min(2, snake.length - 4);
          for (var c = 0; c < cut; c++) { var tl = snake.pop(); burst(tl.x * CELL + 10, tl.y * CELL + 10, LIME, 4, 2.5); }
          if (cut > 0) { popup(nh.x * CELL + 10, nh.y * CELL - 6, 'BITTEN -' + cut, '#ff9f40', 45); shake = 5; playSfx(180, 0.1, 'sawtooth', 0.1); }
        }
        break;
      }
    }
    if (!ate) rival.pop();
  }
  function rivalHit(x, y) {
    if (!rival) return 0;
    for (var i = 0; i < rival.length; i++) if (rival[i].x === x && rival[i].y === y) return i + 1;
    return 0;
  }

  // ── The client: walks straight across the floor. Do not touch the client. ──
  function spawnClient() {
    var head = snake[0];
    var y, tries = 0;
    do { y = 1 + Math.floor(Math.random() * (ROWS - 2)); tries++; } while ((Math.abs(y - head.y) < 3 || (mop && mop.y === y) || y === roomDef.door.y) && tries < 40);
    // the row must be walkable end to end
    for (var x = 0; x < COLS; x++) if (isWall(x, y) || catCell(x, y)) { clientT = 120; return; }
    var fromLeft = Math.random() < 0.5;
    client = { x: fromLeft ? -1 : COLS, y: y, dx: fromLeft ? 1 : -1, warnT: 50, tick: 0, look: Math.floor(Math.random() * 3) };
  }
  function clientStep() {
    if (!client) return;
    if (client.warnT > 0) { client.warnT--; return; }
    client.tick++;
    if (client.tick % 2 !== 0) return;
    client.x += client.dx;
    if (client.x < -1 || client.x > COLS) { client = null; clientT = 320 + Math.random() * 300; return; }
    for (var i = blots.length - 1; i >= 0; i--) if (blots[i].x === client.x && blots[i].y === client.y) { blots.splice(i, 1); burst(client.x * CELL + 10, client.y * CELL + 10, '#2a0c22', 5); }
  }

  // ── The cat: sits in the middle of its room and swipes. Ears go back first. ──
  var CAT_DIRS = [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
  function catSwipeCells() {
    if (!cat || cat.phase !== 'swipe') return [];
    var d = CAT_DIRS[cat.dirIdx], cells = [];
    for (var k = 1; k <= 3; k++) {
      if (d.x !== 0) { var cx = d.x > 0 ? cat.x + 1 + k : cat.x - k; cells.push({ x: cx, y: cat.y }); cells.push({ x: cx, y: cat.y + 1 }); }
      else { var cy = d.y > 0 ? cat.y + 1 + k : cat.y - k; cells.push({ x: cat.x, y: cy }); cells.push({ x: cat.x + 1, y: cy }); }
    }
    return cells;
  }
  function catUpdate() {
    if (!cat) return;
    cat.t++;
    cat.phaseT--;
    if (cat.phaseT > 0) return;
    if (cat.phase === 'idle') {
      cat.phase = 'warn'; cat.phaseT = 40;
      // it swipes toward the serpent's side of the room when it can
      var hx = snake[0].x - (cat.x + 0.5), hy = snake[0].y - (cat.y + 0.5);
      var wantIdx = Math.abs(hx) > Math.abs(hy) ? (hx > 0 ? 0 : 2) : (hy > 0 ? 1 : 3);
      cat.dirIdx = Math.random() < 0.6 ? wantIdx : Math.floor(Math.random() * 4);
      playSfx(900, 0.05, 'square', 0.06);
    } else if (cat.phase === 'warn') {
      cat.phase = 'swipe'; cat.phaseT = 22; cat.swipes++;
      playSfx(140, 0.2, 'sawtooth', 0.12);
      shake = Math.max(shake, 4);
    } else {
      cat.phase = 'idle'; cat.phaseT = Math.max(70, 150 - roomsCleared * 6);
    }
  }
  function catClaws() {
    var cells = catSwipeCells();
    if (!cells.length) return;
    var head = snake[0];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.x === head.x && c.y === head.y) { die('the cat'); return; }
      for (var j = 1; j < snake.length; j++) {
        if (snake[j].x === c.x && snake[j].y === c.y) {
          if (active && active.kind === 'ghost') return;
          var cut = snake.length - j;
          if (snake.length - cut < 4) cut = snake.length - 4;
          if (cut <= 0) return;
          for (var k = 0; k < cut; k++) { var tl = snake.pop(); burst(tl.x * CELL + 10, tl.y * CELL + 10, LIME, 4, 3); }
          popup(c.x * CELL + 10, c.y * CELL - 4, 'CLAWED -' + cut, '#ff9f40', 45);
          shake = 8; playSfx(200, 0.12, 'sawtooth', 0.1);
          return;
        }
      }
    }
  }

  // ── Power-ups: one on the floor at a time, one active at a time ──
  var POWERS = ['ghost', 'slow', 'magnet', 'double'];
  var POWER_NAME = { ghost: 'GHOST INK', slow: 'SLOW-MO', magnet: 'MAGNET', double: 'DOUBLE INK' };
  var POWER_COLOR = { ghost: CYAN, slow: '#c9a0ff', magnet: '#ff9f40', double: PINK };
  function spawnPower() {
    var kind = POWERS[Math.floor(Math.random() * POWERS.length)];
    if (kind === 'ghost' && snake.length < 8) kind = 'magnet';
    var p = randFree();
    power = { x: p.x, y: p.y, kind: kind, t: 420 };
  }
  function activatePower(kind, hx, hy) {
    active = { kind: kind, t: 360 };
    popup(hx, hy - 12, POWER_NAME[kind], POWER_COLOR[kind], 55);
    burst(hx, hy + 6, POWER_COLOR[kind], 14, 2.5);
    sfxBonus();
    if (kind === 'slow') sayCallout('snake-c1');
  }

  function turn(nx, ny) {
    var last = turns.length ? turns[turns.length - 1] : dir;
    if (nx === -last.x && ny === -last.y) return; // no 180s
    if (nx === last.x && ny === last.y) return;
    if (turns.length < 3) turns.push({x:nx, y:ny});
  }

  // ── Juice: ink particles and a camera shake ──
  function burst(x, y, color, n, speed) {
    for (var i = 0; i < n && particles.length < 200; i++) {
      var a = Math.random() * Math.PI * 2, sp = (speed || 2) * (0.4 + Math.random());
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 24 + Math.random() * 20, color: color, r: 1.5 + Math.random() * 2 });
    }
  }
  function popup(x, y, text, color, life) {
    popups.push({ x: x, y: y, text: text, color: color, life: life || 40, born: frame });
  }
  function addScore(pts, x, y, label, color) {
    score += pts;
    document.getElementById('jd-br-score').textContent = score;
    popup(x, y, (label ? label + ' ' : '') + '+' + pts, color || '#fff');
  }

  function die(why) {
    lives--;
    roomDeaths++;
    document.getElementById('jd-br-lives').textContent = lives;
    flashT = 12; shake = 14;
    // the serpent comes apart: every scale is a chunk with its own arc
    for (var i = 0; i < snake.length; i++) {
      var sx = snake[i].x * CELL + 10, sy = snake[i].y * CELL + 10;
      burst(sx, sy, i === 0 ? '#fff' : LIME, i === 0 ? 10 : 2, 3);
      if (i > 0 && particles.length < 200) {
        var a = Math.random() * Math.PI * 2;
        particles.push({ x: sx, y: sy, vx: Math.cos(a) * 3, vy: -3 - Math.random() * 3, life: 40 + Math.random() * 20, color: 'rgb(' + Math.round(127 * (1 - i / snake.length * 0.5)) + ',' + Math.round(255 * (1 - i / snake.length * 0.5)) + ',0)', r: 3 + Math.random() * 2 });
      }
    }
    eatStreak = 0; frenzyT = 0; active = null; lineCombo = 0;
    if (why) popup(snake[0].x * CELL + 10, snake[0].y * CELL - 8, why.toUpperCase(), '#ff5040', 60);
    if (lives <= 0) {
      enterBoard(score);
      saveBest();
      deathJingle();
    } else {
      sfxDie();
      resetSnake(Math.min(snake.length, roomDef.cap));
      respawnT = 45;
    }
  }

  // Points per drop grow with the serpent: a long snake is a risky snake.
  function baseDrop() { return (10 + Math.floor(snake.length / 5) * 2) * (active && active.kind === 'double' ? 2 : 1); }

  function openDoor() {
    doorOpen = true;
    bannerT = 80; bannerText = 'DOOR OPEN // TAKE IT'; bannerColor = LIME;
    burst(roomDef.door.x * CELL + 10, roomDef.door.y * CELL + 10, LIME, 20, 3);
    sfxBonus();
    sayCallout('snake-c2');
  }

  function clearRoom() {
    roomsCleared++;
    var secs = Math.floor(roomFrames / 60);
    var base = 200 * level;
    var timeB = Math.max(0, 90 - secs) * 5;
    var clean = roomDeaths === 0 ? 150 * level : 0;
    var hx = snake[0].x * CELL + 10, hy = snake[0].y * CELL + 10;
    addScore(base, hx, hy, 'ROOM CLEAR', LIME);
    if (timeB > 0) addScore(timeB, hx, hy - 14, 'FAST', CYAN);
    if (clean > 0) addScore(clean, hx, hy - 28, 'NO DEATHS', YELLOW);
    if (roomDef.cat) { catsBeaten++; addScore(500, hx, hy - 42, 'CAT BEATEN', PINK); say('so-sick', 200); }
    shake = 6;
    sfxBonus();
    enterRoom(room + 1, true);
  }

  function step() {
    var turned = false;
    if (turns.length) { dir = turns.shift(); turned = true; }
    if (turned) turnedSinceEat = true;
    var head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
    if (roomDef.wrap && (head.x < 0 || head.x >= COLS) && !isWall((head.x + COLS) % COLS, head.y)) head.x = (head.x + COLS) % COLS;
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { die('the wall'); return; }
    if (isWall(head.x, head.y)) { die('the wall'); return; }
    if (catCell(head.x, head.y)) { die('the cat'); return; }
    if (isDoor(head.x, head.y)) {
      if (!doorOpen) { die('locked door'); return; }
      snake.unshift(head); lastTail = snake.pop();
      clearRoom();
      return;
    }
    var ghost = active && active.kind === 'ghost';
    if (!ghost) for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) { die('your own tail'); return; }
    }
    for (var i = 0; i < blots.length; i++) {
      if (blots[i].x === head.x && blots[i].y === head.y) { die('dried ink'); return; }
    }
    if (mop && mop.x === head.x && mop.y === head.y) { die('the mop'); return; }
    if (client && client.warnT <= 0 && client.x === head.x && client.y === head.y) { die('a client'); return; }
    var rh = rivalHit(head.x, head.y);
    if (rh) {
      if (rival.length > 4) { die('the rival'); return; }
      // lunch: everything from that segment back
      var taken = rival.length - rh + 1;
      var pts = 40 * taken;
      for (var t = 0; t < taken; t++) { var seg = rival.pop(); burst(seg.x * CELL + 10, seg.y * CELL + 10, '#ff9f40', 5, 2.5); }
      if (rival.length < 2) { rival = null; rivalT = 700; rivalsEaten++; pts += 150; popup(head.x * CELL + 10, head.y * CELL - 8, 'RIVAL DOWN', '#ff9f40', 55); sayCallout('snake-c3'); }
      addScore(pts, head.x * CELL + 10, head.y * CELL + 4, 'CHOMP', '#ff9f40');
      sfxEat();
    }
    var swipe = catSwipeCells();
    for (var s = 0; s < swipe.length; s++) if (swipe[s].x === head.x && swipe[s].y === head.y) { die('the cat'); return; }
    snake.unshift(head);
    trail.push({ x: head.x * CELL + 10, y: head.y * CELL + 10, life: 30 });
    if (trail.length > 40) trail.shift();
    grew = false;
    var hx = head.x * CELL + 10, hy = head.y * CELL + 4;
    if (food && head.x === food.x && head.y === food.y) {
      grew = true;
      eatStreak = frame - lastEat < FEAST_WINDOW ? Math.min(5, eatStreak + 1) : 1;
      if (eatStreak > bestStreak) bestStreak = eatStreak;
      lastEat = frame;
      var wasLive = food.live, risky = food.risky, quick = frame - food.born < 150;
      var pts = (wasLive ? 30 : baseDrop() * eatStreak) * (frenzyT > 0 ? 2 : 1) * (risky ? 2 : 1);
      score += pts; eaten++; roomEaten++;
      document.getElementById('jd-br-score').textContent = score;
      var tag = wasLive ? 'CAUGHT' : risky ? 'RISKY x2' : '';
      popup(hx, hy, (tag ? tag + ' ' : '') + '+' + pts + (!wasLive && eatStreak > 1 ? ' x' + eatStreak : ''), wasLive ? PINK : risky ? '#ff5040' : eatStreak > 1 ? YELLOW : '#fff');
      burst(hx, hy + 6, wasLive ? PINK : '#ff5fb0', 8 + eatStreak * 2);
      if (quick && !wasLive) { addScore(20, hx, hy - 14, 'QUICK', CYAN); }
      // Straight shot: drops taken without a single turn between them stack up
      if (everAte && !turnedSinceEat) { lineCombo++; addScore(15 * lineCombo, hx, hy - 28, 'STRAIGHT x' + lineCombo, LIME); }
      else lineCombo = 0;
      everAte = true; turnedSinceEat = false;
      if (wasLive) sayCallout('snake-c3');
      if (eatStreak === 5 && frenzyT <= 0) {
        frenzyT = 600; shake = 6;
        popup(hx, hy - 28, 'FRENZY! 2X', '#FF6347', 60);
        sayCallout('snake-c2');
        sfxBonus();
      }
      sfxEat();
      if (snake.length > maxLen) maxLen = snake.length;
      if (snake.length % 10 === 0) { addScore(100, hx, hy - 14, 'LONG ' + snake.length, LIME); sfxBonus(); }
      if (!doorOpen && roomEaten >= roomDef.goal) openDoor();
      if (eaten % 5 === 0 && !bonus) { bonus = randFree(); bonusT = 300; }
      if (room >= 1 && !gold && Math.random() < 0.2) { gold = randFree(); goldT = 200; }
      if (room >= 2 && !stencil && snake.length >= 14 && Math.random() < 0.3) { stencil = randFree(); stencilT = 420; }
      if (room >= 2 && !power && !active && Math.random() < 0.2) spawnPower();
      placeFood();
    } else if (bonus && head.x === bonus.x && head.y === bonus.y) {
      var mp = 50 * (frenzyT > 0 ? 2 : 1);
      addScore(mp, hx, hy, 'MACHINE', PURPLE);
      burst(hx, hy + 6, PURPLE, 12);
      sfxBonus();
      bonus = null; bonusT = 0;
      snake.pop();
    } else if (gold && head.x === gold.x && head.y === gold.y) {
      var gp = 150 * (frenzyT > 0 ? 2 : 1);
      addScore(gp, hx, hy, 'GOLD INK', YELLOW);
      burst(hx, hy + 6, YELLOW, 18, 3);
      shake = 5;
      sfxBonus();
      gold = null; goldT = 0;
      snake.pop();
    } else if (stencil && head.x === stencil.x && head.y === stencil.y) {
      // a stencil sheet: trade four segments of length for breathing room
      var cut = Math.min(4, snake.length - 4);
      for (var s2 = 0; s2 < cut; s2++) { var tl = snake.pop(); burst(tl.x * CELL + 10, tl.y * CELL + 10, CYAN, 3); }
      popup(hx, hy, 'STENCIL -' + cut, CYAN, 45);
      sfxEat();
      stencil = null; stencilT = 0;
      snake.pop();
    } else if (power && head.x === power.x && head.y === power.y) {
      activatePower(power.kind, hx, hy);
      power = null;
      snake.pop();
    } else {
      lastTail = snake.pop();
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (flashT > 0) flashT--;
    if (bannerT > 0) bannerT--;
    if (frenzyT > 0) frenzyT--;
    if (shake > 0) shake--;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.96; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var i = trail.length - 1; i >= 0; i--) { trail[i].life--; if (trail[i].life <= 0) trail.splice(i, 1); }
    if (transT > 0) { transT--; return; } // the lights come up before anything moves
    if (respawnT > 0) { respawnT--; return; }
    roomFrames++;
    if (active) { active.t--; if (active.t <= 0) { popup(snake[0].x * CELL + 10, snake[0].y * CELL - 6, POWER_NAME[active.kind] + ' OVER', '#9aa', 40); active = null; } }
    if (bonus) { bonusT--; if (bonusT <= 0) bonus = null; }
    if (gold) { goldT--; if (goldT <= 0) gold = null; }
    if (stencil) { stencilT--; if (stencilT <= 0) stencil = null; }
    if (power) { power.t--; if (power.t <= 0) power = null; }
    if (roomDef.rival && !rival) { rivalT--; if (rivalT <= 0) spawnRival(); }
    if (roomDef.client && !client) { clientT--; if (clientT <= 0) spawnClient(); }
    catUpdate();
    if (cat && cat.phase === 'swipe') catClaws();
    var pace = stepEvery + (active && active.kind === 'slow' ? 3 : 0);
    if (frame % (pace * 3) === 0) fleeStep();
    if (frame % (pace * 2) === 0) magnetStep();
    if (frame % pace === 0) { step(); if (mode !== 'play') return; mopStep(); rivalStep(); clientStep(); }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; wall.markStart(); return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; wall.markStart(); return; }
    if (mode === 'ready') mode = 'play';
  }
  var KEYS = {
    ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
    KeyW: [0,-1], KeyS: [0,1], KeyA: [-1,0], KeyD: [1,0]
  };
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    var k = KEYS[e.code];
    if (k) {
      e.preventDefault();
      start();
      turn(k[0], k[1]);
    } else if (e.code === 'Space') {
      e.preventDefault();
      start();
    }
  });
  // Touch: swipe to steer
  var tX = null, tY = null;
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    tX = e.touches[0].clientX; tY = e.touches[0].clientY;
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (tX === null) return;
    var dx = e.touches[0].clientX - tX, dy = e.touches[0].clientY - tY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
    tX = e.touches[0].clientX; tY = e.touches[0].clientY;
  }, { passive: false });
  canvas.addEventListener('click', function() { start(); });


  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'snake', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'GAME OVER', again: 'SPACE or TAP to slither again',
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
    label: 'Ink Snake',
    levelLabel: function (l) { return 'ROOM ' + l + ' // ' + eaten + ' DROPS // LONGEST ' + maxLen; },
  });
  function enterBoard(v) { wall.enter(v, { level: level, meta: { combo: bestStreak, len: maxLen, eaten: eaten, rooms: roomsCleared, cats: catsBeaten, rivals: rivalsEaten } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }

  // ── Attract-mode intro: CRT power-on, studio card, title scene, then the wall ──
  function drawIntro() {
    var t = introT;
    if (t >= 285) { wall.drawAttract(); return; }
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, W, H);
    if (t < 70) {
      if (t < 14) {
        var lw = (t / 14) * W;
        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect((W - lw) / 2, H / 2 - 1, lw, 2);
      } else {
        if (Math.sin(t * 1.9) > -0.5 || t > 38) {
          ctx.fillStyle = '#FF1493';
          ctx.font = 'bold 18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('LUMENATI', W / 2, H / 2 - 6);
          ctx.fillStyle = '#d8dde4';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('A  R  C  A  D  E', W / 2, H / 2 + 14);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
      return;
    }
    var t2 = t - 70;
    function slam(title, y, size, color) {
      ctx.textAlign = 'center';
      var tw = size * 0.68;
      for (var i = 0; i < title.length; i++) {
        var lt = Math.max(0, Math.min(1, (t2 - i * 6) / 16));
        if (lt <= 0) continue;
        ctx.font = 'bold ' + size + 'px monospace';
        ctx.fillStyle = color;
        ctx.fillText(title[i], W / 2 - title.length * tw / 2 + i * tw + tw / 2, y - (1 - lt) * (1 - lt) * 160);
      }
    }
    ctx.fillStyle = '#0b1210'; ctx.fillRect(0, 0, W, H);
    drawFloorGlow(BOARDS[0], 0.5);
    slam('INK SNAKE', 104, 32, LIME);
    // the drop runs for its life until the snap
    var catchT = 122;
    var hx = -40 + t2 * 3.2;
    var dxp = Math.min(320, 240 + t2 * 0.9);
    var caught = t2 >= catchT;
    var segs = caught ? 14 : 10;
    var pts = [];
    for (var i = 0; i < segs; i++) {
      var seg = hx - i * 17;
      pts.push({ x: seg, y: 208 + Math.sin(seg * 0.03) * 24 });
    }
    drawSerpent(pts, { x: 1, y: 0 }, 10, false, null);
    if (!caught) {
      // fleeing drop with panic wobble + the tongue reaching for it
      var dyp = 208 + Math.sin(dxp * 0.03) * 24 + Math.sin(t2 * 0.6) * 3;
      drawDrop(dxp, dyp, true, false);
    } else if (t2 < catchT + 14) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((catchT + 14 - t2) * 0.04).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SNAP! +30', Math.min(320, hx), pts[0].y - 24);
    }
    if (t2 > 140) { ctx.fillStyle = PINK; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('EAT THE GOAL // TAKE THE DOOR // ROOM BY ROOM', W / 2, 146); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS or SWIPE to steer // a longer snake is worth more per drop', W / 2, H - 42);
    ctx.fillText('feast fast for x5 // straight shots stack // short rivals are lunch // mind the cat', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      var top = wall.top();
      ctx.fillText(top ? 'WALL: ' + top.n + ' ' + top.s + ' // YOUR BEST: ' + best : 'BEST: ' + best, W / 2, H - 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
  }

  // ── Drawing helpers ──
  function drawFloorGlow(board, strength) {
    // the neon sign over the door throws this level's color across the tiles
    var g = ctx.createRadialGradient(W / 2, -40, 10, W / 2, -40, 300);
    g.addColorStop(0, board.accent);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.10 * strength;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawDrop(fx, fy, live, risky) {
    // puddle shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(fx, fy + 9, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    var pulse = 7 + Math.sin(frame * 0.12) * 2;
    ctx.strokeStyle = risky ? 'rgba(255,80,64,' + (0.7 - Math.sin(frame * 0.2) * 0.25).toFixed(2) + ')' : 'rgba(255,20,147,' + (0.4 - Math.sin(frame * 0.12) * 0.2).toFixed(2) + ')';
    ctx.lineWidth = risky ? 2 : 1;
    ctx.beginPath(); ctx.arc(fx, fy + 1, pulse + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = PINK;
    ctx.beginPath(); ctx.arc(fx, fy + 2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx, fy - 8); ctx.lineTo(fx + 5, fy); ctx.lineTo(fx - 5, fy); ctx.fill();
    ctx.fillStyle = '#b8005f';
    ctx.beginPath(); ctx.arc(fx + 1, fy + 4, 4, 0, Math.PI); ctx.fill();
    if (live) {
      ctx.strokeStyle = PINK;
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy + 5); ctx.lineTo(fx - 8, fy + 8 + Math.sin(frame * 0.6) * 2);
      ctx.moveTo(fx + 5, fy + 5); ctx.lineTo(fx + 8, fy + 8 - Math.sin(frame * 0.6) * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx - 3, fy - 1, 2, 2);
      ctx.fillRect(fx + 1, fy - 1, 2, 2);
    } else {
      ctx.fillStyle = '#ffd6e8';
      ctx.beginPath(); ctx.arc(fx - 2, fy, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  // The serpent, drawn as a chain of shaded scales through the given points.
  function drawSerpent(pts, d, headR, blink, lookAt) {
    if (blink) return;
    var n = pts.length;
    // shadow under the whole body
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (var i = n - 1; i >= 0; i--) {
      var rr = i === 0 ? headR : Math.max(2.5, headR - 1 - (i / Math.max(1, n - 1)) * (headR - 3));
      ctx.beginPath(); ctx.arc(pts[i].x + 1.5, pts[i].y + 3, rr, 0, Math.PI * 2); ctx.fill();
    }
    for (var i = n - 1; i >= 0; i--) {
      var t = i / Math.max(1, n - 1);
      var r = i === 0 ? headR : Math.max(2.5, headR - 1 - t * (headR - 3));
      var p = pts[i];
      var shade = 1 - t * 0.5;
      ctx.fillStyle = i === 0 ? LIME : 'rgb(' + Math.round(127 * shade) + ',' + Math.round(255 * shade) + ',0)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (i > 0) {
        // scale highlight up top, dark belly stripe below
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.35, r * 0.42, 0, Math.PI * 2); ctx.fill();
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(0,40,0,0.35)';
          ctx.beginPath(); ctx.arc(p.x, p.y + r * 0.25, r * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // Head: brow ridge, eyes set perpendicular to travel, pupils that track the drop
    var h = pts[0], hx = h.x, hy = h.y;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(hx - d.x * 2 - d.y * 2, hy - d.y * 2 - d.x * 2, headR * 0.5, 0, Math.PI * 2); ctx.fill();
    var lx = 0, ly = 0;
    if (lookAt) { var ddx = lookAt.x - hx, ddy = lookAt.y - hy, dl = Math.max(1, Math.sqrt(ddx * ddx + ddy * ddy)); lx = ddx / dl; ly = ddy / dl; }
    for (var s = -1; s <= 1; s += 2) {
      var ex = hx + d.x * 3 + d.y * 4 * s, ey = hy + d.y * 3 + d.x * 4 * s;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14121a';
      ctx.beginPath(); ctx.arc(ex + lx * 1.1 + d.x * 0.6, ey + ly * 1.1 + d.y * 0.6, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    if (frame % 50 < 12) {
      ctx.strokeStyle = '#e8283c';
      ctx.lineWidth = 1.5;
      var tx = hx + d.x * headR, ty = hy + d.y * headR, fl = 5 + (frame % 50) * 0.3;
      ctx.beginPath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx + d.x * fl, ty + d.y * fl);
      ctx.lineTo(tx + d.x * (fl + 3) + d.y * 2, ty + d.y * (fl + 3) + d.x * 2);
      ctx.moveTo(tx + d.x * fl, ty + d.y * fl);
      ctx.lineTo(tx + d.x * (fl + 3) - d.y * 2, ty + d.y * (fl + 3) - d.x * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // Where the serpent is between grid steps: the head slides into its new cell
  // and the tail slides out of the old one, so movement reads smooth at any pace.
  function serpentPoints() {
    var pace = stepEvery + (active && active.kind === 'slow' ? 3 : 0);
    var p = (respawnT > 0 || transT > 0) ? 1 : ((frame % pace) + 1) / pace;
    var pts = [];
    var c = function (s) { return { x: s.x * CELL + 10, y: s.y * CELL + 10 }; };
    var head = c(snake[0]);
    if (snake.length > 1) {
      var neck = c(snake[1]);
      // no lerp across a respawn jump or a wrap
      if (Math.abs(head.x - neck.x) + Math.abs(head.y - neck.y) <= CELL + 1) head = { x: neck.x + (head.x - neck.x) * p, y: neck.y + (head.y - neck.y) * p };
    }
    pts.push(head);
    for (var i = 1; i < snake.length; i++) pts.push(c(snake[i]));
    if (lastTail && !grew && snake.length > 1) {
      var lt = c(lastTail), tl = pts[pts.length - 1];
      if (Math.abs(lt.x - tl.x) + Math.abs(lt.y - tl.y) <= CELL + 1) pts[pts.length - 1] = { x: lt.x + (tl.x - lt.x) * p, y: lt.y + (tl.y - lt.y) * p };
    }
    return pts;
  }

  // ── Room dressing: walls, the door, the cat, the client, the rival ──
  function drawWalls(board) {
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      if (!roomDef.walls[y][x]) continue;
      var px = x * CELL, py = y * CELL;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(px + 2, py + 3, CELL, CELL);
      ctx.fillStyle = '#2b2531'; ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#3a3242'; ctx.fillRect(px, py, CELL, 3);
      ctx.fillStyle = '#1c1720'; ctx.fillRect(px, py + CELL - 3, CELL, 3);
      // a tile line, and a hint of the room's neon on the top edge
      ctx.fillStyle = board.accent; ctx.globalAlpha = 0.18; ctx.fillRect(px + 1, py + 1, CELL - 2, 1); ctx.globalAlpha = 1;
      if (!roomDef.walls[y - 1] || !roomDef.walls[y - 1][x]) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(px, py, CELL, 1); }
    }
  }
  function drawDoor(board) {
    var d = roomDef.door, px = d.x * CELL, py = d.y * CELL;
    var open = doorOpen;
    var glow = open ? 0.35 + Math.sin(frame * 0.2) * 0.2 : 0.1;
    var g = ctx.createRadialGradient(px + 10, py + 10, 2, px + 10, py + 10, 26);
    g.addColorStop(0, open ? 'rgba(127,255,0,' + glow.toFixed(2) + ')' : 'rgba(255,80,64,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(px - 16, py - 16, CELL + 32, CELL + 32);
    // frame and slab
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(px, py, CELL, CELL);
    ctx.fillStyle = open ? '#0b1210' : '#6b4a2f'; ctx.fillRect(px + 3, py + 2, CELL - 6, CELL - 3);
    if (!open) {
      ctx.fillStyle = '#c9a36a'; ctx.fillRect(px + CELL - 8, py + 9, 3, 3);
      // the goal on the door: drops left
      ctx.fillStyle = '#ff5040'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.max(0, roomDef.goal - roomEaten)), px + 10, py + 14);
    } else {
      ctx.fillStyle = LIME; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      var arrow = d.y === 0 ? '▲' : d.y === ROWS - 1 ? '▼' : d.x === 0 ? '◀' : '▶';
      ctx.fillText(arrow, px + 10, py + 15 + Math.sin(frame * 0.3) * 1.5);
    }
  }
  function drawCat() {
    if (!cat) return;
    var cx = cat.x * CELL + CELL, cy = cat.y * CELL + CELL;
    var warn = cat.phase === 'warn', swipe = cat.phase === 'swipe';
    // the reach, painted as a warning ring so the swipe is never a surprise
    ctx.strokeStyle = 'rgba(255,159,64,' + (warn ? (0.35 + Math.sin(frame * 0.5) * 0.25) : 0.12).toFixed(2) + ')';
    ctx.setLineDash([3, 5]);
    ctx.strokeRect(cx - CELL * 4, cy - CELL * 4, CELL * 8, CELL * 8);
    ctx.setLineDash([]);
    // paw shadow on the side it is about to swipe
    if (warn || swipe) {
      var d = CAT_DIRS[cat.dirIdx];
      var cells = swipe ? catSwipeCells() : (function () { var out = []; for (var k = 1; k <= 3; k++) { if (d.x !== 0) { var xx = d.x > 0 ? cat.x + 1 + k : cat.x - k; out.push({ x: xx, y: cat.y }); out.push({ x: xx, y: cat.y + 1 }); } else { var yy = d.y > 0 ? cat.y + 1 + k : cat.y - k; out.push({ x: cat.x, y: yy }); out.push({ x: cat.x + 1, y: yy }); } } return out; })();
      ctx.fillStyle = swipe ? 'rgba(255,159,64,0.45)' : 'rgba(255,159,64,' + (0.1 + Math.sin(frame * 0.6) * 0.08).toFixed(2) + ')';
      for (var i = 0; i < cells.length; i++) ctx.fillRect(cells[i].x * CELL + 1, cells[i].y * CELL + 1, CELL - 2, CELL - 2);
      if (swipe) {
        // the paw itself, claws out
        ctx.fillStyle = '#d9b48a';
        var far = cells[cells.length - 1];
        var pxp = far.x * CELL + 10 - d.x * 4, pyp = far.y * CELL + 10 - d.y * 4;
        ctx.beginPath(); ctx.arc(pxp, pyp, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        for (var c2 = -1; c2 <= 1; c2++) { ctx.beginPath(); ctx.moveTo(pxp + d.y * c2 * 4, pyp + d.x * c2 * 4); ctx.lineTo(pxp + d.y * c2 * 4 + d.x * 9, pyp + d.x * c2 * 4 + d.y * 9); ctx.stroke(); }
        ctx.lineWidth = 1;
      }
    }
    // body: a fat loaf, ears, eyes that glow before the swipe, a tail that flicks
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(cx, cy + 12, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b3340';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - 8, 11, 0, Math.PI * 2); ctx.fill();
    var earBack = warn || swipe;
    ctx.beginPath(); ctx.moveTo(cx - 10, cy - 12); ctx.lineTo(cx - 12 - (earBack ? 3 : 0), cy - 22 + (earBack ? 6 : 0)); ctx.lineTo(cx - 3, cy - 16); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 10, cy - 12); ctx.lineTo(cx + 12 + (earBack ? 3 : 0), cy - 22 + (earBack ? 6 : 0)); ctx.lineTo(cx + 3, cy - 16); ctx.fill();
    ctx.fillStyle = '#5a4f61'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    var eye = warn || swipe ? '#ff9f40' : (Math.floor(frame / 90) % 7 === 0 ? '#3b3340' : YELLOW);
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.ellipse(cx - 4, cy - 9, 2.6, warn ? 3 : 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 4, cy - 9, 2.6, warn ? 3 : 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14121a'; ctx.fillRect(cx - 4.5, cy - 11, 1, 4); ctx.fillRect(cx + 3.5, cy - 11, 1, 4);
    ctx.strokeStyle = '#3b3340'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + 16, cy + 6); ctx.quadraticCurveTo(cx + 30, cy - 4 + Math.sin(frame * 0.15) * 8, cx + 24, cy - 14 + Math.sin(frame * 0.1) * 4); ctx.stroke();
    ctx.lineWidth = 1;
    // a shop collar with the eye
    ctx.fillStyle = PINK; ctx.fillRect(cx - 9, cy - 1, 18, 3);
  }
  function drawClient() {
    if (!client) return;
    var y = client.y * CELL + 10;
    if (client.warnT > 0) {
      var ex = client.dx > 0 ? 6 : W - 6;
      ctx.fillStyle = Math.floor(frame / 5) % 2 === 0 ? '#ff9f40' : 'rgba(255,159,64,0.4)';
      ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(client.dx > 0 ? '▶' : '◀', ex, y + 4);
      ctx.fillStyle = 'rgba(255,159,64,0.06)'; ctx.fillRect(0, client.y * CELL, W, CELL);
      return;
    }
    var x = client.x * CELL + 10 + (client.tick % 2 === 0 ? 0 : client.dx * 5);
    var bob = Math.abs(Math.sin(client.tick * 0.8)) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 9, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    var shirt = ['#e74c3c', '#3498db', '#f1c40f'][client.look];
    ctx.fillStyle = shirt; ctx.fillRect(x - 5, y - 4 - bob, 10, 10);
    ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(x, y - 9 - bob, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b1d14'; ctx.fillRect(x - 4, y - 14 - bob, 8, 3);
    ctx.fillStyle = '#222'; ctx.fillRect(x - 4, y + 6 - bob, 3, 4); ctx.fillRect(x + 1, y + 6 - bob, 3, 4);
    // a fresh piece on the arm, wrapped
    ctx.fillStyle = '#fff'; ctx.fillRect(x + (client.dx > 0 ? 5 : -7), y - 2 - bob, 2, 5);
  }
  function drawRival() {
    if (!rival) return;
    var pace = stepEvery + (active && active.kind === 'slow' ? 3 : 0);
    var n = rival.length;
    for (var i = n - 1; i >= 0; i--) {
      var p = rival[i], x = p.x * CELL + 10, y = p.y * CELL + 10;
      var r = i === 0 ? 7 : Math.max(2.5, 6 - i * 0.6);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 1, y + 2.5, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i === 0 ? '#ffb060' : 'rgb(' + (230 - i * 12) + ',' + (140 - i * 8) + ',40)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (i > 0) { ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.4, 0, Math.PI * 2); ctx.fill(); }
    }
    var h = rival[0], hx = h.x * CELL + 10, hy = h.y * CELL + 10;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(hx + rivalDir.y * 3 + rivalDir.x * 2, hy + rivalDir.x * 3 + rivalDir.y * 2, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - rivalDir.y * 3 + rivalDir.x * 2, hy - rivalDir.x * 3 + rivalDir.y * 2, 1.8, 0, Math.PI * 2); ctx.fill();
    // tag: lunch or trouble
    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = n <= 4 ? LIME : '#ff5040';
    ctx.fillText(n <= 4 ? 'LUNCH' : 'BITES', hx, hy - 11);
  }
  function drawPower() {
    if (!power || (power.t < 90 && Math.floor(frame / 5) % 2 === 1)) return;
    var x = power.x * CELL + 10, y = power.y * CELL + 10, col = POWER_COLOR[power.kind];
    var g = ctx.createRadialGradient(x, y, 1, x, y, 16);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35 + Math.sin(frame * 0.2) * 0.1; ctx.fillStyle = g; ctx.fillRect(x - 16, y - 16, 32, 32); ctx.globalAlpha = 1;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = col; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText({ ghost: 'G', slow: 'S', magnet: 'M', double: 'x2' }[power.kind], x, y + 3);
  }
  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var board = BOARDS[room % BOARDS.length];
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.fillStyle = board.bg;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    // Parlor floor tiles in this room's ink, grout lines, the sign's glow
    ctx.fillStyle = board.chk;
    for (var y = 0; y < ROWS; y++) {
      for (var x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(gx * CELL + 0.5, 0); ctx.lineTo(gx * CELL + 0.5, H); }
    for (var gy = 0; gy <= ROWS; gy++) { ctx.moveTo(0, gy * CELL + 0.5); ctx.lineTo(W, gy * CELL + 0.5); }
    ctx.stroke();
    var lit = transT > 0 ? 1 - transT / 70 : 1;
    drawFloorGlow(board, (1 + Math.sin(frame * 0.05) * 0.3) * lit);
    // a slow light sweep, like a sign flickering across a wet floor
    var sweep = ((frame * 0.7) % (W + 200)) - 100;
    var sg = ctx.createLinearGradient(sweep - 60, 0, sweep + 60, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.025)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    // wrap rooms: the side edges are open, painted as doorways
    if (roomDef.wrap) {
      ctx.fillStyle = 'rgba(127,255,0,0.06)';
      for (var wy = 0; wy < ROWS; wy++) if (!isWall(0, wy)) { ctx.fillRect(0, wy * CELL, 3, CELL); }
      for (var wy2 = 0; wy2 < ROWS; wy2++) if (!isWall(COLS - 1, wy2)) { ctx.fillRect(W - 3, wy2 * CELL, 3, CELL); }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('LUMENATI TATTOO', W - 8, H - 8);

    if (frenzyT > 0) {
      ctx.fillStyle = 'rgba(255,99,71,' + (0.04 + Math.abs(Math.sin(frame * 0.1)) * 0.05).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      var eg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.8);
      eg.addColorStop(0, 'rgba(255,99,71,0)'); eg.addColorStop(1, 'rgba(255,99,71,' + (0.18 + Math.sin(frame * 0.2) * 0.06).toFixed(2) + ')');
      ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
    }
    if (active && active.kind === 'ghost') {
      var gg2 = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      gg2.addColorStop(0, 'rgba(0,255,255,0)'); gg2.addColorStop(1, 'rgba(0,255,255,0.12)');
      ctx.fillStyle = gg2; ctx.fillRect(0, 0, W, H);
    }

    drawWalls(board);
    drawDoor(board);

    // The mop lane: painted wet so the hazard reads before it arrives
    if (mop) {
      var lane = mop.y * CELL;
      ctx.fillStyle = 'rgba(143,179,201,0.07)';
      ctx.fillRect(0, lane, W, CELL);
      ctx.strokeStyle = 'rgba(143,179,201,0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, lane + 0.5); ctx.lineTo(W, lane + 0.5); ctx.moveTo(0, lane + CELL - 0.5); ctx.lineTo(W, lane + CELL - 0.5); ctx.stroke();
      ctx.setLineDash([]);
      var mp = mop.tick % 2 === 0 ? 1 : 0.5;
      var mx = (mop.x + mop.dx * 0.5 * mp) * CELL + 10, my = lane + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(mx, my + 8, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5b6f7c';
      ctx.fillRect(mx - 7, my - 2, 14, 10);
      ctx.fillStyle = '#8fb3c9';
      ctx.fillRect(mx - 7, my - 4, 14, 3);
      ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx + mop.dx * 6, my - 2); ctx.lineTo(mx + mop.dx * 12, my - 16); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#e8e2d0';
      for (var s = -3; s <= 3; s += 2) ctx.fillRect(mx + mop.dx * 8 + s, my - 1 + Math.abs(s), 2, 6 + Math.sin(frame * 0.4 + s) * 2);
      ctx.fillStyle = 'rgba(143,179,201,0.4)';
      ctx.beginPath(); ctx.ellipse(mx + mop.dx * 9, my + 6, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Ink trail behind the head
    for (var ti = 0; ti < trail.length; ti++) {
      var tr = trail[ti];
      ctx.globalAlpha = (tr.life / 30) * 0.22;
      ctx.fillStyle = active && active.kind === 'ghost' ? CYAN : LIME;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 5 * (tr.life / 30) + 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Food: a fat ink drop; the live ones jitter and sprout legs
    var lookAt = null;
    if (food) {
      var fx = food.x * CELL + 10, fy = food.y * CELL + 10;
      if (food.live) { fx += Math.sin(frame * 0.5) * 1.5; fy += Math.cos(frame * 0.7) * 1; }
      if (active && active.kind === 'magnet') { ctx.strokeStyle = 'rgba(255,159,64,0.3)'; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(snake[0].x * CELL + 10, snake[0].y * CELL + 10); ctx.stroke(); ctx.setLineDash([]); }
      drawDrop(fx, fy, food.live, food.risky);
      lookAt = { x: fx, y: fy };
    }

    // Gold ink: rare, bright, gone fast
    if (gold && (goldT > 60 || Math.floor(frame / 4) % 2 === 0)) {
      var gx2 = gold.x * CELL + 10, gy2 = gold.y * CELL + 10;
      var gr = 6 + Math.sin(frame * 0.25) * 1.5;
      var gg = ctx.createRadialGradient(gx2, gy2, 1, gx2, gy2, 16);
      gg.addColorStop(0, 'rgba(255,215,0,0.45)'); gg.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.fillStyle = gg; ctx.fillRect(gx2 - 16, gy2 - 16, 32, 32);
      ctx.fillStyle = YELLOW;
      ctx.beginPath(); ctx.arc(gx2, gy2 + 2, gr, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(gx2, gy2 - 8); ctx.lineTo(gx2 + 5, gy2); ctx.lineTo(gx2 - 5, gy2); ctx.fill();
      ctx.fillStyle = '#fff';
      var sa = frame * 0.2;
      ctx.fillRect(gx2 + Math.cos(sa) * 9 - 1, gy2 + Math.sin(sa) * 9 - 1, 2, 2);
      ctx.fillRect(gx2 - Math.cos(sa) * 9 - 1, gy2 - Math.sin(sa) * 9 - 1, 2, 2);
      ctx.beginPath(); ctx.arc(gx2 - 2, gy2, 1.7, 0, Math.PI * 2); ctx.fill();
    }

    // Stencil sheet: a slip of paper that trims the serpent
    if (stencil && (stencilT > 90 || Math.floor(frame / 5) % 2 === 0)) {
      var sx0 = stencil.x * CELL + 3, sy0 = stencil.y * CELL + 3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx0 + 2, sy0 + 2, 14, 14);
      ctx.fillStyle = '#e9f6ff'; ctx.fillRect(sx0, sy0, 14, 14);
      ctx.strokeStyle = CYAN;
      ctx.beginPath(); ctx.arc(sx0 + 7, sy0 + 7, 4, 0, Math.PI * 2); ctx.moveTo(sx0 + 3, sy0 + 11); ctx.lineTo(sx0 + 11, sy0 + 3); ctx.stroke();
      ctx.fillStyle = '#8bd7e6'; ctx.fillRect(sx0 + 10, sy0, 4, 4);
    }

    // Bonus: a tattoo machine with a running needle, blinking as it expires
    if (bonus && (bonusT > 90 || Math.floor(frame / 5) % 2 === 0)) {
      var bx = bonus.x * CELL + 5, by = bonus.y * CELL + 1;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 1, by + 4, 10, 14);
      ctx.fillStyle = PURPLE;
      ctx.fillRect(bx, by + 2, 10, 10);
      ctx.fillStyle = '#c4a4ff'; ctx.fillRect(bx + 1, by + 3, 3, 2);
      ctx.fillStyle = '#8B5CF6';
      ctx.fillRect(bx + 2, by + 12, 6, 4);
      ctx.fillStyle = '#ccc';
      ctx.fillRect(bx + 4, by + 16 + (frame % 4 < 2 ? 1 : 0), 2, 3);
      ctx.fillStyle = PINK;
      ctx.fillRect(bx + 1, by, 3, 3);
      ctx.fillRect(bx + 6, by, 3, 3);
      ctx.strokeStyle = 'rgba(155,89,182,' + (0.3 + Math.sin(frame * 0.3) * 0.2).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(bx + 5, by + 9, 12, 0, Math.PI * 2); ctx.stroke();
    }

    drawPower();

    // Dried ink blots: marked hazards with a loud spawn warning
    for (var i = 0; i < blots.length; i++) {
      var bl = blots[i];
      var bx2 = bl.x * CELL + 10, by2 = bl.y * CELL + 10;
      var age = frame - (bl.born || 0);
      if (age < 70) {
        var wr = 12 - (age / 70) * 3;
        ctx.strokeStyle = Math.floor(frame / 5) % 2 === 0 ? '#ff5040' : 'rgba(255,80,64,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx2, by2, wr, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = '#2a0c22';
      ctx.beginPath(); ctx.arc(bx2, by2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx2 + Math.cos(bl.r) * 6, by2 + Math.sin(bl.r) * 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx2 - Math.cos(bl.r) * 5, by2 - Math.sin(bl.r) * 7, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(bx2 - 2, by2 - 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,64,0.85)';
      ctx.beginPath(); ctx.arc(bx2, by2, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff5040';
      ctx.beginPath();
      ctx.moveTo(bx2 - 3, by2 - 3); ctx.lineTo(bx2 + 3, by2 + 3);
      ctx.moveTo(bx2 + 3, by2 - 3); ctx.lineTo(bx2 - 3, by2 + 3);
      ctx.stroke();
    }

    drawCat();
    drawClient();
    drawRival();

    // The serpent (a ghost while ghost ink runs)
    var blink = respawnT > 0 && Math.floor(frame / 4) % 2 === 0;
    if (active && active.kind === 'ghost') ctx.globalAlpha = 0.55 + Math.sin(frame * 0.3) * 0.15;
    drawSerpent(serpentPoints(), dir, 9, blink, lookAt);
    ctx.globalAlpha = 1;

    // Ink particles
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 14);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The lights come up on a new room
    if (transT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + (transT / 70 * 0.85).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      if (transT % 14 < 7 && transT > 30) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, W, H); }
    }

    // Hit flash
    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + (flashT / 40).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // Score popups: pop in big, drift up, fade
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      var pu = popups[i];
      var age2 = frame - (pu.born || 0);
      var sz = age2 < 6 ? 11 + (6 - age2) * 1.2 : 11;
      ctx.font = 'bold ' + Math.round(sz) + 'px monospace';
      ctx.globalAlpha = Math.min(1, pu.life / 18);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(pu.text, pu.x + 1, pu.y + 1);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y);
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, 32);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 8, 26);
    ctx.fillStyle = board.accent;
    ctx.textAlign = 'right';
    ctx.fillText('ROOM ' + level + ' // ' + roomDef.name, W - 8, 14);
    ctx.fillStyle = doorOpen ? LIME : 'rgba(255,255,255,0.5)';
    ctx.fillText((doorOpen ? 'DOOR OPEN' : 'GOAL ' + roomEaten + '/' + roomDef.goal) + ' // LEN ' + snake.length + ' // ' + baseDrop() + '/DROP', W - 8, 26);
    // Feast meter: the streak and how long it has left, front and center
    var left = mode === 'play' ? Math.max(0, FEAST_WINDOW - (frame - lastEat)) : 0;
    if (eatStreak > 0 && left > 0) {
      var mw = 120, mx0 = W / 2 - mw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(mx0 - 2, 6, mw + 4, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(mx0, 20, mw, 4);
      ctx.fillStyle = frenzyT > 0 ? '#FF6347' : eatStreak >= 5 ? YELLOW : eatStreak >= 3 ? '#ffb347' : '#fff';
      ctx.fillRect(mx0, 20, mw * (left / FEAST_WINDOW), 4);
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(frenzyT > 0 ? 'FRENZY 2X // ' + Math.ceil(frenzyT / 60) + 's' : eatStreak >= 5 ? 'FEAST x5 // MAX' : 'FEAST x' + eatStreak, W / 2, 16);
    } else if (frenzyT > 0 && mode === 'play') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FF6347';
      ctx.fillText('FRENZY 2X // ' + Math.ceil(frenzyT / 60) + 's', W / 2, 16);
    }
    // Active power: name and a draining bar under the HUD strip
    if (active) {
      var aw = 100, ax = W / 2 - aw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(ax - 4, 34, aw + 8, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(ax, 43, aw, 3);
      ctx.fillStyle = POWER_COLOR[active.kind]; ctx.fillRect(ax, 43, aw * (active.t / 360), 3);
      ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(POWER_NAME[active.kind], W / 2, 41);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, H / 2 - 52, W, 40);
      ctx.fillStyle = bannerColor || board.accent;
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 26);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }
    ctx.restore();

    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();
  }

  // Fixed-step loop on requestAnimationFrame
  var rafId = null, lastT = 0, acc = 0;
  function startLoop() {
    if (rafId === null) {
      lastT = 0; acc = 0;
      rafId = requestAnimationFrame(loop);
    }
  }
  function loop(t) {
    if (!window.skateRunning) { rafId = null; return; }
    if (!lastT) lastT = t;
    acc += Math.min(100, t - lastT);
    lastT = t;
    try {
    while (acc >= 16.67) {
      if (mode === 'play') update();
      else {
        frame++; musicTick();
        // attract cycle: power-on, title scene, then the wall, then the title again
        if (mode === 'intro' && ++introT > 525) introT = 70;
        if (shake > 0) shake--;
      }
      acc -= 16.67;
    }
    draw();
    } catch (err) {
      window.__arcadeError = String((err && err.stack) || err);
      acc = 0;
      try { console.error('arcade error', err); } catch (e2) {}
    }
    rafId = requestAnimationFrame(loop);
  }

  var obs = new MutationObserver(function() {
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-snake', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
