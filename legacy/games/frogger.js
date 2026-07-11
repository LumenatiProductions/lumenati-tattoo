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
        cars.push({ x: j * spacing + Math.random() * 40, color: CAR_COLORS[(i * 2 + j) % CAR_COLORS.length], taxi: Math.random() < 0.18 });
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
    score = 0; lives = 3; wave = 1; frame = 0; invuln = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    doors = [false, false, false];
    amb = null; bannerT = 0; bannerText = '';
    makeLanes();
    resetPlayer();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Tap where to hop // fill all 3 chairs' : 'Arrows or tap to hop // fill all 3 chairs';
    window.skateRunning = true;
    startLoop();
  }

  function die() {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    sfxHit();
    if (lives <= 0) {
      enterBoard(score);
      saveBest();
      deathJingle();
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
        sayCallout(patience < patienceMax * 0.25 ? 'frogger-c2' : 'frogger-c1');
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
          say('frogger-c3', 300);
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
    musicTick();
    if (calloutCd > 0) calloutCd--;
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
    if (mode === 'intro') { mode = 'play'; return; }
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

  function drawCar(x, y, w, color, dir, taxi) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + 31, w / 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (taxi) color = '#f2c14e';
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 8, w, 20);
    if (taxi) {
      ctx.fillStyle = '#14121a';
      ctx.fillRect(x + w / 2 - 7, y + 4, 14, 5);
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(x + w / 2 - 5, y + 5, 10, 3);
    }
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

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-frogger-board';
  var board = [];
  try { board = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]') || []; } catch (e) {}
  var initials = ['A', 'A', 'A'];
  try {
    var lastN = localStorage.getItem('lumenati-arcade-initials');
    if (lastN && lastN.length === 3) initials = lastN.split('');
  } catch (e) {}
  var initSlot = 0, boardIdx = -1, finalScore = 0;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function fmtBoard(v) { return String(v); }

  function enterBoard(v) {
    finalScore = v;
    boardIdx = -1;
    initSlot = 0;
    mode = (v > 0 && (board.length < 5 || v > board[board.length - 1].s)) ? 'enter' : 'over';
    say(mode === 'enter' ? 'high-score' : 'game-over', 350);
  }

  function commitInitials() {
    var name = initials.join('');
    try { localStorage.setItem('lumenati-arcade-initials', name); } catch (e) {}
    board.push({ n: name, s: finalScore });
    board.sort(function(a, b) { return b.s - a.s; });
    board = board.slice(0, 5);
    boardIdx = -1;
    for (var i = 0; i < board.length; i++) {
      if (boardIdx === -1 && board[i].s === finalScore && board[i].n === name) boardIdx = i;
    }
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(board)); } catch (e) {}
    mode = 'over';
  }

  function cycleInit(dir) {
    initials[initSlot] = LETTERS[(LETTERS.indexOf(initials[initSlot]) + dir + 26) % 26];
  }

  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning || mode !== 'enter') return;
    e.preventDefault();
    if (/^Key[A-Z]$/.test(e.code)) {
      initials[initSlot] = e.code.charAt(3);
      if (initSlot < 2) initSlot++;
    } else if (e.code === 'ArrowUp') cycleInit(1);
    else if (e.code === 'ArrowDown') cycleInit(-1);
    else if (e.code === 'ArrowLeft') initSlot = Math.max(0, initSlot - 1);
    else if (e.code === 'ArrowRight') initSlot = Math.min(2, initSlot + 1);
    else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      if (initSlot < 2) initSlot++;
      else commitInitials();
    } else if (e.code === 'Backspace') initSlot = Math.max(0, initSlot - 1);
  });
  function enterTap(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var x = (clientX - r.left) * (W / r.width), y = (clientY - r.top) * (H / r.height);
    if (x > W / 2 - 50 && x < W / 2 + 50 && y > 224 && y < 258) { commitInitials(); return; }
    if (y < 132 || y > 214) return;
    initSlot = x < W / 2 - 20 ? 0 : x > W / 2 + 20 ? 2 : 1;
    if (y < 174) cycleInit(1); else cycleInit(-1);
  }
  canvas.addEventListener('click', function(e) { if (mode === 'enter') enterTap(e.clientX, e.clientY); });
  canvas.addEventListener('touchstart', function(e) {
    if (mode === 'enter') { e.preventDefault(); enterTap(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });

  function drawInitials() {
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = YELLOW;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HIGH SCORE!', W / 2, 70);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(fmtBoard(finalScore), W / 2, 94);
    ctx.fillStyle = '#9aa';
    ctx.font = '10px monospace';
    ctx.fillText('SIGN THE WALL', W / 2, 118);
    for (var i = 0; i < 3; i++) {
      var x = W / 2 + (i - 1) * 40;
      var active = i === initSlot;
      if (active) {
        ctx.fillStyle = PINK;
        ctx.font = 'bold 12px monospace';
        ctx.fillText('\u25b2', x, 146);
        ctx.fillText('\u25bc', x, 208);
      }
      ctx.fillStyle = active && Math.floor(frame / 8) % 2 === 0 ? PINK : '#fff';
      ctx.font = 'bold 30px monospace';
      ctx.fillText(initials[i], x, 184);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 12, 190, 24, 2);
    }
    ctx.fillStyle = PINK;
    ctx.fillRect(W / 2 - 40, 226, 80, 26);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('OK', W / 2, 243);
    ctx.fillStyle = '#9aa';
    ctx.font = '9px monospace';
    ctx.fillText('TYPE or ARROWS // SPACE confirms', W / 2, 274);
  }

  function drawBoard() {
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PINK;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, 58);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('Score: ' + fmtBoard(finalScore), W / 2, 84);
    ctx.fillStyle = CYAN;
    ctx.font = 'bold 11px monospace';
    ctx.fillText('SHOP LEADERBOARD', W / 2, 116);
    ctx.font = 'bold 13px monospace';
    for (var i = 0; i < 5; i++) {
      var ly = 140 + i * 24;
      var e2 = board[i];
      var mine = i === boardIdx;
      ctx.fillStyle = mine ? YELLOW : (e2 ? '#fff' : 'rgba(255,255,255,0.25)');
      ctx.textAlign = 'left';
      ctx.fillText((i + 1) + '.', 100, ly);
      ctx.fillText(e2 ? e2.n : '---', 134, ly);
      ctx.textAlign = 'right';
      ctx.fillText(e2 ? fmtBoard(e2.s) : '-', 300, ly);
      if (mine && Math.floor(frame / 10) % 2 === 0) {
        ctx.textAlign = 'left';
        ctx.fillStyle = PINK;
        ctx.fillText('\u25b8', 84, ly);
      }
    }
    ctx.fillStyle = YELLOW;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPACE or TAP to cross again', W / 2, 286);
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
    ctx.fillText('ARROWS or TAP to hop // door +100, all 3 chairs +250', W / 2, H - 42);
    ctx.fillText('beat their cold feet, dodge the ambulance // nights get meaner', W / 2, H - 29);
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

    // Street lamps pour light onto the lanes
    for (var i = 0; i < 2; i++) {
      var lpx = 140 + i * 180;
      for (var rr2 = 0; rr2 < 2; rr2++) {
        var lpy = rr2 === 0 ? ROW_Y[4] : ROW_Y[7];
        var pool = ctx.createRadialGradient(lpx, lpy - 18, 4, lpx, lpy - 18, 60);
        pool.addColorStop(0, 'rgba(255,220,150,0.14)');
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
    for (var i = 0; i < boxes.length; i++) {
      var bxx = boxes[i][1];
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(bxx + 8, ROW_Y[4] + 33, 9, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = boxes[i][0];
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
        drawCar(ln.cars[j].x, ROW_Y[ln.row], ln.w, ln.cars[j].color, ln.dir, ln.cars[j].taxi);
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
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(px, ROW_Y[player.row] + CELL / 2 + 13, 8, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
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
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > 285) introT = 70; }
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
