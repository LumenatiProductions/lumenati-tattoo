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
  function sfxPaddle() { playSfx(440, 0.05, 'square', 0.1); }
  function sfxWall() { playSfx(220, 0.04, 'square', 0.08); }
  function sfxScore() { playSfx(700, 0.12, 'square', 0.12); }
  function sfxLose() { playSfx(200, 0.2, 'sawtooth', 0.13); }
  function sfxWin() { playSfx(600, 0.12, 'square', 0.12); setTimeout(function(){playSfx(800, 0.12, 'square', 0.12);}, 110); setTimeout(function(){playSfx(1100, 0.2, 'square', 0.12);}, 220); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  var PINK = '#FF1493', CYAN = '#00FFFF', YELLOW = '#FFD700', LIME = '#7FFF00';
  var WIN_AT = 5, PW = 8, PH = 56;

  // The shop ladder: beat one to face the next. Speed up, wobble down.
  var OPPONENTS = [
    { name: 'SCRATCHER', v: 2.5, wob: 14 },
    { name: 'APPRENTICE', v: 3.0, wob: 11 },
    { name: 'RESIDENT', v: 3.5, wob: 8 },
    { name: 'SHOP BOSS', v: 4.0, wob: 5 },
    { name: 'THE MACHINE', v: 4.7, wob: 1.5 },
  ];

  var mode = 'ready'; // ready | play | over
  var frame, you, cpu, ball, serveT, rally, trail, won, tier, bannerT, bannerText;
  var keyU = false, keyD = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-pong') || '0', 10) || 0; } catch(e) {}
  function saveBest(beaten) {
    if (beaten > best) { best = beaten; try { localStorage.setItem('lumenati-arcade-pong', String(best)); } catch(e) {} }
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    frame = 0; mode = 'ready'; rally = 0; won = false;
    tier = 0; bannerT = 0; bannerText = '';
    you = { y: H / 2 - PH / 2, score: 0 };
    cpu = { y: H / 2 - PH / 2, score: 0 };
    trail = [];
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '0';
    serve(Math.random() < 0.5 ? 1 : -1);
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'W/S, mouse or drag // first to 5';
    var statA = document.getElementById('jd-stat-a');
    if (statA) statA.textContent = 'You';
    var statB = document.getElementById('jd-stat-b');
    if (statB) statB.textContent = 'CPU';
    window.skateRunning = true;
    startLoop();
  }

  function serve(towards) {
    var a = (Math.random() * 0.6 - 0.3);
    var sp = 4;
    ball = { x: W / 2, y: H / 2, vx: towards * Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5 };
    serveT = 45;
    rally = 0;
    trail = [];
  }

  function point(scorer) {
    scorer.score++;
    document.getElementById('jd-br-score').textContent = you.score;
    document.getElementById('jd-br-lives').textContent = cpu.score;
    if (scorer === you) sfxScore(); else sfxLose();
    if (you.score >= WIN_AT) {
      if (tier >= OPPONENTS.length - 1) {
        // Cleared the whole shop
        won = true;
        mode = 'over';
        saveBest(OPPONENTS.length);
        sfxWin();
        return;
      }
      bannerT = 110;
      bannerText = OPPONENTS[tier].name + ' TAPPED OUT';
      tier++;
      you.score = 0; cpu.score = 0;
      document.getElementById('jd-br-score').textContent = '0';
      document.getElementById('jd-br-lives').textContent = '0';
      sfxWin();
      serve(1);
      return;
    }
    if (cpu.score >= WIN_AT) {
      won = false;
      mode = 'over';
      saveBest(tier);
      sfxGameOver();
      return;
    }
    serve(scorer === you ? -1 : 1);
  }

  function update() {
    frame++;

    // You
    if (keyU) you.y -= 5;
    if (keyD) you.y += 5;
    you.y = Math.max(18, Math.min(H - PH - 4, you.y));

    // CPU: the current opponent chases with their own speed and wobble
    var opp = OPPONENTS[tier];
    var target = ball.vx > 0 ? ball.y - PH / 2 : H / 2 - PH / 2;
    target += Math.sin(frame * 0.05) * opp.wob;
    var maxV = opp.v + Math.min(1.2, rally * 0.08);
    var dv = target - cpu.y;
    cpu.y += Math.max(-maxV, Math.min(maxV, dv));
    cpu.y = Math.max(18, Math.min(H - PH - 4, cpu.y));

    if (bannerT > 0) bannerT--;
    if (serveT > 0) { serveT--; return; }

    ball.x += ball.vx;
    ball.y += ball.vy;
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 6) trail.shift();

    // Walls
    if (ball.y < ball.r + 16) { ball.y = ball.r + 16; ball.vy = Math.abs(ball.vy); sfxWall(); }
    if (ball.y > H - ball.r - 2) { ball.y = H - ball.r - 2; ball.vy = -Math.abs(ball.vy); sfxWall(); }

    // Your paddle (left)
    var yx = 16;
    if (ball.vx < 0 && ball.x - ball.r < yx + PW && ball.x - ball.r > yx - 6 &&
        ball.y > you.y - ball.r && ball.y < you.y + PH + ball.r) {
      bounce(you.y);
      ball.x = yx + PW + ball.r;
      ball.vx = Math.abs(ball.vx);
    }
    // CPU paddle (right)
    var cx = W - 16 - PW;
    if (ball.vx > 0 && ball.x + ball.r > cx && ball.x + ball.r < cx + PW + 6 &&
        ball.y > cpu.y - ball.r && ball.y < cpu.y + PH + ball.r) {
      bounce(cpu.y);
      ball.x = cx - ball.r;
      ball.vx = -Math.abs(ball.vx);
    }

    function bounce(py) {
      var rel = (ball.y - (py + PH / 2)) / (PH / 2);
      rel = Math.max(-1, Math.min(1, rel));
      var sp = Math.min(9, Math.hypot(ball.vx, ball.vy) * 1.05 + 0.1);
      var ang = rel * (Math.PI / 3.4);
      ball.vx = Math.cos(ang) * sp * (ball.vx > 0 ? 1 : -1);
      ball.vy = Math.sin(ang) * sp;
      rally++;
      sfxPaddle();
    }

    // Out
    if (ball.x < -10) point(cpu);
    else if (ball.x > W + 10) point(you);
  }

  // ── Input ──
  function start() {
    if (mode === 'over') { init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); keyU = true; start(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); keyD = true; start(); }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) start(); }
  });
  document.addEventListener('keyup', function(e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keyU = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keyD = false;
  });
  function canvasY(clientY) {
    var r = canvas.getBoundingClientRect();
    return (clientY - r.top) * (H / r.height);
  }
  canvas.addEventListener('mousemove', function(e) {
    you.y = Math.max(18, Math.min(H - PH - 4, canvasY(e.clientY) - PH / 2));
  });
  canvas.addEventListener('click', function() { start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    you.y = Math.max(18, Math.min(H - PH - 4, canvasY(e.touches[0].clientY) - PH / 2));
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    you.y = Math.max(18, Math.min(H - PH - 4, canvasY(e.touches[0].clientY) - PH / 2));
  }, { passive: false });

  function draw() {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    // Court
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(0, 14, W, 2);
    ctx.fillRect(0, H - 2, W, 2);
    for (var y = 20; y < H; y += 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(W / 2 - 1, y, 2, 8);
    }

    // Big scores
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,20,147,0.5)';
    ctx.fillText(you.score, W / 2 - 50, 52);
    ctx.fillStyle = 'rgba(0,255,255,0.5)';
    ctx.fillText(cpu.score, W / 2 + 50, 52);

    // Paddles
    ctx.fillStyle = PINK;
    ctx.fillRect(16, you.y, PW, PH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(16, you.y, 2, PH);
    ctx.fillStyle = CYAN;
    ctx.fillRect(W - 16 - PW, cpu.y, PW, PH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(W - 16 - 2, cpu.y, 2, PH);

    // Ball trail + ink-drop ball
    for (var i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (i / trail.length) * 0.4;
      ctx.fillStyle = PINK;
      ctx.fillRect(trail[i].x - 2, trail[i].y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    if (serveT === 0 || Math.floor(frame / 6) % 2 === 0) {
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(ball.x - 1, ball.y - 2, 2, 2);
    }

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FIRST TO ' + WIN_AT, 8, 11);
    ctx.textAlign = 'center';
    ctx.fillStyle = CYAN;
    ctx.fillText('VS ' + OPPONENTS[tier].name + ' (' + (tier + 1) + '/' + OPPONENTS.length + ')', W / 2, 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + best + '/' + OPPONENTS.length + ' BEAT', W - 8, 11);
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 44);
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = CYAN;
      ctx.fillText('NEXT UP: ' + OPPONENTS[tier].name, W / 2, H / 2 - 26);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = won ? LIME : PINK;
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(won ? 'SHOP CHAMPION' : OPPONENTS[tier].name + ' WINS', W / 2, H / 2 - 34);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(won ? 'You ran the whole ladder' : 'Beat ' + tier + ' of ' + OPPONENTS.length, W / 2, H / 2 - 6);
      ctx.font = 'bold 14px monospace';
      ctx.fillText(you.score + ' - ' + cpu.score, W / 2, H / 2 + 16);
      ctx.fillStyle = YELLOW;
      ctx.font = '12px monospace';
      ctx.fillText('SPACE or TAP to start over', W / 2, H / 2 + 42);
    }

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PINK;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NEEDLE PONG', W / 2, H / 2 - 42);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('W/S, ARROWS, MOUSE or DRAG', W / 2, H / 2 - 8);
      ctx.fillStyle = CYAN;
      ctx.fillText('Run the shop ladder: 5 opponents', W / 2, H / 2 + 10);
      ctx.fillText('Scratcher first, The Machine last', W / 2, H / 2 + 28);
      ctx.fillStyle = YELLOW;
      ctx.fillText('First to ' + WIN_AT + ' each match // Best: ' + best + '/' + OPPONENTS.length, W / 2, H / 2 + 46);
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
