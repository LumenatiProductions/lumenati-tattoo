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

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#9b59b6', CYAN = '#00FFFF';

  var COLS = 8, BW = 46, BH = 14, BGAP = 3, BTOP = 36;
  var BLEFT = (W - (COLS * BW + (COLS - 1) * BGAP)) / 2;

  // Every sheet is a flash design; break it off the wall tile by tile.
  var DESIGNS = [
    { name: 'HEART', color: '#FF1493', rows: [
      '.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'] },
    { name: 'SKULL', color: '#e8e4d8', rows: [
      '..XXXX..', '.XXXXXX.', '.X.XX.X.', '.XXXXXX.', '..XXXX..', '..X..X..'] },
    { name: 'BOLT', color: '#FFD700', rows: [
      '....XXX.', '...XXX..', '.XXXXXX.', '..XXX...', '.XXX....', '.XX.....'] },
    { name: 'STAR', color: '#00FFFF', rows: [
      '...XX...', '..XXXX..', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '.XX..XX.'] },
    { name: 'DAGGER', color: '#b8c4d0', rows: [
      '...XX...', '.XXXXXX.', '...XX...', '...XX...', '...XX...', '....X...'] },
  ];
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, level, frame, flashT, bannerT, bannerText;
  var paddle, ball, bricks, particles;
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

  function serve() {
    ball = { x: paddle.x + paddle.w / 2, y: paddle.y - 6, vx: 0, vy: 0, r: 4, stuck: true };
  }

  function launch() {
    if (!ball.stuck) return;
    ball.stuck = false;
    var sp = 3.6 + (level - 1) * 0.4;
    var a = -Math.PI / 3 + Math.random() * (Math.PI / 6);
    ball.vx = Math.cos(a) * sp * (Math.random() < 0.5 ? 1 : -1);
    ball.vy = -Math.abs(Math.sin(a) * sp);
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; level = 1; frame = 0; flashT = 0; mode = 'intro'; introT = 0;
    bannerT = 0; bannerText = '';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    paddle = { x: W / 2 - 30, y: 298, w: 60, h: 8 };
    particles = [];
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
    if (flashT > 0) flashT--;

    // Paddle
    if (keyL) paddle.x -= 6;
    if (keyR) paddle.x += 6;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - 6;
    } else {
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Walls
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); sfxWall(); }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); sfxWall(); }
      if (ball.y < ball.r + 18) { ball.y = ball.r + 18; ball.vy = Math.abs(ball.vy); sfxWall(); }

      // Paddle
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 6 &&
          ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
        var rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        rel = Math.max(-1, Math.min(1, rel));
        var sp = Math.min(8, Math.hypot(ball.vx, ball.vy) * 1.02);
        var ang = rel * (Math.PI / 3); // up to 60 degrees of english
        ball.vx = Math.sin(ang) * sp;
        ball.vy = -Math.abs(Math.cos(ang) * sp);
        ball.y = paddle.y - ball.r;
        sfxPaddle();
      }

      // Bricks
      for (var i = 0; i < bricks.length; i++) {
        var b = bricks[i];
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + BW &&
            ball.y + ball.r > b.y && ball.y - ball.r < b.y + BH) {
          // Reflect on the shallower penetration axis
          var overX = Math.min(ball.x + ball.r - b.x, b.x + BW - (ball.x - ball.r));
          var overY = Math.min(ball.y + ball.r - b.y, b.y + BH - (ball.y - ball.r));
          if (overX < overY) ball.vx = ball.x < b.x + BW / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
          else ball.vy = ball.y < b.y + BH / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
          b.hp--;
          sfxBrick(b.row);
          if (b.hp <= 0) {
            score += b.maxHp === 2 ? 20 : 10;
            spawnParticles(ball.x, ball.y, b.color, 8);
            bricks.splice(i, 1);
          } else {
            score += 5;
            spawnParticles(ball.x, ball.y, '#fff', 4);
          }
          document.getElementById('jd-br-score').textContent = score;
          break;
        }
      }

      // Cleared the sheet
      if (bricks.length === 0) {
        level++;
        sfxLevel();
        buildBricks();
        serve();
        bannerT = 90;
        bannerText = 'SHEET ' + level + ': ' + design().name;
      }

      // Dropped it
      if (ball.y > H + 10) {
        lives--;
        document.getElementById('jd-br-lives').textContent = lives;
        flashT = 12;
        sfxLose();
        if (lives <= 0) { enterBoard(score); saveBest(); sfxGameOver(); return; }
        serve();
      }
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
    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();
    if (mode === 'ready') mode = 'play';
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
    slam('FLASH BREAKER', 104, 24, YELLOW);
    var rowCols = [PINK, '#FF8A00', YELLOW, LIME, CYAN, '#b8c4d0', PINK, YELLOW];
    for (var i = 0; i < 8; i++) {
      var lt = Math.max(0, Math.min(1, (t2 - 30 - i * 5) / 14));
      if (lt <= 0) continue;
      var byy = 170 - (1 - lt) * (1 - lt) * 190;
      ctx.fillStyle = rowCols[i];
      ctx.fillRect(38 + i * 42, byy, 38, 13);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(38 + i * 42, byy, 38, 2);
    }
    var bxp = 40 + Math.abs(((t2 * 3.6) % 640) - 320);
    var byp = 226 + Math.sin(t2 * 0.14) * 22;
    ctx.fillStyle = PINK;
    ctx.beginPath(); ctx.arc(bxp, byp, 5, 0, Math.PI * 2); ctx.fill();
    if (t2 > 130) { ctx.fillStyle = CYAN; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('BREAK THE WHOLE BOOK', W / 2, 246); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS, MOUSE or DRAG to move // SPACE or TAP launches', W / 2, H - 42);
    ctx.fillText('break every flash design in the book // top designs pay double', W / 2, H - 29);
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
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(paddle.x, paddle.y, paddle.w, 2);

    // Ball: ink drop
    ctx.fillStyle = PINK;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(ball.x - 1, ball.y - 2, 2, 2);

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

    if (ball.stuck && mode === 'play') {
      ctx.fillStyle = '#9aa';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPACE or TAP to launch', W / 2, H / 2 + 40);
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
      ctx.fillText('SPACE or TAP to break again', W / 2, H / 2 + 48);
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
      else { frame++; if (mode === 'intro' && ++introT > 285) introT = 70; }
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
