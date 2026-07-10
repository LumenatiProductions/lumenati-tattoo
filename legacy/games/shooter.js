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
  function sfxShoot() { playSfx(900, 0.05, 'square', 0.07); }
  function sfxPop(row) { playSfx(400 + row * 100, 0.07, 'square', 0.1); }
  function sfxUfo() { playSfx(1100, 0.12, 'square', 0.12); setTimeout(function(){playSfx(1400, 0.12, 'square', 0.12);}, 90); }
  function sfxHit() { playSfx(150, 0.3, 'sawtooth', 0.15); }
  function sfxWave() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#9b59b6', CYAN = '#00FFFF';
  var ROW_COLOR = [PURPLE, '#2ecc71', CYAN];

  var GCOLS = 8, GROWS = 3, GW = 24, GH = 16, GSX = 38, GSY = 26;

  var mode = 'ready'; // ready | play | over
  var score, lives, wave, frame;
  var player, bullets, ebullets, germs, gx, gy, gdir, ufo, particles, invuln, shootCd, touching;
  var keyL = false, keyR = false, keyFire = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-shooter') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-shooter', String(best)); } catch(e) {} }
  }

  function buildWave() {
    germs = [];
    for (var r = 0; r < GROWS; r++) {
      for (var c = 0; c < GCOLS; c++) germs.push({ c: c, r: r, alive: true, wob: Math.random() * 6.28 });
    }
    gx = 30; gy = 34; gdir = 1;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; wave = 1; frame = 0; mode = 'ready';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    player = { x: W / 2, y: 288, w: 22, h: 18 };
    bullets = []; ebullets = []; particles = []; ufo = null;
    invuln = 0; shootCd = 0; touching = false;
    buildWave();
    window.skateRunning = true;
    startLoop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 16 + Math.random() * 12,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
  }

  function germX(g) { return gx + g.c * GSX; }
  function germY(g) { return gy + g.r * GSY; }

  function aliveCount() {
    var n = 0;
    for (var i = 0; i < germs.length; i++) if (germs[i].alive) n++;
    return n;
  }

  function shoot() {
    if (shootCd > 0 || bullets.length >= 3) return;
    bullets.push({ x: player.x, y: player.y - 12 });
    shootCd = 12;
    sfxShoot();
  }

  function loseLife() {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    sfxHit();
    invuln = 90;
    ebullets = [];
    spawnParticles(player.x, player.y, '#FF0000', 12);
    if (lives <= 0) { mode = 'over'; saveBest(); sfxGameOver(); }
  }

  function update() {
    frame++;
    if (shootCd > 0) shootCd--;
    if (invuln > 0) invuln--;

    // Player
    if (keyL) player.x -= 4;
    if (keyR) player.x += 4;
    player.x = Math.max(14, Math.min(W - 14, player.x));
    if ((keyFire || touching) && frame % 4 === 0) shoot();

    // Germ grid marches; speeds up as the dish empties
    var alive = aliveCount();
    var gspeed = (0.35 + (wave - 1) * 0.12) + (1 - alive / (GCOLS * GROWS)) * 1.1;
    gx += gdir * gspeed;
    var minX = 9999, maxX = -9999, maxY = -9999;
    for (var i = 0; i < germs.length; i++) {
      if (!germs[i].alive) continue;
      var x = germX(germs[i]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      var y = germY(germs[i]);
      if (y > maxY) maxY = y;
    }
    if (minX < 16 || maxX > W - 16 - GW) {
      gdir *= -1;
      gy += 10;
    }
    // They reached the tray: lose a life, push them back up
    if (maxY + GH >= player.y - 6 && mode === 'play') {
      loseLife();
      if (mode === 'play') gy = 34;
    }

    // Germs fire ooze
    var fireEvery = Math.max(22, 55 - wave * 5);
    if (frame % fireEvery === 0 && alive > 0) {
      // Pick a random alive germ that has nothing alive below it
      var shooters = [];
      for (var i = 0; i < germs.length; i++) {
        var g = germs[i];
        if (!g.alive) continue;
        var lowest = true;
        for (var j = 0; j < germs.length; j++) {
          if (germs[j].alive && germs[j].c === g.c && germs[j].r > g.r) { lowest = false; break; }
        }
        if (lowest) shooters.push(g);
      }
      if (shooters.length) {
        var s = shooters[Math.floor(Math.random() * shooters.length)];
        ebullets.push({ x: germX(s) + GW / 2, y: germY(s) + GH, vy: 2.2 + wave * 0.25 });
      }
    }

    // UFO: a fat bacteria blob drifting across the top
    if (!ufo && frame % 700 === 400) ufo = { x: -30, v: 1.6 };
    if (ufo) {
      ufo.x += ufo.v;
      if (ufo.x > W + 30) ufo = null;
    }

    // Player bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.y -= 6;
      if (b.y < 14) { bullets.splice(i, 1); continue; }
      var hit = false;
      for (var j = 0; j < germs.length; j++) {
        var g = germs[j];
        if (!g.alive) continue;
        var x = germX(g), y = germY(g);
        if (b.x > x && b.x < x + GW && b.y > y && b.y < y + GH) {
          g.alive = false;
          hit = true;
          score += (GROWS - g.r) * 10;
          document.getElementById('jd-br-score').textContent = score;
          sfxPop(GROWS - g.r);
          spawnParticles(x + GW / 2, y + GH / 2, ROW_COLOR[g.r], 8);
          break;
        }
      }
      if (!hit && ufo && b.x > ufo.x - 16 && b.x < ufo.x + 16 && b.y > 18 && b.y < 34) {
        score += 50;
        document.getElementById('jd-br-score').textContent = score;
        sfxUfo();
        spawnParticles(ufo.x, 26, YELLOW, 14);
        ufo = null;
        hit = true;
      }
      if (hit) bullets.splice(i, 1);
    }

    // Enemy ooze
    for (var i = ebullets.length - 1; i >= 0; i--) {
      var e = ebullets[i];
      e.y += e.vy;
      if (e.y > H + 10) { ebullets.splice(i, 1); continue; }
      if (invuln === 0 &&
          e.x > player.x - player.w / 2 && e.x < player.x + player.w / 2 &&
          e.y > player.y - player.h / 2 && e.y < player.y + player.h / 2) {
        ebullets.splice(i, 1);
        loseLife();
        if (mode !== 'play') return;
      }
    }

    // Wave cleared
    if (alive === 0) {
      wave++;
      score += 100;
      document.getElementById('jd-br-score').textContent = score;
      sfxWave();
      buildWave();
      ebullets = [];
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'over') { init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); keyL = true; start(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); keyR = true; start(); }
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      start();
      keyFire = true;
      shoot();
    }
  });
  document.addEventListener('keyup', function(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
    if (e.code === 'Space') keyFire = false;
  });
  function canvasX(clientX) {
    var r = canvas.getBoundingClientRect();
    return (clientX - r.left) * (W / r.width);
  }
  canvas.addEventListener('click', function() { start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    touching = true;
    player.x = Math.max(14, Math.min(W - 14, canvasX(e.touches[0].clientX)));
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    player.x = Math.max(14, Math.min(W - 14, canvasX(e.touches[0].clientX)));
  }, { passive: false });
  canvas.addEventListener('touchend', function(e) { e.preventDefault(); touching = false; }, { passive: false });

  function drawGerm(g) {
    var x = germX(g), y = germY(g);
    var wob = Math.sin(frame * 0.15 + g.wob) * 1.5;
    ctx.fillStyle = ROW_COLOR[g.r];
    ctx.beginPath();
    ctx.arc(x + GW / 2, y + GH / 2 + wob, 8, 0, Math.PI * 2);
    ctx.fill();
    // Spiky bits
    ctx.fillRect(x + 2, y + 2 + wob, 3, 3);
    ctx.fillRect(x + GW - 5, y + 2 + wob, 3, 3);
    ctx.fillRect(x + 2, y + GH - 5 + wob, 3, 3);
    ctx.fillRect(x + GW - 5, y + GH - 5 + wob, 3, 3);
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 7, y + 5 + wob, 3, 3);
    ctx.fillRect(x + 14, y + 5 + wob, 3, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 8, y + 6 + wob, 2, 2);
    ctx.fillRect(x + 15, y + 6 + wob, 2, 2);
  }

  function draw() {
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, W, H);

    // Faint grid: a petri-dish scan
    ctx.fillStyle = 'rgba(0,255,255,0.03)';
    for (var y = 20; y < H; y += 20) ctx.fillRect(0, y, W, 1);

    if (ufo) {
      ctx.fillStyle = YELLOW;
      ctx.beginPath(); ctx.arc(ufo.x, 26, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c89b00';
      ctx.fillRect(ufo.x - 14, 24, 28, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(ufo.x - 4, 20, 3, 3);
      ctx.fillRect(ufo.x + 2, 20, 3, 3);
    }

    for (var i = 0; i < germs.length; i++) if (germs[i].alive) drawGerm(germs[i]);

    // Ooze
    ctx.fillStyle = '#2ecc71';
    for (var i = 0; i < ebullets.length; i++) {
      var e = ebullets[i];
      ctx.fillRect(e.x - 2, e.y - 4, 4, 8);
    }

    // Needles
    ctx.fillStyle = '#eee';
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      ctx.fillRect(b.x - 1, b.y - 6, 2, 8);
    }

    // Player: a tattoo machine pointing up
    var blink = invuln > 0 && Math.floor(frame / 4) % 2 === 0;
    if (!blink) {
      var px = player.x, py = player.y;
      ctx.fillStyle = '#ccc';
      ctx.fillRect(px - 1, py - 12, 2, 6);
      ctx.fillStyle = PURPLE;
      ctx.fillRect(px - 6, py - 6, 12, 12);
      ctx.fillStyle = PINK;
      ctx.fillRect(px - 8, py - 8, 4, 4);
      ctx.fillRect(px + 4, py - 8, 4, 4);
      ctx.fillStyle = '#8B5CF6';
      ctx.fillRect(px - 10, py + 4, 20, 5);
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.life / 28;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 12);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 100, 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = YELLOW;
    ctx.fillText('WAVE ' + wave, W - 8, 12);

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PINK;
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CONTAMINATED', W / 2, H / 2 - 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Score: ' + score, W / 2, H / 2 + 5);
      ctx.fillStyle = score >= best && score > 0 ? YELLOW : '#9aa';
      ctx.font = '12px monospace';
      ctx.fillText(score >= best && score > 0 ? 'NEW BEST!' : 'Best: ' + best, W / 2, H / 2 + 25);
      ctx.fillStyle = YELLOW;
      ctx.fillText('SPACE or TAP to re-sterilize', W / 2, H / 2 + 48);
    }

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = CYAN;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STERILE!', W / 2, H / 2 - 42);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('ARROWS to move, SPACE to fire', W / 2, H / 2 - 8);
      ctx.fillText('On phones: drag to move, autofire', W / 2, H / 2 + 10);
      ctx.fillStyle = '#2ecc71';
      ctx.fillText('Zap the germs before they reach the tray', W / 2, H / 2 + 28);
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
