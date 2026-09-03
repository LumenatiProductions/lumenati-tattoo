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
  var blots, level, bannerT, bannerText;
  var eatStreak, lastEat, popups, frenzyT;
  var gold, goldT, stencil, stencilT, mop, particles, shake, lastTail, grew;
  var bestStreak, maxLen, levelEaten, feastWindow;
  var FEAST_WINDOW = 110;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-snake') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-snake', String(best)); } catch(e) {} }
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; frame = 0; eaten = 0; stepEvery = 9;
    bonus = null; bonusT = 0; respawnT = 0; flashT = 0; mode = 'intro'; introT = 0;
    blots = []; level = 1; bannerT = 0; bannerText = '';
    eatStreak = 0; lastEat = -999; popups = []; frenzyT = 0;
    gold = null; goldT = 0; stencil = null; stencilT = 0; mop = null; particles = []; shake = 0; lastTail = null; grew = false;
    bestStreak = 0; maxLen = 4; levelEaten = 0;
    musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    resetSnake();
    placeFood();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Swipe to steer // feast fast for x5' : 'Arrows to steer // feast fast for x5';
    window.skateRunning = true;
    startLoop();
  }

  function resetSnake() {
    snake = [{x:9,y:8},{x:8,y:8},{x:7,y:8},{x:6,y:8}];
    dir = {x:1,y:0};
    turns = [];
    lastTail = null;
    // Nothing deadly waits on the spawn lane.
    if (blots) blots = blots.filter(function (b) { return !(b.y >= 6 && b.y <= 10 && b.x >= 4 && b.x <= 15); });
    if (mop && mop.y >= 6 && mop.y <= 10) mop = null;
  }

  function cellFree(x, y) {
    for (var i = 0; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) return false;
    for (var i = 0; i < blots.length; i++) if (blots[i].x === x && blots[i].y === y) return false;
    if (food && food.x === x && food.y === y) return false;
    if (bonus && bonus.x === x && bonus.y === y) return false;
    if (gold && gold.x === x && gold.y === y) return false;
    if (stencil && stencil.x === x && stencil.y === y) return false;
    if (mop && mop.y === y) return false;
    return true;
  }

  // Dried ink blots: level hazards that stain the board
  function addBlots(n) {
    var head = snake[0];
    for (var k = 0; k < n && blots.length < 14; k++) {
      var tries = 0, x, y;
      do {
        x = Math.floor(Math.random() * COLS);
        y = Math.floor(Math.random() * ROWS);
        tries++;
      } while ((!cellFree(x, y) || Math.abs(x - head.x) + Math.abs(y - head.y) < 5) && tries < 300);
      if (tries < 300) blots.push({ x: x, y: y, r: Math.random() * 6.28, born: frame });
    }
  }

  function randFree() {
    var x, y, tries = 0;
    do { x = Math.floor(Math.random() * COLS); y = Math.floor(Math.random() * ROWS); tries++; }
    while (!cellFree(x, y) && tries < 500);
    return {x:x, y:y};
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

  // The mop: from level 4 a bucket-and-mop works one row, end to end. Its lane
  // is painted so nobody walks into it blind.
  function spawnMop() {
    var head = snake[0];
    var y, tries = 0;
    do { y = 1 + Math.floor(Math.random() * (ROWS - 2)); tries++; } while (Math.abs(y - head.y) < 3 && tries < 50);
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
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      var blocked = false;
      for (var j = 0; j < snake.length; j++) if (snake[j].x === nx && snake[j].y === ny) blocked = true;
      for (var j = 0; j < blots.length; j++) if (blots[j].x === nx && blots[j].y === ny) blocked = true;
      if (bonus && bonus.x === nx && bonus.y === ny) blocked = true;
      if (gold && gold.x === nx && gold.y === ny) blocked = true;
      if (stencil && stencil.x === nx && stencil.y === ny) blocked = true;
      if (mop && mop.y === ny) blocked = true;
      if (blocked) continue;
      var d = Math.abs(nx - snake[0].x) + Math.abs(ny - snake[0].y);
      if (d > bd) { bd = d; bx = nx; by = ny; }
    }
    // only run when the snake is closing in
    var cur = Math.abs(food.x - snake[0].x) + Math.abs(food.y - snake[0].y);
    if (cur < 7 && bd > cur) { food.x = bx; food.y = by; }
  }

  function turn(nx, ny) {
    var last = turns.length ? turns[turns.length - 1] : dir;
    if (nx === -last.x && ny === -last.y) return; // no 180s
    if (nx === last.x && ny === last.y) return;
    if (turns.length < 3) turns.push({x:nx, y:ny});
  }

  // ── Juice: ink particles and a camera shake ──
  function burst(x, y, color, n, speed) {
    for (var i = 0; i < n && particles.length < 160; i++) {
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

  function die() {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    flashT = 12; shake = 14;
    // the serpent comes apart in ink
    for (var i = 0; i < snake.length; i++) burst(snake[i].x * CELL + 10, snake[i].y * CELL + 10, i === 0 ? '#fff' : LIME, i === 0 ? 10 : 2, 3);
    eatStreak = 0; frenzyT = 0;
    if (lives <= 0) {
      enterBoard(score);
      saveBest();
      deathJingle();
    } else {
      sfxDie();
      resetSnake();
      respawnT = 45;
    }
  }

  // Points per drop grow with the serpent: a long snake is a risky snake.
  function baseDrop() { return 10 + Math.floor(snake.length / 5) * 2; }

  function step() {
    if (turns.length) dir = turns.shift();
    var head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { die(); return; }
    for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) { die(); return; }
    }
    for (var i = 0; i < blots.length; i++) {
      if (blots[i].x === head.x && blots[i].y === head.y) { die(); return; }
    }
    if (mop && mop.x === head.x && mop.y === head.y) { die(); return; }
    snake.unshift(head);
    grew = false;
    var hx = head.x * CELL + 10, hy = head.y * CELL + 4;
    if (food && head.x === food.x && head.y === food.y) {
      grew = true;
      eatStreak = frame - lastEat < FEAST_WINDOW ? Math.min(5, eatStreak + 1) : 1;
      if (eatStreak > bestStreak) bestStreak = eatStreak;
      lastEat = frame;
      var wasLive = food.live, risky = food.risky, quick = frame - food.born < 150;
      var pts = (wasLive ? 30 : baseDrop() * eatStreak) * (frenzyT > 0 ? 2 : 1) * (risky ? 2 : 1);
      score += pts; eaten++; levelEaten++;
      document.getElementById('jd-br-score').textContent = score;
      var tag = wasLive ? 'CAUGHT' : risky ? 'RISKY x2' : '';
      popup(hx, hy, (tag ? tag + ' ' : '') + '+' + pts + (!wasLive && eatStreak > 1 ? ' x' + eatStreak : ''), wasLive ? PINK : risky ? '#ff5040' : eatStreak > 1 ? YELLOW : '#fff');
      burst(hx, hy + 6, wasLive ? PINK : '#ff5fb0', 8 + eatStreak * 2);
      if (quick && !wasLive) { addScore(20, hx, hy - 14, 'QUICK', CYAN); }
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
      stepEvery = Math.max(4, 9 - Math.floor(eaten / 6));
      var nl = 1 + Math.floor(eaten / 7);
      if (nl > level) {
        level = nl; levelEaten = 0;
        bannerT = 90;
        var clear = level * 100 + (eatStreak >= 3 ? 50 : 0);
        bannerText = 'LEVEL ' + level + ' // FRESH INK +' + clear;
        score += clear;
        document.getElementById('jd-br-score').textContent = score;
        addBlots(level >= 4 ? 3 : 2);
        if (level >= 4 && !mop) spawnMop();
        for (var c = 0; c < 26; c++) burst(Math.random() * W, -4, BOARDS[(level - 1) % BOARDS.length].accent, 1, 1.5);
        sayCallout('snake-c1');
        sfxBonus();
      }
      if (eaten % 5 === 0 && !bonus) { bonus = randFree(); bonusT = 300; }
      if (level >= 2 && !gold && Math.random() < 0.22) { gold = randFree(); goldT = 200; }
      if (level >= 3 && !stencil && snake.length >= 14 && Math.random() < 0.3) { stencil = randFree(); stencilT = 420; }
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
      for (var s = 0; s < cut; s++) { var tl = snake.pop(); burst(tl.x * CELL + 10, tl.y * CELL + 10, CYAN, 3); }
      popup(hx, hy, 'STENCIL -' + cut, CYAN, 45);
      sfxEat();
      stencil = null; stencilT = 0;
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
    if (frame % (stepEvery * 3) === 0 && respawnT === 0) fleeStep();
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.96; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (respawnT > 0) { respawnT--; return; }
    if (bonus) { bonusT--; if (bonusT <= 0) bonus = null; }
    if (gold) { goldT--; if (goldT <= 0) gold = null; }
    if (stencil) { stencilT--; if (stencilT <= 0) stencil = null; }
    if (frame % stepEvery === 0) { step(); mopStep(); }
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
    levelLabel: function (l) { return 'LEVEL ' + l + ' // ' + eaten + ' DROPS // LONGEST ' + maxLen; },
  });
  function enterBoard(v) { wall.enter(v, { level: level, meta: { combo: bestStreak, len: maxLen, eaten: eaten } }); }
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
    if (t2 > 140) { ctx.fillStyle = PINK; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('DRINK EVERY DROP // FEAST FOR STREAKS', W / 2, 146); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS or SWIPE to steer // a longer snake is worth more per drop', W / 2, H - 42);
    ctx.fillText('feast fast for x5 and FRENZY // red-ringed drops pay double // avoid the X blots', W / 2, H - 29);
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
    var p = respawnT > 0 ? 1 : ((frame % stepEvery) + 1) / stepEvery;
    var pts = [];
    var c = function (s) { return { x: s.x * CELL + 10, y: s.y * CELL + 10 }; };
    var head = c(snake[0]);
    if (snake.length > 1) {
      var neck = c(snake[1]);
      // no lerp across a respawn jump
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

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var board = BOARDS[(level - 1) % BOARDS.length];
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.fillStyle = board.bg;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    // Parlor floor tiles in this level's ink, grout lines, the sign's glow
    ctx.fillStyle = board.chk;
    for (var y = 0; y < ROWS; y++) {
      for (var x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    for (var gx = 0; gx <= COLS; gx++) { ctx.moveTo(gx * CELL + 0.5, 0); ctx.lineTo(gx * CELL + 0.5, H); }
    for (var gy = 0; gy <= ROWS; gy++) { ctx.moveTo(0, gy * CELL + 0.5); ctx.lineTo(W, gy * CELL + 0.5); }
    ctx.stroke();
    drawFloorGlow(board, 1 + Math.sin(frame * 0.05) * 0.3);
    // a slow light sweep, like a sign flickering across a wet floor
    var sweep = ((frame * 0.7) % (W + 200)) - 100;
    var sg = ctx.createLinearGradient(sweep - 60, 0, sweep + 60, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.025)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4);
    ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('LUMENATI TATTOO', W - 8, H - 8);

    if (frenzyT > 0) {
      ctx.fillStyle = 'rgba(255,99,71,' + (0.04 + Math.abs(Math.sin(frame * 0.1)) * 0.05).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      // hot edges
      var eg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.8);
      eg.addColorStop(0, 'rgba(255,99,71,0)'); eg.addColorStop(1, 'rgba(255,99,71,' + (0.18 + Math.sin(frame * 0.2) * 0.06).toFixed(2) + ')');
      ctx.fillStyle = eg; ctx.fillRect(0, 0, W, H);
    }

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
      // bucket, handle, mop head
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

    // Food: a fat ink drop; the live ones jitter and sprout legs
    var lookAt = null;
    if (food) {
      var fx = food.x * CELL + 10, fy = food.y * CELL + 10;
      if (food.live) { fx += Math.sin(frame * 0.5) * 1.5; fy += Math.cos(frame * 0.7) * 1; }
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

    // Dried ink blots: marked hazards with a loud spawn warning
    for (var i = 0; i < blots.length; i++) {
      var bl = blots[i];
      var bx = bl.x * CELL + 10, by = bl.y * CELL + 10;
      var age = frame - (bl.born || 0);
      if (age < 70) {
        var wr = 12 - (age / 70) * 3;
        ctx.strokeStyle = Math.floor(frame / 5) % 2 === 0 ? '#ff5040' : 'rgba(255,80,64,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, wr, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = '#2a0c22';
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + Math.cos(bl.r) * 6, by + Math.sin(bl.r) * 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx - Math.cos(bl.r) * 5, by - Math.sin(bl.r) * 7, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(bx - 2, by - 2, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,64,0.85)';
      ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff5040';
      ctx.beginPath();
      ctx.moveTo(bx - 3, by - 3); ctx.lineTo(bx + 3, by + 3);
      ctx.moveTo(bx + 3, by - 3); ctx.lineTo(bx - 3, by + 3);
      ctx.stroke();
    }

    // The serpent
    var blink = respawnT > 0 && Math.floor(frame / 4) % 2 === 0;
    drawSerpent(serpentPoints(), dir, 9, blink, lookAt);

    // Ink particles
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 14);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

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
    ctx.fillText('LEVEL ' + level, W - 8, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('LEN ' + snake.length + ' // ' + baseDrop() + '/DROP', W - 8, 26);
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
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, H / 2 - 52, W, 40);
      ctx.fillStyle = board.accent;
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
