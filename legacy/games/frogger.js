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


  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', ORANGE = '#ff8c1a', PURPLE = '#b026ff';
  // The board: ten rows of 32px, twelve columns with an 8px margin each side.
  // Rows top to bottom: 0 shop (the chairs), 1-2 the ink river (ride the
  // stools, carts and rugs), 3 the stoop, 4-8 traffic, 9 the start sidewalk.
  var CELL = 32, COLS = 12, X0 = 8;
  var ROW_Y = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288];
  var SHOP_ROW = 0, RIVER_ROWS = [1, 2], STOOP_ROW = 3, START_ROW = 9;
  var CHAIR_COLS = [1, 4, 7, 10];
  var LANE_ROWS = [4, 5, 6, 7, 8];
  var LANE_DIRS = { 4: 1, 5: -1, 6: 1, 7: -1, 8: 1 };
  var CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22'];
  function cx(col) { return X0 + col * CELL + CELL / 2; }
  function colAt(x) { return Math.max(0, Math.min(COLS - 1, Math.round((x - X0 - CELL / 2) / CELL))); }
  // Which of rows 1 and 2 are ink this night: none on night 1, the lower
  // row on night 2, both from night 3.
  var riverSet = {};
  function isRiver(row) { return !!riverSet[row]; }
  function hasRiver() { return !!(riverSet[1] || riverSet[2]); }

  // The walk-ins. Each fill hands the next one the sidewalk: a kid (quick,
  // skinny), a biker (long stride: UP clears two rows), a bride (slow, wide
  // dress), a grandma (slow, but patient). Chairs say who they want; a match
  // pays double.
  var CHAR_ORDER = ['kid', 'biker', 'bride', 'grandma'];
  var CHARS = {
    kid:     { name: 'KID',     hop: 4, w: 10, stride: 1, patient: 1,   skin: '#f0c8a0', top: '#2d6cdf', hair: '#5a3418', hairH: 4, h: 0.82 },
    biker:   { name: 'BIKER',   hop: 6, w: 14, stride: 2, patient: 1,   skin: '#e8b892', top: '#111',    hair: '#111',    hairH: 3, h: 1.05 },
    bride:   { name: 'BRIDE',   hop: 8, w: 18, stride: 1, patient: 1,   skin: '#f6d2b8', top: '#f4f4f4', hair: '#3a2a1a', hairH: 5, h: 1 },
    grandma: { name: 'GRANDMA', hop: 9, w: 14, stride: 1, patient: 0.6, skin: '#ecc7a8', top: '#8e6bb5', hair: '#d9d9d9', hairH: 5, h: 0.9 }
  };

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
  var player, lanes, river, chairs, invuln, hopT;
  var patience, patienceMax, amb, bannerT, bannerText, bannerColor, bestRow;
  var streak, popups, parts, shake, pickup, pickupCd, slicks, stats, dieFlash;
  var charIdx, cheerT, bonus, rideT, crowd, inkCard;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-frogger') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-frogger', String(best)); } catch(e) {} }
  }
  function who() { return CHARS[player.char]; }

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
      { row: 4, dir: 1,  speed: 1.5, n: 2, w: 64, kind: 'car' },
      { row: 5, dir: -1, speed: 2.2, n: 3, w: 52, kind: 'car' },
      { row: 6, dir: 1,  speed: 1.1, n: 2, w: 88, kind: 'bus' }, // the slow bus
      { row: 7, dir: -1, speed: 1.8, n: 3, w: 52, kind: 'car' },
      { row: 8, dir: 1,  speed: 2.6, n: 2, w: 56, kind: 'car' }
    ];
    if (wave >= 3) defs[3] = { row: 7, dir: -1, speed: 2.4, n: 4, w: 34, kind: 'cart' };
    if (wave >= 4) defs[0] = { row: 4, dir: 1, speed: 3.1, n: 3, w: 30, kind: 'scooter' };
    if (wave >= 6) defs[4] = { row: 8, dir: 1, speed: 3.0, n: 3, w: 30, kind: 'scooter' };
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
    // Wet floor on the stoop from night 3: land on it and you keep sliding.
    slicks = [];
    if (wave >= 3) {
      var ns = wave >= 6 ? 2 : 1;
      while (slicks.length < ns) {
        var c = 1 + Math.floor(Math.random() * (COLS - 2));
        if (slicks.indexOf(c) === -1 && CHAIR_COLS.indexOf(c) === -1) slicks.push(c);
      }
    }
    makeRiver();
    makeChairs();
  }

  // The ink river: two rows of the parlor floor flooded with ink. Stools roll
  // one way, mop carts and the long rug slide the other. Stand on something
  // or you are in the ink.
  function makeRiver() {
    river = [];
    riverSet = {};
    if (wave < 2) return;
    riverSet[2] = true;
    if (wave >= 3) riverSet[1] = true;
    // About 60 percent of the old pace, and more floats, so there is always a
    // next one to reach inside a second.
    var slow = 0.45 + Math.min(4, wave - 2) * 0.06, fast = 0.6 + Math.min(4, wave - 2) * 0.07;
    var carts = [];
    var nCarts = wave === 2 ? 4 : 3;
    var cw = wave === 2 ? 96 : 80, rw = wave === 2 ? 136 : 120;
    var sp2 = (W + 120) / (nCarts + 1);
    for (var j = 0; j < nCarts; j++) carts.push({ x: j * sp2 + Math.random() * 12, w: cw, kind: 'cart' });
    carts.push({ x: nCarts * sp2, w: rw, kind: 'rug' });
    river.push({ row: 2, dir: -1, speed: slow, items: carts });
    if (riverSet[1]) {
      var stools = [];
      var nStools = wave >= 6 ? 5 : 6;
      var sw = wave >= 6 ? 48 : 56;
      var sp1 = (W + 60) / nStools;
      for (var i = 0; i < nStools; i++) stools.push({ x: i * sp1 + Math.random() * 10, w: sw, kind: 'stool' });
      river.push({ row: 1, dir: 1, speed: fast, items: stools });
    }
  }

  // Four chairs, each wanting one of the four walk-ins. A match pays double.
  function makeChairs() {
    var wants = CHAR_ORDER.slice();
    for (var i = wants.length - 1; i > 0; i--) { var k = Math.floor(Math.random() * (i + 1)); var t = wants[i]; wants[i] = wants[k]; wants[k] = t; }
    chairs = [];
    for (var c = 0; c < CHAIR_COLS.length; c++) chairs.push({ col: CHAIR_COLS[c], want: wants[c], filled: false, glow: 0 });
  }

  function makeCrowd() {
    crowd = [];
    for (var i = 0; i < 7; i++) crowd.push({ x: X0 + 14 + i * 56 + Math.random() * 12, top: CAR_COLORS[(i * 3) % CAR_COLORS.length], skin: i % 3 === 0 ? '#e8b892' : i % 3 === 1 ? '#f0c8a0' : '#c98a5a', ph: Math.random() * 6 });
  }

  function resetPlayer() {
    var startCol = 5;
    player = { x: cx(startCol), row: START_ROW, fx: cx(startCol), fy: ROW_Y[START_ROW] + CELL / 2, fromX: 0, fromY: 0, face: 0, char: CHAR_ORDER[charIdx % CHAR_ORDER.length], slip: null };
    hopT = 0;
    bestRow = START_ROW;
    rideT = 0;
    patienceMax = Math.max(480, 720 - (wave - 1) * 60);
    patience = patienceMax;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; wave = 1; frame = 0; invuln = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    amb = null; bannerT = 0; bannerText = ''; bannerColor = LIME;
    streak = 0; popups = []; parts = []; shake = 0; pickup = null; pickupCd = 240; slicks = []; dieFlash = 0;
    charIdx = 0; cheerT = 0; bonus = null; rideT = 0; inkCard = 0;
    stats = { chairs: 0, bestStreak: 0, near: 0, tips: 0, matches: 0, rides: 0, nights: 1, bonusTips: 0 };
    makeLanes();
    makeCrowd();
    resetPlayer();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Tap where to hop // ride the ink, fill the chairs' : 'Arrows or tap to hop // ride the ink, fill the chairs';
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
    burst(px, py, 18, reason === 'cold' ? '#8ab' : reason === 'ink' ? PURPLE : '#e74c3c', 3, 0.1);
    if (reason === 'ink') { addPopup(px, py - 20, 'IN THE INK', PURPLE); playSfx(90, 0.3, 'sawtooth', 0.12); }
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
      var x = cx(col), y = ROW_Y[row] + 8;
      if (pickup.kind === 'tip') { award(Math.round(50 * mult()), x, y, 'TIP JAR', YELLOW); stats.tips++; burst(x, y, 10, YELLOW, 2, 0.05); }
      else if (pickup.kind === 'coffee') { patience = Math.min(patienceMax, patience + 240); award(25, x, y, 'COFFEE', CYAN); burst(x, y, 8, '#c9a27a', 1.6, 0.04); }
      else { award(Math.round(75 * mult()), x, y, 'FLASH SHEET', PINK); burst(x, y, 10, PINK, 2, 0.05); }
      pickup = null; pickupCd = 300 + Math.random() * 240;
      sfxDoor();
    }
    // Bonus round jars
    if (bonus) {
      for (var j = bonus.jars.length - 1; j >= 0; j--) {
        var jar = bonus.jars[j];
        if (jar.col === col && jar.row === row) {
          bonus.jars.splice(j, 1);
          bonus.got++; stats.bonusTips++;
          award(Math.round(40 * mult()), cx(col), ROW_Y[row] + 8, 'TIP', YELLOW);
          burst(cx(col), ROW_Y[row] + 16, 10, YELLOW, 2, 0.05);
          playSfx(1100, 0.06, 'square', 0.1); setTimeout(function () { playSfx(1500, 0.08, 'square', 0.1); }, 60);
          spawnJar();
        }
      }
    }
  }

  // Which river platform is under a point, if any
  function platformAt(x, row) {
    for (var i = 0; i < river.length; i++) {
      var rl = river[i];
      if (rl.row !== row) continue;
      for (var j = 0; j < rl.items.length; j++) {
        var it = rl.items[j];
        if (x >= it.x - 3 && x <= it.x + it.w + 3) return { lane: rl, item: it };
      }
    }
    return null;
  }

  function fillChair(chair) {
    chair.filled = true; chair.glow = 60;
    stats.chairs++;
    var matched = chair.want === player.char;
    sayCallout(matched ? 'frogger-c1' : (patience < patienceMax * 0.25 ? 'frogger-c2' : 'frogger-c1'));
    var ccx = cx(chair.col), cy = 40;
    // Chair pay: the seat plus a time bonus for hustle, times the streak.
    var timeB = Math.round((patience / patienceMax) * 150 / 10) * 10;
    var m = mult();
    award(Math.round((100 + timeB) * m), ccx, cy + 14, 'CHAIR ' + fmtMult(), m > 1 ? YELLOW : '#fff');
    if (timeB >= 100) addPopup(ccx, cy + 30, 'QUICK +' + timeB, CYAN);
    if (matched) { stats.matches++; award(Math.round(100 * m), ccx, cy + 46, 'MATCH', PINK); burst(ccx, cy, 14, PINK, 3, 0.05); }
    if (hasRiver()) { award(Math.round(40 * m), ccx, cy + 62, 'RIVER', PURPLE); stats.rides++; }
    streak++;
    if (streak > stats.bestStreak) stats.bestStreak = streak;
    burst(ccx, cy, 16, LIME, 2.6, 0.06);
    shake = Math.max(shake, 4);
    cheerT = 50;
    sfxDoor();
    charIdx++;
    var allFilled = true;
    for (var c = 0; c < chairs.length; c++) if (!chairs[c].filled) allFilled = false;
    if (allFilled) {
      var nb = Math.round((250 + 100 * (wave - 1)) * mult());
      award(nb, W / 2, H / 2 + 10, 'NIGHT CLEAR', LIME);
      if (isRush(wave)) startBonus();
      else nextNight();
    }
    resetPlayer();
  }

  function nextNight() {
    wave++;
    stats.nights = wave;
    if (wave === 2) inkCard = 120; // the ink shows up: two seconds of everything holding still
    banner(isRush(wave) ? 'RUSH HOUR' : nightOf(wave).name + ' ' + wave, isRush(wave) ? ORANGE : LIME, 110);
    say('frogger-c3', 300);
    makeLanes();
    amb = null; pickup = null;
    sfxWave();
  }

  // Bonus round: after every third night the street empties for twelve
  // seconds and it rains tip jars. No traffic, no clock, just the dash.
  function startBonus() {
    bonus = { t: 12 * 60, jars: [], got: 0 };
    lanes = [];
    amb = null; pickup = null; slicks = [];
    for (var i = 0; i < 5; i++) spawnJar();
    banner('TIP RUN', YELLOW, 120);
    say('frogger-c3', 200);
    sfxWave();
  }
  function spawnJar() {
    for (var tries = 0; tries < 30; tries++) {
      var col = Math.floor(Math.random() * COLS), row = 3 + Math.floor(Math.random() * 6);
      var clash = false;
      for (var j = 0; j < bonus.jars.length; j++) if (bonus.jars[j].col === col && bonus.jars[j].row === row) clash = true;
      if (row === player.row && col === colAt(player.x)) clash = true;
      if (!clash) { bonus.jars.push({ col: col, row: row, born: frame }); return; }
    }
  }
  function endBonus() {
    var got = bonus.got;
    bonus = null;
    var b = Math.round(got * 25 * mult());
    if (b > 0) award(b, W / 2, H / 2 + 10, got + ' JARS', YELLOW);
    resetPlayer();
    nextNight();
  }

  function hop(dx, dy) {
    if (mode !== 'play' || inkCard > 0) return;
    var ch = who();
    if (hopT > 0 && !(player.row >= 3 && dy === 0)) return; // finish the hop first (except quick side-steps on land)
    var rows = dy < 0 ? ch.stride : 1;
    var nr = player.row + dy * rows;
    if (dy < 0 && ch.stride === 2 && nr < 1) nr = player.row - 1; // a stride never lands in the shop wall
    if (dy < 0 && bonus && nr < STOOP_ROW) return; // the bonus stays on the street
    if (nr > START_ROW) return;
    var nx = player.x + dx * CELL;
    if (nx < X0 + 4 || nx > X0 + COLS * CELL - 4) return;
    if (nr < 1 && dy < 0) {
      // Stepping into the shop only works through an open chair's window
      var col = colAt(player.x);
      for (var c = 0; c < chairs.length; c++) {
        if (chairs[c].col === col && !chairs[c].filled && dx === 0) { fillChair(chairs[c]); return; }
      }
      return;
    }
    if (nr < 1) return;
    // On land, snap to the column grid. On the river, x stays free.
    if (!isRiver(nr)) nx = cx(colAt(nx));
    player.fromX = player.fx; player.fromY = player.fy;
    player.x = nx;
    player.row = nr;
    if (dx !== 0) player.face = dx;
    if (nr < bestRow) {
      bestRow = nr;
      award(Math.round(10 * mult()), player.x, ROW_Y[nr] + 4, '', 'rgba(255,255,255,0.7)');
    }
    hopT = ch.hop;
    if (isRiver(nr)) rideT = 0;
    sfxHop();
    landOn(colAt(nx), nr);
    // Wet floor on the stoop: the hop keeps going one more cell in the same direction
    if (nr === STOOP_ROW && slicks.indexOf(colAt(nx)) !== -1) {
      var sc = colAt(nx) + dx, sr = nr + dy;
      if (sr >= 1 && sc >= 0 && sc < COLS) {
        player.slip = { dx: dx, dy: dy, t: 7 };
        addPopup(player.x, ROW_Y[STOOP_ROW] + 6, 'WET FLOOR', CYAN);
        playSfx(300, 0.12, 'sawtooth', 0.08);
      }
    }
  }

  function update() {
    frame++;
    musicTick();
    if (inkCard > 0) { inkCard--; return; }
    if (calloutCd > 0) calloutCd--;
    if (invuln > 0) invuln--;
    if (hopT > 0) hopT--;
    if (bannerT > 0) bannerT--;
    if (shake > 0) shake--;
    if (dieFlash > 0) dieFlash--;
    if (cheerT > 0) cheerT--;
    for (var c = 0; c < chairs.length; c++) if (chairs[c].glow > 0) chairs[c].glow--;

    // A slip finishes the hop in the same direction
    if (player.slip) {
      if (--player.slip.t <= 0) {
        var s = player.slip; player.slip = null;
        var nc = colAt(player.x) + s.dx, nr = player.row + s.dy;
        if (nr >= 1 && nc >= 0 && nc < COLS) {
          player.fromX = player.fx; player.fromY = player.fy;
          player.x = isRiver(nr) ? cx(nc) : cx(nc); player.row = nr; hopT = 6;
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

    // The river moves, and so does anyone standing on it
    for (var r = 0; r < river.length; r++) {
      var rl = river[r];
      for (var k = 0; k < rl.items.length; k++) {
        var it = rl.items[k];
        it.x += rl.dir * rl.speed;
        if (rl.dir > 0 && it.x > W + 20) it.x = -it.w - 20;
        if (rl.dir < 0 && it.x < -it.w - 20) it.x = W + 20;
      }
    }
    if (isRiver(player.row) && invuln === 0 && !player.slip) {
      var on = platformAt(player.x, player.row);
      if (on) {
        player.x += on.lane.dir * on.lane.speed;
        if (hopT === 0) player.fx = player.x;
        rideT++;
        if (rideT === 90) { award(Math.round(20 * mult()), player.x, ROW_Y[player.row] - 4, 'RIDE', PURPLE); }
        if (player.x < X0 - 6 || player.x > X0 + COLS * CELL + 6) { die('ink'); return; }
      } else if (hopT === 0) { die('ink'); return; }
    }

    // Bonus round clock
    if (bonus) {
      bonus.t--;
      if (bonus.t <= 0) { endBonus(); return; }
    } else {
      // The client is only patient for so long
      if (invuln === 0) patience -= who().patient * (isRiver(player.row) ? 0.4 : 1);
      if (patience <= 0) {
        banner('COLD FEET!', '#ff4444', 70);
        die('cold');
        return;
      }
    }

    // Something worth grabbing shows up on the street now and then
    if (!bonus) {
      if (!pickup) {
        if (--pickupCd <= 0) {
          var rows = [3, 4, 5, 6, 7, 8];
          var kinds = ['tip', 'tip', 'flash', 'coffee'];
          if (patience < patienceMax * 0.5) kinds.push('coffee', 'coffee');
          pickup = { col: Math.floor(Math.random() * COLS), row: rows[Math.floor(Math.random() * rows.length)], kind: kinds[Math.floor(Math.random() * kinds.length)], life: 480 };
        }
      } else if (--pickup.life <= 0) { pickup = null; pickupCd = 240 + Math.random() * 240; }
    }

    // Ambulance: night 2+, a warning flash then a streak down one lane
    if (!bonus && wave >= 2 && !amb && frame % 540 === 200) {
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
          var apx = player.x - who().w / 2;
          if (apx + who().w > amb.x && apx < amb.x + 70) {
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
      // Collision on the player's row: hitbox is the walk-in's width, a
      // touch forgiving, so near-misses feel like near-misses (and pay)
      if (invuln === 0 && ln.row === player.row) {
        var pw = who().w, px = player.x - pw / 2;
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
  function tapHop(tx, ty) {
    var dx = tx - player.x, dy = ty - (ROW_Y[player.row] + CELL / 2);
    if (Math.abs(dx) > Math.abs(dy)) hop(dx > 0 ? 1 : -1, 0);
    else hop(0, dy > 0 ? 1 : -1);
  }
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode !== 'play') { start(); return; }
    var r = canvas.getBoundingClientRect();
    tapHop((e.touches[0].clientX - r.left) * (W / r.width), (e.touches[0].clientY - r.top) * (H / r.height));
  }, { passive: false });
  canvas.addEventListener('click', function(e) {
    if (mode !== 'play') { start(); return; }
    var r = canvas.getBoundingClientRect();
    tapHop((e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height));
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
    drawJarLike(cx(pickup.col), ROW_Y[pickup.row] + CELL / 2 + Math.sin(frame * 0.15) * 2, pickup.kind, pickup.life < 90 && Math.floor(frame / 5) % 2 === 0);
  }
  function drawJarLike(x, y, kind, hidden) {
    if (hidden) return;
    var glow = ctx.createRadialGradient(x, y, 2, x, y, 16);
    var gc = kind === 'tip' ? '255,215,0' : kind === 'coffee' ? '0,255,255' : '255,20,147';
    glow.addColorStop(0, 'rgba(' + gc + ',0.35)');
    glow.addColorStop(1, 'rgba(' + gc + ',0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 16, y - 16, 32, 32);
    if (kind === 'tip') {
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
    } else if (kind === 'coffee') {
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
  function drawJars() {
    if (!bonus) return;
    for (var i = 0; i < bonus.jars.length; i++) {
      var jr = bonus.jars[i];
      drawJarLike(cx(jr.col), ROW_Y[jr.row] + CELL / 2 + Math.sin((frame + jr.born) * 0.2) * 2, 'tip', false);
    }
  }

  // The walk-in: four bodies, one set of legs. Hops interpolate with an arc.
  function drawWalkIn() {
    var blink = invuln > 0 && Math.floor(frame / 4) % 2 === 0;
    if (blink || mode === 'over') return;
    var ch = who();
    var tx = player.x, ty = ROW_Y[player.row] + CELL / 2;
    var k = hopT > 0 ? 1 - hopT / ch.hop : 1;
    var ease = 1 - (1 - k) * (1 - k);
    player.fx = hopT > 0 ? player.fromX + (tx - player.fromX) * ease : tx;
    player.fy = hopT > 0 ? player.fromY + (ty - player.fromY) * ease : ty;
    var arc = hopT > 0 ? Math.sin(k * Math.PI) * (ch.stride === 2 && player.fromY - ty > CELL ? 12 : 7) : 0;
    var sx = hopT > 0 ? 1 - Math.sin(k * Math.PI) * 0.18 : 1;
    var sy = hopT > 0 ? 1 + Math.sin(k * Math.PI) * 0.22 : 1;
    var px = player.fx, py = player.fy - arc;
    // Shadow stays on the floor and shrinks with the hop
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(player.fx, player.fy + 11, (ch.w / 2 + 2) * (1 - arc / 20), 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(px, py + 10);
    ctx.scale(sx, sy * ch.h);
    ctx.translate(-px, -(py + 10));
    var legA = hopT > 0 ? Math.sin(k * Math.PI * 2) * 3 : 0;
    var idle = hopT === 0 ? Math.sin(frame * 0.12) * 0.6 : 0;
    var hw = ch.w / 2;
    // legs
    ctx.fillStyle = ch.skin;
    ctx.fillRect(px - 4, py + 5 + legA, 3, 5);
    ctx.fillRect(px + 1, py + 5 - legA, 3, 5);
    ctx.fillStyle = ch === CHARS.biker ? '#3a2a1a' : '#111';
    ctx.fillRect(px - 5, py + 9 + legA, 4, 2);
    ctx.fillRect(px + 1, py + 9 - legA, 4, 2);
    if (player.char === 'bride') {
      // the dress, wide and white, swaying with the hop
      ctx.fillStyle = '#f7f7f7';
      ctx.beginPath(); ctx.moveTo(px - 4, py - 4 + idle); ctx.lineTo(px + 4, py - 4 + idle); ctx.lineTo(px + hw, py + 9); ctx.lineTo(px - hw, py + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(px - hw + 2, py + 6, ch.w - 4, 1);
    } else if (player.char === 'grandma') {
      // cardigan and a handbag
      ctx.fillStyle = ch.top;
      ctx.fillRect(px - 6, py - 5 + idle, 12, 11);
      ctx.fillStyle = '#c9b7dd';
      ctx.fillRect(px - 1, py - 5 + idle, 2, 11);
      ctx.fillStyle = '#6b3a1e';
      ctx.fillRect(px + 6, py + idle, 4, 4);
    } else if (player.char === 'biker') {
      // leather vest, bare arms, chain
      ctx.fillStyle = '#e8b892';
      ctx.fillRect(px - 8, py - 5 + idle, 16, 8);
      ctx.fillStyle = ch.top;
      ctx.fillRect(px - 6, py - 6 + idle, 12, 12);
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(px - 3, py - 3 + idle, 6, 1);
    } else {
      // kid: striped tee
      ctx.fillStyle = ch.top;
      ctx.fillRect(px - 5, py - 4 + idle, 10, 10);
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 5, py - 1 + idle, 10, 2);
    }
    // arm and the flash printout
    ctx.fillStyle = ch.skin;
    ctx.fillRect(px + 4, py - 3 + idle, 3, 5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px + 2, py - 4 + idle, 7, 9);
    ctx.fillStyle = PINK;
    ctx.fillRect(px + 4, py - 1 + idle, 3, 1);
    ctx.fillRect(px + 3, py + 1 + idle, 5, 1);
    // head, hair, face
    ctx.fillStyle = ch.skin;
    ctx.fillRect(px - 5, py - 13 + idle, 10, 8);
    ctx.fillStyle = ch.hair;
    ctx.fillRect(px - 6, py - 13 - ch.hairH + 3 + idle, 12, ch.hairH);
    if (player.char === 'kid') { ctx.fillStyle = '#e8283c'; ctx.fillRect(px - 6, py - 15 + idle, 12, 3); ctx.fillRect(px + 3, py - 14 + idle, 6, 2); }
    if (player.char === 'bride') { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(px - 8, py - 12 + idle, 3, 14); ctx.fillRect(px + 5, py - 12 + idle, 3, 14); }
    if (player.char === 'biker') { ctx.fillStyle = '#111'; ctx.fillRect(px - 5, py - 11 + idle, 10, 2); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(px - 3, py - 6 + idle, 6, 2); }
    if (player.char === 'grandma') { ctx.fillStyle = '#333'; ctx.fillRect(px - 5, py - 11 + idle, 4, 2); ctx.fillRect(px + 1, py - 11 + idle, 4, 2); }
    ctx.fillStyle = '#222';
    var ex = player.face >= 0 ? px + 1 : px - 3;
    ctx.fillRect(ex, py - 10 + idle, 2, 2);
    if (player.face === 0) ctx.fillRect(px - 3, py - 10 + idle, 2, 2);
    // a shiver when patience is low
    if (!bonus && patience < patienceMax * 0.3 && Math.floor(frame / 3) % 2 === 0) {
      ctx.fillStyle = CYAN;
      ctx.fillRect(px - 9, py - 10 + idle, 2, 2);
      ctx.fillRect(px + 8, py - 12 + idle, 2, 2);
    }
    ctx.restore();
  }

  function drawShop() {
    ctx.fillStyle = '#2a1a2e';
    ctx.fillRect(0, 0, W, 32);
    // brick texture
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (var by = 0; by < 32; by += 6) for (var bx = (by / 6) % 2 * 8; bx < W; bx += 16) ctx.fillRect(bx, by, 14, 5);
    ctx.fillStyle = '#3a2440';
    ctx.fillRect(0, 28, W, 4);
    // Neon sign with glow
    var on = Math.floor(frame / 30) % 2 === 0;
    var ng = ctx.createRadialGradient(W / 2, 8, 4, W / 2, 8, 60);
    ng.addColorStop(0, on ? 'rgba(255,20,147,0.35)' : 'rgba(255,20,147,0.15)');
    ng.addColorStop(1, 'rgba(255,20,147,0)');
    ctx.fillStyle = ng;
    ctx.fillRect(W / 2 - 60, 0, 120, 32);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = on ? PINK : '#c8006e';
    ctx.fillText('* TATTOO *', W / 2, 12);
    // Four shop windows, each with a chair and a sign saying who it wants
    for (var i = 0; i < chairs.length; i++) {
      var chair = chairs[i];
      var dx = X0 + chair.col * CELL + 2;
      var lit = chair.filled;
      var ww = CELL - 4;
      ctx.fillStyle = lit ? '#3a2a14' : '#171720';
      ctx.fillRect(dx, 12, ww, 20);
      if (lit) {
        var wg = ctx.createLinearGradient(0, 12, 0, 32);
        wg.addColorStop(0, 'rgba(255,200,120,0.35)');
        wg.addColorStop(1, 'rgba(255,200,120,0.05)');
        ctx.fillStyle = wg;
        ctx.fillRect(dx, 12, ww, 20);
        if (chair.glow > 0) {
          ctx.fillStyle = 'rgba(127,255,0,' + (chair.glow / 60) * 0.35 + ')';
          ctx.fillRect(dx - 2, 10, ww + 4, 24);
        }
      }
      // the chair
      ctx.fillStyle = lit ? '#6b2a2a' : '#2a2a34';
      ctx.fillRect(dx + 5, 23, 16, 6);
      ctx.fillRect(dx + 16, 16, 5, 8);
      ctx.fillStyle = lit ? '#8a3a3a' : '#33333f';
      ctx.fillRect(dx + 5, 21, 16, 3);
      if (lit) {
        // client laid back, artist bent over with the machine buzzing
        ctx.fillStyle = '#f0c8a0';
        ctx.fillRect(dx + 7, 19, 8, 3);
        ctx.fillRect(dx + 16, 18, 4, 4);
        ctx.fillStyle = PINK;
        ctx.fillRect(dx + 16, 16, 5, 2);
        ctx.fillStyle = '#111';
        ctx.fillRect(dx + 1, 14, 6, 6);
        ctx.fillRect(dx + 2, 19, 5, 5);
        ctx.fillStyle = '#f0c8a0';
        ctx.fillRect(dx + 2, 15, 4, 3);
        if (Math.floor(frame / 3) % 2 === 0) {
          ctx.fillStyle = CYAN;
          ctx.fillRect(dx + 9 + (frame % 4), 17, 2, 2);
        }
      } else {
        // the want sign: who this chair is waiting for
        var wantMe = player && chair.want === player.char && mode === 'play';
        ctx.fillStyle = wantMe ? LIME : 'rgba(255,20,147,' + (0.5 + 0.25 * Math.sin(frame * 0.1 + i)) + ')';
        ctx.font = 'bold 6px monospace';
        ctx.fillText(CHARS[chair.want].name, dx + ww / 2, 19);
        if (wantMe && Math.floor(frame / 10) % 2 === 0) { ctx.fillStyle = LIME; ctx.fillRect(dx + ww / 2 - 1, 8, 2, 2); }
      }
      ctx.fillStyle = lit ? LIME : PINK;
      ctx.fillRect(dx, 12, ww, 2);
    }
  }

  // Rows 1 and 2: the parlor floor. On night 1 it is dry tile you can walk.
  // From night 2 the lower row floods with ink, from night 3 both do. Ink is
  // a dark purple liquid with a moving sheen and a hard bank on each edge;
  // what floats on it is big, bright and solid. Never touch the ink.
  function drawParlorFloor(row) {
    var y = ROW_Y[row];
    ctx.fillStyle = '#2c2436';
    ctx.fillRect(0, y, W, CELL);
    for (var tx = X0 - 16; tx < W; tx += 16) for (var ty = 0; ty < CELL; ty += 16) {
      ctx.fillStyle = ((tx + ty) / 16) % 2 === 0 ? '#332a3e' : '#2a2233';
      ctx.fillRect(tx, y + ty, 16, 16);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, y, W, 1);
  }
  function drawInkRow(row) {
    var y = ROW_Y[row];
    var g = ctx.createLinearGradient(0, y, 0, y + CELL);
    g.addColorStop(0, '#1c0a30');
    g.addColorStop(1, '#100620');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, CELL);
    // the sheen: bright bands that slide, so it reads as liquid
    for (var b = 0; b < 4; b++) {
      var bx = ((b * 131 + frame * (b % 2 ? 0.9 : 1.3)) % (W + 160)) - 80;
      var sg = ctx.createLinearGradient(bx, 0, bx + 80, 0);
      sg.addColorStop(0, 'rgba(176,38,255,0)');
      sg.addColorStop(0.5, 'rgba(200,120,255,0.16)');
      sg.addColorStop(1, 'rgba(176,38,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(bx, y + 3, 80, CELL - 6);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (var i = 0; i < 5; i++) {
      var sx = ((i * 97 + frame * 0.7) % (W + 40)) - 20;
      ctx.fillRect(sx, y + 6 + (i * 7) % 20 + Math.sin(frame * 0.05 + i) * 2, 12, 1);
    }
    // hard banks top and bottom
    ctx.fillStyle = '#6a3aa0';
    ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = '#0a0414';
    ctx.fillRect(0, y + CELL - 2, W, 2);
  }
  function drawRiver() {
    for (var r = 2; r >= 1; r--) {
      if (isRiver(r)) drawInkRow(r); else drawParlorFloor(r);
    }
    if (!hasRiver()) return;
    // neon spill from the shop above
    var top = ROW_Y[1];
    var g = ctx.createLinearGradient(0, top, 0, top + 20);
    g.addColorStop(0, 'rgba(255,20,147,0.14)');
    g.addColorStop(1, 'rgba(255,20,147,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, 20);
    // the floats
    for (var k = 0; k < river.length; k++) {
      var rl = river[k];
      for (var n = 0; n < rl.items.length; n++) drawFloat(rl.items[n], ROW_Y[rl.row], rl.dir);
    }
    drawLandingHint();
    // a label on the bank so the rule is on screen
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('INK: RIDE THE FLOATS', X0, ROW_Y[2] + CELL - 5);
  }
  // Where your next UP hop lands: a lime outline on the float under you, or a
  // red flash on bare ink.
  function drawLandingHint() {
    if (mode !== 'play' || inkCard > 0) return;
    var nr = player.row - 1;
    if (!isRiver(nr) || hopT > 0) return;
    var on = platformAt(player.x, nr);
    var y = ROW_Y[nr];
    if (on) {
      ctx.strokeStyle = 'rgba(127,255,0,' + (0.55 + 0.35 * Math.sin(frame * 0.25)) + ')';
      ctx.lineWidth = 2;
      ctx.strokeRect(on.item.x - 2, y + 4, on.item.w + 4, CELL - 8);
    } else if (Math.floor(frame / 6) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      ctx.fillRect(player.x - CELL / 2, y + 2, CELL, CELL - 4);
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(player.x - CELL / 2 + 1, y + 3, CELL - 2, CELL - 6);
    }
  }
  function drawFloat(it, y, dir) {
    var x = it.x, w = it.w;
    // soft shadow on the ink
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + CELL - 4, w / 2 + 2, 4, 0, 0, Math.PI * 2); ctx.fill();
    // wake
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(dir > 0 ? x - 12 : x + w, y + 18, 12, 2);
    if (it.kind === 'stool') {
      // rolling stool: a round lime pad, bright rim on top
      ctx.fillStyle = '#3f8a00';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + 18, w / 2, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = LIME;
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + 14, w / 2, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(x + w / 2 - 6, y + 10, w / 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a5a00';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + 14, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    } else if (it.kind === 'cart') {
      // mop cart: a long yellow plank with a bright top edge, mop up
      ctx.fillStyle = '#a07800';
      ctx.fillRect(x, y + 12, w, 14);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(x, y + 9, w, 12);
      ctx.fillStyle = '#fff2a8';
      ctx.fillRect(x, y + 9, w, 3);
      ctx.fillStyle = '#c9a000';
      for (var d = x + 10; d < x + w - 6; d += 16) ctx.fillRect(d, y + 15, 8, 2);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(x + w - 12, y - 1, 2, 12);
      ctx.fillStyle = '#c9c9c9';
      ctx.fillRect(x + w - 17, y - 4, 12, 4);
      ctx.fillStyle = '#111';
      ctx.fillRect(x + 4, y + 25, 6, 3); ctx.fillRect(x + w - 10, y + 25, 6, 3);
    } else {
      // the rug: a wide pink runner with a bright edge and fringe
      ctx.fillStyle = '#8a0c50';
      ctx.fillRect(x, y + 10, w, 16);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, y + 7, w, 15);
      ctx.fillStyle = '#ff8ad0';
      ctx.fillRect(x, y + 7, w, 3);
      ctx.fillStyle = '#ffd6ee';
      for (var f = x + 10; f < x + w - 8; f += 14) ctx.fillRect(f, y + 13, 6, 4);
      ctx.fillStyle = '#ffb0e0';
      for (var fr = x + 2; fr < x + w - 2; fr += 5) { ctx.fillRect(fr, y + 22, 2, 4); }
      ctx.fillStyle = '#5a0a34';
      ctx.fillRect(x, y + 7, 3, 15); ctx.fillRect(x + w - 3, y + 7, 3, 15);
    }
  }

  function drawStreet(night) {
    ctx.fillStyle = night.sky;
    ctx.fillRect(0, ROW_Y[3], W, H - ROW_Y[3]);
    // asphalt grain
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (var gy = ROW_Y[4]; gy < H; gy += 4) ctx.fillRect(0, gy, W, 1);
    // Lanes banded light and dark so every row reads on its own
    for (var li = 0; li < LANE_ROWS.length; li++) {
      ctx.fillStyle = li % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.16)';
      ctx.fillRect(0, ROW_Y[LANE_ROWS[li]], W, CELL);
    }
    // Stoop + start sidewalks: pale concrete with joints and a curb
    var walks = [ROW_Y[STOOP_ROW], ROW_Y[START_ROW]];
    for (var w = 0; w < 2; w++) {
      var wy = walks[w];
      ctx.fillStyle = '#5a5a66';
      ctx.fillRect(0, wy, W, CELL);
      ctx.fillStyle = '#4c4c58';
      for (var x = 0; x < W; x += 24) ctx.fillRect(x, wy, 1, CELL);
      ctx.fillRect(0, wy + CELL / 2, W, 1);
      ctx.fillStyle = '#7a7a86';
      ctx.fillRect(0, wy, W, 3);
      ctx.fillStyle = '#2a2a32';
      ctx.fillRect(0, wy + CELL - 3, W, 3);
      ctx.fillStyle = 'rgba(255,215,0,0.35)';
      ctx.fillRect(0, w === 0 ? wy + CELL - 4 : wy, W, 1);
    }
    // Crosswalk zebra at the start, worn
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (var zx = X0 + 4; zx < W; zx += 32) ctx.fillRect(zx, ROW_Y[8] + 2, 20, CELL - 4);
    // Lane dashes and a manhole
    ctx.fillStyle = '#8a8a48';
    for (var i = 0; i < LANE_ROWS.length; i++) {
      var y = ROW_Y[LANE_ROWS[i]];
      if (LANE_ROWS[i] !== 6 && LANE_ROWS[i] !== 8) {
        for (var x2 = 0; x2 < W; x2 += 40) ctx.fillRect(x2 + 10, y + 30, 20, 2);
      }
    }
    ctx.fillStyle = '#2c2c34';
    ctx.beginPath(); ctx.ellipse(310, ROW_Y[5] + 16, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#44444e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(310, ROW_Y[5] + 16, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
    // Street lamps pour light onto the lanes
    for (var l = 0; l < 2; l++) {
      var lpx = 140 + l * 180;
      for (var rr2 = 0; rr2 < 2; rr2++) {
        var lpy = rr2 === 0 ? ROW_Y[STOOP_ROW] : ROW_Y[START_ROW];
        var pool = ctx.createRadialGradient(lpx, lpy - 14, 4, lpx, lpy - 14, 56);
        pool.addColorStop(0, night.lamp);
        pool.addColorStop(1, 'rgba(255,220,150,0)');
        ctx.fillStyle = pool;
        ctx.fillRect(lpx - 56, lpy - 70, 112, 112);
        ctx.fillStyle = '#3a3a44';
        ctx.fillRect(lpx - 1, lpy - 28, 3, 30);
        ctx.fillStyle = '#ffe1aa';
        ctx.fillRect(lpx - 4, lpy - 32, 9, 5);
      }
    }
    // Stoop furniture: newspaper boxes and a hydrant
    var boxes = [['#2d6cdf', 12], ['#e8283c', 34]];
    for (var b = 0; b < boxes.length; b++) {
      var bxx = boxes[b][1];
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(bxx + 8, ROW_Y[STOOP_ROW] + 27, 9, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = boxes[b][0];
      ctx.fillRect(bxx, ROW_Y[STOOP_ROW] + 8, 16, 18);
      ctx.fillStyle = '#cfd6dd';
      ctx.fillRect(bxx + 2, ROW_Y[STOOP_ROW] + 10, 12, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(bxx + 2, ROW_Y[STOOP_ROW] + 20, 12, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(70, ROW_Y[STOOP_ROW] + 27, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8283c';
    ctx.fillRect(66, ROW_Y[STOOP_ROW] + 14, 8, 12);
    ctx.fillRect(63, ROW_Y[STOOP_ROW] + 17, 14, 4);
    ctx.fillRect(68, ROW_Y[STOOP_ROW] + 10, 4, 5);
    // Wet floor: a mop bucket and a shining spill
    for (var s = 0; s < slicks.length; s++) {
      var sx = X0 + slicks[s] * CELL, sy = ROW_Y[STOOP_ROW];
      ctx.fillStyle = 'rgba(120,200,255,0.22)';
      ctx.beginPath(); ctx.ellipse(sx + 16, sy + 18, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.2 * Math.sin(frame * 0.2 + s)) + ')';
      ctx.fillRect(sx + 9, sy + 15, 8, 1);
      ctx.fillRect(sx + 20, sy + 20, 5, 1);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(sx + 24, sy + 4, 7, 9);
      ctx.fillStyle = '#c9a000';
      ctx.fillRect(sx + 24, sy + 4, 7, 2);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(sx + 27, sy - 3, 1, 8);
      ctx.fillStyle = '#c9c9c9';
      ctx.fillRect(sx + 24, sy - 5, 7, 3);
      ctx.font = 'bold 5px monospace';
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.fillText('WET', sx + 27, sy + 11);
    }
  }

  // The crowd on the start sidewalk: they cheer when a chair fills.
  function drawCrowd() {
    var y = ROW_Y[START_ROW];
    for (var i = 0; i < crowd.length; i++) {
      var c = crowd[i];
      if (Math.abs(c.x - player.fx) < 16 && player.row === START_ROW) continue; // step aside for the walk-in
      var jump = cheerT > 0 ? Math.abs(Math.sin((cheerT + c.ph) * 0.35)) * 5 : 0;
      var bob = Math.sin(frame * 0.05 + c.ph) * 0.6;
      var px = c.x, py = y + 18 - jump + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px - 5, y + 27, 10, 2);
      ctx.fillStyle = c.top;
      ctx.fillRect(px - 4, py - 4, 8, 9);
      ctx.fillStyle = '#111';
      ctx.fillRect(px - 4, py + 5, 3, 4); ctx.fillRect(px + 1, py + 5, 3, 4);
      ctx.fillStyle = c.skin;
      ctx.fillRect(px - 3, py - 11, 7, 7);
      if (cheerT > 0) { ctx.fillRect(px - 7, py - 12 + jump / 2, 3, 6); ctx.fillRect(px + 5, py - 12 + jump / 2, 3, 6); }
      else { ctx.fillRect(px - 6, py - 3, 2, 5); ctx.fillRect(px + 4, py - 3, 2, 5); }
      ctx.fillStyle = i % 2 ? '#222' : '#5a3418';
      ctx.fillRect(px - 4, py - 13, 8, 3);
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
    ctx.fillRect(120, ROW_Y[6], 40, 64);
    ctx.fillRect(300, ROW_Y[6], 40, 64);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var night = nightOf(wave);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawStreet(night);
    drawRiver();
    drawShop();

    // Ambulance warning: the lane flashes before it streaks through
    if (amb && amb.warnT > 0 && Math.floor(frame / 5) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,40,40,0.18)';
      ctx.fillRect(0, ROW_Y[amb.row], W, CELL);
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = amb.dir > 0 ? 'left' : 'right';
      ctx.fillText('!!', amb.dir > 0 ? 4 : W - 4, ROW_Y[amb.row] + 20);
    }

    drawPickup();
    drawJars();
    drawCrowd();

    // Traffic, squashed a touch to sit in the 32px lanes
    for (var i = 0; i < lanes.length; i++) {
      var ln = lanes[i];
      for (var j = 0; j < ln.cars.length; j++) {
        ctx.save();
        ctx.translate(0, ROW_Y[ln.row]);
        ctx.scale(1, 0.82);
        drawCar(ln.cars[j], 0, ln.w, ln.dir, ln.kind);
        ctx.restore();
      }
    }

    // Ambulance
    if (amb && amb.warnT === 0) {
      ctx.save();
      ctx.translate(0, ROW_Y[amb.row]);
      ctx.scale(1, 0.82);
      var ay = 0;
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
      ctx.restore();
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
    ctx.fillRect(0, 32, W, H - 32);
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
    if (bonus) {
      ctx.fillStyle = YELLOW;
      ctx.fillText('TIP RUN ' + Math.ceil(bonus.t / 60) + 's', W - 8, 12);
    } else {
      ctx.fillStyle = isRush(wave) ? ORANGE : YELLOW;
      ctx.fillText((isRush(wave) ? 'RUSH ' : '') + 'NIGHT ' + wave, W - 8, 12);
    }
    // Who is walking in, and the chair that wants them
    if (mode === 'play') {
      ctx.textAlign = 'left';
      ctx.fillStyle = LIME;
      ctx.font = 'bold 8px monospace';
      var wantsMe = null;
      for (var c2 = 0; c2 < chairs.length; c2++) if (!chairs[c2].filled && chairs[c2].want === player.char) wantsMe = chairs[c2];
      ctx.fillText('NOW: ' + who().name + (wantsMe ? '  //  CHAIR ' + (CHAIR_COLS.indexOf(wantsMe.col) + 1) + ' WANTS YOU' : (bonus ? '' : '  //  ANY OPEN CHAIR')), 8, 42);
    }
    if (streak > 0 && mode === 'play') {
      ctx.textAlign = 'right';
      ctx.fillStyle = mult() >= 4 ? PINK : YELLOW;
      ctx.font = 'bold 10px monospace';
      ctx.fillText('STREAK ' + fmtMult(), W - 8, 44);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '7px monospace';
      ctx.fillText(streak + ' CHAIR' + (streak === 1 ? '' : 'S') + ' IN A ROW', W - 8, 53);
    }
    // Client patience: the walk-in walks if you dawdle
    if (mode === 'play' && !bonus) {
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
    if (bonus && mode === 'play') {
      var br = bonus.t / (12 * 60);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(W / 2 - 40, 5, 80, 5);
      ctx.fillStyle = YELLOW;
      ctx.fillRect(W / 2 - 40, 5, 80 * br, 5);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerColor;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      if (bannerText === 'RUSH HOUR') ctx.fillText('FASTER LANES // MORE TRAFFIC // WET STREETS', W / 2, H / 2 - 12);
      if (bannerText === 'TIP RUN') ctx.fillText('EMPTY STREET // TWELVE SECONDS // GRAB EVERY JAR', W / 2, H / 2 - 12);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }

    if (inkCard > 0 && mode === 'play') {
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.6, inkCard / 30) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#12061f';
      ctx.fillRect(40, 108, W - 80, 96);
      ctx.strokeStyle = PURPLE; ctx.lineWidth = 3;
      ctx.strokeRect(40, 108, W - 80, 96);
      ctx.textAlign = 'center';
      ctx.fillStyle = PURPLE;
      ctx.font = 'bold 18px monospace';
      ctx.fillText('THE INK', W / 2, 140);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('RIDE THE STOOLS AND CARTS,', W / 2, 164);
      ctx.fillText('NEVER THE INK', W / 2, 180);
      ctx.fillStyle = LIME;
      ctx.font = '8px monospace';
      ctx.fillText('green outline = safe hop   red flash = ink', W / 2, 196);
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
    levelLabel: function (l) { return l + (l === 1 ? ' NIGHT' : ' NIGHTS') + ' // ' + stats.chairs + ' CHAIRS // ' + stats.matches + ' MATCHED // BEST ' + fmtBest(); },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function fmtBest() { var m = Math.min(4, 1 + stats.bestStreak * 0.5); return 'x' + (m % 1 === 0 ? m : m.toFixed(1)); }
  function enterBoard(v) { wall.enter(v, { level: wave, meta: { chairs: stats.chairs, streak: stats.bestStreak, near: stats.near, tips: stats.tips, matches: stats.matches, rides: stats.rides, bonusTips: stats.bonusTips } }); }
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
    ctx.fillText('ARROWS or TAP to hop // ride the ink on stools, carts and rugs', W / 2, H - 42);
    ctx.fillText('chairs say who they want // a match pays double, a streak stacks', W / 2, H - 29);
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
