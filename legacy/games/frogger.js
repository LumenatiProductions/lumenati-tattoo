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
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF';
  var CELL = 40, COLS = 10;
  // Rows top to bottom: 0 shop, 1-3 traffic, 4 median, 5-6 traffic, 7 start
  var ROW_Y = [0, 40, 80, 120, 160, 200, 240, 280];
  var DOOR_COLS = [2, 5, 8];
  var CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22'];

  var mode = 'ready'; // ready | play | over
  var score, lives, wave, frame;
  var player, lanes, doors, invuln, hopT;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-frogger') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-frogger', String(best)); } catch(e) {} }
  }

  function makeLanes() {
    // {row, dir, speed, cars: [{x}], w}
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
      var cars = [];
      var spacing = (W + d.w + 60) / d.n;
      for (var j = 0; j < d.n; j++) {
        cars.push({ x: j * spacing + Math.random() * 40, color: CAR_COLORS[(i * 2 + j) % CAR_COLORS.length] });
      }
      lanes.push({ row: d.row, dir: d.dir, speed: d.speed, w: d.w, cars: cars });
    }
  }

  function resetPlayer() {
    player = { col: 4, row: 7 };
    hopT = 0;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; wave = 1; frame = 0; invuln = 0; mode = 'ready';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    doors = [false, false, false];
    makeLanes();
    resetPlayer();
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
          sfxWave();
        }
        resetPlayer();
      }
      return;
    }
    if (nr < 1) return;
    player.col = nc;
    player.row = nr;
    hopT = 6;
    sfxHop();
  }

  function update() {
    frame++;
    if (invuln > 0) invuln--;
    if (hopT > 0) hopT--;

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

  function draw() {
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

    // Cars
    for (var i = 0; i < lanes.length; i++) {
      var ln = lanes[i];
      for (var j = 0; j < ln.cars.length; j++) {
        drawCar(ln.cars[j].x, ROW_Y[ln.row], ln.w, ln.cars[j].color, ln.dir);
      }
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
      ctx.fillStyle = YELLOW;
      ctx.fillText('Best: ' + best, W / 2, H / 2 + 46);
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
      else frame++;
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
