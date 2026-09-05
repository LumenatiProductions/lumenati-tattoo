(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  // Logical width comes from the shell on phones (400 to 720 in landscape);
  // the harness and the desktop stay at 400. Height is always 320.
  var VIEW = window.__ARCADE_VIEW__ || null;
  var W = (VIEW && VIEW.w) || 400, H = 320;
  var PHONE = !!(VIEW && VIEW.phone), PORTRAIT = !!(VIEW && VIEW.portrait);
  var WS = W / 400;
  // On a phone the shell floats the d-pad and the A button in the bottom
  // corners, so the machine rides higher and the corner HUD moves up.
  var PLAYER_Y = PHONE ? 248 : 288, FLOOR_Y = PHONE ? 218 : 258;

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

  // Wider screens get more columns of germs (8 at 400, up to 12 at 720).
  var GCOLS = Math.min(12, 8 + Math.floor((W - 400) / 80)), GROWS = 3, GW = 24, GH = 16, GSX = 38, GSY = 26;
  var MAX_MULT = 5;

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, wave, frame, bannerT, bannerText, bannerColor;
  var player, bullets, ebullets, germs, gx, gy, gdir, ufo, particles, invuln, shootCd, touching, rings, muzzle, recoil;
  var drops, divers, boss, spreadT, rapidT, pierceT, doubleT, shieldHp, diverT, popups, minis, shields;
  var streak, bestStreak, shots, hits, waveFrames, waveShots, waveHits, waveDeaths, shake, flashT, kills, ufoT;
  // Second pass: wave types, bosses, the beam and the UV flash
  var waveType, swarm, rain, rainLeft, rainLanded, rainSpawnT, chainQ, beamHold, beamHeat, overheat, beamHitT;
  var uvReady, uvFlashT, bossIntroT, waveFlipT, formationKills, bossesDown, wavesCleared, bossName;
  var keyL = false, keyR = false, keyFire = false;
  var BOSS_NAMES = ['MOTHER GERM', 'MOLD KING', 'THE VIRUS'];
  var UV_BOX = PHONE ? { x: 8, y: 44, w: 52, h: 16 } : { x: 8, y: H - 34, w: 44, h: 14 };

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
      var sx = W / 2 - 15 + (s - 1) * 110 * WS, sy = PLAYER_Y - 52;
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

  // Wave types: 1 and 2 are the grid; then swarm, rain, boss, grid, fortress,
  // swarm, rain, boss ... a boss every fifth wave, three bosses in rotation.
  function typeFor(w) {
    if (w % 5 === 0) return 'boss';
    if (w <= 2) return 'grid';
    var k = w % 5; // 1 grid, 2 fortress, 3 swarm, 4 rain
    return k === 1 ? 'grid' : k === 2 ? 'fortress' : k === 3 ? 'swarm' : 'rain';
  }

  function buildGrid(fortress) {
    germs = [];
    var armoredRows = wave >= 4 ? 2 : wave >= 2 ? 1 : 0;
    for (var r = 0; r < GROWS; r++) {
      for (var c = 0; c < GCOLS; c++) {
        var hp = r < armoredRows ? 2 : 1;
        var splitter = !fortress && wave >= 5 && r === 1 && Math.random() < Math.min(0.5, 0.2 + wave * 0.04);
        var carrier = !splitter && Math.random() < 0.08;
        var wallBlock = false;
        if (fortress) {
          // Rows 1 and 2 are the wall: armored, three hits, with two gaps to shoot through.
          if (r > 0) {
            var gapA = 2 + (wave % 3), gapB = 5 + (wave % 2);
            if (c === gapA || c === gapB) continue;
            hp = 3; wallBlock = true; carrier = false;
          } else {
            hp = 1; carrier = Math.random() < 0.15;
          }
        }
        germs.push({ c: c, r: r, alive: true, hp: hp, maxHp: hp, wob: Math.random() * 6.28, blink: Math.random() * 200, splitter: splitter, carrier: carrier, wall: wallBlock });
      }
    }
    gx = Math.max(16, Math.round((W - ((GCOLS - 1) * GSX + GW)) / 2)); gy = 34; gdir = 1;
  }

  // Galaga style: two arcs of germs in formation that sway, and dive in pairs.
  function buildSwarm() {
    germs = []; swarm = [];
    var n = 14 + Math.min(6, wave);
    for (var i = 0; i < n; i++) {
      var row = i < 8 ? 0 : 1;
      var k = row === 0 ? i : i - 8;
      var per = row === 0 ? 8 : n - 8;
      var ang = Math.PI * (0.15 + 0.7 * (per > 1 ? k / (per - 1) : 0.5));
      var sx = W / 2 + Math.cos(ang) * (row === 0 ? 150 : 100) * WS;
      var sy = 40 + row * 34 + Math.sin(ang) * 26;
      var r = row === 0 ? (i % 2 === 0 ? 0 : 2) : 1;
      swarm.push({ sx: sx, sy: sy, x: sx, y: -20 - i * 6, r: r, alive: true, hp: 1, maxHp: 1, state: 'enter', t: i * 4, pair: -1, wob: Math.random() * 6.28, blink: Math.random() * 200, carrier: Math.random() < 0.08 });
    }
    gx = 0; gy = 0; gdir = 1;
  }

  function buildRain() {
    germs = []; rain = [];
    rainLeft = 18 + wave * 2; rainLanded = 0; rainSpawnT = 0;
    gx = 0; gy = 0; gdir = 1;
  }

  function makeBoss(kind) {
    var hp = 12 + wave * 2;
    var b = { kind: kind, x: W / 2, y: -40, targetY: 48, hp: hp, maxHp: hp, dir: 1, fireT: 0, tent: 0, flashT: 0, vx: 0 };
    if (kind === 1) { b.hp = hp + 6; b.maxHp = b.hp; b.split = false; }
    if (kind === 2) { b.hp = hp + 4; b.maxHp = b.hp; b.spin = 0; }
    return b;
  }

  function buildWave() {
    waveType = typeFor(wave);
    divers = []; minis = []; swarm = []; rain = []; chainQ = [];
    waveFrames = 0; waveShots = 0; waveHits = 0; waveDeaths = 0; formationKills = 0;
    ufoT = 0; uvReady = true; boss = null; bosses = [];
    waveFlipT = 30;
    if (waveType === 'boss') {
      germs = [];
      buildShields();
      var kind = (Math.floor(wave / 5) - 1) % 3;
      bossName = BOSS_NAMES[kind];
      boss = makeBoss(kind);
      bosses = [boss];
      bossIntroT = 110;
      bannerText = bossName; bannerColor = kind === 0 ? PURPLE : kind === 1 ? '#8fd14f' : '#ff2d7a'; bannerT = 110;
      gx = 0; gy = 0; gdir = 1;
    } else if (waveType === 'swarm') {
      buildSwarm(); buildShields();
      bannerText = 'WAVE ' + wave + ' // SWARM'; bannerColor = PINK; bannerT = 90;
    } else if (waveType === 'rain') {
      buildRain(); buildShields();
      bannerText = 'WAVE ' + wave + ' // SPORE RAIN'; bannerColor = '#2ecc71'; bannerT = 90;
    } else if (waveType === 'fortress') {
      buildGrid(true); buildShields();
      bannerText = 'WAVE ' + wave + ' // FORTRESS'; bannerColor = '#e8e4d8'; bannerT = 90;
    } else {
      buildGrid(false); buildShields();
      bannerText = 'WAVE ' + wave + ' // SCRUB IN'; bannerColor = CYAN; bannerT = 90;
    }
  }
  var bosses = [];

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
    player = { x: W / 2, y: PLAYER_Y, w: 22, h: 18 };
    bullets = []; ebullets = []; particles = []; ufo = null; rings = []; muzzle = 0; recoil = 0;
    drops = []; divers = []; minis = []; boss = null; spreadT = 0; rapidT = 0; pierceT = 0; doubleT = 0; shieldHp = 0; diverT = 0; popups = [];
    streak = 0; bestStreak = 0; shots = 0; hits = 0; shake = 0; flashT = 0; kills = 0;
    invuln = 0; shootCd = 0; touching = false;
    swarm = []; rain = []; chainQ = []; beamHold = 0; beamHeat = 0; overheat = false; beamHitT = 0;
    uvReady = true; uvFlashT = 0; bossIntroT = 0; waveFlipT = 0; formationKills = 0; bossesDown = 0; wavesCleared = 0; bossName = '';
    buildWave();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Drag to fly (autofire) // hold FIRE for the beam // tap UV' : 'Arrows move, SPACE fires (hold for the beam), DOWN is the UV flash';
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

  // Vials stack: double gives two columns, spread adds the side shots to whatever is firing.
  function shoot() {
    if (beamHold >= 18) return; // the beam is on, needles hold
    var cap = 4 + (spreadT > 0 ? 6 : 0) + (doubleT > 0 ? 4 : 0);
    if (shootCd > 0 || bullets.length >= cap) return;
    var y0 = player.y - 14;
    if (doubleT > 0) {
      bullets.push({ x: player.x - 5, y: y0, vx: 0, hits: 0 });
      bullets.push({ x: player.x + 5, y: y0, vx: 0, hits: 0 });
    } else {
      bullets.push({ x: player.x, y: y0, vx: 0, hits: 0 });
    }
    if (spreadT > 0) {
      bullets.push({ x: player.x, y: y0, vx: -1.3, hits: 0 });
      bullets.push({ x: player.x, y: y0, vx: 1.3, hits: 0 });
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
    var base = (GROWS - g.r) * 10 + (g.maxHp === 2 ? 20 : 0) + (g.wall ? 25 : 0);
    var left = aliveCount();
    var label = left === 0 ? 'LAST ONE' : (g.wall ? 'WALL' : (g.maxHp === 2 ? 'ARMORED' : ''));
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
    // Hot streaks chain: the blast catches the neighbors a beat later.
    if (mult() >= 3 && !g.wall) {
      for (var n = 0; n < germs.length; n++) {
        var ng = germs[n];
        if (!ng.alive || ng.wall || ng === g) continue;
        if (Math.abs(ng.c - g.c) + Math.abs(ng.r - g.r) === 1) chainQ.push({ g: ng, t: 8 + Math.random() * 6 });
      }
    }
  }
  function killSwarmGerm(sg, label) {
    sg.alive = false;
    kills++;
    var base = sg.state === 'dive' ? 40 : 20;
    addScore(base, sg.x, sg.y - 8, label || (sg.state === 'dive' ? 'DIVER' : ''), sg.state === 'dive' ? PINK : ROW_COLOR[sg.r]);
    sfxPop(sg.state === 'dive' ? 2 : 1);
    rings.push({ x: sg.x, y: sg.y, r: 4, life: 14, c: ROW_COLOR[sg.r] });
    spawnParticles(sg.x, sg.y, ROW_COLOR[sg.r], 9);
    maybeWeapon(sg.x, sg.y, sg.carrier);
    // A diving pair both dropped before they get home: formation bonus.
    if (sg.state === 'dive' && sg.pair >= 0) {
      var mate = null;
      for (var i = 0; i < swarm.length; i++) if (swarm[i] !== sg && swarm[i].pair === sg.pair) mate = swarm[i];
      if (mate && !mate.alive) {
        formationKills++;
        addScore(150, sg.x, sg.y - 22, 'FORMATION', YELLOW);
        shake = 5;
      }
    }
    var left = 0;
    for (var j = 0; j < swarm.length; j++) if (swarm[j].alive) left++;
    if (left === 0) { addScore(100, sg.x, sg.y - 36, 'LAST ONE', YELLOW); shake = 8; flashT = 4; }
  }
  function killRainSpore(rs) {
    rs.alive = false;
    kills++;
    addScore(rs.y < 120 ? 25 : 15, rs.x, rs.y - 8, rs.y < 120 ? 'HIGH' : '', '#2ecc71');
    sfxPop(0);
    rings.push({ x: rs.x, y: rs.y, r: 3, life: 12, c: '#2ecc71' });
    spawnParticles(rs.x, rs.y, '#2ecc71', 6);
    maybeWeapon(rs.x, rs.y, false);
  }
  function bossDown(b) {
    var name = BOSS_NAMES[b.kind];
    addScore(500 + wave * 25 + b.kind * 150, b.x, b.y, name, YELLOW);
    rings.push({ x: b.x, y: b.y, r: 8, life: 22, c: YELLOW });
    rings.push({ x: b.x, y: b.y, r: 2, life: 26, c: PINK });
    rings.push({ x: b.x, y: b.y, r: 14, life: 30, c: PURPLE });
    drops.push({ x: b.x - 14, y: b.y, kind: 'spread', spin: 0 });
    drops.push({ x: b.x + 14, y: b.y, kind: 'shield', spin: 0 });
    spawnParticles(b.x, b.y, YELLOW, 24, 2);
    spawnParticles(b.x, b.y, PURPLE, 24, 1.5);
    shake = 16; flashT = 8;
    bossesDown++;
    sayCallout('shooter-c3');
  }
  function hitBoss(b, dmg, bx, by) {
    if (bossIntroT > 0) return;
    b.hp -= dmg;
    b.flashT = 6;
    spawnParticles(bx, by, '#fff', 4);
    sfxPop(1);
    // The virus clones the needle back at you.
    if (b.kind === 2 && dmg === 1 && Math.random() < 0.6) {
      var dx = player.x - b.x, dy = player.y - b.y, len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      ebullets.push({ x: b.x, y: b.y + 10, vx: dx / len * 3.2, vy: dy / len * 3.2, clone: true });
    }
    // The mold king splits in two at half health.
    if (b.kind === 1 && !b.split && b.hp <= b.maxHp / 2 && b.hp > 0) {
      b.split = true;
      var half = Math.max(3, Math.ceil(b.hp / 2));
      b.hp = half; b.maxHp = half; b.small = true; b.dir = -1; b.vx = -1.4;
      var twin = { kind: 1, x: b.x + 10, y: b.y, targetY: b.targetY, hp: half, maxHp: half, dir: 1, fireT: 20, tent: 1, flashT: 0, vx: 1.4, split: true, small: true };
      bosses.push(twin);
      addPopup(b.x, b.y - 30, 'IT SPLIT', '#8fd14f');
      shake = 8;
      spawnParticles(b.x, b.y, '#8fd14f', 20, 1.5);
    }
    if (b.hp <= 0) {
      bossDown(b);
      for (var i = bosses.length - 1; i >= 0; i--) if (bosses[i] === b) bosses.splice(i, 1);
      boss = bosses.length ? bosses[0] : null;
    }
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
    var rainBonus = waveType === 'rain' && rainLanded === 0 ? 300 : 0;
    var uvBonus = uvReady ? 50 : 0; // never needed the flash
    score += flat + clock + accBonus + spotless + rainBonus + uvBonus;
    document.getElementById('jd-br-score').textContent = score;
    addPopup(W / 2, 120, 'WAVE CLEAR +' + flat, CYAN);
    if (clock) addPopup(W / 2, 138, 'FAST +' + clock, YELLOW);
    if (accBonus) addPopup(W / 2, 156, 'CLEAN HANDS ' + acc + '% +' + accBonus, LIME);
    if (spotless) addPopup(W / 2, 174, 'SPOTLESS +' + spotless, '#fff');
    if (rainBonus) addPopup(W / 2, 192, 'DRY TRAY +' + rainBonus, '#2ecc71');
    if (uvBonus) addPopup(W / 2, 210, 'UV UNUSED +' + uvBonus, '#c7a6ff');
    wavesCleared++;
    wave++;
    sfxWave();
    buildWave();
    ebullets = [];
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
    if (uvFlashT > 0) uvFlashT--;
    if (waveFlipT > 0) waveFlipT--;
    if (bossIntroT > 0) bossIntroT--;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }

    // The autoclave beam: hold fire, the needle becomes a beam until it overheats.
    var wantBeam = (keyFire || touching) && !overheat;
    beamHold = wantBeam ? beamHold + 1 : 0;
    var beamOn = beamHold >= 18;
    if (beamOn) {
      beamHeat = Math.min(150, beamHeat + 1.6);
      if (beamHeat >= 150) { overheat = true; beamHold = 0; addPopup(player.x, player.y - 30, 'OVERHEAT', '#ff5050'); playSfx(160, 0.25, 'sawtooth', 0.1); }
      if (beamHitT > 0) beamHitT--;
      if (frame % 3 === 0) playSfx(180 + Math.sin(frame * 0.5) * 30, 0.05, 'sawtooth', 0.03);
    } else {
      beamHeat = Math.max(0, beamHeat - 0.9);
      if (overheat && beamHeat <= 60) overheat = false;
    }
    if (beamOn && beamHitT === 0) {
      var bxm = player.x, hitY = -1, target = null, tkind = '';
      // The beam stops at the first thing above the machine: shields excluded, it burns through gauze.
      for (var i = 0; i < germs.length; i++) {
        var g = germs[i];
        if (!g.alive) continue;
        var x = germX(g), y = germY(g);
        if (bxm > x && bxm < x + GW && y + GH < player.y && y + GH > hitY) { hitY = y + GH; target = g; tkind = 'germ'; }
      }
      for (var i = 0; i < swarm.length; i++) {
        var sg = swarm[i];
        if (!sg.alive) continue;
        if (Math.abs(sg.x - bxm) < 11 && sg.y < player.y && sg.y > hitY) { hitY = sg.y; target = sg; tkind = 'swarm'; }
      }
      for (var i = 0; i < rain.length; i++) {
        var rs = rain[i];
        if (!rs.alive) continue;
        if (Math.abs(rs.x - bxm) < 8 && rs.y < player.y && rs.y > hitY) { hitY = rs.y; target = rs; tkind = 'rain'; }
      }
      for (var i = 0; i < bosses.length; i++) {
        var bb = bosses[i];
        if (Math.abs(bb.x - bxm) < (bb.small ? 14 : 20) && bb.y < player.y && bb.y > hitY) { hitY = bb.y; target = bb; tkind = 'boss'; }
      }
      for (var i = divers.length - 1; i >= 0; i--) {
        var dv = divers[i];
        if (Math.abs(dv.x - bxm) < 11 && dv.y < player.y && dv.y > hitY) { hitY = dv.y; target = dv; tkind = 'diver'; }
      }
      if (target) {
        beamHitT = 5;
        landHit();
        if (tkind === 'germ') { target.hp--; if (target.hp <= 0) killGerm(target, bxm, hitY); else { target.flashT = 6; spawnParticles(bxm, hitY, '#fff', 3); } }
        else if (tkind === 'swarm') killSwarmGerm(target, 'BEAMED');
        else if (tkind === 'rain') killRainSpore(target);
        else if (tkind === 'boss') hitBoss(target, 1, bxm, hitY);
        else if (tkind === 'diver') { for (var q = divers.length - 1; q >= 0; q--) if (divers[q] === target) divers.splice(q, 1); addScore(40, target.x, target.y - 8, 'DIVER', PINK); spawnParticles(target.x, target.y, PINK, 8); }
        if (mode !== 'play') return;
      }
    }

    // Chain blasts land a beat after the kill that lit them.
    for (var i = chainQ.length - 1; i >= 0; i--) {
      var cq = chainQ[i];
      cq.t--;
      if (cq.t > 0) continue;
      chainQ.splice(i, 1);
      if (!cq.g.alive) continue;
      cq.g.hp--;
      if (cq.g.hp <= 0) killGerm(cq.g, germX(cq.g) + GW / 2, germY(cq.g) + GH / 2);
      else { cq.g.flashT = 8; spawnParticles(germX(cq.g) + GW / 2, germY(cq.g) + GH / 2, '#fff', 4); }
    }

    // Swarm: fly in, hold formation, sway, dive in pairs and come home.
    if (waveType === 'swarm') {
      var sway = Math.sin(frame * 0.02) * 26;
      var diveEvery = Math.max(90, 220 - wave * 8);
      if (frame % diveEvery === 0) {
        var formed = [];
        for (var i = 0; i < swarm.length; i++) if (swarm[i].alive && swarm[i].state === 'form') formed.push(swarm[i]);
        if (formed.length >= 2) {
          var a = formed[Math.floor(Math.random() * formed.length)], bmate = null;
          var bestD = 9999;
          for (var i = 0; i < formed.length; i++) { var f2 = formed[i]; if (f2 === a) continue; var dd = Math.abs(f2.sx - a.sx) + Math.abs(f2.sy - a.sy); if (dd < bestD) { bestD = dd; bmate = f2; } }
          var pid = frame;
          [a, bmate].forEach(function (sg, k) { sg.state = 'dive'; sg.t = 0; sg.pair = pid; sg.side = k === 0 ? -1 : 1; sg.dx = sg.x; sg.dy = sg.y; });
        }
      }
      for (var i = 0; i < swarm.length; i++) {
        var sg = swarm[i];
        if (!sg.alive) continue;
        if (sg.state === 'enter') {
          sg.t++;
          if (sg.t > 0) { sg.x += (sg.sx - sg.x) * 0.06; sg.y += (sg.sy - sg.y) * 0.06; }
          if (Math.abs(sg.y - sg.sy) < 1.5) sg.state = 'form';
        } else if (sg.state === 'form') {
          sg.x = sg.sx + sway;
          sg.y = sg.sy + Math.sin(frame * 0.05 + sg.wob) * 3;
        } else if (sg.state === 'dive') {
          sg.t++;
          var T = 150;
          var u = sg.t / T;
          if (u >= 1) { sg.state = 'form'; sg.pair = -1; sg.x = sg.sx + sway; sg.y = sg.sy; continue; }
          // Out and around: a loop toward the player, then back up to the slot.
          var px = player.x, tx = px + sg.side * 60 * Math.sin(u * Math.PI);
          var arc = Math.sin(u * Math.PI);
          sg.x = sg.dx + (tx - sg.dx) * arc + Math.sin(sg.t * 0.2) * 10;
          sg.y = u < 0.5 ? sg.dy + (player.y - 20 - sg.dy) * (u * 2) : (player.y - 20) + (sg.sy - (player.y - 20)) * ((u - 0.5) * 2);
          if (u > 0.3 && u < 0.6 && sg.t % 28 === 0) ebullets.push({ x: sg.x, y: sg.y + 8, vy: 2.4 + wave * 0.12, vx: (player.x - sg.x) * 0.01 });
          if (hitShield(sg.x, sg.y, 6)) { sg.alive = false; spawnParticles(sg.x, sg.y, PINK, 6); continue; }
          if (invuln === 0 && Math.abs(sg.x - player.x) < 13 && Math.abs(sg.y - player.y) < 13) {
            sg.alive = false;
            loseLife('SWARM GOT YOU');
            if (mode !== 'play') return;
          }
        }
      }
    }

    // Rain: spores fall, sway, and take root on the tray if they land.
    if (waveType === 'rain') {
      rainSpawnT++;
      var spawnEvery = Math.max(18, 40 - wave * 2);
      if (rainLeft > 0 && rainSpawnT >= spawnEvery) {
        rainSpawnT = 0; rainLeft--;
        rain.push({ x: 20 + Math.random() * (W - 40), y: -8, vy: 0.9 + Math.random() * 0.6 + wave * 0.06, wob: Math.random() * 6.28, alive: true, sway: 0.6 + Math.random() * 0.8 });
      }
      for (var i = rain.length - 1; i >= 0; i--) {
        var rs = rain[i];
        if (!rs.alive) { rain.splice(i, 1); continue; }
        rs.y += rs.vy;
        rs.x += Math.sin(frame * 0.05 + rs.wob) * rs.sway;
        if (hitShield(rs.x, rs.y, 4)) { rs.alive = false; rain.splice(i, 1); spawnParticles(rs.x, rs.y, '#2ecc71', 4); continue; }
        if (invuln === 0 && Math.abs(rs.x - player.x) < 11 && Math.abs(rs.y - player.y) < 11) {
          rs.alive = false; rain.splice(i, 1);
          loseLife('SPORE ON YOU');
          if (mode !== 'play') return;
          continue;
        }
        if (rs.y >= player.y + 14) {
          rs.alive = false; rain.splice(i, 1);
          rainLanded++;
          streak = Math.floor(streak / 2);
          spawnParticles(rs.x, player.y + 14, '#2ecc71', 8);
          addPopup(rs.x, player.y - 6, 'LANDED', '#2ecc71');
          playSfx(120, 0.1, 'sawtooth', 0.08);
          if (rainLanded % 4 === 0) {
            loseLife('TRAY CONTAMINATED');
            if (mode !== 'play') return;
          }
        }
      }
    }

    // Divers: from wave 3, grid germs break formation and kamikaze on a curve
    if (wave >= 3 && (waveType === 'grid' || waveType === 'fortress')) {
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

    // Bosses: descend under a name card, then each kind fights its own way.
    for (var bi = 0; bi < bosses.length; bi++) {
      var bb = bosses[bi];
      if (bossIntroT > 0) { bb.y += (bb.targetY - bb.y) * 0.05; continue; }
      bb.y += (bb.targetY - bb.y) * 0.08;
      var angry = bb.hp <= bb.maxHp / 2;
      bb.tent += angry ? 0.16 : 0.08;
      if (bb.kind === 0) {
        bb.x += bb.dir * (0.8 + wave * 0.06) * (angry ? 1.6 : 1);
        if (bb.x < 40) bb.dir = 1;
        if (bb.x > W - 40) bb.dir = -1;
        bb.fireT++;
        if (bb.fireT > Math.max(26, (angry ? 44 : 60) - wave * 2)) {
          bb.fireT = 0;
          var fan = angry ? 2 : 1;
          for (var k = -fan; k <= fan; k++) ebullets.push({ x: bb.x + k * 8, y: bb.y + 14, vy: 2.6 + wave * 0.15, vx: k * 0.7, big: true });
        }
      } else if (bb.kind === 1) {
        // Mold king: lumbers, drops spore clusters; the halves are quicker and cross paths.
        var sp = bb.small ? 1.9 : 0.7;
        bb.x += bb.dir * sp;
        if (bb.x < 30) bb.dir = 1;
        if (bb.x > W - 30) bb.dir = -1;
        bb.targetY = 48 + Math.sin(bb.tent * 0.5) * (bb.small ? 22 : 8);
        bb.fireT++;
        if (bb.fireT > (bb.small ? 46 : 70)) {
          bb.fireT = 0;
          var nsp = bb.small ? 2 : 3;
          for (var k = 0; k < nsp; k++) ebullets.push({ x: bb.x + (k - (nsp - 1) / 2) * 14, y: bb.y + 16, vy: 1.6 + wave * 0.08, vx: (Math.random() - 0.5) * 0.8, mold: true });
        }
      } else {
        // The virus: darts across, spins spirals, and clones your needles back at you.
        bb.spin += angry ? 0.11 : 0.07;
        bb.x += (player.x - bb.x) * 0.02 + Math.sin(bb.tent * 1.7) * 2.2;
        bb.x = Math.max(40, Math.min(W - 40, bb.x));
        bb.fireT++;
        if (bb.fireT > (angry ? 10 : 16)) {
          bb.fireT = 0;
          var a = bb.spin * 3;
          ebullets.push({ x: bb.x, y: bb.y + 6, vx: Math.cos(a) * 2.2, vy: 1.6 + Math.abs(Math.sin(a)) * 1.6 + wave * 0.06, virus: true });
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
    if (alive > 0 && (minX < 16 || maxX > W - 16 - GW)) {
      gdir *= -1;
      gy += 10;
      if (alive > 0) playSfx(90 + (24 - alive) * 3, 0.05, 'square', 0.05);
    }
    // They reached the tray: lose a life, push them back up
    if (alive > 0 && maxY + GH >= player.y - 6 && mode === 'play') {
      loseLife('THEY REACHED THE TRAY');
      if (mode === 'play') gy = 34;
    }
    // The grid chews through the gauze on its way down
    if (alive > 0 && shields.length && maxY + GH >= 236) {
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
    if (!ufo && !bosses.length && ufoT > 520 && Math.random() < 0.02) {
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
      if (!hit) for (var j = 0; j < swarm.length; j++) {
        var sg = swarm[j];
        if (!sg.alive) continue;
        if (Math.abs(b.x - sg.x) < 11 && Math.abs(b.y - sg.y) < 11) {
          hit = true;
          landHit();
          killSwarmGerm(sg, '');
          break;
        }
      }
      if (!hit) for (var j = 0; j < rain.length; j++) {
        var rs = rain[j];
        if (!rs.alive) continue;
        if (Math.abs(b.x - rs.x) < 8 && Math.abs(b.y - rs.y) < 9) {
          hit = true;
          landHit();
          killRainSpore(rs);
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
      if (!hit && bossIntroT === 0) for (var j = 0; j < bosses.length; j++) {
        var bb2 = bosses[j];
        var rad = bb2.small ? 14 : 20;
        if (Math.abs(b.x - bb2.x) < rad && Math.abs(b.y - bb2.y) < rad - 4) {
          hit = true;
          landHit();
          hitBoss(bb2, 1, b.x, b.y);
          break;
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
      if (e.y > H + 10 || e.x < -10 || e.x > W + 10) { ebullets.splice(i, 1); continue; }
      if (shields.length && e.y > 230 && hitShield(e.x, e.y, 2)) { ebullets.splice(i, 1); continue; }
      if (invuln === 0 &&
          e.x > player.x - player.w / 2 && e.x < player.x + player.w / 2 &&
          e.y > player.y - player.h / 2 && e.y < player.y + player.h / 2) {
        ebullets.splice(i, 1);
        loseLife(e.big ? 'MOTHER OOZE' : e.clone ? 'YOUR OWN NEEDLE' : e.mold ? 'MOLD SPORE' : e.virus ? 'VIRAL' : 'OOZED');
        if (mode !== 'play') return;
        break; // a hit wipes the ooze, so the list under this loop is gone
      }
    }

    // Wave cleared, by type
    var swarmLeft = 0;
    for (var i = 0; i < swarm.length; i++) if (swarm[i].alive) swarmLeft++;
    var rainDone = waveType !== 'rain' || (rainLeft === 0 && rain.length === 0);
    if (alive === 0 && !bosses.length && minis.length === 0 && swarmLeft === 0 && divers.length === 0 && rainDone) endWave();
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
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); if (mode === 'play') uvFlash(); }
  });
  // The UV flash: one per wave, wipes the tray. Bosses only flinch.
  function uvFlash() {
    if (!uvReady) return;
    uvReady = false;
    uvFlashT = 26; flashT = 10; shake = 10;
    playSfx(2200, 0.3, 'square', 0.12); setTimeout(function () { playSfx(1100, 0.4, 'triangle', 0.1); }, 80);
    var got = 0;
    for (var i = 0; i < germs.length; i++) { var g = germs[i]; if (!g.alive || g.wall) continue; g.alive = false; got++; spawnParticles(germX(g) + GW / 2, germY(g) + GH / 2, '#c7a6ff', 5); }
    for (var i = 0; i < swarm.length; i++) { if (!swarm[i].alive) continue; swarm[i].alive = false; got++; spawnParticles(swarm[i].x, swarm[i].y, '#c7a6ff', 5); }
    for (var i = 0; i < rain.length; i++) { if (!rain[i].alive) continue; rain[i].alive = false; got++; spawnParticles(rain[i].x, rain[i].y, '#c7a6ff', 4); }
    got += divers.length + minis.length; divers = []; minis = []; ebullets = []; chainQ = [];
    kills += got;
    for (var i = 0; i < bosses.length; i++) { bosses[i].hp = Math.max(1, bosses[i].hp - 5); bosses[i].flashT = 12; }
    if (got) { score += got * 5; document.getElementById('jd-br-score').textContent = score; }
    addPopup(W / 2, H / 2 - 20, 'UV FLASH' + (got ? ' +' + got * 5 : ''), '#c7a6ff');
    sayCallout('shooter-c2');
  }
  function onUvBadge(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var x = (clientX - r.left) * (W / r.width), y = (clientY - r.top) * (H / r.height);
    return x >= UV_BOX.x && x <= UV_BOX.x + UV_BOX.w && y >= UV_BOX.y && y <= UV_BOX.y + UV_BOX.h;
  }
  document.addEventListener('keyup', function(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
    if (e.code === 'Space') keyFire = false;
  });
  function canvasX(clientX) {
    var r = canvas.getBoundingClientRect();
    return (clientX - r.left) * (W / r.width);
  }
  canvas.addEventListener('click', function(e) { if (mode === 'play' && onUvBadge(e.clientX, e.clientY)) { uvFlash(); return; } start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var t0 = e.targetTouches[0] || e.touches[0];
    if (mode === 'play' && onUvBadge(t0.clientX, t0.clientY)) { uvFlash(); return; }
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

  function cleanLevel() { return Math.min(1, wavesCleared / 12); }
  function drawBackground() {
    var cl = cleanLevel();
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
    // Tile floor: the station tray in perspective, grout lines converging.
    // It reads cleaner the more waves you have scrubbed.
    ctx.fillStyle = 'rgb(' + Math.round(12 + cl * 18) + ',' + Math.round(18 + cl * 26) + ',' + Math.round(32 + cl * 30) + ')';
    ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    if (cl > 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((cl - 0.3) * 0.08).toFixed(3) + ')';
      ctx.fillRect(0, FLOOR_Y, W, 3);
    }
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.06 + cl * 0.12).toFixed(2) + ')';
    ctx.lineWidth = 1;
    for (var k = 0; k <= Math.ceil(W / 50); k++) {
      var xTop = k * 50, xBot = W / 2 + (k * 50 - W / 2) * 1.5;
      ctx.beginPath(); ctx.moveTo(xTop, FLOOR_Y); ctx.lineTo(xBot, H); ctx.stroke();
    }
    var rows = [FLOOR_Y, FLOOR_Y + 8, FLOOR_Y + 20, FLOOR_Y + 38, H];
    for (var r = 0; r < rows.length; r++) { ctx.beginPath(); ctx.moveTo(0, rows[r]); ctx.lineTo(W, rows[r]); ctx.stroke(); }
    // Station lights along the tray edge
    for (var l = 0; l < Math.ceil(W / 72); l++) {
      var on = Math.floor(frame / 20 + l) % 6 === 0;
      ctx.fillStyle = on ? LIME : 'rgba(127,255,0,0.2)';
      ctx.fillRect(20 + l * 72, FLOOR_Y + 2, 4, 2);
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

  function drawSwarm() {
    for (var i = 0; i < swarm.length; i++) {
      var sg = swarm[i];
      if (!sg.alive) continue;
      if (sg.state === 'dive') {
        ctx.fillStyle = 'rgba(255,20,147,0.2)';
        ctx.fillRect(sg.x - 2, sg.y - 16, 4, 12);
      }
      if (sg.carrier) {
        ctx.fillStyle = 'rgba(255,215,0,' + (0.15 + Math.sin(frame * 0.2) * 0.1).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(sg.x, sg.y, 14, 0, Math.PI * 2); ctx.fill();
      }
      drawSpecies(sg.x, sg.y, sg.r, sg.state === 'dive' ? PINK : ROW_COLOR[sg.r], frame + sg.wob * 10, false, sg.blink);
    }
  }
  function drawRain() {
    for (var i = 0; i < rain.length; i++) {
      var rs = rain[i];
      if (!rs.alive) continue;
      ctx.fillStyle = 'rgba(46,204,113,0.18)';
      ctx.fillRect(rs.x - 1, rs.y - 14, 2, 12);
      ctx.fillStyle = '#2ecc71';
      for (var k = 0; k < 6; k++) {
        var a = frame * 0.05 + rs.wob + k * Math.PI / 3;
        ctx.fillRect(rs.x + Math.cos(a) * 6 - 1, rs.y + Math.sin(a) * 6 - 1, 2, 2);
      }
      ctx.beginPath(); ctx.arc(rs.x, rs.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(rs.x - 3, rs.y - 2, 2, 2); ctx.fillRect(rs.x + 1, rs.y - 2, 2, 2);
    }
    if (waveType === 'rain' && mode === 'play') {
      ctx.textAlign = 'left';
      ctx.font = 'bold 7px monospace';
      ctx.fillStyle = rainLanded ? '#ff5050' : '#2ecc71';
      ctx.fillText('LANDED ' + rainLanded + ' // ' + (rainLeft + rain.length) + ' TO GO', 8, 36);
    }
  }

  function drawMother(bb, angry) {
    var bx = bb.x, by = bb.y + Math.sin(frame * 0.1) * 3;
    ctx.strokeStyle = bb.flashT ? '#fff' : (angry ? '#c04dff' : PURPLE);
    ctx.lineWidth = 3;
    for (var k = 0; k < 5; k++) {
      var a = Math.PI * 0.2 + k * Math.PI * 0.15;
      var ex = bx + Math.cos(a) * 30 + Math.sin(bb.tent + k) * 6;
      var ey = by + Math.sin(a) * 28 + Math.cos(bb.tent * 1.3 + k) * 4;
      ctx.beginPath(); ctx.moveTo(bx, by + 8); ctx.quadraticCurveTo(bx + Math.cos(a) * 14, by + 24, ex, ey); ctx.stroke();
      ctx.fillStyle = PINK;
      ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    }
    ctx.fillStyle = bb.flashT ? '#fff' : (angry ? '#b45cff' : PURPLE);
    ctx.beginPath(); ctx.arc(bx, by, 18 + (angry ? Math.sin(frame * 0.4) * 1.5 : 0), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx - 13, by + 6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + 13, by + 6, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(bx - 6, by - 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = angry ? '#ff2d7a' : '#5b2a8a';
    ctx.beginPath(); ctx.arc(bx, by + 4, 5 + Math.sin(frame * 0.2) * 1.2, 0, Math.PI * 2); ctx.fill();
    var look = Math.max(-2, Math.min(2, (player.x - bx) / 60));
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx - 9, by - 7, 6, 6);
    ctx.fillRect(bx + 3, by - 7, 6, 6);
    ctx.fillStyle = angry ? '#f00' : '#000';
    ctx.fillRect(bx - 7 + look, by - 5, 3, 3);
    ctx.fillRect(bx + 5 + look, by - 5, 3, 3);
  }
  function drawMoldKing(bb, angry) {
    var sc = bb.small ? 0.65 : 1;
    var bx = bb.x, by = bb.y + Math.sin(frame * 0.07) * 2;
    var base = bb.flashT ? '#fff' : (angry ? '#b5ff5c' : '#8fd14f');
    // A crown of fuzzy mold caps over a dark heap
    ctx.fillStyle = bb.flashT ? '#fff' : '#3f5a1e';
    ctx.beginPath(); ctx.ellipse(bx, by + 6 * sc, 24 * sc, 14 * sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = base;
    for (var k = 0; k < 5; k++) {
      var cx2 = bx + (k - 2) * 9 * sc, cy2 = by - 4 * sc + Math.sin(frame * 0.1 + k) * 2 * sc;
      ctx.beginPath(); ctx.arc(cx2, cy2, (6 + (k % 2) * 3) * sc, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (var k = 0; k < 7; k++) ctx.fillRect(bx + (k - 3) * 6 * sc - 1, by + 2 * sc + (k % 2) * 4, 2, 2);
    // Crown
    ctx.fillStyle = YELLOW;
    for (var k = 0; k < 3; k++) { ctx.fillRect(bx + (k - 1) * 8 * sc - 2, by - 16 * sc - (k === 1 ? 4 : 0), 4, 6); }
    ctx.fillRect(bx - 12 * sc, by - 11 * sc, 24 * sc, 3);
    var look = Math.max(-2, Math.min(2, (player.x - bx) / 60));
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx - 8 * sc, by - 2, 5, 5); ctx.fillRect(bx + 3 * sc, by - 2, 5, 5);
    ctx.fillStyle = angry ? '#f00' : '#000';
    ctx.fillRect(bx - 7 * sc + look, by, 3, 3); ctx.fillRect(bx + 4 * sc + look, by, 3, 3);
  }
  function drawVirus(bb, angry) {
    var bx = bb.x, by = bb.y;
    var col = bb.flashT ? '#fff' : (angry ? '#ff2d7a' : '#ff5c9c');
    // Spiky shell that spins, with a hard core
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    for (var k = 0; k < 12; k++) {
      var a = bb.spin + k * Math.PI / 6;
      var r1 = 14, r2 = 22 + Math.sin(frame * 0.3 + k) * 2;
      ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1); ctx.lineTo(bx + Math.cos(a) * r2, by + Math.sin(a) * r2); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(bx + Math.cos(a) * r2, by + Math.sin(a) * r2, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = bb.flashT ? '#fff' : '#5a0a2a';
    ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(bx, by, 9 + Math.sin(frame * 0.25) * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx - 6, by - 3, 4, 4); ctx.fillRect(bx + 2, by - 3, 4, 4);
    ctx.fillStyle = '#000';
    var look = Math.max(-1, Math.min(1, (player.x - bx) / 80));
    ctx.fillRect(bx - 5 + look, by - 2, 2, 2); ctx.fillRect(bx + 3 + look, by - 2, 2, 2);
  }
  function drawBoss() {
    if (!bosses.length) return;
    var total = 0, maxTotal = 0;
    for (var i = 0; i < bosses.length; i++) {
      var bb = bosses[i];
      if (bb.flashT) bb.flashT--;
      var angry = bb.hp <= bb.maxHp / 2;
      if (bb.kind === 0) drawMother(bb, angry);
      else if (bb.kind === 1) drawMoldKing(bb, angry);
      else drawVirus(bb, angry);
      total += bb.hp; maxTotal += bb.maxHp;
    }
    // Health bar, big, at the top
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W / 2 - 82, 18, 164, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W / 2 - 80, 20, 160, 6);
    var angryAny = total <= maxTotal / 2;
    ctx.fillStyle = angryAny ? '#ff2d7a' : PINK;
    ctx.fillRect(W / 2 - 80, 20, 160 * (total / maxTotal), 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bossName + (bosses.length > 1 ? ' x' + bosses.length : '') + (angryAny ? ' // ANGRY' : ''), W / 2, 36);
  }
  // The name card: the boss descends behind it, untouchable, then the fight is on.
  function drawBossCard() {
    if (bossIntroT <= 0 || !bosses.length) return;
    var a = Math.min(1, bossIntroT / 20, (110 - bossIntroT) / 12 + 0.2);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, H / 2 - 42, W, 70);
    ctx.fillStyle = bannerColor;
    ctx.fillRect(0, H / 2 - 42, W, 2); ctx.fillRect(0, H / 2 + 26, W, 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('WAVE ' + wave + ' // BOSS', W / 2, H / 2 - 24);
    ctx.fillStyle = bannerColor;
    ctx.font = 'bold 26px monospace';
    ctx.fillText(bossName, W / 2, H / 2 + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '8px monospace';
    var tip = bosses[0].kind === 0 ? 'fans of ooze. gets angry at half' : bosses[0].kind === 1 ? 'splits in two at half health' : 'clones your needles back at you';
    ctx.fillText(tip, W / 2, H / 2 + 20);
    ctx.globalAlpha = 1;
  }
  function drawBeam() {
    if (beamHold < 18) return;
    var px = player.x, top = 12;
    // Stop the drawn beam at whatever it is burning
    var stopY = top;
    for (var i = 0; i < germs.length; i++) { var g = germs[i]; if (!g.alive) continue; var x = germX(g); if (px > x && px < x + GW) stopY = Math.max(stopY, germY(g) + GH); }
    for (var i = 0; i < swarm.length; i++) { var sg = swarm[i]; if (sg.alive && Math.abs(sg.x - px) < 11) stopY = Math.max(stopY, sg.y); }
    for (var i = 0; i < rain.length; i++) { var rs = rain[i]; if (rs.alive && Math.abs(rs.x - px) < 8) stopY = Math.max(stopY, rs.y); }
    for (var i = 0; i < bosses.length; i++) { var bb = bosses[i]; if (Math.abs(bb.x - px) < 20) stopY = Math.max(stopY, bb.y); }
    var h = player.y - 18 - stopY;
    if (h <= 0) return;
    var w = 3 + Math.sin(frame * 0.8) * 1;
    ctx.fillStyle = 'rgba(0,255,255,0.25)';
    ctx.fillRect(px - w * 2, stopY, w * 4, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(px - w / 2, stopY, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(px, stopY, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
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
    ctx.font = 'bold ' + (PHONE ? 12 : 10) + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 12);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), PHONE ? 120 : 100, 12);
    // Wave counter flips like a station display when the wave changes
    ctx.textAlign = 'right';
    ctx.fillStyle = YELLOW;
    if (waveFlipT > 0) {
      var ph = waveFlipT / 30; // 1 -> 0
      var sy2 = Math.abs(Math.cos(ph * Math.PI));
      var showOld = ph > 0.5;
      ctx.save();
      ctx.translate(W - 8, 8);
      ctx.scale(1, Math.max(0.05, sy2));
      ctx.fillText('WAVE ' + (showOld ? wave - 1 : wave), 0, 4);
      ctx.restore();
    } else {
      ctx.fillText('WAVE ' + wave, W - 8, 12);
    }
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
    // Beam heat, bottom left, with the UV badge beside it
    // Beam heat: bottom-left on desktop, up under the score on a phone (the d-pad lives there).
    var beamY = PHONE ? 30 : H - 40, beamX = PHONE ? 8 : 8;
    ctx.textAlign = 'left';
    ctx.font = 'bold ' + (PHONE ? 9 : 7) + 'px monospace';
    ctx.fillStyle = overheat ? '#ff5050' : 'rgba(255,255,255,0.6)';
    ctx.fillText(overheat ? 'BEAM HOT' : 'BEAM', beamX, beamY);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(beamX + (PHONE ? 58 : 26), beamY - 5, 40, 4);
    ctx.fillStyle = overheat ? '#ff5050' : beamHeat > 100 ? YELLOW : CYAN;
    ctx.fillRect(beamX + (PHONE ? 58 : 26), beamY - 5, 40 * (beamHeat / 150), 4);
    ctx.fillStyle = uvReady ? 'rgba(199,166,255,0.9)' : 'rgba(255,255,255,0.15)';
    ctx.fillRect(UV_BOX.x, UV_BOX.y, UV_BOX.w, UV_BOX.h);
    ctx.fillStyle = uvReady ? '#1a0a2e' : 'rgba(255,255,255,0.35)';
    ctx.font = 'bold ' + (PHONE ? 8 : 7) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(uvReady ? 'UV READY' : 'UV USED', UV_BOX.x + UV_BOX.w / 2, UV_BOX.y + (PHONE ? 11 : 10));
    // Lives as little machines: bottom-right on desktop, under the wave on a phone (the A button lives there).
    var lifeY = PHONE ? 40 : H - 10;
    for (var l = 0; l < lives; l++) {
      ctx.fillStyle = PURPLE;
      ctx.fillRect(W - 20 - l * 10, lifeY, 6, 6);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(W - 18 - l * 10, lifeY - 3, 2, 3);
    }
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'shooter', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'CONTAMINATED', again: 'SPACE or TAP to re-sterilize',
    label: 'Sterile!',
    levelLabel: function (l) {
      var acc = shots ? Math.round(100 * hits / shots) : 0;
      return 'WAVE ' + l + ' // ' + kills + ' KILLS // ' + acc + '% // STREAK ' + bestStreak + ' // ' + bossesDown + (bossesDown === 1 ? ' BOSS' : ' BOSSES');
    },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) {
    wall.enter(v, { level: wave, meta: { waves: wave, streak: bestStreak, kills: kills, acc: shots ? Math.round(100 * hits / shots) : 0, bosses: bossesDown, formations: formationKills } });
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
    ctx.fillText('ARROWS move, SPACE fires, hold it for the BEAM // DOWN is the UV flash', W / 2, H - 42);
    ctx.fillText('grid, swarm, spore rain, fortress // a boss every fifth wave // chain hits for x5', W / 2, H - 29);
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

    drawSwarm();
    drawRain();
    drawBoss();
    drawShields();
    drawBeam();
    for (var i = 0; i < drops.length; i++) drawVial(drops[i]);

    // Ooze, mold spores, viral shots, and your own needles coming back
    for (var i = 0; i < ebullets.length; i++) {
      var e = ebullets[i];
      if (e.clone) {
        ctx.fillStyle = 'rgba(255,45,122,0.4)';
        ctx.fillRect(e.x - 1, e.y - 8, 2, 8);
        ctx.fillStyle = '#ff2d7a';
        ctx.fillRect(e.x - 1, e.y - 4, 2, 8);
        continue;
      }
      var col = e.big ? '#b45cff' : e.mold ? '#8fd14f' : e.virus ? '#ff5c9c' : '#2ecc71';
      ctx.fillStyle = e.big ? 'rgba(180,92,255,0.35)' : e.mold ? 'rgba(143,209,79,0.3)' : e.virus ? 'rgba(255,92,156,0.3)' : 'rgba(46,204,113,0.3)';
      ctx.fillRect(e.x - 2, e.y - 10, 4, 8);
      ctx.fillStyle = col;
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

    if (uvFlashT > 0) {
      ctx.fillStyle = 'rgba(199,166,255,' + (uvFlashT / 26 * 0.45).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    drawHud();
    drawBossCard();
    if (bannerT > 0 && mode === 'play' && bossIntroT <= 0) {
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
  // A phone held upright: the game plays sideways, full screen. The shell
  // reloads the cartridge when the phone turns, so nothing needs keeping.
  function drawPortraitCard() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, W, H);
    var rock = Math.sin(frame * 0.08) * 0.35;
    ctx.translate(W / 2, H / 2 - 30);
    ctx.rotate(rock);
    ctx.fillStyle = '#ece9d8';
    ctx.fillRect(-16, -28, 32, 56);
    ctx.fillStyle = '#060a14';
    ctx.fillRect(-13, -22, 26, 42);
    ctx.fillStyle = PINK;
    ctx.fillRect(-6, 24, 12, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.fillStyle = YELLOW;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('TURN YOUR PHONE', W / 2, H / 2 + 26);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px monospace';
    ctx.fillText('Sterile! plays sideways, full screen', W / 2, H / 2 + 44);
    ctx.restore();
  }

  function loop(t) {
    if (!window.skateRunning) { rafId = null; return; }
    if (!lastT) lastT = t;
    acc += Math.min(100, t - lastT);
    lastT = t;
    try {
    while (acc >= 16.67) {
      if (mode === 'play') { if (!PORTRAIT) update(); }
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > INTRO_LOOP_END) introT = 70; }
      acc -= 16.67;
    }
    draw();
    if (PORTRAIT) drawPortraitCard();
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
