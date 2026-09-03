(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 400, H = 320;

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
  function sfxHop() { playSfx(500, 0.05, 'square', 0.08); }
  function sfxDoor() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(1000, 0.12, 'square', 0.12);}, 90); }
  function sfxWave() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
  function sfxHit() { playSfx(150, 0.3, 'sawtooth', 0.15); }
  function sfxSiren() { playSfx(900, 0.18, 'square', 0.1); setTimeout(function(){playSfx(650, 0.18, 'square', 0.1);}, 180); setTimeout(function(){playSfx(900, 0.18, 'square', 0.1);}, 360); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }


  // Announcer: this game's own voice; rooms work fine without the clips
  var VOICE_CACHE = {};
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
  var calloutCd = 0;
  function sayCallout(name) {
    if (calloutCd > 0) return;
    calloutCd = 480;
    say(name);
  }

  // ── This game's own chiptune: frantic crosswalk shuffle ──
  var SONGS = [
    { root: 146.83, bass: [0,3,0,3, 5,3,5,3, 0,3,0,3, 7,5,3,0],       lead: [12,-1,15,12, 17,-1,15,-1, 12,-1,15,17, 19,17,15,12] },
    { root: 155.56, bass: [0,-1,5,0, -1,5,0,-1, 3,-1,7,3, -1,7,5,3],   lead: [15,17,-1,15, 12,-1,17,-1, 15,17,-1,19, 22,19,17,15] },
  ];
  var MENU_SONG = { root: 146.83, bass: [0,0,7,0, 5,5,9,5, 0,0,7,0, 8,7,5,3], lead: [12,-1,16,12, -1,17,16,-1, 12,-1,16,19, 21,19,16,12] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 11 : Math.max(9, 15 - wave);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(wave - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.045);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.026);
    if (musicStep % 4 === 0) playSfx(65, 0.08, 'sawtooth', 0.04);
    if (musicStep % 8 === 4) playSfx(210, 0.04, 'sawtooth', 0.026);
    if (musicStep % 2 === 1) playSfx(1900, 0.014, 'square', 0.011);
  }
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }


  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', ORANGE = '#ff8c1a';
  var CELL = 40, COLS = 10;
  // Rows top to bottom: 0 shop, 1-3 traffic, 4 median, 5-6 traffic, 7 start
  var ROW_Y = [0, 40, 80, 120, 160, 200, 240, 280];
  var DOOR_COLS = [2, 5, 8];
  var LANE_ROWS = [1, 2, 3, 5, 6];
  var LANE_DIRS = { 1: 1, 2: -1, 3: 1, 5: -1, 6: 1 };
  var CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22'];

  // Every night has its own weather and light. Rush hour lands every third
  // night: faster lanes, one more car in each, and the streets are wet.
  var NIGHTS = [
    { name: 'NIGHT', tint: 'rgba(20,30,90,0.10)', lamp: 'rgba(255,220,150,0.16)', sky: '#1c1c24' },
    { name: 'LATE NIGHT', tint: 'rgba(90,20,130,0.14)', lamp: 'rgba(255,200,230,0.14)', sky: '#1a1520' },
    { name: 'DUSK', tint: 'rgba(255,120,40,0.10)', lamp: 'rgba(255,210,150,0.10)', sky: '#241c1c' },
    { name: 'RAIN', tint: 'rgba(40,90,140,0.18)', lamp: 'rgba(200,230,255,0.16)', sky: '#161c24', rain: true },
  ];
  function nightOf(w) { return NIGHTS[(w - 1) % NIGHTS.length]; }
  function isRush(w) { return w % 3 === 0; }

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, wave, frame;
  var player, lanes, doors, invuln, hopT;
  var patience, patienceMax, amb, bannerT, bannerText, bannerColor, bestRow;
  var streak, popups, parts, shake, pickup, pickupCd, slicks, stats, dieFlash;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-frogger') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-frogger', String(best)); } catch(e) {} }
  }

  // The streak multiplier: chairs filled in a row without getting flattened.
  // x1, x1.5, x2 ... up to x4. Dying resets it.
  function mult() { return Math.min(4, 1 + streak * 0.5); }
  function fmtMult() { var m = mult(); return 'x' + (m % 1 === 0 ? m : m.toFixed(1)); }
  function award(pts, x, y, label, color) {
    score += pts;
    document.getElementById('jd-br-score').textContent = score;
    addPopup(x, y, (label ? label + ' ' : '') + '+' + pts, color || '#fff');
  }
  function addPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 55 });
  }
  function burst(x, y, n, color, spread, gravity) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * (spread || 2.4);
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8, life: 24 + Math.random() * 26, color: color, s: 1 + Math.random() * 2, g: gravity === undefined ? 0.08 : gravity, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
  }

  function makeLanes() {
    // Lane recipes: {row, dir, speed, n, w, kind}. Later nights swap in
    // supply carts (small, quick) and delivery scooters (smaller, quicker),
    // squeeze in extra traffic, and rush hour pushes everything harder.
    var defs = [
      { row: 1, dir: 1,  speed: 1.5, n: 2, w: 64, kind: 'car' },
      { row: 2, dir: -1, speed: 2.2, n: 3, w: 52, kind: 'car' },
      { row: 3, dir: 1,  speed: 1.1, n: 2, w: 88, kind: 'bus' }, // the slow bus
      { row: 5, dir: -1, speed: 1.8, n: 3, w: 52, kind: 'car' },
      { row: 6, dir: 1,  speed: 2.6, n: 2, w: 56, kind: 'car' }
    ];
    if (wave >= 3) defs[3] = { row: 5, dir: -1, speed: 2.4, n: 4, w: 34, kind: 'cart' };
    if (wave >= 4) defs[0] = { row: 1, dir: 1, speed: 3.1, n: 3, w: 30, kind: 'scooter' };
    if (wave >= 6) defs[4] = { row: 6, dir: 1, speed: 3.0, n: 3, w: 30, kind: 'scooter' };
    lanes = [];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var n = d.n;
      if (wave >= 2 && d.n === 2) n++;
      if (wave >= 5 && d.kind === 'car') n++;
      if (isRush(wave)) n++;
      n = Math.min(d.kind === 'bus' ? 3 : 5, n);
      var cars = [];
      var spacing = (W + d.w + 60) / n;
      for (var j = 0; j < n; j++) {
        cars.push({ x: j * spacing + Math.random() * 40, color: CAR_COLORS[(i * 2 + j + wave) % CAR_COLORS.length], taxi: d.kind === 'car' && Math.random() < 0.18, nm: false, wob: Math.random() * 6 });
      }
      lanes.push({ row: d.row, dir: d.dir, speed: d.speed * (isRush(wave) ? 1.25 : 1), w: d.w, kind: d.kind, cars: cars });
    }
    // Wet floor on the median from night 3: land on it and you keep sliding.
    slicks = [];
    if (wave >= 3) {
      var ns = wave >= 6 ? 2 : 1;
      while (slicks.length < ns) {
        var c = 1 + Math.floor(Math.random() * (COLS - 2));
        if (slicks.indexOf(c) === -1 && DOOR_COLS.indexOf(c) === -1) slicks.push(c);
      }
    }
  }

  function resetPlayer() {
    var startCol = 4;
    player = { col: startCol, row: 7, fx: startCol * CELL + CELL / 2, fy: ROW_Y[7] + CELL / 2, fromX: 0, fromY: 0, face: 0 };
    hopT = 0;
    bestRow = 7;
    patienceMax = Math.max(480, 720 - (wave - 1) * 60);
    patience = patienceMax;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; wave = 1; frame = 0; invuln = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    doors = [false, false, false];
    amb = null; bannerT = 0; bannerText = ''; bannerColor = LIME;
    streak = 0; popups = []; parts = []; shake = 0; pickup = null; pickupCd = 240; slicks = []; dieFlash = 0;
    stats = { chairs: 0, bestStreak: 0, near: 0, tips: 0 };
    makeLanes();
    resetPlayer();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Tap where to hop // fill all 3 chairs' : 'Arrows or tap to hop // fill all 3 chairs';
    window.skateRunning = true;
    startLoop();
  }

  function banner(text, color, t) { bannerT = t || 90; bannerText = text; bannerColor = color || LIME; }

  function die(reason) {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    sfxHit();
    shake = 14; dieFlash = 10;
    var px = player.fx, py = player.fy;
    burst(px, py, 18, reason === 'cold' ? '#8ab' : '#e74c3c', 3, 0.1);
    // The flash printout goes flying
    for (var i = 0; i < 5; i++) parts.push({ x: px, y: py - 4, vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 2, life: 60, color: '#fff', s: 4, g: 0.06, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, paper: true });
    streak = 0;
    if (lives <= 0) {
      enterBoard(score);
      saveBest();
      deathJingle();
    } else {
      resetPlayer();
      invuln = 60;
    }
  }

  function landOn(col, row) {
    // Pickups: the floor of a busy street has its perks
    if (pickup && pickup.col === col && pickup.row === row) {
      var x = col * CELL + CELL / 2, y = ROW_Y[row] + 10;
      if (pickup.kind === 'tip') { award(50 * mult(), x, y, 'TIP JAR', YELLOW); stats.tips++; burst(x, y, 10, YELLOW, 2, 0.05); }
      else if (pickup.kind === 'coffee') { patience = Math.min(patienceMax, patience + 240); award(25, x, y, 'COFFEE', CYAN); burst(x, y, 8, '#c9a27a', 1.6, 0.04); }
      else { award(75 * mult(), x, y, 'FLASH SHEET', PINK); burst(x, y, 10, PINK, 2, 0.05); }
      pickup = null; pickupCd = 300 + Math.random() * 240;
      sfxDoor();
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
        stats.chairs++;
        sayCallout(patience < patienceMax * 0.25 ? 'frogger-c2' : 'frogger-c1');
        var cx = player.col * CELL + CELL / 2, cy = 46;
        // Chair pay: the seat plus a time bonus for hustle, times the streak.
        var timeB = Math.round((patience / patienceMax) * 150 / 10) * 10;
        var m = mult();
        award(Math.round((100 + timeB) * m), cx, cy + 14, 'CHAIR ' + fmtMult(), m > 1 ? YELLOW : '#fff');
        if (timeB >= 100) addPopup(cx, cy + 30, 'QUICK +' + timeB, CYAN);
        streak++;
        if (streak > stats.bestStreak) stats.bestStreak = streak;
        burst(cx, cy, 16, LIME, 2.6, 0.06);
        shake = Math.max(shake, 4);
        sfxDoor();
        if (doors[0] && doors[1] && doors[2]) {
          var nb = Math.round((250 + 100 * (wave - 1)) * mult());
          award(nb, W / 2, H / 2 + 10, 'NIGHT CLEAR', LIME);
          doors = [false, false, false];
          wave++;
          banner(isRush(wave) ? 'RUSH HOUR' : nightOf(wave).name + ' ' + wave, isRush(wave) ? ORANGE : LIME, 110);
          say('frogger-c3', 300);
          makeLanes();
          amb = null; pickup = null;
          sfxWave();
        }
        resetPlayer();
      }
      return;
    }
    if (nr < 1) return;
    player.fromX = player.fx; player.fromY = player.fy;
    player.col = nc;
    player.row = nr;
    if (dx !== 0) player.face = dx;
    if (nr < bestRow) {
      bestRow = nr;
      award(Math.round(10 * mult()), player.col * CELL + CELL / 2, ROW_Y[nr] + 4, '', 'rgba(255,255,255,0.7)');
    }
    hopT = 6;
    sfxHop();
    landOn(nc, nr);
    // Wet floor: the hop keeps going one more cell in the same direction
    if (nr === 4 && slicks.indexOf(nc) !== -1) {
      var sc = nc + dx, sr = nr + dy;
      if (sr >= 1 && sc >= 0 && sc < COLS) {
        player.slip = { dx: dx, dy: dy, t: 7 };
        addPopup(player.col * CELL + CELL / 2, ROW_Y[4] + 6, 'WET FLOOR', CYAN);
        playSfx(300, 0.12, 'sawtooth', 0.08);
      }
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (invuln > 0) invuln--;
    if (hopT > 0) hopT--;
    if (bannerT > 0) bannerT--;
    if (shake > 0) shake--;
    if (dieFlash > 0) dieFlash--;

    // A slip finishes the hop in the same direction
    if (player.slip) {
      if (--player.slip.t <= 0) {
        var s = player.slip; player.slip = null;
        var nc = player.col + s.dx, nr = player.row + s.dy;
        if (nr >= 1 && nc >= 0 && nc < COLS) {
          player.fromX = player.fx; player.fromY = player.fy;
          player.col = nc; player.row = nr; hopT = 6;
          if (nr < bestRow) bestRow = nr;
          landOn(nc, nr);
        }
      }
    }

    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.55; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.rot += p.vr; p.life--;
      if (p.life <= 0) parts.splice(i, 1);
    }

    // The client is only patient for so long
    if (invuln === 0) patience--;
    if (patience <= 0) {
      banner('COLD FEET!', '#ff4444', 70);
      die('cold');
      return;
    }

    // Something worth grabbing shows up on the street now and then
    if (!pickup) {
      if (--pickupCd <= 0) {
        var rows = [1, 2, 3, 4, 5, 6];
        var kinds = ['tip', 'tip', 'flash', 'coffee'];
        if (patience < patienceMax * 0.5) kinds.push('coffee', 'coffee');
        pickup = { col: Math.floor(Math.random() * COLS), row: rows[Math.floor(Math.random() * rows.length)], kind: kinds[Math.floor(Math.random() * kinds.length)], life: 480 };
      }
    } else if (--pickup.life <= 0) { pickup = null; pickupCd = 240 + Math.random() * 240; }

    // Ambulance: night 2+, a warning flash then a streak down one lane
    if (wave >= 2 && !amb && frame % 540 === 200) {
      var row = LANE_ROWS[Math.floor(Math.random() * LANE_ROWS.length)];
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
            die('amb');
            return;
          }
        }
      }
    }

    var speedMult = 1 + (wave - 1) * 0.15;
    for (var i = 0; i < lanes.length; i++) {
      var ln = lanes[i];
      for (var j = 0; j < ln.cars.length; j++) {
        var car = ln.cars[j];
        car.x += ln.dir * ln.speed * speedMult;
        if (ln.dir > 0 && car.x > W + 40) { car.x = -ln.w - 40; car.nm = false; }
        if (ln.dir < 0 && car.x < -ln.w - 40) { car.x = W + 40; car.nm = false; }
      }
      // Collision on the player's row: hitbox matches the drawn sprite, a
      // touch forgiving, so near-misses feel like near-misses (and pay)
      if (invuln === 0 && ln.row === player.row) {
        var px = player.col * CELL + 13, pw = 14;
        for (var j = 0; j < ln.cars.length; j++) {
          var car = ln.cars[j];
          if (px + pw > car.x && px < car.x + ln.w) {
            die('car');
            return;
          }
          if (!car.nm) {
            var gap = car.x > px + pw ? car.x - (px + pw) : px - (car.x + ln.w);
            if (gap >= 0 && gap < 7) {
              car.nm = true;
              stats.near++;
              award(Math.round(15 * mult()), player.fx, player.fy - 22, 'CLOSE!', ORANGE);
              burst(player.fx + (car.x > px ? 10 : -10), player.fy + 8, 5, 'rgba(200,200,200,0.8)', 1.2, 0.02);
              playSfx(1200, 0.05, 'square', 0.06);
            }
          }
        }
      }
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
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

  // ── Vehicles ──
  function beam(x, y, dir, len, h, alpha) {
    var g = ctx.createLinearGradient(dir > 0 ? x : x - len, 0, dir > 0 ? x + len : x, 0);
    g.addColorStop(0, 'rgba(255,240,180,' + alpha + ')');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (dir > 0) { ctx.moveTo(x, y); ctx.lineTo(x + len, y - h); ctx.lineTo(x + len, y + h + 6); ctx.lineTo(x, y + 6); }
    else { ctx.moveTo(x, y); ctx.lineTo(x - len, y - h); ctx.lineTo(x - len, y + h + 6); ctx.lineTo(x, y + 6); }
    ctx.closePath(); ctx.fill();
  }
  function wheel(x, y, r) {
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888';
    ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  function drawCar(car, y, w, dir, kind) {
    var x = car.x, color = car.color;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 32, w / 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'cart') {
      // Supply cart: chrome frame, bottles rattling on top
      beam(dir > 0 ? x + w : x, y + 14, dir, 22, 4, 0.12);
      ctx.fillStyle = '#9aa3ad';
      ctx.fillRect(x + 2, y + 12, w - 4, 14);
      ctx.fillStyle = '#c9d1d9';
      ctx.fillRect(x + 2, y + 12, w - 4, 2);
      ctx.fillRect(x + 2, y + 19, w - 4, 1);
      var bob = Math.sin(frame * 0.5 + car.wob) * 1;
      var bcol = ['#2ecc71', '#00bcf1', '#f1c40f'];
      for (var b = 0; b < 3; b++) {
        ctx.fillStyle = bcol[b];
        ctx.fillRect(x + 5 + b * 9, y + 5 + (b === 1 ? bob : -bob), 6, 8);
        ctx.fillStyle = '#eee';
        ctx.fillRect(x + 6 + b * 9, y + 3 + (b === 1 ? bob : -bob), 4, 3);
      }
      wheel(x + 6, y + 28, 3); wheel(x + w - 6, y + 28, 3);
      return;
    }
    if (kind === 'scooter') {
      // Delivery scooter: rider hunched over, box on the back
      beam(dir > 0 ? x + w : x, y + 14, dir, 30, 5, 0.16);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(x + 6, y + 16, w - 12, 8);
      ctx.fillStyle = '#e8b04a';
      ctx.fillRect(dir > 0 ? x + 2 : x + w - 12, y + 8, 10, 10);
      ctx.fillStyle = '#222';
      ctx.fillRect(dir > 0 ? x + 15 : x + w - 22, y + 6, 7, 7); // helmet
      ctx.fillStyle = '#334';
      ctx.fillRect(dir > 0 ? x + 14 : x + w - 22, y + 12, 8, 6); // rider
      wheel(x + 5, y + 27, 4); wheel(x + w - 5, y + 27, 4);
      ctx.fillStyle = YELLOW;
      ctx.fillRect(dir > 0 ? x + w - 3 : x, y + 14, 3, 3);
      return;
    }
    if (car.taxi) color = '#f2c14e';
    beam(dir > 0 ? x + w : x, y + 12, dir, kind === 'bus' ? 44 : 34, 6, 0.18);
    // Body, roof and trim
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 10, w, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + 24, w, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 2, y + 10, w - 4, 2);
    if (kind === 'bus') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + 6, w, 5);
      ctx.fillStyle = '#bde';
      for (var wx = x + 6; wx < x + w - 10; wx += 14) ctx.fillRect(wx, y + 13, 9, 7);
      ctx.fillStyle = '#ffdca8';
      ctx.fillRect(dir > 0 ? x + w - 16 : x + 4, y + 4, 12, 5);
      ctx.fillStyle = '#222';
      ctx.font = 'bold 5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('16', dir > 0 ? x + w - 10 : x + 10, y + 8);
    } else {
      // Cabin with a roof line and two windows
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + w * 0.25, y + 5, w * 0.5, 6);
      ctx.fillStyle = '#bde';
      ctx.fillRect(x + w * 0.28, y + 6, w * 0.2, 7);
      ctx.fillRect(x + w * 0.52, y + 6, w * 0.2, 7);
      if (car.taxi) {
        ctx.fillStyle = '#14121a';
        ctx.fillRect(x + w / 2 - 7, y + 1, 14, 5);
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(x + w / 2 - 5, y + 2, 10, 3);
        ctx.fillStyle = '#111';
        for (var cx = x + 3; cx < x + w - 3; cx += 6) ctx.fillRect(cx, y + 18, 3, 3);
      }
    }
    wheel(x + 9, y + 28, 4); wheel(x + w - 9, y + 28, 4);
    if (kind === 'bus') wheel(x + w / 2, y + 28, 4);
    // Headlights and taillights
    ctx.fillStyle = '#fff6cc';
    ctx.fillRect(dir > 0 ? x + w - 3 : x, y + 13, 3, 4);
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(dir > 0 ? x : x + w - 3, y + 13, 3, 4);
  }

  function drawPickup() {
    if (!pickup) return;
    var x = pickup.col * CELL + CELL / 2, y = ROW_Y[pickup.row] + CELL / 2 + Math.sin(frame * 0.15) * 2;
    var fade = pickup.life < 90 && Math.floor(frame / 5) % 2 === 0;
    if (fade) return;
    var glow = ctx.createRadialGradient(x, y, 2, x, y, 18);
    var gc = pickup.kind === 'tip' ? '255,215,0' : pickup.kind === 'coffee' ? '0,255,255' : '255,20,147';
    glow.addColorStop(0, 'rgba(' + gc + ',0.35)');
    glow.addColorStop(1, 'rgba(' + gc + ',0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 18, y - 18, 36, 36);
    if (pickup.kind === 'tip') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x - 6, y - 6, 12, 13);
      ctx.fillStyle = '#c8ffe0';
      ctx.fillRect(x - 5, y - 5, 10, 11);
      ctx.fillStyle = '#2f8f4e';
      ctx.fillRect(x - 3, y - 2, 6, 3);
      ctx.fillRect(x - 3, y + 2, 6, 3);
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('$', x, y - 7);
    } else if (pickup.kind === 'coffee') {
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(x - 5, y - 4, 10, 11);
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(x - 5, y - 6, 10, 3);
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(x + 5, y - 1, 3, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      var st = (frame * 0.1) % 6;
      ctx.fillRect(x - 2 + Math.sin(frame * 0.2) * 1.5, y - 12 - st, 1, 4);
      ctx.fillRect(x + 1 - Math.sin(frame * 0.2) * 1.5, y - 14 - st, 1, 4);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 6, y - 7, 12, 14);
      ctx.fillStyle = PINK;
      ctx.fillRect(x - 3, y - 4, 6, 2);
      ctx.fillRect(x - 4, y - 1, 8, 2);
      ctx.fillRect(x - 3, y + 2, 6, 2);
      ctx.fillStyle = LIME;
      ctx.fillRect(x - 1, y + 4, 2, 2);
    }
  }

  function drawWalkIn() {
    var blink = invuln > 0 && Math.floor(frame / 4) % 2 === 0;
    if (blink || mode === 'over') return;
    // Position interpolates between cells over the hop, with an arc
    var tx = player.col * CELL + CELL / 2, ty = ROW_Y[player.row] + CELL / 2;
    var k = hopT > 0 ? 1 - hopT / 6 : 1;
    var ease = 1 - (1 - k) * (1 - k);
    player.fx = hopT > 0 ? player.fromX + (tx - player.fromX) * ease : tx;
    player.fy = hopT > 0 ? player.fromY + (ty - player.fromY) * ease : ty;
    var arc = hopT > 0 ? Math.sin(k * Math.PI) * 7 : 0;
    var sx = hopT > 0 ? 1 - Math.sin(k * Math.PI) * 0.18 : 1;
    var sy = hopT > 0 ? 1 + Math.sin(k * Math.PI) * 0.22 : 1;
    var px = player.fx, py = player.fy - arc;
    // Shadow stays on the floor and shrinks with the hop
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(player.fx, player.fy + 13, 8 * (1 - arc / 20), 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(px, py + 12);
    ctx.scale(sx, sy);
    ctx.translate(-px, -(py + 12));
    var legA = hopT > 0 ? Math.sin(k * Math.PI * 2) * 3 : 0;
    var idle = hopT === 0 ? Math.sin(frame * 0.12) * 0.6 : 0;
    // legs
    ctx.fillStyle = '#f0c8a0';
    ctx.fillRect(px - 5, py + 6 + legA, 3, 6);
    ctx.fillRect(px + 2, py + 6 - legA, 3, 6);
    ctx.fillStyle = '#111';
    ctx.fillRect(px - 6, py + 11 + legA, 4, 2);
    ctx.fillRect(px + 2, py + 11 - legA, 4, 2);
    // body: black tee, a little jacket edge
    ctx.fillStyle = '#222';
    ctx.fillRect(px - 6, py - 6 + idle, 12, 12);
    ctx.fillStyle = '#333';
    ctx.fillRect(px - 6, py - 6 + idle, 3, 12);
    // arm and the flash printout
    ctx.fillStyle = '#f0c8a0';
    ctx.fillRect(px + 4, py - 3 + idle, 3, 5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + 2, py - 4 + idle, 7, 9);
    ctx.fillStyle = PINK;
    ctx.fillRect(px + 4, py - 1 + idle, 3, 1);
    ctx.fillRect(px + 3, py + 1 + idle, 5, 1);
    // head, hair, face
    ctx.fillStyle = '#f0c8a0';
    ctx.fillRect(px - 5, py - 14 + idle, 10, 8);
    ctx.fillStyle = PINK;
    ctx.fillRect(px - 6, py - 17 + idle, 12, 5);
    ctx.fillRect(px - 6, py - 12 + idle, 2, 4);
    ctx.fillStyle = '#222';
    var ex = player.face >= 0 ? px + 1 : px - 3;
    ctx.fillRect(ex, py - 11 + idle, 2, 2);
    if (player.face === 0) ctx.fillRect(px - 3, py - 11 + idle, 2, 2);
    // a shiver when patience is low
    if (patience < patienceMax * 0.3 && Math.floor(frame / 3) % 2 === 0) {
      ctx.fillStyle = CYAN;
      ctx.fillRect(px - 9, py - 10 + idle, 2, 2);
      ctx.fillRect(px + 8, py - 12 + idle, 2, 2);
    }
    ctx.restore();
  }

  function drawShop() {
    ctx.fillStyle = '#2a1a2e';
    ctx.fillRect(0, 0, W, 40);
    // brick texture
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (var by = 0; by < 40; by += 6) for (var bx = (by / 6) % 2 * 8; bx < W; bx += 16) ctx.fillRect(bx, by, 14, 5);
    ctx.fillStyle = '#3a2440';
    ctx.fillRect(0, 34, W, 6);
    // Neon sign with glow
    var on = Math.floor(frame / 30) % 2 === 0;
    var ng = ctx.createRadialGradient(W / 2, 10, 4, W / 2, 10, 60);
    ng.addColorStop(0, on ? 'rgba(255,20,147,0.35)' : 'rgba(255,20,147,0.15)');
    ng.addColorStop(1, 'rgba(255,20,147,0)');
    ctx.fillStyle = ng;
    ctx.fillRect(W / 2 - 60, 0, 120, 40);
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? PINK : '#c8006e';
    ctx.fillText('* TATTOO *', W / 2, 14);
    // Three shop windows, each with a chair
    for (var i = 0; i < 3; i++) {
      var dx = DOOR_COLS[i] * CELL + 4;
      var lit = doors[i];
      ctx.fillStyle = lit ? '#3a2a14' : '#171720';
      ctx.fillRect(dx, 16, CELL - 8, 24);
      if (lit) {
        var wg = ctx.createLinearGradient(0, 16, 0, 40);
        wg.addColorStop(0, 'rgba(255,200,120,0.35)');
        wg.addColorStop(1, 'rgba(255,200,120,0.05)');
        ctx.fillStyle = wg;
        ctx.fillRect(dx, 16, CELL - 8, 24);
        // light spills onto the sidewalk below
        var sg = ctx.createLinearGradient(0, 40, 0, 62);
        sg.addColorStop(0, 'rgba(255,200,120,0.18)');
        sg.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(dx - 4, 40, CELL, 22);
      }
      // the chair
      ctx.fillStyle = lit ? '#6b2a2a' : '#2a2a34';
      ctx.fillRect(dx + 6, 28, 20, 8);
      ctx.fillRect(dx + 20, 20, 6, 10);
      ctx.fillStyle = lit ? '#8a3a3a' : '#33333f';
      ctx.fillRect(dx + 6, 26, 20, 3);
      if (lit) {
        // client laid back, artist bent over with the machine buzzing
        ctx.fillStyle = '#f0c8a0';
        ctx.fillRect(dx + 8, 24, 10, 4);
        ctx.fillRect(dx + 20, 22, 5, 5);
        ctx.fillStyle = PINK;
        ctx.fillRect(dx + 20, 20, 6, 3);
        ctx.fillStyle = '#111';
        ctx.fillRect(dx + 2, 18, 7, 7);
        ctx.fillRect(dx + 3, 24, 6, 6);
        ctx.fillStyle = '#f0c8a0';
        ctx.fillRect(dx + 3, 19, 5, 4);
        if (Math.floor(frame / 3) % 2 === 0) {
          ctx.fillStyle = CYAN;
          ctx.fillRect(dx + 10 + (frame % 4), 22, 2, 2);
        }
      } else {
        ctx.fillStyle = 'rgba(255,20,147,' + (0.45 + 0.25 * Math.sin(frame * 0.1 + i)) + ')';
        ctx.font = '8px monospace';
        ctx.fillText('OPEN', dx + CELL / 2 - 4, 24);
        ctx.font = 'bold 12px monospace';
      }
      ctx.fillStyle = lit ? LIME : PINK;
      ctx.fillRect(dx, 16, CELL - 8, 2);
    }
  }

  function drawStreet(night) {
    ctx.fillStyle = night.sky;
    ctx.fillRect(0, 40, W, H - 40);
    // asphalt grain
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (var gy = 40; gy < H; gy += 4) ctx.fillRect(0, gy, W, 1);
    // Median + start sidewalks with curbs
    var walks = [ROW_Y[4], ROW_Y[7]];
    for (var w = 0; w < 2; w++) {
      var wy = walks[w];
      ctx.fillStyle = '#3c3c46';
      ctx.fillRect(0, wy, W, CELL);
      ctx.fillStyle = '#4a4a55';
      for (var x = 0; x < W; x += 20) ctx.fillRect(x, wy, 1, CELL);
      ctx.fillStyle = '#55555f';
      ctx.fillRect(0, wy, W, 2);
      ctx.fillStyle = '#26262e';
      ctx.fillRect(0, wy + CELL - 2, W, 2);
    }
    // Crosswalk zebra at the start, worn
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (var zx = 8; zx < W; zx += 40) ctx.fillRect(zx, ROW_Y[6] + 2, 24, CELL - 4);
    // Lane dashes and a manhole
    ctx.fillStyle = '#5a5a30';
    for (var i = 0; i < LANE_ROWS.length; i++) {
      var y = ROW_Y[LANE_ROWS[i]];
      if (LANE_ROWS[i] !== 3 && LANE_ROWS[i] !== 6) {
        for (var x2 = 0; x2 < W; x2 += 40) ctx.fillRect(x2 + 10, y + 38, 20, 3);
      }
    }
    ctx.fillStyle = '#2c2c34';
    ctx.beginPath(); ctx.ellipse(310, ROW_Y[2] + 20, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#44444e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(310, ROW_Y[2] + 20, 11, 6, 0, 0, Math.PI * 2); ctx.stroke();
    // Street lamps pour light onto the lanes
    for (var l = 0; l < 2; l++) {
      var lpx = 140 + l * 180;
      for (var rr2 = 0; rr2 < 2; rr2++) {
        var lpy = rr2 === 0 ? ROW_Y[4] : ROW_Y[7];
        var pool = ctx.createRadialGradient(lpx, lpy - 18, 4, lpx, lpy - 18, 60);
        pool.addColorStop(0, night.lamp);
        pool.addColorStop(1, 'rgba(255,220,150,0)');
        ctx.fillStyle = pool;
        ctx.fillRect(lpx - 60, lpy - 78, 120, 120);
        ctx.fillStyle = '#3a3a44';
        ctx.fillRect(lpx - 1, lpy - 34, 3, 36);
        ctx.fillStyle = '#ffe1aa';
        ctx.fillRect(lpx - 4, lpy - 38, 9, 5);
      }
    }
    // Median street furniture: newspaper boxes and a hydrant
    var boxes = [['#2d6cdf', 10], ['#e8283c', 32]];
    for (var b = 0; b < boxes.length; b++) {
      var bxx = boxes[b][1];
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(bxx + 8, ROW_Y[4] + 33, 9, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = boxes[b][0];
      ctx.fillRect(bxx, ROW_Y[4] + 10, 16, 22);
      ctx.fillStyle = '#cfd6dd';
      ctx.fillRect(bxx + 2, ROW_Y[4] + 13, 12, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(bxx + 2, ROW_Y[4] + 24, 12, 2);
      ctx.fillRect(bxx + 12, ROW_Y[4] + 22, 3, 1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(66, ROW_Y[4] + 33, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8283c';
    ctx.fillRect(62, ROW_Y[4] + 18, 8, 14);
    ctx.fillRect(59, ROW_Y[4] + 22, 14, 4);
    ctx.fillRect(64, ROW_Y[4] + 14, 4, 5);
    // Wet floor: a mop bucket and a shining spill
    for (var s = 0; s < slicks.length; s++) {
      var sx = slicks[s] * CELL, sy = ROW_Y[4];
      ctx.fillStyle = 'rgba(120,200,255,0.22)';
      ctx.beginPath(); ctx.ellipse(sx + 20, sy + 22, 17, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.2 * Math.sin(frame * 0.2 + s)) + ')';
      ctx.fillRect(sx + 12, sy + 18, 8, 1);
      ctx.fillRect(sx + 24, sy + 24, 5, 1);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(sx + 30, sy + 6, 8, 10);
      ctx.fillStyle = '#c9a000';
      ctx.fillRect(sx + 30, sy + 6, 8, 2);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(sx + 34, sy - 2, 1, 9);
      ctx.fillStyle = '#c9c9c9';
      ctx.fillRect(sx + 31, sy - 4, 7, 3);
      ctx.font = 'bold 5px monospace';
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.fillText('WET', sx + 34, sy + 13);
    }
  }

  function drawRain() {
    ctx.strokeStyle = 'rgba(180,210,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < 40; i++) {
      var rx = ((i * 97 + frame * 3) % (W + 40)) - 20;
      var ry = ((i * 53 + frame * 9) % (H + 20)) - 10;
      ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 9);
    }
    ctx.stroke();
    // wet-road reflections under the lamps
    ctx.fillStyle = 'rgba(255,240,200,0.05)';
    ctx.fillRect(120, ROW_Y[5], 40, 80);
    ctx.fillRect(300, ROW_Y[5], 40, 80);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var night = nightOf(wave);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawStreet(night);
    drawShop();

    // Ambulance warning: the lane flashes before it streaks through
    if (amb && amb.warnT > 0 && Math.floor(frame / 5) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,40,40,0.18)';
      ctx.fillRect(0, ROW_Y[amb.row], W, CELL);
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = amb.dir > 0 ? 'left' : 'right';
      ctx.fillText('!!', amb.dir > 0 ? 4 : W - 4, ROW_Y[amb.row] + 24);
    }

    drawPickup();

    // Traffic
    for (var i = 0; i < lanes.length; i++) {
      var ln = lanes[i];
      for (var j = 0; j < ln.cars.length; j++) drawCar(ln.cars[j], ROW_Y[ln.row], ln.w, ln.dir, ln.kind);
    }

    // Ambulance
    if (amb && amb.warnT === 0) {
      var ay = ROW_Y[amb.row];
      beam(amb.dir > 0 ? amb.x + 70 : amb.x, ay + 12, amb.dir, 60, 8, 0.22);
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(amb.x, ay + 6, 70, 24);
      ctx.fillStyle = '#dd2222';
      ctx.fillRect(amb.x, ay + 16, 70, 5);
      ctx.fillStyle = '#bde';
      ctx.fillRect(amb.dir > 0 ? amb.x + 50 : amb.x + 6, ay + 9, 14, 8);
      var lit = Math.floor(frame / 4) % 2 === 0;
      ctx.fillStyle = lit ? '#ff2222' : '#2266ff';
      ctx.fillRect(amb.x + 30, ay + 2, 10, 5);
      var lg = ctx.createRadialGradient(amb.x + 35, ay + 4, 2, amb.x + 35, ay + 4, 40);
      lg.addColorStop(0, lit ? 'rgba(255,40,40,0.3)' : 'rgba(40,100,255,0.3)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(amb.x - 5, ay - 36, 80, 80);
      wheel(amb.x + 12, ay + 30, 5); wheel(amb.x + 58, ay + 30, 5);
    }

    drawWalkIn();

    // Particles
    for (var p = 0; p < parts.length; p++) {
      var pt = parts[p];
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / 20));
      ctx.fillStyle = pt.color;
      if (pt.paper) {
        ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot);
        ctx.fillRect(-3, -4, 6, 8);
        ctx.fillStyle = PINK; ctx.fillRect(-1, -1, 3, 1);
        ctx.restore();
      } else ctx.fillRect(pt.x, pt.y, pt.s, pt.s);
    }
    ctx.globalAlpha = 1;

    // Night tint and weather
    ctx.fillStyle = night.tint;
    ctx.fillRect(0, 40, W, H - 40);
    if (night.rain || isRush(wave)) drawRain();
    if (dieFlash > 0) { ctx.fillStyle = 'rgba(255,60,60,' + (dieFlash / 10) * 0.25 + ')'; ctx.fillRect(0, 0, W, H); }

    // Popups
    for (var q = 0; q < popups.length; q++) {
      var pp = popups[q];
      ctx.globalAlpha = Math.min(1, pp.life / 18);
      ctx.fillStyle = pp.color;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 12);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 100, 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = isRush(wave) ? ORANGE : YELLOW;
    ctx.fillText((isRush(wave) ? 'RUSH ' : '') + 'NIGHT ' + wave, W - 8, 12);
    if (streak > 0 && mode === 'play') {
      ctx.fillStyle = mult() >= 4 ? PINK : YELLOW;
      ctx.font = 'bold 10px monospace';
      ctx.fillText('STREAK ' + fmtMult(), W - 8, 60);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '7px monospace';
      ctx.fillText(streak + ' CHAIR' + (streak === 1 ? '' : 'S') + ' IN A ROW', W - 8, 70);
    }
    // Client patience: the walk-in walks if you dawdle
    if (mode === 'play') {
      var pr = Math.max(0, patience / patienceMax);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(W / 2 - 40, 5, 80, 5);
      ctx.fillStyle = pr > 0.35 ? LIME : (Math.floor(frame / 6) % 2 === 0 ? '#ff4444' : '#992222');
      ctx.fillRect(W / 2 - 40, 5, 80 * pr, 5);
      if (pr < 0.35 && Math.floor(frame / 12) % 2 === 0) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('COLD FEET', W / 2, 24);
      }
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerColor;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 30);
      if (bannerText === 'RUSH HOUR') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('FASTER LANES // MORE TRAFFIC // WET STREETS', W / 2, H / 2 - 12);
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }

    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'frogger', label: 'Walk-In', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'GAME OVER', again: 'SPACE or TAP to cross again',
    levelLabel: function (l) { return 'REACHED NIGHT ' + l; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: wave, meta: { chairs: stats.chairs, streak: stats.bestStreak, near: stats.near, tips: stats.tips } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }


  // ── Attract-mode intro: CRT power-on, studio card, then the title scene ──
  function drawIntro() {
    var t = introT;
    // Attract cycle: power-on, title scene, then the shop wall for a stretch
    if (t >= 300) { wall.drawAttract(); return; }
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
    var ambT = 92;
    var c1 = (t2 * 5.4) % (W + 160) - 80;
    var c2 = W + 80 - (t2 * 4.2) % (W + 160);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(c1, 196, 60, 20);
    ctx.fillStyle = '#111'; ctx.fillRect(c1 + 5, 214, 10, 4); ctx.fillRect(c1 + 45, 214, 10, 4);
    ctx.fillStyle = '#3498db'; ctx.fillRect(c2, 236, 56, 20);
    ctx.fillStyle = '#111'; ctx.fillRect(c2 + 5, 254, 10, 4); ctx.fillRect(c2 + 41, 254, 10, 4);
    // the client hops until the siren makes them freeze
    var hopRow = t2 < ambT ? Math.min(2, Math.floor(t2 / 42)) : t2 < ambT + 34 ? 2 : Math.min(4, 2 + Math.floor((t2 - ambT - 34) / 40));
    var frozen = t2 >= ambT - 6 && t2 < ambT + 34;
    var hopB = frozen ? 0 : Math.abs(Math.sin(t2 * 0.14)) * 4;
    var shake = frozen ? (Math.random() - 0.5) * 2 : 0;
    var cyy = 296 - hopRow * 42 - hopB;
    // siren warning + the streak, one lane above the frozen client
    if (t2 >= ambT - 14 && t2 < ambT) {
      if (Math.floor(t2 / 3) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,60,60,0.2)';
        ctx.fillRect(0, 176, W, 24);
      }
    }
    if (t2 >= ambT && t2 < ambT + 30) {
      var ax = -100 + (t2 - ambT) * 22;
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(ax, 178, 74, 22);
      ctx.fillStyle = '#dd2222';
      ctx.fillRect(ax, 188, 74, 5);
      ctx.fillStyle = Math.floor(t2 / 2) % 2 === 0 ? '#ff2222' : '#2266ff';
      ctx.fillRect(ax + 32, 174, 10, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(ax - 30, 186, 24, 2);
    }
    ctx.fillStyle = PINK; ctx.fillRect(W / 2 - 6 + shake, cyy - 16, 12, 4);
    ctx.fillStyle = '#f0c8a0'; ctx.fillRect(W / 2 - 5 + shake, cyy - 13, 10, 7);
    ctx.fillStyle = '#222'; ctx.fillRect(W / 2 - 6 + shake, cyy - 5, 12, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 + 2 + shake, cyy - 3, 6, 8);
    if (frozen && Math.floor(t2 / 6) % 2 === 0) {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!!', W / 2 + 16, cyy - 20);
    }
    var neonOn = Math.random() > 0.12 || t2 > 60;
    if (neonOn) slam('WALK-IN', 92, 34, LIME);
    if (t2 > 150) { ctx.fillStyle = PINK; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('GET THEM TO THE CHAIR', W / 2, 122); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS or TAP to hop // chairs in a row stack the multiplier', W / 2, H - 42);
    ctx.fillText('grab tips and coffee, squeak past traffic for CLOSE bonuses', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('BEST: ' + best, W / 2, H - 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
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
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > 540) introT = 70; }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-frogger', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
