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
  function sfxBell() { playSfx(1100, 0.1, 'square', 0.1); setTimeout(function(){playSfx(1400, 0.12, 'square', 0.08);}, 90); }
  function sfxSeat() { playSfx(600, 0.08, 'square', 0.1); setTimeout(function(){playSfx(800, 0.1, 'square', 0.1);}, 70); }
  function sfxCash() { playSfx(900, 0.06, 'square', 0.11); setTimeout(function(){playSfx(1200, 0.06, 'square', 0.11);}, 60); setTimeout(function(){playSfx(1500, 0.1, 'square', 0.11);}, 120); }
  function sfxStorm() { playSfx(240, 0.2, 'sawtooth', 0.14); setTimeout(function(){playSfx(160, 0.28, 'sawtooth', 0.14);}, 160); }
  function sfxDay() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF';
  var SKINS = ['#f0c8a0', '#d9a276', '#b97a4e', '#8d5a3b', '#6b4128'];
  var SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#00bcd4'];
  var HAIRS = ['#222', '#5b3b1a', '#FF1493', '#e8e4d8', '#1c6b4a'];

  var DOOR = { x: 30, y: 44 };
  var BENCH = [{ x: 46, y: 110 }, { x: 46, y: 152 }, { x: 46, y: 194 }, { x: 46, y: 236 }];
  var CHAIRS = [{ x: 322, y: 92 }, { x: 322, y: 172 }, { x: 322, y: 252 }];

  var mode = 'ready'; // ready | play | over
  var score, hearts, day, frame, served, servedTarget;
  var runner, clients, chairs, spawnT, bannerT, bannerText, particles;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-shoprush') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-shoprush', String(best)); } catch(e) {} }
  }

  function spawnEvery() { return Math.max(220, 460 - day * 40); }
  function patienceMax() { return Math.max(560, 940 - day * 60); }
  function workTime() { return 480 + day * 50 + Math.random() * 240; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; hearts = 3; day = 1; frame = 0; served = 0; servedTarget = 5;
    mode = 'ready'; bannerT = 0; bannerText = ''; particles = [];
    runner = { x: 200, y: 170, tx: null, ty: null, kx: 0, ky: 0, lead: null };
    clients = [];
    chairs = CHAIRS.map(function(c) { return { x: c.x, y: c.y, state: 'free', t: 0, client: null }; });
    spawnT = 90;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'Arrows or tap to run // seat, then collect';
    var statA = document.getElementById('jd-stat-a');
    if (statA) statA.textContent = 'Cash';
    var statB = document.getElementById('jd-stat-b');
    if (statB) statB.textContent = 'Rep';
    window.skateRunning = true;
    startLoop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2 - 0.5,
        life: 18 + Math.random() * 12,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
  }

  function freeBenchSeat() {
    for (var i = 0; i < BENCH.length; i++) {
      var taken = false;
      for (var j = 0; j < clients.length; j++) {
        if (clients[j].seat === i && (clients[j].state === 'walkin' || clients[j].state === 'waiting')) taken = true;
      }
      if (!taken) return i;
    }
    return -1;
  }

  function near(ax, ay, bx, by, d) {
    return Math.abs(ax - bx) < d && Math.abs(ay - by) < d;
  }

  function loseHeart() {
    hearts--;
    document.getElementById('jd-br-lives').textContent = hearts;
    sfxStorm();
    if (hearts <= 0) {
      mode = 'over';
      saveBest();
      sfxGameOver();
    }
  }

  function update() {
    frame++;
    if (bannerT > 0) bannerT--;

    // Runner: keys beat taps
    if (runner.kx !== 0 || runner.ky !== 0) {
      runner.x += runner.kx * 2.6;
      runner.y += runner.ky * 2.6;
      runner.tx = null; runner.ty = null;
    } else if (runner.tx !== null) {
      var dx = runner.tx - runner.x, dy = runner.ty - runner.y;
      var d = Math.hypot(dx, dy);
      if (d < 3) { runner.tx = null; runner.ty = null; }
      else { runner.x += dx / d * 2.6; runner.y += dy / d * 2.6; }
    }
    runner.x = Math.max(16, Math.min(W - 16, runner.x));
    runner.y = Math.max(60, Math.min(H - 26, runner.y));

    // Spawning
    spawnT--;
    if (spawnT <= 0) {
      var seat = freeBenchSeat();
      if (seat !== -1) {
        clients.push({
          x: DOOR.x, y: DOOR.y, seat: seat, state: 'walkin',
          patience: patienceMax(), pmax: patienceMax(),
          skin: SKINS[Math.floor(Math.random() * SKINS.length)],
          shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
          hair: HAIRS[Math.floor(Math.random() * HAIRS.length)],
        });
        sfxBell();
        spawnT = spawnEvery() + Math.random() * 120;
      } else {
        spawnT = 60;
      }
    }

    // Clients
    for (var i = clients.length - 1; i >= 0; i--) {
      var c = clients[i];
      if (c.state === 'walkin') {
        var b = BENCH[c.seat];
        var dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
        if (d < 2) { c.state = 'waiting'; }
        else { c.x += dx / d * 1.4; c.y += dy / d * 1.4; }
      } else if (c.state === 'waiting') {
        c.patience--;
        if (c.patience <= 0) {
          c.state = 'storming';
        } else if (!runner.lead && near(runner.x, runner.y, c.x, c.y, 20)) {
          runner.lead = c;
          c.state = 'led';
          sfxSeat();
        }
      } else if (c.state === 'led') {
        // trail the runner
        var dx = runner.x - 14 - c.x, dy = runner.y - c.y, d = Math.hypot(dx, dy);
        if (d > 16) { c.x += dx / d * 2.4; c.y += dy / d * 2.4; }
      } else if (c.state === 'storming') {
        var dx = DOOR.x - c.x, dy = DOOR.y - c.y, d = Math.hypot(dx, dy);
        if (d < 4) {
          clients.splice(i, 1);
          loseHeart();
          if (mode !== 'play') return;
        } else { c.x += dx / d * 2.2; c.y += dy / d * 2.2; }
      }
    }

    // Chairs
    for (var i = 0; i < chairs.length; i++) {
      var ch = chairs[i];
      if (ch.state === 'free' && runner.lead && near(runner.x, runner.y, ch.x - 24, ch.y, 24)) {
        var c = runner.lead;
        runner.lead = null;
        c.state = 'inchair';
        c.x = ch.x; c.y = ch.y;
        ch.state = 'busy';
        ch.t = workTime();
        ch.client = c;
        ch.tip = Math.ceil(c.patience / c.pmax * 20);
        sfxSeat();
      } else if (ch.state === 'busy') {
        ch.t--;
        if (ch.t <= 0) { ch.state = 'done'; sfxBell(); }
      } else if (ch.state === 'done' && near(runner.x, runner.y, ch.x - 24, ch.y, 24)) {
        var pay = 30 + ch.tip;
        score += pay;
        document.getElementById('jd-br-score').textContent = score;
        spawnParticles(ch.x - 10, ch.y - 10, YELLOW, 10);
        sfxCash();
        var idx = clients.indexOf(ch.client);
        if (idx !== -1) clients.splice(idx, 1);
        ch.client = null;
        ch.state = 'free';
        served++;
        if (served >= servedTarget) {
          day++;
          served = 0;
          servedTarget = 4 + day;
          bannerT = 110;
          bannerText = 'DAY ' + day;
          sfxDay();
        }
      }
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'over') { init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  var KEYS = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0], KeyW: [0,-1], KeyS: [0,1], KeyA: [-1,0], KeyD: [1,0] };
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    var k = KEYS[e.code];
    if (k) {
      e.preventDefault();
      start();
      if (k[0] !== 0) runner.kx = k[0];
      if (k[1] !== 0) runner.ky = k[1];
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) start();
    }
  });
  document.addEventListener('keyup', function(e) {
    var k = KEYS[e.code];
    if (!k) return;
    if (k[0] !== 0 && runner.kx === k[0]) runner.kx = 0;
    if (k[1] !== 0 && runner.ky === k[1]) runner.ky = 0;
  });
  function canvasXY(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return [(cx - r.left) * (W / r.width), (cy - r.top) * (H / r.height)];
  }
  canvas.addEventListener('click', function(e) {
    if (mode !== 'play') { start(); return; }
    var p = canvasXY(e.clientX, e.clientY);
    runner.tx = p[0]; runner.ty = p[1];
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode !== 'play') { start(); return; }
    var p = canvasXY(e.touches[0].clientX, e.touches[0].clientY);
    runner.tx = p[0]; runner.ty = p[1];
  }, { passive: false });

  function drawPerson(x, y, skin, shirt, hair, seated) {
    ctx.fillStyle = hair;
    ctx.fillRect(x - 5, y - 16, 10, 4);
    ctx.fillStyle = skin;
    ctx.fillRect(x - 4, y - 13, 8, 7);
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 6, y - 5, 12, 11);
    if (!seated) {
      ctx.fillStyle = '#223';
      ctx.fillRect(x - 5, y + 6, 4, 6);
      ctx.fillRect(x + 1, y + 6, 4, 6);
    }
  }

  function draw() {
    // Shop floor
    ctx.fillStyle = '#241a20';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2e2028';
    for (var y = 60; y < H; y += 24) ctx.fillRect(0, y, W, 12);
    // Back wall + sign
    ctx.fillStyle = '#1a1016';
    ctx.fillRect(0, 0, W, 58);
    ctx.fillStyle = Math.floor(frame / 30) % 2 === 0 ? PINK : '#c8006e';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('* LUMENATI TATTOO *', W / 2, 40);

    // Door
    ctx.fillStyle = '#3a2a34';
    ctx.fillRect(DOOR.x - 16, 30, 32, 28);
    ctx.fillStyle = LIME;
    ctx.font = '8px monospace';
    ctx.fillText('OPEN', DOOR.x, 47);

    // Bench
    ctx.fillStyle = '#4a3440';
    ctx.fillRect(24, 96, 44, 158);
    ctx.fillStyle = '#5c4250';
    ctx.fillRect(24, 96, 44, 5);

    // Stations
    for (var i = 0; i < chairs.length; i++) {
      var ch = chairs[i];
      ctx.fillStyle = '#3a2a34';
      ctx.fillRect(ch.x - 18, ch.y - 24, 66, 52);
      ctx.fillStyle = '#111';
      ctx.fillRect(ch.x - 10, ch.y - 8, 26, 20); // the chair
      ctx.fillStyle = '#666';
      ctx.fillRect(ch.x - 10, ch.y + 12, 26, 3);
      // The artist, always at station
      var bob = ch.state === 'busy' ? Math.sin(frame * 0.3 + i) * 2 : 0;
      drawPerson(ch.x + 30, ch.y + bob, SKINS[i % SKINS.length], '#1c1418', i === 0 ? PINK : HAIRS[i % HAIRS.length], false);
      if (ch.state === 'busy') {
        // machine arm + progress
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(ch.x + 18, ch.y - 4 + bob, 8, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(ch.x - 18, ch.y - 32, 66, 4);
        ctx.fillStyle = CYAN;
        ctx.fillRect(ch.x - 18, ch.y - 32, 66 * (1 - ch.t / (480 + day * 50 + 240)), 4);
        if (ch.client) drawPerson(ch.x, ch.y - 2, ch.client.skin, ch.client.shirt, ch.client.hair, true);
      }
      if (ch.state === 'done') {
        if (ch.client) drawPerson(ch.x, ch.y - 2, ch.client.skin, ch.client.shirt, ch.client.hair, true);
        if (Math.floor(frame / 12) % 2 === 0) {
          ctx.fillStyle = YELLOW;
          ctx.font = 'bold 14px monospace';
          ctx.fillText('$', ch.x - 2, ch.y - 34);
        }
      }
    }

    // Clients
    for (var i = 0; i < clients.length; i++) {
      var c = clients[i];
      if (c.state === 'inchair') continue;
      drawPerson(c.x, c.y, c.skin, c.shirt, c.hair, c.state === 'waiting');
      if (c.state === 'waiting') {
        var pr = c.patience / c.pmax;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c.x - 10, c.y - 24, 20, 3);
        ctx.fillStyle = pr > 0.35 ? LIME : '#ff4444';
        ctx.fillRect(c.x - 10, c.y - 24, 20 * pr, 3);
      }
      if (c.state === 'storming' && Math.floor(frame / 8) % 2 === 0) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('!!', c.x + 10, c.y - 18);
      }
    }

    // Runner (you): pink-haired shop runner
    drawPerson(runner.x, runner.y, '#f0c8a0', '#14101c', PINK, false);
    ctx.fillStyle = 'rgba(255,20,147,0.5)';
    ctx.fillRect(runner.x - 7, runner.y + 13, 14, 2);

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
    ctx.fillText('$' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: $' + Math.max(best, score), 8, 26);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'right';
    ctx.fillText('DAY ' + day + ' // ' + served + '/' + servedTarget, W - 8, 14);
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = i < hearts ? PINK : 'rgba(255,255,255,0.18)';
      var hx = W - 12 - i * 14;
      ctx.fillRect(hx, 20, 4, 4); ctx.fillRect(hx + 5, 20, 4, 4);
      ctx.fillRect(hx, 24, 9, 4); ctx.fillRect(hx + 2, 28, 5, 3);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 30);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PINK;
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BAD REVIEWS', W / 2, H / 2 - 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Take: $' + score, W / 2, H / 2 + 5);
      ctx.fillStyle = score >= best && score > 0 ? YELLOW : '#9aa';
      ctx.font = '12px monospace';
      ctx.fillText(score >= best && score > 0 ? 'NEW BEST!' : 'Best: $' + best, W / 2, H / 2 + 25);
      ctx.fillStyle = YELLOW;
      ctx.fillText('SPACE or TAP to reopen the shop', W / 2, H / 2 + 48);
    }

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PINK;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SHOP RUSH', W / 2, H / 2 - 46);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('Run the front of house: ARROWS or TAP', W / 2, H / 2 - 12);
      ctx.fillStyle = CYAN;
      ctx.fillText('Walk to a client, lead them to a chair', W / 2, H / 2 + 6);
      ctx.fillStyle = YELLOW;
      ctx.fillText('Grab the $ when the work is done', W / 2, H / 2 + 24);
      ctx.fillStyle = '#ff4444';
      ctx.fillText('3 walkouts close the shop', W / 2, H / 2 + 42);
      ctx.fillStyle = '#9aa';
      ctx.fillText('Best: $' + best, W / 2, H / 2 + 60);
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
