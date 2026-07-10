(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 400, H = 320;

  // SFX
  var sfxCtx;
  function getSfx() { if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); return sfxCtx; }
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
  function sfxHop() { playSfx(500, 0.05, 'square', 0.08); }
  function sfxDoor() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(1000, 0.12, 'square', 0.12);}, 90); }
  function sfxWave() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
  function sfxHit() { playSfx(150, 0.3, 'sawtooth', 0.15); }
  function sfxSiren() { playSfx(900, 0.18, 'square', 0.1); setTimeout(function(){playSfx(650, 0.18, 'square', 0.1);}, 180); setTimeout(function(){playSfx(900, 0.18, 'square', 0.1);}, 360); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF';
  var CELL = 40, COLS = 10;
  // Rows top to bottom: 0 shop, 1-3 traffic, 4 median, 5-6 traffic, 7 start
  var ROW_Y = [0, 40, 80, 120, 160, 200, 240, 280];
  var DOOR_COLS = [2, 5, 8];
  var LANE_DIRS = { 1: 1, 2: -1, 3: 1, 5: -1, 6: 1 };
  var CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22'];

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, wave, frame;
  var player, lanes, doors, invuln, hopT;
  var patience, patienceMax, amb, bannerT, bannerText, bestRow;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-frogger') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-frogger', String(best)); } catch(e) {} }
  }

  function makeLanes() {
    // {row, dir, speed, cars: [{x}], w} — later nights squeeze in extra cars
    var defs = [
      { row: 1, dir: 1,  speed: 1.5, n: 2, w: 64 },
      { row: 2, dir: -1, speed: 2.2, n: 3, w: 52 },
      { row: 3, dir: 1,  speed: 1.1, n: 2, w: 88 }, // the slow bus
      { row: 5, dir: -1, speed: 1.8, n: 3, w: 52 },
      { row: 6, dir: 1,  speed: 2.6, n: 2, w: 56 }
    ];
    lanes = [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var n = d.n;
      if (wave >= 2 && d.n === 2) n++;
      if (wave >= 4 && d.n === 3) n++;
      n = Math.min(4, n);
      var cars = [];
      var spacing = (W + d.w + 60) / n;
      for (var j = 0; j < n; j++) {
        cars.push({ x: j * spacing + Math.random() * 40, color: CAR_COLORS[(i * 2 + j) % CAR_COLORS.length] });
      }
      lanes.push({ row: d.row, dir: d.dir, speed: d.speed, w: d.w, cars: cars });
    }
  }

  function resetPlayer() {
    player = { col: 4, row: 7 };
    hopT = 0;
    bestRow = 7;
    patienceMax = Math.max(480, 720 - (wave - 1) * 60);
    patience = patienceMax;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; wave = 1; frame = 0; invuln = 0; mode = 'intro'; introT = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    doors = [false, false, false];
    amb = null; bannerT = 0; bannerText = '';
    makeLanes();
    resetPlayer();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'Arrows or tap to hop // fill all 3 chairs';
    window.skateRunning = true;
    startLoop();
  }

  function die() {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    sfxHit();
    if (lives <= 0) {
      mode = 'over';
      saveBest();
      sfxGameOver();
    } else {
      resetPlayer();
      invuln = 60;
    }
  }

  function hop(dx, dy) {
    if (mode !== 'play') return;
    var nc = player.col + dx, nr = player.row + dy;
    if (nc < 0 || nc >= COLS || nr > 7) return;
    if (nr < 1 && dy < 0) {
      // Stepping into the shop only works through an open door
      var d = DOOR_COLS.indexOf(player.col);
      if (dx === 0 && d !== -1 && !doors[d]) {
        doors[d] = true;
        score += 100;
        document.getElementById('jd-br-score').textContent = score;
        sfxDoor();
        if (doors[0] && doors[1] && doors[2]) {
          score += 250;
          document.getElementById('jd-br-score').textContent = score;
          doors = [false, false, false];
          wave++;
          bannerT = 100;
          bannerText = 'NIGHT ' + wave;
          makeLanes();
          amb = null;
          sfxWave();
        }
        resetPlayer();
      }
      return;
    }
    if (nr < 1) return;
    player.col = nc;
    player.row = nr;
    if (nr < bestRow) {
      bestRow = nr;
      score += 10;
      document.getElementById('jd-br-score').textContent = score;
    }
    hopT = 6;
    sfxHop();
  }

  function update() {
    frame++;
    if (invuln > 0) invuln--;
    if (hopT > 0) hopT--;
    if (bannerT > 0) bannerT--;

    // The client is only patient for so long
    if (invuln === 0) patience--;
    if (patience <= 0) {
      bannerT = 70;
      bannerText = 'COLD FEET!';
      die();
      return;
    }

    // Ambulance: night 2+, a warning flash then a streak down one lane
    if (wave >= 2 && !amb && frame % 540 === 200) {
      var laneRows = [1, 2, 3, 5, 6];
      var row = laneRows[Math.floor(Math.random() * laneRows.length)];
      var dir = LANE_DIRS[row];
      amb = { row: row, dir: dir, x: dir > 0 ? -90 : W + 90, warnT: 55 };
      sfxSiren();
    }
    if (amb) {
      if (amb.warnT > 0) {
        amb.warnT--;
      } else {
        amb.x += amb.dir * 6.5;
        if (amb.x < -120 || amb.x > W + 120) amb = null;
        if (amb && invuln === 0 && amb.row === player.row) {
          var apx = player.col * CELL + 13;
          if (apx + 14 > amb.x && apx < amb.x + 70) {
            die();
            return;
          }
        }
      }
    }

    var mult = 1 + (wave - 1) * 0.18;
    for (var i = 0; i < lanes.length; i++) {
      var ln = lanes[i];
      for (var j = 0; j < ln.cars.length; j++) {
        var car = ln.cars[j];
        car.x += ln.dir * ln.speed * mult;
        if (ln.dir > 0 && car.x > W + 40) car.x = -ln.w - 40;
        if (ln.dir < 0 && car.x < -ln.w - 40) car.x = W + 40;
      }
      // Collision on the player's row — hitbox matches the drawn sprite, a
      // touch forgiving, so near-misses feel like near-misses
      if (invuln === 0 && ln.row === player.row) {
        var px = player.col * CELL + 13, pw = 14;
        var py = ROW_Y[player.row] + 6;
        for (var j = 0; j < ln.cars.length; j++) {
          var car = ln.cars[j];
          if (px + pw > car.x && px < car.x + ln.w) {
            die();
            return;
          }
        }
      }
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'ready'; return; }
    if (mode === 'over') { init(); mode = 'play'; return; }
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
      if (e.repeat) return;
      start();
      hop(k[0], k[1]);
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) start();
    }
  });
  // Touch: tap where you want to go, relative to the client
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode !== 'play') { start(); return; }
    var r = canvas.getBoundingClientRect();
    var tx = (e.touches[0].clientX - r.left) * (W / r.width);
    var ty = (e.touches[0].clientY - r.top) * (H / r.height);
    var px = player.col * CELL + CELL / 2;
    var py = ROW_Y[player.row] + CELL / 2;
    var dx = tx - px, dy = ty - py;
    if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0);
    else hop(0, dy > 0 ? 1 : -1);
  }, { passive: false });
  canvas.addEventListener('click', function(e) {
    if (mode !== 'play') { start(); return; }
    var r = canvas.getBoundingClientRect();
    var tx = (e.clientX - r.left) * (W / r.width);
    var ty = (e.clientY - r.top) * (H / r.height);
    var px = player.col * CELL + CELL / 2;
    var py = ROW_Y[player.row] + CELL / 2;
    var dx = tx - px, dy = ty - py;
    if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0);
    else hop(0, dy > 0 ? 1 : -1);
  });

  function drawCar(x, y, w, color, dir) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 8, w, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y + 8, w, 3);
    // Cabin windows
    ctx.fillStyle = '#bde';
    if (w > 70) {
      for (var wx = x + 6; wx < x + w - 10; wx += 14) ctx.fillRect(wx, y + 11, 8, 6);
    } else {
      ctx.fillRect(dir > 0 ? x + w - 22 : x + 8, y + 11, 14, 7);
    }
    // Wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 4, y + 26, 10, 5);
    ctx.fillRect(x + w - 14, y + 26, 10, 5);
    // Headlight
    ctx.fillStyle = YELLOW;
    ctx.fillRect(dir > 0 ? x + w - 3 : x, y + 12, 3, 4);
  }

  // ── Attract-mode intro: CRT power-on, studio card, then the title scene ──
  function drawIntro() {
    var t = introT;
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
    ctx.fillStyle = '#1c1c24'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3c3c46'; ctx.fillRect(0, 150, W, 30); ctx.fillRect(0, 280, W, 40);
    var c1 = (t2 * 5.4) % (W + 160) - 80;
    var c2 = W + 80 - (t2 * 4.2) % (W + 160);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(c1, 196, 60, 20);
    ctx.fillStyle = '#111'; ctx.fillRect(c1 + 5, 214, 10, 4); ctx.fillRect(c1 + 45, 214, 10, 4);
    ctx.fillStyle = '#3498db'; ctx.fillRect(c2, 236, 56, 20);
    ctx.fillStyle = '#111'; ctx.fillRect(c2 + 5, 254, 10, 4); ctx.fillRect(c2 + 41, 254, 10, 4);
    var hopRow = Math.min(3, Math.floor(t2 / 45));
    var hopB = Math.abs(Math.sin(t2 * 0.14)) * 4;
    var cyy = 296 - hopRow * 42 - hopB;
    ctx.fillStyle = PINK; ctx.fillRect(W / 2 - 6, cyy - 16, 12, 4);
    ctx.fillStyle = '#f0c8a0'; ctx.fillRect(W / 2 - 5, cyy - 13, 10, 7);
    ctx.fillStyle = '#222'; ctx.fillRect(W / 2 - 6, cyy - 5, 12, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 + 2, cyy - 3, 6, 8);
    var neonOn = Math.random() > 0.12 || t2 > 60;
    if (neonOn) slam('WALK-IN', 96, 34, LIME);
    if (t2 > 130) { ctx.fillStyle = PINK; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('GET THEM TO THE CHAIR', W / 2, 126); }
    if (t2 > 60 && Math.floor(t2 / 25) % 2 === 0) {
      ctx.fillStyle = '#9aa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TAP OR SPACE TO SKIP', W / 2, H - 8);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    // Road base
    ctx.fillStyle = '#1c1c24';
    ctx.fillRect(0, 0, W, H);

    // Shop row
    ctx.fillStyle = '#2a1a2e';
    ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#3a2440';
    ctx.fillRect(0, 34, W, 6);
    // Neon sign
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = Math.floor(frame / 30) % 2 === 0 ? PINK : '#c8006e';
    ctx.fillText('* TATTOO *', W / 2, 14);
    // Doors
    for (var i = 0; i < 3; i++) {
      var dx = DOOR_COLS[i] * CELL + 4;
      ctx.fillStyle = doors[i] ? '#0a0a0a' : '#171720';
      ctx.fillRect(dx, 18, CELL - 8, 22);
      ctx.fillStyle = doors[i] ? LIME : PINK;
      ctx.fillRect(dx, 18, CELL - 8, 2);
      if (doors[i]) {
        // A happy client already inside
        ctx.fillStyle = LIME;
        ctx.fillRect(dx + 12, 24, 8, 12);
        ctx.fillRect(dx + 14, 20, 4, 4);
      } else {
        ctx.fillStyle = 'rgba(255,20,147,0.6)';
        ctx.font = '9px monospace';
        ctx.fillText('OPEN', dx + CELL / 2 - 4, 32);
        ctx.font = 'bold 12px monospace';
      }
    }

    // Median + start sidewalks
    ctx.fillStyle = '#3c3c46';
    ctx.fillRect(0, ROW_Y[4], W, CELL);
    ctx.fillRect(0, ROW_Y[7], W, CELL);
    ctx.fillStyle = '#4a4a55';
    for (var x = 0; x < W; x += 20) {
      ctx.fillRect(x, ROW_Y[4], 1, CELL);
      ctx.fillRect(x, ROW_Y[7], 1, CELL);
    }

    // Lane dashes
    ctx.fillStyle = '#5a5a30';
    var laneRows = [1, 2, 3, 5, 6];
    for (var i = 0; i < laneRows.length; i++) {
      var y = ROW_Y[laneRows[i]];
      if (laneRows[i] !== 3 && laneRows[i] !== 6) {
        for (var x = 0; x < W; x += 40) ctx.fillRect(x + 10, y + 38, 20, 3);
      }
    }

    // Median decoration: the shop's flash rack
    ctx.fillStyle = '#2a2a34';
    ctx.fillRect(8, ROW_Y[4] + 8, 60, 24);
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = [PINK, YELLOW, CYAN, LIME][i];
      ctx.fillRect(12 + i * 14, ROW_Y[4] + 11, 10, 13);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(15 + i * 14, ROW_Y[4] + 14, 4, 5);
    }
    ctx.fillStyle = '#9aa';
    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FLASH $40', 12, ROW_Y[4] + 38);

    // Ambulance warning: the lane flashes before it streaks through
    if (amb && amb.warnT > 0 && Math.floor(frame / 5) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,40,40,0.18)';
      ctx.fillRect(0, ROW_Y[amb.row], W, CELL);
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = amb.dir > 0 ? 'left' : 'right';
      ctx.fillText('!!', amb.dir > 0 ? 4 : W - 4, ROW_Y[amb.row] + 24);
    }

    // Cars
    for (var i = 0; i < lanes.length; i++) {
      var ln = lanes[i];
      for (var j = 0; j < ln.cars.length; j++) {
        drawCar(ln.cars[j].x, ROW_Y[ln.row], ln.w, ln.cars[j].color, ln.dir);
      }
    }

    // Ambulance
    if (amb && amb.warnT === 0) {
      var ay = ROW_Y[amb.row];
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(amb.x, ay + 6, 70, 24);
      ctx.fillStyle = '#dd2222';
      ctx.fillRect(amb.x, ay + 16, 70, 5);
      ctx.fillStyle = '#bde';
      ctx.fillRect(amb.dir > 0 ? amb.x + 50 : amb.x + 6, ay + 9, 14, 8);
      ctx.fillStyle = Math.floor(frame / 4) % 2 === 0 ? '#ff2222' : '#2266ff';
      ctx.fillRect(amb.x + 30, ay + 2, 10, 5);
      ctx.fillStyle = '#111';
      ctx.fillRect(amb.x + 6, ay + 28, 12, 5);
      ctx.fillRect(amb.x + 52, ay + 28, 12, 5);
    }

    // Player: the walk-in client (pink-haired, clutching a flash printout)
    var blink = invuln > 0 && Math.floor(frame / 4) % 2 === 0;
    if (!blink && mode !== 'over') {
      var px = player.col * CELL + CELL / 2;
      var py = ROW_Y[player.row] + CELL / 2 + (hopT > 0 ? -4 : 0);
      ctx.fillStyle = '#f0c8a0';
      ctx.fillRect(px - 5, py - 14, 10, 8); // head
      ctx.fillStyle = PINK;
      ctx.fillRect(px - 6, py - 16, 12, 4); // hair
      ctx.fillStyle = '#222';
      ctx.fillRect(px - 6, py - 6, 12, 12); // body
      ctx.fillStyle = '#fff';
      ctx.fillRect(px + 2, py - 4, 6, 8); // the flash printout
      ctx.fillStyle = '#f0c8a0';
      ctx.fillRect(px - 5, py + 6, 3, 6);
      ctx.fillRect(px + 2, py + 6, 3, 6);
    }

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 12);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 100, 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = YELLOW;
    ctx.fillText('NIGHT ' + wave, W - 8, 12);
    // Client patience: the walk-in walks if you dawdle
    if (mode === 'play') {
      var pr = Math.max(0, patience / patienceMax);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(W / 2 - 40, 5, 80, 5);
      ctx.fillStyle = pr > 0.35 ? LIME : (Math.floor(frame / 6) % 2 === 0 ? '#ff4444' : '#992222');
      ctx.fillRect(W / 2 - 40, 5, 80 * pr, 5);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerText === 'COLD FEET!' ? '#ff4444' : LIME;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 30);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PINK;
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Score: ' + score, W / 2, H / 2 + 5);
      ctx.fillStyle = score >= best && score > 0 ? YELLOW : '#9aa';
      ctx.font = '12px monospace';
      ctx.fillText(score >= best && score > 0 ? 'NEW BEST!' : 'Best: ' + best, W / 2, H / 2 + 25);
      ctx.fillStyle = YELLOW;
      ctx.fillText('SPACE or TAP to cross again', W / 2, H / 2 + 48);
    }

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WALK-IN', W / 2, H / 2 - 42);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('ARROWS to hop, or TAP a direction', W / 2, H / 2 - 8);
      ctx.fillStyle = PINK;
      ctx.fillText('Get the client through an OPEN door +100', W / 2, H / 2 + 10);
      ctx.fillStyle = CYAN;
      ctx.fillText('Fill all 3 chairs to survive the night +250', W / 2, H / 2 + 28);
      ctx.fillStyle = '#ff4444';
      ctx.fillText('Beat their cold feet // dodge the ambulance', W / 2, H / 2 + 46);
      ctx.fillStyle = YELLOW;
      ctx.fillText('Nights get meaner // Best: ' + best, W / 2, H / 2 + 64);
    }
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
    while (acc >= 16.67) {
      if (mode === 'play') update();
      else { frame++; if (mode === 'intro' && ++introT > 285) mode = 'ready'; }
      acc -= 16.67;
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  var obs = new MutationObserver(function() {
    if (document.getElementById('jd-game-overlay').style.display === 'flex') init();
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
