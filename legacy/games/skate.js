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
  function sfxJump() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(600, 0.1, 'square', 0.1);}, 50); }
  function sfxFlip() { playSfx(700, 0.06, 'square', 0.1); setTimeout(function(){playSfx(950, 0.08, 'square', 0.1);}, 50); }
  function sfxCollect() { playSfx(800, 0.08, 'square', 0.1); setTimeout(function(){playSfx(1200, 0.1, 'square', 0.1);}, 60); }
  function sfxCombo(n) { playSfx(600 + n * 150, 0.1, 'square', 0.12); }
  function sfxHit() { playSfx(150, 0.3, 'sawtooth', 0.15); }
  function sfxGrind() { playSfx(200, 0.05, 'sawtooth', 0.06); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  // Game state
  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, speed, frame, dist;
  var level, bannerT, bannerText, shieldT;
  var player, obstacles, collectibles, rails, particles, buildings, popups;
  var combo, comboTimer, shake;
  var GRAVITY = 0.5;
  var GROUND_Y = 270;
  var scrollX = 0;
  var holdingJump = false, coyote = 0, jumpBuffer = 0, flipped = false;
  var usedHeel = false, usedShove = false, usedImp = false, usedBack = false, lastUpTap = -99;
  var lingoCd = 0;
  var YEAHS = ['yeah-dude', 'gnarly', 'so-sick', 'radical', 'shred-it'];
  function sayLingo() {
    if (lingoCd > 0) return;
    lingoCd = 700;
    say(YEAHS[Math.floor(Math.random() * YEAHS.length)]);
  }
  var upHeld = false, downHeld = false, grabT = 0, grabTotal = 0, wasGrabbing = false;
  var manualT = 0, wasManual = false, grindTilt = 0, usedNose = false, usedFive = false;
  // The line: every trick since your wheels last touched flat ground pools
  // into linePts, combo is the multiplier, and the whole thing banks when you
  // land. Land mid-spin and it banks at half. Bail and it is gone.
  var linePts = 0, lineTricks = [], bestLine = 0, trickCount = 0, comboMax = 1;
  var looseBoard = null; // the deck flying off on a bail
  var hitsThisLevel = 0, manualBal = 0, manualBailT = 0, lineFlashT = 0;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-skate') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-skate', String(best)); } catch(e) {} }
  }

  // ── Chiptune engine: frame-clocked square-wave loops, one song per level ──
  var SONGS = [
    { root: 110.00, bass: [0,-1,7,-1, 5,-1,3,-1, 0,-1,7,-1, 8,-1,10,-1], lead: [12,-1,15,12, -1,17,15,-1, 12,-1,15,19, 17,-1,15,-1] },
    { root: 123.47, bass: [0,0,-1,7, 5,-1,5,3, 0,0,-1,7, 10,-1,8,7],     lead: [19,-1,17,15, -1,12,-1,15, 17,-1,19,22, -1,19,17,15] },
    { root: 130.81, bass: [0,7,0,7, 3,10,3,10, 5,12,5,12, 3,10,7,-1],    lead: [24,22,19,-1, 24,-1,22,19, 17,-1,19,22, 24,26,24,-1] },
    { root: 146.83, bass: [0,-1,5,5, 8,-1,7,7, 0,-1,5,5, 10,-1,7,7],     lead: [15,17,19,-1, 22,-1,19,17, 15,-1,17,19, 15,-1,12,-1] },
  ];
  // The attract screen gets a driving punk loop — hype, not a dirge.
  var MENU_SONG = { root: 130.81, bass: [0,0,12,0, 5,5,17,5, 7,7,19,7, 5,5,17,5], lead: [12,-1,12,15, -1,19,-1,17, 19,-1,19,22, 19,17,15,12] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  var transT = 0, transCanvas = null, transCtx = null;
  try {
    transCanvas = document.createElement('canvas');
    transCanvas.width = W;
    transCanvas.height = H;
    transCtx = transCanvas.getContext ? transCanvas.getContext('2d') : null;
  } catch (e) { transCtx = null; }
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 13 : Math.max(10, 17 - level);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(level - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', menu ? 0.045 : 0.055);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', menu ? 0.026 : 0.03);
    if (musicStep % 4 === 0) playSfx(65, 0.08, 'sawtooth', menu ? 0.04 : 0.05);
    if (musicStep % 8 === 4) playSfx(210, 0.04, 'sawtooth', 0.028);
    if (menu && musicStep % 2 === 1) playSfx(1900, 0.015, 'square', 0.012);
  }

  // A run's last ride out: slow descending minor line
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }

  // ── Every level is somewhere real: Denver + Colorado, day rolling over ──
  var LOCALES = [
    { name: 'DOWNTOWN DENVER', scene: 'city',      top: '#1a0a2e', bot: '#2d1b69', ground: '#555',    dash: '#777',    lights: true,  stars: true,  moon: true,  sun: null,      sunY: 0 },
    { name: 'THE FRONT RANGE', scene: 'range',     top: '#2b1b4e', bot: '#c85a54', ground: '#5c5450', dash: '#7a6e66', lights: true,  stars: false, moon: false, sun: '#ffd27a', sunY: 205 },
    { name: 'RED ROCKS',       scene: 'redrocks',  top: '#2e78c8', bot: '#93c6e8', ground: '#8a5a46', dash: '#a37058', lights: false, stars: false, moon: false, sun: '#fff3b0', sunY: 58 },
    { name: 'THE FLATIRONS',   scene: 'flatirons', top: '#3a1c5e', bot: '#e8642c', ground: '#54484e', dash: '#78645e', lights: true,  stars: false, moon: false, sun: '#ff9a3c', sunY: 175 },
    { name: 'BRECKENRIDGE',    scene: 'range',     top: '#5a6a86', bot: '#c8d2de', ground: '#d8dde4', dash: '#aab2bc', lights: false, stars: false, moon: false, sun: null,      sunY: 0, weather: 'snow' },
    { name: 'COLFAX AT NIGHT', scene: 'city',      top: '#080614', bot: '#1c1240', ground: '#3e3e48', dash: '#5a5a66', lights: true,  stars: false, moon: true,  sun: null,      sunY: 0, weather: 'rain' },
  ];

  // Colors

  // Announcer: tiny mp3 one-liners; rooms work fine without them
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

  var ORANGE = '#FF1493';
  var PINK = '#FF1493';
  var LIME = '#7FFF00';
  var CYAN = '#00FFFF';
  var YELLOW = '#FFD700';
  var PURPLE = '#9b59b6';
  var SKY_TOP = '#1a0a2e';
  var SKY_BOT = '#2d1b69';

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; speed = 4; frame = 0; dist = 0; mode = 'intro'; introT = 0;
    level = 1; bannerT = 0; bannerText = ''; shieldT = 0;
    scrollX = 0; combo = 1; comboTimer = 0; shake = 0;
    holdingJump = false; coyote = 0; jumpBuffer = 0; flipped = false;
    usedHeel = false; usedShove = false; usedImp = false; usedBack = false; lastUpTap = -99;
    upHeld = false; downHeld = false; grabT = 0; grabTotal = 0; wasGrabbing = false;
    manualT = 0; wasManual = false; grindTilt = 0; usedNose = false; usedFive = false;
    linePts = 0; lineTricks = []; bestLine = 0; trickCount = 0; comboMax = 1;
    hitsThisLevel = 0; manualBal = 0; manualBailT = 0; lineFlashT = 0;
    musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    player = { x: 60, y: GROUND_Y - 20, w: 20, h: 20, vy: 0, onGround: true, grinding: false, grindRail: null, invincible: 0, flipT: 0, heelT: 0, shoveT: 0, impT: 0, backT: 0, squash: 0, pushT: 0, popT: 0, bailT: 0 };
    looseBoard = null;
    obstacles = []; collectibles = []; rails = []; particles = []; buildings = []; popups = [];
    for (var i = 0; i < 10; i++) buildings.push(makeBuilding(i * 80));
    spawnInitial();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'TAP ollie // swipe: tricks // swipe down + hold: manual keeps the line alive' : 'SPACE ollie // arrows: tricks // hold DOWN on landing to manual the line on // UP balances';
    window.skateRunning = true;
    startLoop();
  }

  function makeBuilding(x) {
    var h = 40 + Math.random() * 80;
    var colors = ['#1a1a3e', '#2a1a4e', '#1a2a3e', '#2e1a2e', '#1a1a2a'];
    return { x: x, w: 30 + Math.random() * 40, h: h, color: colors[Math.floor(Math.random() * colors.length)] };
  }

  function spawnInitial() {
    for (var i = 0; i < 5; i++) spawnAt(300 + i * 150 + Math.random() * 80);
  }

  function spawnAt(sx) {
    var r = Math.random();
    if (r < 0.45) {
      var types = ['hydrant', 'trashcan', 'cone'];
      if (level >= 2) types.push('pigeon');
      if (level >= 3) types.push('spill', 'spill');
      if (level >= 4) types.push('stack');
      if (level >= 5) types.push('dog');
      if (level >= 6) types.push('cyclist', 'dog');
      obstacles.push(makeObstacle(types[Math.floor(Math.random() * types.length)], sx));
    } else if (r < 0.75) {
      var cy = GROUND_Y - 40 - Math.random() * 30;
      var k = Math.random();
      var kind = k < 0.06 ? 'horseshoe' : k < 0.16 ? 'eagle' : k < 0.32 ? 'skull' : k < 0.55 ? 'heart' : k < 0.78 ? 'bolt' : 'star';
      collectibles.push({ x: sx, y: cy, w: 14, h: 14, collected: false, kind: kind });
    } else {
      var rw = Math.random() < 0.32 ? 150 + Math.random() * 90 : 60 + Math.random() * 50;
      var ry = GROUND_Y - 30 - Math.random() * 20;
      rails.push({ x: sx, y: ry, w: rw, scored: false });
    }
  }

  function makeObstacle(type, x) {
    if (type === 'hydrant') return { type: 'hydrant', x: x, y: GROUND_Y - 18, w: 12, h: 18 };
    if (type === 'trashcan') return { type: 'trashcan', x: x, y: GROUND_Y - 22, w: 16, h: 22 };
    if (type === 'pigeon') return { type: 'pigeon', x: x, y: GROUND_Y - 52, w: 14, h: 10 };
    if (type === 'spill') return { type: 'spill', x: x, y: GROUND_Y - 4, w: 34, h: 4 };
    if (type === 'stack') return { type: 'stack', x: x, y: GROUND_Y - 40, w: 16, h: 40 };
    if (type === 'dog') return { type: 'dog', x: x, y: GROUND_Y - 12, w: 18, h: 12, minGap: 99 };
    if (type === 'cyclist') return { type: 'cyclist', x: x, y: GROUND_Y - 30, w: 18, h: 30, minGap: 99 };
    return { type: 'cone', x: x, y: GROUND_Y - 14, w: 12, h: 14 };
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3 - 1,
        life: 20 + Math.random() * 15,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
  }

  // Landing dust: gray puffs that swell and drift instead of falling
  function spawnDust(x, y, count) {
    for (var i = 0; i < count; i++) {
      particles.push({ x: x + (Math.random() - 0.5) * 10, y: y - 2, vx: (Math.random() - 0.7) * 2.2, vy: -Math.random() * 0.8, life: 22 + Math.random() * 12, color: 'rgba(200,190,170,0.5)', size: 2 + Math.random() * 3, dust: true });
    }
  }
  // Grind sparks: hot, bright, thrown back along the rail
  function spawnSparks(x, y, count) {
    var cols = ['#fff', YELLOW, '#ff8a00', '#ffb060'];
    for (var i = 0; i < count; i++) {
      particles.push({ x: x, y: y, vx: -1.5 - Math.random() * 3, vy: -Math.random() * 2.2, life: 10 + Math.random() * 12, color: cols[Math.floor(Math.random() * cols.length)], size: 1 + Math.random() * 1.5 });
    }
  }

  function addPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 45 });
  }

  // A trick goes into the line, not the score. Repeating a trick inside one
  // line pays half and does not grow the multiplier (variety is the game).
  function trick(base, x, y, label) {
    var stale = lineTricks.indexOf(label) !== -1;
    var pts = stale ? Math.ceil(base / 2) : base;
    linePts += pts;
    lineTricks.push(label);
    trickCount++;
    if (!stale && combo < 8) {
      combo++;
      if (combo === 5) sayLingo();
    }
    if (combo > comboMax) comboMax = combo;
    comboTimer = 150;
    addPopup(x, y, label + (stale ? ' STALE +' : ' +') + pts, stale ? '#9aa' : (combo > 1 ? YELLOW : '#fff'));
    if (combo > 2 && !stale) sfxCombo(combo);
  }

  function resetLine() { linePts = 0; lineTricks = []; combo = 1; comboTimer = 0; }

  // Wheels down on flat ground: the line pays out. Still spinning when you
  // touch down is a sketchy landing and pays half.
  function bank(sketchy) {
    if (linePts <= 0) { resetLine(); return; }
    var total = Math.round(linePts * combo * (sketchy ? 0.5 : 1));
    score += total;
    document.getElementById('jd-br-score').textContent = score;
    var px = player.x + player.w / 2, py = player.y - 18;
    var label = sketchy ? 'SKETCHY +' + total : (lineTricks.length >= 3 ? 'LINE x' + combo + ' +' + total : 'LANDED +' + total);
    addPopup(px, py, label, sketchy ? '#ff9a3c' : LIME);
    if (total >= 300) {
      shake = Math.min(10, 3 + total / 200);
      spawnParticles(px, GROUND_Y, YELLOW, Math.min(30, 8 + total / 60));
      lineFlashT = 18;
    }
    if (total >= 1500) { bannerT = 80; bannerText = 'LEGENDARY LINE'; lingoCd = 0; sayLingo(); }
    else if (total >= 500) { bannerT = 60; bannerText = 'SICK LINE'; sayLingo(); }
    if (!sketchy && lineTricks.length >= 2) sfxCombo(6);
    if (total > bestLine) bestLine = total;
    resetLine();
  }

  // A bail throws the whole line away.
  function loseLine(reason) {
    if (linePts > 0) {
      addPopup(player.x + player.w / 2, player.y - 18, reason + ' LOST +' + (linePts * combo), '#ff5050');
    }
    resetLine();
  }

  // ── Input: hold to ollie higher, tap again mid-air to kickflip ──
  function press() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }

    holdingJump = true;
    jumpBuffer = 7;
  }
  function release() {
    holdingJump = false;
    // Cut the jump short for a low ollie
    if (mode === 'play' && !player.onGround && !player.grinding && player.vy < -3.5) player.vy = -3.5;
  }

  function tryJump() {
    if (player.onGround || player.grinding || coyote > 0) {
      player.vy = -9.2;
      player.onGround = false;
      player.popT = 8;
      spawnDust(player.x + 4, GROUND_Y, 3);
      coyote = 0;
      jumpBuffer = 0;
      flipped = false;
      sfxJump();
      if (player.grinding) { player.grinding = false; player.grindRail = null; }
    } else if (!flipped && jumpBuffer > 0 && player.vy > -8) {
      // Kickflip: one extra pop mid-air
      flipped = true;
      jumpBuffer = 0;
      player.flipT = 24;
      player.vy = Math.min(player.vy, -5.5);
      sfxFlip();
      trick(15, player.x + player.w / 2, player.y - 8, 'KICKFLIP');
    }
  }

  function airborne() { return mode === 'play' && !player.onGround && !player.grinding; }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      press();
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      if (mode === 'play' && player.grinding && !usedNose) {
        usedNose = true;
        grindTilt = -1;
        trick(10, player.x + player.w / 2, player.y - 10, 'NOSEGRIND');
      } else if (airborne() && !usedHeel) {
        usedHeel = true;
        player.heelT = 24;
        player.vy = Math.min(player.vy, -5);
        sfxFlip();
        trick(15, player.x + player.w / 2, player.y - 8, 'HEELFLIP');
      }
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      if (mode === 'play' && player.grinding && !usedFive) {
        usedFive = true;
        grindTilt = 1;
        trick(10, player.x + player.w / 2, player.y - 10, '5-0');
      } else if (airborne() && !usedShove) {
        usedShove = true;
        player.shoveT = 20;
        player.vy = Math.min(player.vy, -4.5);
        sfxFlip();
        trick(20, player.x + player.w / 2, player.y - 8, 'SHOVE-IT');
      }
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) {
        if (airborne() && frame - lastUpTap < 18 && !usedBack) {
          usedBack = true;
          player.backT = 36;
          player.vy = Math.min(player.vy, -7);
          sfxFlip();
          trick(40, player.x + player.w / 2, player.y - 10, 'BACKFLIP');
          sayLingo();
        }
        lastUpTap = frame;
      }
      upHeld = true;
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      if (airborne() && !usedImp) {
        usedImp = true;
        player.impT = 26;
        player.vy = Math.min(player.vy, -5);
        sfxFlip();
        trick(25, player.x + player.w / 2, player.y - 8, 'IMPOSSIBLE');
      }
      // Keep holding DOWN through the landing and you roll into a manual.
      downHeld = true;
    }
  });
  document.addEventListener('keyup', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'Space' || e.key === ' ') release();
    if (e.code === 'ArrowUp' || e.code === 'KeyW') upHeld = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') downHeld = false;
  });
  canvas.addEventListener('mousedown', function(e) { e.preventDefault(); press(); });
  document.addEventListener('mouseup', function() { release(); });
  // Touch: tap = ollie; a swipe mid-touch lands the matching arrow key, so one
  // gesture jumps + tricks (swipe down stays held for manuals + grind balance).
  var swX = 0, swY = 0, swDone = false, swDownHeld = false;
  function sendArrow(type, code) {
    try { document.dispatchEvent(new KeyboardEvent(type, { code: code, key: code, bubbles: true })); } catch (err) {}
  }
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    swX = e.touches[0].clientX; swY = e.touches[0].clientY; swDone = false;
    press();
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (swDone || !e.touches.length) return;
    var dx = e.touches[0].clientX - swX, dy = e.touches[0].clientY - swY;
    if (Math.abs(dx) < 28 && Math.abs(dy) < 28) return;
    swDone = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      var code = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
      sendArrow('keydown', code);
      setTimeout(function() { sendArrow('keyup', code); }, 120);
    } else if (dy < 0) {
      sendArrow('keydown', 'ArrowUp');
      setTimeout(function() { sendArrow('keyup', 'ArrowUp'); }, 120);
    } else {
      sendArrow('keydown', 'ArrowDown');
      swDownHeld = true;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    if (swDownHeld) { sendArrow('keyup', 'ArrowDown'); swDownHeld = false; }
    release();
  }, { passive: false });

  function update() {
    frame++;
    musicTick();
    dist += speed;
    scrollX += speed;
    var nl = 1 + Math.floor(dist / 4000);
    if (nl > level) {
      level = nl;
      bannerT = 110;
      bannerText = 'LEVEL ' + level + ': ' + LOCALES[(level - 1) % LOCALES.length].name;
      if (transCtx) {
        try {
          transCtx.clearRect(0, 0, W, H);
          transCtx.drawImage(canvas, 0, 0);
          transT = 55;
        } catch (e) {}
      }
      lingoCd = 0;
      sayLingo();
      sfxCombo(4);
      spawnParticles(player.x + player.w / 2, player.y, YELLOW, 14);
      // Getting to the next town pays, and getting there without a bail pays more.
      var townBonus = 100 * (level - 1);
      score += townBonus;
      addPopup(player.x + player.w / 2, player.y - 30, 'NEW TOWN +' + townBonus, LIME);
      if (hitsThisLevel === 0 && level > 1) {
        var cleanBonus = 250 * (level - 1);
        score += cleanBonus;
        addPopup(player.x + player.w / 2, player.y - 44, 'NO BAIL +' + cleanBonus, YELLOW);
      }
      hitsThisLevel = 0;
      document.getElementById('jd-br-score').textContent = score;
    }
    speed = Math.min(9.5, 3.6 + level * 0.55 + dist / 9000);
    if (bannerT > 0) bannerT--;
    if (shieldT > 0) shieldT--;

    // Distance drip: the longer you ride, the more it counts
    if (frame % 30 === 0) {
      score += level >= 3 ? 2 : 1;
      document.getElementById('jd-br-score').textContent = score;
    }

    if (comboTimer > 0) comboTimer--;
    if (manualBailT > 0) manualBailT--;
    if (lineFlashT > 0) lineFlashT--;
    if (lingoCd > 0) lingoCd--;
    if (shake > 0) shake *= 0.85;
    if (player.squash > 0) player.squash *= 0.8;
    if (player.flipT > 0) player.flipT--;
    if (player.heelT > 0) player.heelT--;
    if (player.shoveT > 0) player.shoveT--;
    if (player.impT > 0) player.impT--;
    if (player.backT > 0) {
      player.backT--;
      if (frame % 2 === 0) spawnParticles(player.x + player.w / 2, player.y + player.h / 2, CYAN, 1);
    }
    if (coyote > 0) coyote--;
    if (jumpBuffer > 0) { jumpBuffer--; tryJump(); }

    // Player physics — floatier while holding the button on the way up
    if (!player.grinding) {
      var g = (holdingJump && player.vy < 0) ? 0.32 : GRAVITY;
      player.vy += g;
      player.y += player.vy;
    }

    // Ground collision
    if (player.y >= GROUND_Y - player.h) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      if (!player.onGround) {
        spawnParticles(player.x + player.w / 2, GROUND_Y, ORANGE, 4);
        spawnDust(player.x + player.w / 2, GROUND_Y, 5);
        player.squash = 6;
        var spinning = player.flipT > 0 || player.heelT > 0 || player.shoveT > 0 || player.impT > 0 || player.backT > 0;
        if (linePts > 0) {
          if (downHeld && manualBailT === 0) {
            // Rolled into a manual: the line lives on.
            addPopup(player.x + player.w / 2, player.y - 18, spinning ? 'SKETCHY LINK' : 'LINKED', spinning ? '#ff9a3c' : CYAN);
            if (spinning) linePts = Math.ceil(linePts / 2);
          } else {
            bank(spinning);
          }
        }
      }
      player.onGround = true;
      player.grinding = false;
      player.grindRail = null;
      player.backT = 0;
      flipped = false; usedHeel = false; usedShove = false; usedImp = false; usedBack = false;
      grindTilt = 0; usedNose = false; usedFive = false;
    }

    if (player.invincible > 0) player.invincible--;

    // Melon grab: style points tick while held; the total commits on landing
    var grabbing = upHeld && !player.onGround && !player.grinding && player.backT === 0;
    if (grabbing) {
      grabT++;
      if (grabT === 1) trick(10, player.x + player.w / 2, player.y - 10, 'MELON');
      if (grabT % 8 === 0) {
        linePts += 2;
        grabTotal += 2;
        spawnParticles(player.x + player.w / 2, player.y + player.h, CYAN, 2);
      }
    } else {
      if (wasGrabbing && grabTotal >= 10) addPopup(player.x + player.w / 2, player.y - 10, 'HELD +' + grabTotal, CYAN);
      grabT = 0; grabTotal = 0;
    }
    wasGrabbing = grabbing;

    // Manual: ride the back wheels for ticking style points
    // Manual: back wheels only. The board wants to tip back; UP leans you
    // forward. Tip past the edge and you bail, and the line goes with it.
    var manual = downHeld && player.onGround && !player.grinding && manualBailT === 0;
    if (manual) {
      manualT++;
      if (manualT === 1) { manualBal = 0.1; trick(5, player.x + player.w / 2, player.y - 10, 'MANUAL'); }
      manualBal += 0.004 + level * 0.0008 + manualBal * (0.022 + level * 0.002) + (Math.random() - 0.5) * 0.03 + (upHeld ? -0.05 : 0);
      if (manualT % 12 === 0) {
        linePts += 2;
        spawnParticles(player.x + 2, GROUND_Y, YELLOW, 1);
      }
      if (manualBal > 1 || manualBal < -1) {
        manualBailT = 40;
        player.squash = 8;
        shake = 6;
        spawnDust(player.x + player.w / 2, GROUND_Y, 6);
        sfxHit();
        spawnParticles(player.x + player.w / 2, GROUND_Y, '#fff', 8);
        loseLine('TIPPED');
        manualT = 0;
      }
    } else {
      if (wasManual && manualT > 0 && linePts > 0 && manualBailT === 0) bank(false);
      manualT = 0;
    }
    wasManual = manual;

    // Rail grinding — magnet snap when falling onto a rail
    if (!player.onGround && player.vy > 0) {
      for (var i = 0; i < rails.length; i++) {
        var rail = rails[i];
        var rx = rail.x - scrollX;
        if (player.x + player.w > rx && player.x < rx + rail.w) {
          var railTop = rail.y;
          if (player.y + player.h >= railTop - 4 && player.y + player.h <= railTop + 10) {
            player.y = railTop - player.h;
            player.vy = 0;
            player.grinding = true;
            player.grindRail = rail;
            flipped = false; usedNose = false; usedFive = false; grindTilt = 0;
            if (!rail.scored) {
              rail.scored = true;
              trick(25, player.x + player.w / 2, railTop - 12, 'GRIND');
              spawnParticles(player.x + player.w / 2, railTop, CYAN, 8);
              spawnSparks(player.x + 4, railTop + 2, 8);
            }
            if (frame % 6 === 0) sfxGrind();
            break;
          }
        }
      }
    }

    // Locked into a grind: sparks, buzz, and style points the whole way
    if (player.grinding) {
      if (frame % 6 === 0) sfxGrind();
      if (frame % 2 === 0) spawnSparks(player.x + 4, player.y + player.h + 2, 2);
      if (frame % 12 === 0) linePts += 2;
    }

    // Fell off the end of a rail — grant coyote frames for a late ollie
    if (player.grinding && player.grindRail) {
      var grx = player.grindRail.x - scrollX;
      if (player.x > grx + player.grindRail.w || player.x + player.w < grx) {
        player.grinding = false;
        player.grindRail = null;
        coyote = 6;
      }
    }

    // Obstacle collision
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      if (ob.type === 'pigeon') {
        ob.x -= 1.1;
        ob.y = GROUND_Y - 52 + Math.sin(frame * 0.12 + i) * 5;
      } else if (ob.type === 'dog') {
        ob.x -= 1.5;
      } else if (ob.type === 'cyclist') {
        ob.x -= 2.3;
      }
      var ox = ob.x - scrollX;
      if (ox < -60) { obstacles.splice(i, 1); continue; }
      // Close call: clear something by a hair and it goes on the line.
      if (ob.type !== 'spill') {
        if (ob.minGap === undefined) ob.minGap = 99;
        if (!player.onGround && player.x + player.w > ox && player.x < ox + ob.w) {
          var gap = ob.y - (player.y + player.h);
          if (gap >= 0 && gap < ob.minGap) ob.minGap = gap;
        }
        if (!ob.near && ox + ob.w < player.x) {
          ob.near = true;
          if (ob.minGap < 7) trick(10, player.x + player.w / 2, player.y - 8, 'CLOSE CALL');
        }
      }
      if (player.invincible > 0 || shieldT > 0) continue;
      if (ob.type === 'spill' && !player.onGround) continue;
      if (player.x + player.w - 4 > ox && player.x + 4 < ox + ob.w &&
          player.y + player.h > ob.y && player.y < ob.y + ob.h) {
        lives--;
        hitsThisLevel++;
        sfxHit();
        document.getElementById('jd-br-lives').textContent = lives;
        player.invincible = 90;
        player.bailT = 36;
        looseBoard = { x: player.x + 10, y: player.y + 17, vx: 3 + Math.random() * 2, vy: -5 - Math.random() * 2, rot: 0, t: 60 };
        loseLine('BAILED');
        shake = 12;
        spawnDust(player.x + player.w / 2, GROUND_Y, 8);
        spawnParticles(ox + ob.w / 2, ob.y, '#FF0000', 10);
        obstacles.splice(i, 1);
        if (lives <= 0) {
          enterBoard(score);
          saveBest();
          deathJingle();
          return;
        }
      }
    }

    // Collectible collision
    for (var i = collectibles.length - 1; i >= 0; i--) {
      var col = collectibles[i];
      var cx = col.x - scrollX;
      if (cx < -50) { collectibles.splice(i, 1); continue; }
      if (col.collected) continue;
      if (player.x + player.w > cx && player.x < cx + col.w &&
          player.y + player.h > col.y && player.y < col.y + col.h) {
        col.collected = true;
        var basePts = col.kind === 'eagle' ? 25 : col.kind === 'skull' ? 15 : col.kind === 'horseshoe' ? 25 : 10;
        var pts = basePts * combo; // flash snatched mid-line pays the multiplier, instantly, no risk
        score += pts;
        if (col.kind === 'horseshoe') {
          shieldT = 300;
          bannerT = 60;
          bannerText = 'LUCKY SHIELD!';
          addPopup(cx + col.w / 2, col.y - 6, 'LUCKY +' + pts, YELLOW);
        } else if (col.kind === 'eagle' || col.kind === 'skull' || combo > 1) {
          addPopup(cx + col.w / 2, col.y - 6, col.kind.toUpperCase() + ' +' + pts + (combo > 1 ? ' x' + combo : ''), col.kind === 'eagle' ? YELLOW : '#fff');
        }
        sfxCollect();
        document.getElementById('jd-br-score').textContent = score;
        spawnParticles(cx + col.w / 2, col.y + col.h / 2, col.kind === 'horseshoe' ? YELLOW : LIME, 12);
      }
    }

    for (var i = rails.length - 1; i >= 0; i--) {
      if (rails[i].x - scrollX < -140) rails.splice(i, 1);
    }
    for (var i = collectibles.length - 1; i >= 0; i--) {
      if (collectibles[i].collected && collectibles[i].x - scrollX < -50) collectibles.splice(i, 1);
    }

    // Spawn new stuff ahead
    var furthest = 0;
    for (var i = 0; i < obstacles.length; i++) { if (obstacles[i].x > furthest) furthest = obstacles[i].x; }
    for (var i = 0; i < collectibles.length; i++) { if (collectibles[i].x > furthest) furthest = collectibles[i].x; }
    for (var i = 0; i < rails.length; i++) { if (rails[i].x > furthest) furthest = rails[i].x; }
    while (furthest < scrollX + W + 400) {
      furthest += Math.max(84, 120 - level * 5) + Math.random() * 100;
      spawnAt(furthest);
    }

    var lastB = buildings[buildings.length - 1];
    while (lastB.x - scrollX * 0.3 < W + 100) {
      var nb = makeBuilding(lastB.x + lastB.w + 5 + Math.random() * 15);
      buildings.push(nb);
      lastB = nb;
    }
    while (buildings.length > 0 && buildings[0].x + buildings[0].w - scrollX * 0.3 < -50) {
      buildings.shift();
    }

    // Particles + popups
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.dust) { p.size += 0.22; p.vx *= 0.94; p.vy *= 0.9; }
      else p.vy += 0.15;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (looseBoard) {
      looseBoard.x += looseBoard.vx; looseBoard.y += looseBoard.vy; looseBoard.vy += 0.4; looseBoard.rot += 0.3; looseBoard.t--;
      if (looseBoard.y > GROUND_Y - 2) { looseBoard.y = GROUND_Y - 2; looseBoard.vy *= -0.4; looseBoard.vx *= 0.7; }
      looseBoard.x -= speed;
      if (looseBoard.t <= 0) looseBoard = null;
    }
    if (player.pushT > 0) player.pushT--;
    if (player.popT > 0) player.popT--;
    if (player.bailT > 0) player.bailT--;
    // A push every so often while rolling flat: the leg comes off the deck
    if (player.onGround && !player.grinding && !wasManual && player.bailT === 0 && frame % 44 === 0) player.pushT = 16;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.6; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'skate', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'GAME OVER', again: 'SPACE or TAP to ride again',
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: level, meta: { line: bestLine, dist: Math.round(dist), tricks: trickCount, combo: comboMax } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }


  // ── Attract-mode intro: CRT power-on, studio card, then the title scene ──
  function drawIntro() {
    var t = introT;
    // After the title scene the cabinet shows the shop wall for four seconds.
    if (t >= 285) { wall.drawAttract(); return; }
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
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a0a2e'); grad.addColorStop(1, '#2d1b69');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f4f0d8';
    ctx.beginPath(); ctx.arc(348, 40, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0a2e';
    ctx.beginPath(); ctx.arc(352, 36, 10, 0, Math.PI * 2); ctx.fill();
    // The Front Range behind downtown
    for (var x4 = 0; x4 < W; x4 += 6) {
      var rmy2 = 150 - Math.sin(x4 * 0.012) * 16 - Math.sin(x4 * 0.032) * 8;
      ctx.fillStyle = 'rgba(46,38,72,0.6)';
      ctx.fillRect(x4, rmy2, 6, 232 - rmy2);
    }
    for (var i = 0; i < 8; i++) {
      var bx3 = i * 54 - 10, bh3 = 46 + (i * 37) % 60;
      ctx.fillStyle = 'rgba(30,26,56,0.9)';
      ctx.fillRect(bx3, 232 - bh3, 40, bh3);
      ctx.fillStyle = 'rgba(255,255,120,0.35)';
      for (var wy3 = 240 - bh3; wy3 < 222; wy3 += 11) ctx.fillRect(bx3 + 6 + (i % 3) * 9, wy3, 3, 4);
    }
    // The cash register + clocktower say where we are
    ctx.fillStyle = '#4c4880';
    ctx.fillRect(296, 116, 40, 116);
    ctx.beginPath();
    ctx.moveTo(296, 116);
    ctx.quadraticCurveTo(304, 88, 336, 100);
    ctx.lineTo(336, 116);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(296, 116, 3, 116);
    ctx.fillStyle = Math.floor(t2 / 24) % 2 === 0 ? '#ff3030' : '#701010';
    ctx.fillRect(303, 86, 3, 3);
    ctx.fillStyle = 'rgba(255,255,150,0.4)';
    for (var wy4 = 124; wy4 < 224; wy4 += 11) {
      for (var wx4 = 300; wx4 < 332; wx4 += 9) ctx.fillRect(wx4, wy4, 4, 5);
    }
    ctx.fillStyle = '#2a2444';
    ctx.fillRect(12, 140, 16, 92);
    ctx.beginPath();
    ctx.moveTo(10, 140); ctx.lineTo(20, 122); ctx.lineTo(30, 140);
    ctx.fill();
    ctx.fillStyle = '#ffd889';
    ctx.beginPath(); ctx.arc(20, 154, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#555'; ctx.fillRect(0, 232, W, 88);
    // The blue bear watches the session
    ctx.fillStyle = '#2a6ee8';
    ctx.fillRect(354, 192, 24, 34);
    ctx.fillRect(357, 176, 19, 17);
    ctx.fillRect(357, 172, 6, 5);
    ctx.fillRect(369, 172, 6, 5);
    ctx.fillRect(350, 181, 8, 8);
    ctx.fillRect(348, 192, 6, 18);
    ctx.fillRect(355, 226, 9, 6);
    ctx.fillRect(368, 226, 9, 6);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(358, 180, 2, 2);
    ctx.fillStyle = '#888';
    ctx.fillRect(46, 226, 3, 6); ctx.fillRect(226, 226, 3, 6);
    ctx.fillStyle = '#ccc'; ctx.fillRect(40, 224, 200, 3);
    slam('INK OR DIE', 110, 34, PINK);
    function introSkater(x, y, rot, pose) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = '#241a14'; ctx.fillRect(-12, 12, 24, 2);
      ctx.fillStyle = '#a05a24'; ctx.fillRect(-12, 14, 24, 2);
      ctx.fillStyle = YELLOW; ctx.fillRect(-10, 17, 4, 3); ctx.fillRect(6, 17, 4, 3);
      ctx.fillStyle = '#181820'; ctx.fillRect(-8, 9, 6, 3); ctx.fillRect(2, 9, 6, 3);
      ctx.fillStyle = '#3a4a66'; ctx.fillRect(-6, 3, 3, 6); ctx.fillRect(3, 3, 3, 6); ctx.fillRect(-5, 1, 10, 3);
      ctx.fillStyle = '#1c1826'; ctx.fillRect(-4, -7, 8, 9);
      ctx.fillStyle = '#e8b48c';
      if (pose === 'air') { ctx.fillRect(-9, -9, 4, 3); ctx.fillRect(5, -9, 4, 3); }
      else { ctx.fillRect(-7, -4, 3, 6); ctx.fillRect(4, -3, 3, 6); }
      ctx.fillRect(-3, -13, 7, 6);
      ctx.fillStyle = PINK; ctx.fillRect(-4, -15, 9, 3); ctx.fillRect(-6, -14, 3, 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(1, -12, 2, 2);
      ctx.restore();
    }
    var cyc = t2;
    if (cyc > 132 && cyc < 142) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((142 - cyc) * 0.05).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (cyc >= 10) {
      var sx3, sy3, rot3, pose3;
      if (cyc < 92) {
        sx3 = 40 + (cyc - 10) * 2.2;
        sy3 = 204;
        rot3 = 0; pose3 = 'ride';
        ctx.fillStyle = YELLOW;
        ctx.fillRect(sx3 - 10 + Math.random() * 6, 221 + Math.random() * 4, 2, 2);
        ctx.fillRect(sx3 - 17 + Math.random() * 6, 222 + Math.random() * 4, 2, 2);
      } else if (cyc < 132) {
        var p3 = (cyc - 92) / 40;
        for (var g3 = 1; g3 <= 3; g3++) {
          var pg = Math.max(0, p3 - g3 * 0.08);
          ctx.globalAlpha = 0.14 / g3;
          introSkater(220 + pg * 110, 204 - Math.sin(pg * Math.PI) * 92, pg * Math.PI * 2, 'air');
        }
        ctx.globalAlpha = 1;
        sx3 = 220 + p3 * 110;
        sy3 = 204 - Math.sin(p3 * Math.PI) * 92;
        rot3 = p3 * Math.PI * 2;
        pose3 = 'air';
      } else {
        var p4 = (cyc - 132) / 83;
        sx3 = 330 + p4 * 130;
        sy3 = 212;
        rot3 = 0; pose3 = 'ride';
        if (cyc < 142) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(316 + Math.random() * 8, 228, 3, 2);
          ctx.fillRect(325 + Math.random() * 10, 230, 3, 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(sx3 - 30, sy3 + 2, 18, 1);
        ctx.fillRect(sx3 - 42, sy3 + 8, 14, 1);
      }
      introSkater(sx3, sy3, rot3, pose3);
    }
    if (t2 > 145) { ctx.fillStyle = CYAN; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('GRIND. FLIP. REPEAT.', W / 2, 156); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOLD SPACE or TAP to ollie // tap again mid-air to kickflip', W / 2, H - 42);
    ctx.fillText('arrows = tricks // land clean to bank the line // hold DOWN to manual it on', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('BEST: ' + Math.max(best, wall.best()), W / 2, H - 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    ctx.save();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    var sky = LOCALES[(level - 1) % LOCALES.length];
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(1, sky.bot);
    ctx.fillStyle = grad;
    ctx.fillRect(-8, -8, W + 16, H + 16);

    if (sky.stars) {
      ctx.fillStyle = '#fff';
      for (var i = 0; i < 30; i++) {
        var sx = ((i * 137 + 50) % W + W) % W;
        var sy = ((i * 91 + 20) % (GROUND_Y - 80));
        var twinkle = Math.sin(frame * 0.05 + i) > 0.5 ? 2 : 1;
        ctx.fillRect(sx, sy, twinkle, twinkle);
      }
    }
    if (sky.moon) {
      ctx.fillStyle = '#f4f0d8';
      ctx.beginPath(); ctx.arc(340, 46, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = sky.top;
      ctx.beginPath(); ctx.arc(345, 42, 12, 0, Math.PI * 2); ctx.fill();
    }
    if (sky.sun) {
      var sunGlow = ctx.createRadialGradient(340, sky.sunY, 6, 340, sky.sunY, 60);
      sunGlow.addColorStop(0, sky.sun);
      sunGlow.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(280, sky.sunY - 60, 120, 120);
      ctx.fillStyle = sky.sun;
      ctx.beginPath(); ctx.arc(340, sky.sunY, 13, 0, Math.PI * 2); ctx.fill();
    }
    if (!sky.stars) {
      // Slow clouds ride the daylight skies
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var i = 0; i < 4; i++) {
        var cx2 = ((i * 143 + 60 - scrollX * 0.06) % (W + 120) + W + 120) % (W + 120) - 60;
        var cy2 = 34 + i * 26;
        ctx.beginPath();
        ctx.ellipse(cx2, cy2, 26, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(cx2 + 16, cy2 - 4, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (sky.scene === 'city') {
      // The Rockies sit behind everything, even downtown
      for (var x = -8; x < W + 8; x += 6) {
        var rmx = (x + scrollX * 0.04);
        var rmy = GROUND_Y - 128 - Math.sin(rmx * 0.008) * 22 - Math.sin(rmx * 0.021) * 10;
        ctx.fillStyle = 'rgba(46,38,72,0.55)';
        ctx.fillRect(x, rmy, 6, GROUND_Y - rmy);
      }
      // Far skyline for depth
      ctx.fillStyle = 'rgba(20,16,34,0.5)';
      for (var i = 0; i < 9; i++) {
        var fx = ((i * 150 + 40 - scrollX * 0.12) % (W + 200) + W + 200) % (W + 200) - 100;
        var fh = 60 + ((i * 53) % 70);
        ctx.fillRect(fx, GROUND_Y - fh - 26, 46 + (i * 31) % 40, fh + 26);
      }
      // Denver landmarks ride the middle distance: the cash register
      // tower (with its DENVER rooftop sign), the D&F clocktower
      var lmBase = ((-scrollX * 0.2) % 420 + 420) % 420 - 100;
      for (var rep2 = 0; rep2 < 3; rep2++) {
        var lx = lmBase + rep2 * 420;
        ctx.fillStyle = '#4c4880';
        ctx.fillRect(lx, GROUND_Y - 168, 48, 168);
        ctx.beginPath();
        ctx.moveTo(lx, GROUND_Y - 168);
        ctx.quadraticCurveTo(lx + 10, GROUND_Y - 204, lx + 48, GROUND_Y - 188);
        ctx.lineTo(lx + 48, GROUND_Y - 168);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(lx, GROUND_Y - 168, 4, 168);
        ctx.fillStyle = Math.floor(frame / 40) % 2 === 0 ? '#ff3030' : '#701010';
        ctx.fillRect(lx + 8, GROUND_Y - 206, 3, 3);
        ctx.fillStyle = sky.lights ? 'rgba(255,255,150,0.55)' : 'rgba(40,54,80,0.9)';
        for (var wy = GROUND_Y - 158; wy < GROUND_Y - 12; wy += 12) {
          for (var wx = lx + 5; wx < lx + 44; wx += 9) ctx.fillRect(wx, wy, 4, 5);
        }
        // Union Station: low stone facade under the glowing orange sign
        var ux = lx + 250;
        ctx.fillStyle = '#5a5470';
        ctx.fillRect(ux, GROUND_Y - 52, 96, 52);
        ctx.fillRect(ux + 34, GROUND_Y - 66, 28, 14);
        ctx.fillStyle = sky.lights ? '#ffd889' : '#3a3450';
        for (var ax = ux + 8; ax < ux + 90; ax += 16) {
          ctx.beginPath();
          ctx.arc(ax + 4, GROUND_Y - 26, 5, Math.PI, 0);
          ctx.fill();
          ctx.fillRect(ax, GROUND_Y - 26, 9, 20);
        }
        ctx.fillStyle = Math.floor(frame / 34) % 2 === 0 ? '#ff7a1c' : '#c25a10';
        ctx.fillRect(ux + 30, GROUND_Y - 78, 36, 9);
        ctx.fillStyle = '#14121a';
        ctx.fillRect(ux + 33, GROUND_Y - 76, 30, 5);
        ctx.fillStyle = Math.floor(frame / 34) % 2 === 0 ? '#ffb066' : '#e08030';
        for (var dx2 = ux + 35; dx2 < ux + 62; dx2 += 4) ctx.fillRect(dx2, GROUND_Y - 75, 2, 3);
        var tx = lx + 160;
        ctx.fillStyle = '#2a2444';
        ctx.fillRect(tx, GROUND_Y - 138, 20, 138);
        ctx.beginPath();
        ctx.moveTo(tx - 2, GROUND_Y - 138);
        ctx.lineTo(tx + 10, GROUND_Y - 160);
        ctx.lineTo(tx + 22, GROUND_Y - 138);
        ctx.fill();
        ctx.fillStyle = sky.lights ? '#ffd889' : '#f4f0d8';
        ctx.beginPath(); ctx.arc(tx + 10, GROUND_Y - 122, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2444';
        ctx.fillRect(tx + 9, GROUND_Y - 128, 2, 7);
        ctx.fillRect(tx + 10, GROUND_Y - 122, 5, 2);
        // The big blue bear, peering at a storefront
        var bbBase = ((-scrollX * 0.3) % 640 + 640) % 640 - 120;
        var bx4 = bbBase + rep2 * 640 + 200;
        if (bx4 > -60 && bx4 < W + 60) {
          ctx.fillStyle = '#2a6ee8';
          ctx.fillRect(bx4, GROUND_Y - 40, 24, 34);
          ctx.fillRect(bx4 + 3, GROUND_Y - 56, 19, 17);
          ctx.fillRect(bx4 + 3, GROUND_Y - 60, 6, 5);
          ctx.fillRect(bx4 + 15, GROUND_Y - 60, 6, 5);
          ctx.fillRect(bx4 + 19, GROUND_Y - 51, 8, 8);
          ctx.fillRect(bx4 + 21, GROUND_Y - 40, 6, 18);
          ctx.fillRect(bx4 + 1, GROUND_Y - 6, 9, 6);
          ctx.fillRect(bx4 + 14, GROUND_Y - 6, 9, 6);
          ctx.fillStyle = '#1e54c0';
          ctx.fillRect(bx4 + 24, GROUND_Y - 50, 3, 6);
          ctx.fillStyle = '#14121a';
          ctx.fillRect(bx4 + 17, GROUND_Y - 52, 2, 2);
        }
      }
      // Near buildings (parallax)
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        var bx = b.x - scrollX * 0.3;
        if (bx > W + 50 || bx + b.w < -50) continue;
        var by = GROUND_Y - b.h;
        ctx.fillStyle = b.color;
        ctx.fillRect(bx, by, b.w, b.h);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(bx, by, 2, b.h);
        ctx.fillStyle = sky.lights ? ((Math.sin(frame * 0.02 + i) > 0) ? '#FFFF66' : '#333') : 'rgba(30,44,60,0.8)';
        for (var wy = by + 6; wy < GROUND_Y - 10; wy += 12) {
          for (var wx = bx + 5; wx < bx + b.w - 5; wx += 10) {
            ctx.fillRect(wx, wy, 4, 4);
          }
        }
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(bx + b.w * 0.3, by - 5, 4, 5);
      }
    } else if (sky.scene === 'range') {
      // Snow-capped Rockies behind rolling foothills and pines
      for (var x = -8; x < W + 8; x += 4) {
        var mx = (x + scrollX * 0.08);
        var my = GROUND_Y - 96 - Math.sin(mx * 0.011) * 34 - Math.sin(mx * 0.027) * 16;
        ctx.fillStyle = '#4a3a5e';
        ctx.fillRect(x, my, 4, GROUND_Y - my);
        if (Math.sin(mx * 0.011) * 34 + Math.sin(mx * 0.027) * 16 > 30) {
          ctx.fillStyle = '#e8ecf2';
          ctx.fillRect(x, my, 4, 7);
        }
      }
      for (var x = -8; x < W + 8; x += 4) {
        var hx = (x + scrollX * 0.2);
        var hy = GROUND_Y - 34 - Math.sin(hx * 0.017) * 20 - Math.sin(hx * 0.041) * 8;
        ctx.fillStyle = '#3c3050';
        ctx.fillRect(x, hy, 4, GROUND_Y - hy);
      }
      for (var i = 0; i < 8; i++) {
        var px2 = ((i * 120 + 30 - scrollX * 0.3) % (W + 120) + W + 120) % (W + 120) - 60;
        var ph2 = 20 + (i * 37) % 14;
        ctx.fillStyle = '#1c3324';
        ctx.beginPath();
        ctx.moveTo(px2, GROUND_Y);
        ctx.lineTo(px2 + 8, GROUND_Y - ph2);
        ctx.lineTo(px2 + 16, GROUND_Y);
        ctx.fill();
      }
    } else if (sky.scene === 'redrocks') {
      // The amphitheatre monoliths: giant tilted sandstone slabs
      for (var i = 0; i < 5; i++) {
        var rx2 = ((i * 190 + 40 - scrollX * 0.18) % (W + 260) + W + 260) % (W + 260) - 130;
        var rh2 = 95 + (i * 43) % 45;
        ctx.fillStyle = i % 2 === 0 ? '#b0452a' : '#c1553a';
        ctx.beginPath();
        ctx.moveTo(rx2, GROUND_Y);
        ctx.lineTo(rx2 + 26, GROUND_Y - rh2);
        ctx.lineTo(rx2 + 78, GROUND_Y - rh2 + 16);
        ctx.lineTo(rx2 + 96, GROUND_Y);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.moveTo(rx2 + 26, GROUND_Y - rh2);
        ctx.lineTo(rx2 + 38, GROUND_Y - rh2 + 4);
        ctx.lineTo(rx2 + 12, GROUND_Y);
        ctx.lineTo(rx2, GROUND_Y);
        ctx.fill();
      }
      for (var i = 0; i < 6; i++) {
        var sx2 = ((i * 160 + 90 - scrollX * 0.3) % (W + 80) + W + 80) % (W + 80) - 40;
        ctx.fillStyle = '#5a7040';
        ctx.beginPath(); ctx.ellipse(sx2, GROUND_Y - 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // The Flatirons lean out of the sunset above Boulder pines
      for (var i = 0; i < 5; i++) {
        var fx2 = ((i * 170 + 20 - scrollX * 0.15) % (W + 260) + W + 260) % (W + 260) - 130;
        var fh2 = 90 + (i * 31) % 40;
        ctx.fillStyle = '#241a30';
        ctx.beginPath();
        ctx.moveTo(fx2, GROUND_Y);
        ctx.lineTo(fx2 + 52, GROUND_Y - fh2);
        ctx.lineTo(fx2 + 96, GROUND_Y);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,140,60,0.35)';
        ctx.beginPath();
        ctx.moveTo(fx2 + 52, GROUND_Y - fh2);
        ctx.lineTo(fx2 + 62, GROUND_Y - fh2 + 24);
        ctx.lineTo(fx2 + 52, GROUND_Y - fh2 + 26);
        ctx.fill();
      }
      for (var i = 0; i < 9; i++) {
        var px3 = ((i * 105 + 50 - scrollX * 0.3) % (W + 120) + W + 120) % (W + 120) - 60;
        var ph3 = 16 + (i * 29) % 12;
        ctx.fillStyle = '#161f18';
        ctx.beginPath();
        ctx.moveTo(px3, GROUND_Y);
        ctx.lineTo(px3 + 7, GROUND_Y - ph3);
        ctx.lineTo(px3 + 14, GROUND_Y);
        ctx.fill();
      }
    }

    if (sky.weather === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (var fi = 0; fi < 46; fi++) {
        var fx5 = ((fi * 73 + frame * (0.4 + (fi % 3) * 0.3) + Math.sin(frame * 0.02 + fi) * 8) % (W + 20) + W + 20) % (W + 20) - 10;
        var fy5 = ((fi * 41 + frame * (0.9 + (fi % 4) * 0.35)) % (GROUND_Y + 30));
        ctx.fillRect(fx5, fy5, fi % 5 === 0 ? 2 : 1, fi % 5 === 0 ? 2 : 1);
      }
    } else if (sky.weather === 'rain') {
      ctx.fillStyle = 'rgba(170,190,255,0.35)';
      for (var ri = 0; ri < 40; ri++) {
        var rx5 = ((ri * 97 - frame * 1.2 - scrollX * 0.5) % (W + 40) + W + 40) % (W + 40) - 20;
        var ry5 = ((ri * 53 + frame * 7) % (GROUND_Y + 20));
        ctx.fillRect(rx5, ry5, 1, 7);
      }
      // wet street: a little sky in the asphalt
      ctx.fillStyle = 'rgba(120,120,200,0.10)';
      ctx.fillRect(-8, GROUND_Y, W + 16, 18);
    }

    // Street lamps ride between the buildings and the street; at night they
    // throw a cone on the pavement the skater rolls through.
    if (sky.scene === 'city') {
      for (var li = 0; li < 3; li++) {
        var lpx = ((li * 230 + 90 - scrollX * 0.6) % (W + 120) + W + 120) % (W + 120) - 60;
        ctx.fillStyle = '#2a2a34';
        ctx.fillRect(lpx, GROUND_Y - 92, 3, 92);
        ctx.fillRect(lpx - 1, GROUND_Y - 94, 12, 3);
        ctx.fillRect(lpx + 9, GROUND_Y - 92, 3, 6);
        ctx.fillStyle = sky.lights ? '#fff2b0' : '#8a8a96';
        ctx.fillRect(lpx + 8, GROUND_Y - 86, 5, 3);
        if (sky.lights) {
          var cone = ctx.createRadialGradient(lpx + 10, GROUND_Y - 84, 2, lpx + 10, GROUND_Y - 84, 110);
          cone.addColorStop(0, 'rgba(255,240,180,0.22)');
          cone.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.fillStyle = cone;
          ctx.beginPath();
          ctx.moveTo(lpx + 10, GROUND_Y - 84);
          ctx.lineTo(lpx - 50, GROUND_Y + 16);
          ctx.lineTo(lpx + 70, GROUND_Y + 16);
          ctx.fill();
        }
      }
    }

    // Ground
    ctx.fillStyle = sky.ground;
    ctx.fillRect(-8, GROUND_Y, W + 16, H - GROUND_Y + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-8, GROUND_Y, W + 16, 2);
    // Pavement detail at street speed: cracks, a manhole, a storm drain
    for (var gi = 0; gi < 3; gi++) {
      var gx = ((gi * 310 + 140 - scrollX) % (W + 80) + W + 80) % (W + 80) - 40;
      if (gi === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(gx, GROUND_Y + 7, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.ellipse(gx, GROUND_Y + 6, 10, 2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (gi === 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (var dg = 0; dg < 4; dg++) ctx.fillRect(gx + dg * 5, GROUND_Y + 3, 3, 8);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(gx, GROUND_Y + 4, 14, 1); ctx.fillRect(gx + 13, GROUND_Y + 5, 9, 1); ctx.fillRect(gx + 21, GROUND_Y + 3, 6, 1);
      }
    }
    ctx.fillStyle = sky.dash;
    for (var i = 0; i < 20; i++) {
      var dx = (i * 40 - (scrollX % 40) + 800) % 800 - 400 + W;
      if (dx > W) dx -= 800;
      ctx.fillRect(dx, GROUND_Y + 15, 20, 2);
    }

    // Rails
    for (var i = 0; i < rails.length; i++) {
      var rail = rails[i];
      var rx = rail.x - scrollX;
      if (rx > W + 10 || rx + rail.w < -10) continue;
      ctx.fillStyle = '#888';
      ctx.fillRect(rx + 2, rail.y, 3, GROUND_Y - rail.y);
      ctx.fillRect(rx + rail.w - 5, rail.y, 3, GROUND_Y - rail.y);
      ctx.fillStyle = '#666';
      ctx.fillRect(rx, GROUND_Y - 2, 9, 2);
      ctx.fillRect(rx + rail.w - 7, GROUND_Y - 2, 9, 2);
      ctx.fillStyle = rail.scored ? CYAN : '#ccc';
      ctx.fillRect(rx, rail.y, rail.w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(rx, rail.y, rail.w, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for (var bx2 = rx + 10; bx2 < rx + rail.w - 6; bx2 += 16) ctx.fillRect(bx2, rail.y + 1, 1, 1);
    }

    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      var ox = ob.x - scrollX;
      if (ox > W + 10 || ox + ob.w < -10) continue;
      drawObstacle(ob, ox);
    }

    for (var i = 0; i < collectibles.length; i++) {
      var col = collectibles[i];
      if (col.collected) continue;
      var cx = col.x - scrollX;
      if (cx > W + 10 || cx + col.w < -10) continue;
      drawFlashPickup(cx, col.y + Math.sin(frame * 0.08 + col.x) * 2, col.kind);
    }

    if (mode === 'play' && speed > 6) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((speed - 6) * 0.04).toFixed(3) + ')';
      for (var i = 0; i < 5; i++) {
        var slx = ((i * 97 - scrollX * 2.2) % (W + 60) + W + 60) % (W + 60) - 30;
        ctx.fillRect(slx, 90 + i * 34, 26 + i * 4, 1);
      }
    }

    drawPlayer();
    if (looseBoard) {
      ctx.save();
      ctx.translate(looseBoard.x, looseBoard.y);
      ctx.rotate(looseBoard.rot);
      ctx.fillStyle = '#241a14'; ctx.fillRect(-12, -2, 24, 2);
      ctx.fillStyle = '#a05a24'; ctx.fillRect(-12, 0, 24, 2);
      ctx.fillStyle = YELLOW; ctx.fillRect(-10, 2, 4, 3); ctx.fillRect(6, 2, 4, 3);
      ctx.restore();
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      if (p.dust) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Score popups
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      var pu = popups[i];
      ctx.globalAlpha = Math.min(1, pu.life / 20);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y);
    }
    ctx.globalAlpha = 1;

    // Level transition: the old town rolls up and away
    if (transT > 0 && transCtx) {
      transT--;
      var tp = 1 - transT / 55;
      var tyy = -(tp * tp) * (H + 26);
      try { ctx.drawImage(transCanvas, 0, tyy); } catch (e) { transT = 0; }
      var rollG = ctx.createLinearGradient(0, tyy + H, 0, tyy + H + 15);
      rollG.addColorStop(0, 'rgba(238,238,244,0.95)');
      rollG.addColorStop(0.5, 'rgba(150,150,162,0.95)');
      rollG.addColorStop(1, 'rgba(58,58,70,0.95)');
      ctx.fillStyle = rollG;
      ctx.fillRect(0, tyy + H, W, 15);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, tyy + H + 3, W, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, tyy + H + 15, W, 7);
    }

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, wall.best(), score), 8, 26);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL ' + level + (hitsThisLevel === 0 ? ' // NO BAIL' : ''), W / 2, 14);
    if (shieldT > 0) {
      ctx.fillStyle = YELLOW;
      ctx.fillText('SHIELD', W / 2, 26);
      ctx.fillStyle = 'rgba(255,215,0,0.5)';
      ctx.fillRect(W / 2 - 20, 30, 40 * (shieldT / 300), 3);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerText === 'INK SHIELD!' ? YELLOW : LIME;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 40);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }
    // The line, live: what it is worth right now and what is in it.
    if (linePts > 0 && mode === 'play') {
      ctx.textAlign = 'right';
      ctx.fillStyle = lineFlashT > 0 ? '#fff' : YELLOW;
      ctx.font = 'bold 11px monospace';
      ctx.fillText('LINE ' + linePts + ' x' + combo + ' = ' + (linePts * combo), W - 8, 14);
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      var tail = lineTricks.slice(-3).join(' + ');
      if (lineTricks.length > 3) tail = '.. ' + tail;
      ctx.fillText(tail, W - 8, 25);
      ctx.font = 'bold 10px monospace';
    } else if (lineFlashT > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = LIME;
      ctx.fillText('BANKED', W - 8, 14);
    }
    if (wasManual && mode === 'play') {
      // Balance meter: keep the marker in the middle. UP leans forward.
      var mx0 = W / 2 - 40, my0 = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(mx0 - 2, my0 - 2, 84, 9);
      ctx.fillStyle = Math.abs(manualBal) > 0.7 ? '#ff5050' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(mx0, my0, 80, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(mx0 + 39, my0 - 1, 2, 7);
      ctx.fillStyle = Math.abs(manualBal) > 0.7 ? '#ff5050' : YELLOW;
      ctx.fillRect(mx0 + 38 + Math.max(-1, Math.min(1, manualBal)) * 38, my0 - 2, 4, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BALANCE', W / 2, my0 + 15);
      ctx.font = 'bold 10px monospace';
    }

    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();



    ctx.restore();
  }

  function drawPlayer() {
    var px = player.x, py = player.y;
    var blink = player.invincible > 0 && Math.floor(frame / 4) % 2 === 0;
    if (blink) return;
    if (shieldT > 0) {
      ctx.fillStyle = 'rgba(255,215,0,' + (shieldT < 60 && Math.floor(frame / 4) % 2 === 0 ? 0.08 : 0.22) + ')';
      ctx.beginPath();
      ctx.arc(px + player.w / 2, py + player.h / 2, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    var squash = player.squash || 0;
    var lean = player.grinding ? 0 : Math.max(-0.25, Math.min(0.25, player.vy * 0.02));

    // Shadow on the street, shrinking with height
    var height = Math.max(0, GROUND_Y - (py + player.h));
    var shAlpha = Math.max(0, 0.38 - height / 260);
    if (shAlpha > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + shAlpha.toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(px + player.w / 2, GROUND_Y + 2, Math.max(4, 12 - height / 12), 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(px + player.w / 2, py + player.h / 2 + squash / 2);
    if (player.bailT > 0) {
      // Thrown off: the skater tumbles, the deck is already gone
      ctx.rotate(-(1 - player.bailT / 36) * Math.PI * 1.6);
      ctx.translate(-(player.w / 2), -(player.h / 2));
      var SK2 = '#e8b48c';
      ctx.fillStyle = '#3a4a66'; ctx.fillRect(3, 8, 4, 9); ctx.fillRect(13, 6, 4, 10);
      ctx.fillStyle = '#181820'; ctx.fillRect(1, 16, 6, 3); ctx.fillRect(14, 15, 6, 3);
      ctx.fillStyle = '#1c1826'; ctx.fillRect(6, -2, 8, 10);
      ctx.fillStyle = SK2; ctx.fillRect(-2, -6, 4, 3); ctx.fillRect(0, -3, 3, 5); ctx.fillRect(17, -7, 4, 3); ctx.fillRect(16, -4, 3, 5);
      ctx.fillRect(7, -9, 7, 6);
      ctx.fillStyle = PINK; ctx.fillRect(6, -11, 9, 3);
      ctx.fillStyle = '#fff'; ctx.fillRect(12, -8, 2, 2);
      ctx.restore();
      return;
    }
    if (player.backT > 0) ctx.rotate(-(1 - player.backT / 36) * Math.PI * 2);
    else ctx.rotate(lean);
    ctx.translate(-(player.w / 2), -(player.h / 2));

    var air = !player.onGround && !player.grinding;
    var grabbing = upHeld && air;
    var pushing = player.pushT > 0 && !air && !player.grinding && !wasManual;
    var pushLeg = pushing ? (player.pushT > 8 ? 2 : 1) : 0; // 2 = leg down and back, 1 = coming back up
    var popping = player.popT > 0 && air;
    var SKIN = '#e8b48c', TEE = '#1c1826', JEANS = '#3a4a66', SHOE = '#181820';

    // The deck — kickflips spin one way, heelflips the other,
    // shove-its whip flat, grabs tilt it into the hand
    ctx.save();
    ctx.translate(10, 17);
    if (player.flipT > 0) ctx.rotate((1 - player.flipT / 24) * Math.PI * 2);
    if (player.heelT > 0) ctx.rotate(-(1 - player.heelT / 24) * Math.PI * 2);
    if (player.shoveT > 0) {
      var cs = Math.cos((1 - player.shoveT / 20) * Math.PI * 2);
      ctx.scale(Math.abs(cs) < 0.15 ? 0.15 : cs, 1);
    }
    if (player.impT > 0) {
      var pi2 = (1 - player.impT / 26) * Math.PI * 2;
      ctx.rotate(pi2);
      ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(pi2))));
    }
    if (grabbing) ctx.rotate(0.35);
    if (wasManual) ctx.rotate(-0.28);
    if (player.grinding && grindTilt) ctx.rotate(grindTilt * 0.22);
    ctx.fillStyle = '#241a14';
    ctx.fillRect(-12, -2, 24, 2);
    ctx.fillStyle = '#a05a24';
    ctx.fillRect(-12, 0, 24, 2);
    ctx.fillStyle = '#9aa2ae';
    ctx.fillRect(-9, 2, 3, 2);
    ctx.fillRect(6, 2, 3, 2);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(-10, 3, 4, 3);
    ctx.fillRect(6, 3, 4, 3);
    ctx.restore();

    // Shoes planted on the grip. Pushing: the back foot swings off the tail
    // to the street. Popping: legs stretch for the ollie, then tuck in the air.
    var tuck = popping ? -1 : air ? 3 : 0;
    ctx.fillStyle = SHOE;
    if (pushLeg === 2) { ctx.fillRect(-4, 16 + squash / 2, 6, 3); }
    else if (pushLeg === 1) { ctx.fillRect(-1, 14 + squash / 2, 6, 3); }
    else ctx.fillRect(2, 12 - tuck + squash / 2, 6, 3);
    ctx.fillRect(12, 12 - tuck + squash / 2, 6, 3);
    // Jeans: knees bend riding, pull up in the air
    ctx.fillStyle = JEANS;
    if (pushLeg === 2) { ctx.fillRect(1, 8 + squash, 3, 5); ctx.fillRect(-2, 12 + squash, 4, 4); }
    else if (pushLeg === 1) { ctx.fillRect(3, 8 + squash, 3, 5); ctx.fillRect(0, 11 + squash, 4, 4); }
    else ctx.fillRect(4, 7 - tuck + squash, 3, 6);
    ctx.fillRect(13, 7 - tuck + squash, 3, 6);
    ctx.fillRect(5, 5 - tuck + squash, 10, 3);
    // Tee, leaning with the ride
    ctx.fillStyle = TEE;
    ctx.fillRect(6, -3 + squash, 8, 9);
    // Arms: skating = trailing, air = thrown out, grab = reaching the rail of the deck
    ctx.fillStyle = SKIN;
    if (grabbing) {
      ctx.fillRect(13, 0 + squash, 3, 6);
      ctx.fillRect(14, 6 + squash, 3, 8);
      ctx.fillRect(2, -4 + squash, 3, 5);
    } else if (air) {
      ctx.fillRect(1, -5 + squash, 4, 3);
      ctx.fillRect(15, -5 + squash, 4, 3);
      ctx.fillRect(3, -3 + squash, 3, 4);
      ctx.fillRect(14, -3 + squash, 3, 4);
    } else {
      ctx.fillRect(3, -1 + squash, 3, 6);
      ctx.fillRect(14, 0 + squash, 3, 6);
    }
    // Head under a backwards cap
    ctx.fillStyle = SKIN;
    ctx.fillRect(7, -9 + squash, 7, 6);
    ctx.fillStyle = PINK;
    ctx.fillRect(6, -11 + squash, 9, 3);
    ctx.fillRect(4, -10 + squash, 3, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(12, -8 + squash, 2, 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(13, -8 + squash, 1, 2);

    ctx.restore();
  }

  function drawObstacle(ob, ox) {
    if (ob.type === 'dog') {
      // A loose dog, low and fast, coming the other way
      var run = Math.floor(frame / 5) % 2;
      ctx.fillStyle = '#a0743c';
      ctx.fillRect(ox + 4, ob.y + 3, 12, 6);
      ctx.fillRect(ox + 13, ob.y, 6, 6);
      ctx.fillRect(ox, ob.y + 1, 5, 3);
      ctx.fillStyle = '#7a5428';
      ctx.fillRect(ox + 5, ob.y + 9, 3, run ? 3 : 2);
      ctx.fillRect(ox + 12, ob.y + 9, 3, run ? 2 : 3);
      ctx.fillRect(ox + 15, ob.y - 2, 2, 3);
      ctx.fillStyle = '#000';
      ctx.fillRect(ox + 17, ob.y + 2, 1, 1);
      ctx.fillStyle = '#e8283c';
      ctx.fillRect(ox + 12, ob.y + 6, 5, 1);
      return;
    }
    if (ob.type === 'cyclist') {
      // A bike commuter in a helmet, head down, not stopping
      var spin = Math.floor(frame / 4) % 2;
      ctx.fillStyle = '#ddd';
      ctx.fillRect(ox + 1, ob.y + 22, 7, 7);
      ctx.fillRect(ox + 11, ob.y + 22, 7, 7);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(ox + 3, ob.y + 24, 3, 3);
      ctx.fillRect(ox + 13, ob.y + 24, 3, 3);
      if (spin) { ctx.fillRect(ox + 2, ob.y + 25, 5, 1); ctx.fillRect(ox + 12, ob.y + 25, 5, 1); }
      ctx.fillStyle = '#e8283c';
      ctx.fillRect(ox + 4, ob.y + 17, 11, 2);
      ctx.fillRect(ox + 8, ob.y + 13, 2, 5);
      ctx.fillStyle = '#3a4a66';
      ctx.fillRect(ox + 6, ob.y + 12, 5, 6);
      ctx.fillStyle = '#2fbf71';
      ctx.fillRect(ox + 7, ob.y + 5, 6, 8);
      ctx.fillStyle = '#e8b48c';
      ctx.fillRect(ox + 12, ob.y + 9, 4, 2);
      ctx.fillRect(ox + 9, ob.y + 1, 5, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(ox + 8, ob.y - 1, 7, 3);
      return;
    }
    if (ob.type === 'pigeon') {
      var flapPh = Math.floor(frame / 4) % 3;
      var flap = flapPh === 0;
      ctx.fillStyle = '#a8b0c0';
      ctx.fillRect(ox + 3, ob.y + 2, 9, 6);
      ctx.fillStyle = '#5a8a5a';
      ctx.fillRect(ox + 10, ob.y + 3, 3, 2);
      ctx.fillStyle = '#8890a0';
      if (flapPh === 0) ctx.fillRect(ox + 2, ob.y - 3, 7, 3);
      else if (flapPh === 1) ctx.fillRect(ox + 3, ob.y + 1, 7, 2);
      else ctx.fillRect(ox + 4, ob.y + 5, 7, 3);
      ctx.fillStyle = '#a8b0c0';
      ctx.fillRect(ox + 11, ob.y, 4, 4);
      ctx.fillStyle = '#FF8A00';
      ctx.fillRect(ox + 15, ob.y + 1, 2, 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(ox + 13, ob.y + 1, 1, 1);
      return;
    }
    if (ob.type === 'spill') {
      ctx.fillStyle = 'rgba(200,0,110,0.85)';
      ctx.beginPath();
      ctx.ellipse(ox + ob.w / 2, GROUND_Y - 1, ob.w / 2, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(ox + 6, GROUND_Y - 3, 6, 1);
      if (Math.floor(frame / 20) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,20,147,0.5)';
        ctx.fillRect(ox + ob.w / 2 - 1, GROUND_Y - 8, 2, 2);
      }
      return;
    }
    if (ob.type === 'stack') {
      ctx.fillStyle = '#777';
      ctx.fillRect(ox + 1, ob.y + 21, 14, 19);
      ctx.fillStyle = '#999';
      ctx.fillRect(ox, ob.y + 18, 16, 4);
      ctx.fillStyle = '#666';
      ctx.fillRect(ox + 1, ob.y + 28, 14, 1);
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(ox + 2, ob.y + 3, 13, 16);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(ox + 1, ob.y, 15, 4);
      return;
    }
    // Everything on the street casts a little shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(ox + ob.w / 2, GROUND_Y + 2, ob.w / 2 + 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    if (ob.type === 'hydrant') {
      ctx.fillStyle = '#FF3333';
      ctx.fillRect(ox + 2, ob.y + 4, 8, 14);
      ctx.fillRect(ox, ob.y + 6, 12, 4);
      ctx.fillRect(ox + 3, ob.y, 6, 5);
      ctx.fillStyle = '#b01010';
      ctx.fillRect(ox + 7, ob.y + 4, 3, 14);
      ctx.fillRect(ox + 9, ob.y + 6, 3, 4);
      ctx.fillStyle = '#CC0000';
      ctx.fillRect(ox + 4, ob.y, 4, 2);
      ctx.fillStyle = '#ff9a9a';
      ctx.fillRect(ox + 3, ob.y + 5, 1, 10);
      ctx.fillStyle = '#c8c8d0';
      ctx.fillRect(ox + 1, ob.y + 10, 2, 2); ctx.fillRect(ox + 9, ob.y + 10, 2, 2);
      ctx.fillRect(ox, ob.y + 12, 1, 3); ctx.fillRect(ox + 11, ob.y + 12, 1, 3);
    } else if (ob.type === 'trashcan') {
      ctx.fillStyle = '#777';
      ctx.fillRect(ox + 1, ob.y + 3, 14, 19);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(ox + 10, ob.y + 3, 5, 19);
      ctx.fillStyle = '#999';
      ctx.fillRect(ox, ob.y, 16, 4);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(ox + 2, ob.y - 1, 12, 2);
      ctx.fillStyle = '#666';
      ctx.fillRect(ox + 1, ob.y + 10, 14, 1);
      ctx.fillRect(ox + 1, ob.y + 16, 14, 1);
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(ox + 3, ob.y + 5, 1, 15);
      // a coffee cup and a flyer poking out
      ctx.fillStyle = '#f0e8d8'; ctx.fillRect(ox + 4, ob.y - 5, 4, 5);
      ctx.fillStyle = PINK; ctx.fillRect(ox + 10, ob.y - 4, 3, 5);
    } else if (ob.type === 'cone') {
      ctx.fillStyle = '#ff8a00';
      ctx.fillRect(ox + 1, ob.y + 10, 10, 4);
      ctx.fillRect(ox + 3, ob.y + 5, 6, 5);
      ctx.fillRect(ox + 4, ob.y, 4, 5);
      ctx.fillStyle = '#c05a00';
      ctx.fillRect(ox + 7, ob.y + 5, 2, 5); ctx.fillRect(ox + 7, ob.y + 1, 1, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(ox + 2, ob.y + 7, 8, 2);
      ctx.fillStyle = '#222';
      ctx.fillRect(ox, ob.y + 13, 12, 1);
    }
  }

  // Floating flash to snatch mid-air: the classics
  function drawFlashPickup(cx, cy, kind) {
    if (kind === 'horseshoe') {
      ctx.fillStyle = 'rgba(255,215,0,0.35)';
      ctx.fillRect(cx - 3, cy - 3, 20, 20);
      ctx.fillStyle = YELLOW;
      ctx.fillRect(cx + 2, cy, 10, 3);
      ctx.fillRect(cx, cy + 2, 3, 8);
      ctx.fillRect(cx + 11, cy + 2, 3, 8);
      ctx.fillRect(cx, cy + 10, 4, 3);
      ctx.fillRect(cx + 10, cy + 10, 4, 3);
    } else if (kind === 'heart') {
      ctx.fillStyle = '#e8283c';
      ctx.fillRect(cx + 1, cy + 1, 5, 5);
      ctx.fillRect(cx + 8, cy + 1, 5, 5);
      ctx.fillRect(cx, cy + 4, 14, 5);
      ctx.fillRect(cx + 3, cy + 9, 8, 3);
      ctx.fillRect(cx + 5, cy + 12, 4, 2);
      ctx.fillStyle = '#ff8098';
      ctx.fillRect(cx + 2, cy + 2, 2, 2);
    } else if (kind === 'skull') {
      ctx.fillStyle = '#dfe3e8';
      ctx.fillRect(cx + 2, cy, 10, 8);
      ctx.fillRect(cx + 4, cy + 8, 6, 4);
      ctx.fillStyle = '#14121a';
      ctx.fillRect(cx + 4, cy + 3, 2, 3);
      ctx.fillRect(cx + 8, cy + 3, 2, 3);
      ctx.fillRect(cx + 5, cy + 9, 1, 2);
      ctx.fillRect(cx + 8, cy + 9, 1, 2);
    } else if (kind === 'eagle') {
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(cx, cy + 2, 4, 3);
      ctx.fillRect(cx + 10, cy + 2, 4, 3);
      ctx.fillRect(cx + 2, cy + 4, 10, 4);
      ctx.fillRect(cx + 5, cy + 8, 4, 4);
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(cx + 5, cy, 4, 4);
      ctx.fillStyle = '#e8a020';
      ctx.fillRect(cx + 9, cy + 1, 2, 2);
      ctx.fillRect(cx + 5, cy + 12, 2, 2);
    } else if (kind === 'bolt') {
      ctx.fillStyle = YELLOW;
      ctx.fillRect(cx + 6, cy, 5, 5);
      ctx.fillRect(cx + 3, cy + 4, 7, 4);
      ctx.fillRect(cx + 2, cy + 8, 5, 6);
    } else {
      ctx.fillStyle = CYAN;
      ctx.fillRect(cx + 6, cy, 3, 14);
      ctx.fillRect(cx, cy + 5, 14, 3);
      ctx.fillRect(cx + 3, cy + 3, 8, 8);
    }
  }

  // ── Fixed-step loop on requestAnimationFrame (smooth on any refresh rate) ──
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
      else { frame++; musicTick(); if (shake > 0) shake *= 0.85; if (mode === 'intro' && ++introT > 525) introT = 70; }
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

  // Start when overlay opens
  var obs = new MutationObserver(function() {
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-skate', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
