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
  var LANE_W = 96;        // lane width in px at the player
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
    score = 0; lives = 3; frame = 0; dist = 0; speed = 0.3; zone = 1; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    player = { lane: 0, x: 0, h: 0, vy: 0, jumping: false, slideT: 0, lean: 0, runT: 0 };
    obstacles = []; pickups = []; props = []; birds = []; popups = []; parts = []; shake = 0; flashT = 0;
    chain = 0; chainT = 0; drops = 0; bestChain = 0; nearOnes = 0; lastJump = -999; lastSlide = -999; comboT = 0;
    magnetT = 0; shieldOn = false; coffeeT = 0; slowT = 0; stumbleT = 0; invuln = 0; bannerT = 0; bannerText = ''; bannerColor = LIME;
    spawnZ = 14; stats = { zone: 1, flash: 0, near: 0 }; lastZoneCleared = 0; floorOff = 0;
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

  // ── Spawning: patterns that always leave a way through ──
  function spawnPattern() {
    var zd = zoneDef(zone);
    var z = Z_FAR;
    var hard = Math.min(1, (dist / ZONE_LEN) * 0.18);
    var r = Math.random();
    var lanes = [-1, 0, 1];
    function shuffled() { var a = lanes.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function ob(kind, type, lane, zz, wide) { obstacles.push({ kind: kind, type: type, lane: lane, z: zz, wide: !!wide, passed: false, near: false, id: Math.random() }); }
    function lowKind() { return zd.low[Math.floor(Math.random() * zd.low.length)]; }
    function highKind() { return zd.high[Math.floor(Math.random() * zd.high.length)]; }
    function blockKind() { return zd.block[Math.floor(Math.random() * zd.block.length)]; }
    function dropLine(lane, zz, n, arc) {
      for (var i = 0; i < n; i++) {
        var h = 0;
        if (arc) { var u = i / (n - 1); h = Math.sin(u * Math.PI) * 1.6; }
        pickups.push({ kind: 'drop', lane: lane, z: zz + i * 1.3, h: h, got: false });
      }
    }
    if (r < 0.22) {
      // one low thing to jump, drops arcing over it in the same lane
      var l1 = lanes[Math.floor(Math.random() * 3)];
      ob(lowKind(), 'low', l1, z);
      if (Math.random() < 0.7) dropLine(l1, z - 3, 5, true);
    } else if (r < 0.40) {
      // a bar across everything: slide
      ob(highKind(), 'high', 0, z, true);
      var l2 = lanes[Math.floor(Math.random() * 3)];
      if (Math.random() < 0.6) dropLine(l2, z + 2, 4, false);
    } else if (r < 0.62) {
      // two blockers, one lane open
      var s = shuffled();
      ob(blockKind(), 'block', s[0], z);
      ob(Math.random() < 0.5 ? blockKind() : lowKind(), Math.random() < 0.5 ? 'block' : 'low', s[1], z + (Math.random() < 0.5 ? 0 : 2));
      if (Math.random() < 0.7) dropLine(s[2], z - 1, 5, false);
    } else if (r < 0.74) {
      // a run of drops with a lane change in it
      var s2 = shuffled();
      dropLine(s2[0], z, 4, false);
      dropLine(s2[1], z + 6, 4, false);
      if (hard > 0.3) ob(lowKind(), 'low', s2[2], z + 3);
    } else if (r < 0.86) {
      // jump then slide: the combo setup
      var l3 = lanes[Math.floor(Math.random() * 3)];
      ob(lowKind(), 'low', l3, z);
      ob(highKind(), 'high', 0, z + 5 + (1 - hard) * 3, true);
    } else if (zd.spill && r < 0.93) {
      var s3 = shuffled();
      obstacles.push({ kind: 'spill', type: 'spill', lane: s3[0], z: z, passed: false, id: Math.random() });
      obstacles.push({ kind: 'spill', type: 'spill', lane: s3[1], z: z + 1.5, passed: false, id: Math.random() });
      dropLine(s3[2], z - 1, 4, false);
    } else {
      // a single blocker and a treat somewhere else
      var s4 = shuffled();
      ob(blockKind(), 'block', s4[0], z);
      var kinds = ['flash', 'flash', 'magnet', 'shield', 'coffee'];
      pickups.push({ kind: kinds[Math.floor(Math.random() * kinds.length)], lane: s4[1], z: z + 1, h: 0, got: false });
    }
    // Later zones squeeze the gaps
    spawnZ = Math.max(5.5, 11 - zone * 0.9 - hard * 2) + Math.random() * 2;
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
    player.vy = 0.22;
    lastJump = frame;
    sfxJump();
    burst(xAt(player.x, 0), FLOOR_Y, 5, 'rgba(200,200,220,0.6)', 1.2, 0.02);
  }
  function slide() {
    if (mode !== 'play') return;
    if (player.jumping) { player.vy = -0.3; return; } // fast drop out of a jump
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
    stumbleT = 40;
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
    if (chainT > 0) { chainT--; if (chainT === 0 && chain > 0) { chain = 0; } }

    // Speed: ramps with distance, coffee doubles down, spills and stumbles drag
    var base = 0.3 + Math.min(0.34, dist / 9000);
    var sp = base;
    if (coffeeT > 0) sp *= 1.5;
    if (slowT > 0) sp *= 0.72;
    if (stumbleT > 0) sp *= 0.55;
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
    player.x += (player.lane - player.x) * 0.22;
    player.lean *= 0.85;
    player.runT += speed * 2.2;
    if (player.jumping) {
      player.h += player.vy;
      player.vy -= 0.011;
      if (player.h <= 0) { player.h = 0; player.jumping = false; player.vy = 0; burst(xAt(player.x, 0), FLOOR_Y, 4, 'rgba(200,200,220,0.5)', 1.0, 0.02); }
    }
    if (player.slideT > 0) player.slideT--;

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
      var laneHit = ob.wide || Math.abs(ob.lane - px) < 0.55;
      var inReach = ob.z < 0.7 && ob.z > -0.5;
      if (inReach && laneHit && !ob.passed) {
        var dodged = false;
        if (ob.type === 'low') dodged = player.h > 0.45;
        else if (ob.type === 'high') dodged = player.slideT > 0;
        else if (ob.type === 'spill') { dodged = player.h > 0.3; if (!dodged) { slowT = 50; ob.passed = true; addPopup(xAt(ob.lane, 0), FLOOR_Y - 40, 'INK SPILL', PURPLE); chain = 0; chainT = 0; continue; } }
        if (!dodged) { ob.passed = true; hit(ob); }
      }
      // Near miss: a blocker slides past in the lane beside you
      if (!ob.near && ob.type === 'block' && !ob.wide && ob.z < 0.3 && ob.z > -0.5 && Math.abs(ob.lane - px) >= 0.55 && Math.abs(ob.lane - px) < 1.4 && invuln === 0) {
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
      if (pk.z < 0.7 && pk.z > -0.6 && Math.abs(pk.lane - px) < 0.6 && Math.abs(pk.h - player.h) < 0.75) {
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
  function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }

  function drawBackdrop(zd) {
    var g = ctx.createLinearGradient(0, 0, 0, HOR + 30);
    g.addColorStop(0, zd.sky[0]); g.addColorStop(1, zd.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HOR + 30);
    if (zd.stars) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (var i = 0; i < stars.length; i++) { if ((frame + i * 7) % 90 < 80) ctx.fillRect(stars[i].x, stars[i].y, stars[i].s, stars[i].s); } }
    // Far skyline per zone, sliding a hair as you run
    var sh = (dist * 0.15) % 80;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (zd.name === 'THE SHOP FLOOR') {
      for (var a = -1; a < 6; a++) { var ax = a * 80 - sh; px(ax, HOR - 40, 60, 42, 'rgba(0,0,0,0.3)'); px(ax + 8, HOR - 32, 44, 4, 'rgba(255,20,147,0.35)'); }
    } else if (zd.name === 'THE ALLEY') {
      for (var a2 = -1; a2 < 6; a2++) { var ax2 = a2 * 80 - sh; px(ax2, HOR - 70, 70, 72, 'rgba(0,0,0,0.4)'); for (var wy = 0; wy < 4; wy++) for (var wx = 0; wx < 3; wx++) if ((a2 * 7 + wy * 3 + wx) % 4 !== 0) px(ax2 + 8 + wx * 20, HOR - 62 + wy * 16, 8, 8, 'rgba(255,220,150,0.25)'); }
    } else if (zd.name === 'THE FLASH MARKET') {
      for (var a3 = -1; a3 < 7; a3++) { var ax3 = a3 * 66 - sh; ctx.fillStyle = a3 % 2 ? 'rgba(255,20,147,0.25)' : 'rgba(255,215,0,0.22)'; ctx.beginPath(); ctx.moveTo(ax3, HOR); ctx.lineTo(ax3 + 33, HOR - 30); ctx.lineTo(ax3 + 66, HOR); ctx.closePath(); ctx.fill(); }
    } else if (zd.name === '16TH STREET') {
      for (var a4 = -1; a4 < 6; a4++) { var ax4 = a4 * 80 - sh; var th = 50 + ((a4 * 37) % 40); px(ax4 + 10, HOR - th, 50, th + 2, 'rgba(0,0,0,0.45)'); for (var wy2 = 0; wy2 < th / 10; wy2++) for (var wx2 = 0; wx2 < 3; wx2++) if ((a4 * 5 + wy2 * 2 + wx2) % 3 !== 0) px(ax4 + 16 + wx2 * 14, HOR - th + 6 + wy2 * 10, 6, 5, 'rgba(0,255,255,0.28)'); }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.moveTo(-20, HOR + 2);
      for (var m = 0; m <= 8; m++) { var mx = m * 55 - sh * 0.5; ctx.lineTo(mx, HOR - 30 - ((m * 41) % 50)); ctx.lineTo(mx + 27, HOR - 10 - ((m * 23) % 30)); }
      ctx.lineTo(W + 20, HOR + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var m2 = 0; m2 <= 8; m2++) { var mx2 = m2 * 55 - sh * 0.5; px(mx2 - 3, HOR - 30 - ((m2 * 41) % 50), 6, 3, 'rgba(255,255,255,0.45)'); }
    }
    // Fog band on the horizon
    var fg = ctx.createLinearGradient(0, HOR - 14, 0, HOR + 26);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, zd.fog); fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, HOR - 14, W, 40);
  }

  function drawFloor(zd) {
    // The road plane: two floor tones alternating in depth, lane lines converging
    ctx.fillStyle = zd.floor[0];
    ctx.fillRect(0, HOR, W, H - HOR);
    var band = 0;
    for (var z = Z_FAR; z > -2; z -= 2) {
      var zz = z - (floorOff % 4) + 2;
      var y1 = yAt(zz), y2 = yAt(zz - 2);
      if (y2 < y1) continue;
      var tone = Math.floor((z + 100) / 2) % 2 === 0;
      ctx.fillStyle = tone ? zd.floor[1] : zd.floor[0];
      ctx.beginPath();
      ctx.moveTo(xAt(-1.5, zz), y1); ctx.lineTo(xAt(1.5, zz), y1);
      ctx.lineTo(xAt(1.5, zz - 2), y2); ctx.lineTo(xAt(-1.5, zz - 2), y2);
      ctx.closePath(); ctx.fill();
      band++;
    }
    // Lane edges
    ctx.strokeStyle = zd.line; ctx.lineWidth = 1.5;
    for (var l = -1.5; l <= 1.5; l += 1) {
      ctx.beginPath(); ctx.moveTo(xAt(l, Z_FAR), yAt(Z_FAR)); ctx.lineTo(xAt(l, -1), yAt(-1)); ctx.stroke();
    }
    // Sidewalk shoulders
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.moveTo(0, HOR); ctx.lineTo(xAt(-1.5, Z_FAR), yAt(Z_FAR)); ctx.lineTo(xAt(-1.5, -1), H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, HOR); ctx.lineTo(xAt(1.5, Z_FAR), yAt(Z_FAR)); ctx.lineTo(xAt(1.5, -1), H); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function drawProp(p) {
    var s = scaleAt(p.z);
    if (s < 0.1) return;
    var x = xAt(p.side * 1.95, p.z), y = yAt(p.z);
    var u = 60 * s; // one unit of height
    var k = p.kind;
    ctx.globalAlpha = Math.min(1, s * 3);
    if (k === 'chair') { px(x - u * 0.3, y - u * 0.5, u * 0.6, u * 0.5, '#3a3a44'); px(x - u * 0.3, y - u * 0.9, u * 0.14, u * 0.9, '#2a2a34'); px(x - u * 0.25, y - u * 0.55, u * 0.5, u * 0.1, PINK); }
    else if (k === 'station') { px(x - u * 0.35, y - u * 0.7, u * 0.7, u * 0.7, '#2c2c36'); px(x - u * 0.3, y - u * 0.65, u * 0.6, u * 0.28, '#111'); px(x - u * 0.2, y - u * 0.6, u * 0.4, u * 0.14, CYAN); }
    else if (k === 'neon') { px(x - u * 0.05, y - u * 1.4, u * 0.1, u * 1.4, '#222'); px(x - u * 0.4, y - u * 1.5, u * 0.8, u * 0.35, '#111'); px(x - u * 0.34, y - u * 1.44, u * 0.68, u * 0.22, (frame % 40 < 34) ? PINK : '#601040'); }
    else if (k === 'brick') { px(x - u * 0.5, y - u * 1.6, u * 1.0, u * 1.6, '#3a2620'); for (var r = 0; r < 6; r++) px(x - u * 0.5 + ((r % 2) * u * 0.12), y - u * 1.5 + r * u * 0.25, u * 0.9, u * 0.05, 'rgba(0,0,0,0.3)'); }
    else if (k === 'dumpsterprop') { px(x - u * 0.45, y - u * 0.6, u * 0.9, u * 0.6, '#2f4f2f'); px(x - u * 0.47, y - u * 0.7, u * 0.94, u * 0.14, '#3f6f3f'); }
    else if (k === 'escape') { px(x - u * 0.5, y - u * 1.6, u * 1.0, u * 1.6, '#2a1c18'); for (var e = 0; e < 3; e++) { px(x - u * 0.45, y - u * 1.4 + e * u * 0.45, u * 0.9, u * 0.05, '#555'); px(x - u * 0.45, y - u * 1.5 + e * u * 0.45, u * 0.04, u * 0.15, '#555'); px(x + u * 0.41, y - u * 1.5 + e * u * 0.45, u * 0.04, u * 0.15, '#555'); } }
    else if (k === 'tent') { ctx.fillStyle = p.side < 0 ? 'rgba(255,20,147,0.7)' : 'rgba(255,215,0,0.7)'; ctx.beginPath(); ctx.moveTo(x - u * 0.6, y - u * 0.6); ctx.lineTo(x, y - u * 1.2); ctx.lineTo(x + u * 0.6, y - u * 0.6); ctx.closePath(); ctx.fill(); px(x - u * 0.55, y - u * 0.6, u * 0.06, u * 0.6, '#ddd'); px(x + u * 0.49, y - u * 0.6, u * 0.06, u * 0.6, '#ddd'); }
    else if (k === 'table') { px(x - u * 0.4, y - u * 0.45, u * 0.8, u * 0.1, '#8b5a2b'); px(x - u * 0.35, y - u * 0.35, u * 0.06, u * 0.35, '#6b4a2b'); px(x + u * 0.29, y - u * 0.35, u * 0.06, u * 0.35, '#6b4a2b'); px(x - u * 0.3, y - u * 0.55, u * 0.25, u * 0.1, '#fff'); px(x + u * 0.02, y - u * 0.55, u * 0.25, u * 0.1, '#fff'); }
    else if (k === 'lamp') { px(x - u * 0.04, y - u * 1.8, u * 0.08, u * 1.8, '#333'); px(x - u * 0.16, y - u * 1.9, u * 0.32, u * 0.16, '#222'); px(x - u * 0.12, y - u * 1.86, u * 0.24, u * 0.08, '#ffe9a0'); ctx.globalAlpha = Math.min(0.25, s); ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.moveTo(x, y - u * 1.8); ctx.lineTo(x - u * 0.7, y); ctx.lineTo(x + u * 0.7, y); ctx.closePath(); ctx.fill(); ctx.globalAlpha = Math.min(1, s * 3); }
    else if (k === 'tower') { var th = u * (1.6 + (p.z * 7 % 5) * 0.2); px(x - u * 0.45, y - th, u * 0.9, th, '#141a2a'); for (var wy = 0; wy < th / (u * 0.25); wy++) for (var wx = 0; wx < 3; wx++) if ((wy * 3 + wx + Math.floor(p.z)) % 3 !== 0) px(x - u * 0.38 + wx * u * 0.28, y - th + u * 0.1 + wy * u * 0.25, u * 0.16, u * 0.14, 'rgba(0,255,255,0.35)'); }
    else if (k === 'pine') { ctx.fillStyle = '#0f2a18'; for (var t = 0; t < 3; t++) { ctx.beginPath(); ctx.moveTo(x - u * (0.55 - t * 0.12), y - u * (0.2 + t * 0.4)); ctx.lineTo(x, y - u * (0.9 + t * 0.4)); ctx.lineTo(x + u * (0.55 - t * 0.12), y - u * (0.2 + t * 0.4)); ctx.closePath(); ctx.fill(); } px(x - u * 0.06, y - u * 0.25, u * 0.12, u * 0.25, '#2a1a10'); }
    else if (k === 'peak') { ctx.fillStyle = '#1c2230'; ctx.beginPath(); ctx.moveTo(x - u * 1.2, y); ctx.lineTo(x, y - u * 1.6); ctx.lineTo(x + u * 1.2, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#e8eef5'; ctx.beginPath(); ctx.moveTo(x - u * 0.3, y - u * 1.2); ctx.lineTo(x, y - u * 1.6); ctx.lineTo(x + u * 0.3, y - u * 1.2); ctx.closePath(); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  function drawObstacle(ob) {
    var s = scaleAt(ob.z);
    if (s < 0.08) return;
    var y = yAt(ob.z), u = 60 * s;
    var x = xAt(ob.lane, ob.z);
    ctx.globalAlpha = Math.min(1, s * 4);
    // ground shadow tells you the lane before the thing is big enough to read
    if (ob.type !== 'spill') { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, (ob.wide ? LANE_W * 1.5 : u * 0.5), u * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
    var k = ob.kind;
    if (ob.type === 'high') {
      var x0 = xAt(-1.5, ob.z), x1 = xAt(1.5, ob.z), top = y - u * 1.05;
      if (k === 'sign') { px(x0, top - u * 0.3, x1 - x0, u * 0.3, '#111'); px(x0 + u * 0.1, top - u * 0.26, x1 - x0 - u * 0.2, u * 0.22, (frame % 30 < 24) ? '#ff3030' : '#601010'); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(6, u * 0.18) + 'px monospace'; ctx.textAlign = 'center'; ctx.fillText('OPEN', (x0 + x1) / 2, top - u * 0.09); }
      else if (k === 'escapebar' || k === 'wire') { px(x0, top - u * 0.08, x1 - x0, u * 0.1, '#777'); px(x0, top - u * 0.02, x1 - x0, u * 0.03, '#aaa'); }
      else if (k === 'tentbar') { px(x0, top - u * 0.1, x1 - x0, u * 0.12, '#ddd'); for (var f = 0; f < 6; f++) px(x0 + f * (x1 - x0) / 6, top + u * 0.02, (x1 - x0) / 12, u * 0.14, f % 2 ? PINK : YELLOW); }
      else if (k === 'tunnel') { px(x0 - u * 0.2, top - u * 0.6, x1 - x0 + u * 0.4, u * 0.6, '#2a2a30'); px(x0 - u * 0.2, top - u * 0.6, u * 0.2, u * 1.7, '#2a2a30'); px(x1, top - u * 0.6, u * 0.2, u * 1.7, '#2a2a30'); px(x0, top - u * 0.02, x1 - x0, u * 0.04, YELLOW); }
      else { px(x0, top - u * 0.1, x1 - x0, u * 0.12, '#888'); }
      px(x0 - u * 0.1, top - u * 0.1, u * 0.1, u * 1.15, '#555'); px(x1, top - u * 0.1, u * 0.1, u * 1.15, '#555');
    } else if (ob.type === 'low') {
      if (k === 'cart') { px(x - u * 0.4, y - u * 0.5, u * 0.8, u * 0.42, '#b0b0b8'); px(x - u * 0.36, y - u * 0.46, u * 0.72, u * 0.08, '#ddd'); px(x - u * 0.3, y - u * 0.08, u * 0.12, u * 0.08, '#222'); px(x + u * 0.18, y - u * 0.08, u * 0.12, u * 0.08, '#222'); px(x - u * 0.2, y - u * 0.6, u * 0.16, u * 0.1, PINK); px(x + u * 0.04, y - u * 0.6, u * 0.16, u * 0.1, CYAN); }
      else if (k === 'rack') { px(x - u * 0.4, y - u * 0.55, u * 0.06, u * 0.55, '#666'); px(x + u * 0.34, y - u * 0.55, u * 0.06, u * 0.55, '#666'); px(x - u * 0.4, y - u * 0.55, u * 0.8, u * 0.06, '#666'); for (var r = 0; r < 4; r++) px(x - u * 0.34 + r * u * 0.18, y - u * 0.48, u * 0.14, u * 0.34, r % 2 ? '#fff' : '#f4e8d0'); }
      else if (k === 'dog') { px(x - u * 0.4, y - u * 0.3, u * 0.7, u * 0.26, '#7a5230'); px(x + u * 0.2, y - u * 0.42, u * 0.24, u * 0.24, '#7a5230'); px(x + u * 0.34, y - u * 0.36, u * 0.05, u * 0.05, '#000'); px(x - u * 0.44, y - u * 0.2, u * 0.1, u * 0.06, '#7a5230'); if (frame % 60 < 30) { ctx.fillStyle = '#fff'; ctx.font = Math.max(6, u * 0.16) + 'px monospace'; ctx.textAlign = 'left'; ctx.fillText('z', x + u * 0.4, y - u * 0.5); } }
      else if (k === 'table') { px(x - u * 0.42, y - u * 0.4, u * 0.84, u * 0.08, '#8b5a2b'); px(x - u * 0.36, y - u * 0.32, u * 0.06, u * 0.32, '#6b4a2b'); px(x + u * 0.3, y - u * 0.32, u * 0.06, u * 0.32, '#6b4a2b'); px(x - u * 0.3, y - u * 0.5, u * 0.25, u * 0.1, '#fff'); px(x + u * 0.05, y - u * 0.5, u * 0.25, u * 0.1, '#fff'); }
      else if (k === 'bench') { px(x - u * 0.45, y - u * 0.34, u * 0.9, u * 0.08, '#4a6a3a'); px(x - u * 0.45, y - u * 0.5, u * 0.9, u * 0.06, '#4a6a3a'); px(x - u * 0.4, y - u * 0.26, u * 0.06, u * 0.26, '#333'); px(x + u * 0.34, y - u * 0.26, u * 0.06, u * 0.26, '#333'); }
      else if (k === 'rail') { px(x - u * 0.5, y - u * 0.4, u * 1.0, u * 0.1, '#9aa'); px(x - u * 0.4, y - u * 0.3, u * 0.06, u * 0.3, '#667'); px(x + u * 0.34, y - u * 0.3, u * 0.06, u * 0.3, '#667'); }
      else if (k === 'rock') { ctx.fillStyle = '#556'; ctx.beginPath(); ctx.moveTo(x - u * 0.4, y); ctx.lineTo(x - u * 0.25, y - u * 0.4); ctx.lineTo(x + u * 0.1, y - u * 0.5); ctx.lineTo(x + u * 0.4, y - u * 0.2); ctx.lineTo(x + u * 0.35, y); ctx.closePath(); ctx.fill(); }
      else { px(x - u * 0.4, y - u * 0.45, u * 0.8, u * 0.45, '#888'); }
    } else if (ob.type === 'block') {
      if (k === 'chairblock') { px(x - u * 0.35, y - u * 0.6, u * 0.7, u * 0.6, '#2a2a34'); px(x - u * 0.3, y - u * 1.2, u * 0.16, u * 0.7, '#22222c'); px(x - u * 0.34, y - u * 0.66, u * 0.68, u * 0.14, PINK); px(x - u * 0.33, y - u * 1.28, u * 0.66, u * 0.14, PINK); }
      else if (k === 'client') { px(x - u * 0.18, y - u * 0.7, u * 0.36, u * 0.7, ob.id > 0.5 ? '#2c3e50' : '#6a1b9a'); px(x - u * 0.14, y - u * 0.98, u * 0.28, u * 0.3, '#e8b894'); px(x - u * 0.16, y - u * 1.08, u * 0.32, u * 0.14, ob.id > 0.5 ? '#222' : PINK); px(x - u * 0.26, y - u * 0.66, u * 0.08, u * 0.4, '#e8b894'); px(x + u * 0.18, y - u * 0.66, u * 0.08, u * 0.4, '#e8b894'); if (ob.id > 0.5) px(x - u * 0.24, y - u * 0.6, u * 0.06, u * 0.24, PURPLE); }
      else if (k === 'dumpster') { px(x - u * 0.5, y - u * 0.8, u * 1.0, u * 0.8, '#2f4f2f'); px(x - u * 0.52, y - u * 0.92, u * 1.04, u * 0.16, '#3f6f3f'); px(x - u * 0.4, y - u * 0.5, u * 0.3, u * 0.14, '#fff'); px(x - u * 0.45, y - u * 0.06, u * 0.14, u * 0.06, '#111'); px(x + u * 0.31, y - u * 0.06, u * 0.14, u * 0.06, '#111'); }
      else if (k === 'tram') { px(x - u * 0.52, y - u * 1.1, u * 1.04, u * 1.1, '#c0c8d0'); px(x - u * 0.48, y - u * 1.0, u * 0.96, u * 0.4, '#1a2a44'); px(x - u * 0.52, y - u * 0.55, u * 1.04, u * 0.1, PINK); px(x - u * 0.4, y - u * 0.3, u * 0.2, u * 0.16, YELLOW); px(x + u * 0.2, y - u * 0.3, u * 0.2, u * 0.16, YELLOW); }
      else if (k === 'boulder') { ctx.fillStyle = '#5a5e6a'; ctx.beginPath(); ctx.moveTo(x - u * 0.5, y); ctx.lineTo(x - u * 0.4, y - u * 0.6); ctx.lineTo(x - u * 0.05, y - u * 0.95); ctx.lineTo(x + u * 0.35, y - u * 0.75); ctx.lineTo(x + u * 0.5, y - u * 0.2); ctx.lineTo(x + u * 0.42, y); ctx.closePath(); ctx.fill(); px(x - u * 0.2, y - u * 0.7, u * 0.2, u * 0.08, 'rgba(255,255,255,0.25)'); }
      else { px(x - u * 0.4, y - u * 0.9, u * 0.8, u * 0.9, '#666'); }
    } else if (ob.type === 'spill') {
      ctx.fillStyle = 'rgba(176,38,255,0.75)';
      ctx.beginPath(); ctx.ellipse(x, y - u * 0.02, u * 0.48, u * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(x - u * 0.15, y - u * 0.06, u * 0.12, u * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPickup(pk) {
    var s = scaleAt(pk.z);
    if (s < 0.08) return;
    var y = yAt(pk.z) - pk.h * 70 * s - 10 * s, u = 60 * s;
    var x = xAt(pk.lane, pk.z);
    var bob = Math.sin(frame * 0.2 + pk.z) * 2 * s;
    ctx.globalAlpha = Math.min(1, s * 4);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, yAt(pk.z), u * 0.18, u * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    y += bob;
    if (pk.kind === 'drop') {
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.moveTo(x, y - u * 0.34); ctx.quadraticCurveTo(x + u * 0.2, y - u * 0.05, x, y + u * 0.05); ctx.quadraticCurveTo(x - u * 0.2, y - u * 0.05, x, y - u * 0.34); ctx.fill();
      px(x - u * 0.06, y - u * 0.16, u * 0.05, u * 0.08, 'rgba(255,255,255,0.7)');
    } else if (pk.kind === 'flash') {
      px(x - u * 0.24, y - u * 0.34, u * 0.48, u * 0.4, '#f4e8d0'); px(x - u * 0.16, y - u * 0.26, u * 0.32, u * 0.22, pk.z % 2 < 1 ? PINK : CYAN); px(x - u * 0.03, y - u * 0.38, u * 0.06, u * 0.06, '#c00');
    } else if (pk.kind === 'magnet') {
      px(x - u * 0.22, y - u * 0.3, u * 0.44, u * 0.14, '#333'); px(x - u * 0.06, y - u * 0.4, u * 0.12, u * 0.36, '#555'); px(x - u * 0.2, y - u * 0.2, u * 0.1, u * 0.12, '#c8722a'); px(x + u * 0.1, y - u * 0.2, u * 0.1, u * 0.12, '#c8722a'); px(x - u * 0.02, y - u * 0.04, u * 0.04, u * 0.14, '#ddd');
      ctx.strokeStyle = 'rgba(0,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - u * 0.15, u * 0.4 + Math.sin(frame * 0.3) * 2, 0, Math.PI * 2); ctx.stroke();
    } else if (pk.kind === 'shield') {
      px(x - u * 0.24, y - u * 0.36, u * 0.48, u * 0.42, 'rgba(0,255,255,0.35)'); ctx.strokeStyle = CYAN; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(x - u * 0.24, y - u * 0.36, u * 0.48, u * 0.42); ctx.setLineDash([]);
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - u * 0.15, u * 0.1, 0, Math.PI * 2); ctx.stroke();
    } else if (pk.kind === 'coffee') {
      px(x - u * 0.16, y - u * 0.3, u * 0.32, u * 0.34, '#fff'); px(x - u * 0.16, y - u * 0.3, u * 0.32, u * 0.08, '#8b5a2b'); px(x + u * 0.16, y - u * 0.22, u * 0.08, u * 0.16, '#fff'); px(x - u * 0.1, y - u * 0.2, u * 0.2, u * 0.06, PINK);
      if (frame % 20 < 10) px(x - u * 0.04, y - u * 0.42, u * 0.04, u * 0.08, 'rgba(255,255,255,0.5)');
    }
    ctx.globalAlpha = 1;
  }

  function drawRunner() {
    var s = 1;
    var x = xAt(player.x, 0);
    var lift = player.h * 70;
    var sliding = player.slideT > 0;
    var stumble = stumbleT > 0;
    // shadow stays on the ground
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, FLOOR_Y, 18 - player.h * 6, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (invuln > 0 && Math.floor(frame / 4) % 2 === 0) return;
    var y = FLOOR_Y - lift;
    var lean = player.lean * 6;
    var run = Math.sin(player.runT);
    var squash = player.jumping ? (player.vy > 0 ? 1.12 : 0.92) : 1;
    var bodyH = sliding ? 20 : 34 * squash;
    ctx.save();
    ctx.translate(x + lean, y);
    ctx.transform(1, 0, player.lean * 0.15, 1, 0, 0);
    if (shieldOn) { ctx.fillStyle = 'rgba(0,255,255,' + (0.16 + Math.sin(frame * 0.2) * 0.05) + ')'; ctx.beginPath(); ctx.ellipse(0, -22, 26, 32, 0, 0, Math.PI * 2); ctx.fill(); }
    // legs
    if (sliding) {
      px(-14, -8, 28, 6, '#1d1d24');
      px(-16, -4, 8, 4, '#111'); px(8, -4, 8, 4, '#111');
    } else if (player.jumping) {
      px(-9, -14, 7, 12, '#1d1d24'); px(2, -12, 7, 10, '#1d1d24');
      px(-10, -3, 8, 4, '#111'); px(2, -1, 8, 4, '#111');
    } else {
      var la = run * 6, lb = -run * 6;
      px(-9, -16, 7, 14 + la * 0.3, '#1d1d24'); px(2, -16, 7, 14 + lb * 0.3, '#1d1d24');
      px(-10, -3 + Math.max(0, la * 0.4), 8, 4, '#111'); px(2, -3 + Math.max(0, lb * 0.4), 8, 4, '#111');
    }
    // body: black tee, sleeves of ink
    var by = sliding ? -22 : -bodyH - 14;
    var bh = sliding ? 14 : bodyH - 12;
    px(-11, by, 22, bh, '#111');
    px(-11, by, 22, 3, '#222');
    // arms swing, machine in the right hand
    var arm = sliding ? 0 : run * 5;
    px(-16, by + 4 + arm, 5, 14, '#e8b894'); px(-16, by + 6 + arm, 5, 4, PINK); px(-16, by + 11 + arm, 5, 3, CYAN);
    px(11, by + 4 - arm, 5, 14, '#e8b894'); px(11, by + 7 - arm, 5, 3, PURPLE);
    px(10, by + 16 - arm, 8, 5, '#444'); px(16, by + 14 - arm, 3, 9, '#999'); px(12, by + 13 - arm, 4, 3, '#c8722a');
    // head from behind: hair and a cap
    var hy = sliding ? -36 : by - 12;
    px(-7, hy, 14, 12, '#e8b894');
    px(-8, hy - 2, 16, 8, '#2a1a12');
    px(-9, hy - 5, 18, 5, PINK); px(-9, hy - 1, 18, 2, '#a00c5e');
    if (stumble && Math.floor(frame / 5) % 2 === 0) { ctx.fillStyle = YELLOW; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('*', 14, hy - 8); }
    ctx.restore();
    if (coffeeT > 0) {
      ctx.fillStyle = 'rgba(255,215,0,0.25)';
      for (var i = 0; i < 3; i++) px(x - 22 + i * 4 - (frame % 6), FLOOR_Y - 30 - i * 8, 10, 2, 'rgba(255,215,0,0.35)');
    }
  }

  function drawHud(zd) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, wall.best(), score), 8, 26);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'center';
    ctx.fillText(zd.name, W / 2, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText(Math.round(dist) + 'M', W / 2, 26);
    ctx.textAlign = 'right';
    var m = mult();
    ctx.fillStyle = m >= 4 ? PINK : m > 1 ? YELLOW : '#9aa';
    ctx.fillText('INK x' + m, W - 8, 14);
    // chain meter
    px(W - 68, 18, 60, 3, 'rgba(255,255,255,0.15)');
    px(W - 68, 18, 60 * Math.min(1, chainT / 95), 3, m > 1 ? YELLOW : PINK);
    ctx.fillStyle = '#9aa';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('CHAIN ' + chain + (chain > 0 && chain % 5 !== 0 ? ' // ' + (5 - chain % 5) + ' TO x' + (m + 1) : ''), W - 8, 30);
    // lives as tiny machines
    for (var i = 0; i < 3; i++) {
      var on = i < lives;
      px(150 + i * 14, 20, 8, 4, on ? PINK : 'rgba(255,255,255,0.18)');
      px(156 + i * 14, 18, 2, 8, on ? '#ccc' : 'rgba(255,255,255,0.18)');
    }
    // timed powers
    var py = 40;
    if (magnetT > 0) { ctx.textAlign = 'left'; ctx.fillStyle = CYAN; ctx.font = 'bold 8px monospace'; ctx.fillText('MAGNET', 8, py + 8); px(52, py + 2, 60, 4, 'rgba(255,255,255,0.15)'); px(52, py + 2, 60 * magnetT / 420, 4, CYAN); py += 12; }
    if (coffeeT > 0) { ctx.textAlign = 'left'; ctx.fillStyle = YELLOW; ctx.font = 'bold 8px monospace'; ctx.fillText('SPRINT', 8, py + 8); px(52, py + 2, 60, 4, 'rgba(255,255,255,0.15)'); px(52, py + 2, 60 * coffeeT / 300, 4, YELLOW); py += 12; }
    if (shieldOn) { ctx.textAlign = 'left'; ctx.fillStyle = CYAN; ctx.font = 'bold 8px monospace'; ctx.fillText('STENCIL SHIELD', 8, py + 8); py += 12; }
    if (slowT > 0) { ctx.textAlign = 'left'; ctx.fillStyle = PURPLE; ctx.font = 'bold 8px monospace'; ctx.fillText('SLIPPING', 8, py + 8); }
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var zd = zoneDef(zone);
    ctx.save();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    if (coffeeT > 0) { ctx.translate(W / 2, H / 2); ctx.scale(1.02, 0.99); ctx.translate(-W / 2, -H / 2); }
    drawBackdrop(zd);
    drawFloor(zd);
    // everything on the track, far to near
    var all = [];
    for (var i = 0; i < props.length; i++) all.push({ z: props[i].z, t: 'p', o: props[i] });
    for (var j = 0; j < obstacles.length; j++) all.push({ z: obstacles[j].z, t: 'o', o: obstacles[j] });
    for (var k = 0; k < pickups.length; k++) if (!pickups[k].got) all.push({ z: pickups[k].z, t: 'k', o: pickups[k] });
    all.push({ z: 0, t: 'r' });
    all.sort(function(a, b) { return b.z - a.z; });
    for (var n = 0; n < all.length; n++) {
      var it = all[n];
      if (it.t === 'p') drawProp(it.o);
      else if (it.t === 'o') drawObstacle(it.o);
      else if (it.t === 'k') drawPickup(it.o);
      else drawRunner();
    }
    for (var b = 0; b < birds.length; b++) {
      var bd = birds[b];
      px(bd.x - 4, bd.y, 8, 3, '#889'); px(bd.x - 7, bd.y - (bd.t % 10 < 5 ? 3 : 0), 4, 2, '#889'); px(bd.x + 3, bd.y - (bd.t % 10 < 5 ? 3 : 0), 4, 2, '#889');
    }
    for (var q = 0; q < parts.length; q++) {
      var pt = parts[q];
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / 20));
      px(pt.x, pt.y, pt.s, pt.paper ? pt.s * 1.3 : pt.s, pt.color);
    }
    ctx.globalAlpha = 1;
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,60,60,' + (flashT / 8) * 0.35 + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();

    drawHud(zd);
    for (var r = 0; r < popups.length; r++) {
      var pp = popups[r];
      ctx.globalAlpha = Math.min(1, pp.life / 18);
      ctx.font = 'bold ' + (pp.big ? 13 : 10) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(pp.text, pp.x + 1, pp.y + 1);
      ctx.fillStyle = pp.color; ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerColor;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 40);
      ctx.globalAlpha = 1;
    }
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
          ctx.fillStyle = PINK;
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
    // The track rolls under the title while the kid sprints in place
    var zd = ZONES[0];
    floorOff = (floorOff + 0.35) % 4;
    drawBackdrop(zd);
    drawFloor(zd);
    for (var p = 0; p < props.length; p++) { props[p].z -= 0.35; if (props[p].z < -2) props[p].z += Z_FAR + 2; drawProp(props[p]); }
    player.runT += 0.5; player.x = 0; player.h = t2 % 90 > 70 ? Math.sin(((t2 % 90) - 70) / 20 * Math.PI) * 0.8 : 0;
    drawRunner();
    player.h = 0;
    ctx.textAlign = 'center';
    var tw = 26;
    var title = 'INK RUN';
    for (var i = 0; i < title.length; i++) {
      var lt = Math.max(0, Math.min(1, (t2 - i * 6) / 16));
      if (lt <= 0) continue;
      ctx.font = 'bold 38px monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(title[i], W / 2 - title.length * tw / 2 + i * tw + tw / 2 + 2, 96 - (1 - lt) * (1 - lt) * 160 + 2);
      ctx.fillStyle = i < 3 ? PINK : CYAN;
      ctx.fillText(title[i], W / 2 - title.length * tw / 2 + i * tw + tw / 2, 96 - (1 - lt) * (1 - lt) * 160);
    }
    if (t2 > 60) { ctx.fillStyle = YELLOW; ctx.font = 'bold 11px monospace'; ctx.fillText('THE SHOP FLOOR TO THE MOUNTAIN PASS AT FULL SPRINT', W / 2, 122); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.fillText('LEFT/RIGHT lanes // UP or SPACE jumps // DOWN slides // swipe on phones', W / 2, H - 42);
    ctx.fillText('chain the ink for x8, slide the bars, jump the carts, grab the flash', W / 2, H - 29);
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
