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
  function sfxPaddle() { playSfx(300, 0.05, 'square', 0.1); }
  function sfxBrick(row) { playSfx(500 + row * 80, 0.06, 'square', 0.11); }
  function sfxWall() { playSfx(220, 0.04, 'square', 0.08); }
  function sfxLose() { playSfx(180, 0.3, 'sawtooth', 0.15); }
  function sfxLevel() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
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

  // ── This game's own chiptune: bouncy demolition major ──
  var SONGS = [
    { root: 130.81, bass: [0,-1,7,-1, 0,-1,7,-1, 5,-1,9,-1, 7,-1,5,-1], lead: [12,16,19,-1, 16,-1,12,-1, 17,21,24,-1, 19,-1,16,-1] },
    { root: 146.83, bass: [0,0,-1,7, 5,5,-1,9, 0,0,-1,7, 10,-1,9,7],   lead: [19,-1,16,12, -1,17,-1,21, 19,-1,16,12, 24,-1,21,19] },
  ];
  var MENU_SONG = { root: 164.81, bass: [0,-1,7,-1, 5,-1,9,-1, 0,-1,7,-1, 10,9,7,5], lead: [16,-1,19,16, -1,21,19,-1, 16,-1,19,24, 21,19,16,-1] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 12 : Math.max(9, 15 - level);
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
  }
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#9b59b6', CYAN = '#00FFFF';

  var COLS = 12, BW = 30, BH = 11, BGAP = 2, BTOP = 34;
  var BLEFT = (W - (COLS * BW + (COLS - 1) * BGAP)) / 2;

  // Every sheet is a flash design; break it off the wall tile by tile.
  var DESIGNS = [
    { name: 'HEART', color: '#FF1493', rows: [
      '.XXX....XXX.', 'XXXXX..XXXXX', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX',
      '.XXXXXXXXXX.', '..XXXXXXXX..', '....XXXX....', '.....XX.....'] },
    { name: 'SKULL', color: '#e8e4d8', rows: [
      '..XXXXXXXX..', '.XXXXXXXXXX.', '.XXXXXXXXXX.', '.XX.XXXX.XX.',
      '.XX.XXXX.XX.', '..XXX..XXX..', '..XXXXXXXX..', '...X.XX.X...'] },
    { name: 'BOLT', color: '#FFD700', rows: [
      '......XXXX..', '.....XXXX...', '....XXXX....', '..XXXXXXXX..',
      '.....XXX....', '....XXX.....', '...XXX......', '..XXX.......'] },
    { name: 'STAR', color: '#00FFFF', rows: [
      '.....XX.....', '....XXXX....', 'XXXXXXXXXXXX', '.XXXXXXXXXX.',
      '..XXXXXXXX..', '..XXX..XXX..', '.XXX....XXX.', '.XX......XX.'] },
    { name: 'DAGGER', color: '#b8c4d0', rows: [
      '.....XX.....', '....XXXX....', '..XXXXXXXX..', '.....XX.....',
      '.....XX.....', '.....XX.....', '.....XX.....', '......X.....'] },
    { name: 'ANCHOR', color: '#2d6cdf', rows: [
      '.....XX.....', '....XXXX....', '.....XX.....', '..XXXXXXXX..',
      '.....XX.....', '.X...XX...X.', '.XX..XX..XX.', '..XXXXXXXX..'] },
    { name: 'ROSE', color: '#e8283c', rows: [
      '...XXXXXX...', '..XXX.XXXX..', '..XX.XX.XX..', '..XXX.XXXX..',
      '...XXXXXX...', '.X...XX...X.', '.XXX.XX.XXX.', '.....XX.....'] },
  ];
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, level, frame, flashT, bannerT, bannerText;
  var paddle, balls, bricks, particles, trail, paddleFlash;
  var drops, lasers, wideT, laserT, laserCd, popups;
  var keyL = false, keyR = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-bricks') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-bricks', String(best)); } catch(e) {} }
  }

  function design() { return DESIGNS[(level - 1) % DESIGNS.length]; }

  function buildBricks() {
    bricks = [];
    var d = design();
    // Second time around the book, every tile takes two hits
    var hp = level > DESIGNS.length ? 2 : 1;
    for (var r = 0; r < d.rows.length; r++) {
      for (var c = 0; c < COLS; c++) {
        if (d.rows[r][c] !== 'X') continue;
        bricks.push({
          x: BLEFT + c * (BW + BGAP), y: BTOP + r * (BH + BGAP),
          row: r, hp: hp, maxHp: hp,
          color: shade(d.color, 1 - r * 0.08),
        });
      }
    }
  }

  function makeBall() {
    return { x: paddle.x + paddle.w / 2, y: paddle.y - 6, vx: 0, vy: 0, r: 4, stuck: true };
  }

  function serve() {
    balls = [makeBall()];
  }

  function launch() {
    var sp = 3.6 + Math.min(3, (level - 1) * 0.35);
    for (var i = 0; i < balls.length; i++) {
      if (!balls[i].stuck) continue;
      balls[i].stuck = false;
      var a = -Math.PI / 3 + Math.random() * (Math.PI / 6);
      balls[i].vx = Math.cos(a) * sp * (Math.random() < 0.5 ? 1 : -1);
      balls[i].vy = -Math.abs(Math.sin(a) * sp);
    }
  }

  function addPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 45 });
  }

  // ── Capsules: the good stuff falls out of broken bricks ──
  function maybeDrop(x, y) {
    if (Math.random() > 0.16) return;
    var r = Math.random();
    var kind = r < 0.25 ? 'multi' : r < 0.5 ? 'wide' : r < 0.7 ? 'slow' : r < 0.9 ? 'laser' : 'life';
    drops.push({ x: x, y: y, vy: 1.5, kind: kind });
  }

  function applyDrop(kind) {
    if (kind === 'multi') {
      var flying = [];
      for (var i = 0; i < balls.length; i++) if (!balls[i].stuck) flying.push(balls[i]);
      var src = flying.length ? flying : balls;
      var added = 0;
      for (var i = 0; i < src.length && balls.length < 6 && added < 2; i++) {
        var b0 = src[i];
        var sp0 = Math.max(3.2, Math.hypot(b0.vx, b0.vy)) || 3.6;
        for (var k = -1; k <= 1 && balls.length < 6 && added < 2; k += 2) {
          var ang = Math.atan2(b0.vy || -1, b0.vx || 0.4) + k * 0.5;
          balls.push({ x: b0.x, y: b0.y, vx: Math.cos(ang) * sp0, vy: Math.sin(ang) * sp0, r: 4, stuck: false });
          added++;
        }
      }
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'MULTIBALL!', PINK);
      sfxLevel();
    } else if (kind === 'wide') {
      wideT = 1200;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'WIDE!', CYAN);
      sfxPaddle();
    } else if (kind === 'slow') {
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].stuck) continue;
        balls[i].vx *= 0.72; balls[i].vy *= 0.72;
        var mn = Math.hypot(balls[i].vx, balls[i].vy);
        if (mn < 2.4 && mn > 0) { balls[i].vx *= 2.4 / mn; balls[i].vy *= 2.4 / mn; }
      }
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'SLOW-MO', LIME);
      sfxWall();
    } else if (kind === 'laser') {
      laserT = 800;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'LASERS!', YELLOW);
      sfxLevel();
    } else {
      if (lives < 5) {
        lives++;
        document.getElementById('jd-br-lives').textContent = lives;
      }
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, '+1 LIFE', '#7FFF00');
      sfxLevel();
    }
  }

  function fireLaser() {
    if (laserT <= 0 || laserCd > 0) return;
    laserCd = 13;
    lasers.push({ x: paddle.x + 5, y: paddle.y - 4 });
    lasers.push({ x: paddle.x + paddle.w - 5, y: paddle.y - 4 });
    playSfx(1200, 0.05, 'square', 0.08);
  }

  // A brick takes a hit from anything; returns true when it broke
  function damageBrick(i, hx, hy) {
    var b = bricks[i];
    b.hp--;
    sfxBrick(b.row);
    if (b.hp <= 0) {
      score += b.maxHp === 2 ? 20 : 10;
      spawnParticles(hx, hy, b.color, 8);
      maybeDrop(b.x + BW / 2, b.y + BH / 2);
      bricks.splice(i, 1);
    } else {
      score += 5;
      spawnParticles(hx, hy, '#fff', 4);
    }
    document.getElementById('jd-br-score').textContent = score;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; level = 1; frame = 0; flashT = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    bannerT = 0; bannerText = '';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    paddle = { x: W / 2 - 30, y: 298, w: 60, h: 8 };
    particles = []; trail = []; paddleFlash = 0;
    drops = []; lasers = []; wideT = 0; laserT = 0; laserCd = 0; popups = [];
    buildBricks();
    serve();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'Arrows, mouse or drag // SPACE launches';
    window.skateRunning = true;
    startLoop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 2.5 - 0.5,
        life: 18 + Math.random() * 12,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (paddleFlash > 0) paddleFlash--;
    if (flashT > 0) flashT--;

    // Paddle
    if (keyL) paddle.x -= 6;
    if (keyR) paddle.x += 6;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    if (wideT > 0) wideT--;
    if (laserT > 0) laserT--;
    if (laserCd > 0) laserCd--;
    paddle.w = wideT > 0 ? 92 : 60;

    // Balls in flight
    for (var bi = balls.length - 1; bi >= 0; bi--) {
      var ball = balls[bi];
      if (ball.stuck) {
        ball.x = paddle.x + paddle.w / 2;
        ball.y = paddle.y - 6;
        continue;
      }
      ball.x += ball.vx;
      ball.y += ball.vy;
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 14) trail.shift();

      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); sfxWall(); }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); sfxWall(); }
      if (ball.y < ball.r + 16) { ball.y = ball.r + 16; ball.vy = Math.abs(ball.vy); sfxWall(); }

      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 6 &&
          ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
        var rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        rel = Math.max(-1, Math.min(1, rel));
        var sp = Math.min(8, Math.hypot(ball.vx, ball.vy) * 1.02);
        var ang = rel * (Math.PI / 3);
        ball.vx = Math.sin(ang) * sp;
        ball.vy = -Math.abs(Math.cos(ang) * sp);
        ball.y = paddle.y - ball.r;
        paddleFlash = 8;
        sfxPaddle();
      }

      for (var i = 0; i < bricks.length; i++) {
        var b = bricks[i];
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + BW &&
            ball.y + ball.r > b.y && ball.y - ball.r < b.y + BH) {
          var overX = Math.min(ball.x + ball.r - b.x, b.x + BW - (ball.x - ball.r));
          var overY = Math.min(ball.y + ball.r - b.y, b.y + BH - (ball.y - ball.r));
          if (overX < overY) ball.vx = ball.x < b.x + BW / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
          else ball.vy = ball.y < b.y + BH / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
          damageBrick(i, ball.x, ball.y);
          break;
        }
      }

      if (ball.y > H + 10) balls.splice(bi, 1);
    }

    // Lasers chew upward
    for (var li = lasers.length - 1; li >= 0; li--) {
      var lz = lasers[li];
      lz.y -= 7;
      var gone = lz.y < 14;
      for (var i = 0; i < bricks.length && !gone; i++) {
        var b = bricks[i];
        if (lz.x > b.x && lz.x < b.x + BW && lz.y > b.y && lz.y < b.y + BH) {
          damageBrick(i, lz.x, lz.y);
          gone = true;
        }
      }
      if (gone) lasers.splice(li, 1);
    }

    // Capsules fall toward the paddle
    for (var di = drops.length - 1; di >= 0; di--) {
      var d = drops[di];
      d.y += d.vy;
      d.vy = Math.min(2.6, d.vy + 0.02);
      if (d.y > paddle.y - 8 && d.y < paddle.y + paddle.h + 8 && d.x > paddle.x - 8 && d.x < paddle.x + paddle.w + 8) {
        applyDrop(d.kind);
        drops.splice(di, 1);
      } else if (d.y > H + 12) {
        drops.splice(di, 1);
      }
    }

    // Cleared the sheet
    if (bricks.length === 0) {
      level++;
      sfxLevel();
      buildBricks();
      drops = []; lasers = [];
      serve();
      bannerT = 90;
      bannerText = 'SHEET ' + level + ': ' + design().name;
      sayCallout(['bricks-c1', 'bricks-c2', 'bricks-c3'][level % 3]);
    }

    // Every ball dropped
    if (balls.length === 0) {
      lives--;
      document.getElementById('jd-br-lives').textContent = lives;
      flashT = 12;
      sfxLose();
      wideT = 0; laserT = 0; drops = []; lasers = [];
      if (lives <= 0) {
        enterBoard(score);
        saveBest();
        deathJingle();
        return;
      }
      serve();
    }

    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
    fireLaser();
    launch();
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); keyL = true; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); keyR = true; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) start(); }
  });
  document.addEventListener('keyup', function(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
  });
  function canvasX(clientX) {
    var r = canvas.getBoundingClientRect();
    return (clientX - r.left) * (W / r.width);
  }
  canvas.addEventListener('mousemove', function(e) {
    paddle.x = Math.max(0, Math.min(W - paddle.w, canvasX(e.clientX) - paddle.w / 2));
  });
  canvas.addEventListener('click', function() { start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    paddle.x = Math.max(0, Math.min(W - paddle.w, canvasX(e.touches[0].clientX) - paddle.w / 2));
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    paddle.x = Math.max(0, Math.min(W - paddle.w, canvasX(e.touches[0].clientX) - paddle.w / 2));
  }, { passive: false });

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-bricks-board';
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
    ctx.fillText('SPACE or TAP to break again', W / 2, 286);
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
    ctx.fillStyle = '#100a18'; ctx.fillRect(0, 0, W, H);
    slam('FLASH BREAKER', 96, 24, YELLOW);
    var rowCols = [PINK, '#FF8A00', YELLOW, LIME, CYAN, '#b8c4d0', PINK, YELLOW, LIME, CYAN];
    var impactT = 96;
    // the wall assembles brick by brick
    for (var i = 0; i < 10; i++) {
      for (var r2 = 0; r2 < 2; r2++) {
        var lt2 = Math.max(0, Math.min(1, (t2 - 14 - i * 4 - r2 * 12) / 12));
        if (lt2 <= 0) continue;
        var bx5 = 12 + i * 38, by5 = (150 + r2 * 15) - (1 - lt2) * (1 - lt2) * 170;
        var smashed = t2 > impactT && Math.abs(bx5 + 17 - 200) < 62;
        if (smashed) continue;
        ctx.fillStyle = rowCols[(i + r2) % rowCols.length];
        ctx.fillRect(bx5, by5, 34, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(bx5, by5, 34, 2);
      }
    }
    // the ball drops, smashes through, shards everywhere
    if (t2 > 68) {
      var byp, bxp = 200;
      if (t2 <= impactT) {
        var fp = (t2 - 68) / (impactT - 68);
        byp = -10 + fp * fp * 165;
      } else {
        byp = 155 + Math.abs(Math.sin((t2 - impactT) * 0.09)) * 70;
      }
      ctx.fillStyle = 'rgba(255,20,147,0.3)';
      ctx.fillRect(bxp - 2, byp - 16, 4, 12);
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(bxp, byp, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (t2 > impactT && t2 < impactT + 26) {
      var sp2 = t2 - impactT;
      if (sp2 < 5) {
        ctx.fillStyle = 'rgba(255,255,255,' + ((5 - sp2) * 0.12).toFixed(2) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      for (var k = 0; k < 14; k++) {
        var ang2 = (k / 14) * Math.PI * 2;
        var dist2 = sp2 * (2 + (k % 3));
        ctx.fillStyle = rowCols[k % rowCols.length];
        ctx.globalAlpha = Math.max(0, 1 - sp2 / 26);
        ctx.fillRect(200 + Math.cos(ang2) * dist2, 158 + Math.sin(ang2) * dist2 + sp2 * sp2 * 0.05, 4, 4);
      }
      ctx.globalAlpha = 1;
    }
    if (t2 > 130) { ctx.fillStyle = CYAN; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('BREAK THE WHOLE BOOK', W / 2, 250); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS, MOUSE or DRAG // SPACE launches and fires lasers', W / 2, H - 42);
    ctx.fillText('catch capsules: Multi, Wide, Slow, Laser, +Life', W / 2, H - 29);
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
    ctx.fillStyle = '#100a18';
    ctx.fillRect(0, 0, W, H);
    // The room glows faintly in this sheet's ink
    var tint = ctx.createRadialGradient(W / 2, 120, 30, W / 2, 120, 260);
    tint.addColorStop(0, design().color + '18');
    tint.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);

    // Ceiling line
    ctx.fillStyle = '#2a2438';
    ctx.fillRect(0, 16, W, 2);

    // Bricks: the flash design, tile by tile
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      ctx.fillStyle = b.color;
      ctx.globalAlpha = b.maxHp === 2 && b.hp === 1 ? 0.5 : 1;
      ctx.fillRect(b.x, b.y, BW, BH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x, b.y, BW, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x, b.y + BH - 2, BW, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + BW / 2 - 1, b.y + BH / 2 - 1, 2, 2);
    }

    // Paddle: a tattoo machine grip
    ctx.fillStyle = '#ccc';
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.fillStyle = PINK;
    ctx.fillRect(paddle.x + paddle.w / 2 - 6, paddle.y, 12, paddle.h);
    ctx.fillStyle = paddleFlash > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(paddle.x, paddle.y, paddle.w, 2);
    if (paddleFlash > 0) {
      ctx.fillStyle = 'rgba(255,20,147,' + (paddleFlash * 0.05).toFixed(2) + ')';
      ctx.fillRect(paddle.x - 4, paddle.y - 4, paddle.w + 8, paddle.h + 8);
    }

    // Trails + every ball in flight
    for (var i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (i / trail.length) * 0.3;
      ctx.fillStyle = PINK;
      ctx.fillRect(trail[i].x - 2, trail[i].y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    for (var i = 0; i < balls.length; i++) {
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(balls[i].x, balls[i].y, balls[i].r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(balls[i].x - 1, balls[i].y - 2, 2, 2);
    }

    // Falling capsules
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      var dc = d.kind === 'multi' ? PINK : d.kind === 'wide' ? CYAN : d.kind === 'slow' ? LIME : d.kind === 'laser' ? YELLOW : '#7FFF00';
      ctx.fillStyle = '#efe9dc';
      ctx.fillRect(d.x - 8, d.y - 5, 16, 10);
      ctx.fillStyle = dc;
      ctx.fillRect(d.x - 8, d.y - 5, 16, 4);
      ctx.fillStyle = '#14121a';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.kind === 'life' ? '+' : d.kind.charAt(0).toUpperCase(), d.x, d.y + 4);
    }

    // Laser needles
    ctx.fillStyle = YELLOW;
    for (var i = 0; i < lasers.length; i++) {
      ctx.fillRect(lasers[i].x - 1, lasers[i].y - 6, 2, 8);
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.life / 30;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + (flashT / 40).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
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
    ctx.fillText('SHEET ' + level + ': ' + design().name, W - 8, 12);
    if (bannerT > 0 && mode === 'play') {
      bannerT--;
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = design().color;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 40);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }

    var anyStuck = false;
    for (var i = 0; i < balls.length; i++) if (balls[i].stuck) anyStuck = true;
    if (anyStuck && mode === 'play') {
      ctx.fillStyle = '#9aa';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPACE or TAP to launch', W / 2, H / 2 + 40);
    }

    // Popups + active gear
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      ctx.globalAlpha = Math.min(1, popups[i].life / 18);
      ctx.fillStyle = popups[i].color;
      ctx.fillText(popups[i].text, popups[i].x, popups[i].y);
    }
    ctx.globalAlpha = 1;
    if (mode === 'play' && (wideT > 0 || laserT > 0)) {
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      var gx2 = 8;
      if (wideT > 0) { ctx.fillStyle = CYAN; ctx.fillText('WIDE ' + Math.ceil(wideT / 60), gx2, 26); gx2 += 52; }
      if (laserT > 0) { ctx.fillStyle = YELLOW; ctx.fillText('LASER ' + Math.ceil(laserT / 60), gx2, 26); }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-bricks', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
