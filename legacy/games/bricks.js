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
  var ROW_COLORS = [PINK, '#FF8A00', YELLOW, LIME, CYAN];

  var COLS = 8, ROWS = 5, BW = 46, BH = 14, BGAP = 3, BTOP = 40;
  var BLEFT = (W - (COLS * BW + (COLS - 1) * BGAP)) / 2;

  var mode = 'ready'; // ready | play | over
  var score, lives, level, frame, flashT;
  var paddle, ball, bricks, particles;
  var keyL = false, keyR = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-bricks') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-bricks', String(best)); } catch(e) {} }
  }

  function buildBricks() {
    bricks = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        // Higher levels harden the top rows into 2-hit tiles
        var hp = (level >= 2 && r < Math.min(3, level - 1)) ? 2 : 1;
        bricks.push({ x: BLEFT + c * (BW + BGAP), y: BTOP + r * (BH + BGAP), row: r, hp: hp });
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
    score = 0; lives = 3; level = 1; frame = 0; flashT = 0; mode = 'ready';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    paddle = { x: W / 2 - 30, y: 298, w: 60, h: 8 };
    particles = [];
    buildBricks();
    serve();
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
            score += b.row < 2 ? 20 : 10;
            spawnParticles(ball.x, ball.y, ROW_COLORS[b.row], 8);
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
      }

      // Dropped it
      if (ball.y > H + 10) {
        lives--;
        document.getElementById('jd-br-lives').textContent = lives;
        flashT = 12;
        sfxLose();
        if (lives <= 0) { mode = 'over'; saveBest(); sfxGameOver(); return; }
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
    if (mode === 'over') { init(); mode = 'play'; return; }
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

  function draw() {
    ctx.fillStyle = '#100a18';
    ctx.fillRect(0, 0, W, H);

    // Ceiling line
    ctx.fillStyle = '#2a2438';
    ctx.fillRect(0, 16, W, 2);

    // Bricks: flash-sheet tiles
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      ctx.fillStyle = ROW_COLORS[b.row];
      ctx.globalAlpha = b.hp === 2 ? 1 : (b.hp === 1 && level >= 2 && b.row < Math.min(3, level - 1)) ? 0.55 : 1;
      ctx.fillRect(b.x, b.y, BW, BH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x, b.y, BW, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x, b.y + BH - 2, BW, 2);
      // Tiny flash doodle: a star dot
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
    ctx.fillText('SHEET ' + level, W - 8, 12);

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

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FLASH BREAKER', W / 2, H / 2 - 42);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('ARROWS / MOUSE / DRAG to move', W / 2, H / 2 - 8);
      ctx.fillStyle = PINK;
      ctx.fillText('Smash the flash sheet off the wall', W / 2, H / 2 + 10);
      ctx.fillStyle = CYAN;
      ctx.fillText('Top rows pay double', W / 2, H / 2 + 28);
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
