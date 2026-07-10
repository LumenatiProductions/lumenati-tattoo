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

  // ── This game's own chiptune: tense sterile march ──
  var SONGS = [
    { root: 110.00, bass: [0,-1,0,-1, 1,-1,1,-1, 0,-1,0,-1, 5,-1,3,1],  lead: [12,-1,-1,13, -1,12,-1,-1, 15,-1,13,12, -1,-1,8,-1] },
    { root: 103.83, bass: [0,0,-1,0, 3,3,-1,3, 0,0,-1,0, 6,-1,5,3],    lead: [15,-1,12,-1, 18,-1,15,-1, 12,-1,15,18, 20,18,15,12] },
  ];
  var MENU_SONG = { root: 110.00, bass: [0,-1,12,-1, 3,-1,15,-1, 5,-1,17,-1, 3,-1,15,-1], lead: [12,-1,15,17, -1,15,-1,12, 17,-1,20,17, -1,15,13,12] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 13 : Math.max(9, 14 - wave);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(wave - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.045);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.026);
    if (musicStep % 2 === 0) playSfx(60, 0.07, 'sawtooth', 0.038);
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
  var ROW_COLOR = [PURPLE, '#2ecc71', CYAN];

  var GCOLS = 8, GROWS = 3, GW = 24, GH = 16, GSX = 38, GSY = 26;

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, wave, frame, bannerT;
  var player, bullets, ebullets, germs, gx, gy, gdir, ufo, particles, invuln, shootCd, touching, rings, muzzle;
  var drops, divers, boss, spreadT, rapidT, pierceT, diverT, popups;
  var keyL = false, keyR = false, keyFire = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-shooter') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-shooter', String(best)); } catch(e) {} }
  }

  function buildWave() {
    germs = [];
    // Wave 2+: the top row grows armored super-germs that take two hits
    var armoredRows = wave >= 4 ? 2 : wave >= 2 ? 1 : 0;
    for (var r = 0; r < GROWS; r++) {
      for (var c = 0; c < GCOLS; c++) {
        var hp = r < armoredRows ? 2 : 1;
        germs.push({ c: c, r: r, alive: true, hp: hp, maxHp: hp, wob: Math.random() * 6.28 });
      }
    }
    gx = 30; gy = 34; gdir = 1;
    divers = [];
    // Every fourth wave the MOTHER GERM descends
    if (wave % 4 === 0) {
      boss = { x: W / 2, y: 44, hp: 8 + wave, maxHp: 8 + wave, dir: 1, fireT: 0 };
      for (var i = germs.length - 1; i >= 0; i--) if (germs[i].r === 0) germs[i].alive = false;
    } else {
      boss = null;
    }
  }

  function addPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 45 });
  }

  function maybeWeapon(x, y) {
    if (Math.random() > 0.11) return;
    var r = Math.random();
    var kind = r < 0.34 ? 'spread' : r < 0.67 ? 'rapid' : 'pierce';
    drops.push({ x: x, y: y, kind: kind });
  }

  function applyWeapon(kind) {
    if (kind === 'spread') { spreadT = 720; addPopup(player.x, player.y - 24, 'SPREAD SHOT', CYAN); }
    else if (kind === 'rapid') { rapidT = 720; addPopup(player.x, player.y - 24, 'RAPID FIRE', YELLOW); }
    else { pierceT = 600; addPopup(player.x, player.y - 24, 'PIERCING', PINK); }
    sfxWave();
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; wave = 1; frame = 0; bannerT = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    player = { x: W / 2, y: 288, w: 22, h: 18 };
    bullets = []; ebullets = []; particles = []; ufo = null; rings = []; muzzle = 0;
    drops = []; divers = []; boss = null; spreadT = 0; rapidT = 0; pierceT = 0; diverT = 0; popups = [];
    invuln = 0; shootCd = 0; touching = false;
    buildWave();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'Arrows move, SPACE fires // drag on phones';
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
    if (shootCd > 0 || bullets.length >= (spreadT > 0 ? 9 : 4)) return;
    if (spreadT > 0) {
      bullets.push({ x: player.x, y: player.y - 12, vx: -1.3, hits: 0 });
      bullets.push({ x: player.x, y: player.y - 12, vx: 0, hits: 0 });
      bullets.push({ x: player.x, y: player.y - 12, vx: 1.3, hits: 0 });
    } else {
      bullets.push({ x: player.x, y: player.y - 12, vx: 0, hits: 0 });
    }
    shootCd = rapidT > 0 ? 6 : 12;
    muzzle = 3;
    sfxShoot();
  }

  function loseLife() {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    sfxHit();
    invuln = 90;
    ebullets = [];
    spawnParticles(player.x, player.y, '#FF0000', 12);
    if (lives <= 0) { enterBoard(score); saveBest(); deathJingle(); }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (shootCd > 0) shootCd--;
    if (invuln > 0) invuln--;
    if (spreadT > 0) spreadT--;
    if (rapidT > 0) rapidT--;
    if (pierceT > 0) pierceT--;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }

    // Divers: from wave 3, germs break formation and kamikaze
    if (wave >= 3) {
      diverT++;
      var needD = Math.max(140, 260 - wave * 12);
      if (diverT > needD) {
        diverT = 0;
        var alive2 = [];
        for (var i = 0; i < germs.length; i++) if (germs[i].alive) alive2.push(germs[i]);
        if (alive2.length > 2) {
          var g2 = alive2[Math.floor(Math.random() * alive2.length)];
          g2.alive = false;
          divers.push({ x: germX(g2) + GW / 2, y: germY(g2) + GH / 2, r: g2.r, vy: 2.2 + wave * 0.15 });
        }
      }
    }
    for (var i = divers.length - 1; i >= 0; i--) {
      var dv = divers[i];
      dv.y += dv.vy;
      dv.x += (player.x - dv.x) * 0.012;
      if (dv.y > H + 14) { divers.splice(i, 1); continue; }
      if (invuln === 0 && Math.abs(dv.x - player.x) < 13 && Math.abs(dv.y - player.y) < 13) {
        divers.splice(i, 1);
        loseLife();
        if (mode !== 'play') return;
      }
    }

    // The mother germ
    if (boss) {
      boss.x += boss.dir * (0.8 + wave * 0.06);
      if (boss.x < 40) boss.dir = 1;
      if (boss.x > W - 40) boss.dir = -1;
      boss.fireT++;
      if (boss.fireT > Math.max(34, 60 - wave * 2)) {
        boss.fireT = 0;
        for (var k = -1; k <= 1; k++) {
          ebullets.push({ x: boss.x + k * 8, y: boss.y + 14, vy: 2.6 + wave * 0.15, vx: k * 0.7 });
        }
      }
    }

    // Weapon vials drift down
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.y = (d.y || 0) + 1.6;
      if (Math.abs(d.x - player.x) < 16 && Math.abs(d.y - player.y) < 14) {
        applyWeapon(d.kind);
        drops.splice(i, 1);
      } else if (d.y > H + 12) {
        drops.splice(i, 1);
      }
    }

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
    if (!ufo && !boss && frame % 700 === 400) ufo = { x: -30, v: 1.6 };
    if (ufo) {
      ufo.x += ufo.v;
      if (ufo.x > W + 30) ufo = null;
    }

    // Player bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.y -= 6;
      b.x += b.vx || 0;
      if (b.y < 14 || b.x < 0 || b.x > W) { bullets.splice(i, 1); continue; }
      var hit = false;
      // divers are worth extra
      for (var j = divers.length - 1; j >= 0; j--) {
        var dv = divers[j];
        if (Math.abs(b.x - dv.x) < 11 && Math.abs(b.y - dv.y) < 11) {
          divers.splice(j, 1);
          hit = true;
          score += 25;
          document.getElementById('jd-br-score').textContent = score;
          rings.push({ x: dv.x, y: dv.y, r: 4, life: 14, c: PINK });
          sfxPop(2);
          break;
        }
      }
      if (!hit && boss && Math.abs(b.x - boss.x) < 18 && Math.abs(b.y - boss.y) < 14) {
        boss.hp--;
        hit = true;
        boss.flashT = 6;
        sfxPop(1);
        if (boss.hp <= 0) {
          score += 200;
          document.getElementById('jd-br-score').textContent = score;
          addPopup(boss.x, boss.y, 'MOTHER GERM +200', YELLOW);
          rings.push({ x: boss.x, y: boss.y, r: 8, life: 22, c: YELLOW });
          rings.push({ x: boss.x, y: boss.y, r: 2, life: 26, c: PINK });
          drops.push({ x: boss.x - 14, y: boss.y, kind: 'spread' });
          drops.push({ x: boss.x + 14, y: boss.y, kind: 'rapid' });
          spawnParticles(boss.x, boss.y, YELLOW, 20);
          boss = null;
          sayCallout('shooter-c3');
        }
      }
      for (var j = 0; j < germs.length; j++) {
        var g = germs[j];
        if (!g.alive) continue;
        var x = germX(g), y = germY(g);
        if (b.x > x && b.x < x + GW && b.y > y && b.y < y + GH) {
          hit = true;
          g.hp--;
          if (g.hp <= 0) {
            g.alive = false;
            score += (GROWS - g.r) * 10 + (g.maxHp === 2 ? 20 : 0);
            document.getElementById('jd-br-score').textContent = score;
            sfxPop(GROWS - g.r);
            rings.push({ x: x + GW / 2, y: y + GH / 2, r: 4, life: 14, c: ROW_COLOR[g.r] });
            spawnParticles(x + GW / 2, y + GH / 2, ROW_COLOR[g.r], 8);
            maybeWeapon(x + GW / 2, y + GH / 2);
          } else {
            g.flashT = 8;
            sfxPop(0);
            spawnParticles(b.x, b.y, '#fff', 4);
          }
          break;
        }
      }
      if (!hit && ufo && b.x > ufo.x - 16 && b.x < ufo.x + 16 && b.y > 18 && b.y < 34) {
        score += 50;
        document.getElementById('jd-br-score').textContent = score;
        sfxUfo();
        sayCallout('shooter-c2');
        rings.push({ x: ufo.x, y: 26, r: 6, life: 18, c: YELLOW });
        spawnParticles(ufo.x, 26, YELLOW, 14);
        ufo = null;
        hit = true;
      }
      if (hit) {
        b.hits = (b.hits || 0) + 1;
        if (pierceT <= 0 || b.hits >= 3) bullets.splice(i, 1);
      }
    }

    // Enemy ooze
    for (var i = ebullets.length - 1; i >= 0; i--) {
      var e = ebullets[i];
      e.y += e.vy;
      e.x += e.vx || 0;
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
    if (alive === 0 && !boss) {
      wave++;
      score += 100;
      document.getElementById('jd-br-score').textContent = score;
      sfxWave();
      buildWave();
      ebullets = [];
      bannerT = 90;
      sayCallout('shooter-c1');
    }
    if (bannerT > 0) bannerT--;

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var i = rings.length - 1; i >= 0; i--) {
      rings[i].r += 1.7; rings[i].life--;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
    if (muzzle > 0) muzzle--;
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
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
    if (g.flashT) { g.flashT--; }
    if (g.maxHp === 2 && g.hp === 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(x + GW / 2, y + GH / 2 + wob, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = g.flashT ? '#fff' : ROW_COLOR[g.r];
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

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-shooter-board';
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
    ctx.fillText('CONTAMINATED', W / 2, 58);
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
    ctx.fillText('SPACE or TAP to re-sterilize', W / 2, 286);
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
    ctx.fillStyle = '#060a14'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,255,255,0.03)';
    for (var gy2 = 20; gy2 < H; gy2 += 20) ctx.fillRect(0, gy2, W, 1);
    var beamT = 118;
    var vaporized = t2 > beamT + 8;
    for (var i = 0; i < 3; i++) {
      if (i === 1 && vaporized) continue;
      var gx3 = W / 2 - 70 + i * 70;
      var flee = vaporized && i !== 1 ? (t2 - beamT - 8) * 1.6 : 0;
      var gy3 = Math.min(64, 12 + t2 * 0.8) + Math.sin(t2 * 0.15 + i * 2) * 4 - flee;
      ctx.fillStyle = [PURPLE, '#2ecc71', CYAN][i];
      ctx.beginPath(); ctx.arc(gx3 + (vaporized ? (i - 1) * flee * 0.4 : 0), gy3, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(gx3 - 5, gy3 - 4, 4, 4); ctx.fillRect(gx3 + 2, gy3 - 4, 4, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(gx3 - 4, gy3 - 3, 2, 2); ctx.fillRect(gx3 + 3, gy3 - 3, 2, 2);
    }
    // monitor readout title
    var typed = Math.max(0, Math.min(8, Math.floor((t2 - 10) / 6)));
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = CYAN;
    var shown = 'STERILE!'.slice(0, typed);
    if (typed < 8 && Math.floor(t2 / 8) % 2 === 0) shown += '_';
    ctx.fillText(shown, W / 2, 150);
    // the machine rises and charges
    var py3 = Math.max(240, 300 - t2 * 1.4);
    if (t2 > 70 && t2 <= beamT) {
      var chg = (t2 - 70) / (beamT - 70);
      ctx.fillStyle = 'rgba(0,255,255,' + (0.25 + Math.sin(t2 * 0.8) * 0.15).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(W / 2, py3 - 16, 2 + chg * 9, 0, Math.PI * 2); ctx.fill();
    }
    if (t2 > beamT && t2 <= beamT + 8) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(W / 2 - 3, 40, 6, py3 - 56);
      ctx.fillStyle = 'rgba(0,255,255,0.5)';
      ctx.fillRect(W / 2 - 7, 40, 14, py3 - 56);
    }
    if (vaporized && t2 < beamT + 30) {
      var vr = (t2 - beamT - 8) * 3;
      ctx.strokeStyle = '#2ecc71';
      ctx.globalAlpha = Math.max(0, 1 - (t2 - beamT - 8) / 22);
      ctx.beginPath(); ctx.arc(W / 2, 60, vr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, 60, vr * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#ccc'; ctx.fillRect(W / 2 - 1, py3 - 12, 2, 6);
    ctx.fillStyle = PURPLE; ctx.fillRect(W / 2 - 6, py3 - 6, 12, 12);
    ctx.fillStyle = PINK; ctx.fillRect(W / 2 - 8, py3 - 8, 4, 4); ctx.fillRect(W / 2 + 4, py3 - 8, 4, 4);
    if (t2 > 150) { ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('KEEP THE TRAY CLEAN', W / 2, 186); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS move, SPACE fires // catch vials: Spread, Rapid, Pierce', W / 2, H - 42);
    ctx.fillText('divers kamikaze from wave 3 // the MOTHER GERM comes every 4th', W / 2, H - 29);
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
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, W, H);

    // Faint grid: a petri-dish scan
    ctx.fillStyle = 'rgba(0,255,255,0.03)';
    for (var y = 20; y < H; y += 20) ctx.fillRect(0, y, W, 1);
    // Spores drifting through the dish
    for (var i = 0; i < 12; i++) {
      var spx = ((i * 53 + frame * (0.2 + (i % 3) * 0.15)) % (W + 20)) - 10;
      var spy = ((i * 97 + frame * 0.08) % (H + 20)) - 10;
      ctx.fillStyle = 'rgba(46,204,113,' + (0.05 + (i % 3) * 0.02).toFixed(2) + ')';
      ctx.fillRect(spx, spy, 2, 2);
    }

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

    // Divers scream in with a wake
    for (var i = 0; i < divers.length; i++) {
      var dv = divers[i];
      ctx.fillStyle = 'rgba(255,20,147,0.25)';
      ctx.fillRect(dv.x - 2, dv.y - 14, 4, 10);
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(dv.x, dv.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(dv.x - 4, dv.y - 3, 3, 3);
      ctx.fillRect(dv.x + 1, dv.y - 3, 3, 3);
      ctx.fillStyle = '#000';
      ctx.fillRect(dv.x - 3, dv.y - 2, 2, 2);
      ctx.fillRect(dv.x + 2, dv.y - 2, 2, 2);
    }

    // The mother germ + her health
    if (boss) {
      if (boss.flashT) boss.flashT--;
      var bwob = Math.sin(frame * 0.1) * 3;
      ctx.fillStyle = boss.flashT ? '#fff' : PURPLE;
      ctx.beginPath(); ctx.arc(boss.x, boss.y + bwob, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(boss.x - 12, boss.y + bwob + 6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(boss.x + 12, boss.y + bwob + 6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(boss.x - 8, boss.y + bwob - 6, 5, 5);
      ctx.fillRect(boss.x + 3, boss.y + bwob - 6, 5, 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(boss.x - 6, boss.y + bwob - 4, 3, 3);
      ctx.fillRect(boss.x + 5, boss.y + bwob - 4, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(boss.x - 20, boss.y + bwob - 28, 40, 4);
      ctx.fillStyle = PINK;
      ctx.fillRect(boss.x - 20, boss.y + bwob - 28, 40 * (boss.hp / boss.maxHp), 4);
    }

    // Weapon vials
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      var dc = d.kind === 'spread' ? CYAN : d.kind === 'rapid' ? YELLOW : PINK;
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(d.x - 5, d.y - 7, 10, 14);
      ctx.fillStyle = dc;
      ctx.fillRect(d.x - 5, d.y - 1, 10, 8);
      ctx.fillStyle = '#888';
      ctx.fillRect(d.x - 3, d.y - 9, 6, 3);
    }

    // Ooze
    ctx.fillStyle = '#2ecc71';
    for (var i = 0; i < ebullets.length; i++) {
      var e = ebullets[i];
      ctx.fillRect(e.x - 2, e.y - 4, 4, 8);
    }

    // Kill rings
    for (var i = 0; i < rings.length; i++) {
      ctx.globalAlpha = rings[i].life / 18;
      ctx.strokeStyle = rings[i].c;
      ctx.beginPath(); ctx.arc(rings[i].x, rings[i].y, rings[i].r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

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
      if (muzzle > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(px - 2, py - 16, 4, 4);
      }
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

    // Popups
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      ctx.globalAlpha = Math.min(1, popups[i].life / 18);
      ctx.fillStyle = popups[i].color;
      ctx.fillText(popups[i].text, popups[i].x, popups[i].y);
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 12);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 100, 12);
    if (mode === 'play' && (spreadT > 0 || rapidT > 0 || pierceT > 0)) {
      ctx.font = 'bold 9px monospace';
      var wx2 = 8;
      if (spreadT > 0) { ctx.fillStyle = CYAN; ctx.fillText('SPREAD ' + Math.ceil(spreadT / 60), wx2, 24); wx2 += 62; }
      if (rapidT > 0) { ctx.fillStyle = YELLOW; ctx.fillText('RAPID ' + Math.ceil(rapidT / 60), wx2, 24); wx2 += 56; }
      if (pierceT > 0) { ctx.fillStyle = PINK; ctx.fillText('PIERCE ' + Math.ceil(pierceT / 60), wx2, 24); }
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = YELLOW;
    ctx.fillText('WAVE ' + wave, W - 8, 12);
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = CYAN;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WAVE ' + wave + ' — SCRUB IN', W / 2, H / 2 - 40);
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-shooter', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
