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
  // The announcer's vocabulary: the generic hype plus the skate-specific
  // lines (public/audio/arcade/skate-*.mp3). Never the same line twice in a
  // row, and a cooldown so he is not talking over himself.
  var YEAHS = ['gnarly', 'so-sick', 'radical', 'shred-it', 'skate-sick', 'skate-huge', 'skate-fire', 'skate-combo', 'skate-clean', 'skate-keepgoing'];
  var lastLingo = '';
  function pickLine(list) {
    var l = list[Math.floor(Math.random() * list.length)];
    if (l === lastLingo && list.length > 1) l = list[(list.indexOf(l) + 1) % list.length];
    lastLingo = l;
    return l;
  }
  function sayLingo() {
    if (lingoCd > 0) return;
    lingoCd = 700;
    say(pickLine(YEAHS));
  }
  // A specific call for a specific moment, same cooldown, same no-repeat rule.
  function sayMoment(name, force) {
    if (lingoCd > 0 && !force) return;
    lingoCd = 500;
    lastLingo = name;
    say(name, 100);
  }
  var upHeld = false, downHeld = false, grabT = 0, grabTotal = 0, wasGrabbing = false;
  var manualT = 0, wasManual = false, grindTilt = 0, usedNose = false, usedFive = false;
  // The line: every trick since your wheels last touched flat ground pools
  // into linePts, combo is the multiplier, and the whole thing banks when you
  // land. Land mid-spin and it banks at half. Bail and it is gone.
  var linePts = 0, lineTricks = [], bestLine = 0, trickCount = 0, comboMax = 1;
  var looseBoard = null; // the deck flying off on a bail
  var hitsThisLevel = 0, manualBal = 0, manualBailT = 0, lineFlashT = 0;
  // Terrain + the second pass: the ground rolls, the camera follows, air is
  // real, and the trick list is long. World y for everything in play; the
  // screen is world minus camY.
  var camY = 0, features = [], nextFeatureX = 0, groundSlope = 0, airTop = 0, maxAir = 0, airCount = 0;
  var spinAngle = 0, spinDir = 0, spinStep = 0, leftHold = -1, rightHold = -1, upHold = -1, downHold = -1;
  var leftHeld = false, rightHeld = false, grabName = '', railUsed = {}, slideT = 0, manualKind = 'manual';
  var continueUsed = false, lastLevel = 1, lastScore = 0, pumpT = 0, lipT = 0;
  var MAX_LIVES = 5;
  var airFrames = 0, longestAir = 0, floaty = false;
  var peakHit = false;
  // The flip book: a tap is a press under 8 frames; two taps within 14 read as one trick.
  var FLIPS = {
    'R':  { name: 'KICKFLIP',        pts: 15, roll: 1,  yaw: 0,    dur: 24 },
    'L':  { name: 'HEELFLIP',        pts: 15, roll: -1, yaw: 0,    dur: 24 },
    'RR': { name: '360 FLIP',        pts: 45, roll: 1,  yaw: 1,    dur: 32 },
    'LL': { name: 'LASER FLIP',      pts: 55, roll: -1, yaw: -1,   dur: 34 },
    'RL': { name: 'VARIAL KICKFLIP', pts: 25, roll: 1,  yaw: 0.5,  dur: 26 },
    'LR': { name: 'VARIAL HEELFLIP', pts: 25, roll: -1, yaw: -0.5, dur: 26 },
    'DR': { name: 'HARDFLIP',        pts: 35, roll: 1,  yaw: 0.5,  dur: 28, pop: 1 },
    'DL': { name: 'INWARD HEELFLIP', pts: 35, roll: -1, yaw: 0.5,  dur: 28, pop: 1 },
    'UR': { name: 'IMPOSSIBLE',      pts: 40, roll: 0,  yaw: 0,    dur: 28, wrap: 1 },
    'UL': { name: 'NOLLIE HEELFLIP', pts: 30, roll: -1, yaw: 0,    dur: 22, nose: 1 },
    'UU': { name: 'DOUBLE KICKFLIP', pts: 60, roll: 2,  yaw: 0,    dur: 30 },
    'DD': { name: 'POP SHOVE-IT',    pts: 20, roll: 0,  yaw: 1,    dur: 20 },
  };
  var FLIP_GOALS = ['360 FLIP', 'LASER FLIP', 'HARDFLIP', 'INWARD HEELFLIP', 'IMPOSSIBLE', 'DOUBLE KICKFLIP', 'VARIAL KICKFLIP'];
  var flipAnim = null, tapQ = [], lastFlipPts = 0, lastFlipLabel = '', airPeakH = 0, landedFlip = '';
  var grindBal = 0, lastBailReason = '', boost = 0, nextBeatX = 0, lastBeat = 'rail', grindCount = 0, rampAirs = 0, slowT = 0, slowTick = 0, hintT = 0, airName = '', airNameT = 0, bookOpen = false;
  // Park goals: each town sets a few, the town's end tallies them into a bonus.
  var goals = [], goalCardT = 0, tallyT = 0, tallyLines = [], townScoreStart = 0, letters = [], nextLetterX = 0, lettersGot = 0, goalsDoneTotal = 0;
  var special = 0, specialUsed = 0, grabsLanded = 0, townGrabs = 0, townGrindFeet = 0;
  var MAX_COMBO = 24, linkWindow = 0, grindDist = 0, grindPaid = 0, lastGrindEnd = -99, lastRailId = -1, railSeq = 0, transfers = 0, longestGrind = 0;

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
  // The attract screen gets a driving punk loop: hype, not a dirge.
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
    { name: 'DOWNTOWN DENVER', scene: 'city',      top: '#1a0a2e', bot: '#2d1b69', ground: '#555',    dash: '#777',    lights: true,  stars: true,  moon: true,  sun: null,      sunY: 0,   sig: 'kicker' },
    { name: 'RINO',            scene: 'rino',      top: '#3b1a4a', bot: '#e8683c', ground: '#4e4a52', dash: '#736c76', lights: true,  stars: false, moon: false, sun: '#ffb070', sunY: 200, sig: 'launch' },
    { name: 'COLFAX AT NIGHT', scene: 'city',      top: '#080614', bot: '#1c1240', ground: '#3e3e48', dash: '#5a5a66', lights: true,  stars: false, moon: true,  sun: null,      sunY: 0,   weather: 'rain', sig: 'kicker' },
    { name: 'THE FLATIRONS',   scene: 'flatirons', top: '#3a1c5e', bot: '#e8642c', ground: '#54484e', dash: '#78645e', lights: true,  stars: false, moon: false, sun: '#ff9a3c', sunY: 175, sig: 'qp' },
    { name: 'RED ROCKS',       scene: 'redrocks',  top: '#2e78c8', bot: '#93c6e8', ground: '#8a5a46', dash: '#a37058', lights: false, stars: false, moon: false, sun: '#fff3b0', sunY: 58,  sig: 'steps' },
    { name: 'GOLDEN',          scene: 'golden',    top: '#6fb3e8', bot: '#dceaf4', ground: '#6a6058', dash: '#8c8078', lights: false, stars: false, moon: false, sun: '#fff8c8', sunY: 70,  sig: 'gap' },
    { name: 'IDAHO SPRINGS',   scene: 'mining',    top: '#5a5e6a', bot: '#b8b4aa', ground: '#5e5248', dash: '#7e7066', lights: true,  stars: false, moon: false, sun: null,      sunY: 0,   sig: 'kicker' },
    { name: 'BRECKENRIDGE',    scene: 'range',     top: '#5a6a86', bot: '#c8d2de', ground: '#d8dde4', dash: '#aab2bc', lights: false, stars: false, moon: false, sun: null,      sunY: 0,   weather: 'snow', sig: 'launch' },
    { name: 'VAIL PASS',       scene: 'vail',      top: '#0e1c3c', bot: '#7a9cc8', ground: '#c9d2dc', dash: '#98a4b2', lights: false, stars: true,  moon: false, sun: '#ffd8a0', sunY: 150, weather: 'snow', sig: 'qp' },
    { name: 'MOAB',            scene: 'moab',      top: '#ff9a4a', bot: '#ffd9a0', ground: '#a8503a', dash: '#c8785c', lights: false, stars: false, moon: false, sun: '#fff0c0', sunY: 62,  sig: 'launch' },
    { name: 'THE VEGAS STRIP', scene: 'vegas',     top: '#05030f', bot: '#2a0a4a', ground: '#2c2c36', dash: '#5a5a70', lights: true,  stars: true,  moon: false, sun: null,      sunY: 0,   sig: 'steps' },
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
    setupHiRes();
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = MAX_LIVES; speed = 4; frame = 0; dist = 0; mode = 'intro'; introT = 0;
    level = 1; bannerT = 0; bannerText = ''; shieldT = 0;
    scrollX = 0; combo = 1; comboTimer = 0; shake = 0;
    holdingJump = false; coyote = 0; jumpBuffer = 0; flipped = false;
    usedHeel = false; usedShove = false; usedImp = false; usedBack = false; lastUpTap = -99;
    upHeld = false; downHeld = false; grabT = 0; grabTotal = 0; wasGrabbing = false;
    manualT = 0; wasManual = false; grindTilt = 0; usedNose = false; usedFive = false;
    linePts = 0; lineTricks = []; bestLine = 0; trickCount = 0; comboMax = 1;
    hitsThisLevel = 0; manualBal = 0; manualBailT = 0; lineFlashT = 0;
    camY = 0; features = []; nextFeatureX = 900; groundSlope = 0; airTop = 0; maxAir = 0; airCount = 0;
    spinAngle = 0; spinDir = 0; spinStep = 0; leftHold = -1; rightHold = -1; upHold = -1; downHold = -1;
    leftHeld = false; rightHeld = false; grabName = ''; railUsed = {}; slideT = 0; manualKind = 'manual';
    continueUsed = false; lastLevel = 1; lastScore = 0; pumpT = 0; lipT = 0;
    flipAnim = null; tapQ = []; lastFlipPts = 0; lastFlipLabel = ''; airPeakH = 0; landedFlip = '';
    airFrames = 0; longestAir = 0; floaty = false; grindBal = 0; lastBailReason = ''; boost = 0; nextBeatX = 700; lastBeat = 'rail'; grindCount = 0; rampAirs = 0; slowT = 0; slowTick = 0; hintT = 0; bookOpen = false; airName = ''; airNameT = 0;
    goals = []; goalCardT = 0; tallyT = 0; tallyLines = []; townScoreStart = 0; letters = []; nextLetterX = 1200; lettersGot = 0; goalsDoneTotal = 0;
    special = 0; specialUsed = 0; grabsLanded = 0; townGrabs = 0;
    setGoals(1);
    linkWindow = 0; grindDist = 0; grindPaid = 0; lastGrindEnd = -99; lastRailId = -1; railSeq = 0; transfers = 0; longestGrind = 0;
    musicStep = -1; musicFrame = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = String(MAX_LIVES);
    player = { x: 60, y: GROUND_Y - 20, w: 20, h: 20, vy: 0, onGround: true, grinding: false, grindRail: null, invincible: 0, flipT: 0, heelT: 0, shoveT: 0, impT: 0, backT: 0, squash: 0, pushT: 0, popT: 0, bailT: 0 };
    looseBoard = null;
    obstacles = []; collectibles = []; rails = []; particles = []; buildings = []; popups = [];
    for (var i = 0; i < 10; i++) buildings.push(makeBuilding(i * 80));
    spawnInitial();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'TAP ollie // swipe + hold: spins, grabs // swipe down + hold on landing: manual' : 'SPACE ollie // hold UP at a lip // tap L/R flip, hold to spin // hold UP/DOWN grab // DOWN: manual';
    window.skateRunning = true;
    startLoop();
  }

  function makeBuilding(x) {
    var h = 40 + Math.random() * 80;
    var colors = ['#1a1a3e', '#2a1a4e', '#1a2a3e', '#2e1a2e', '#1a1a2a'];
    return { x: x, w: 30 + Math.random() * 40, h: h, color: colors[Math.floor(Math.random() * colors.length)] };
  }

  // ── Terrain: a flat road with ramps on it (Ski Safari, not a hill climb) ──
  // The ground lives in one fixed band around GROUND_Y: long flats and
  // rollers of a few px over a whole screen, never a slope you have to read.
  // All the air comes from placed ramps: kickers, launch ramps and half-pipe
  // lips, bigger and more frequent town by town, each with a flat landing
  // zone kept clear of anything solid. World y: bigger is lower.
  var ROLL = [
    { a: 3, f: 0.0016 }, { a: 4, f: 0.0015 }, { a: 3, f: 0.0017 }, { a: 6, f: 0.0015 }, { a: 6, f: 0.0014 },
    { a: 5, f: 0.0015 }, { a: 7, f: 0.0013 }, { a: 8, f: 0.0013 }, { a: 8, f: 0.0012 }, { a: 6, f: 0.0014 }, { a: 2, f: 0.0018 },
  ];
  var TOWN_PX = 24000; // one town, in road pixels (4000 of dist): two to three minutes at a glide
  function hillY(x) {
    if (x < 300) return 0;
    var lv = 1 + Math.floor(x / TOWN_PX);
    var r = ROLL[(lv - 1) % ROLL.length];
    var ease = Math.min(1, (x - 300) / 600);
    return ease * (Math.sin(x * r.f) * r.a + Math.sin(x * r.f * 2.6 + 1.7) * r.a * 0.35);
  }
  // Ramp faces. A kicker is a straight wedge, a launch ramp curves up harder
  // toward the lip, a half-pipe lip goes near vertical. Past the lip the
  // ground is the flat road again: that is the drop you fly over.
  function featureOffset(x) {
    var off = 0;
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (x < f.x || x >= f.x + f.w) continue;
      var t = (x - f.x) / f.w;
      if (f.type === 'kicker') off -= f.h * t;
      else if (f.type === 'launch') off -= f.h * Math.pow(t, 1.6);
      else if (f.type === 'qp') off -= f.h * (1 - Math.cos(t * Math.PI / 2));
      else if (f.type === 'stairs') {
        // Steps down over the first part, a low run, then a bank back up to the road.
        var stepPart = 0.55;
        if (t < stepPart) off += f.h * Math.floor(t / stepPart * 5) / 5;
        else if (t < 0.8) off += f.h;
        else off += f.h * (1 - (t - 0.8) / 0.2);
      }
    }
    return off;
  }
  function terrainY(x) { return GROUND_Y + hillY(x) + featureOffset(x); }
  function slopeAt(x) { return (terrainY(x + 6) - terrainY(x - 6)) / 12; }
  // The ramp itself plus its landing zone, where nothing solid may sit.
  function landingZone(f) { return f.type === 'kicker' ? 420 : f.type === 'launch' ? 640 : f.type === 'stairs' ? 120 : 760; }
  function featureAt(x) {
    for (var i = 0; i < features.length; i++) if (x >= features[i].x - 40 && x < features[i].x + features[i].w + landingZone(features[i]) * 0.8) return features[i];
    return null;
  }
  // Sizes by town: kickers everywhere, launch ramps from town 2, half-pipe
  // lips from town 3. Heights climb 6px a town.
  function spawnFeature(x) {
    var lv = 1 + Math.floor(x / TOWN_PX);
    var tier = Math.min(8, lv);
    var town = LOCALES[(lv - 1) % LOCALES.length];
    var r = Math.random();
    // The town's signature tilts the odds: RiNo, Breck and Moab throw launch
    // ramps, the Flatirons and Vail pass have the lips, Vegas goes big on everything.
    if (town.sig === 'launch') r *= 0.6;
    if (town.sig === 'qp') r = 0.5 + r * 0.5;
    var f;
    // Stair sets with a handrail over them: from town 2, a quarter of the
    // features (more in the stepped towns). Clear the steps or grind the rail.
    var stairOdds = lv >= 2 ? (town.sig === 'steps' ? 0.46 : 0.38) : 0.34;
    if (Math.random() < stairOdds) {
      f = { type: 'stairs', x: x, w: 150 + tier * 8, h: 22 + Math.min(20, tier * 3) };
      features.push(f);
      var railTop = terrainY(x - 4) - 30;
      rails.push({ x: x - 8, top: railTop, w: f.w * 0.5, scored: false, id: ++railSeq, seg: 0, segs: 1, kind: 'handrail', bodyH: 0, waxed: false });
      return f;
    }
    // Big from the first town: a kicker is 40px of lip, a launch ramp 60 to 120, a half-pipe lip 70 to 130.
    if (r < 0.3) f = { type: 'kicker', x: x, w: 80 + tier * 4, h: 40 + tier * 6 };
    else if (lv <= 1 || r < 0.7) f = { type: 'launch', x: x, w: 150 + tier * 6, h: 60 + tier * 8 };
    else f = { type: 'qp', x: x, w: 80, h: 70 + tier * 8 };
    if (town.scene === 'vegas') { f.h += 10; f.w += 8; }
    features.push(f);
    return f;
  }

  function spawnInitial() {
    nextBeatX = scrollX + 520;
    lastBeat = 'ramp';
  }

  function spawnAt(sx) {
    var r = Math.random();
    var onRamp = featureAt(sx);
    var townNow = LOCALES[(level - 1) % LOCALES.length];
    // A third of the old hazard rate, and none of it deadly: pigeons, a dog,
    // a cyclist steal the line, a spill scrubs speed. Never in a landing zone.
    if (r < 0.15 && !onRamp) {
      var types = ['pigeon'];
      if (level >= 2) types.push('spill');
      if (level >= 3) types.push('dog');
      if (level >= 5) types.push('cyclist');
      obstacles.push(makeObstacle(types[Math.floor(Math.random() * types.length)], sx));
    } else if (r < 0.5 || onRamp) {
      var lift = 40 + Math.random() * 30;
      var ft = onRamp;
      if (ft && sx > ft.x + ft.w) lift = 80 + Math.random() * 110;
      var k = Math.random();
      var kind = (k < 0.045 && lives < MAX_LIVES) ? 'deck' : k < 0.1 ? 'horseshoe' : k < 0.2 ? 'eagle' : k < 0.36 ? 'skull' : k < 0.58 ? 'heart' : k < 0.8 ? 'bolt' : 'star';
      collectibles.push({ x: sx, y: terrainY(sx) - lift, lift: lift, w: 14, h: 14, collected: false, kind: kind });
    } else {
      // Everything else on the street is something to skate.
      spawnRailLine(sx);
    }
    void townNow;
  }

  function makeObstacle(type, x) {
    if (type === 'pigeon') return { type: 'pigeon', x: x, y: GROUND_Y - 52, w: 14, h: 10 };
    if (type === 'spill') return { type: 'spill', x: x, y: GROUND_Y - 4, w: 34, h: 4 };
    if (type === 'dog') return { type: 'dog', x: x, y: GROUND_Y - 12, w: 18, h: 12, minGap: 99 };
    if (type === 'cyclist') return { type: 'cyclist', x: x, y: GROUND_Y - 30, w: 18, h: 30, minGap: 99 };
    // A car pulling out of a spot: the one thing on the road that really hurts.
    // It sits at the curb flashing and honking for a beat, then it is in the lane.
    // Later towns: longer cars (a van, a bus) that take a real ollie to clear.
    var cl = 1 + Math.floor(x / TOWN_PX);
    var cw = 96 + Math.min(96, Math.max(0, cl - 2) * 14);
    return { type: 'car', x: x, y: GROUND_Y - 28, w: cw, h: 28 + Math.min(10, Math.max(0, cl - 3) * 2), warnT: 90, out: false, minGap: 99 };
  }

  // A rail line: one to five segments with kinks (a step up or down) and
  // gaps you hop across to keep the grind alive. Some run a full screen or
  // more. Red Rocks and Vegas get the long ones.
  var FURNITURE = {
    rail:     { h: 34, w: [110, 300], color: '#c8ccd2' },
    bench:    { h: 14, w: [60, 100],  color: '#8a6438' },
    planter:  { h: 18, w: [50, 80],   color: '#6a6a72' },
    ledge:    { h: 22, w: [140, 260], color: '#9a9aa2' },
    hydrant:  { h: 20, w: [14, 14],   color: '#ff3333' },
    dumpster: { h: 34, w: [48, 60],   color: '#3a6a3a' },
    carhood:  { h: 26, w: [96, 110],  color: '#b02040' },
  };
  var TOWN_FURNITURE = {
    city: ['rail', 'bench', 'ledge', 'hydrant', 'dumpster', 'carhood', 'planter'],
    rino: ['ledge', 'dumpster', 'rail', 'carhood', 'planter'],
    flatirons: ['bench', 'planter', 'ledge', 'rail'],
    redrocks: ['ledge', 'rail', 'ledge'],
    golden: ['rail', 'bench', 'planter', 'hydrant'],
    mining: ['rail', 'ledge', 'dumpster'],
    range: ['bench', 'rail', 'planter'],
    vail: ['rail', 'ledge', 'bench'],
    moab: ['ledge', 'rail'],
    vegas: ['rail', 'ledge', 'carhood', 'planter', 'dumpster'],
  };
  // A line of street furniture: one to five pieces with kinks and gaps you
  // hop across to keep the grind alive. Benches, ledges, planters, hydrant
  // caps, dumpster lids, car hoods and handrails are all things you grind.
  function spawnRailLine(sx) {
    var town = LOCALES[(level - 1) % LOCALES.length];
    var pool = TOWN_FURNITURE[town.scene] || TOWN_FURNITURE.city;
    var long = Math.random() < (town.sig === 'steps' || town.sig === 'gap' ? 0.85 : 0.65);
    var segs = long ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    var x = sx, id = ++railSeq;
    var kind = pool[Math.floor(Math.random() * pool.length)];
    for (var i = 0; i < segs; i++) {
      if (i > 0 && Math.random() < 0.5) kind = pool[Math.floor(Math.random() * pool.length)];
      var spec = FURNITURE[kind];
      var w = spec.w[0] + Math.random() * (spec.w[1] - spec.w[0]);
      if (long && kind !== 'hydrant') w += 120 + Math.random() * 120;
      var top = Math.min(terrainY(x), terrainY(x + w)) - spec.h;
      rails.push({ x: x, top: top, w: w, scored: false, id: id, seg: i, segs: segs, kind: kind, bodyH: spec.h, waxed: Math.random() < 0.6 });
      x += w + 34 + Math.random() * 40;
    }
    return x;
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
    if (!stale && combo < MAX_COMBO) {
      combo++;
      if (combo === 5 || combo === 12 || combo === 20) sayLingo();
    }
    if (combo > comboMax) comboMax = combo;
    comboTimer = 150;
    addSpecial(pts);
    addPopup(x, y, label + (stale ? ' STALE +' : ' +') + pts, stale ? '#9aa' : (combo > 1 ? YELLOW : '#fff'));
    if (combo > 2 && !stale) sfxCombo(combo);
  }

  function resetLine() { linePts = 0; lineTricks = []; combo = 1; comboTimer = 0; linkWindow = 0; }

  // Wheels down on flat ground: the line pays out. Still spinning when you
  // touch down is a sketchy landing and pays half.
  function bank(sketchy) {
    if (linePts <= 0) { resetLine(); return; }
    var total = Math.round(linePts * combo * (sketchy ? 0.5 : 1));
    if (special >= 100) { total = Math.round(total * 1.5); useSpecial(); addPopup(player.x + player.w / 2, player.y - 40, 'SPECIAL x1.5', CYAN); }
    score += total;
    document.getElementById('jd-br-score').textContent = score;
    var px = player.x + player.w / 2, py = player.y - 18;
    var label = sketchy ? 'SKETCHY +' + total : (lineTricks.length >= 3 ? 'LINE x' + combo + ' +' + total : 'LANDED +' + total);
    addPopup(px, py, label, sketchy ? '#ff9a3c' : LIME);
    if (total >= 300) {
      shake = Math.min(10, 3 + total / 200);
      spawnParticles(px, player.y + player.h, YELLOW, Math.min(30, 8 + total / 60));
      lineFlashT = 18;
    }
    // The payout is the event: the bigger the line, the bigger the moment.
    if (total >= 5000) { bannerT = 120; bannerText = 'LEGENDARY LINE +' + total; shake = 16; lineFlashT = 40; sayMoment('skate-legend', true); spawnParticles(px, player.y + player.h, '#fff', 40); }
    else if (total >= 2000) { bannerT = 90; bannerText = 'HUGE LINE +' + total; shake = 11; lineFlashT = 28; sayMoment('skate-huge', true); spawnParticles(px, player.y + player.h, YELLOW, 24); }
    else if (total >= 500) { bannerT = 60; bannerText = 'SICK LINE'; sayMoment('skate-sick'); }
    if (!sketchy && lineTricks.length >= 2) sfxCombo(6);
    if (total > bestLine) bestLine = total;
    goalProgress('line', total);
    goalProgress('points', score - townScoreStart);
    resetLine();
  }

  // Losing a board. Only failed tricks and the few real hazards call this:
  // a car, a missed gap, landing sideways off a big spin, tipping a grind or
  // a manual. Street furniture never does.
  function bail(reason) {
    lives--;
    hitsThisLevel++;
    lastBailReason = reason;
    sfxHit();
    document.getElementById('jd-br-lives').textContent = lives;
    addPopup(player.x + player.w / 2, player.y - 34, reason + ' // ' + (lives > 0 ? lives + (lives === 1 ? ' BOARD LEFT' : ' BOARDS LEFT') : 'OUT OF BOARDS'), '#FF5050');
    player.invincible = 110;
    player.bailT = 36;
    player.grinding = false; player.grindRail = null; manualBailT = 40; manualT = 0;
    looseBoard = { x: player.x + 10, y: player.y + 17, vx: 3 + Math.random() * 2, vy: -5 - Math.random() * 2, rot: 0, t: 60 };
    loseLine('BAILED');
    sayMoment('skate-bail');
    shake = 12;
    spawnDust(player.x + player.w / 2, player.y + player.h, 8);
    spawnParticles(player.x + player.w / 2, player.y, '#FF0000', 10);
    speed = Math.max(2.4, speed * 0.7);
    if (lives <= 0) {
      lastScore = score;
      enterBoard(score);
      saveBest();
      deathJingle();
      return true;
    }
    return false;
  }

  // ── Park goals ──
  // Three per town from a pool, scaled by the town tier. The card shows at
  // the town's start; the list rides the HUD; the tally at the town's end
  // pays 800 a goal times the tier, and a clean sweep pays extra.
  function setGoals(lv) {
    var tier = Math.min(8, lv), town = LOCALES[(lv - 1) % LOCALES.length];
    var wantFlip = FLIP_GOALS[Math.floor(Math.random() * FLIP_GOALS.length)];
    var pool = [
      { id: 'bigair', text: 'BIG AIR ' + (240 + tier * 20), need: 240 + tier * 20, have: 0 },
      { id: 'grindtown', text: 'GRIND ' + (1200 + tier * 200) + ' FEET' + (town.sig === 'steps' ? ' OF STEPS' : ''), need: 1200 + tier * 200, have: 0 },
      { id: 'spin', text: (tier >= 3 ? '720' : '540') + ' OFF A RAMP', need: tier >= 3 ? 4 : 3, have: 0 },
      { id: 'letters', text: 'COLLECT S-K-A-T-E', need: 5, have: 0 },
      { id: 'line', text: 'SICK LINE ' + (1500 * tier), need: 1500 * tier, have: 0 },
    ];
    goals = [];
    // Letters always, then two picked from the air-and-rail set
    goals.push(pool[3]);
    var rest = [pool[0], pool[1], pool[2], pool[4]];
    if (lv >= 3) rest.push({ id: 'flip', text: 'LAND A ' + wantFlip, need: 1, have: 0, want: wantFlip });
    for (var i = 0; i < 2; i++) goals.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    townGrindFeet = 0;
    for (var g = 0; g < goals.length; g++) goals[g].done = false;
    goalCardT = 200;
    townScoreStart = score;
    lettersGot = 0; townGrabs = 0;
    letters = [];
    nextLetterX = scrollX + 900;
  }
  function goalProgress(id, value) {
    for (var g = 0; g < goals.length; g++) {
      var gl = goals[g];
      if (gl.id !== id || gl.done) continue;
      if (id === 'flip') { if (value !== gl.want) continue; value = 1; }
      gl.have = Math.max(gl.have, value);
      if (gl.have >= gl.need) {
        gl.done = true; goalsDoneTotal++;
        addPopup(player.x + player.w / 2, player.y - 46, 'GOAL: ' + gl.text, LIME);
        bannerT = 70; bannerText = 'GOAL DONE'; sayMoment('skate-goal', true);
        sfxCombo(7); spawnParticles(player.x + player.w / 2, player.y, LIME, 16);
        say('radical', 100);
      }
    }
  }
  function tallyTown(lv) {
    var tier = Math.min(8, lv);
    var done = 0;
    tallyLines = [];
    for (var g = 0; g < goals.length; g++) { if (goals[g].done) done++; tallyLines.push({ text: goals[g].text, ok: goals[g].done }); }
    var bonus = done * 800 * tier + (done === goals.length ? 1500 * tier : 0);
    if (bonus > 0) { score += bonus; document.getElementById('jd-br-score').textContent = score; }
    tallyLines.push({ text: 'TOWN BONUS +' + bonus + (done === goals.length ? ' // CLEAN SWEEP' : ''), ok: bonus > 0 });
    tallyT = 240; sayMoment('skate-town', true);
  }
  // The special meter fills with tricks and drains while you coast. Full, it
  // unlocks the specials: a christ air, a darkslide, and spins past 720.
  function addSpecial(pts) {
    special = Math.min(100, special + pts * 0.45);
    if (special >= 100 && !specialArmed) { specialArmed = true; specialFlashT = 60; sayMoment('skate-special', true); }
    if (special < 100) specialArmed = false;
  }
  var specialFlashT = 0, specialArmed = false;
  function useSpecial() { special = 0; specialUsed++; }

  // A bail throws the whole line away.
  function loseLine(reason) {
    if (linePts > 0) {
      addPopup(player.x + player.w / 2, player.y - 18, reason + ' LOST +' + (linePts * combo), '#ff5050');
    }
    resetLine();
  }

  // ── Input ──
  // SPACE: hold to ollie higher. Arrows tap for flips, hold for spins and
  // grabs. In a grind the arrows switch the trick. On the ground: DOWN into a
  // manual, UP into a nose manual, LEFT taps a powerslide, RIGHT pushes.
  function press() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') {
      if (wall.inBeat()) return;
      // One continue per run: SPACE drops the credit and puts you back at the
      // top of the town you died in with your score. DOWN on the board starts fresh.
      if (!continueUsed && lastLevel >= 2) { continueRun(); return; }
      init(); mode = 'play'; return;
    }
    holdingJump = true;
    jumpBuffer = 7;
  }
  function release() {
    holdingJump = false;
    if (mode === 'play' && !player.onGround && !player.grinding && player.vy < -3.5) player.vy = -3.5;
  }

  function continueRun() {
    var keepScore = lastScore, lv = lastLevel;
    init();
    continueUsed = true;
    mode = 'play';
    level = lv; score = keepScore; lives = MAX_LIVES;
    dist = (lv - 1) * 4000; scrollX = (lv - 1) * TOWN_PX; nextBeatX = scrollX + 700;
    obstacles = []; collectibles = []; rails = []; features = [];
    spawnInitial();
    player.y = terrainY(scrollX + player.x + player.w / 2) - player.h;
    camY = 0;
    player.invincible = 120;
    hitsThisLevel = 0;
    bannerT = 110; bannerText = 'CONTINUE: ' + LOCALES[(lv - 1) % LOCALES.length].name;
    document.getElementById('jd-br-score').textContent = score;
    document.getElementById('jd-br-lives').textContent = lives;
  }
  function newRun() { init(); mode = 'play'; }

  function heightAboveGround() { return terrainY(scrollX + player.x + player.w / 2) - (player.y + player.h); }
  function lateLabel(name) { return (!player.onGround && player.vy > 1 && heightAboveGround() < 28) ? 'LATE ' + name : name; }
  function airTrick(base, name) {
    trick(base, player.x + player.w / 2, player.y - 8, name);
    airName = name; airNameT = 50;
  }
  // A tap in the air. Two taps within 14 frames become one trick and replace
  // the single that already fired (a kickflip becomes a 360 flip on the second
  // RIGHT), so nothing waits on the second tap. Late in the air pays double.
  function flipTap(key) {
    if (!airborne()) return;
    var now = frame;
    var prev = tapQ.length ? tapQ[tapQ.length - 1] : null;
    var code = null;
    if (prev && now - prev.f <= 14 && !prev.used) { code = prev.k + key; }
    else code = key;
    var spec = FLIPS[code];
    if (!spec && code.length === 2) { spec = FLIPS[key]; code = key; }
    tapQ.push({ k: key, f: now, used: false });
    if (tapQ.length > 4) tapQ.shift();
    if (!spec) return; // a lone UP or DOWN tap waits for its partner
    // A pair replaces the single that just fired
    if (code.length === 2 && lastFlipLabel && prev && !prev.used && now - prev.f <= 14) {
      linePts = Math.max(0, linePts - lastFlipPts);
      var li = lineTricks.lastIndexOf(lastFlipLabel);
      if (li >= 0) lineTricks.splice(li, 1);
      trickCount = Math.max(0, trickCount - 1);
    }
    tapQ[tapQ.length - 1].used = code.length === 2;
    if (prev && code.length === 2) prev.used = true;
    var h = heightAboveGround();
    var late = player.vy > 1 && airPeakH > 60 && h < airPeakH / 3;
    var pts = late ? spec.pts * 2 : spec.pts;
    var label = (late ? 'LATE ' : '') + spec.name;
    flipAnim = { roll: spec.roll, yaw: spec.yaw, dur: spec.dur, t: spec.dur, name: spec.name, pop: spec.pop || 0, wrap: spec.wrap || 0, nose: spec.nose || 0 };
    player.flipT = spec.dur; player.heelT = 0;
    player.vy = Math.min(player.vy, -4);
    sfxFlip();
    airTrick(pts, label);
    lastFlipPts = pts; lastFlipLabel = label;
  }

  function tryJump() {
    if (player.onGround || player.grinding || coyote > 0) {
      var sl = groundSlope;
      player.vy = -9.2;
      // Off a ramp or the wall of a bowl the pop rides the slope. Pumping the
      // transition (holding SPACE on the way up) adds more.
      if (sl < -0.15) player.vy += -(2 + Math.abs(sl) * speed * 0.6) - (pumpT > 4 ? Math.min(3, pumpT * 0.25) : 0);
      player.vy = Math.max(-16, player.vy);
      floaty = sl < -0.3 || player.vy < -11;
      peakHit = false;
      if (floaty) rampAirs++;
      player.onGround = false;
      player.popT = 8;
      spawnDust(player.x + 4, player.y + player.h, 3);
      coyote = 0;
      jumpBuffer = 0;
      flipped = false;
      airTop = player.y; airCount++;
      sfxJump();
      if (player.grinding) { lastGrindEnd = frame; lastRailId = player.grindRail ? player.grindRail.id : -1; player.grinding = false; player.grindRail = null; }
    }
  }

  function airborne() { return mode === 'play' && !player.onGround && !player.grinding; }
  // On a rail LEFT and RIGHT change the grind and lean you that way.
  function railTrick(key) {
    var name = key === 'left' ? (usedNose ? 'CROOKED' : 'NOSEGRIND') : (usedFive ? 'SMITH' : '5-0');
    grindBal += key === 'left' ? -0.35 : 0.35;
    if (railUsed[name]) return;
    railUsed[name] = true;
    if (key === 'left') { usedNose = true; grindTilt = -1; }
    else { usedFive = true; grindTilt = 1; }
    trick(12, player.x + player.w / 2, player.y - 10, name);
    spawnSparks(player.x + 4, player.y + player.h + 2, 6);
  }
  document.addEventListener('keydown', function(e) {
    if (e.code === 'KeyH' && mode === 'play' && window.skateRunning) { e.preventDefault(); toggleBook(); return; }
    if (bookOpen) return;
    if (!window.skateRunning) return;
    if (mode === 'over' && (e.code === 'ArrowDown' || e.code === 'KeyS') && !wall.inBeat()) { e.preventDefault(); newRun(); return; }
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      press();
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      if (e.repeat) return;
      leftHeld = true; leftHold = frame;
      if (mode === 'play' && player.grinding) railTrick('left');
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      if (e.repeat) return;
      rightHeld = true; rightHold = frame;
      if (mode === 'play' && player.grinding) railTrick('right');
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) upHold = frame;
      upHeld = true;
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      if (!e.repeat) downHold = frame;
      downHeld = true;
    }
  });
  document.addEventListener('keyup', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'Space' || e.key === ' ') release();
    var held;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { held = frame - leftHold; leftHeld = false; if (held < 8) flipTap('L'); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { held = frame - rightHold; rightHeld = false; if (held < 8) flipTap('R'); }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { held = frame - upHold; upHeld = false; if (held < 8) flipTap('U'); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { held = frame - downHold; downHeld = false; if (held < 8) flipTap('D'); }
  });
  canvas.addEventListener('mousedown', function(e) { e.preventDefault(); press(); });
  document.addEventListener('mouseup', function() { release(); });
  // Touch: tap = ollie. A swipe holds the matching arrow until the finger
  // lifts, so a flick is a flip and a held swipe is a spin or a grab.
  var swX = 0, swY = 0, swDone = false, swCode = null;
  function sendArrow(type, code) {
    try { document.dispatchEvent(new KeyboardEvent(type, { code: code, key: code, bubbles: true })); } catch (err) {}
  }
  var BOOK_BTN = { x: W - 74, y: H - 20, w: 68, h: 15 };
  function bookHit(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var x = (clientX - r.left) * (W / r.width), y = (clientY - r.top) * (H / r.height);
    return x >= BOOK_BTN.x && x <= BOOK_BTN.x + BOOK_BTN.w && y >= BOOK_BTN.y && y <= BOOK_BTN.y + BOOK_BTN.h;
  }
  function toggleBook() { if (mode === 'play') bookOpen = !bookOpen; }
  canvas.addEventListener('click', function(e) { if (mode === 'play' && (bookOpen || bookHit(e.clientX, e.clientY))) toggleBook(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode === 'play' && (bookOpen || bookHit(e.touches[0].clientX, e.touches[0].clientY))) { toggleBook(); swDone = true; swCode = null; return; }
    swX = e.touches[0].clientX; swY = e.touches[0].clientY; swDone = false;
    press();
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (swDone || !e.touches.length) return;
    var dx = e.touches[0].clientX - swX, dy = e.touches[0].clientY - swY;
    if (Math.abs(dx) < 28 && Math.abs(dy) < 28) return;
    swDone = true;
    swCode = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy < 0 ? 'ArrowUp' : 'ArrowDown');
    sendArrow('keydown', swCode);
  }, { passive: false });
  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    if (swCode) { sendArrow('keyup', swCode); swCode = null; }
    release();
  }, { passive: false });

  // The grab you are doing, from what is held: UP melon, DOWN indy, both
  // method. Add a spin and the names change (nosegrab, stalefish, tailgrab).
  function currentGrab() {
    var u = upHeld && frame - upHold >= 8, d = downHeld && frame - downHold >= 8;
    if (!u && !d) return '';
    if (u && d) return 'METHOD';
    return u ? 'MELON' : 'INDY';
  }

  function update() {
    if (bookOpen) return;
    frame++;
    musicTick();
    // dist counts town distance at a quarter of the road: 4000 of it is one
    // town, 16000px, a minute or more at these speeds.
    dist += speed * (4000 / TOWN_PX);
    scrollX += speed;
    var nl = 1 + Math.floor(dist / 4000);
    if (nl > level) {
      level = nl;
      bannerT = 110;
      bannerText = 'LEVEL ' + level + ': ' + LOCALES[(level - 1) % LOCALES.length].name;
      if (transCtx) {
        try {
          if (typeof transCtx.setTransform === 'function') transCtx.setTransform(1, 0, 0, 1, 0, 0);
          transCtx.clearRect(0, 0, transCanvas.width, transCanvas.height);
          transCtx.drawImage(canvas, 0, 0);
          transT = 55;
        } catch (e) {}
      }
      lingoCd = 0;
      sayLingo();
      sfxCombo(4);
      spawnParticles(player.x + player.w / 2, player.y, YELLOW, 14);
      var townBonus = 100 * (level - 1);
      score += townBonus;
      addPopup(player.x + player.w / 2, player.y - 30, 'NEW TOWN +' + townBonus, LIME);
      if (hitsThisLevel === 0 && level > 1) {
        var cleanBonus = 250 * (level - 1);
        score += cleanBonus;
        addPopup(player.x + player.w / 2, player.y - 44, 'NO BAIL +' + cleanBonus, YELLOW);
      }
      hitsThisLevel = 0;
      tallyTown(level - 1);
      setGoals(level);
      lastLevel = level; lastScore = score;
      document.getElementById('jd-br-score').textContent = score;
    }
    if (goalCardT > 0 && !bookOpen) goalCardT--;
    if (tallyT > 0) tallyT--;
    if (specialFlashT > 0) specialFlashT--;
    // The meter drains while you coast with nothing going.
    if (player.onGround && !player.grinding && linePts === 0 && special > 0 && special < 100) special = Math.max(0, special - 0.05);
    // Speed: the town sets a cruise, hills push and pull, pushes and slides nudge it.
    // A long calm glide. Cruise starts at 2.4 and creeps up a tenth a town.
    // Real speed comes from what you do: a big clean landing and a long grind
    // each add a push that fades slowly back to cruise. Never a jump.
    var cruise = Math.min(6.5, 2.4 + dist / 40000);
    var target = cruise + boost;
    if (boost > 0) boost = Math.max(0, boost - 0.0025);
    player.x += ((76 - (speed - 2.4) * 4) - player.x) * 0.04;
    var wx = scrollX + player.x + player.w / 2;
    groundSlope = slopeAt(wx);
    if (player.onGround && !player.grinding && Math.abs(groundSlope) < 0.12) speed += groundSlope * 0.04;
    speed += (target - speed) * (player.onGround ? 0.012 : 0.004);
    speed = Math.max(cruise * 0.6, Math.min(7.5, speed));
    if (bannerT > 0) bannerT--;
    if (shieldT > 0) shieldT--;
    if (lipT > 0) lipT--;

    if (frame % 30 === 0) {
      score += level >= 3 ? 2 : 1;
      document.getElementById('jd-br-score').textContent = score;
    }

    if (comboTimer > 0) comboTimer--;
    if (manualBailT > 0) manualBailT--;
    if (lineFlashT > 0) lineFlashT--;
    if (lingoCd > 0) lingoCd--;
    if (slideT > 0 && slideT < 999) slideT--;
    if (shake > 0) shake *= 0.85;
    if (player.squash > 0) player.squash *= 0.8;
    if (player.flipT > 0) player.flipT--;
    if (player.heelT > 0) player.heelT--;
    if (flipAnim) { flipAnim.t--; if (flipAnim.t <= 0) flipAnim = null; }
    if (!player.onGround && !player.grinding) airPeakH = Math.max(airPeakH, heightAboveGround());
    if (player.shoveT > 0) player.shoveT--;
    if (player.impT > 0) player.impT--;
    if (player.backT > 0) {
      player.backT--;
      if (frame % 2 === 0) spawnParticles(player.x + player.w / 2, player.y + player.h / 2, CYAN, 1);
    }
    if (coyote > 0) coyote--;
    if (jumpBuffer > 0) { jumpBuffer--; tryJump(); }
    // Hold UP and the board pops itself at every lip and every gap edge: one
    // finger sends it, SPACE on top of that sends it bigger.
    // Off the end of a handrail with the gap still under you: hold UP and you hop it.
    if (upHeld && player.grinding && player.grindRail && player.grindRail.kind === 'handrail' && frame - upHold >= 4) {
      var railEnd = player.grindRail.x + player.grindRail.w;
      if (wx > railEnd - 12 && wx < railEnd + 2) { holdingJump = true; tryJump(); player.vy = Math.min(player.vy, -11); floaty = true; peakHit = false; rampAirs++; }
    }
    if (upHeld && player.onGround && !player.grinding && frame - upHold >= 4) {
      var edge = false, edgeIsGap = false;
      for (var ei = 0; ei < features.length; ei++) {
        var ef = features[ei];
        if (ef.type === 'stairs') { if (wx > ef.x - 26 && wx < ef.x + 2) { edge = true; edgeIsGap = true; } }
        else if (wx > ef.x + ef.w - 10 && wx < ef.x + ef.w + 1) edge = true;
      }
      if (edge) {
        holdingJump = true; tryJump();
        // A gap edge gets a real send: high, floaty, clear of the whole stair set.
        if (!player.onGround && edgeIsGap) { player.vy = Math.min(player.vy, -11.5); floaty = true; peakHit = false; rampAirs++; }
      }
    }
    // Pumping: SPACE held while climbing a transition.
    if (player.onGround && holdingJump && groundSlope < -0.2) pumpT++; else if (player.onGround) pumpT = 0;

    // Player physics: floatier while holding the button on the way up
    var wasOnGround = player.onGround;
    var prevSlope = groundSlope;
    if (!player.grinding) {
      if (wasOnGround) {
        // Follow the ground unless it drops away faster than the wheels can
        // follow: that is a crest, a kicker lip, a ledge. Then you fly.
        var gyNow = terrainY(wx);
        var drop = gyNow - (player.y + player.h);
        var followMax = speed * 0.55 + 2;
        // Roll into a stair set and you eat it: the rail beside it is the line.
        var stairsAhead = null;
        for (var sfj = 0; sfj < features.length; sfj++) { var sfx = features[sfj]; if (sfx.type === 'stairs' && wx > sfx.x + 4 && wx < sfx.x + sfx.w * 0.8) stairsAhead = sfx; }
        if (stairsAhead && player.onGround && player.invincible === 0) { if (bail('MISSED THE GAP')) return; }
        if (drop > followMax) {
          player.onGround = false;
          // Off a lip you carry the ramp's angle at your speed, and a pump
          // on the face adds more. Capped so the sky stays in reach.
          var launch = -(7 + Math.abs(prevSlope) * speed * 1.3) * (prevSlope < -0.25 ? 1 : 0.3) - (pumpT > 4 ? Math.min(3, pumpT * 0.25) : 0);
          player.vy = Math.max(-16, Math.min(0, launch));
          floaty = prevSlope < -0.3 || player.vy < -8;
          peakHit = false;
          airTop = player.y; airCount++;
          if (floaty) rampAirs++;
          if (prevSlope < -0.3) { lipT = 30; spawnDust(player.x + player.w / 2, player.y + player.h, 4); if (player.vy < -9) sfxJump(); }
        } else {
          player.y = gyNow - player.h;
          player.vy = 0;
        }
      } else {
        // Floaty: lighter gravity in the air, and a hang at the top of the arc
        // so there is time to spin and grab.
        // Ramp air floats (Ski Safari); a plain ollie stays snappy.
        // Ramp air is slow and high (Ski Safari): light gravity, lighter still
        // at the peak. A plain ollie stays snappy.
        var g = floaty ? ((holdingJump && player.vy < 0) ? 0.22 : 0.28) : ((holdingJump && player.vy < 0) ? 0.32 : GRAVITY);
        if (floaty && Math.abs(player.vy) < 2) g *= 0.4;
        if (floaty && !peakHit && player.vy > -0.5 && terrainY(wx) - (player.y + player.h) > 120) { peakHit = true; slowT = 24; }
        player.vy += g;
        player.y += player.vy;
        if (player.y < airTop) airTop = player.y;
        airFrames++;
        if (airFrames > longestAir) longestAir = airFrames;
      }
    }

    // Spins: hold LEFT or RIGHT in the air. Every half turn goes on the line.
    if (airborne() && ((leftHeld && frame - leftHold >= 8) || (rightHeld && frame - rightHold >= 8))) {
      var dir = leftHeld ? -1 : 1;
      if (spinDir === 0) spinDir = dir;
      spinAngle += dir * 0.2;
      var half = Math.floor(Math.abs(spinAngle) / Math.PI);
      if (half > spinStep) {
        spinStep = half;
        var names = ['', '180', '360', '540', '720', '900', '1080'];
        var pts = [0, 15, 35, 60, 100, 150, 220];
        if (floaty) goalProgress('spin', half);
        var nm = names[Math.min(half, names.length - 1)];
        var grabNow = currentGrab();
        var flipNow = flipAnim ? flipAnim.name + ' ' : '';
        airTrick(pts[Math.min(half, pts.length - 1)] + (grabNow ? 12 : 0) + (flipNow ? 10 : 0), flipNow + (grabNow ? grabNow + ' ' : '') + nm);
        if (half >= 2) spawnParticles(player.x + player.w / 2, player.y + player.h / 2, YELLOW, 6);
        if (half === 4) sayLingo();
      }
    }

    // Ground collision (world y)
    var gy = terrainY(wx);
    if (!player.grinding && !player.onGround && player.vy >= 0 && player.y + player.h >= gy) {
      player.y = gy - player.h;
      player.vy = 0;
      var air = Math.max(0, gy - player.h - airTop);
      if (air > maxAir) maxAir = air;
      airFrames = 0;
      spawnParticles(player.x + player.w / 2, gy, ORANGE, 4);
      spawnDust(player.x + player.w / 2, gy, air > 90 ? 10 : 5);
      player.squash = air > 90 ? 9 : 6;
      var landSlope = slopeAt(wx);
      var off360 = Math.abs(spinAngle) % (Math.PI * 2);
      var offFlat = Math.min(off360, Math.PI * 2 - off360); // how far from wheels-down, 0 to 180 degrees
      var midSpin = spinAngle !== 0 && offFlat > Math.PI / 4;
      var spinning = !!flipAnim || midSpin;
      if (landedFlip && !spinning) goalProgress('flip', landedFlip);
      tapQ = []; lastFlipLabel = ''; lastFlipPts = 0; airPeakH = 0; flipAnim = null;
      var sketchy = spinning || landSlope < -0.18;
      // A flip thrown in the last third of the air lands on its edge: a bail.
      // (Half the rotation or more still to go is the line; less is just sketchy.)
      landedFlip = (flipAnim && flipAnim.t <= flipAnim.dur / 2) ? flipAnim.name : (player.flipT === 0 && lastFlipLabel ? lastFlipLabel.replace('LATE ', '') : '');
      if (flipAnim && flipAnim.t > flipAnim.dur / 2) {
        player.flipT = 0; player.heelT = 0; flipAnim = null; tapQ = []; lastFlipLabel = ''; airPeakH = 0;
        player.onGround = true; spinAngle = 0; spinDir = 0; spinStep = 0; grabName = '';
        flipped = false; usedHeel = false;
        if (bail('FLIPPED TOO LATE')) return;
        return;
      }
      // Past 90 degrees you are on the ground, not the board. Anything closer is clean or sketchy.
      if (spinAngle !== 0 && offFlat > Math.PI / 2) {
        spinAngle = 0; spinDir = 0; spinStep = 0; grabName = '';
        player.onGround = true; flipped = false; usedHeel = false; usedShove = false; usedImp = false; usedBack = false;
        if (bail('LANDED SIDEWAYS')) return;
        return;
      }
      // The steps of a stair set are not a landing zone.
      var stairsHere = null;
      for (var sfi = 0; sfi < features.length; sfi++) { var sf = features[sfi]; if (sf.type === 'stairs' && wx > sf.x && wx < sf.x + sf.w * 0.8) stairsHere = sf; }
      if (stairsHere && !player.grinding) {
        player.onGround = true; spinAngle = 0; spinDir = 0; spinStep = 0; grabName = '';
        flipped = false; usedHeel = false; usedShove = false; usedImp = false; usedBack = false;
        if (bail('MISSED THE GAP')) return;
        return;
      }
      if (air > 120 && !sketchy) { trick(30, player.x + player.w / 2, player.y - 26, 'BIG AIR'); sayMoment('skate-bigair'); }
      if (landSlope > 0.18 && !sketchy && linePts > 0) { linePts += 15; addPopup(player.x + player.w / 2, player.y - 20, 'LANDED DOWNHILL +15', CYAN); }
      if (air > 60) shake = Math.max(shake, Math.min(8, air / 30));
      if (linePts > 0) {
        // A landing never banks on its own: the line stays open for a beat so
        // the next ramp, rail or manual can carry it. Roll flat and it pays.
        if (sketchy) { linePts = Math.ceil(linePts / 2); addPopup(player.x + player.w / 2, player.y - 18, 'SKETCHY: LINE HALVED', '#ff9a3c'); }
        else addPopup(player.x + player.w / 2, player.y - 18, 'CLEAN', CYAN);
        linkWindow = 42;
      } else if (landSlope < -0.18) {
        addPopup(player.x + player.w / 2, player.y - 18, 'UPHILL LANDING', '#ff9a3c');
      }
      player.onGround = true;
      player.grinding = false;
      player.grindRail = null;
      player.backT = 0;
      spinAngle = 0; spinDir = 0; spinStep = 0; grabName = '';
      flipped = false; usedHeel = false; usedShove = false; usedImp = false; usedBack = false;
      grindTilt = 0; usedNose = false; usedFive = false; railUsed = {}; slideT = 0;
    }

    if (player.invincible > 0) player.invincible--;

    // The link window: rolling flat with a line open counts down to the bank.
    if (linkWindow > 0) {
      var carrying = !player.onGround || player.grinding || (downHeld && manualBailT === 0);
      if (carrying) linkWindow = 0;
      else if (--linkWindow === 0 && linePts > 0) bank(false);
    }

    // Grabs: hold UP (melon), DOWN (indy), both (method). Points tick while held.
    var gname = airborne() ? currentGrab() : '';
    if (gname) {
      grabT++;
      if (gname !== grabName) {
        grabName = gname;
        var spinTag = Math.abs(spinAngle) > 0.6 ? ' ' + ['', '180', '360', '540', '720', '900', '1080'][Math.min(6, Math.floor(Math.abs(spinAngle) / Math.PI))] : '';
        airTrick(12, gname + spinTag);
      }
      if (grabT % 8 === 0) {
        linePts += 2;
        grabTotal += 2;
        spawnParticles(player.x + player.w / 2, player.y + player.h, CYAN, 2);
      }
    } else {
      if (wasGrabbing && grabTotal >= 10) addPopup(player.x + player.w / 2, player.y - 10, 'HELD +' + grabTotal, CYAN);
      if (wasGrabbing && player.onGround) { grabsLanded++; townGrabs++; goalProgress('grabs', townGrabs); }
      grabT = 0; grabTotal = 0; grabName = '';
    }
    wasGrabbing = !!gname;

    // Manual (DOWN) or nose manual (UP) on the ground: the board wants to tip;
    // the other arrow leans you back. Tip past the edge and the line goes.
    var manual = downHeld && player.onGround && !player.grinding && manualBailT === 0 && slideT === 0;
    if (manual) {
      manualT++;
      if (manualT === 1) { manualKind = 'manual'; manualBal = 0.1; trick(5, player.x + player.w / 2, player.y - 10, 'MANUAL'); }
      // The board tips back on its own; UP leans it forward. Tip over and it's a bail.
      var tip = 0.005 + level * 0.001 + Math.abs(manualBal) * (0.024 + level * 0.002);
      manualBal += tip - (upHeld ? 0.06 : 0) + groundSlope * 0.02 + (Math.random() - 0.5) * 0.03;
      if (manualT % 12 === 0) {
        linePts += 2;
        spawnParticles(player.x + 2, player.y + player.h, YELLOW, 1);
      }
      if (manualBal > 1 || manualBal < -1) {
        manualT = 0;
        if (bail('TIPPED THE MANUAL')) return;
      }
    } else {
      if (wasManual && manualT > 0 && linePts > 0 && manualBailT === 0) linkWindow = 42;
      manualT = 0;
    }
    wasManual = manual;
    if (slideT > 0 && slideT < 999 && frame % 2 === 0) spawnSparks(player.x + 2, player.y + player.h, 2);

    // Rail grinding: magnet snap when falling onto a rail
    if (!player.onGround && player.vy > 0) {
      for (var i = 0; i < rails.length; i++) {
        var rail = rails[i];
        var rx = rail.x - scrollX;
        if (player.x + player.w > rx && player.x < rx + rail.w) {
          var railTop = rail.top;
          if (player.y + player.h >= railTop - 4 && player.y + player.h <= railTop + 10) {
            player.y = railTop - player.h;
            player.vy = 0;
            player.grinding = true;
            player.grindRail = rail;
            flipped = false; usedNose = false; usedFive = false; grindTilt = 0; railUsed = {}; slideT = 0;
            spinAngle = 0; spinDir = 0; spinStep = 0; flipAnim = null; tapQ = []; lastFlipLabel = ''; airPeakH = 0;
            if (!rail.scored) {
              rail.scored = true;
              // Coming off another rail within a second: a transfer, worth more than the landing.
              if (frame - lastGrindEnd < 60 && lastRailId !== -1) {
                transfers++;
                trick(rail.id === lastRailId ? 20 : 30, player.x + player.w / 2, railTop - 12, rail.id === lastRailId ? 'GAP HOP' : 'TRANSFER'); if (rail.id !== lastRailId) sayMoment('skate-transfer');
              } else {
                trick(25, player.x + player.w / 2, railTop - 12, '50-50');
              }
              spawnParticles(player.x + player.w / 2, railTop, CYAN, 8);
              spawnSparks(player.x + 4, railTop + 2, 8);
            }
            grindDist = 0; grindPaid = 0; airFrames = 0; floaty = false; grindBal = (Math.random() - 0.5) * 0.2; grindCount++;
            if (frame % 6 === 0) sfxGrind();
            break;
          }
        }
      }
    }

    if (player.grinding) {
      // Balance: the board wants to slip off the rail; hold LEFT or RIGHT to
      // lean it back. Forgiving early, sharper in the later towns.
      var drift = 0.002 + level * 0.0004;
      grindBal += (grindBal >= 0 ? drift : -drift) + Math.abs(grindBal) * 0.008 + (Math.random() - 0.5) * 0.012;
      if (grindBal > 1 || grindBal < -1) {
        grindBal = 0;
        if (bail('SLIPPED THE GRIND')) return;
      }
      if (frame % 6 === 0) sfxGrind();
      if (frame % 2 === 0) spawnSparks(player.x + 4, player.y + player.h + 2, 2);
      // Grinds pay by the foot: three points every 40px, a bonus and a
      // multiplier step every 200px, so a long rail is worth staying on.
      grindDist += speed;
      if (grindDist - grindPaid >= 40) { grindPaid += 40; linePts += 3; }
      if (grindDist >= 200 && Math.floor(grindDist / 200) > Math.floor((grindDist - speed) / 200)) {
        var ft = Math.floor(grindDist / 200);
        linePts += 20;
        if (combo < MAX_COMBO) combo++;
        boost = Math.min(2.5, boost + 0.25);
        addPopup(player.x + player.w / 2, player.y - 14, 'LONG GRIND ' + (ft * 200) + ' +20', CYAN);
        if (ft === 2) sayMoment('skate-grind');
        if (ft === 3) sayLingo();
      }
      if (grindDist > longestGrind) longestGrind = grindDist;
      townGrindFeet += speed / 4;
      goalProgress('grindtown', Math.round(townGrindFeet));
    }

    // Roll into a bench or a planter on the ground: a bonk, not a bail. It
    // scrubs your speed and halves the line, then you are past it.
    if (player.onGround && !player.grinding && player.invincible === 0) {
      for (var bi = 0; bi < rails.length; bi++) {
        var bd = rails[bi];
        if (!bd.bodyH || bd.bonked) continue;
        var bxs = bd.x - scrollX;
        if (player.x + player.w - 6 > bxs && player.x + 6 < bxs + bd.w && player.y + player.h > bd.top + 6) {
          bd.bonked = true;
          speed = Math.max(2.2, speed * 0.6);
          shake = 4;
          player.squash = 6;
          playSfx(180, 0.1, 'sawtooth', 0.08);
          spawnParticles(bxs, bd.top, '#fff', 5);
          if (linePts > 0) { linePts = Math.ceil(linePts / 2); addPopup(player.x + player.w / 2, player.y - 20, 'BONK: LINE HALVED', '#ff9a3c'); }
          else addPopup(player.x + player.w / 2, player.y - 20, 'BONK', '#ff9a3c');
        }
      }
    }

    if (player.grinding && player.grindRail) {
      var grx = player.grindRail.x - scrollX;
      if (player.x > grx + player.grindRail.w || player.x + player.w < grx) {
        lastGrindEnd = frame; lastRailId = player.grindRail.id;
        player.grinding = false;
        player.grindRail = null;
        coyote = 12;
        airTop = player.y;
        floaty = false;
        slideT = 0;
      }
    }

    // Hazards ride the terrain (world y). Cars hurt. Spills scrub. The rest steal the line.
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var ob = obstacles[i];
      if (ob.type === 'pigeon') { ob.x -= 0.5; }
      else if (ob.type === 'dog') { ob.x -= 0.8; }
      else if (ob.type === 'cyclist') { ob.x -= 1.1; }
      else if (ob.type === 'car') {
        if (!ob.out) {
          // Telegraphed: it flashes and honks at the curb while you close in.
          var oxw = ob.x - scrollX;
          if (oxw < W + 40 && ob.warnT > 0) { ob.warnT--; if (ob.warnT === 60) { addPopup(oxw + 30, ob.y - 20, 'HONK', '#fff'); playSfx(320, 0.18, 'square', 0.1); setTimeout(function() { playSfx(300, 0.22, 'square', 0.1); }, 200); } }
          if (ob.warnT === 0) { ob.out = true; ob.outT = 260; }
        } else { ob.x -= 1.4; if (--ob.outT <= 0) { obstacles.splice(i, 1); continue; } }
      }
      var ogy = terrainY(ob.x + ob.w / 2);
      ob.y = ogy - ob.h - (ob.type === 'pigeon' ? 42 + Math.sin(frame * 0.12 + i) * 5 : 0);
      ob.gy = ogy;
      var ox = ob.x - scrollX;
      if (ox < -80) { obstacles.splice(i, 1); continue; }
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
      if (ob.type === 'car' && !ob.out) continue;
      if (ob.type === 'spill' && !player.onGround) continue;
      if (player.x + player.w - 4 > ox && player.x + 4 < ox + ob.w &&
          player.y + player.h > ob.y && player.y < ob.y + ob.h) {
        if (ob.type === 'car') {
          obstacles.splice(i, 1);
          if (bail('HIT BY A CAR')) return;
          continue;
        }
        if (ob.type === 'spill') {
          if (!ob.hit) { ob.hit = true; speed = Math.max(2.2, speed * 0.55); addPopup(player.x + player.w / 2, player.y - 20, 'SPILL', '#ff9a3c'); spawnParticles(ox + ob.w / 2, ob.y, PINK, 6); player.squash = 5; }
          continue;
        }
        loseLine(ob.type.toUpperCase());
        addPopup(player.x + player.w / 2, player.y - 32, ob.type.toUpperCase() + '! LINE GONE', '#ddd');
        spawnParticles(ox + ob.w / 2, ob.y, '#cfcfcf', 8);
        shake = 5;
        playSfx(1400, 0.06, 'square', 0.08);
        obstacles.splice(i, 1);
      }
    }

    // The letters: five per town spread along it, floating where the tricks are.
    var townEndX = level * TOWN_PX;
    while (nextLetterX < scrollX + W + 300 && lettersGot + letters.length < 5 && nextLetterX < townEndX - 600) {
      var li2 = lettersGot + letters.length;
      var ft2 = featureAt(nextLetterX);
      var liftL = ft2 && nextLetterX > ft2.x + ft2.w ? 110 + Math.random() * 60 : 46 + Math.random() * 30;
      letters.push({ x: nextLetterX, lift: liftL, ch: 'SKATE'[li2], w: 16, h: 16, y: 0 });
      nextLetterX += (townEndX - nextLetterX) / (5 - li2) * (0.6 + Math.random() * 0.5);
    }
    for (var li3 = letters.length - 1; li3 >= 0; li3--) {
      var lt = letters[li3];
      lt.y = terrainY(lt.x + 8) - lt.lift;
      var lx2 = lt.x - scrollX;
      if (lx2 < -40) { letters.splice(li3, 1); continue; }
      if (player.x + player.w > lx2 && player.x < lx2 + lt.w && player.y + player.h > lt.y && player.y < lt.y + lt.h) {
        lettersGot++;
        if (lettersGot === 5) sayMoment('skate-letters', true);
        letters.splice(li3, 1);
        score += 250; document.getElementById('jd-br-score').textContent = score;
        addPopup(lx2 + 8, lt.y - 8, 'GOT ' + lt.ch + ' +250', YELLOW);
        sfxCollect(); spawnParticles(lx2 + 8, lt.y + 8, YELLOW, 14);
        goalProgress('letters', lettersGot);
      }
    }

    // Collectibles (world y follows the terrain)
    for (var i = collectibles.length - 1; i >= 0; i--) {
      var col = collectibles[i];
      var cx = col.x - scrollX;
      if (cx < -50) { collectibles.splice(i, 1); continue; }
      if (col.collected) continue;
      col.y = terrainY(col.x + col.w / 2) - col.lift;
      if (player.x + player.w > cx && player.x < cx + col.w &&
          player.y + player.h > col.y && player.y < col.y + col.h) {
        col.collected = true;
        var basePts = col.kind === 'eagle' ? 25 : col.kind === 'skull' ? 15 : col.kind === 'horseshoe' ? 25 : 10;
        var pts = basePts * combo;
        score += pts;
        if (col.kind === 'horseshoe') {
          shieldT = 300;
          bannerT = 60;
          bannerText = 'LUCKY SHIELD!';
          addPopup(cx + col.w / 2, col.y - 6, 'LUCKY +' + pts, YELLOW);
        } else if (col.kind === 'deck' && lives < MAX_LIVES) {
          // A spare deck puts a board back under you.
          lives++;
          document.getElementById('jd-br-lives').textContent = lives;
          addPopup(cx + col.w / 2, col.y - 6, 'NEW BOARD +' + pts, '#ff8098');
          spawnParticles(cx + col.w / 2, col.y, '#ff8098', 14);
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
    for (var i = features.length - 1; i >= 0; i--) {
      if (features[i].x + features[i].w + landingZone(features[i]) - scrollX < -200) features.splice(i, 1);
    }

    // The run is a rhythm: a ramp, its landing, a long rail, a breath, a ramp.
    // Everything is placed at least three seconds of road ahead of you.
    var ahead = W + Math.max(700, speed * 60 * 3.2);
    while (nextBeatX < scrollX + ahead) {
      var beat = lastBeat === 'ramp' ? (Math.random() < 0.8 ? 'rail' : 'ramp') : (Math.random() < 0.8 ? 'ramp' : 'rail');
      if (beat === 'ramp') {
        var f = spawnFeature(nextBeatX);
        // flash in the flight path
        var fk = Math.random();
        collectibles.push({ x: f.x + f.w + 120 + Math.random() * 120, lift: 120 + Math.random() * 90, y: 0, w: 14, h: 14, collected: false, kind: fk < 0.1 ? 'eagle' : fk < 0.3 ? 'skull' : fk < 0.6 ? 'heart' : 'star' });
        nextBeatX = f.x + f.w + landingZone(f) + 140 + Math.random() * 260;
      } else {
        var endX = spawnRailLine(nextBeatX);
        nextBeatX = endX + 160 + Math.random() * 260;
        // a rare, slow line stealer in the breath after a rail
        if (Math.random() < 0.18) {
          var types = ['pigeon'];
          if (level >= 3) types.push('dog');
          if (level >= 5) types.push('cyclist');
          obstacles.push(makeObstacle(types[Math.floor(Math.random() * types.length)], nextBeatX - 60));
        }
        if (Math.random() < 0.5) collectibles.push({ x: nextBeatX - 100, lift: 40 + Math.random() * 30, y: 0, w: 14, h: 14, collected: false, kind: Math.random() < 0.05 && lives < MAX_LIVES ? 'deck' : Math.random() < 0.08 ? 'horseshoe' : 'bolt' });
      }
      lastBeat = beat;
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

    // Camera: the ground under the skater stays in the same screen zone
    // Camera: the road never moves. Only genuine big air (the skater above the
    // top third of the screen) lifts the view, and it eases back down.
    var camTarget = 0;
    if (!player.onGround && !player.grinding && player.y < 100) camTarget = player.y - 100;
    camY += (camTarget - camY) * (camTarget < camY ? 0.2 : 0.08);

    // Particles + popups (world y)
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.dust) { p.size += 0.22; p.vx *= 0.94; p.vy *= 0.9; }
      else p.vy += 0.15;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (looseBoard) {
      looseBoard.x += looseBoard.vx; looseBoard.y += looseBoard.vy; looseBoard.vy += 0.4; looseBoard.rot += 0.3; looseBoard.t--;
      var lbg = terrainY(scrollX + looseBoard.x) - 2;
      if (looseBoard.y > lbg) { looseBoard.y = lbg; looseBoard.vy *= -0.4; looseBoard.vx *= 0.7; }
      looseBoard.x -= speed;
      if (looseBoard.t <= 0) looseBoard = null;
    }
    if (player.pushT > 0) player.pushT--;
    if (player.popT > 0) player.popT--;
    if (player.bailT > 0) player.bailT--;
    if (player.onGround && !player.grinding && !wasManual && player.bailT === 0 && frame % 44 === 0) player.pushT = 16;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.6; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wallOpts = {
    game: 'skate', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'GAME OVER', again: 'SPACE or TAP to ride again',
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  };
  var wall = window.ArcadeBoard.attach(wallOpts);
  function enterBoard(v) {
    wallOpts.again = (!continueUsed && level >= 2)
      ? 'SPACE: continue from ' + LOCALES[(level - 1) % LOCALES.length].name + ' (1 credit) // DOWN: new run'
      : 'SPACE or TAP to ride again'; wall.enter(v, { level: level, meta: { line: bestLine, dist: Math.round(dist), tricks: trickCount, combo: comboMax, air: Math.round(maxAir), hang: longestAir, airs: airCount, grind: Math.round(longestGrind), transfers: transfers, goals: goalsDoneTotal, specials: specialUsed, rampAirs: rampAirs, grinds: grindCount, cont: continueUsed ? 1 : 0 } }); }
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
    if (t2 > 145) { ctx.fillStyle = CYAN; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('HILLS. AIR. GRIND. FLIP. REPEAT.', W / 2, 156); }
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, H - 82, W, 82);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    // The whole sheet cycles: the cabinet shows a few lines at a time.
    var sheet = [
      ['SPACE ollies, hold it for big // hold UP at a lip and the board sends itself', 'in the air: tap LEFT or RIGHT to flip, hold to spin, hold UP or DOWN to grab // rails: LEFT and RIGHT change the grind'],
      ['TRICK BOOK // tap RIGHT kickflip, LEFT heelflip // RIGHT RIGHT 360 flip, LEFT LEFT laser flip, UP UP double kickflip', 'RIGHT LEFT varial kick, LEFT RIGHT varial heel // DOWN RIGHT hardflip, DOWN LEFT inward heel // UP RIGHT impossible, UP LEFT nollie heel, DOWN DOWN pop shove-it'],
    ];
    var pageI = Math.floor(t / 150) % sheet.length;
    ctx.fillText(sheet[pageI][0], W / 2, H - 58);
    ctx.fillText(sheet[pageI][1], W / 2, H - 44);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (var pgi = 0; pgi < sheet.length; pgi++) ctx.fillRect(W / 2 - sheet.length * 5 + pgi * 10, H - 32, 6, 2);

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

  // Render at 2x: the canvas is 800x640 inside, every logical coordinate stays
  // 400x320 through one transform, so the wall module and touch mapping are
  // untouched. The headless harness has a stub canvas; guard everything.
  var hiRes = false;
  function setupHiRes() {
    try {
      if (canvas.width !== 800 && typeof ctx.setTransform === 'function') { canvas.width = 800; canvas.height = 640; }
      if (transCanvas) { transCanvas.width = 800; transCanvas.height = 640; }
      hiRes = canvas.width === 800;
    } catch (e) { hiRes = false; }
  }
  function frameTransform(c) {
    try { if (hiRes && typeof c.setTransform === 'function') c.setTransform(2, 0, 0, 2, 0, 0); } catch (e) {}
  }
  var concretePat = null;
  function concrete() {
    if (concretePat !== null) return concretePat;
    concretePat = false;
    try {
      var pc = document.createElement('canvas'); pc.width = 64; pc.height = 64;
      var px = pc.getContext('2d');
      if (!px || typeof px.createImageData !== 'function') return concretePat;
      var img = px.createImageData(64, 64);
      for (var i = 0; i < img.data.length; i += 4) { var v = 118 + Math.floor(Math.random() * 30); img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 4; img.data[i + 3] = 255; }
      px.putImageData(img, 0, 0);
      concretePat = ctx.createPattern(pc, 'repeat') || false;
    } catch (e) { concretePat = false; }
    return concretePat;
  }

  function draw() {
    frameTransform(ctx);
    if (mode === 'intro') { drawIntro(); return; }
    ctx.save();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    var sky = LOCALES[(level - 1) % LOCALES.length];
    var GY = GROUND_Y - camY * 0.35; // the background's ground line, a soft parallax on the camera
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(1, sky.bot);
    ctx.fillStyle = grad;
    ctx.fillRect(-8, -8, W + 16, H + 16);

    if (sky.stars) {
      ctx.fillStyle = '#fff';
      for (var i = 0; i < 30; i++) {
        var sx = ((i * 137 + 50) % W + W) % W;
        var sy = ((i * 91 + 20) % (GY - 80));
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
        var rmy = GY - 128 - Math.sin(rmx * 0.008) * 22 - Math.sin(rmx * 0.021) * 10;
        ctx.fillStyle = 'rgba(46,38,72,0.55)';
        ctx.fillRect(x, rmy, 6, GY - rmy);
      }
      // Far skyline for depth
      ctx.fillStyle = 'rgba(20,16,34,0.5)';
      for (var i = 0; i < 9; i++) {
        var fx = ((i * 150 + 40 - scrollX * 0.12) % (W + 200) + W + 200) % (W + 200) - 100;
        var fh = 60 + ((i * 53) % 70);
        ctx.fillRect(fx, GY - fh - 26, 46 + (i * 31) % 40, fh + 26);
      }
      // Denver landmarks ride the middle distance: the cash register
      // tower (with its DENVER rooftop sign), the D&F clocktower
      var lmBase = ((-scrollX * 0.2) % 420 + 420) % 420 - 100;
      for (var rep2 = 0; rep2 < 3; rep2++) {
        var lx = lmBase + rep2 * 420;
        ctx.fillStyle = '#4c4880';
        ctx.fillRect(lx, GY - 168, 48, 168);
        ctx.beginPath();
        ctx.moveTo(lx, GY - 168);
        ctx.quadraticCurveTo(lx + 10, GY - 204, lx + 48, GY - 188);
        ctx.lineTo(lx + 48, GY - 168);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(lx, GY - 168, 4, 168);
        ctx.fillStyle = Math.floor(frame / 40) % 2 === 0 ? '#ff3030' : '#701010';
        ctx.fillRect(lx + 8, GY - 206, 3, 3);
        ctx.fillStyle = sky.lights ? 'rgba(255,255,150,0.55)' : 'rgba(40,54,80,0.9)';
        for (var wy = GY - 158; wy < GY - 12; wy += 12) {
          for (var wx = lx + 5; wx < lx + 44; wx += 9) ctx.fillRect(wx, wy, 4, 5);
        }
        // Union Station: low stone facade under the glowing orange sign
        var ux = lx + 250;
        ctx.fillStyle = '#5a5470';
        ctx.fillRect(ux, GY - 52, 96, 52);
        ctx.fillRect(ux + 34, GY - 66, 28, 14);
        ctx.fillStyle = sky.lights ? '#ffd889' : '#3a3450';
        for (var ax = ux + 8; ax < ux + 90; ax += 16) {
          ctx.beginPath();
          ctx.arc(ax + 4, GY - 26, 5, Math.PI, 0);
          ctx.fill();
          ctx.fillRect(ax, GY - 26, 9, 20);
        }
        ctx.fillStyle = Math.floor(frame / 34) % 2 === 0 ? '#ff7a1c' : '#c25a10';
        ctx.fillRect(ux + 30, GY - 78, 36, 9);
        ctx.fillStyle = '#14121a';
        ctx.fillRect(ux + 33, GY - 76, 30, 5);
        ctx.fillStyle = Math.floor(frame / 34) % 2 === 0 ? '#ffb066' : '#e08030';
        for (var dx2 = ux + 35; dx2 < ux + 62; dx2 += 4) ctx.fillRect(dx2, GY - 75, 2, 3);
        var tx = lx + 160;
        ctx.fillStyle = '#2a2444';
        ctx.fillRect(tx, GY - 138, 20, 138);
        ctx.beginPath();
        ctx.moveTo(tx - 2, GY - 138);
        ctx.lineTo(tx + 10, GY - 160);
        ctx.lineTo(tx + 22, GY - 138);
        ctx.fill();
        ctx.fillStyle = sky.lights ? '#ffd889' : '#f4f0d8';
        ctx.beginPath(); ctx.arc(tx + 10, GY - 122, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a2444';
        ctx.fillRect(tx + 9, GY - 128, 2, 7);
        ctx.fillRect(tx + 10, GY - 122, 5, 2);
        // The big blue bear, peering at a storefront
        var bbBase = ((-scrollX * 0.3) % 640 + 640) % 640 - 120;
        var bx4 = bbBase + rep2 * 640 + 200;
        if (bx4 > -60 && bx4 < W + 60) {
          ctx.fillStyle = '#2a6ee8';
          ctx.fillRect(bx4, GY - 40, 24, 34);
          ctx.fillRect(bx4 + 3, GY - 56, 19, 17);
          ctx.fillRect(bx4 + 3, GY - 60, 6, 5);
          ctx.fillRect(bx4 + 15, GY - 60, 6, 5);
          ctx.fillRect(bx4 + 19, GY - 51, 8, 8);
          ctx.fillRect(bx4 + 21, GY - 40, 6, 18);
          ctx.fillRect(bx4 + 1, GY - 6, 9, 6);
          ctx.fillRect(bx4 + 14, GY - 6, 9, 6);
          ctx.fillStyle = '#1e54c0';
          ctx.fillRect(bx4 + 24, GY - 50, 3, 6);
          ctx.fillStyle = '#14121a';
          ctx.fillRect(bx4 + 17, GY - 52, 2, 2);
        }
      }
      // Near buildings (parallax)
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        var bx = b.x - scrollX * 0.3;
        if (bx > W + 50 || bx + b.w < -50) continue;
        var by = GY - b.h;
        ctx.fillStyle = b.color;
        ctx.fillRect(bx, by, b.w, b.h);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(bx, by, 2, b.h);
        ctx.fillStyle = sky.lights ? ((Math.sin(frame * 0.02 + i) > 0) ? '#FFFF66' : '#333') : 'rgba(30,44,60,0.8)';
        for (var wy = by + 6; wy < GY - 10; wy += 12) {
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
        var my = GY - 96 - Math.sin(mx * 0.011) * 34 - Math.sin(mx * 0.027) * 16;
        ctx.fillStyle = '#4a3a5e';
        ctx.fillRect(x, my, 4, GY - my);
        if (Math.sin(mx * 0.011) * 34 + Math.sin(mx * 0.027) * 16 > 30) {
          ctx.fillStyle = '#e8ecf2';
          ctx.fillRect(x, my, 4, 7);
        }
      }
      for (var x = -8; x < W + 8; x += 4) {
        var hx = (x + scrollX * 0.2);
        var hy = GY - 34 - Math.sin(hx * 0.017) * 20 - Math.sin(hx * 0.041) * 8;
        ctx.fillStyle = '#3c3050';
        ctx.fillRect(x, hy, 4, GY - hy);
      }
      for (var i = 0; i < 8; i++) {
        var px2 = ((i * 120 + 30 - scrollX * 0.3) % (W + 120) + W + 120) % (W + 120) - 60;
        var ph2 = 20 + (i * 37) % 14;
        ctx.fillStyle = '#1c3324';
        ctx.beginPath();
        ctx.moveTo(px2, GY);
        ctx.lineTo(px2 + 8, GY - ph2);
        ctx.lineTo(px2 + 16, GY);
        ctx.fill();
      }
    } else if (sky.scene === 'redrocks') {
      // The amphitheatre monoliths: giant tilted sandstone slabs
      for (var i = 0; i < 5; i++) {
        var rx2 = ((i * 190 + 40 - scrollX * 0.18) % (W + 260) + W + 260) % (W + 260) - 130;
        var rh2 = 95 + (i * 43) % 45;
        ctx.fillStyle = i % 2 === 0 ? '#b0452a' : '#c1553a';
        ctx.beginPath();
        ctx.moveTo(rx2, GY);
        ctx.lineTo(rx2 + 26, GY - rh2);
        ctx.lineTo(rx2 + 78, GY - rh2 + 16);
        ctx.lineTo(rx2 + 96, GY);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.moveTo(rx2 + 26, GY - rh2);
        ctx.lineTo(rx2 + 38, GY - rh2 + 4);
        ctx.lineTo(rx2 + 12, GY);
        ctx.lineTo(rx2, GY);
        ctx.fill();
      }
      for (var i = 0; i < 6; i++) {
        var sx2 = ((i * 160 + 90 - scrollX * 0.3) % (W + 80) + W + 80) % (W + 80) - 40;
        ctx.fillStyle = '#5a7040';
        ctx.beginPath(); ctx.ellipse(sx2, GY - 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (sky.scene === 'rino') {
      // RiNo: warehouses, water tower, mural walls, the Lumenati block
      for (var i = 0; i < 6; i++) {
        var wx6 = ((i * 190 + 30 - scrollX * 0.14) % (W + 260) + W + 260) % (W + 260) - 130;
        ctx.fillStyle = i % 2 ? '#5a3a44' : '#4a3040';
        ctx.fillRect(wx6, GY - 70 - (i % 3) * 14, 120, 70 + (i % 3) * 14);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(wx6, GY - 70 - (i % 3) * 14, 120, 6);
      }
      var wt = ((120 - scrollX * 0.18) % (W + 200) + W + 200) % (W + 200) - 100;
      ctx.fillStyle = '#3c2a34'; ctx.fillRect(wt + 10, GY - 150, 4, 90); ctx.fillRect(wt + 36, GY - 150, 4, 90);
      ctx.fillStyle = '#6a4a5a'; ctx.fillRect(wt, GY - 180, 50, 34);
      ctx.fillStyle = '#e8e0d0'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText('RiNo', wt + 25, GY - 160);
      // Murals: big flat color panels with shapes, the whole block painted
      var MUR = ['#FF1493', '#00FFFF', '#7FFF00', '#FFD700', '#B026FF', '#FF6347'];
      for (var mi = 0; mi < 7; mi++) {
        var mx = ((mi * 160 + 20 - scrollX * 0.3) % (W + 200) + W + 200) % (W + 200) - 100;
        ctx.fillStyle = '#2a1a24';
        ctx.fillRect(mx, GY - 56, 130, 56);
        ctx.fillStyle = MUR[mi % MUR.length];
        ctx.globalAlpha = 0.8;
        if (mi % 3 === 0) { ctx.beginPath(); ctx.arc(mx + 40, GY - 30, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(mx + 70, GY - 48, 40, 8); }
        else if (mi % 3 === 1) { ctx.beginPath(); ctx.moveTo(mx + 10, GY - 6); ctx.lineTo(mx + 60, GY - 50); ctx.lineTo(mx + 110, GY - 6); ctx.fill(); }
        else { for (var st = 0; st < 5; st++) ctx.fillRect(mx + 8 + st * 24, GY - 46 + (st % 2) * 14, 14, 26); }
        ctx.globalAlpha = 1;
        if (mi === 2) {
          // The Lumenati block: the eye, the sign
          ctx.fillStyle = '#0e0e11'; ctx.fillRect(mx + 20, GY - 56, 90, 56);
          ctx.fillStyle = PINK; ctx.beginPath(); ctx.moveTo(mx + 65, GY - 50); ctx.lineTo(mx + 85, GY - 18); ctx.lineTo(mx + 45, GY - 18); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(mx + 65, GY - 30, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#0e0e11'; ctx.beginPath(); ctx.arc(mx + 65, GY - 30, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = Math.floor(frame / 30) % 2 === 0 ? PINK : '#ff8ad0'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('LUMENATI', mx + 65, GY - 8);
        }
      }
    } else if (sky.scene === 'golden') {
      // Golden: the mesa with the M, the Coors sign, the creek and its bridge
      for (var x7 = -8; x7 < W + 8; x7 += 4) {
        var gmx = (x7 + scrollX * 0.08);
        var gmy = GY - 110 - Math.sin(gmx * 0.009) * 30 - (Math.sin(gmx * 0.02) > 0.6 ? 26 : 0);
        ctx.fillStyle = '#7a8a6a'; ctx.fillRect(x7, gmy, 4, GY - gmy);
        ctx.fillStyle = '#5e6e52'; ctx.fillRect(x7, gmy + 40, 4, GY - gmy - 40);
      }
      var mM = ((200 - scrollX * 0.08) % (W + 300) + W + 300) % (W + 300) - 150;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.fillText('M', mM, GY - 118);
      var cs2 = ((90 - scrollX * 0.2) % (W + 300) + W + 300) % (W + 300) - 150;
      ctx.fillStyle = '#c8b090'; ctx.fillRect(cs2, GY - 96, 150, 46);
      ctx.fillStyle = '#d02020'; ctx.fillRect(cs2 + 6, GY - 90, 138, 34);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.fillText('COORS', cs2 + 75, GY - 66);
      ctx.fillStyle = '#8a7a6a'; for (var ct = 0; ct < 6; ct++) ctx.fillRect(cs2 + 20 + ct * 22, GY - 50, 10, 50);
      // Clear Creek under a truss bridge, the water sliding by
      ctx.fillStyle = '#3f86c4'; ctx.fillRect(-8, GY - 14, W + 16, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var wv = 0; wv < 12; wv++) { var wxx = ((wv * 41 - frame * 1.5 - scrollX * 0.9) % (W + 40) + W + 40) % (W + 40) - 20; ctx.fillRect(wxx, GY - 10 + (wv % 3) * 3, 14, 1); }
      var br = ((260 - scrollX * 0.45) % (W + 400) + W + 400) % (W + 400) - 200;
      ctx.fillStyle = '#4a4a52'; ctx.fillRect(br, GY - 40, 160, 5);
      for (var tb = 0; tb < 8; tb++) { ctx.fillRect(br + tb * 20, GY - 40, 3, 26); if (tb < 7) { ctx.beginPath(); ctx.moveTo(br + tb * 20, GY - 40); ctx.lineTo(br + tb * 20 + 20, GY - 14); ctx.lineTo(br + tb * 20 + 22, GY - 14); ctx.lineTo(br + tb * 20 + 3, GY - 40); ctx.fill(); } }
    } else if (sky.scene === 'mining') {
      // Idaho Springs: bare brown hills, mine headframes, tailings, an ore cart on a trestle
      for (var x8 = -8; x8 < W + 8; x8 += 4) {
        var hmx = (x8 + scrollX * 0.1);
        var hmy = GY - 90 - Math.sin(hmx * 0.012) * 40 - Math.sin(hmx * 0.031) * 12;
        ctx.fillStyle = '#6e6250'; ctx.fillRect(x8, hmy, 4, GY - hmy);
        ctx.fillStyle = '#5a5044'; ctx.fillRect(x8, hmy + 30, 4, GY - hmy - 30);
      }
      for (var hf = 0; hf < 3; hf++) {
        var hx = ((hf * 300 + 120 - scrollX * 0.22) % (W + 340) + W + 340) % (W + 340) - 170;
        ctx.fillStyle = '#3a3028';
        ctx.fillRect(hx, GY - 96, 4, 96); ctx.fillRect(hx + 30, GY - 96, 4, 96);
        ctx.fillRect(hx - 6, GY - 100, 46, 6);
        ctx.beginPath(); ctx.moveTo(hx, GY); ctx.lineTo(hx + 17, GY - 96); ctx.lineTo(hx + 34, GY); ctx.lineTo(hx + 30, GY); ctx.lineTo(hx + 17, GY - 84); ctx.lineTo(hx + 4, GY); ctx.fill();
        ctx.fillStyle = '#8a7a66'; ctx.beginPath(); ctx.arc(hx + 17, GY - 100, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a6a56'; ctx.fillRect(hx + 40, GY - 30, 70, 30);
        ctx.fillStyle = '#9a8a76'; ctx.beginPath(); ctx.moveTo(hx + 120, GY); ctx.lineTo(hx + 160, GY - 34); ctx.lineTo(hx + 200, GY); ctx.fill();
      }
      var tr = ((60 - scrollX * 0.35) % (W + 500) + W + 500) % (W + 500) - 250;
      ctx.fillStyle = '#4a3c30';
      ctx.fillRect(tr, GY - 58, 220, 4);
      for (var tt = 0; tt < 11; tt++) ctx.fillRect(tr + tt * 20, GY - 58, 3, 58);
      var cart = tr + ((frame * 0.7) % 220);
      ctx.fillStyle = '#5a4a3c'; ctx.fillRect(cart, GY - 74, 22, 14);
      ctx.fillStyle = '#c8b090'; ctx.fillRect(cart + 3, GY - 78, 16, 5);
      ctx.fillStyle = '#222'; ctx.fillRect(cart + 3, GY - 60, 5, 3); ctx.fillRect(cart + 14, GY - 60, 5, 3);
    } else if (sky.scene === 'vail') {
      // Vail Pass: the big peaks, a switchback road up the far slope, dark pines
      for (var x9 = -8; x9 < W + 8; x9 += 4) {
        var vmx = (x9 + scrollX * 0.06);
        var vmy = GY - 130 - Math.sin(vmx * 0.008) * 50 - Math.abs(Math.sin(vmx * 0.02)) * 30;
        ctx.fillStyle = '#3a3f66'; ctx.fillRect(x9, vmy, 4, GY - vmy);
        if (vmy < GY - 150) { ctx.fillStyle = '#eef2fa'; ctx.fillRect(x9, vmy, 4, Math.min(22, GY - 150 - vmy + 8)); }
      }
      for (var x10 = -8; x10 < W + 8; x10 += 4) {
        var vhx = (x10 + scrollX * 0.16);
        var vhy = GY - 60 - Math.sin(vhx * 0.014) * 26;
        ctx.fillStyle = '#2b3350'; ctx.fillRect(x10, vhy, 4, GY - vhy);
      }
      // The switchbacks: a pale road zigzagging up the slope
      ctx.strokeStyle = 'rgba(230,236,246,0.5)'; ctx.lineWidth = 2; ctx.beginPath();
      var sw0 = ((-scrollX * 0.16) % 400 + 400) % 400 - 200;
      for (var rep3 = 0; rep3 < 3; rep3++) { var sx9 = sw0 + rep3 * 400; ctx.moveTo(sx9, GY - 20); ctx.lineTo(sx9 + 120, GY - 46); ctx.lineTo(sx9 + 30, GY - 68); ctx.lineTo(sx9 + 150, GY - 92); }
      ctx.stroke(); ctx.lineWidth = 1;
      for (var pv = 0; pv < 10; pv++) {
        var pvx = ((pv * 96 + 20 - scrollX * 0.3) % (W + 120) + W + 120) % (W + 120) - 60;
        var pvh = 22 + (pv * 31) % 16;
        ctx.fillStyle = '#12261c'; ctx.beginPath(); ctx.moveTo(pvx, GY); ctx.lineTo(pvx + 8, GY - pvh); ctx.lineTo(pvx + 16, GY); ctx.fill();
        ctx.fillStyle = 'rgba(240,244,250,0.7)'; ctx.fillRect(pvx + 5, GY - pvh + 4, 6, 2);
      }
    } else if (sky.scene === 'moab') {
      // Moab: mesas, a sandstone arch, the desert road out
      for (var x11 = -8; x11 < W + 8; x11 += 4) {
        var mmx = (x11 + scrollX * 0.07);
        var mesa = Math.sin(mmx * 0.006) > 0.3 ? 90 : 40;
        var mmy = GY - mesa - Math.sin(mmx * 0.03) * 4;
        ctx.fillStyle = '#c05a3c'; ctx.fillRect(x11, mmy, 4, GY - mmy);
        ctx.fillStyle = '#a04830'; ctx.fillRect(x11, mmy + 18, 4, 6);
      }
      var arch = ((160 - scrollX * 0.2) % (W + 360) + W + 360) % (W + 360) - 180;
      ctx.fillStyle = '#d0684a';
      ctx.beginPath(); ctx.moveTo(arch, GY); ctx.lineTo(arch + 10, GY - 80); ctx.quadraticCurveTo(arch + 70, GY - 150, arch + 130, GY - 80); ctx.lineTo(arch + 140, GY); ctx.lineTo(arch + 110, GY); ctx.lineTo(arch + 104, GY - 70); ctx.quadraticCurveTo(arch + 70, GY - 118, arch + 36, GY - 70); ctx.lineTo(arch + 30, GY); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(arch + 10, GY - 80, 6, 80);
      for (var sh = 0; sh < 6; sh++) {
        var shx = ((sh * 150 + 70 - scrollX * 0.3) % (W + 80) + W + 80) % (W + 80) - 40;
        ctx.fillStyle = '#6a7a3a'; ctx.beginPath(); ctx.ellipse(shx, GY - 4, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a7040'; ctx.fillRect(shx + 24, GY - 22, 4, 22); ctx.fillRect(shx + 18, GY - 16, 5, 3); ctx.fillRect(shx + 29, GY - 12, 5, 3);
      }
      // Heat: the far road shimmers
      ctx.fillStyle = 'rgba(255,255,255,' + (0.06 + Math.sin(frame * 0.2) * 0.03).toFixed(3) + ')';
      ctx.fillRect(-8, GY - 2, W + 16, 2);
    } else if (sky.scene === 'vegas') {
      // The Strip: casino towers, neon signs, palms, the whole place lit
      var NEON = [PINK, CYAN, LIME, YELLOW, '#B026FF', '#ff8a00'];
      for (var tw = 0; tw < 7; tw++) {
        var twx = ((tw * 130 + 20 - scrollX * 0.12) % (W + 220) + W + 220) % (W + 220) - 110;
        var twh = 110 + (tw * 47) % 90;
        ctx.fillStyle = '#16122a'; ctx.fillRect(twx, GY - twh, 70, twh);
        ctx.fillStyle = NEON[tw % NEON.length]; ctx.fillRect(twx, GY - twh, 70, 3); ctx.fillRect(twx, GY - twh, 3, twh);
        ctx.fillStyle = 'rgba(255,255,200,0.5)';
        for (var wy5 = GY - twh + 8; wy5 < GY - 8; wy5 += 9) for (var wx5 = twx + 6; wx5 < twx + 64; wx5 += 9) if (((wy5 + wx5 + tw) >> 3) % 3 !== 0) ctx.fillRect(wx5, wy5, 4, 4);
      }
      for (var sg = 0; sg < 4; sg++) {
        var sgx = ((sg * 260 + 60 - scrollX * 0.3) % (W + 300) + W + 300) % (W + 300) - 150;
        var on = Math.floor(frame / 16 + sg) % 3 !== 0;
        ctx.fillStyle = on ? NEON[(sg + 2) % NEON.length] : '#3a2a4a';
        ctx.fillRect(sgx, GY - 92, 96, 34);
        ctx.fillStyle = '#0a0612'; ctx.fillRect(sgx + 4, GY - 88, 88, 26);
        ctx.fillStyle = on ? '#fff' : '#3a3a44'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(['CASINO', 'LOUNGE', 'INK 24H', 'VEGAS'][sg], sgx + 48, GY - 70);
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(sgx + 46, GY - 58, 4, 58);
      }
      for (var pm = 0; pm < 6; pm++) {
        var pmx = ((pm * 150 + 100 - scrollX * 0.45) % (W + 120) + W + 120) % (W + 120) - 60;
        ctx.fillStyle = '#3a2e22'; ctx.fillRect(pmx, GY - 54, 4, 54);
        ctx.fillStyle = '#2f7a3a';
        for (var fr = 0; fr < 5; fr++) { ctx.save(); ctx.translate(pmx + 2, GY - 54); ctx.rotate(-1.2 + fr * 0.6); ctx.fillRect(0, -2, 22, 4); ctx.restore(); }
      }
    } else {
      // The Flatirons lean out of the sunset above Boulder pines
      for (var i = 0; i < 5; i++) {
        var fx2 = ((i * 170 + 20 - scrollX * 0.15) % (W + 260) + W + 260) % (W + 260) - 130;
        var fh2 = 90 + (i * 31) % 40;
        ctx.fillStyle = '#241a30';
        ctx.beginPath();
        ctx.moveTo(fx2, GY);
        ctx.lineTo(fx2 + 52, GY - fh2);
        ctx.lineTo(fx2 + 96, GY);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,140,60,0.35)';
        ctx.beginPath();
        ctx.moveTo(fx2 + 52, GY - fh2);
        ctx.lineTo(fx2 + 62, GY - fh2 + 24);
        ctx.lineTo(fx2 + 52, GY - fh2 + 26);
        ctx.fill();
      }
      for (var i = 0; i < 9; i++) {
        var px3 = ((i * 105 + 50 - scrollX * 0.3) % (W + 120) + W + 120) % (W + 120) - 60;
        var ph3 = 16 + (i * 29) % 12;
        ctx.fillStyle = '#161f18';
        ctx.beginPath();
        ctx.moveTo(px3, GY);
        ctx.lineTo(px3 + 7, GY - ph3);
        ctx.lineTo(px3 + 14, GY);
        ctx.fill();
      }
    }

    if (sky.weather === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (var fi = 0; fi < 46; fi++) {
        var fx5 = ((fi * 73 + frame * (0.4 + (fi % 3) * 0.3) + Math.sin(frame * 0.02 + fi) * 8) % (W + 20) + W + 20) % (W + 20) - 10;
        var fy5 = ((fi * 41 + frame * (0.9 + (fi % 4) * 0.35)) % (GY + 30));
        ctx.fillRect(fx5, fy5, fi % 5 === 0 ? 2 : 1, fi % 5 === 0 ? 2 : 1);
      }
    } else if (sky.weather === 'rain') {
      ctx.fillStyle = 'rgba(170,190,255,0.35)';
      for (var ri = 0; ri < 40; ri++) {
        var rx5 = ((ri * 97 - frame * 1.2 - scrollX * 0.5) % (W + 40) + W + 40) % (W + 40) - 20;
        var ry5 = ((ri * 53 + frame * 7) % (GY + 20));
        ctx.fillRect(rx5, ry5, 1, 7);
      }
      // wet street: a little sky in the asphalt
      ctx.fillStyle = 'rgba(120,120,200,0.10)';
      ctx.fillRect(-8, GY, W + 16, 18);
    }

    // Street lamps ride between the buildings and the street; at night they
    // throw a cone on the pavement the skater rolls through.
    if (sky.scene === 'city') {
      for (var li = 0; li < 3; li++) {
        var lpx = ((li * 230 + 90 - scrollX * 0.6) % (W + 120) + W + 120) % (W + 120) - 60;
        ctx.fillStyle = '#2a2a34';
        ctx.fillRect(lpx, GY - 92, 3, 92);
        ctx.fillRect(lpx - 1, GY - 94, 12, 3);
        ctx.fillRect(lpx + 9, GY - 92, 3, 6);
        ctx.fillStyle = sky.lights ? '#fff2b0' : '#8a8a96';
        ctx.fillRect(lpx + 8, GY - 86, 5, 3);
        if (sky.lights) {
          var cone = ctx.createRadialGradient(lpx + 10, GY - 84, 2, lpx + 10, GY - 84, 110);
          cone.addColorStop(0, 'rgba(255,240,180,0.22)');
          cone.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.fillStyle = cone;
          ctx.beginPath();
          ctx.moveTo(lpx + 10, GY - 84);
          ctx.lineTo(lpx - 50, GY + 16);
          ctx.lineTo(lpx + 70, GY + 16);
          ctx.fill();
        }
      }
    }

    // Street layer: parked cars and trees on the far curb, just behind the road
    if (sky.scene === 'city' || sky.scene === 'rino' || sky.scene === 'golden' || sky.scene === 'vegas' || sky.scene === 'flatirons') {
      for (var sc = 0; sc < 5; sc++) {
        var scx = ((sc * 210 + 40 - scrollX * 0.8) % (W + 300) + W + 300) % (W + 300) - 150;
        if (sc % 2 === 0) {
          var carCol = ['#4a6aa8', '#8a3a3a', '#d8d8d8', '#3a3a44'][sc % 4];
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(scx + 4, GY - 2, 72, 3);
          ctx.fillStyle = carCol; ctx.fillRect(scx + 3, GY - 18, 66, 12); ctx.fillRect(scx + 16, GY - 25, 36, 8);
          ctx.fillStyle = '#9ac8ee'; ctx.fillRect(scx + 19, GY - 24, 14, 6); ctx.fillRect(scx + 36, GY - 24, 13, 6);
          ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(scx + 16, GY - 5, 5, 0, Math.PI * 2); ctx.arc(scx + 56, GY - 5, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = sky.lights ? '#fff8c0' : '#ccc'; ctx.fillRect(scx + 66, GY - 15, 3, 3);
        } else {
          ctx.fillStyle = '#3a2e22'; ctx.fillRect(scx + 30, GY - 34, 5, 34);
          ctx.fillStyle = sky.scene === 'vegas' ? '#2f7a3a' : '#2f6a3a';
          ctx.beginPath(); ctx.arc(scx + 32, GY - 42, 16, 0, Math.PI * 2); ctx.arc(scx + 22, GY - 34, 11, 0, Math.PI * 2); ctx.arc(scx + 43, GY - 35, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(scx + 28, GY - 47, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(scx + 26, GY - 2, 18, 3);
        }
      }
    }

    // Ground: the terrain, drawn as one surface from the heightmap
    ctx.fillStyle = sky.ground;
    ctx.beginPath();
    ctx.moveTo(-8, H + 8);
    // (concrete grain is laid over the fill below)
    for (var tx0 = -8; tx0 <= W + 8; tx0 += 4) ctx.lineTo(tx0, terrainY(scrollX + tx0) - camY);
    ctx.lineTo(W + 8, H + 8);
    ctx.closePath();
    ctx.fill();
    var grain = concrete();
    if (grain) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = grain;
      ctx.translate(-(scrollX % 64), 0);
      ctx.fillRect(-64, 0, W + 128, H);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var tx1 = -8; tx1 <= W + 8; tx1 += 4) { var ty1 = terrainY(scrollX + tx1) - camY; if (tx1 === -8) ctx.moveTo(tx1, ty1); else ctx.lineTo(tx1, ty1); }
    ctx.stroke();
    ctx.lineWidth = 1;
    // Lane dashes and street detail follow the surface
    ctx.fillStyle = sky.dash;
    for (var di = 0; di < 22; di++) {
      var dwx = Math.floor(scrollX / 40) * 40 + (di - 1) * 40;
      var dsx = dwx - scrollX;
      if (dsx < -30 || dsx > W + 10) continue;
      var dsy = terrainY(dwx + 10) - camY + 15;
      ctx.save();
      ctx.translate(dsx, dsy);
      ctx.rotate(Math.atan(slopeAt(dwx + 10)));
      ctx.fillRect(0, 0, 20, 2);
      ctx.restore();
    }
    for (var gi = 0; gi < 3; gi++) {
      var gwx = Math.floor(scrollX / 310) * 310 + gi * 310 + 140;
      var gx = gwx - scrollX;
      if (gx < -40 || gx > W + 40) continue;
      var ggy = terrainY(gwx) - camY;
      if (gi === 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(gx, ggy + 7, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.ellipse(gx, ggy + 6, 10, 2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (gi === 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (var dg = 0; dg < 4; dg++) ctx.fillRect(gx + dg * 5, ggy + 3, 3, 8);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(gx, ggy + 4, 14, 1); ctx.fillRect(gx + 13, ggy + 5, 9, 1); ctx.fillRect(gx + 21, ggy + 3, 6, 1);
      }
    }
    // Stair sets: concrete steps down, the low run, the bank back up
    for (var sti = 0; sti < features.length; sti++) {
      var sf2 = features[sti];
      if (sf2.type !== 'stairs') continue;
      var ssx = sf2.x - scrollX;
      if (ssx > W + 20 || ssx + sf2.w < -20) continue;
      var stepW = sf2.w * 0.55 / 5, roadTop = GROUND_Y + hillY(sf2.x) - camY;
      for (var st2 = 0; st2 < 5; st2++) {
        var sy2 = roadTop + sf2.h * st2 / 5;
        ctx.fillStyle = '#8e8e96'; ctx.fillRect(ssx + st2 * stepW, sy2, stepW + 1, sf2.h - sf2.h * st2 / 5 + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(ssx + st2 * stepW, sy2, stepW, 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(ssx + st2 * stepW, sy2 + 2, 1.5, sf2.h - sf2.h * st2 / 5);
      }
      ctx.fillStyle = 'rgba(255,60,60,' + (0.25 + 0.2 * Math.sin(frame * 0.2)).toFixed(2) + ')';
      ctx.fillRect(ssx, roadTop + sf2.h + 2, sf2.w * 0.8, 2);
      // the sign: GAP, on a post before the steps
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(ssx - 30, roadTop - 44, 3, 44);
      ctx.fillStyle = YELLOW; ctx.fillRect(ssx - 44, roadTop - 58, 32, 16);
      ctx.fillStyle = '#000'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText('GAP', ssx - 28, roadTop - 46);
    }
    // Ramps are built things on the road: plywood kickers, steel launch ramps
    // with a hazard stripe, concrete lips with coping. You should never miss one.
    for (var fi2 = 0; fi2 < features.length; fi2++) {
      var ff = features[fi2];
      var fsx = ff.x - scrollX;
      if (ff.type === 'stairs' || fsx > W + 20 || fsx + ff.w < -20) continue;
      var roadY = GROUND_Y + hillY(ff.x + ff.w) - camY;
      ctx.beginPath();
      ctx.moveTo(fsx, GROUND_Y + hillY(ff.x) - camY + 1);
      for (var rx0 = 0; rx0 <= ff.w; rx0 += 3) ctx.lineTo(fsx + rx0, terrainY(ff.x + Math.min(rx0, ff.w - 0.01)) - camY);
      ctx.lineTo(fsx + ff.w, roadY + 1);
      ctx.closePath();
      ctx.fillStyle = ff.type === 'kicker' ? '#8a6438' : ff.type === 'launch' ? '#5c5e6a' : '#8c8c92';
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (ff.type === 'kicker') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (var pl = 0; pl < ff.w; pl += 12) ctx.fillRect(fsx + pl, 0, 2, H);
      } else if (ff.type === 'launch') {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (var pl2 = 0; pl2 < ff.w; pl2 += 8) ctx.fillRect(fsx + pl2, 0, 4, H);
        ctx.fillStyle = YELLOW; ctx.fillRect(fsx + ff.w - 14, 0, 4, H); ctx.fillStyle = '#111'; ctx.fillRect(fsx + ff.w - 10, 0, 4, H); ctx.fillStyle = YELLOW; ctx.fillRect(fsx + ff.w - 6, 0, 4, H);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (var pl3 = 0; pl3 < ff.w; pl3 += 10) ctx.fillRect(fsx + pl3, 0, 1, H);
      }
      ctx.restore();
      // The face edge and the lip
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
      for (var rx1 = 0; rx1 <= ff.w; rx1 += 3) { var ry1 = terrainY(ff.x + Math.min(rx1, ff.w - 0.01)) - camY; if (rx1 === 0) ctx.moveTo(fsx, ry1); else ctx.lineTo(fsx + rx1, ry1); }
      ctx.stroke(); ctx.lineWidth = 1;
      var lipY = terrainY(ff.x + ff.w - 0.5) - camY;
      ctx.fillStyle = ff.type === 'qp' ? '#d8d8dc' : '#fff';
      ctx.fillRect(fsx + ff.w - 5, lipY - 3, 7, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(fsx + ff.w + 1, lipY, 3, roadY - lipY);
      // A launch arrow up the face so the ramp reads as a ramp from a screen away
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.25 * Math.sin(frame * 0.15)).toFixed(2) + ')';
      var ax0 = fsx + ff.w * 0.45, ay0 = terrainY(ff.x + ff.w * 0.45) - camY - 8;
      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax0 + 12, ay0 - 8); ctx.lineTo(ax0 + 8, ay0 - 8); ctx.lineTo(ax0 + 8, ay0 - 2); ctx.lineTo(ax0 + 4, ay0 - 2); ctx.lineTo(ax0 + 4, ay0 - 8); ctx.lineTo(ax0, ay0 - 8); ctx.fill();
    }

    // Street furniture: every piece has a body and a grind edge on top
    for (var i = 0; i < rails.length; i++) {
      var rail = rails[i];
      var rx = rail.x - scrollX;
      if (rx > W + 10 || rx + rail.w < -10) continue;
      var rty = rail.top - camY;
      var g1 = terrainY(rail.x + 3) - camY, g2 = terrainY(rail.x + rail.w - 4) - camY;
      var gmid = Math.max(g1, g2);
      var kind = rail.kind || 'rail';
      // long shadow from the one light
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(rx + rail.w / 2 + 6, gmid + 3, rail.w / 2 + 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      if (kind === 'rail' || kind === 'handrail') {
        ctx.fillStyle = '#888';
        ctx.fillRect(rx + 2, rty, 3, Math.max(2, g1 - rty));
        ctx.fillRect(rx + rail.w - 5, rty, 3, Math.max(2, g2 - rty));
        if (rail.w > 150) ctx.fillRect(rx + rail.w / 2 - 1, rty, 3, Math.max(2, gmid - rty));
        ctx.fillStyle = '#666';
        ctx.fillRect(rx, g1 - 2, 9, 2);
        ctx.fillRect(rx + rail.w - 7, g2 - 2, 9, 2);
      } else if (kind === 'bench') {
        ctx.fillStyle = '#5a4020'; ctx.fillRect(rx + 4, rty + 3, 3, gmid - rty - 3); ctx.fillRect(rx + rail.w - 7, rty + 3, 3, gmid - rty - 3);
        ctx.fillStyle = '#8a6438'; ctx.fillRect(rx, rty + 2, rail.w, 4); ctx.fillRect(rx, rty + 8, rail.w, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (var sl2 = rx + 8; sl2 < rx + rail.w - 6; sl2 += 14) ctx.fillRect(sl2, rty + 2, 1, 9);
      } else if (kind === 'planter') {
        ctx.fillStyle = '#6a6a72'; ctx.fillRect(rx, rty + 2, rail.w, gmid - rty - 2);
        ctx.fillStyle = '#7c7c84'; ctx.fillRect(rx, rty + 2, rail.w, 3);
        ctx.fillStyle = '#2f7a3a'; for (var pl4 = rx + 6; pl4 < rx + rail.w - 6; pl4 += 10) { ctx.beginPath(); ctx.arc(pl4, rty - 1, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#4aa050'; for (var pl5 = rx + 9; pl5 < rx + rail.w - 6; pl5 += 10) ctx.fillRect(pl5, rty - 4, 2, 2);
      } else if (kind === 'ledge') {
        ctx.fillStyle = '#9a9aa2'; ctx.fillRect(rx, rty + 2, rail.w, gmid - rty - 2);
        ctx.fillStyle = '#b4b4bc'; ctx.fillRect(rx, rty + 2, rail.w, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (var lj = rx + 30; lj < rx + rail.w; lj += 60) ctx.fillRect(lj, rty + 4, 1, gmid - rty - 4);
        if (rail.waxed) { ctx.fillStyle = 'rgba(40,30,20,0.35)'; ctx.fillRect(rx + rail.w * 0.2, rty + 1, rail.w * 0.55, 3); }
      } else if (kind === 'hydrant') {
        ctx.fillStyle = '#FF3333'; ctx.fillRect(rx + 2, rty + 4, 10, gmid - rty - 4); ctx.fillRect(rx, rty + 8, 14, 4);
        ctx.fillStyle = '#b01010'; ctx.fillRect(rx + 9, rty + 4, 3, gmid - rty - 4);
        ctx.fillStyle = '#c8c8d0'; ctx.fillRect(rx + 1, rty + 12, 2, 2); ctx.fillRect(rx + 11, rty + 12, 2, 2);
      } else if (kind === 'dumpster') {
        ctx.fillStyle = '#3a6a3a'; ctx.fillRect(rx, rty + 3, rail.w, gmid - rty - 3);
        ctx.fillStyle = '#2c522c'; ctx.fillRect(rx, rty + 3, rail.w, 5); ctx.fillRect(rx + 2, rty + 14, rail.w - 4, 2);
        ctx.fillStyle = '#222'; ctx.fillRect(rx + 4, gmid - 4, 6, 4); ctx.fillRect(rx + rail.w - 10, gmid - 4, 6, 4);
        ctx.fillStyle = '#f0e8d8'; ctx.fillRect(rx + 8, rty + 6, 4, 6); ctx.fillStyle = PINK; ctx.fillRect(rx + rail.w - 14, rty + 6, 3, 8);
      } else if (kind === 'carhood') {
        // A parked car, seen from the side: you grind the roofline
        ctx.fillStyle = '#b02040'; ctx.fillRect(rx + 4, rty + 8, rail.w - 8, gmid - rty - 14);
        ctx.fillRect(rx + rail.w * 0.22, rty + 2, rail.w * 0.5, 8);
        ctx.fillStyle = '#7ab8e8'; ctx.fillRect(rx + rail.w * 0.26, rty + 3, rail.w * 0.18, 6); ctx.fillRect(rx + rail.w * 0.5, rty + 3, rail.w * 0.18, 6);
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(rx + rail.w * 0.24, gmid - 4, 6, 0, Math.PI * 2); ctx.arc(rx + rail.w * 0.76, gmid - 4, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(rx + rail.w * 0.24, gmid - 4, 2.5, 0, Math.PI * 2); ctx.arc(rx + rail.w * 0.76, gmid - 4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff5c0'; ctx.fillRect(rx + rail.w - 8, rty + 12, 4, 3);
      }
      // the grind edge
      ctx.fillStyle = rail.scored ? CYAN : (kind === 'rail' || kind === 'handrail' ? '#ccc' : 'rgba(255,255,255,0.75)');
      ctx.fillRect(rx, rty, rail.w, kind === 'rail' || kind === 'handrail' ? 3 : 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(rx, rty, rail.w, 1);
    }

    for (var i = 0; i < obstacles.length; i++) {
      var ob = obstacles[i];
      var ox = ob.x - scrollX;
      if (ox > W + 10 || ox + ob.w < -10) continue;
      if (ob.gy === undefined) { ob.gy = terrainY(ob.x + ob.w / 2); ob.y = ob.gy - ob.h; }
      drawObstacle(ob, ox, ob.y - camY, ob.gy - camY);
    }

    for (var i = 0; i < collectibles.length; i++) {
      var col = collectibles[i];
      if (col.collected) continue;
      var cx = col.x - scrollX;
      if (cx > W + 10 || cx + col.w < -10) continue;
      drawFlashPickup(cx, col.y - camY + Math.sin(frame * 0.08 + col.x) * 2, col.kind);
    }

    if (mode === 'play' && speed > 5.2) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((speed - 5.2) * 0.05).toFixed(3) + ')';
      for (var i = 0; i < 5; i++) {
        var slx = ((i * 97 - scrollX * 2.2) % (W + 60) + W + 60) % (W + 60) - 30;
        ctx.fillRect(slx, 90 + i * 34, 26 + i * 4, 1);
      }
    }

    // S K A T E
    for (var lti = 0; lti < letters.length; lti++) {
      var ltr = letters[lti];
      var lsx = ltr.x - scrollX, lsy = ltr.y - camY + Math.sin(frame * 0.07 + ltr.x) * 3;
      if (lsx < -30 || lsx > W + 30) continue;
      ctx.fillStyle = 'rgba(255,215,0,' + (0.18 + 0.1 * Math.sin(frame * 0.2)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(lsx + 8, lsy + 8, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillText(ltr.ch, lsx + 9, lsy + 14);
      ctx.fillStyle = YELLOW; ctx.fillText(ltr.ch, lsx + 8, lsy + 13);
    }
    drawPlayer();
    if (looseBoard) {
      ctx.save();
      ctx.translate(looseBoard.x, looseBoard.y - camY);
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
      if (p.dust) { ctx.beginPath(); ctx.arc(p.x, p.y - camY, p.size, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(p.x, p.y - camY, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Score popups
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      var pu = popups[i];
      ctx.globalAlpha = Math.min(1, pu.life / 20);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y - camY);
    }
    ctx.globalAlpha = 1;

    // Level transition: the old town rolls up and away
    if (transT > 0 && transCtx) {
      transT--;
      var tp = 1 - transT / 55;
      var tyy = -(tp * tp) * (H + 26);
      try { ctx.drawImage(transCanvas, 0, tyy, W, H); } catch (e) { transT = 0; }
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

    // HUD: score and boards top-left with the goals under them, the town and its
    // progress top-center, the running line, multiplier, trick stack and the
    // special bar top-right.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(4, 4, 118, 44);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(String(score), 10, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('BEST ' + Math.max(best, wall.best(), score), 10, 29);
    for (var li = 0; li < MAX_LIVES; li++) {
      var alive = li < lives;
      var bx = 10 + li * 17, by = 36;
      ctx.fillStyle = alive ? (lives === 1 && Math.floor(frame / 8) % 2 === 0 ? '#FF5050' : PINK) : 'rgba(255,255,255,0.18)';
      ctx.fillRect(bx, by, 13, 3);
      ctx.fillStyle = alive ? '#fff' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(bx + 2, by + 3, 3, 2);
      ctx.fillRect(bx + 8, by + 3, 3, 2);
    }
    // goals
    if (mode === 'play' && goalCardT === 0) {
      ctx.font = 'bold 7px monospace';
      for (var gi2 = 0; gi2 < goals.length; gi2++) {
        var gl2 = goals[gi2], gy2 = 60 + gi2 * 11;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(4, gy2 - 8, 118, 10);
        ctx.fillStyle = gl2.done ? LIME : 'rgba(255,255,255,0.75)';
        ctx.fillText((gl2.done ? '[x] ' : '[ ] ') + gl2.text, 8, gy2);
        if (!gl2.done && gl2.id !== 'letters' && gl2.have > 0) { ctx.fillStyle = 'rgba(127,255,0,0.5)'; ctx.fillRect(8, gy2 + 1, Math.min(110, 110 * gl2.have / gl2.need), 1); }
      }
      // letters collected so far
      ctx.font = 'bold 9px monospace';
      for (var lc = 0; lc < 5; lc++) { ctx.fillStyle = lc < lettersGot ? YELLOW : 'rgba(255,255,255,0.22)'; ctx.fillText('SKATE'[lc], 8 + lc * 10, 104); }
    }
    // town + progress
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = LIME;
    ctx.fillText(LOCALES[(level - 1) % LOCALES.length].name + (hitsThisLevel === 0 ? ' // NO BAIL' : '') + (continueUsed ? ' // CONTINUED' : ''), W / 2, 13);
    var townProg = (dist - (level - 1) * 4000) / 4000;
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(W / 2 - 50, 17, 100, 3);
    ctx.fillStyle = LIME; ctx.fillRect(W / 2 - 50, 17, 100 * Math.max(0, Math.min(1, townProg)), 3);
    if (!player.onGround && !player.grinding && mode === 'play') {
      var airNow = Math.max(0, terrainY(scrollX + player.x + player.w / 2) - (player.y + player.h));
      if (airNow > 40) { ctx.fillStyle = airNow > 120 ? YELLOW : 'rgba(255,255,255,0.7)'; ctx.font = 'bold 9px monospace'; ctx.fillText('AIR ' + Math.round(airNow), W / 2, 30); }
    }
    if (shieldT > 0) {
      ctx.fillStyle = YELLOW; ctx.font = 'bold 8px monospace'; ctx.fillText('SHIELD', W / 2, 40);
      ctx.fillStyle = 'rgba(255,215,0,0.5)'; ctx.fillRect(W / 2 - 20, 43, 40 * (shieldT / 300), 2);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerText.indexOf('LEGENDARY') === 0 ? '#ff5ab0' : bannerText.indexOf('HUGE') === 0 ? YELLOW : bannerText.indexOf('SPECIAL') === 0 ? CYAN : LIME;
      ctx.font = 'bold ' + (bannerText.indexOf('LEGENDARY') === 0 ? 26 : 22) + 'px monospace';
      ctx.fillText(bannerText, W / 2, H / 2 - 40);
      ctx.globalAlpha = 1;
    }
    if (airNameT > 0 && mode === 'play') {
      airNameT--;
      ctx.globalAlpha = Math.min(1, airNameT / 12);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.font = 'bold 20px monospace'; ctx.fillText(airName, W / 2 + 1, H / 2 - 2);
      ctx.fillStyle = '#fff'; ctx.fillText(airName, W / 2, H / 2 - 3);
      ctx.globalAlpha = 1;
    }
    if (slowT > 0 && mode === 'play') {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(-8, -8, W + 16, H + 16);
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = 'bold 8px monospace'; ctx.fillText('PICK A TRICK', W / 2, H / 2 + 16);
    }
    // CONTROLS: a small button in the corner opens the trick book and holds the run.
    if (mode === 'play') {
      ctx.fillStyle = bookOpen ? YELLOW : 'rgba(0,0,0,0.55)';
      ctx.fillRect(BOOK_BTN.x, BOOK_BTN.y, BOOK_BTN.w, BOOK_BTN.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(BOOK_BTN.x + 0.5, BOOK_BTN.y + 0.5, BOOK_BTN.w - 1, BOOK_BTN.h - 1);
      ctx.fillStyle = bookOpen ? '#000' : '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('? CONTROLS', BOOK_BTN.x + BOOK_BTN.w / 2, BOOK_BTN.y + 11);
    }
    if (bookOpen && mode === 'play') {
      ctx.fillStyle = 'rgba(0,0,0,0.86)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = YELLOW; ctx.font = 'bold 16px monospace';
      ctx.fillText('TRICK BOOK', W / 2, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px monospace';
      ctx.fillText('the run is on hold', W / 2, 48);
      var book = [
        ['SPACE', 'ollie, hold it for big air'],
        ['hold UP at a lip', 'the board sends itself'],
        ['in the air: tap RIGHT / LEFT', 'kickflip / heelflip'],
        ['RIGHT RIGHT  //  LEFT LEFT', '360 flip  //  laser flip'],
        ['RIGHT LEFT  //  LEFT RIGHT', 'varial kickflip  //  varial heelflip'],
        ['DOWN RIGHT  //  DOWN LEFT', 'hardflip  //  inward heelflip'],
        ['UP RIGHT  //  UP LEFT', 'impossible  //  nollie heelflip'],
        ['UP UP  //  DOWN DOWN', 'double kickflip  //  pop shove-it'],
        ['hold LEFT or RIGHT', 'spin, 180 to 1080'],
        ['hold UP / DOWN / both', 'melon / indy / method'],
        ['on a rail: LEFT / RIGHT', 'change the grind'],
        ['DOWN on landing', 'manual, UP leans it'],
      ];
      ctx.font = 'bold 9px monospace';
      for (var bi = 0; bi < book.length; bi++) {
        var by = 68 + bi * 17;
        ctx.textAlign = 'right'; ctx.fillStyle = CYAN; ctx.fillText(book[bi][0], W / 2 - 8, by);
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(book[bi][1], W / 2 + 8, by);
      }
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px monospace';
      ctx.fillText('H, the button, or a tap closes this', W / 2, H - 14);
    }
    // the line, right side
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(W - 126, 4, 122, 44);
    if (linePts > 0 && mode === 'play') {
      var lineTotal = linePts * combo;
      ctx.fillStyle = lineTotal >= 5000 ? '#ff5ab0' : lineTotal >= 2000 ? YELLOW : '#fff';
      ctx.font = 'bold ' + (lineTotal >= 2000 ? 20 : 17) + 'px monospace';
      ctx.fillText(String(lineTotal), W - 10, 21);
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = linkWindow > 0 ? (Math.floor(frame / 4) % 2 === 0 ? '#ff9a3c' : '#fff') : 'rgba(255,255,255,0.75)';
      ctx.fillText(linePts + ' x ' + combo + (linkWindow > 0 ? ' // KEEP IT GOING' : ''), W - 10, 31);
    } else {
      ctx.fillStyle = lineFlashT > 0 ? LIME : 'rgba(255,255,255,0.35)';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(lineFlashT > 0 ? 'BANKED' : 'START A LINE', W - 10, 21);
    }
    // special bar
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(W - 120, 38, 110, 5);
    ctx.fillStyle = special >= 100 ? (Math.floor(frame / 6) % 2 === 0 ? '#fff' : CYAN) : CYAN;
    ctx.fillRect(W - 120, 38, 110 * (special / 100), 5);
    ctx.font = 'bold 6px monospace'; ctx.fillStyle = special >= 100 ? '#fff' : 'rgba(255,255,255,0.55)';
    ctx.fillText(special >= 100 ? 'SPECIAL READY: NEXT LINE PAYS x1.5' : 'SPECIAL', W - 10, 36);
    // trick stack: the last tricks of the line, newest at the bottom, fading up
    if (mode === 'play' && lineTricks.length) {
      ctx.font = 'bold 8px monospace';
      var stack = lineTricks.slice(-5);
      for (var ts = 0; ts < stack.length; ts++) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.7 * (ts + 1) / stack.length).toFixed(2) + ')';
        ctx.fillText(stack[ts], W - 10, 58 + ts * 10);
      }
    }
    // goal card at the town's start, the tally at its end
    if (goalCardT > 0 && mode === 'play' && !bookOpen) {
      var ga = Math.min(1, goalCardT / 30, (200 - goalCardT) / 20 + 0.2);
      ctx.globalAlpha = ga * 0.92;
      ctx.fillStyle = '#0a0812'; ctx.fillRect(70, 90, 260, 30 + goals.length * 16);
      ctx.fillStyle = LIME; ctx.fillRect(70, 90, 260, 3);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
      ctx.fillText(LOCALES[(level - 1) % LOCALES.length].name + ' // PARK GOALS', W / 2, 108);
      ctx.textAlign = 'left'; ctx.font = 'bold 9px monospace';
      for (var gc = 0; gc < goals.length; gc++) { ctx.fillStyle = goals[gc].done ? LIME : YELLOW; ctx.fillText((goals[gc].done ? '[x] ' : '[ ] ') + goals[gc].text, 84, 126 + gc * 16); }
      ctx.globalAlpha = 1;
    }
    if (tallyT > 0 && mode === 'play') {
      var ta = Math.min(1, tallyT / 30, (240 - tallyT) / 20 + 0.2);
      ctx.globalAlpha = ta * 0.92;
      ctx.fillStyle = '#0a0812'; ctx.fillRect(60, 84, 280, 34 + tallyLines.length * 15);
      ctx.fillStyle = YELLOW; ctx.fillRect(60, 84, 280, 3);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
      ctx.fillText('TOWN CLEARED', W / 2, 102);
      ctx.textAlign = 'left'; ctx.font = 'bold 9px monospace';
      for (var tl = 0; tl < tallyLines.length; tl++) { ctx.fillStyle = tallyLines[tl].ok ? LIME : 'rgba(255,255,255,0.5)'; ctx.fillText((tl < tallyLines.length - 1 ? (tallyLines[tl].ok ? '[x] ' : '[ ] ') : '') + tallyLines[tl].text, 74, 120 + tl * 15); }
      ctx.globalAlpha = 1;
    }
    ctx.font = 'bold 10px monospace';
    if ((wasManual || player.grinding) && mode === 'play') {
      var balNow = player.grinding ? grindBal : manualBal;
      var mx0 = W / 2 - 40, my0 = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(mx0 - 2, my0 - 2, 84, 9);
      ctx.fillStyle = Math.abs(balNow) > 0.7 ? '#ff5050' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(mx0, my0, 80, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(mx0 + 39, my0 - 1, 2, 7);
      ctx.fillStyle = Math.abs(balNow) > 0.7 ? '#ff5050' : YELLOW;
      ctx.fillRect(mx0 + 38 + Math.max(-1, Math.min(1, balNow)) * 38, my0 - 2, 4, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(player.grinding ? 'HOLD L/R TO BALANCE' : manualKind === 'nose' ? 'NOSE MANUAL' : 'BALANCE', W / 2, my0 + 15);
      ctx.font = 'bold 10px monospace';
    }

    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();



    ctx.restore();
  }

  function drawPlayer() {
    var px = player.x, py = player.y - camY;
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

    // Shadow on the ground under the skater, shrinking with height
    var wxs = scrollX + player.x + player.w / 2;
    var gys = terrainY(wxs) - camY;
    var air2 = !player.onGround && !player.grinding;
    var height = Math.max(0, gys - (py + player.h));
    var shAlpha = Math.max(0.2, 0.38 - height / 400);
    if (air2 && height > 50) {
      // Where you land: a ring on the road under you (the road scrolls, you do not)
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.3 * Math.sin(frame * 0.3)).toFixed(2) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(px + player.w / 2, gys + 2, 14, 4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (shAlpha > 0) {
      ctx.save();
      ctx.translate(px + player.w / 2 + 5 + height * 0.08, gys + 2);
      ctx.rotate(Math.atan(slopeAt(wxs)));
      ctx.fillStyle = 'rgba(0,0,0,' + shAlpha.toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(4, 12 - height / 12), 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(px + player.w / 2, py + player.h / 2 + squash / 2);
    if (player.bailT > 0) {
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
    var air = !player.onGround && !player.grinding;
    if (player.backT > 0) ctx.rotate(-(1 - player.backT / 36) * Math.PI * 2);
    else if (air) ctx.rotate(lean + spinAngle);
    else if (player.onGround) ctx.rotate(Math.atan(groundSlope) * 0.85);
    ctx.translate(-(player.w / 2), -(player.h / 2));

    var grab = air ? grabName : '';
    var pushing = player.pushT > 0 && !air && !player.grinding && !wasManual;
    var pushF = pushing ? Math.floor((16 - player.pushT) / 2) % 8 : -1; // 8-frame push cycle
    var popping = player.popT > 0 && air;
    var sliding = slideT > 0;
    var ACC = (window.__ARCADE_ACCENT__ && /^#[0-9a-f]{6}$/i.test(window.__ARCADE_ACCENT__)) ? window.__ARCADE_ACCENT__ : PINK;
    var SKIN = '#e8b48c', SKIN2 = '#c9976e', TEE = ACC, JEANS = '#2f3f5a', JEANS2 = '#24324a', SHOE = '#181820';

    // The deck: trucks and wheels, wheels spin with the road
    ctx.save();
    ctx.translate(10, 17.5);
    if (flipAnim) {
      // roll = the board flipping over its long axis (a rotation in side view),
      // yaw = a shove spin (the deck foreshortens as it turns), pop = the
      // hardflip family kicks up, wrap = the impossible wraps the back foot,
      // nose = a nollie pops off the front.
      var fp = 1 - flipAnim.t / flipAnim.dur;
      if (flipAnim.nose) ctx.translate(4, -2 * Math.sin(fp * Math.PI));
      if (flipAnim.pop) ctx.translate(0, -5 * Math.sin(fp * Math.PI));
      if (flipAnim.roll) ctx.rotate(fp * Math.PI * 2 * flipAnim.roll);
      if (flipAnim.yaw) {
        var cy = Math.cos(fp * Math.PI * 2 * flipAnim.yaw);
        ctx.scale(Math.abs(cy) < 0.15 ? 0.15 : cy, 1);
      }
      if (flipAnim.wrap) {
        var wr = fp * Math.PI * 2;
        ctx.rotate(wr);
        ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(wr))));
      }
    }
    if (grab === 'MELON' || grab === 'NOSEGRAB') ctx.rotate(0.35);
    else if (grab === 'INDY' || grab === 'STALEFISH') ctx.rotate(-0.3);
    else if (grab === 'METHOD' || grab === 'TAILGRAB' || grab === 'CHRIST AIR') { ctx.rotate(0.55); ctx.scale(1, 0.85); }
    if (wasManual) ctx.rotate(manualKind === 'nose' ? 0.28 : -0.28);
    if (sliding) ctx.scale(0.35, 1);
    if (player.grinding && grindTilt) ctx.rotate(grindTilt * 0.22);
    // deck with a kick at each end
    ctx.fillStyle = '#2a1c12';
    ctx.beginPath(); ctx.moveTo(-13, -1.5); ctx.lineTo(-11, -3); ctx.lineTo(11, -3); ctx.lineTo(13, -1.5); ctx.lineTo(13, 0.5); ctx.lineTo(-13, 0.5); ctx.fill();
    ctx.fillStyle = '#b8743a'; ctx.fillRect(-12.5, 0.5, 25, 1.5);
    ctx.fillStyle = ACC; ctx.fillRect(-4, 0.5, 8, 1.5);
    // trucks
    ctx.fillStyle = '#9aa2ae'; ctx.fillRect(-9, 2, 4, 2.5); ctx.fillRect(5, 2, 4, 2.5);
    ctx.fillStyle = '#6a7280'; ctx.fillRect(-9.5, 2, 5, 1);
    ctx.fillRect(4.5, 2, 5, 1);
    // wheels with a spoke that turns
    var wheelA = (scrollX * 0.25) % (Math.PI * 2);
    for (var wi = 0; wi < 2; wi++) {
      var wxp = wi === 0 ? -7.5 : 7.5;
      ctx.fillStyle = '#f2e9c8'; ctx.beginPath(); ctx.arc(wxp, 5, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a7a50'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(wxp - Math.cos(wheelA) * 2.2, 5 - Math.sin(wheelA) * 2.2); ctx.lineTo(wxp + Math.cos(wheelA) * 2.2, 5 + Math.sin(wheelA) * 2.2); ctx.stroke();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(wxp, 5, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Legs: knees bend riding, pull up in the air, the back leg swings for the push
    var tuck = popping ? -1 : air ? 3 : 0;
    if (grab === 'METHOD' || grab === 'TAILGRAB' || grab === 'CHRIST AIR') tuck = 5;
    var pushSwing = pushF >= 0 ? Math.sin(pushF / 8 * Math.PI * 2) : 0; // -1..1 over the cycle
    var pushDown = pushF >= 0 ? Math.max(0, Math.sin(pushF / 8 * Math.PI * 2)) : 0;
    ctx.fillStyle = JEANS2;
    // back leg (the pushing leg)
    var blx = 4 - pushSwing * 5, bly = 7 - tuck + squash + pushDown * 3;
    ctx.fillRect(blx, bly, 3.5, 6);
    ctx.fillStyle = JEANS; ctx.fillRect(blx - pushSwing * 2, bly + 5, 3.5, 4 + pushDown * 3);
    // front leg
    ctx.fillStyle = JEANS; ctx.fillRect(13, 7 - tuck + squash, 3.5, 6); ctx.fillRect(13.5, 12 - tuck + squash, 3.5, 3);
    ctx.fillStyle = JEANS; ctx.fillRect(5, 5 - tuck + squash, 10, 3.5);
    // shoes
    ctx.fillStyle = SHOE;
    ctx.fillRect(blx - pushSwing * 3, 15 - (pushDown > 0 ? 0 : tuck) + squash / 2 + pushDown * 4, 6, 3);
    ctx.fillRect(12, 15 - tuck + squash / 2, 6, 3);
    ctx.fillStyle = '#fff'; ctx.fillRect(blx - pushSwing * 3 + 1, 17.5 - (pushDown > 0 ? 0 : tuck) + squash / 2 + pushDown * 4, 4, 0.8); ctx.fillRect(13, 17.5 - tuck + squash / 2, 4, 0.8);
    // torso: the shirt in the artist's accent, a lean into the ride
    ctx.fillStyle = TEE;
    ctx.beginPath(); ctx.moveTo(6, -2.5 + squash); ctx.lineTo(14.5, -2.5 + squash); ctx.lineTo(15, 6 + squash); ctx.lineTo(5.5, 6 + squash); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(12, -2.5 + squash, 3, 8.5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(7.5, -2.5 + squash, 1.5, 8);
    // arms: trailing riding, thrown wide in the air, reaching the rail for a grab
    ctx.fillStyle = SKIN;
    if (grab === 'CHRIST AIR') { ctx.fillRect(-1, -1 + squash, 7, 3); ctx.fillRect(14, -1 + squash, 7, 3); }
    else if (grab === 'MELON' || grab === 'NOSEGRAB') { ctx.fillRect(13.5, 0 + squash, 3, 6); ctx.fillRect(14.5, 6 + squash, 3, 8); ctx.fillRect(2, -4 + squash, 3, 5); }
    else if (grab === 'INDY' || grab === 'STALEFISH') { ctx.fillRect(4, 0 + squash, 3, 6); ctx.fillRect(3, 6 + squash, 3, 8); ctx.fillRect(15, -4 + squash, 3, 5); }
    else if (grab === 'METHOD' || grab === 'TAILGRAB') { ctx.fillRect(2, 2 + squash, 3, 7); ctx.fillRect(1, 9 + squash, 3, 6); ctx.fillRect(15, -6 + squash, 3, 5); }
    else if (air) { ctx.fillRect(1, -5 + squash, 4, 3); ctx.fillRect(15, -5 + squash, 4, 3); ctx.fillRect(3, -3 + squash, 3, 4); ctx.fillRect(14, -3 + squash, 3, 4); }
    else if (sliding) { ctx.fillRect(0, -2 + squash, 4, 3); ctx.fillRect(16, -2 + squash, 4, 3); }
    else { ctx.fillRect(3.5, -1 + squash + pushSwing, 3, 6); ctx.fillRect(14, 0 + squash - pushSwing, 3, 6); }
    ctx.fillStyle = SKIN2; ctx.fillRect(4, 4 + squash, 2, 1.5); ctx.fillRect(14.5, 5 + squash, 2, 1.5);
    // neck, head, face, the cap in the accent, brim back
    ctx.fillStyle = SKIN; ctx.fillRect(9, -4.5 + squash, 3, 2.5);
    ctx.fillRect(6.5, -10 + squash, 8, 6.5);
    ctx.fillStyle = SKIN2; ctx.fillRect(6.5, -5 + squash, 8, 1.5);
    ctx.fillStyle = '#fff'; ctx.fillRect(12, -8.5 + squash, 2, 2);
    ctx.fillStyle = '#000'; ctx.fillRect(13, -8.5 + squash, 1, 2);
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(6, -6.5 + squash, 2, 3);
    ctx.fillStyle = ACC; ctx.fillRect(5.5, -12 + squash, 10, 3.5); ctx.fillRect(3, -11 + squash, 3.5, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(5.5, -9 + squash, 10, 0.8);
    ctx.restore();
  }

  function drawObstacle(ob, ox, oy, gyS) {
    if (ob.type === 'dog') {
      // A loose dog, low and fast, coming the other way
      var run = Math.floor(frame / 5) % 2;
      ctx.fillStyle = '#a0743c';
      ctx.fillRect(ox + 4, oy + 3, 12, 6);
      ctx.fillRect(ox + 13, oy, 6, 6);
      ctx.fillRect(ox, oy + 1, 5, 3);
      ctx.fillStyle = '#7a5428';
      ctx.fillRect(ox + 5, oy + 9, 3, run ? 3 : 2);
      ctx.fillRect(ox + 12, oy + 9, 3, run ? 2 : 3);
      ctx.fillRect(ox + 15, oy - 2, 2, 3);
      ctx.fillStyle = '#000';
      ctx.fillRect(ox + 17, oy + 2, 1, 1);
      ctx.fillStyle = '#e8283c';
      ctx.fillRect(ox + 12, oy + 6, 5, 1);
      return;
    }
    if (ob.type === 'cyclist') {
      // A bike commuter in a helmet, head down, not stopping
      var spin = Math.floor(frame / 4) % 2;
      ctx.fillStyle = '#ddd';
      ctx.fillRect(ox + 1, oy + 22, 7, 7);
      ctx.fillRect(ox + 11, oy + 22, 7, 7);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(ox + 3, oy + 24, 3, 3);
      ctx.fillRect(ox + 13, oy + 24, 3, 3);
      if (spin) { ctx.fillRect(ox + 2, oy + 25, 5, 1); ctx.fillRect(ox + 12, oy + 25, 5, 1); }
      ctx.fillStyle = '#e8283c';
      ctx.fillRect(ox + 4, oy + 17, 11, 2);
      ctx.fillRect(ox + 8, oy + 13, 2, 5);
      ctx.fillStyle = '#3a4a66';
      ctx.fillRect(ox + 6, oy + 12, 5, 6);
      ctx.fillStyle = '#2fbf71';
      ctx.fillRect(ox + 7, oy + 5, 6, 8);
      ctx.fillStyle = '#e8b48c';
      ctx.fillRect(ox + 12, oy + 9, 4, 2);
      ctx.fillRect(ox + 9, oy + 1, 5, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(ox + 8, oy - 1, 7, 3);
      return;
    }
    if (ob.type === 'car') {
      // At the curb it sits back in the background lane flashing; out, it is in your lane.
      var lift = ob.out ? 0 : 10, cw = ob.w, ch = ob.h;
      var flash = !ob.out && Math.floor(frame / 6) % 2 === 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(ox + cw / 2 + 6, gyS + 2, cw / 2 + 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ob.out ? '#d8d8e0' : '#c0c0c8';
      ctx.fillRect(ox + 3, oy + 8 - lift, cw - 6, ch - 12);
      ctx.fillRect(ox + cw * 0.2, oy + 1 - lift, cw * 0.55, 9);
      ctx.fillStyle = '#7ab8e8'; ctx.fillRect(ox + cw * 0.24, oy + 2 - lift, cw * 0.2, 7); ctx.fillRect(ox + cw * 0.5, oy + 2 - lift, cw * 0.2, 7);
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(ox + cw * 0.22, gyS - 4 - lift, 6, 0, Math.PI * 2); ctx.arc(ox + cw * 0.78, gyS - 4 - lift, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = flash ? '#fff8a0' : '#8a8a60'; ctx.fillRect(ox + cw - 6, oy + 12 - lift, 5, 4);
      ctx.fillStyle = flash ? '#ff9a3c' : '#804020'; ctx.fillRect(ox + cw - 6, oy + 17 - lift, 5, 3); ctx.fillRect(ox + 1, oy + 17 - lift, 5, 3);
      if (!ob.out && ob.warnT < 60) { ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText('!', ox + cw / 2, oy - 8 - lift); }
      return;
    }
    if (ob.type === 'pigeon') {
      var flapPh = Math.floor(frame / 4) % 3;
      var flap = flapPh === 0;
      ctx.fillStyle = '#a8b0c0';
      ctx.fillRect(ox + 3, oy + 2, 9, 6);
      ctx.fillStyle = '#5a8a5a';
      ctx.fillRect(ox + 10, oy + 3, 3, 2);
      ctx.fillStyle = '#8890a0';
      if (flapPh === 0) ctx.fillRect(ox + 2, oy - 3, 7, 3);
      else if (flapPh === 1) ctx.fillRect(ox + 3, oy + 1, 7, 2);
      else ctx.fillRect(ox + 4, oy + 5, 7, 3);
      ctx.fillStyle = '#a8b0c0';
      ctx.fillRect(ox + 11, oy, 4, 4);
      ctx.fillStyle = '#FF8A00';
      ctx.fillRect(ox + 15, oy + 1, 2, 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(ox + 13, oy + 1, 1, 1);
      return;
    }
    if (ob.type === 'spill') {
      ctx.fillStyle = 'rgba(200,0,110,0.85)';
      ctx.beginPath();
      ctx.ellipse(ox + ob.w / 2, gyS - 1, ob.w / 2, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(ox + 6, gyS - 3, 6, 1);
      if (Math.floor(frame / 20) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,20,147,0.5)';
        ctx.fillRect(ox + ob.w / 2 - 1, gyS - 8, 2, 2);
      }
      return;
    }
    if (ob.type === 'stack') {
      ctx.fillStyle = '#777';
      ctx.fillRect(ox + 1, oy + 21, 14, 19);
      ctx.fillStyle = '#999';
      ctx.fillRect(ox, oy + 18, 16, 4);
      ctx.fillStyle = '#666';
      ctx.fillRect(ox + 1, oy + 28, 14, 1);
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(ox + 2, oy + 3, 13, 16);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(ox + 1, oy, 15, 4);
      return;
    }
    // Everything on the street casts a little shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(ox + ob.w / 2, gyS + 2, ob.w / 2 + 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    if (ob.type === 'hydrant') {
      ctx.fillStyle = '#FF3333';
      ctx.fillRect(ox + 2, oy + 4, 8, 14);
      ctx.fillRect(ox, oy + 6, 12, 4);
      ctx.fillRect(ox + 3, oy, 6, 5);
      ctx.fillStyle = '#b01010';
      ctx.fillRect(ox + 7, oy + 4, 3, 14);
      ctx.fillRect(ox + 9, oy + 6, 3, 4);
      ctx.fillStyle = '#CC0000';
      ctx.fillRect(ox + 4, oy, 4, 2);
      ctx.fillStyle = '#ff9a9a';
      ctx.fillRect(ox + 3, oy + 5, 1, 10);
      ctx.fillStyle = '#c8c8d0';
      ctx.fillRect(ox + 1, oy + 10, 2, 2); ctx.fillRect(ox + 9, oy + 10, 2, 2);
      ctx.fillRect(ox, oy + 12, 1, 3); ctx.fillRect(ox + 11, oy + 12, 1, 3);
    } else if (ob.type === 'trashcan') {
      ctx.fillStyle = '#777';
      ctx.fillRect(ox + 1, oy + 3, 14, 19);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(ox + 10, oy + 3, 5, 19);
      ctx.fillStyle = '#999';
      ctx.fillRect(ox, oy, 16, 4);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(ox + 2, oy - 1, 12, 2);
      ctx.fillStyle = '#666';
      ctx.fillRect(ox + 1, oy + 10, 14, 1);
      ctx.fillRect(ox + 1, oy + 16, 14, 1);
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(ox + 3, oy + 5, 1, 15);
      // a coffee cup and a flyer poking out
      ctx.fillStyle = '#f0e8d8'; ctx.fillRect(ox + 4, oy - 5, 4, 5);
      ctx.fillStyle = PINK; ctx.fillRect(ox + 10, oy - 4, 3, 5);
    } else if (ob.type === 'cone') {
      ctx.fillStyle = '#ff8a00';
      ctx.fillRect(ox + 1, oy + 10, 10, 4);
      ctx.fillRect(ox + 3, oy + 5, 6, 5);
      ctx.fillRect(ox + 4, oy, 4, 5);
      ctx.fillStyle = '#c05a00';
      ctx.fillRect(ox + 7, oy + 5, 2, 5); ctx.fillRect(ox + 7, oy + 1, 1, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(ox + 2, oy + 7, 8, 2);
      ctx.fillStyle = '#222';
      ctx.fillRect(ox, oy + 13, 12, 1);
    }
  }

  // Floating flash to snatch mid-air: the classics
  function drawFlashPickup(cx, cy, kind) {
    if (kind === 'deck') {
      ctx.fillStyle = 'rgba(255,128,152,0.35)';
      ctx.fillRect(cx - 3, cy - 3, 20, 20);
      ctx.fillStyle = '#241a14'; ctx.fillRect(cx, cy + 4, 14, 2);
      ctx.fillStyle = '#a05a24'; ctx.fillRect(cx, cy + 6, 14, 2);
      ctx.fillStyle = YELLOW; ctx.fillRect(cx + 1, cy + 8, 3, 3); ctx.fillRect(cx + 10, cy + 8, 3, 3);
      ctx.fillStyle = '#ff8098'; ctx.fillRect(cx + 5, cy, 4, 3);
    } else if (kind === 'horseshoe') {
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
      if (mode === 'play') {
        // The peak of a big air runs at half speed for a beat so you can read
        // the height and pick the trick.
        if (slowT > 0 && (slowTick++ & 1)) slowT--;
        else update();
      }
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
