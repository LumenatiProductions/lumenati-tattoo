(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 400, H = 320;
  var CELL = 20, COLS = 20, ROWS = 16;

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
  function sfxEat() { playSfx(700, 0.07, 'square', 0.1); setTimeout(function(){playSfx(1000, 0.08, 'square', 0.1);}, 50); }
  function sfxBonus() { playSfx(900, 0.08, 'square', 0.12); setTimeout(function(){playSfx(1200, 0.08, 'square', 0.12);}, 70); setTimeout(function(){playSfx(1500, 0.12, 'square', 0.12);}, 140); }
  function sfxDie() { playSfx(200, 0.25, 'sawtooth', 0.15); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#9b59b6', CYAN = '#00FFFF';

  // ── Chiptune: slinky grooves per level, a driving attract loop ──
  var SONGS = [
    { root: 110.00, bass: [0,-1,0,3, -1,3,5,-1, 0,-1,0,3, 7,-1,5,3],   lead: [12,-1,15,-1, 17,15,-1,12, -1,15,17,19, -1,17,15,-1] },
    { root: 123.47, bass: [0,0,-1,5, 3,-1,3,7, 0,0,-1,5, 8,-1,7,5],    lead: [15,-1,12,15, -1,17,19,-1, 15,-1,12,15, 22,-1,19,17] },
    { root: 98.00,  bass: [0,3,0,5, 0,3,0,7, 0,3,0,5, 10,8,7,5],      lead: [19,-1,17,-1, 15,-1,12,-1, 19,-1,17,15, -1,12,-1,-1] },
  ];
  var MENU_SONG = { root: 146.83, bass: [0,0,12,0, 5,5,17,5, 7,7,19,7, 5,5,17,5], lead: [12,-1,12,15, -1,19,-1,17, 19,-1,19,22, 19,17,15,12] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 13 : Math.max(9, 15 - level);
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

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, frame, snake, dir, turns, food, bonus, bonusT, eaten, stepEvery, respawnT, flashT;
  var blots, level, bannerT;
  var eatStreak, lastEat, popups;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-snake') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-snake', String(best)); } catch(e) {} }
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; frame = 0; eaten = 0; stepEvery = 9;
    bonus = null; bonusT = 0; respawnT = 0; flashT = 0; mode = 'intro'; introT = 0;
    blots = []; level = 1; bannerT = 0;
    eatStreak = 0; lastEat = -999; popups = [];
    musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    resetSnake();
    placeFood();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'Arrows or swipe to steer // machine +50';
    window.skateRunning = true;
    startLoop();
  }

  function resetSnake() {
    snake = [{x:9,y:8},{x:8,y:8},{x:7,y:8},{x:6,y:8}];
    dir = {x:1,y:0};
    turns = [];
  }

  function cellFree(x, y) {
    for (var i = 0; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) return false;
    for (var i = 0; i < blots.length; i++) if (blots[i].x === x && blots[i].y === y) return false;
    if (food && food.x === x && food.y === y) return false;
    if (bonus && bonus.x === x && bonus.y === y) return false;
    return true;
  }

  // Dried ink blots: level hazards that stain the board
  function addBlots(n) {
    var head = snake[0];
    for (var k = 0; k < n && blots.length < 10; k++) {
      var tries = 0, x, y;
      do {
        x = Math.floor(Math.random() * COLS);
        y = Math.floor(Math.random() * ROWS);
        tries++;
      } while ((!cellFree(x, y) || Math.abs(x - head.x) + Math.abs(y - head.y) < 5) && tries < 300);
      if (tries < 300) blots.push({ x: x, y: y, r: Math.random() * 6.28 });
    }
  }

  function randFree() {
    var x, y, tries = 0;
    do { x = Math.floor(Math.random() * COLS); y = Math.floor(Math.random() * ROWS); tries++; }
    while (!cellFree(x, y) && tries < 500);
    return {x:x, y:y};
  }

  function placeFood() { food = randFree(); }

  function turn(nx, ny) {
    var last = turns.length ? turns[turns.length - 1] : dir;
    if (nx === -last.x && ny === -last.y) return; // no 180s
    if (nx === last.x && ny === last.y) return;
    if (turns.length < 3) turns.push({x:nx, y:ny});
  }

  function die() {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    flashT = 12;
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
    snake.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      eatStreak = frame - lastEat < 110 ? Math.min(5, eatStreak + 1) : 1;
      lastEat = frame;
      var pts = 10 * eatStreak;
      score += pts; eaten++;
      document.getElementById('jd-br-score').textContent = score;
      popups.push({ x: head.x * CELL + 10, y: head.y * CELL, text: '+' + pts + (eatStreak > 1 ? ' x' + eatStreak : ''), color: eatStreak > 1 ? YELLOW : '#fff', life: 40 });
      sfxEat();
      stepEvery = Math.max(5, 9 - Math.floor(eaten / 4));
      var nl = 1 + Math.floor(eaten / 6);
      if (nl > level) {
        level = nl;
        bannerT = 80;
        addBlots(2);
        sfxBonus();
      }
      if (eaten % 5 === 0 && !bonus) { bonus = randFree(); bonusT = 300; }
      placeFood();
    } else if (bonus && head.x === bonus.x && head.y === bonus.y) {
      score += 50;
      document.getElementById('jd-br-score').textContent = score;
      popups.push({ x: head.x * CELL + 10, y: head.y * CELL, text: 'MACHINE +50', color: PURPLE, life: 45 });
      sfxBonus();
      bonus = null; bonusT = 0;
    } else {
      snake.pop();
    }
  }

  function update() {
    frame++;
    musicTick();
    if (flashT > 0) flashT--;
    if (bannerT > 0) bannerT--;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
    if (respawnT > 0) { respawnT--; return; }
    if (bonus) { bonusT--; if (bonusT <= 0) bonus = null; }
    if (frame % stepEvery === 0) step();
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

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-snake-board';
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
    ctx.fillText('SPACE or TAP to slither again', W / 2, 286);
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
    ctx.fillStyle = '#0b1210'; ctx.fillRect(0, 0, W, H);
    slam('INK SNAKE', 104, 32, LIME);
    // the drop runs for its life until the snap
    var catchT = 122;
    var hx = -40 + t2 * 3.2;
    var dxp = Math.min(320, 240 + t2 * 0.9);
    var caught = t2 >= catchT;
    var segs = caught ? 14 : 10;
    for (var i = 0; i < segs; i++) {
      var seg = hx - i * 17;
      if (seg < -20) continue;
      var syy = 208 + Math.sin(seg * 0.03) * 24;
      var rr = i === 0 ? 10 : 9 - (i / segs) * 3;
      ctx.fillStyle = i === 0 ? LIME : 'rgba(127,255,0,' + (1 - (i / segs) * 0.55).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(seg, syy, rr, 0, Math.PI * 2); ctx.fill();
      if (i > 0 && i % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath(); ctx.arc(seg, syy, rr * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
    var hyy = 208 + Math.sin(hx * 0.03) * 24;
    ctx.fillStyle = '#fff';
    ctx.fillRect(hx + 2, hyy - 6, 3, 3);
    if (!caught) {
      // fleeing drop with panic wobble + the tongue reaching for it
      var dyp = 208 + Math.sin(dxp * 0.03) * 24 + Math.sin(t2 * 0.6) * 3;
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(dxp, dyp + 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(dxp, dyp - 8); ctx.lineTo(dxp + 5, dyp); ctx.lineTo(dxp - 5, dyp); ctx.fill();
      if (t2 % 40 < 14) {
        ctx.fillStyle = '#e8283c';
        ctx.fillRect(hx + 10, hyy - 1, 8, 2);
        ctx.fillRect(hx + 18, hyy - 3, 2, 2);
        ctx.fillRect(hx + 18, hyy + 1, 2, 2);
      }
    } else if (t2 < catchT + 14) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((catchT + 14 - t2) * 0.04).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SNAP! +50', Math.min(320, hx), hyy - 24);
    }
    if (t2 > 140) { ctx.fillStyle = PINK; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('DRINK EVERY DROP // FEAST FOR STREAKS', W / 2, 146); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS or SWIPE to steer // drops +10, fading machine +50', W / 2, H - 42);
    ctx.fillText('levels dry ink blots onto the board - do not touch them', W / 2, H - 29);
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
    var board = BOARDS[(level - 1) % BOARDS.length];
    ctx.fillStyle = board.bg;
    ctx.fillRect(0, 0, W, H);
    // Parlor floor tiles in this level's ink
    ctx.fillStyle = board.chk;
    for (var y = 0; y < ROWS; y++) {
      for (var x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4);
    ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);

    // Food: a fat ink drop with a pulsing ripple
    if (food) {
      var fx = food.x * CELL + 10, fy = food.y * CELL + 10;
      var pulse = 7 + Math.sin(frame * 0.12) * 2;
      ctx.strokeStyle = 'rgba(255,20,147,' + (0.4 - Math.sin(frame * 0.12) * 0.2).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(fx, fy + 1, pulse + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(fx, fy + 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx, fy - 8); ctx.lineTo(fx + 5, fy); ctx.lineTo(fx - 5, fy); ctx.fill();
      ctx.fillStyle = '#ffb0cf';
      ctx.beginPath(); ctx.arc(fx - 2, fy, 1.7, 0, Math.PI * 2); ctx.fill();
    }

    // Bonus: a tattoo machine, blinking as it expires
    if (bonus && (bonusT > 90 || Math.floor(frame / 5) % 2 === 0)) {
      var bx = bonus.x * CELL + 5, by = bonus.y * CELL + 1;
      ctx.fillStyle = PURPLE;
      ctx.fillRect(bx, by + 2, 10, 10);
      ctx.fillStyle = '#8B5CF6';
      ctx.fillRect(bx + 2, by + 12, 6, 4);
      ctx.fillStyle = '#ccc';
      ctx.fillRect(bx + 4, by + 16, 2, 3);
      ctx.fillStyle = PINK;
      ctx.fillRect(bx + 1, by, 3, 3);
      ctx.fillRect(bx + 6, by, 3, 3);
    }

    // Dried ink blots
    for (var i = 0; i < blots.length; i++) {
      var bl = blots[i];
      var bx = bl.x * CELL + 10, by = bl.y * CELL + 10;
      ctx.fillStyle = '#3b1230';
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx + Math.cos(bl.r) * 6, by + Math.sin(bl.r) * 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx - Math.cos(bl.r) * 5, by - Math.sin(bl.r) * 7, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57204a';
      ctx.fillRect(bx - 2, by - 2, 3, 3);
    }

    // Snake: a rounded, scaled ink serpent
    var blink = respawnT > 0 && Math.floor(frame / 4) % 2 === 0;
    if (!blink) {
      for (var i = snake.length - 1; i >= 0; i--) {
        var seg = snake[i];
        var t = i / Math.max(1, snake.length - 1);
        var sx2 = seg.x * CELL + 10, sy2 = seg.y * CELL + 10;
        var r2 = i === 0 ? 9 : 8 - t * 2.5;
        ctx.fillStyle = i === 0 ? LIME : 'rgba(127,255,0,' + (1 - t * 0.55).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(sx2, sy2, r2, 0, Math.PI * 2); ctx.fill();
        if (i > 0 && i % 2 === 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.arc(sx2, sy2, r2 * 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Head: eyes set perpendicular to travel + a flicking tongue
      var h = snake[0];
      var hx = h.x * CELL + 10, hy = h.y * CELL + 10;
      ctx.fillStyle = '#fff';
      ctx.fillRect(hx + dir.x * 3 + dir.y * 4 - 1, hy + dir.y * 3 + dir.x * 4 - 1, 3, 3);
      ctx.fillRect(hx + dir.x * 3 - dir.y * 4 - 1, hy + dir.y * 3 - dir.x * 4 - 1, 3, 3);
      ctx.fillStyle = '#14121a';
      ctx.fillRect(hx + dir.x * 4 + dir.y * 4, hy + dir.y * 4 + dir.x * 4, 2, 2);
      ctx.fillRect(hx + dir.x * 4 - dir.y * 4, hy + dir.y * 4 - dir.x * 4, 2, 2);
      if (frame % 50 < 12) {
        ctx.fillStyle = '#e8283c';
        ctx.fillRect(hx + dir.x * 9 - 1, hy + dir.y * 9 - 1, 2 + Math.abs(dir.x) * 4, 2 + Math.abs(dir.y) * 4);
        ctx.fillRect(hx + dir.x * 13 + dir.y * 2 - 1, hy + dir.y * 13 + dir.x * 2 - 1, 2, 2);
        ctx.fillRect(hx + dir.x * 13 - dir.y * 2 - 1, hy + dir.y * 13 - dir.x * 2 - 1, 2, 2);
      }
    }

    // Hit flash
    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + (flashT / 40).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // Score popups
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      var pu = popups[i];
      ctx.globalAlpha = Math.min(1, pu.life / 18);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y);
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 8, 26);
    ctx.fillStyle = board.accent;
    ctx.textAlign = 'right';
    ctx.fillText('LEVEL ' + level, W - 8, 14);
    if (eatStreak > 1 && frame - lastEat < 110 && mode === 'play') {
      ctx.fillStyle = YELLOW;
      ctx.fillText('FEAST x' + eatStreak, W - 8, 26);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = board.accent;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LEVEL ' + level + ' — FRESH INK', W / 2, H / 2 - 30);
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
    while (acc >= 16.67) {
      if (mode === 'play') update();
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > 285) introT = 70; }
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
