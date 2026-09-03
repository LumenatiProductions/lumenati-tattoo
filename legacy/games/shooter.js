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
  var ROW_NAME = ['SPORE', 'BACILLUS', 'COCCUS'];

  var GCOLS = 8, GROWS = 3, GW = 24, GH = 16, GSX = 38, GSY = 26;
  var MAX_MULT = 5;

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, wave, frame, bannerT, bannerText, bannerColor;
  var player, bullets, ebullets, germs, gx, gy, gdir, ufo, particles, invuln, shootCd, touching, rings, muzzle, recoil;
  var drops, divers, boss, spreadT, rapidT, pierceT, doubleT, shieldHp, diverT, popups, minis, shields;
  var streak, bestStreak, shots, hits, waveFrames, waveShots, waveHits, waveDeaths, shake, flashT, kills, ufoT;
  var keyL = false, keyR = false, keyFire = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-shooter') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-shooter', String(best)); } catch(e) {} }
  }

  function mult() { return Math.min(MAX_MULT, 1 + Math.floor(streak / 5)); }
  function addScore(base, x, y, label, color) {
    var m = mult();
    var pts = base * m;
    score += pts;
    document.getElementById('jd-br-score').textContent = score;
    if (x !== undefined) addPopup(x, y, (label ? label + ' ' : '') + '+' + pts + (m > 1 ? ' x' + m : ''), color || '#fff');
    return pts;
  }
  function landHit() {
    hits++; waveHits++;
    streak++;
    if (streak > bestStreak) bestStreak = streak;
    if (streak === 5 || streak === 10 || streak === 15 || streak === 20) {
      addPopup(player.x, player.y - 30, 'STREAK x' + mult(), YELLOW);
      playSfx(1200 + mult() * 120, 0.09, 'square', 0.1);
      if (streak === 20) sayCallout('so-sick');
    }
  }
  function missShot(b) {
    if (b.vx) return; // spread side shots never cost the streak
    if (streak >= 5) addPopup(b.x, 26, 'MISS', 'rgba(255,255,255,0.55)');
    streak = Math.floor(streak / 2);
  }

  // Gauze pads: three bunkers over the tray from wave 2, eroded by either side.
  function buildShields() {
    shields = [];
    if (wave < 2) return;
    var cols = 6, rows = 3, bw = 5, bh = 5;
    for (var s = 0; s < 3; s++) {
      var sx = 70 + s * 110, sy = 236;
      var blocks = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        // notch the bottom middle like a real bunker
        if (r === rows - 1 && (c === 2 || c === 3)) continue;
        blocks.push({ x: sx + c * bw, y: sy + r * bh, hp: wave >= 6 ? 1 : 2 });
      }
      shields.push({ blocks: blocks, w: cols * bw, h: rows * bh });
    }
  }
  function hitShield(x, y, r) {
    for (var s = 0; s < shields.length; s++) {
      var bl = shields[s].blocks;
      for (var i = bl.length - 1; i >= 0; i--) {
        var b = bl[i];
        if (x > b.x - r && x < b.x + 5 + r && y > b.y - r && y < b.y + 5 + r) {
          b.hp--;
          spawnParticles(b.x + 2, b.y + 2, '#e8e4d8', 3);
          if (b.hp <= 0) bl.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  }

  function buildWave() {
    germs = [];
    // Wave 2+: the top row grows armored super-germs that take two hits
    var armoredRows = wave >= 4 ? 2 : wave >= 2 ? 1 : 0;
    for (var r = 0; r < GROWS; r++) {
      for (var c = 0; c < GCOLS; c++) {
        var hp = r < armoredRows ? 2 : 1;
        // From wave 5 some bacilli carry a payload: killed, they split into two minis
        var splitter = wave >= 5 && r === 1 && Math.random() < Math.min(0.5, 0.2 + wave * 0.04);
        // Carriers glow and always drop a vial
        var carrier = !splitter && Math.random() < 0.08;
        germs.push({ c: c, r: r, alive: true, hp: hp, maxHp: hp, wob: Math.random() * 6.28, blink: Math.random() * 200, splitter: splitter, carrier: carrier });
      }
    }
    gx = 30; gy = 34; gdir = 1;
    divers = []; minis = [];
    waveFrames = 0; waveShots = 0; waveHits = 0; waveDeaths = 0;
    ufoT = 0;
    buildShields();
    // Every fourth wave the MOTHER GERM descends
    if (wave % 4 === 0) {
      boss = { x: W / 2, y: 44, hp: 10 + wave * 2, maxHp: 10 + wave * 2, dir: 1, fireT: 0, phase: 0, tent: 0 };
      for (var i = germs.length - 1; i >= 0; i--) if (germs[i].r === 0) germs[i].alive = false;
      bannerText = 'MOTHER GERM'; bannerColor = PURPLE; bannerT = 100;
    } else {
      boss = null;
    }
  }

  function addPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 48 });
  }

  function maybeWeapon(x, y, force) {
    if (!force && Math.random() > 0.1) return;
    var r = Math.random();
    var kind = r < 0.25 ? 'spread' : r < 0.5 ? 'rapid' : r < 0.7 ? 'pierce' : r < 0.86 ? 'double' : 'shield';
    drops.push({ x: x, y: y, kind: kind, spin: 0 });
  }

  function applyWeapon(kind) {
    if (kind === 'spread') { spreadT = 720; addPopup(player.x, player.y - 24, 'SPREAD SHOT', CYAN); }
    else if (kind === 'rapid') { rapidT = 720; addPopup(player.x, player.y - 24, 'RAPID FIRE', YELLOW); }
    else if (kind === 'pierce') { pierceT = 600; addPopup(player.x, player.y - 24, 'PIERCING', PINK); }
    else if (kind === 'double') { doubleT = 720; addPopup(player.x, player.y - 24, 'DOUBLE NEEDLE', LIME); }
    else { shieldHp = 1; addPopup(player.x, player.y - 24, 'GLOVED UP', '#fff'); }
    sfxWave();
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; wave = 1; frame = 0; bannerT = 0; bannerText = ''; bannerColor = CYAN; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    player = { x: W / 2, y: 288, w: 22, h: 18 };
    bullets = []; ebullets = []; particles = []; ufo = null; rings = []; muzzle = 0; recoil = 0;
    drops = []; divers = []; minis = []; boss = null; spreadT = 0; rapidT = 0; pierceT = 0; doubleT = 0; shieldHp = 0; diverT = 0; popups = [];
    streak = 0; bestStreak = 0; shots = 0; hits = 0; shake = 0; flashT = 0; kills = 0;
    invuln = 0; shootCd = 0; touching = false;
    buildWave();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Drag to fly (autofire) // FIRE for bursts' : 'Arrows move, SPACE fires';
    window.skateRunning = true;
    startLoop();
  }

  function spawnParticles(x, y, color, count, power) {
    var pw = power || 1;
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4 * pw,
        vy: (Math.random() - 0.7) * 4 * pw,
        life: 16 + Math.random() * 14,
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
    if (shootCd > 0 || bullets.length >= (spreadT > 0 || doubleT > 0 ? 10 : 4)) return;
    var y0 = player.y - 14;
    if (spreadT > 0) {
      bullets.push({ x: player.x, y: y0, vx: -1.3, hits: 0 });
      bullets.push({ x: player.x, y: y0, vx: 0, hits: 0 });
      bullets.push({ x: player.x, y: y0, vx: 1.3, hits: 0 });
    } else if (doubleT > 0) {
      bullets.push({ x: player.x - 5, y: y0, vx: 0, hits: 0 });
      bullets.push({ x: player.x + 5, y: y0, vx: 0, hits: 0 });
    } else {
      bullets.push({ x: player.x, y: y0, vx: 0, hits: 0 });
    }
    shots++; waveShots++;
    shootCd = rapidT > 0 ? 6 : 12;
    muzzle = 4; recoil = 3;
    sfxShoot();
  }

  function killGerm(g, bx, by) {
    var x = germX(g), y = germY(g);
    g.alive = false;
    kills++;
    var base = (GROWS - g.r) * 10 + (g.maxHp === 2 ? 20 : 0);
    var left = aliveCount();
    var label = left === 0 ? 'LAST ONE' : (g.maxHp === 2 ? 'ARMORED' : '');
    if (left === 0) base += 100;
    addScore(base, x + GW / 2, y - 4, label, ROW_COLOR[g.r]);
    sfxPop(GROWS - g.r);
    rings.push({ x: x + GW / 2, y: y + GH / 2, r: 4, life: 14, c: ROW_COLOR[g.r] });
    spawnParticles(x + GW / 2, y + GH / 2, ROW_COLOR[g.r], 10);
    if (left === 0) { shake = 8; flashT = 4; }
    if (g.splitter) {
      for (var k = -1; k <= 1; k += 2) minis.push({ x: x + GW / 2 + k * 6, y: y + GH / 2, vx: k * 0.9, vy: 1.4 + wave * 0.1, t: Math.random() * 6 });
      addPopup(x + GW / 2, y + 12, 'IT SPLIT', '#2ecc71');
    }
    maybeWeapon(x + GW / 2, y + GH / 2, g.carrier);
  }

  function loseLife(why) {
    if (shieldHp > 0) {
      shieldHp = 0;
      invuln = 40;
      rings.push({ x: player.x, y: player.y, r: 10, life: 18, c: '#fff' });
      addPopup(player.x, player.y - 26, 'GLOVE SAVED YOU', '#fff');
      playSfx(500, 0.12, 'triangle', 0.12);
      shake = 4;
      return;
    }
    lives--;
    waveDeaths++;
    document.getElementById('jd-br-lives').textContent = lives;
    sfxHit();
    invuln = 90;
    ebullets = [];
    streak = 0;
    shake = 12; flashT = 6;
    spawnParticles(player.x, player.y, '#FF0000', 16, 1.6);
    spawnParticles(player.x, player.y, PURPLE, 10, 1.2);
    if (why) addPopup(player.x, player.y - 30, why, '#ff5050');
    if (lives <= 0) { enterBoard(score); saveBest(); deathJingle(); }
  }

  function endWave() {
    // Clear bonus: a flat per wave, a clock bonus for speed, clean hands for accuracy, spotless for no deaths
    var flat = 100 * wave;
    var clock = Math.max(0, Math.floor((2400 - waveFrames) / 8));
    var acc = waveShots ? Math.round(100 * waveHits / waveShots) : 0;
    var accBonus = acc >= 70 ? acc * 2 : 0;
    var spotless = waveDeaths === 0 ? 150 : 0;
    score += flat + clock + accBonus + spotless;
    document.getElementById('jd-br-score').textContent = score;
    addPopup(W / 2, 120, 'WAVE CLEAR +' + flat, CYAN);
    if (clock) addPopup(W / 2, 138, 'FAST +' + clock, YELLOW);
    if (accBonus) addPopup(W / 2, 156, 'CLEAN HANDS ' + acc + '% +' + accBonus, LIME);
    if (spotless) addPopup(W / 2, 174, 'SPOTLESS +' + spotless, '#fff');
    wave++;
    sfxWave();
    buildWave();
    ebullets = [];
    if (!boss) { bannerText = 'WAVE ' + wave + ' // SCRUB IN'; bannerColor = CYAN; bannerT = 90; }
    sayCallout('shooter-c1');
  }

  function update() {
    frame++;
    waveFrames++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (shootCd > 0) shootCd--;
    if (invuln > 0) invuln--;
    if (spreadT > 0) spreadT--;
    if (rapidT > 0) rapidT--;
    if (pierceT > 0) pierceT--;
    if (doubleT > 0) doubleT--;
    if (shake > 0) shake--;
    if (flashT > 0) flashT--;
    if (recoil > 0) recoil--;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }

    // Divers: from wave 3, germs break formation and kamikaze on a curve
    if (wave >= 3) {
      diverT++;
      var needD = Math.max(120, 260 - wave * 12);
      if (diverT > needD) {
        diverT = 0;
        var alive2 = [];
        for (var i = 0; i < germs.length; i++) if (germs[i].alive) alive2.push(germs[i]);
        if (alive2.length > 2) {
          var g2 = alive2[Math.floor(Math.random() * alive2.length)];
          g2.alive = false;
          divers.push({ x: germX(g2) + GW / 2, y: germY(g2) + GH / 2, r: g2.r, vy: 2.2 + wave * 0.15, t: 0, amp: 1.2 + Math.random() * 1.6 });
        }
      }
    }
    for (var i = divers.length - 1; i >= 0; i--) {
      var dv = divers[i];
      dv.t++;
      dv.y += dv.vy;
      dv.x += (player.x - dv.x) * 0.012 + Math.sin(dv.t * 0.18) * dv.amp;
      if (dv.y > H + 14) { divers.splice(i, 1); continue; }
      if (hitShield(dv.x, dv.y, 6)) { divers.splice(i, 1); spawnParticles(dv.x, dv.y, PINK, 6); continue; }
      if (invuln === 0 && Math.abs(dv.x - player.x) < 13 && Math.abs(dv.y - player.y) < 13) {
        divers.splice(i, 1);
        loseLife('DIVER GOT YOU');
        if (mode !== 'play') return;
      }
    }
    // Minis: the halves of a split bacillus, slow and wobbly, worth a little
    for (var i = minis.length - 1; i >= 0; i--) {
      var mn = minis[i];
      mn.t += 0.2;
      mn.y += mn.vy;
      mn.x += mn.vx + Math.sin(mn.t) * 0.8;
      if (mn.y > H + 10) { minis.splice(i, 1); continue; }
      if (hitShield(mn.x, mn.y, 4)) { minis.splice(i, 1); continue; }
      if (invuln === 0 && Math.abs(mn.x - player.x) < 10 && Math.abs(mn.y - player.y) < 10) {
        minis.splice(i, 1);
        loseLife('SPLIT GERM');
        if (mode !== 'play') return;
      }
    }

    // The mother germ: tracks you, fires in fans, gets angry under half health
    if (boss) {
      var angry = boss.hp <= boss.maxHp / 2;
      boss.tent += angry ? 0.16 : 0.08;
      boss.x += boss.dir * (0.8 + wave * 0.06) * (angry ? 1.6 : 1);
      if (boss.x < 40) boss.dir = 1;
      if (boss.x > W - 40) boss.dir = -1;
      boss.fireT++;
      if (boss.fireT > Math.max(26, (angry ? 44 : 60) - wave * 2)) {
        boss.fireT = 0;
        var fan = angry ? 2 : 1;
        for (var k = -fan; k <= fan; k++) {
          ebullets.push({ x: boss.x + k * 8, y: boss.y + 14, vy: 2.6 + wave * 0.15, vx: k * 0.7, big: true });
        }
      }
    }

    // Vials drift down, spinning
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      d.y = (d.y || 0) + 1.6;
      d.spin += 0.08;
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
      if (alive > 0) playSfx(90 + (24 - alive) * 3, 0.05, 'square', 0.05);
    }
    // They reached the tray: lose a life, push them back up
    if (maxY + GH >= player.y - 6 && mode === 'play') {
      loseLife('THEY REACHED THE TRAY');
      if (mode === 'play') gy = 34;
    }
    // The grid chews through the gauze on its way down
    if (shields.length && maxY + GH >= 236) {
      for (var s = 0; s < shields.length; s++) {
        var bl = shields[s].blocks;
        for (var q = bl.length - 1; q >= 0; q--) if (bl[q].y < maxY + GH) bl.splice(q, 1);
      }
    }

    // Germs fire ooze
    var fireEvery = Math.max(20, 55 - wave * 5);
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
        var s2 = shooters[Math.floor(Math.random() * shooters.length)];
        ebullets.push({ x: germX(s2) + GW / 2, y: germY(s2) + GH, vy: 2.2 + wave * 0.25 });
      }
    }

    // Mold cloud: drifts across the top, worth a mystery bonus
    ufoT++;
    if (!ufo && !boss && ufoT > 520 && Math.random() < 0.02) {
      var fromLeft = Math.random() < 0.5;
      ufo = { x: fromLeft ? -30 : W + 30, v: (fromLeft ? 1 : -1) * (1.5 + wave * 0.1), bonus: [100, 150, 200, 300][Math.floor(Math.random() * 4)] };
      ufoT = 0;
      playSfx(1500, 0.08, 'triangle', 0.06);
    }
    if (ufo) {
      ufo.x += ufo.v;
      if (frame % 9 === 0) playSfx(1400 + Math.sin(frame * 0.3) * 200, 0.05, 'triangle', 0.03);
      if (ufo.x > W + 34 || ufo.x < -34) ufo = null;
    }

    // Player bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.py = b.y;
      b.y -= 6;
      b.x += b.vx || 0;
      if (b.y < 14 || b.x < 0 || b.x > W) { if (!b.hits) missShot(b); bullets.splice(i, 1); continue; }
      var hit = false;
      // divers are worth extra
      for (var j = divers.length - 1; j >= 0; j--) {
        var dv = divers[j];
        if (Math.abs(b.x - dv.x) < 11 && Math.abs(b.y - dv.y) < 11) {
          divers.splice(j, 1);
          hit = true;
          landHit();
          addScore(40, dv.x, dv.y - 8, 'DIVER', PINK);
          rings.push({ x: dv.x, y: dv.y, r: 4, life: 14, c: PINK });
          spawnParticles(dv.x, dv.y, PINK, 8);
          sfxPop(2);
          break;
        }
      }
      if (!hit) for (var j = minis.length - 1; j >= 0; j--) {
        var mn = minis[j];
        if (Math.abs(b.x - mn.x) < 8 && Math.abs(b.y - mn.y) < 8) {
          minis.splice(j, 1);
          hit = true;
          landHit();
          addScore(15, mn.x, mn.y - 8, '', '#2ecc71');
          spawnParticles(mn.x, mn.y, '#2ecc71', 5);
          sfxPop(1);
          break;
        }
      }
      if (!hit && boss && Math.abs(b.x - boss.x) < 20 && Math.abs(b.y - boss.y) < 16) {
        boss.hp--;
        hit = true;
        landHit();
        boss.flashT = 6;
        spawnParticles(b.x, b.y, '#fff', 4);
        sfxPop(1);
        if (boss.hp <= 0) {
          addScore(500 + wave * 25, boss.x, boss.y, 'MOTHER GERM', YELLOW);
          rings.push({ x: boss.x, y: boss.y, r: 8, life: 22, c: YELLOW });
          rings.push({ x: boss.x, y: boss.y, r: 2, life: 26, c: PINK });
          rings.push({ x: boss.x, y: boss.y, r: 14, life: 30, c: PURPLE });
          drops.push({ x: boss.x - 14, y: boss.y, kind: 'spread', spin: 0 });
          drops.push({ x: boss.x + 14, y: boss.y, kind: 'shield', spin: 0 });
          spawnParticles(boss.x, boss.y, YELLOW, 24, 2);
          spawnParticles(boss.x, boss.y, PURPLE, 24, 1.5);
          shake = 16; flashT = 8;
          boss = null;
          sayCallout('shooter-c3');
        }
      }
      if (!hit) for (var j = 0; j < germs.length; j++) {
        var g = germs[j];
        if (!g.alive) continue;
        var x = germX(g), y = germY(g);
        if (b.x > x && b.x < x + GW && b.y > y && b.y < y + GH) {
          hit = true;
          landHit();
          g.hp--;
          if (g.hp <= 0) killGerm(g, b.x, b.y);
          else {
            g.flashT = 8;
            sfxPop(0);
            spawnParticles(b.x, b.y, '#fff', 4);
            addPopup(x + GW / 2, y - 2, 'CRACKED', 'rgba(255,255,255,0.6)');
          }
          break;
        }
      }
      if (!hit && ufo && b.x > ufo.x - 16 && b.x < ufo.x + 16 && b.y > 16 && b.y < 36) {
        landHit();
        addScore(ufo.bonus, ufo.x, 40, 'MOLD', YELLOW);
        sfxUfo();
        sayCallout('shooter-c2');
        rings.push({ x: ufo.x, y: 26, r: 6, life: 18, c: YELLOW });
        spawnParticles(ufo.x, 26, YELLOW, 16, 1.4);
        shake = 6;
        ufo = null;
        hit = true;
      }
      if (!hit && shields.length && b.y < 256 && hitShield(b.x, b.y, 1)) { bullets.splice(i, 1); continue; }
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
      if (shields.length && e.y > 230 && hitShield(e.x, e.y, 2)) { ebullets.splice(i, 1); continue; }
      if (invuln === 0 &&
          e.x > player.x - player.w / 2 && e.x < player.x + player.w / 2 &&
          e.y > player.y - player.h / 2 && e.y < player.y + player.h / 2) {
        ebullets.splice(i, 1);
        loseLife(e.big ? 'MOTHER OOZE' : 'OOZED');
        if (mode !== 'play') return;
        break; // a hit wipes the ooze, so the list under this loop is gone
      }
    }

    // Wave cleared
    if (alive === 0 && !boss && minis.length === 0) endWave();
    if (bannerT > 0) bannerT--;

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life--;
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
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
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
    player.x = Math.max(14, Math.min(W - 14, canvasX((e.targetTouches[0] || e.touches[0]).clientX)));
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    player.x = Math.max(14, Math.min(W - 14, canvasX((e.targetTouches[0] || e.touches[0]).clientX)));
  }, { passive: false });
  canvas.addEventListener('touchend', function(e) { e.preventDefault(); touching = false; }, { passive: false });

  // ── Sprites ──
  // Three species, one per row: spiky spores, rod bacilli with flagella, cocci clusters.
  function drawSpecies(cx, cy, r, color, t, flash, blinkT) {
    var eyeOpen = ((blinkT + t * 0.6) % 200) > 8;
    if (r === 0) {
      // Spore: a spiky ball, spikes rotate slowly
      ctx.fillStyle = flash ? '#fff' : color;
      for (var k = 0; k < 8; k++) {
        var a = t * 0.02 + k * Math.PI / 4;
        ctx.fillRect(cx + Math.cos(a) * 10 - 1.5, cy + Math.sin(a) * 10 - 1.5, 3, 3);
      }
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2); ctx.fill();
    } else if (r === 1) {
      // Bacillus: a capsule with whipping flagella
      ctx.strokeStyle = flash ? '#fff' : color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var f = -1; f <= 1; f += 2) {
        ctx.moveTo(cx + f * 10, cy);
        ctx.quadraticCurveTo(cx + f * 15, cy + Math.sin(t * 0.3 + f) * 5, cx + f * 19, cy + Math.cos(t * 0.25) * 4);
      }
      ctx.stroke();
      ctx.fillStyle = flash ? '#fff' : color;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 6);
      ctx.lineTo(cx + 6, cy - 6);
      ctx.arc(cx + 6, cy, 6, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(cx - 6, cy + 6);
      ctx.arc(cx - 6, cy, 6, Math.PI / 2, Math.PI * 1.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(cx - 8, cy + 2, 16, 3);
    } else {
      // Coccus: a cluster of four blobs that breathe
      var br = 5 + Math.sin(t * 0.12) * 0.8;
      ctx.fillStyle = flash ? '#fff' : color;
      ctx.beginPath(); ctx.arc(cx - 4, cy - 3, br, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4, cy - 3, br, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - 4, cy + 4, br, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4, cy + 4, br, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(cx - 5, cy - 5, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Eyes, with a blink
    ctx.fillStyle = '#fff';
    if (eyeOpen) {
      ctx.fillRect(cx - 5, cy - 3, 3, 3);
      ctx.fillRect(cx + 2, cy - 3, 3, 3);
      ctx.fillStyle = '#000';
      var look = Math.max(-1, Math.min(1, (player.x - cx) / 200));
      ctx.fillRect(cx - 4 + look, cy - 2, 2, 2);
      ctx.fillRect(cx + 3 + look, cy - 2, 2, 2);
    } else {
      ctx.fillRect(cx - 5, cy - 2, 3, 1);
      ctx.fillRect(cx + 2, cy - 2, 3, 1);
    }
  }

  function drawGerm(g) {
    var x = germX(g), y = germY(g);
    var wob = Math.sin(frame * 0.15 + g.wob) * 1.5;
    if (g.flashT) { g.flashT--; }
    var cx = x + GW / 2, cy = y + GH / 2 + wob;
    if (g.maxHp === 2 && g.hp === 2) {
      // armor shell
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
    }
    if (g.carrier) {
      ctx.fillStyle = 'rgba(255,215,0,' + (0.15 + Math.sin(frame * 0.2) * 0.1).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
    }
    if (g.splitter) {
      ctx.fillStyle = 'rgba(46,204,113,0.5)';
      ctx.fillRect(cx - 1, cy - 8, 2, 16);
    }
    drawSpecies(cx, cy, g.r, ROW_COLOR[g.r], frame + g.wob * 10, g.flashT, g.blink);
  }

  function drawBackground() {
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, W, H);
    // UV lamp at the top: a purple wash that breathes
    var uv = ctx.createLinearGradient(0, 0, 0, 90);
    uv.addColorStop(0, 'rgba(155,89,182,' + (0.22 + Math.sin(frame * 0.03) * 0.05).toFixed(2) + ')');
    uv.addColorStop(1, 'rgba(155,89,182,0)');
    ctx.fillStyle = uv;
    ctx.fillRect(0, 0, W, 90);
    ctx.fillStyle = '#1b1f2e';
    ctx.fillRect(W / 2 - 60, 0, 120, 5);
    ctx.fillStyle = '#c7a6ff';
    ctx.fillRect(W / 2 - 54, 3, 108, 2);
    // Petri scan lines
    ctx.fillStyle = 'rgba(0,255,255,0.03)';
    for (var y = 20; y < 250; y += 20) ctx.fillRect(0, y, W, 1);
    // Spores drifting through the dish
    for (var i = 0; i < 14; i++) {
      var spx = ((i * 53 + frame * (0.2 + (i % 3) * 0.15)) % (W + 20)) - 10;
      var spy = ((i * 97 + frame * 0.08) % (240)) - 10;
      ctx.fillStyle = 'rgba(46,204,113,' + (0.05 + (i % 3) * 0.02).toFixed(2) + ')';
      ctx.fillRect(spx, spy, 2, 2);
    }
    // Tile floor: the station tray in perspective, grout lines converging
    ctx.fillStyle = '#0c1220';
    ctx.fillRect(0, 258, W, H - 258);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (var k = 0; k <= 8; k++) {
      var xTop = k * 50, xBot = W / 2 + (k * 50 - W / 2) * 1.5;
      ctx.beginPath(); ctx.moveTo(xTop, 258); ctx.lineTo(xBot, H); ctx.stroke();
    }
    var rows = [258, 266, 278, 296, H];
    for (var r = 0; r < rows.length; r++) { ctx.beginPath(); ctx.moveTo(0, rows[r]); ctx.lineTo(W, rows[r]); ctx.stroke(); }
    // Station lights along the tray edge
    for (var l = 0; l < 6; l++) {
      var on = Math.floor(frame / 20 + l) % 6 === 0;
      ctx.fillStyle = on ? LIME : 'rgba(127,255,0,0.2)';
      ctx.fillRect(20 + l * 72, 260, 4, 2);
    }
  }

  function drawVial(d) {
    var dc = d.kind === 'spread' ? CYAN : d.kind === 'rapid' ? YELLOW : d.kind === 'pierce' ? PINK : d.kind === 'double' ? LIME : '#fff';
    var tilt = Math.sin(d.spin) * 0.4;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(tilt);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(-5, -7, 10, 14);
    ctx.fillStyle = dc;
    ctx.fillRect(-5, -1 + Math.sin(frame * 0.2) * 1, 10, 8);
    ctx.fillStyle = '#888';
    ctx.fillRect(-3, -9, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-4, -6, 2, 5);
    ctx.restore();
    ctx.fillStyle = dc;
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(d.kind === 'shield' ? 'GLOVE' : d.kind.toUpperCase(), d.x, d.y + 18);
  }

  function drawPlayer() {
    var blink = invuln > 0 && Math.floor(frame / 4) % 2 === 0;
    if (blink) return;
    var px = player.x, py = player.y + recoil;
    // Glove bubble
    if (shieldHp > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + Math.sin(frame * 0.2) * 0.2).toFixed(2) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py - 2, 18, 0, Math.PI * 2); ctx.stroke();
    }
    // Shadow on the tray
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(px, py + 12, 14, 3, 0, 0, Math.PI * 2); ctx.fill();
    // Needle bar + tip
    ctx.fillStyle = '#ddd';
    ctx.fillRect(px - 1, py - 16, 2, 10);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 0.5, py - 18, 1, 3);
    // Muzzle flash
    if (muzzle > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(px, py - 19, 2 + muzzle, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,255,255,0.5)';
      ctx.beginPath(); ctx.arc(px, py - 19, 4 + muzzle * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    // Coil machine body: frame, two coils, grip
    ctx.fillStyle = '#6d3fb0';
    ctx.fillRect(px - 7, py - 7, 14, 14);
    ctx.fillStyle = PURPLE;
    ctx.fillRect(px - 6, py - 6, 12, 10);
    ctx.fillStyle = '#2a1a44';
    ctx.fillRect(px - 9, py - 9, 5, 5);
    ctx.fillRect(px + 4, py - 9, 5, 5);
    ctx.fillStyle = PINK;
    ctx.fillRect(px - 8, py - 8, 3, 3);
    ctx.fillRect(px + 5, py - 8, 3, 3);
    // Copper coil windings
    ctx.fillStyle = '#c8783c';
    for (var w = 0; w < 3; w++) { ctx.fillRect(px - 5, py - 3 + w * 2, 3, 1); ctx.fillRect(px + 2, py - 3 + w * 2, 3, 1); }
    // Grip and the sled it rides on
    ctx.fillStyle = '#8B5CF6';
    ctx.fillRect(px - 11, py + 5, 22, 5);
    ctx.fillStyle = '#3b2a6b';
    ctx.fillRect(px - 11, py + 9, 22, 2);
    ctx.fillStyle = LIME;
    ctx.fillRect(px - 9, py + 6, 2, 2);
    ctx.fillRect(px + 7, py + 6, 2, 2);
    // Power light pulses with the multiplier
    var m = mult();
    ctx.fillStyle = m >= 3 ? YELLOW : CYAN;
    ctx.globalAlpha = 0.5 + Math.sin(frame * (0.1 * m)) * 0.4;
    ctx.fillRect(px - 1, py + 1, 2, 2);
    ctx.globalAlpha = 1;
  }

  function drawBoss() {
    if (!boss) return;
    if (boss.flashT) boss.flashT--;
    var angry = boss.hp <= boss.maxHp / 2;
    var bwob = Math.sin(frame * 0.1) * 3;
    var bx = boss.x, by = boss.y + bwob;
    // Tentacles reach for you
    ctx.strokeStyle = boss.flashT ? '#fff' : (angry ? '#c04dff' : PURPLE);
    ctx.lineWidth = 3;
    for (var k = 0; k < 5; k++) {
      var a = Math.PI * 0.2 + k * Math.PI * 0.15;
      var ex = bx + Math.cos(a) * 30 + Math.sin(boss.tent + k) * 6;
      var ey = by + Math.sin(a) * 28 + Math.cos(boss.tent * 1.3 + k) * 4;
      ctx.beginPath(); ctx.moveTo(bx, by + 8); ctx.quadraticCurveTo(bx + Math.cos(a) * 14, by + 24, ex, ey); ctx.stroke();
      ctx.fillStyle = PINK;
      ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    }
    // Body: three lobes with a membrane sheen
    ctx.fillStyle = boss.flashT ? '#fff' : (angry ? '#b45cff' : PURPLE);
    ctx.beginPath(); ctx.arc(bx, by, 18 + (angry ? Math.sin(frame * 0.4) * 1.5 : 0), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx - 13, by + 6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + 13, by + 6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(bx - 6, by - 8, 6, 0, Math.PI * 2); ctx.fill();
    // Nucleus pulses
    ctx.fillStyle = angry ? '#ff2d7a' : '#5b2a8a';
    ctx.beginPath(); ctx.arc(bx, by + 4, 5 + Math.sin(frame * 0.2) * 1.2, 0, Math.PI * 2); ctx.fill();
    // Eyes track the player
    var look = Math.max(-2, Math.min(2, (player.x - bx) / 60));
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx - 9, by - 7, 6, 6);
    ctx.fillRect(bx + 3, by - 7, 6, 6);
    ctx.fillStyle = angry ? '#f00' : '#000';
    ctx.fillRect(bx - 7 + look, by - 5, 3, 3);
    ctx.fillRect(bx + 5 + look, by - 5, 3, 3);
    // Health bar, big, at the top
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W / 2 - 82, 18, 164, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W / 2 - 80, 20, 160, 6);
    ctx.fillStyle = angry ? '#ff2d7a' : PINK;
    ctx.fillRect(W / 2 - 80, 20, 160 * (boss.hp / boss.maxHp), 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MOTHER GERM' + (angry ? ' // ANGRY' : ''), W / 2, 36);
  }

  function drawShields() {
    for (var s = 0; s < shields.length; s++) {
      var bl = shields[s].blocks;
      for (var i = 0; i < bl.length; i++) {
        var b = bl[i];
        ctx.fillStyle = b.hp >= 2 ? '#e8e4d8' : '#a89f8a';
        ctx.fillRect(b.x, b.y, 5, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(b.x, b.y + 4, 5, 1);
      }
    }
  }

  function drawHud() {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 12);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 100, 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = YELLOW;
    ctx.fillText('WAVE ' + wave, W - 8, 12);
    // Streak meter: fills toward the next multiplier step
    var m = mult();
    var into = m >= MAX_MULT ? 5 : streak % 5;
    ctx.textAlign = 'right';
    ctx.fillStyle = m > 1 ? YELLOW : 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('x' + m, W - 8, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W - 68, 18, 40, 4);
    ctx.fillStyle = m >= 3 ? YELLOW : CYAN;
    ctx.fillRect(W - 68, 18, 40 * (into / 5), 4);
    if (streak > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '7px monospace';
      ctx.fillText('STREAK ' + streak, W - 72, 25);
    }
    // Weapon timers as bars
    var timers = [];
    if (spreadT > 0) timers.push(['SPREAD', spreadT / 720, CYAN]);
    if (rapidT > 0) timers.push(['RAPID', rapidT / 720, YELLOW]);
    if (pierceT > 0) timers.push(['PIERCE', pierceT / 600, PINK]);
    if (doubleT > 0) timers.push(['DOUBLE', doubleT / 720, LIME]);
    if (shieldHp > 0) timers.push(['GLOVE', 1, '#fff']);
    ctx.textAlign = 'left';
    ctx.font = 'bold 7px monospace';
    for (var t = 0; t < timers.length; t++) {
      var tx = 8 + t * 62;
      ctx.fillStyle = timers[t][2];
      ctx.fillText(timers[t][0], tx, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(tx, 26, 50, 3);
      ctx.fillStyle = timers[t][2];
      ctx.fillRect(tx, 26, 50 * timers[t][1], 3);
    }
    // Lives as little machines
    for (var l = 0; l < lives; l++) {
      ctx.fillStyle = PURPLE;
      ctx.fillRect(W - 20 - l * 10, H - 10, 6, 6);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(W - 18 - l * 10, H - 13, 2, 3);
    }
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'shooter', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'CONTAMINATED', again: 'SPACE or TAP to re-sterilize',
    label: 'Sterile!',
    levelLabel: function (l) { return 'REACHED WAVE ' + l; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) {
    wall.enter(v, { level: wave, meta: { waves: wave, streak: bestStreak, kills: kills, acc: shots ? Math.round(100 * hits / shots) : 0 } });
  }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }


  // ── Attract-mode intro: CRT power-on, studio card, the title scene, then the wall ──
  var INTRO_TITLE_END = 285, INTRO_LOOP_END = 525;
  function drawIntro() {
    var t = introT;
    if (t > INTRO_TITLE_END) { wall.drawAttract(); return; }
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
    ctx.fillStyle = '#060a14'; ctx.fillRect(0, 0, W, H);
    var uv = ctx.createLinearGradient(0, 0, 0, 90);
    uv.addColorStop(0, 'rgba(155,89,182,0.25)');
    uv.addColorStop(1, 'rgba(155,89,182,0)');
    ctx.fillStyle = uv; ctx.fillRect(0, 0, W, 90);
    ctx.fillStyle = 'rgba(0,255,255,0.03)';
    for (var gy2 = 20; gy2 < H; gy2 += 20) ctx.fillRect(0, gy2, W, 1);
    var beamT = 118;
    var vaporized = t2 > beamT + 8;
    for (var i = 0; i < 3; i++) {
      if (i === 1 && vaporized) continue;
      var gx3 = W / 2 - 70 + i * 70;
      var flee = vaporized && i !== 1 ? (t2 - beamT - 8) * 1.6 : 0;
      var gy3 = Math.min(64, 12 + t2 * 0.8) + Math.sin(t2 * 0.15 + i * 2) * 4 - flee;
      drawSpecies(gx3 + (vaporized ? (i - 1) * flee * 0.4 : 0), gy3, i, ROW_COLOR[i], t2 + i * 30, false, i * 70);
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
    var savedPlayer = player;
    player = { x: W / 2, y: py3 };
    drawPlayer();
    player = savedPlayer;
    if (t2 > 150) { ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('KEEP THE TRAY CLEAN', W / 2, 186); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS move, SPACE fires // vials: Spread, Rapid, Pierce, Double, Glove', W / 2, H - 42);
    ctx.fillText('chain hits for x5 // clear fast, shoot straight, stay spotless', W / 2, H - 29);
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
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBackground();

    // Mold cloud
    if (ufo) {
      var uy = 26 + Math.sin(frame * 0.1) * 2;
      ctx.fillStyle = 'rgba(255,215,0,0.15)';
      ctx.beginPath(); ctx.arc(ufo.x, uy, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a6a20';
      ctx.beginPath(); ctx.arc(ufo.x - 8, uy + 3, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ufo.x + 8, uy + 3, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = YELLOW;
      ctx.beginPath(); ctx.arc(ufo.x, uy - 2, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c89b00';
      for (var k = 0; k < 5; k++) ctx.fillRect(ufo.x - 12 + k * 6, uy + 4 + (k % 2) * 3, 3, 3);
      ctx.fillStyle = '#000';
      ctx.fillRect(ufo.x - 5, uy - 5, 3, 3);
      ctx.fillRect(ufo.x + 2, uy - 5, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', ufo.x, uy - 16);
    }

    for (var i = 0; i < germs.length; i++) if (germs[i].alive) drawGerm(germs[i]);

    // Divers scream in with a wake
    for (var i = 0; i < divers.length; i++) {
      var dv = divers[i];
      ctx.fillStyle = 'rgba(255,20,147,0.25)';
      ctx.fillRect(dv.x - 2, dv.y - 18, 4, 14);
      ctx.fillStyle = 'rgba(255,20,147,0.12)';
      ctx.fillRect(dv.x - 4, dv.y - 26, 8, 10);
      drawSpecies(dv.x, dv.y, dv.r, PINK, frame * 2, false, 0);
    }
    // Minis
    for (var i = 0; i < minis.length; i++) {
      var mn = minis[i];
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath(); ctx.arc(mn.x, mn.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(mn.x - 3, mn.y - 2, 2, 2); ctx.fillRect(mn.x + 1, mn.y - 2, 2, 2);
    }

    drawBoss();
    drawShields();
    for (var i = 0; i < drops.length; i++) drawVial(drops[i]);

    // Ooze
    for (var i = 0; i < ebullets.length; i++) {
      var e = ebullets[i];
      ctx.fillStyle = e.big ? 'rgba(180,92,255,0.35)' : 'rgba(46,204,113,0.3)';
      ctx.fillRect(e.x - 2, e.y - 10, 4, 8);
      ctx.fillStyle = e.big ? '#b45cff' : '#2ecc71';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.big ? 4 : 2.5, e.big ? 6 : 4.5, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Kill rings
    for (var i = 0; i < rings.length; i++) {
      ctx.globalAlpha = rings[i].life / 18;
      ctx.strokeStyle = rings[i].c;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(rings[i].x, rings[i].y, rings[i].r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Needles with a trail
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      ctx.fillStyle = pierceT > 0 ? 'rgba(255,20,147,0.35)' : 'rgba(0,255,255,0.3)';
      ctx.fillRect(b.x - 1, b.y, 2, 12);
      ctx.fillStyle = pierceT > 0 ? PINK : '#eee';
      ctx.fillRect(b.x - 1, b.y - 6, 2, 8);
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 0.5, b.y - 7, 1, 3);
    }

    drawPlayer();

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 20);
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
    ctx.restore();

    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flashT * 0.06).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    drawHud();
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerColor;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 40);
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
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > INTRO_LOOP_END) introT = 70; }
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
