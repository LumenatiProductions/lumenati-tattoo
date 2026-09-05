(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  // Logical width comes from the shell on phones (400 to 720 in landscape);
  // the harness and the desktop stay at 400. Height is always 320.
  var VIEW = window.__ARCADE_VIEW__ || null;
  var W = (VIEW && VIEW.w) || 400, H = 320;
  var PHONE = !!(VIEW && VIEW.phone), PORTRAIT = !!(VIEW && VIEW.portrait);
  var WS = W / 400; // how much wider than the cabinet: lanes, the runner and the props grow with it
  // Modern render path: the canvas holds 2x pixels, every draw() scales the
  // logical W x 320 space up, so game math and the wall module stay as is.
  var HIRES = false;
  try { if (canvas.width !== W * 2) { canvas.width = W * 2; canvas.height = 640; } HIRES = canvas.width === W * 2; } catch (e) {}
  function offscreen(w, h) {
    try { var c = document.createElement('canvas'); if (!c || typeof c.getContext !== 'function') return null; c.width = w; c.height = h; var x = c.getContext('2d'); return x ? { c: c, x: x } : null; } catch (e) { return null; }
  }

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
  function sfxJump() { playSfx(420, 0.06, 'square', 0.08); setTimeout(function(){playSfx(640, 0.08, 'square', 0.07);}, 50); }
  function sfxSlide() { playSfx(220, 0.12, 'sawtooth', 0.07); }
  function sfxLane() { playSfx(900, 0.03, 'square', 0.05); }
  function sfxDrop(n) { playSfx(880 + Math.min(8, n) * 60, 0.05, 'square', 0.08); }
  function sfxFlash() { playSfx(700, 0.08, 'square', 0.1); setTimeout(function(){playSfx(1050, 0.08, 'square', 0.1);}, 70); setTimeout(function(){playSfx(1400, 0.14, 'square', 0.1);}, 140); }
  function sfxPower() { playSfx(500, 0.08, 'square', 0.1); setTimeout(function(){playSfx(750, 0.08, 'square', 0.1);}, 80); setTimeout(function(){playSfx(1000, 0.08, 'square', 0.1);}, 160); setTimeout(function(){playSfx(1500, 0.18, 'square', 0.1);}, 240); }
  function sfxHit() { playSfx(140, 0.32, 'sawtooth', 0.16); }
  function sfxShield() { playSfx(300, 0.1, 'square', 0.1); setTimeout(function(){playSfx(200, 0.16, 'square', 0.1);}, 90); }
  function sfxNear() { playSfx(1300, 0.04, 'square', 0.06); }
  function sfxZone() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.16, 'square', 0.12);}, 200); }

  // Announcer: no clips of its own, the shared lingo does the job
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
  var LINGO = ['radical', 'gnarly', 'shred-it', 'yeah-dude'];
  function sayCallout(name) {
    if (calloutCd > 0) return;
    calloutCd = 480;
    say(name || LINGO[Math.floor(Math.random() * LINGO.length)]);
  }

  // ── Chiptune: a driving sprint, one song per zone ──
  var SONGS = [
    { root: 130.81, bass: [0,0,7,0, 5,5,0,5, 3,3,7,3, 5,7,5,3],       lead: [12,-1,15,12, -1,19,17,-1, 15,-1,12,15, 17,-1,19,-1] },
    { root: 146.83, bass: [0,-1,0,3, 5,-1,5,3, 0,-1,0,3, 7,5,3,0],    lead: [15,-1,17,-1, 19,-1,17,15, 12,-1,15,-1, 17,19,17,15] },
    { root: 123.47, bass: [0,3,0,5, 0,3,0,7, 0,3,0,5, 10,8,7,5],      lead: [19,-1,17,-1, 15,-1,12,-1, 19,-1,17,15, -1,12,-1,-1] },
    { root: 164.81, bass: [0,0,5,0, 3,3,7,3, 0,0,5,0, 8,7,5,3],       lead: [12,15,-1,17, -1,15,12,-1, 15,17,19,-1, 17,-1,15,12] },
    { root: 110.00, bass: [0,-1,3,-1, 5,-1,3,-1, 7,-1,5,-1, 3,-1,0,-1], lead: [12,-1,15,-1, 17,15,-1,12, -1,15,17,19, -1,17,15,-1] },
  ];
  var MENU_SONG = { root: 146.83, bass: [0,0,7,0, 5,5,9,5, 0,0,7,0, 8,7,5,3], lead: [12,-1,16,12, -1,17,16,-1, 12,-1,16,19, 21,19,16,12] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 11 : Math.max(7, 12 - zone);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(zone - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.045);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.026);
    if (musicStep % 4 === 0) playSfx(65, 0.08, 'sawtooth', 0.04);
    if (musicStep % 8 === 4) playSfx(210, 0.04, 'sawtooth', 0.026);
    if (musicStep % 2 === 1) playSfx(1900, 0.014, 'square', 0.011);
  }
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', PURPLE = '#B026FF', ORANGE = '#ff8c1a';

  // ── The track: three lanes running into a vanishing point ──
  var HOR = 108;          // horizon line
  var FLOOR_Y = 292;      // where the player's feet sit
  var NEAR = 5.5;         // camera depth; bigger = flatter perspective
  var LANE_W = 96 * WS;   // lane width in px at the player (wider screens get wider lanes)
  var Z_FAR = 64;         // spawn distance in track units
  function scaleAt(z) { return NEAR / (z + NEAR); }
  function yAt(z) { return HOR + (FLOOR_Y - HOR) * scaleAt(z); }
  function xAt(lane, z) { return W / 2 + lane * LANE_W * scaleAt(z); }

  // Every ~900 units the run leaves one place for the next. Each zone has
  // its own light, its own props at the edges, and its own hazards.
  var ZONE_LEN = 900;
  var ZONES = [
    { name: 'THE SHOP FLOOR', sky: ['#1a0f22', '#3a1a44'], floor: ['#2b1e33', '#3a2a44'], line: 'rgba(255,20,147,0.35)', fog: '#2a1834',
      props: ['chair', 'station', 'neon'], low: ['cart', 'rack'], high: ['sign'], block: ['chairblock', 'client'], spill: true },
    { name: 'THE ALLEY', sky: ['#0b0f16', '#1b2430'], floor: ['#1a1d22', '#23272d'], line: 'rgba(255,255,255,0.18)', fog: '#161a22',
      props: ['brick', 'dumpsterprop', 'escape'], low: ['dog', 'cart'], high: ['escapebar'], block: ['dumpster'], spill: true, pigeons: true },
    { name: 'THE FLASH MARKET', sky: ['#1a1408', '#3b2c0c'], floor: ['#2c2416', '#3a301c'], line: 'rgba(255,215,0,0.3)', fog: '#2b2210',
      props: ['tent', 'table', 'lamp'], low: ['table', 'rack'], high: ['tentbar', 'sign'], block: ['client', 'client'], spill: false },
    { name: '16TH STREET', sky: ['#0a1224', '#1a2e58'], floor: ['#20242c', '#2a2f38'], line: 'rgba(0,255,255,0.28)', fog: '#152040',
      props: ['tower', 'lamp', 'tower'], low: ['bench', 'cart'], high: ['sign', 'wire'], block: ['tram', 'client'], spill: true },
    { name: 'THE MOUNTAIN PASS', sky: ['#04060f', '#0e1630'], floor: ['#1c2028', '#262b34'], line: 'rgba(127,255,0,0.25)', fog: '#0c1020',
      props: ['pine', 'peak', 'pine'], low: ['rail', 'rock'], high: ['tunnel', 'wire'], block: ['boulder', 'boulder'], spill: true, stars: true },
  ];
  function zoneOf(d) { return Math.floor(d / ZONE_LEN) + 1; }
  function zoneDef(z) { return ZONES[(z - 1) % ZONES.length]; }

  var mode = 'intro'; // intro | play | enter | over
  var introT = 0;
  var score, lives, frame, dist, speed, zone;
  var player, obstacles, pickups, props, birds, popups, parts, shake, flashT;
  var chain, chainT, drops, bestChain, nearOnes, lastJump, lastSlide, comboT;
  var magnetT, shieldOn, coffeeT, slowT, stumbleT, invuln, bannerT, bannerText, bannerColor;
  var spawnZ, stats, lastZoneCleared, floorOff, stars;
  var introduced, lastPatternWasHazard, slideEndAt, cardT, cardText, cardSub;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-inkrun') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-inkrun', String(best)); } catch(e) {} }
  }

  // Chain multiplier: every five drops in a row without a gap raises it,
  // up to x8. About a second and a half without a pickup and it drops to x1.
  function mult() { return Math.min(8, 1 + Math.floor(chain / 5)); }
  function award(pts, x, y, label, color, big) {
    pts = Math.round(pts);
    score += pts;
    document.getElementById('jd-br-score').textContent = score;
    addPopup(x, y, (label ? label + ' ' : '') + '+' + pts, color || '#fff', big);
  }
  function addPopup(x, y, text, color, big) {
    popups.push({ x: x, y: y, text: text, color: color, life: big ? 70 : 50, big: !!big });
  }
  function burst(x, y, n, color, spread, gravity) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * (spread || 2.4);
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8, life: 22 + Math.random() * 26, color: color, s: 1 + Math.random() * 2, g: gravity === undefined ? 0.08 : gravity });
    }
  }
  function banner(text, color, t) { bannerT = t || 90; bannerText = text; bannerColor = color || LIME; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; frame = 0; dist = 0; speed = 0.18; zone = 1; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    player = { lane: 0, x: 0, h: 0, vy: 0, jumping: false, slideT: 0, lean: 0, runT: 0 };
    obstacles = []; pickups = []; props = []; birds = []; popups = []; parts = []; shake = 0; flashT = 0;
    chain = 0; chainT = 0; drops = 0; bestChain = 0; nearOnes = 0; lastJump = -999; lastSlide = -999; comboT = 0;
    magnetT = 0; shieldOn = false; coffeeT = 0; slowT = 0; stumbleT = 0; invuln = 0; bannerT = 0; bannerText = ''; bannerColor = LIME;
    spawnZ = 16; stats = { zone: 1, flash: 0, near: 0 }; lastZoneCleared = 0; floorOff = 0;
    introduced = { low: false, high: false, block: false }; lastPatternWasHazard = false; slideEndAt = -999; cardT = 0; cardText = ''; cardSub = '';
    stars = [];
    for (var i = 0; i < 40; i++) stars.push({ x: (i * 97) % W, y: (i * 53) % (HOR - 10), s: 1 + (i % 2) });
    seedProps();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Swipe left/right: lanes // swipe up or tap: jump // swipe down: slide' : 'Left/Right lanes, UP jumps, DOWN slides // chain the ink for x8';
    window.skateRunning = true;
    startLoop();
  }

  function seedProps() {
    props = [];
    for (var z = 4; z < Z_FAR; z += 5) {
      props.push({ side: -1, z: z, kind: pickProp() });
      props.push({ side: 1, z: z + 2.5, kind: pickProp() });
    }
  }
  function pickProp() {
    var zd = zoneDef(zone);
    return zd.props[Math.floor(Math.random() * zd.props.length)];
  }

  // ── Spawning: one thing to do at a time, and always a way through ──
  // The first zone is a warm-up: jumps only for 300m, then slides, then
  // blockers, each with a card the first time it shows up. Hazard patterns
  // and drop-only breathers alternate in the first two zones, so two
  // different moves never come back to back. Spacing scales with speed so
  // there is always at least 1.5 seconds to react.
  function teach(cls) {
    if (introduced[cls]) return;
    introduced[cls] = true;
    if (cls === 'low') { cardText = 'CARTS: JUMP'; cardSub = 'yellow arrow = press UP'; }
    else if (cls === 'high') { cardText = 'BARS: SLIDE'; cardSub = 'cyan arrow = press DOWN'; }
    else { cardText = 'CHAIRS: CHANGE LANE'; cardSub = 'red X = move LEFT or RIGHT'; }
    cardT = 200;
    sfxZone();
  }
  function spawnPattern() {
    var zd = zoneDef(zone);
    var z = Z_FAR;
    var lanes = [-1, 0, 1];
    function shuffled() { var a = lanes.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function ob(kind, type, lane, zz, wide) { obstacles.push({ kind: kind, type: type, lane: lane, z: zz, wide: !!wide, passed: false, near: false, id: Math.random() }); }
    function lowKind() { return zd.low[Math.floor(Math.random() * zd.low.length)]; }
    function highKind() { return zd.high[Math.floor(Math.random() * zd.high.length)]; }
    function blockKind() { return zd.block[Math.floor(Math.random() * zd.block.length)]; }
    function dropLine(lane, zz, n, arc) {
      for (var i = 0; i < n; i++) {
        var h = 0;
        if (arc) { var u = i / (n - 1); h = Math.sin(u * Math.PI) * 1.0; }
        pickups.push({ kind: 'drop', lane: lane, z: zz + i * 1.3, h: h, got: false });
      }
    }
    // what the run has unlocked so far
    var allowed = ['low'];
    if (dist >= 300) allowed.push('high');
    if (dist >= 600) allowed.push('block');
    var easy = zone <= 2;
    var breather = easy && lastPatternWasHazard;
    var rest = breather || Math.random() < 0.18;
    var gapUnits = Math.max(12, speed * 90) + Math.random() * 4; // 1.5s at the current speed, at least
    if (rest) {
      // drops only: a line, sometimes with a lane change and a treat
      var s2 = shuffled();
      dropLine(s2[0], z, 5, false);
      if (Math.random() < 0.5) dropLine(s2[1], z + 8, 4, false);
      if (Math.random() < 0.35) { var kinds = ['flash', 'flash', 'magnet', 'shield', 'coffee']; pickups.push({ kind: kinds[Math.floor(Math.random() * kinds.length)], lane: s2[2], z: z + 4, h: 0, got: false }); }
      lastPatternWasHazard = false;
      spawnZ = gapUnits * 0.6;
      return;
    }
    var cls = allowed[Math.floor(Math.random() * allowed.length)];
    teach(cls);
    lastPatternWasHazard = true;
    if (cls === 'low') {
      var l1 = lanes[Math.floor(Math.random() * 3)];
      if (zd.spill && zone >= 2 && Math.random() < 0.3) {
        obstacles.push({ kind: 'spill', type: 'spill', lane: l1, z: z, passed: false, id: Math.random() });
      } else ob(lowKind(), 'low', l1, z);
      if (Math.random() < 0.75) dropLine(l1, z - 3, 5, true);
      // later zones: a second jump in another lane at the same depth
      if (zone >= 3 && Math.random() < 0.5) { var l1b = shuffled().filter(function(l) { return l !== l1; })[0]; ob(lowKind(), 'low', l1b, z); }
    } else if (cls === 'high') {
      ob(highKind(), 'high', 0, z, true);
      var l2 = lanes[Math.floor(Math.random() * 3)];
      if (Math.random() < 0.6) dropLine(l2, z + 2, 4, false);
    } else {
      var s3 = shuffled();
      ob(blockKind(), 'block', s3[0], z);
      // from zone 3 a second blocker, always leaving a lane open
      if (zone >= 3 && Math.random() < 0.6) ob(blockKind(), 'block', s3[1], z);
      if (Math.random() < 0.7) dropLine(s3[2], z - 1, 5, false);
    }
    // the combo setup (jump, then a bar) waits for zone 3
    if (!easy && cls === 'low' && Math.random() < 0.3 && introduced.high) ob(highKind(), 'high', 0, z + Math.max(8, speed * 60), true);
    spawnZ = gapUnits;
  }

  // ── Player actions ──
  function moveLane(d) {
    if (mode !== 'play') return;
    var nl = Math.max(-1, Math.min(1, player.lane + d));
    if (nl === player.lane) return;
    player.lane = nl;
    player.lean = d * 1;
    sfxLane();
  }
  function jump() {
    if (mode !== 'play') return;
    if (player.jumping || player.slideT > 0) return;
    player.jumping = true;
    player.vy = 0.15;
    lastJump = frame;
    sfxJump();
    burst(xAt(player.x, 0), FLOOR_Y, 5, 'rgba(200,200,220,0.6)', 1.2, 0.02);
  }
  function slide() {
    if (mode !== 'play') return;
    if (player.jumping) { player.vy = -0.22; return; } // fast drop out of a jump
    if (player.slideT > 0) return;
    player.slideT = 34;
    lastSlide = frame;
    sfxSlide();
    burst(xAt(player.x, 0), FLOOR_Y, 4, 'rgba(200,200,220,0.5)', 1.0, 0.02);
  }

  function hit(ob) {
    if (invuln > 0) return;
    if (shieldOn) {
      shieldOn = false;
      invuln = 60;
      shake = 6;
      addPopup(W / 2, 200, 'STENCIL TOOK IT', CYAN, true);
      burst(xAt(player.x, 0), FLOOR_Y - 20, 14, CYAN, 2.4, 0.04);
      sfxShield();
      return;
    }
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    chain = 0; chainT = 0;
    sfxHit();
    shake = 14; flashT = 8;
    stumbleT = 120; // two seconds at half speed
    // nothing lands on you in the first second after a hit
    for (var ci = obstacles.length - 1; ci >= 0; ci--) { if (obstacles[ci] !== ob && obstacles[ci].z > -1 && obstacles[ci].z < speed * 60 + 2) obstacles.splice(ci, 1); }
    spawnZ = Math.max(spawnZ, speed * 60 + 4);
    burst(xAt(player.x, 0), FLOOR_Y - 20, 18, '#e74c3c', 3, 0.1);
    for (var i = 0; i < 4; i++) parts.push({ x: xAt(player.x, 0), y: FLOOR_Y - 26, vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 2, life: 60, color: '#fff', s: 4, g: 0.06, paper: true });
    if (lives <= 0) {
      enterBoard(score);
      saveBest();
      deathJingle();
      return;
    }
    invuln = 90;
    addPopup(W / 2, 196, lives === 1 ? 'OUCH // LAST LIFE' : 'OUCH // ' + lives + ' LEFT', '#ff5050', true);
  }

  function update() {
    frame++;
    if (calloutCd > 0) calloutCd--;
    musicTick();
    if (shake > 0) shake *= 0.85;
    if (flashT > 0) flashT--;
    if (bannerT > 0) bannerT--;
    if (invuln > 0) invuln--;
    if (magnetT > 0) magnetT--;
    if (coffeeT > 0) coffeeT--;
    if (slowT > 0) slowT--;
    if (stumbleT > 0) stumbleT--;
    if (comboT > 0) comboT--;
    if (cardT > 0) cardT--;
    if (chainT > 0) { chainT--; if (chainT === 0 && chain > 0) { chain = 0; } }

    // Speed: ramps with distance, coffee doubles down, spills and stumbles drag
    var base = 0.18 + Math.min(0.34, dist / 14000);
    var sp = base;
    if (coffeeT > 0) sp *= 1.5;
    if (slowT > 0) sp *= 0.72;
    if (stumbleT > 0) sp *= 0.5;
    speed += (sp - speed) * 0.08;
    dist += speed;
    floorOff = (floorOff + speed) % 4;

    // Distance pays quietly
    if (Math.floor(dist / 10) !== Math.floor((dist - speed) / 10)) {
      score += 5;
      document.getElementById('jd-br-score').textContent = score;
    }

    // Zones
    var nz = zoneOf(dist);
    if (nz > zone) {
      var bonus = 500 * zone * Math.max(1, mult() / 2);
      award(bonus, W / 2, 150, zoneDef(zone).name + ' CLEARED', YELLOW, true);
      stats.zone = nz;
      zone = nz;
      banner(zoneDef(zone).name, LIME, 120);
      sfxZone();
      sayCallout();
      burst(W / 2, 140, 24, YELLOW, 3.5, 0.04);
    }

    // Player physics
    player.x += (player.lane - player.x) * 0.45; // the sprite catches up fast; the lane itself is instant
    player.lean *= 0.85;
    player.runT += speed * 2.2;
    if (player.jumping) {
      player.h += player.vy;
      player.vy -= 0.0095;
      if (player.h <= 0) { player.h = 0; player.jumping = false; player.vy = 0; burst(xAt(player.x, 0), FLOOR_Y, 4, 'rgba(200,200,220,0.5)', 1.0, 0.02); }
    }
    if (player.slideT > 0) { player.slideT--; if (player.slideT === 0) slideEndAt = frame; }

    // Spawn
    spawnZ -= speed;
    if (spawnZ <= 0) spawnPattern();

    // Props scroll toward us and recycle at the far end
    for (var p = 0; p < props.length; p++) {
      props[p].z -= speed;
      if (props[p].z < -2) { props[p].z += Z_FAR + 2; props[p].kind = pickProp(); }
    }
    if (zoneDef(zone).pigeons && Math.random() < 0.01 && birds.length < 3) {
      birds.push({ x: Math.random() < 0.5 ? -20 : W + 20, y: 60 + Math.random() * 60, dir: 0, t: 0 });
      birds[birds.length - 1].dir = birds[birds.length - 1].x < 0 ? 1 : -1;
    }
    for (var b = birds.length - 1; b >= 0; b--) { birds[b].x += birds[b].dir * 2.2; birds[b].t++; if (birds[b].x < -30 || birds[b].x > W + 30) birds.splice(b, 1); }

    // Obstacles
    var px = player.x;
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      ob.z -= speed;
      if (ob.z < -3) { obstacles.splice(i, 1); continue; }
      var laneHit = ob.wide || ob.lane === player.lane;
      var inReach = ob.z < 0.45 && ob.z > -0.3;
      if (inReach && laneHit && !ob.passed) {
        var dodged = false;
        // generous: any part of a jump clears a low thing, a slide that just
        // ended or just started still clears a bar
        if (ob.type === 'low') dodged = player.jumping || player.h > 0.2;
        else if (ob.type === 'high') dodged = player.slideT > 0 || frame - slideEndAt < 10;
        else if (ob.type === 'spill') { dodged = player.jumping || player.h > 0.2; if (!dodged) { slowT = 50; ob.passed = true; addPopup(xAt(ob.lane, 0), FLOOR_Y - 40, 'INK SPILL', PURPLE); chain = 0; chainT = 0; continue; } }
        if (!dodged) { ob.passed = true; hit(ob); }
      }
      // Near miss: a blocker slides past in the lane beside you
      if (!ob.near && ob.type === 'block' && !ob.wide && ob.z < 0.3 && ob.z > -0.5 && ob.lane !== player.lane && Math.abs(ob.lane - player.lane) < 1.5 && invuln === 0) {
        ob.near = true;
        nearOnes++; stats.near++;
        award(15 * mult(), xAt(ob.lane, 0), FLOOR_Y - 50, 'CLOSE!', ORANGE);
        sfxNear();
      }
      if (!ob.passed && ob.z < -0.5) {
        ob.passed = true;
        // jump-then-slide combo: a low cleared then a bar cleared within a beat
        if (ob.type === 'high' && frame - lastJump < 110 && lastJump > lastSlide - 200 && lastSlide > lastJump) {
          award(100 * mult(), W / 2, 170, 'JUMP + SLIDE', PINK, true);
          burst(W / 2, 170, 10, PINK, 2, 0.05);
        }
      }
    }

    // Pickups
    for (var k = pickups.length - 1; k >= 0; k--) {
      var pk = pickups[k];
      pk.z -= speed;
      if (magnetT > 0 && pk.kind === 'drop' && pk.z < 6 && pk.z > -0.5) { pk.lane += (px - pk.lane) * 0.25; pk.h += (Math.min(player.h, pk.h) - pk.h) * 0.3; }
      if (pk.z < -1.5) { pickups.splice(k, 1); continue; }
      if (pk.got) continue;
      if (pk.z < 0.8 && pk.z > -0.7 && Math.abs(pk.lane - player.lane) < 0.6 && Math.abs(pk.h - player.h) < 0.85) {
        pk.got = true;
        var sx = xAt(pk.lane, 0), sy = FLOOR_Y - 20 - pk.h * 70;
        if (pk.kind === 'drop') {
          chain++; chainT = 95; drops++;
          if (chain > bestChain) bestChain = chain;
          var m = mult();
          award(10 * m, sx, sy, chain % 5 === 0 ? 'x' + m : '', m > 1 ? YELLOW : '#fff');
          if (chain % 5 === 0 && m > 1) { burst(sx, sy, 8, YELLOW, 2, 0.05); if (m >= 4) sayCallout(); }
          sfxDrop(chain);
          burst(sx, sy, 3, PINK, 1.2, 0.05);
        } else if (pk.kind === 'flash') {
          stats.flash++; chain += 2; chainT = 95;
          award(100 * mult(), sx, sy, 'FLASH SHEET', PINK, true);
          burst(sx, sy, 12, PINK, 2.4, 0.05);
          sfxFlash();
        } else if (pk.kind === 'magnet') {
          magnetT = 420;
          addPopup(sx, sy, 'MACHINE MAGNET', CYAN, true);
          burst(sx, sy, 12, CYAN, 2.4, 0.05);
          sfxPower();
        } else if (pk.kind === 'shield') {
          shieldOn = true;
          addPopup(sx, sy, 'STENCIL SHIELD', CYAN, true);
          burst(sx, sy, 12, CYAN, 2.4, 0.05);
          sfxPower();
        } else if (pk.kind === 'coffee') {
          coffeeT = 300;
          addPopup(sx, sy, 'COFFEE // FULL SPRINT', YELLOW, true);
          burst(sx, sy, 12, '#c9a27a', 2.4, 0.05);
          sfxPower();
          sayCallout('shred-it');
        }
        pickups.splice(k, 1);
      }
    }

    for (var q = popups.length - 1; q >= 0; q--) { popups[q].y -= 0.6; popups[q].life--; if (popups[q].life <= 0) popups.splice(q, 1); }
    for (var r = parts.length - 1; r >= 0; r--) {
      var pt = parts[r];
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.g; pt.life--;
      if (pt.life <= 0) parts.splice(r, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    var c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') { e.preventDefault(); if (e.repeat) return; if (mode === 'play') moveLane(-1); else start(); }
    else if (c === 'ArrowRight' || c === 'KeyD') { e.preventDefault(); if (e.repeat) return; if (mode === 'play') moveLane(1); else start(); }
    else if (c === 'ArrowUp' || c === 'KeyW' || c === 'Space') { e.preventDefault(); if (e.repeat) return; if (mode === 'play') jump(); else start(); }
    else if (c === 'ArrowDown' || c === 'KeyS') { e.preventDefault(); if (e.repeat) return; if (mode === 'play') slide(); else start(); }
  });
  // Touch: swipe for lanes and moves, a tap jumps
  var swX = null, swY = null, swDone = false;
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode !== 'play') { start(); swX = null; return; }
    swX = e.touches[0].clientX; swY = e.touches[0].clientY; swDone = false;
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (swDone || swX === null || !e.touches.length) return;
    var dx = e.touches[0].clientX - swX, dy = e.touches[0].clientY - swY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    swDone = true;
    if (Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
    else if (dy < 0) jump(); else slide();
  }, { passive: false });
  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    if (swX !== null && !swDone) jump();
    swX = null; swDone = false;
  }, { passive: false });
  canvas.addEventListener('click', function(e) {
    if (mode !== 'play') { start(); return; }
    var r = canvas.getBoundingClientRect();
    var tx = (e.clientX - r.left) * (W / r.width);
    if (tx < W * 0.3) moveLane(-1); else if (tx > W * 0.7) moveLane(1); else jump();
  });

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  var wall = window.ArcadeBoard.attach({
    game: 'inkrun', label: 'Ink Run', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'WIPED OUT', again: 'SPACE or TAP to run again',
    levelLabel: function (l) { return 'REACHED ' + zoneDef(l).name + ' // ' + Math.round(dist) + 'M // ' + drops + ' DROPS // BEST CHAIN ' + bestChain; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: zone, meta: { dist: Math.round(dist), drops: drops, chain: bestChain, near: stats.near, flash: stats.flash } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }

  // ── Drawing ──
  // Depth fog: every color that lands on the track is pulled toward the
  // zone's fog color by distance. Mixed once per shade and cached.
  var FOG = 0, FOG_COL = '#000000', mixCache = {};
  function hexToRgb(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(c, f) {
    if (!f || f <= 0.02 || c.charAt(0) !== '#' || c.length !== 7) return c;
    var q = Math.round(f * 20) / 20;
    var key = c + q + FOG_COL;
    var hit = mixCache[key];
    if (hit) return hit;
    var a = hexToRgb(c), b = hexToRgb(FOG_COL);
    var r = 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * q) + ',' + Math.round(a[1] + (b[1] - a[1]) * q) + ',' + Math.round(a[2] + (b[2] - a[2]) * q) + ')';
    mixCache[key] = r;
    return r;
  }
  function shade(c, k) {
    // lighten (k > 0) or darken (k < 0) a hex color
    if (c.charAt(0) !== '#' || c.length !== 7) return c;
    var a = hexToRgb(c);
    var f = function(v) { return Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); };
    return 'rgb(' + f(a[0]) + ',' + f(a[1]) + ',' + f(a[2]) + ')';
  }
  function px(x, y, w, h, c) { ctx.fillStyle = mix(c, FOG); ctx.fillRect(x, y, Math.max(0.5, w), Math.max(0.5, h)); }
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function fillR(x, y, w, h, r, c) { ctx.fillStyle = mix(c, FOG); rrect(x, y, w, h, r); ctx.fill(); }
  // A shaded box in perspective: front face, a lit top, a shadow side that
  // leans toward the vanishing point.
  function box3d(x, y, w, h, depth, c) {
    var side = x < W / 2 ? 1 : -1;      // which side face we see
    var dx = (W / 2 - x) * 0.06 * depth, dy = -depth * 6;
    ctx.fillStyle = mix(shade(c, -0.4), FOG);
    ctx.beginPath(); ctx.moveTo(side > 0 ? x + w : x, y - h); ctx.lineTo((side > 0 ? x + w : x) + dx, y - h + dy); ctx.lineTo((side > 0 ? x + w : x) + dx, y + dy); ctx.lineTo(side > 0 ? x + w : x, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mix(shade(c, 0.22), FOG);
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + dx, y - h + dy); ctx.lineTo(x + w + dx, y - h + dy); ctx.lineTo(x + w, y - h); ctx.closePath(); ctx.fill();
    var g = ctx.createLinearGradient(x, y - h, x, y);
    g.addColorStop(0, mix(shade(c, 0.08), FOG)); g.addColorStop(1, mix(shade(c, -0.18), FOG));
    ctx.fillStyle = g; ctx.fillRect(x, y - h, w, h);
  }
  function softShadow(x, y, rx, ry, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(0,0,0,' + alpha + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow() { ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)'; }

  // ── Backdrops: three parallax layers per zone, each drawn once to an
  // offscreen strip and slid by distance. Falls back to live drawing when
  // there is no offscreen canvas (the headless harness).
  var LAYER_W = W + 200;
  var bgCache = {};
  function layerPainters(zd) {
    var name = zd.name;
    var far = function(c, w) {
      if (name === 'THE MOUNTAIN PASS') {
        c.fillStyle = '#0d1326'; c.beginPath(); c.moveTo(0, HOR + 4);
        for (var m = 0; m <= 10; m++) { var mx = m * (w / 9); c.lineTo(mx, HOR - 26 - ((m * 41) % 40)); c.lineTo(mx + w / 18, HOR - 12 - ((m * 23) % 26)); }
        c.lineTo(w, HOR + 4); c.closePath(); c.fill();
      } else if (name === '16TH STREET' || name === 'THE ALLEY') {
        for (var a = 0; a < w / 46; a++) { var th = 30 + ((a * 37) % 46); c.fillStyle = name === '16TH STREET' ? '#0e1630' : '#0c1016'; c.fillRect(a * 46, HOR - th, 40, th + 4); }
      } else if (name === 'THE SHOP FLOOR') {
        c.fillStyle = '#24122c'; c.fillRect(0, HOR - 60, w, 64);
        for (var s = 0; s < w / 30; s++) c.fillStyle = s % 3 ? '#2c1836' : '#1e1024', c.fillRect(s * 30, HOR - 60, 30, 64);
      } else {
        c.fillStyle = '#2a2010'; c.fillRect(0, HOR - 40, w, 44);
      }
    };
    var mid = function(c, w) {
      if (name === 'THE SHOP FLOOR') {
        for (var a = 0; a < w / 80; a++) { var ax = a * 80; c.fillStyle = '#1a0c20'; c.fillRect(ax + 6, HOR - 44, 62, 48); c.fillStyle = a % 2 ? 'rgba(255,20,147,0.55)' : 'rgba(0,255,255,0.4)'; c.fillRect(ax + 14, HOR - 36, 46, 3); c.fillStyle = '#0d0612'; c.fillRect(ax + 18, HOR - 28, 38, 22); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(ax + 22, HOR - 24, 30, 2); }
      } else if (name === 'THE ALLEY') {
        for (var b = 0; b < w / 80; b++) { var bx = b * 80; c.fillStyle = '#1a1410'; c.fillRect(bx, HOR - 74, 72, 78); for (var wy = 0; wy < 4; wy++) for (var wx = 0; wx < 3; wx++) { c.fillStyle = (b * 7 + wy * 3 + wx) % 4 ? 'rgba(255,220,150,0.28)' : 'rgba(20,20,30,0.6)'; c.fillRect(bx + 8 + wx * 20, HOR - 66 + wy * 16, 9, 9); } c.fillStyle = 'rgba(0,0,0,0.35)'; for (var r = 0; r < 8; r++) c.fillRect(bx, HOR - 74 + r * 10, 72, 1); }
      } else if (name === 'THE FLASH MARKET') {
        for (var t = 0; t < w / 66; t++) { var tx = t * 66; c.fillStyle = t % 2 ? 'rgba(255,20,147,0.5)' : 'rgba(255,215,0,0.45)'; c.beginPath(); c.moveTo(tx, HOR + 2); c.lineTo(tx + 33, HOR - 30); c.lineTo(tx + 66, HOR + 2); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(tx + 33, HOR - 30); c.lineTo(tx + 66, HOR + 2); c.lineTo(tx + 33, HOR + 2); c.closePath(); c.fill(); }
      } else if (name === '16TH STREET') {
        for (var k = 0; k < w / 70; k++) { var kx = k * 70; var kh = 56 + ((k * 31) % 44); c.fillStyle = '#121a30'; c.fillRect(kx + 8, HOR - kh, 54, kh + 4); for (var y2 = 0; y2 < kh / 10; y2++) for (var x2 = 0; x2 < 3; x2++) { c.fillStyle = (k * 5 + y2 * 2 + x2) % 3 ? 'rgba(0,255,255,0.5)' : 'rgba(255,255,255,0.08)'; c.fillRect(kx + 14 + x2 * 15, HOR - kh + 6 + y2 * 10, 7, 5); } }
      } else {
        c.fillStyle = '#161c2c'; c.beginPath(); c.moveTo(0, HOR + 4);
        for (var m2 = 0; m2 <= 8; m2++) { var mx2 = m2 * (w / 7); c.lineTo(mx2, HOR - 40 - ((m2 * 29) % 30)); c.lineTo(mx2 + w / 14, HOR - 8); }
        c.lineTo(w, HOR + 4); c.closePath(); c.fill();
        c.fillStyle = 'rgba(232,238,245,0.85)';
        for (var m3 = 0; m3 <= 8; m3++) { var mx3 = m3 * (w / 7); c.beginPath(); c.moveTo(mx3 - 6, HOR - 34 - ((m3 * 29) % 30)); c.lineTo(mx3, HOR - 40 - ((m3 * 29) % 30)); c.lineTo(mx3 + 6, HOR - 34 - ((m3 * 29) % 30)); c.closePath(); c.fill(); }
      }
    };
    return [{ speed: 0.06, paint: far }, { speed: 0.16, paint: mid }];
  }
  function layersFor(zd) {
    var key = zd.name;
    if (bgCache[key] !== undefined) return bgCache[key];
    var painters = layerPainters(zd);
    var out = [];
    for (var i = 0; i < painters.length; i++) {
      var o = offscreen(LAYER_W * 2, (HOR + 8) * 2);
      if (!o) { bgCache[key] = null; return null; }
      o.x.setTransform(2, 0, 0, 2, 0, 0);
      painters[i].paint(o.x, LAYER_W);
      out.push({ speed: painters[i].speed, c: o.c });
    }
    bgCache[key] = out;
    return out;
  }

  // Weather and life in the backdrop: rain, snow, a tram, a moon
  var rain = [], snow = [], tramX = -200, tramT = 0;
  function weatherTick(zd) {
    if (zd.name === 'THE ALLEY') {
      while (rain.length < 70) rain.push({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 4, l: 8 + Math.random() * 8 });
      for (var i = 0; i < rain.length; i++) { var r = rain[i]; r.y += r.v; r.x -= 1.2; if (r.y > FLOOR_Y + 10) { r.y = -10 - Math.random() * 40; r.x = Math.random() * (W + 60); if (parts.length < 120) parts.push({ x: r.x, y: FLOOR_Y + 4 + Math.random() * 8, vx: 0, vy: 0, life: 10, color: 'rgba(200,220,255,0.5)', s: 1, g: 0, ring: true }); } }
    } else rain.length = 0;
    if (zd.name === 'THE MOUNTAIN PASS') {
      while (snow.length < 50) snow.push({ x: Math.random() * W, y: Math.random() * H, v: 0.5 + Math.random() * 0.8, w: Math.random() * 6, s: 1 + Math.random() * 1.5 });
      for (var j = 0; j < snow.length; j++) { var f = snow[j]; f.y += f.v; f.x += Math.sin((frame + f.w * 30) * 0.03) * 0.4; if (f.y > H) { f.y = -4; f.x = Math.random() * W; } }
    } else snow.length = 0;
    if (zd.name === '16TH STREET') { tramT++; if (tramT > 420) { tramT = 0; tramX = -220; } if (tramX < W + 220) tramX += 2.4; }
  }

  function drawBackdrop(zd) {
    var g = ctx.createLinearGradient(0, 0, 0, HOR + 30);
    g.addColorStop(0, zd.sky[0]); g.addColorStop(1, zd.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HOR + 30);
    if (zd.stars) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (var i = 0; i < stars.length; i++) { if ((frame + i * 7) % 90 < 80) ctx.fillRect(stars[i].x, stars[i].y, stars[i].s, stars[i].s); }
      // the moon, with a real halo
      ctx.save(); glow('rgba(220,230,255,0.9)', 22); ctx.fillStyle = '#e8eefc'; ctx.beginPath(); ctx.arc(W - 82, 36, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = 'rgba(200,210,230,0.35)'; ctx.beginPath(); ctx.arc(W - 78, 33, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W - 87, 40, 2, 0, Math.PI * 2); ctx.fill();
    }
    var layers = layersFor(zd);
    if (layers) {
      ctx.globalAlpha = 0.55;
      for (var l = 0; l < layers.length; l++) {
        var off = (dist * layers[l].speed * 10) % LAYER_W;
        ctx.drawImage(layers[l].c, -off, 0, LAYER_W, HOR + 8);
        ctx.drawImage(layers[l].c, LAYER_W - off, 0, LAYER_W, HOR + 8);
      }
      ctx.globalAlpha = 1;
    } else {
      // no offscreen canvas here: paint the mid layer live
      layerPainters(zd)[1].paint(ctx, W);
    }
    // the mall tram slides through the skyline with its windows lit
    if (zd.name === '16TH STREET' && tramX < W + 220) {
      var ty = HOR - 22;
      ctx.fillStyle = '#c8d0d8'; rrect(tramX, ty, 200, 20, 4); ctx.fill();
      ctx.fillStyle = PINK; ctx.fillRect(tramX, ty + 12, 200, 2);
      ctx.save(); glow('rgba(255,230,150,0.8)', 6); ctx.fillStyle = '#ffe9a0';
      for (var wv = 0; wv < 9; wv++) ctx.fillRect(tramX + 8 + wv * 21, ty + 4, 14, 7);
      ctx.restore();
    }
    // light shafts in the shop: slow diagonal beams from the ceiling lights
    if (zd.name === 'THE SHOP FLOOR') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var s = 0; s < Math.round(3 * WS); s++) {
        var sx = (60 + s * 140) + Math.sin(frame * 0.01 + s) * 8;
        var sg = ctx.createLinearGradient(sx, 0, sx + 30, HOR + 60);
        sg.addColorStop(0, 'rgba(255,120,200,0.07)'); sg.addColorStop(1, 'rgba(255,120,200,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(sx - 10, 0); ctx.lineTo(sx + 26, 0); ctx.lineTo(sx + 90, HOR + 70); ctx.lineTo(sx - 40, HOR + 70); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // Fog band on the horizon
    var fg = ctx.createLinearGradient(0, HOR - 18, 0, HOR + 30);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.55, zd.fog); fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, HOR - 18, W, 48);
  }

  function drawFloor(zd) {
    ctx.fillStyle = zd.floor[0];
    ctx.fillRect(0, HOR, W, H - HOR);
    // depth bands, fogged toward the horizon
    for (var z = Z_FAR; z > -2; z -= 2) {
      var zz = z - (floorOff % 4) + 2;
      var y1 = yAt(zz), y2 = yAt(zz - 2);
      if (y2 < y1) continue;
      var tone = Math.floor((z + 100) / 2) % 2 === 0;
      var f = Math.max(0, Math.min(0.9, (1 - scaleAt(zz)) * 1.15 - 0.05));
      FOG_COL = zd.fog;
      ctx.fillStyle = mix(tone ? zd.floor[1] : zd.floor[0], f);
      ctx.beginPath();
      ctx.moveTo(xAt(-1.5, zz), y1); ctx.lineTo(xAt(1.5, zz), y1);
      ctx.lineTo(xAt(1.5, zz - 2), y2); ctx.lineTo(xAt(-1.5, zz - 2), y2);
      ctx.closePath(); ctx.fill();
    }
    // wet floor: the sky's lights smear down the track in the alley
    if (zd.name === 'THE ALLEY' || zd.name === '16TH STREET') {
      var wg = ctx.createLinearGradient(0, HOR, 0, FLOOR_Y);
      wg.addColorStop(0, zd.name === 'THE ALLEY' ? 'rgba(255,220,150,0.16)' : 'rgba(0,255,255,0.12)'); wg.addColorStop(0.5, 'rgba(255,255,255,0.03)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(xAt(-1.5, Z_FAR), HOR); ctx.lineTo(xAt(1.5, Z_FAR), HOR); ctx.lineTo(xAt(1.5, -1), H); ctx.lineTo(xAt(-1.5, -1), H); ctx.closePath(); ctx.fill();
    }
    // a quiet overhead sheen near the player, nothing busy up the track
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var sgg = ctx.createRadialGradient(W / 2, FLOOR_Y - 20, 0, W / 2, FLOOR_Y - 20, LANE_W * 1.8);
    sgg.addColorStop(0, 'rgba(255,255,255,0.05)'); sgg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sgg; ctx.fillRect(0, HOR, W, H - HOR);
    ctx.restore();
    // lane edges with a faint glow in the zone color
    ctx.save(); ctx.strokeStyle = zd.line; ctx.lineWidth = 1.2; glow(zd.line, 4);
    for (var l = -1.5; l <= 1.5; l += 1) {
      ctx.beginPath(); ctx.moveTo(xAt(l, Z_FAR), yAt(Z_FAR)); ctx.lineTo(xAt(l, -1), yAt(-1)); ctx.stroke();
    }
    ctx.restore();
    // lane dashes down the middle lanes
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (var d = Z_FAR; d > 0; d -= 4) {
      var dz = d - (floorOff % 4);
      var dy1 = yAt(dz), dy2 = yAt(dz - 1.4);
      if (dy2 <= dy1) continue;
      [-0.5, 0.5].forEach(function(lx) { ctx.fillRect(xAt(lx, dz) - 0.6, dy1, 1.2, dy2 - dy1); });
    }
    // shoulders
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.moveTo(0, HOR); ctx.lineTo(xAt(-1.5, Z_FAR), yAt(Z_FAR)); ctx.lineTo(xAt(-1.5, -1), H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, HOR); ctx.lineTo(xAt(1.5, Z_FAR), yAt(Z_FAR)); ctx.lineTo(xAt(1.5, -1), H); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function setFog(z, zd) { FOG_COL = zd.fog; FOG = Math.max(0, Math.min(0.85, (1 - scaleAt(z)) * 1.05 - 0.12)); }

  function drawProp(p, zd) {
    var s = scaleAt(p.z);
    if (s < 0.1) return;
    setFog(p.z, zd);
    var x = xAt(p.side * 1.95, p.z), y = yAt(p.z);
    var u = 60 * s * WS;
    var k = p.kind;
    ctx.globalAlpha = Math.min(0.7, s * 2.2);
    softShadow(x, y, u * 0.6, u * 0.16, 0.3);
    if (k === 'chair') { box3d(x - u * 0.3, y, u * 0.6, u * 0.5, s, '#3a3a48'); px(x - u * 0.3, y - u * 0.95, u * 0.14, u * 0.5, '#2a2a36'); fillR(x - u * 0.28, y - u * 0.62, u * 0.56, u * 0.14, u * 0.05, PINK); }
    else if (k === 'station') { box3d(x - u * 0.35, y, u * 0.7, u * 0.7, s, '#2e2e3c'); px(x - u * 0.3, y - u * 0.65, u * 0.6, u * 0.28, '#0a0a10'); ctx.save(); glow(CYAN, 6 * s); px(x - u * 0.2, y - u * 0.6, u * 0.4, u * 0.14, CYAN); ctx.restore(); }
    else if (k === 'neon') { px(x - u * 0.05, y - u * 1.4, u * 0.1, u * 1.4, '#222'); px(x - u * 0.42, y - u * 1.52, u * 0.84, u * 0.38, '#0a0a10'); var on = (frame % 47 < 41); ctx.save(); if (on) glow(PINK, 10 * s); px(x - u * 0.34, y - u * 1.44, u * 0.68, u * 0.22, on ? PINK : '#601040'); ctx.restore(); if (on) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; var ng = ctx.createRadialGradient(x, y - u * 1.3, 0, x, y - u * 1.3, u * 1.2); ng.addColorStop(0, 'rgba(255,20,147,0.22)'); ng.addColorStop(1, 'rgba(255,20,147,0)'); ctx.fillStyle = ng; ctx.fillRect(x - u * 1.2, y - u * 2.5, u * 2.4, u * 2.6); ctx.restore(); } }
    else if (k === 'brick') { px(x - u * 0.5, y - u * 1.6, u * 1.0, u * 1.6, '#3a2620'); for (var r = 0; r < 6; r++) px(x - u * 0.5 + ((r % 2) * u * 0.12), y - u * 1.5 + r * u * 0.25, u * 0.9, u * 0.05, '#221510'); px(x - u * 0.5, y - u * 1.6, u * 0.08, u * 1.6, '#4a3228'); }
    else if (k === 'dumpsterprop') { box3d(x - u * 0.45, y, u * 0.9, u * 0.6, s, '#2f4f2f'); px(x - u * 0.47, y - u * 0.7, u * 0.94, u * 0.14, '#3f6f3f'); }
    else if (k === 'escape') { px(x - u * 0.5, y - u * 1.6, u * 1.0, u * 1.6, '#2a1c18'); for (var e = 0; e < 3; e++) { px(x - u * 0.45, y - u * 1.4 + e * u * 0.45, u * 0.9, u * 0.05, '#666'); px(x - u * 0.45, y - u * 1.5 + e * u * 0.45, u * 0.04, u * 0.15, '#666'); px(x + u * 0.41, y - u * 1.5 + e * u * 0.45, u * 0.04, u * 0.15, '#666'); } }
    else if (k === 'tent') { ctx.fillStyle = mix(p.side < 0 ? '#e0107f' : '#e0b800', FOG); ctx.beginPath(); ctx.moveTo(x - u * 0.6, y - u * 0.6); ctx.lineTo(x, y - u * 1.2); ctx.lineTo(x + u * 0.6, y - u * 0.6); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(x, y - u * 1.2); ctx.lineTo(x + u * 0.6, y - u * 0.6); ctx.lineTo(x, y - u * 0.6); ctx.closePath(); ctx.fill(); px(x - u * 0.55, y - u * 0.6, u * 0.06, u * 0.6, '#ddd'); px(x + u * 0.49, y - u * 0.6, u * 0.06, u * 0.6, '#ddd'); }
    else if (k === 'table') { box3d(x - u * 0.4, y - u * 0.35, u * 0.8, u * 0.1, s, '#8b5a2b'); px(x - u * 0.35, y - u * 0.35, u * 0.06, u * 0.35, '#5b3a1b'); px(x + u * 0.29, y - u * 0.35, u * 0.06, u * 0.35, '#5b3a1b'); px(x - u * 0.3, y - u * 0.55, u * 0.25, u * 0.1, '#fff'); px(x + u * 0.02, y - u * 0.55, u * 0.25, u * 0.1, '#fff'); }
    else if (k === 'lamp') { px(x - u * 0.04, y - u * 1.8, u * 0.08, u * 1.8, '#333'); px(x - u * 0.16, y - u * 1.9, u * 0.32, u * 0.16, '#222'); ctx.save(); glow('#ffe9a0', 8 * s); px(x - u * 0.12, y - u * 1.86, u * 0.24, u * 0.08, '#ffe9a0'); ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; var lg = ctx.createLinearGradient(x, y - u * 1.8, x, y); lg.addColorStop(0, 'rgba(255,233,160,' + Math.min(0.28, s * 0.35) + ')'); lg.addColorStop(1, 'rgba(255,233,160,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x, y - u * 1.8); ctx.lineTo(x - u * 0.8, y + u * 0.1); ctx.lineTo(x + u * 0.8, y + u * 0.1); ctx.closePath(); ctx.fill(); ctx.restore(); }
    else if (k === 'tower') { var th = u * (1.6 + (p.z * 7 % 5) * 0.2); box3d(x - u * 0.45, y, u * 0.9, th, s * 0.6, '#141a2a'); for (var wy = 0; wy < th / (u * 0.25); wy++) for (var wx = 0; wx < 3; wx++) if ((wy * 3 + wx + Math.floor(p.z)) % 3 !== 0) px(x - u * 0.38 + wx * u * 0.28, y - th + u * 0.1 + wy * u * 0.25, u * 0.16, u * 0.14, '#3fd8e8'); }
    else if (k === 'pine') { for (var t = 0; t < 3; t++) { ctx.fillStyle = mix(t % 2 ? '#0f2e1a' : '#123822', FOG); ctx.beginPath(); ctx.moveTo(x - u * (0.55 - t * 0.12), y - u * (0.2 + t * 0.4)); ctx.lineTo(x, y - u * (0.9 + t * 0.4)); ctx.lineTo(x + u * (0.55 - t * 0.12), y - u * (0.2 + t * 0.4)); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(232,238,245,0.5)'; ctx.beginPath(); ctx.moveTo(x - u * 0.12, y - u * (0.66 + t * 0.4)); ctx.lineTo(x, y - u * (0.9 + t * 0.4)); ctx.lineTo(x + u * 0.12, y - u * (0.66 + t * 0.4)); ctx.closePath(); ctx.fill(); } px(x - u * 0.06, y - u * 0.25, u * 0.12, u * 0.25, '#2a1a10'); }
    else if (k === 'peak') { ctx.fillStyle = mix('#1c2230', FOG); ctx.beginPath(); ctx.moveTo(x - u * 1.2, y); ctx.lineTo(x, y - u * 1.6); ctx.lineTo(x + u * 1.2, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = mix('#e8eef5', FOG); ctx.beginPath(); ctx.moveTo(x - u * 0.3, y - u * 1.2); ctx.lineTo(x, y - u * 1.6); ctx.lineTo(x + u * 0.3, y - u * 1.2); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;
    FOG = 0;
  }

  // ── Hazards: three classes, three languages ──
  // JUMP (low): wide, floor-colored, a bright yellow top edge, a yellow up
  // arrow floating over it. SLIDE (high): a bar on posts across the lanes,
  // cyan glow, a cyan down arrow. BLOCK: tall, solid, red-lit, a red X.
  // The icon and a lane stripe show up the moment a thing spawns.
  var CLS = { low: { col: YELLOW, dark: '#8a7000' }, spill: { col: YELLOW, dark: '#8a7000' }, high: { col: CYAN, dark: '#007a80' }, block: { col: '#ff3b3b', dark: '#8a0a0a' } };
  function laneStripe(ob) {
    if (ob.z < 0) return;
    var c = CLS[ob.type] || CLS.low;
    var zFar = ob.z, zNear = Math.max(0, ob.z - 9);
    var l0 = ob.wide ? -1.45 : ob.lane - 0.42, l1 = ob.wide ? 1.45 : ob.lane + 0.42;
    var a = 0.16 + 0.22 * scaleAt(ob.z);
    var g = ctx.createLinearGradient(0, yAt(zFar), 0, yAt(zNear));
    g.addColorStop(0, c.col.replace(')', '') === c.col ? hexA(c.col, a) : c.col); g.addColorStop(1, hexA(c.col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(xAt(l0, zFar), yAt(zFar)); ctx.lineTo(xAt(l1, zFar), yAt(zFar)); ctx.lineTo(xAt(l1, zNear), yAt(zNear)); ctx.lineTo(xAt(l0, zNear), yAt(zNear)); ctx.closePath(); ctx.fill();
  }
  function hexA(c, a) { var r = hexToRgb(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function outline(x, y, w, h, r) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; rrect(x, y, w, h, r); ctx.stroke(); }
  function drawIcon(type, x, y, s) {
    var c = CLS[type] || CLS.low;
    var sz = 7 + 20 * Math.min(1, s * 1.4);
    var bob = Math.sin(frame * 0.15) * 2;
    y += bob;
    ctx.save(); glow(c.col, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x, y, sz * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.col;
    if (type === 'low' || type === 'spill') { ctx.beginPath(); ctx.moveTo(x, y - sz * 0.5); ctx.lineTo(x + sz * 0.42, y + sz * 0.1); ctx.lineTo(x + sz * 0.16, y + sz * 0.1); ctx.lineTo(x + sz * 0.16, y + sz * 0.5); ctx.lineTo(x - sz * 0.16, y + sz * 0.5); ctx.lineTo(x - sz * 0.16, y + sz * 0.1); ctx.lineTo(x - sz * 0.42, y + sz * 0.1); ctx.closePath(); ctx.fill(); }
    else if (type === 'high') { ctx.beginPath(); ctx.moveTo(x, y + sz * 0.5); ctx.lineTo(x + sz * 0.42, y - sz * 0.1); ctx.lineTo(x + sz * 0.16, y - sz * 0.1); ctx.lineTo(x + sz * 0.16, y - sz * 0.5); ctx.lineTo(x - sz * 0.16, y - sz * 0.5); ctx.lineTo(x - sz * 0.16, y - sz * 0.1); ctx.lineTo(x - sz * 0.42, y - sz * 0.1); ctx.closePath(); ctx.fill(); }
    else { ctx.strokeStyle = c.col; ctx.lineWidth = Math.max(2, sz * 0.2); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - sz * 0.38, y - sz * 0.38); ctx.lineTo(x + sz * 0.38, y + sz * 0.38); ctx.moveTo(x + sz * 0.38, y - sz * 0.38); ctx.lineTo(x - sz * 0.38, y + sz * 0.38); ctx.stroke(); }
    ctx.restore();
  }
  function drawObstacle(ob, zd) {
    var s = scaleAt(ob.z);
    if (s < 0.06) return;
    setFog(ob.z, zd);
    FOG *= 0.6; // hazards stay readable further out than scenery
    var y = yAt(ob.z), u = 80 * s * WS;
    var x = xAt(ob.lane, ob.z);
    var c = CLS[ob.type] || CLS.low;
    ctx.globalAlpha = Math.min(1, s * 5);
    if (ob.type !== 'spill') softShadow(x, y, ob.wide ? LANE_W * 1.5 * s + 20 : u * 0.6, u * 0.14, 0.55);
    var k = ob.kind, iconY;
    if (ob.type === 'high') {
      var x0 = xAt(-1.5, ob.z), x1 = xAt(1.5, ob.z), top = y - u * 0.95, barH = u * 0.16;
      // posts
      px(x0 - u * 0.12, top - barH, u * 0.12, u * 0.95 + barH, '#3a3a44'); px(x1, top - barH, u * 0.12, u * 0.95 + barH, '#3a3a44');
      outline(x0 - u * 0.12, top - barH, u * 0.12, u * 0.95 + barH, 1); outline(x1, top - barH, u * 0.12, u * 0.95 + barH, 1);
      // the bar itself: cyan, glowing
      ctx.save(); glow(CYAN, 12 * Math.min(1, s * 2));
      fillR(x0 - u * 0.12, top - barH, x1 - x0 + u * 0.24, barH, barH * 0.3, k === 'tentbar' ? '#e8fbff' : CYAN);
      ctx.restore();
      outline(x0 - u * 0.12, top - barH, x1 - x0 + u * 0.24, barH, barH * 0.3);
      if (k === 'sign') { ctx.fillStyle = '#062a2e'; ctx.font = 'bold ' + Math.max(6, barH * 0.8) + 'px monospace'; ctx.textAlign = 'center'; ctx.fillText('OPEN', (x0 + x1) / 2, top - barH * 0.2); }
      else if (k === 'tentbar') { for (var f = 0; f < 8; f++) px(x0 + f * (x1 - x0) / 8, top - barH * 0.9, (x1 - x0) / 16, barH * 0.8, f % 2 ? CYAN : '#bff'); }
      else if (k === 'tunnel') { px(x0 - u * 0.12, top - barH - u * 0.3, x1 - x0 + u * 0.24, u * 0.3, '#2a2a34'); outline(x0 - u * 0.12, top - barH - u * 0.3, x1 - x0 + u * 0.24, u * 0.3, 1); }
      px(x0, top - barH * 0.35, x1 - x0, 1.5, '#fff');
      iconY = top - barH - u * 0.32;
      drawIcon('high', (x0 + x1) / 2, iconY, s);
    } else if (ob.type === 'low' || ob.type === 'spill') {
      var bw = u * 0.96, bh = ob.type === 'spill' ? u * 0.08 : (k === 'dog' ? u * 0.34 : u * 0.42);
      var bx = x - bw / 2, by = y - bh;
      if (ob.type === 'spill') {
        var pg = ctx.createRadialGradient(x, y, 0, x, y, bw * 0.5);
        pg.addColorStop(0, 'rgba(176,38,255,0.9)'); pg.addColorStop(1, 'rgba(176,38,255,0.35)');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(x, y - 1, bw * 0.5, u * 0.16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = YELLOW; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 1, bw * 0.5, u * 0.16, 0, Math.PI, Math.PI * 2); ctx.stroke();
      } else {
        // the body: floor-colored, lit top edge in yellow
        var body = k === 'dog' ? '#7a5230' : k === 'rock' ? '#4e525e' : k === 'rail' ? '#8a909a' : '#3a3550';
        fillR(bx, by, bw, bh, u * 0.05, body);
        ctx.fillStyle = mix(shade(body, -0.35), FOG); ctx.fillRect(bx, by + bh * 0.6, bw, bh * 0.4);
        ctx.save(); glow(YELLOW, 8 * Math.min(1, s * 2)); px(bx, by, bw, Math.max(2, u * 0.06), YELLOW); ctx.restore();
        outline(bx, by, bw, bh, u * 0.05);
        // the thing it actually is
        if (k === 'cart') {
          px(bx + bw * 0.06, by + bh * 0.2, bw * 0.88, bh * 0.35, '#c8c8d2'); px(bx + bw * 0.1, by + bh * 0.25, bw * 0.3, bh * 0.2, PINK); px(bx + bw * 0.6, by + bh * 0.25, bw * 0.3, bh * 0.2, CYAN);
          ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(bx + bw * 0.22, y, u * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(bx + bw * 0.78, y, u * 0.09, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(bx + bw * 0.22, y, u * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(bx + bw * 0.78, y, u * 0.04, 0, Math.PI * 2); ctx.fill();
          px(bx + bw * 0.9, by - bh * 0.4, u * 0.05, bh * 0.45, '#ccc');
        } else if (k === 'rack') {
          for (var r = 0; r < 4; r++) { px(bx + bw * (0.1 + r * 0.21), by + bh * 0.15, bw * 0.16, bh * 0.7, r % 2 ? '#fff' : '#f4e8d0'); px(bx + bw * (0.13 + r * 0.21), by + bh * 0.3, bw * 0.1, bh * 0.3, r % 2 ? PINK : CYAN); }
        } else if (k === 'dog') {
          fillR(bx + bw * 0.62, by - bh * 0.35, bw * 0.3, bh * 0.6, u * 0.06, '#8a6040'); px(bx + bw * 0.86, by - bh * 0.15, u * 0.05, u * 0.05, '#000'); px(bx + bw * 0.66, by - bh * 0.5, bw * 0.1, bh * 0.3, '#5a3a20');
          px(bx - bw * 0.06, by + bh * 0.3, bw * 0.12, bh * 0.15, '#7a5230');
          if (frame % 60 < 30) { ctx.fillStyle = '#fff'; ctx.font = Math.max(7, u * 0.18) + 'px monospace'; ctx.textAlign = 'left'; ctx.fillText('z', bx + bw * 0.95, by - bh * 0.5); }
        } else if (k === 'table') {
          px(bx + bw * 0.1, by + bh * 0.25, bw * 0.3, bh * 0.35, '#fff'); px(bx + bw * 0.55, by + bh * 0.25, bw * 0.3, bh * 0.35, '#fff'); px(bx + bw * 0.15, by + bh * 0.32, bw * 0.2, bh * 0.2, PINK); px(bx + bw * 0.6, by + bh * 0.32, bw * 0.2, bh * 0.2, CYAN);
        } else if (k === 'bench') {
          for (var bb = 0; bb < 3; bb++) px(bx + bw * 0.05, by + bh * (0.2 + bb * 0.25), bw * 0.9, bh * 0.12, '#5a7a4a');
        } else if (k === 'rail') {
          px(bx + bw * 0.1, by + bh * 0.25, bw * 0.06, bh * 0.75, '#555'); px(bx + bw * 0.84, by + bh * 0.25, bw * 0.06, bh * 0.75, '#555'); px(bx, by + bh * 0.3, bw, bh * 0.14, '#c0c8d0');
        } else if (k === 'rock') {
          ctx.fillStyle = mix('#767a88', FOG); ctx.beginPath(); ctx.moveTo(bx + bw * 0.2, by + bh * 0.1); ctx.lineTo(bx + bw * 0.5, by + bh * 0.05); ctx.lineTo(bx + bw * 0.4, by + bh * 0.5); ctx.closePath(); ctx.fill();
        }
      }
      iconY = y - bh - u * 0.42;
      drawIcon(ob.type, x, iconY, s);
    } else {
      // BLOCK: tall and solid, red rim light, a red X over the top
      var tw = u * 0.78, th = k === 'tram' ? u * 1.25 : u * 1.1;
      var tx = x - tw / 2, ty = y - th;
      var base = k === 'chairblock' ? '#2a2a38' : k === 'client' ? (ob.id > 0.5 ? '#2c3e50' : '#6a1b9a') : k === 'dumpster' ? '#2f4f2f' : k === 'tram' ? '#c0c8d0' : '#4e525e';
      // red light pool on the floor
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; var rg = ctx.createRadialGradient(x, y, 0, x, y, u * 0.9); rg.addColorStop(0, 'rgba(255,40,40,0.35)'); rg.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(x, y, u * 0.9, u * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (k === 'chairblock') {
        fillR(tx, ty + th * 0.55, tw, th * 0.45, u * 0.05, base); fillR(tx + tw * 0.12, ty, tw * 0.22, th * 0.6, u * 0.04, '#22222c');
        fillR(tx - tw * 0.05, ty + th * 0.5, tw * 1.1, th * 0.16, u * 0.05, PINK); fillR(tx + tw * 0.08, ty - th * 0.04, tw * 0.6, th * 0.16, u * 0.05, PINK);
        outline(tx, ty + th * 0.55, tw, th * 0.45, u * 0.05); outline(tx + tw * 0.12, ty, tw * 0.22, th * 0.6, u * 0.04); outline(tx - tw * 0.05, ty + th * 0.5, tw * 1.1, th * 0.16, u * 0.05); outline(tx + tw * 0.08, ty - th * 0.04, tw * 0.6, th * 0.16, u * 0.05);
      } else if (k === 'client') {
        fillR(tx + tw * 0.15, ty + th * 0.3, tw * 0.7, th * 0.7, u * 0.06, base); fillR(tx + tw * 0.28, ty + th * 0.04, tw * 0.44, th * 0.3, u * 0.08, '#e8b894'); fillR(tx + tw * 0.24, ty - th * 0.04, tw * 0.52, th * 0.14, u * 0.05, ob.id > 0.5 ? '#222' : PINK);
        px(tx + tw * 0.02, ty + th * 0.36, tw * 0.13, th * 0.42, '#e8b894'); px(tx + tw * 0.85, ty + th * 0.36, tw * 0.13, th * 0.42, '#e8b894');
        outline(tx + tw * 0.15, ty + th * 0.3, tw * 0.7, th * 0.7, u * 0.06); outline(tx + tw * 0.28, ty + th * 0.04, tw * 0.44, th * 0.3, u * 0.08);
      } else if (k === 'tram') {
        fillR(tx - tw * 0.1, ty, tw * 1.2, th, u * 0.05, base); px(tx - tw * 0.05, ty + th * 0.12, tw * 1.1, th * 0.34, '#101a34'); ctx.save(); glow('#ffe9a0', 6); px(tx, ty + th * 0.17, tw, th * 0.22, '#ffe9a0'); ctx.restore(); px(tx - tw * 0.1, ty + th * 0.55, tw * 1.2, th * 0.08, PINK);
        outline(tx - tw * 0.1, ty, tw * 1.2, th, u * 0.05);
      } else if (k === 'boulder') {
        ctx.fillStyle = mix(base, FOG); ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + tw * 0.1, ty + th * 0.4); ctx.lineTo(tx + tw * 0.45, ty); ctx.lineTo(tx + tw * 0.85, ty + th * 0.25); ctx.lineTo(tx + tw, y - th * 0.15); ctx.lineTo(tx + tw * 0.9, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = mix('#767a88', FOG); ctx.beginPath(); ctx.moveTo(tx + tw * 0.1, ty + th * 0.4); ctx.lineTo(tx + tw * 0.45, ty); ctx.lineTo(tx + tw * 0.5, ty + th * 0.4); ctx.closePath(); ctx.fill();
      } else {
        fillR(tx, ty, tw, th, u * 0.05, base); px(tx - tw * 0.03, ty - th * 0.06, tw * 1.06, th * 0.14, shade(base, 0.25)); px(tx + tw * 0.15, ty + th * 0.4, tw * 0.35, th * 0.15, '#fff');
        outline(tx, ty, tw, th, u * 0.05);
      }
      // red rim light
      ctx.save(); glow('#ff3b3b', 10 * Math.min(1, s * 2)); px(tx + tw * (k === 'tram' ? 1.05 : 0.95), ty, Math.max(2, u * 0.05), th, '#ff3b3b'); ctx.restore();
      iconY = ty - u * 0.34;
      drawIcon('block', x, iconY, s);
    }
    ctx.globalAlpha = 1;
    FOG = 0;
  }

  function drawPickup(pk, zd) {
    var s = scaleAt(pk.z);
    if (s < 0.08) return;
    setFog(pk.z, zd);
    var y = yAt(pk.z) - pk.h * 70 * s - 10 * s, u = 60 * s;
    var x = xAt(pk.lane, pk.z);
    var bob = Math.sin(frame * 0.2 + pk.z) * 2 * s;
    var spin = Math.cos(frame * 0.12 + pk.z * 0.7);   // width squeeze = spinning
    ctx.globalAlpha = Math.min(1, s * 4);
    softShadow(x, yAt(pk.z), u * 0.2, u * 0.06, 0.3 - pk.h * 0.1);
    y += bob;
    ctx.save();
    ctx.translate(x, y); ctx.scale(Math.max(0.15, Math.abs(spin)), 1); ctx.translate(-x, -y);
    if (pk.kind === 'drop') {
      ctx.save(); glow(PINK, 6 * s);
      ctx.fillStyle = mix(PINK, FOG);
      ctx.beginPath(); ctx.moveTo(x, y - u * 0.34); ctx.quadraticCurveTo(x + u * 0.22, y - u * 0.05, x, y + u * 0.06); ctx.quadraticCurveTo(x - u * 0.22, y - u * 0.05, x, y - u * 0.34); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(x - u * 0.06, y - u * 0.16, u * 0.04, u * 0.07, -0.4, 0, Math.PI * 2); ctx.fill();
    } else if (pk.kind === 'flash') {
      fillR(x - u * 0.24, y - u * 0.34, u * 0.48, u * 0.4, u * 0.03, '#f4e8d0'); px(x - u * 0.16, y - u * 0.26, u * 0.32, u * 0.22, pk.z % 2 < 1 ? PINK : CYAN); px(x - u * 0.03, y - u * 0.38, u * 0.06, u * 0.06, '#c00');
    } else if (pk.kind === 'magnet') {
      px(x - u * 0.22, y - u * 0.3, u * 0.44, u * 0.14, '#333'); px(x - u * 0.06, y - u * 0.4, u * 0.12, u * 0.36, '#555'); px(x - u * 0.2, y - u * 0.2, u * 0.1, u * 0.12, '#c8722a'); px(x + u * 0.1, y - u * 0.2, u * 0.1, u * 0.12, '#c8722a'); px(x - u * 0.02, y - u * 0.04, u * 0.04, u * 0.14, '#ddd');
    } else if (pk.kind === 'shield') {
      ctx.fillStyle = 'rgba(0,255,255,0.3)'; rrect(x - u * 0.24, y - u * 0.36, u * 0.48, u * 0.42, u * 0.06); ctx.fill(); ctx.strokeStyle = CYAN; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - u * 0.15, u * 0.1, 0, Math.PI * 2); ctx.stroke();
    } else if (pk.kind === 'coffee') {
      fillR(x - u * 0.16, y - u * 0.3, u * 0.32, u * 0.34, u * 0.04, '#fff'); px(x - u * 0.16, y - u * 0.3, u * 0.32, u * 0.08, '#8b5a2b'); fillR(x + u * 0.14, y - u * 0.22, u * 0.1, u * 0.16, u * 0.04, '#fff'); px(x - u * 0.1, y - u * 0.2, u * 0.2, u * 0.06, PINK);
      if (frame % 20 < 10) px(x - u * 0.04, y - u * 0.42, u * 0.04, u * 0.08, 'rgba(255,255,255,0.5)');
    }
    ctx.restore();
    // the glint: a sparkle that orbits as it spins
    if (pk.kind !== 'drop' || (frame + Math.floor(pk.z * 10)) % 40 < 8) {
      var gx = x + spin * u * 0.22, gy = y - u * 0.3 + Math.sin(frame * 0.12 + pk.z) * u * 0.1;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(gx - u * 0.06, gy - 0.6, u * 0.12, 1.2); ctx.fillRect(gx - 0.6, gy - u * 0.06, 1.2, u * 0.12);
    }
    ctx.globalAlpha = 1;
    FOG = 0;
  }

  // The runner, from behind: an 8-frame cycle sampled from a continuous phase,
  // shaded shapes, a cap, the machine cord trailing, folds in the tee.
  function drawRunner() {
    if (WS !== 1) { ctx.save(); ctx.translate(xAt(player.x, 0), FLOOR_Y); ctx.scale(WS, WS); ctx.translate(-xAt(player.x, 0), -FLOOR_Y); drawRunnerAt(); ctx.restore(); }
    else drawRunnerAt();
  }
  function drawRunnerAt() {
    var x = xAt(player.x, 0);
    var lift = player.h * 70;
    var sliding = player.slideT > 0;
    var stumble = stumbleT > 0;
    var ph = Math.floor((player.runT / (Math.PI * 2)) * 8 % 8) / 8 * Math.PI * 2; // 8 frames
    var run = Math.sin(ph), run2 = Math.cos(ph);
    var groundR = 20 + player.h * 6, shadowA = Math.max(0.12, 0.5 - player.h * 0.25);
    softShadow(x, FLOOR_Y, groundR, groundR * 0.28, shadowA);
    if (invuln > 0 && Math.floor(frame / 4) % 2 === 0) return;
    var y = FLOOR_Y - lift;
    var lean = player.lean * 6;
    var stretch = player.jumping ? (player.vy > 0 ? 1.1 : 0.94) : 1;
    ctx.save();
    ctx.translate(x + lean, y);
    ctx.transform(1, 0, player.lean * 0.16, stretch, 0, 0);
    if (shieldOn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; var sg = ctx.createRadialGradient(0, -24, 4, 0, -24, 34); sg.addColorStop(0, 'rgba(0,255,255,0.05)'); sg.addColorStop(0.8, 'rgba(0,255,255,' + (0.18 + Math.sin(frame * 0.2) * 0.05) + ')'); sg.addColorStop(1, 'rgba(0,255,255,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(0, -24, 30, 36, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    var skin = '#e8b894', skinD = '#c9977a', jean = '#1b1b26', jeanL = '#2a2a3a';
    // legs
    function leg(lx, phase) {
      var swing = Math.sin(phase);
      var kneeUp = Math.max(0, -Math.cos(phase)) * 6;
      ctx.fillStyle = swing > 0 ? jeanL : jean;
      rrect(lx, -18 - kneeUp, 7, 16 + swing * 3, 3); ctx.fill();
      ctx.fillStyle = '#111'; rrect(lx - 1, -4 + Math.max(0, swing * 3) - kneeUp * 0.4, 9, 4, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(lx, -3 + Math.max(0, swing * 3) - kneeUp * 0.4, 7, 1);
    }
    if (sliding) {
      ctx.fillStyle = jean; rrect(-16, -9, 30, 7, 3); ctx.fill();
      ctx.fillStyle = jeanL; rrect(-6, -17, 8, 10, 3); ctx.fill();
      ctx.fillStyle = '#111'; rrect(-19, -5, 9, 4, 2); ctx.fill(); rrect(9, -5, 9, 4, 2); ctx.fill();
    } else if (player.jumping) {
      ctx.fillStyle = jean; rrect(-10, -18, 7, 10, 3); ctx.fill(); rrect(3, -20, 7, 12, 3); ctx.fill();
      ctx.fillStyle = jeanL; rrect(-11, -12, 8, 7, 3); ctx.fill(); rrect(2, -10, 8, 6, 3); ctx.fill();
      ctx.fillStyle = '#111'; rrect(-12, -6, 9, 4, 2); ctx.fill(); rrect(2, -4, 9, 4, 2); ctx.fill();
    } else {
      leg(-10, ph); leg(3, ph + Math.PI);
    }
    // torso: tee with a fold, sleeves of ink
    var bodyH = sliding ? 18 : 30;
    var by = sliding ? -26 : -bodyH - 16 + (sliding ? 0 : Math.abs(run) * 1.2);
    var tg = ctx.createLinearGradient(-11, by, 11, by);
    tg.addColorStop(0, '#0c0c12'); tg.addColorStop(0.55, '#1a1a22'); tg.addColorStop(1, '#0a0a0e');
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3; rrect(-12, by, 24, bodyH, 4); ctx.stroke();
    ctx.fillStyle = tg; rrect(-12, by, 24, bodyH, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(-8, by + 6); ctx.quadraticCurveTo(-2 + run * 2, by + bodyH * 0.5, -6, by + bodyH - 3); ctx.lineTo(-4, by + bodyH - 3); ctx.quadraticCurveTo(0 + run * 2, by + bodyH * 0.5, -6, by + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#26262f'; ctx.fillRect(-12, by, 24, 3);
    // neon rim light from the pink side
    ctx.fillStyle = 'rgba(255,20,147,0.35)'; ctx.fillRect(10, by + 2, 2, bodyH - 4);
    ctx.fillStyle = 'rgba(0,255,255,0.22)'; ctx.fillRect(-12, by + 2, 2, bodyH - 4);
    // arms
    var arm = sliding ? 0 : run * 6;
    function armAt(ax, dir, swing) {
      ctx.fillStyle = skin; rrect(ax, by + 3 + swing, 6, 15, 3); ctx.fill();
      ctx.fillStyle = skinD; ctx.fillRect(ax + (dir < 0 ? 4 : 0), by + 5 + swing, 2, 11);
      ctx.fillStyle = PINK; ctx.fillRect(ax, by + 6 + swing, 6, 3); ctx.fillStyle = CYAN; ctx.fillRect(ax, by + 11 + swing, 6, 2); ctx.fillStyle = PURPLE; ctx.fillRect(ax, by + 14 + swing, 6, 2);
    }
    armAt(-17, -1, arm); armAt(11, 1, -arm);
    // the machine in the right hand, cord trailing behind
    var mx = 12, my = by + 16 - arm;
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(mx + 4, my + 4);
    ctx.quadraticCurveTo(mx + 14 + run * 3, my + 14, mx + 6 + run2 * 4, my + 30); ctx.stroke();
    ctx.fillStyle = '#3a3a44'; rrect(mx - 1, my, 10, 6, 2); ctx.fill();
    ctx.fillStyle = '#c8722a'; ctx.fillRect(mx + 1, my - 3, 4, 3); ctx.fillRect(mx + 6, my - 3, 3, 3);
    ctx.fillStyle = '#bbb'; ctx.fillRect(mx + 8, my + 2, 4, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(mx, my + 1, 8, 1);
    // head from behind: neck, hair, the pink cap with a highlight
    var hy = sliding ? -40 : by - 13 - Math.abs(run) * 0.8;
    ctx.fillStyle = skinD; ctx.fillRect(-3, hy + 10, 6, 4);
    ctx.fillStyle = skin; rrect(-7, hy, 14, 12, 4); ctx.fill();
    ctx.fillStyle = '#2a1a12'; rrect(-8, hy - 2, 16, 8, 3); ctx.fill();
    var cg = ctx.createLinearGradient(-9, hy - 6, 9, hy);
    cg.addColorStop(0, '#ff5fb0'); cg.addColorStop(0.5, PINK); cg.addColorStop(1, '#a00c5e');
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3; rrect(-9, hy - 6, 18, 18, 4); ctx.stroke();
    ctx.fillStyle = skin; rrect(-7, hy, 14, 12, 4); ctx.fill();
    ctx.fillStyle = '#2a1a12'; rrect(-8, hy - 2, 16, 8, 3); ctx.fill();
    ctx.fillStyle = cg; rrect(-9, hy - 6, 18, 6, 3); ctx.fill();
    ctx.fillStyle = '#8a0a50'; ctx.fillRect(-9, hy - 1, 18, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-6, hy - 5, 8, 1);
    if (stumble && Math.floor(frame / 5) % 2 === 0) { ctx.fillStyle = YELLOW; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('*', 14, hy - 8); }
    ctx.restore();
  }

  // ── HUD: thin bars, glow numbers, the chain as a ring ──
  var HT = PHONE ? 1.25 : 1; // HUD text scale on the small physical screen
  function drawHud(zd) {
    var hg = ctx.createLinearGradient(0, 0, 0, 44);
    hg.addColorStop(0, 'rgba(0,0,0,0.55)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, 44);
    ctx.save(); glow('rgba(255,255,255,0.7)', 6);
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(15 * HT) + 'px monospace'; ctx.textAlign = 'left';
    ctx.fillText(String(score), 10, 20);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = Math.round(8 * HT) + 'px monospace';
    ctx.fillText('BEST ' + Math.max(best, wall.best(), score), 10, 31);
    // lives: three pills
    for (var i = 0; i < 3; i++) {
      var on = i < lives;
      ctx.save(); if (on) glow(PINK, 5);
      ctx.fillStyle = on ? PINK : 'rgba(255,255,255,0.15)'; rrect(10 + i * 14, 35, 10, 3, 1.5); ctx.fill();
      ctx.restore();
    }
    // center: distance and zone
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold ' + Math.round(11 * HT) + 'px monospace';
    ctx.fillText(Math.round(dist) + 'm', W / 2, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = Math.round(7 * HT) + 'px monospace';
    ctx.fillText(zd.name, W / 2, 27);
    // chain ring, top right
    var m = mult();
    var cx = W - 26, cy = 22, r = 13;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    var frac = chain > 0 ? ((chain % 5) || 5) / 5 : 0;
    var col = m >= 4 ? PINK : m > 1 ? YELLOW : CYAN;
    if (frac > 0) { ctx.save(); glow(col, 8); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke(); ctx.restore(); }
    // the ring drains as the chain timer runs out
    if (chainT > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (chainT / 95)); ctx.stroke(); }
    ctx.save(); if (m > 1) glow(col, 6);
    ctx.fillStyle = m > 1 ? col : 'rgba(255,255,255,0.7)'; ctx.font = 'bold ' + (m > 1 ? 11 : 9) + 'px monospace'; ctx.textAlign = 'center';
    ctx.fillText('x' + m, cx, cy + 4);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = Math.round(7 * HT) + 'px monospace'; ctx.textAlign = 'right';
    ctx.fillText('CHAIN ' + chain, W - 44, 25);
    // timed powers as thin bars under the ring
    var py = 44;
    function bar(label, col2, frac2) { ctx.textAlign = 'right'; ctx.fillStyle = col2; ctx.font = 'bold 7px monospace'; ctx.fillText(label, W - 10, py + 6); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(W - 100, py + 8, 90, 2); ctx.fillStyle = col2; ctx.fillRect(W - 100, py + 8, 90 * frac2, 2); py += 14; }
    if (magnetT > 0) bar('MAGNET', CYAN, magnetT / 420);
    if (coffeeT > 0) bar('SPRINT', YELLOW, coffeeT / 300);
    if (shieldOn) bar('STENCIL SHIELD', CYAN, 1);
    if (slowT > 0) bar('SLIPPING', PURPLE, slowT / 50);
    // the zone title card on entry
    if (bannerT > 0 && mode === 'play') {
      var k = 1 - bannerT / 120;
      var a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
      var sw = Math.min(1, k / 0.35);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H / 2 - 40, W, 54);
      ctx.fillStyle = bannerColor; ctx.fillRect(W / 2 - 160 * sw, H / 2 - 40, 320 * sw, 2); ctx.fillRect(W / 2 - 160 * sw, H / 2 + 12, 320 * sw, 2);
      glow(bannerColor, 12);
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(16 + 6 * Math.min(1, k * 3)) + 'px monospace'; ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 8);
      noGlow();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '8px monospace';
      ctx.fillText('ZONE ' + zone, W / 2, H / 2 + 6);
      ctx.restore();
    }
  }

  // Portrait on a phone: Ink Run plays sideways. The card sits over whatever
  // is on screen and the run holds until the shell reloads in landscape.
  function drawTurnCard() {
    ctx.setTransform(HIRES ? 2 : 1, 0, 0, HIRES ? 2 : 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
    var rock = Math.sin(frame * 0.05) * 0.35 - 0.6;
    ctx.save(); ctx.translate(W / 2, H / 2 - 30); ctx.rotate(rock);
    ctx.fillStyle = '#e8eefc'; rrect(-16, -30, 32, 60, 6); ctx.fill();
    ctx.fillStyle = '#0a0a14'; ctx.fillRect(-13, -24, 26, 46);
    ctx.fillStyle = PINK; ctx.fillRect(-9, -14, 18, 3);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.save(); glow(PINK, 12); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.fillText('TURN YOUR PHONE', W / 2, H / 2 + 34); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '10px monospace'; ctx.fillText('Ink Run plays sideways, full screen', W / 2, H / 2 + 54);
  }
  var blurBuf = null, blurTried = false, blurFresh = false;
  function draw() {
    drawScene();
    if (PHONE && PORTRAIT) drawTurnCard();
  }
  function drawScene() {
    ctx.setTransform(HIRES ? 2 : 1, 0, 0, HIRES ? 2 : 1, 0, 0);
    if (mode === 'intro') { drawIntro(); return; }
    var zd = zoneDef(zone);
    weatherTick(zd);
    var sprint = speed > 0.5 || coffeeT > 0;
    ctx.save();
    // camera: a bob with the stride, a low shake on hits, a stretch on coffee
    var bobY = (!player.jumping && player.slideT === 0 && mode === 'play') ? Math.sin(player.runT * 2) * 1.1 : 0;
    ctx.translate(0, bobY);
    if (shake > 0.5) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); var fs = 1 + shake * 0.004; ctx.translate(W / 2, HOR); ctx.scale(fs, fs); ctx.translate(-W / 2, -HOR); }
    if (coffeeT > 0) { ctx.translate(W / 2, H / 2); ctx.scale(1.03, 0.985); ctx.translate(-W / 2, -H / 2); }
    drawBackdrop(zd);
    drawFloor(zd);
    for (var st = 0; st < obstacles.length; st++) laneStripe(obstacles[st]);
    var all = [];
    for (var i = 0; i < props.length; i++) all.push({ z: props[i].z, t: 'p', o: props[i] });
    for (var j = 0; j < obstacles.length; j++) all.push({ z: obstacles[j].z, t: 'o', o: obstacles[j] });
    for (var k = 0; k < pickups.length; k++) if (!pickups[k].got) all.push({ z: pickups[k].z, t: 'k', o: pickups[k] });
    all.push({ z: 0, t: 'r' });
    all.sort(function(a, b) { return b.z - a.z; });
    for (var n = 0; n < all.length; n++) {
      var it = all[n];
      if (it.t === 'p') drawProp(it.o, zd);
      else if (it.t === 'o') drawObstacle(it.o, zd);
      else if (it.t === 'k') drawPickup(it.o, zd);
      else drawRunner();
    }
    for (var b = 0; b < birds.length; b++) {
      var bd = birds[b];
      ctx.fillStyle = '#8a8f9a'; rrect(bd.x - 4, bd.y, 8, 3, 1.5); ctx.fill(); ctx.fillRect(bd.x - 8, bd.y - (bd.t % 10 < 5 ? 3 : 0), 5, 2); ctx.fillRect(bd.x + 3, bd.y - (bd.t % 10 < 5 ? 3 : 0), 5, 2);
    }
    // rain and snow
    if (rain.length) { ctx.strokeStyle = 'rgba(200,220,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (var ri = 0; ri < rain.length; ri++) { ctx.moveTo(rain[ri].x, rain[ri].y); ctx.lineTo(rain[ri].x - 2, rain[ri].y + rain[ri].l); } ctx.stroke(); }
    if (snow.length) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (var si = 0; si < snow.length; si++) { ctx.beginPath(); ctx.arc(snow[si].x, snow[si].y, snow[si].s * 0.6, 0, Math.PI * 2); ctx.fill(); } }
    for (var q = 0; q < parts.length; q++) {
      var pt = parts[q];
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / 20));
      if (pt.ring) { ctx.strokeStyle = pt.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, (10 - pt.life) * 0.8, (10 - pt.life) * 0.25, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = pt.color; ctx.fillRect(pt.x, pt.y, pt.s, pt.paper ? pt.s * 1.3 : pt.s); }
    }
    ctx.globalAlpha = 1;
    // speed lines at the edges when sprinting
    if (sprint) {
      var sa = Math.min(0.5, (speed - 0.42) * 1.6 + (coffeeT > 0 ? 0.25 : 0));
      ctx.strokeStyle = 'rgba(255,255,255,' + sa + ')'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var sl = 0; sl < 14; sl++) {
        var ang = ((sl * 37 + frame * 3) % 360) * Math.PI / 180;
        var ex = W / 2 + Math.cos(ang) * 300, ey = HOR + Math.sin(ang) * 240;
        var ix = W / 2 + Math.cos(ang) * (120 + (sl * 13 + frame * 5) % 60), iy = HOR + Math.sin(ang) * (100 + (sl * 13 + frame * 5) % 50);
        ctx.moveTo(ix, iy); ctx.lineTo(ex, ey);
      }
      ctx.stroke();
    }
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,60,60,' + (flashT / 8) * 0.35 + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    // motion blur toward the vanishing point: last frame's world, faded and
    // scaled up a hair, laid over this one (only while sprinting)
    if (!blurTried) { blurTried = true; blurBuf = offscreen(canvas.width || 400, canvas.height || 320); }
    if (blurBuf) {
      if (sprint && blurFresh) {
        ctx.save(); ctx.globalAlpha = Math.min(0.3, 0.12 + (coffeeT > 0 ? 0.14 : 0) + Math.max(0, speed - 0.5));
        ctx.translate(W / 2, HOR); ctx.scale(1.025, 1.025); ctx.translate(-W / 2, -HOR);
        ctx.drawImage(blurBuf.c, 0, 0, W, H);
        ctx.restore();
      }
      // the copy is the priciest thing in the frame: only keep it while sprinting
      if (sprint) { try { blurBuf.x.setTransform(1, 0, 0, 1, 0, 0); blurBuf.x.drawImage(canvas, 0, 0); blurFresh = true; } catch (e) { blurBuf = null; } }
      else blurFresh = false;
    }
    // vignette
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    drawHud(zd);
    // the teaching card: the first time each hazard class shows up
    if (cardT > 0 && mode === 'play') {
      var ck = 1 - cardT / 200, ca = ck < 0.1 ? ck / 0.1 : ck > 0.85 ? (1 - ck) / 0.15 : 1;
      var ccol = cardText.indexOf('JUMP') >= 0 ? YELLOW : cardText.indexOf('SLIDE') >= 0 ? CYAN : '#ff3b3b';
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, ca));
      ctx.fillStyle = 'rgba(0,0,0,0.78)'; rrect(W / 2 - 150, 60, 300, 58, 6); ctx.fill();
      ctx.strokeStyle = ccol; ctx.lineWidth = 2; rrect(W / 2 - 150, 60, 300, 58, 6); ctx.stroke();
      drawIcon(cardText.indexOf('JUMP') >= 0 ? 'low' : cardText.indexOf('SLIDE') >= 0 ? 'high' : 'block', W / 2 - 118, 89, 1);
      glow(ccol, 10); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.fillText(cardText, W / 2 + 14, 86); noGlow();
      ctx.fillStyle = ccol; ctx.font = 'bold 9px monospace'; ctx.fillText(cardSub, W / 2 + 14, 104);
      ctx.restore();
    }
    for (var r = 0; r < popups.length; r++) {
      var pp = popups[r];
      ctx.globalAlpha = Math.min(1, pp.life / 18);
      ctx.font = 'bold ' + (pp.big ? 13 : 10) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.save(); if (pp.big) glow(pp.color, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(pp.text, pp.x + 1, pp.y + 1);
      ctx.fillStyle = pp.color; ctx.fillText(pp.text, pp.x, pp.y);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();
  }

  // ── Attract-mode intro: CRT power-on, studio card, then the title scene ──
  function drawIntro() {
    var t = introT;
    if (t >= 300) { wall.drawAttract(); return; }
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, W, H);
    if (t < 70) {
      if (t < 14) {
        var lw = (t / 14) * W;
        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect((W - lw) / 2, H / 2 - 1, lw, 2);
      } else {
        if (Math.sin(t * 1.9) > -0.5 || t > 38) {
          ctx.save(); glow(PINK, 14);
          ctx.fillStyle = PINK;
          ctx.font = 'bold 18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('LUMENATI', W / 2, H / 2 - 6);
          ctx.restore();
          ctx.fillStyle = '#d8dde4';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('A  R  C  A  D  E', W / 2, H / 2 + 14);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (var sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
      return;
    }
    var t2 = t - 70;
    var zd = ZONES[0];
    floorOff = (floorOff + 0.35) % 4;
    dist += 0.35;
    weatherTick(zd);
    drawBackdrop(zd);
    drawFloor(zd);
    for (var p = 0; p < props.length; p++) { props[p].z -= 0.35; if (props[p].z < -2) props[p].z += Z_FAR + 2; drawProp(props[p], zd); }
    player.runT += 0.5; player.x = 0; player.h = t2 % 90 > 70 ? Math.sin(((t2 % 90) - 70) / 20 * Math.PI) * 0.8 : 0;
    drawRunner();
    player.h = 0;
    ctx.textAlign = 'center';
    var tw = 26;
    var title = 'INK RUN';
    for (var i = 0; i < title.length; i++) {
      var lt = Math.max(0, Math.min(1, (t2 - i * 6) / 16));
      if (lt <= 0) continue;
      var ty = 96 - (1 - lt) * (1 - lt) * 160, tx = W / 2 - title.length * tw / 2 + i * tw + tw / 2;
      ctx.font = 'bold 38px monospace';
      ctx.save(); glow(i < 3 ? PINK : CYAN, 16);
      ctx.fillStyle = i < 3 ? PINK : CYAN;
      ctx.fillText(title[i], tx, ty);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(title[i], tx, ty - 1);
    }
    if (t2 > 60) { ctx.fillStyle = YELLOW; ctx.font = 'bold 11px monospace'; ctx.fillText('THE SHOP FLOOR TO THE MOUNTAIN PASS AT FULL SPRINT', W / 2, 122); }
    var ig = ctx.createLinearGradient(0, H - 70, 0, H);
    ig.addColorStop(0, 'rgba(0,0,0,0)'); ig.addColorStop(0.4, 'rgba(0,0,0,0.65)'); ig.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = ig; ctx.fillRect(0, H - 70, W, 70);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.fillText('LEFT/RIGHT lanes // UP or SPACE jumps // DOWN slides // swipe on phones', W / 2, H - 42);
    ctx.fillText('yellow arrow = JUMP // cyan arrow = SLIDE // red X = CHANGE LANE', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.save(); glow(YELLOW, 8);
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
      ctx.restore();
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('BEST: ' + Math.max(best, wall.best()), W / 2, H - 10);
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
    try {
    while (acc >= 16.67) {
      if (mode === 'play' && !(PHONE && PORTRAIT)) update();
      else { frame++; musicTick(); if (shake > 0) shake *= 0.85; if (mode === 'intro' && ++introT > 540) introT = 70; }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
