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
  function sfxPaddle() { playSfx(440, 0.05, 'square', 0.1); }
  function sfxWall() { playSfx(220, 0.04, 'square', 0.08); }
  function sfxScore() { playSfx(700, 0.12, 'square', 0.12); }
  function sfxLose() { playSfx(200, 0.2, 'sawtooth', 0.13); }
  function sfxWin() { playSfx(600, 0.12, 'square', 0.12); setTimeout(function(){playSfx(800, 0.12, 'square', 0.12);}, 110); setTimeout(function(){playSfx(1100, 0.2, 'square', 0.12);}, 220); }
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

  // ── This game's own chiptune: cool center-court synth ──
  var SONGS = [
    { root: 123.47, bass: [0,-1,-1,0, 7,-1,-1,7, 5,-1,-1,5, 3,-1,7,-1], lead: [12,-1,15,-1, 19,-1,15,-1, 17,-1,12,-1, 15,-1,10,-1] },
    { root: 130.81, bass: [0,-1,5,-1, 7,-1,5,-1, 0,-1,5,-1, 10,-1,7,5], lead: [15,-1,12,15, -1,19,-1,15, 17,15,12,-1, 19,17,15,-1] },
  ];
  var MENU_SONG = { root: 123.47, bass: [0,0,-1,7, 0,0,-1,5, 0,0,-1,7, 8,-1,7,5], lead: [12,-1,15,19, -1,17,15,-1, 12,-1,15,19, 22,-1,19,17] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 12 : Math.max(9, 15 - tier);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(tier + 1 - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.045);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.026);
    if (musicStep % 4 === 0) playSfx(65, 0.08, 'sawtooth', 0.04);
    if (musicStep % 8 === 4) playSfx(210, 0.04, 'sawtooth', 0.026);
  }
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }

  var PINK = '#FF1493', CYAN = '#00FFFF', YELLOW = '#FFD700', LIME = '#7FFF00', ORANGE = '#FF8C00', PURPLE = '#B026FF';
  var WIN_AT = 5, WIN_CAP = 7, PW = 8, PH = 56;

  // The shop ladder: beat one to face the next. Each artist plays their own
  // way (ai), hits with their own machine (look), talks their own trash, and
  // brings their own table (see TABLES).
  var OPPONENTS = [
    { name: 'SCRATCHER',   v: 2.4, wob: 14, ai: 'lag',     color: LIME,   coils: 2, taunt: 'first week on the machine' },
    { name: 'APPRENTICE',  v: 3.3, wob: 10, ai: 'rush',    color: YELLOW, coils: 2, taunt: 'watched every tutorial twice' },
    { name: 'RESIDENT',    v: 4.2, wob: 4,  ai: 'lurk',    color: PURPLE, coils: 3, taunt: 'books are full for a year' },
    { name: 'SHOP BOSS',   v: 4.4, wob: 9,  ai: 'wobble',  color: ORANGE, coils: 3, taunt: 'signs the checks' },
    { name: 'THE MACHINE', v: 5.4, wob: 0,  ai: 'predict', color: CYAN,   coils: 3, taunt: 'does not blink' },
  ];
  // Every opponent's table plays differently.
  var TABLES = [
    { name: 'THE STENCIL TABLE', tip: 'a clean sheet. rally, smash, learn the specials' },
    { name: 'THE CAP',           tip: 'an ink cap in the middle throws the ball', bumpers: [{ x: W / 2, y: H / 2 + 8, r: 15 }] },
    { name: 'THE SPILL',         tip: 'ink puddles bend whatever rolls through', puddles: [{ x: W / 2 - 70, y: 100, r: 30, spin: 1 }, { x: W / 2 + 60, y: 230, r: 34, spin: -1 }, { x: W / 2 + 10, y: 165, r: 22, spin: 1 }] },
    { name: 'LIGHTS OUT',        tip: 'the lamp only reaches the paddles. watch the trail', dark: true },
    { name: 'THE MACHINE ROOM',  tip: 'two caps on rails, three phases, no mercy', bumpers: [{ x: W / 2 - 62, y: H / 2, r: 12, move: 1 }, { x: W / 2 + 62, y: H / 2, r: 12, move: -1 }], boss: true },
  ];
  var TRASH = {
    lag: ['oops', 'lucky', 'is it on?', 'wait wait'],
    rush: ['too easy', 'saw that coming', 'next', 'faster'],
    lurk: ['patience', 'read it', 'thanks', 'predictable'],
    wobble: ['pay up', 'my table', 'again', 'rent is due'],
    predict: ['calculated', 'inevitable', 'zero error', 'recomputing'],
  };
  var PICKUPS = [
    { type: 'multi',  label: 'MULTI-BALL', color: PINK,   pts: 150 },
    { type: 'big',    label: 'BIG BAR',    color: LIME,   pts: 150 },
    { type: 'small',  label: 'THEIR BAR SHRINKS', color: PURPLE, pts: 150 },
    { type: 'curve',  label: 'CURVE x3',   color: CYAN,   pts: 150 },
    { type: 'freeze', label: 'FREEZE',     color: '#9ef', pts: 150 },
    { type: 'steal',  label: 'STOLE A POINT', color: YELLOW, pts: 300 },
  ];

  // ── Points: what the wall keeps ──
  var PT_WIN = 200;      // x (tier + 1) x streak for every point you take
  var PT_RALLY = 25;     // x rally length, for points won off a real exchange
  var PT_ACE = 150;      // they never touched it
  var PT_SMASH = 100;    // won it at smash speed
  var PT_TAPOUT = 1000;  // x (tier + 1) for beating an opponent
  var PT_SHUTOUT = 1500; // 5 to 0
  var PT_COMEBACK = 800; // won after being two down
  var PT_CHAMP = 5000;   // cleared the whole shop
  var PT_PERFECT = 40;   // x rally, hit dead center
  var PT_CHARGED = 250;  // charged smash
  var PT_DROP = 120;     // drop shot
  var PT_LOB = 80;       // lob
  var PT_VARIETY = 600;  // all three specials in one match
  var PT_BONUS_RETURN = 50; // x combo, per ball returned in the drill
  var PT_BONUS_CLEAN = 1000; // all twenty back
  var PT_DEUCE = 400;    // won a match that went to deuce

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var frame, you, cpu, balls, serveT, rally, won, tier, bannerT, bannerText, bannerSub, scoreFlash, stains;
  var pts, dispPts, beaten, longestRally, maxDown, heat, overheat, smashArmed, shake, particles, popups, lastSmash;
  var youPrevY, youVel, cpuPrevY, cpuVel, hitFlash, tauntT, quipT, quipText;
  var keyU = false, keyD = false, spaceHeld = false;
  var charge, downTap, upTap, touchArm, streak, specials, specialsUsed, pickup, pickupCd, fx, curveLeft;
  var stage, bonus, phase, replayT, deuceMatch, crowd, cheerT, groanT, fxLog, tableIntroT;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-pong-pts') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (pts > best) { best = pts; try { localStorage.setItem('lumenati-arcade-pong-pts', String(best)); } catch(e) {} }
  }
  function withNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function yourH() { return PH + (fx.big > 0 ? 24 : 0); }
  function cpuH() { return PH + (fx.small > 0 ? -20 : 0) + (phase >= 3 ? 16 : 0); }
  function table() { return TABLES[tier]; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    frame = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0; rally = 0; won = false;
    tier = 0; bannerT = 0; bannerText = ''; bannerSub = '';
    you = { y: H / 2 - PH / 2, score: 0 };
    cpu = { y: H / 2 - PH / 2, score: 0, aim: H / 2 - PH / 2, vy: 0 };
    balls = []; scoreFlash = 0; stains = [];
    pts = 0; dispPts = 0; beaten = 0; longestRally = 0; maxDown = 0; heat = 0; overheat = 0; smashArmed = 0;
    shake = 0; particles = []; popups = []; lastSmash = false;
    youPrevY = you.y; youVel = 0; cpuPrevY = cpu.y; cpuVel = 0; hitFlash = 0; tauntT = 150; quipT = 0; quipText = '';
    charge = 0; downTap = 0; upTap = 0; touchArm = 0; streak = 0; specials = 0; specialsUsed = {};
    pickup = null; pickupCd = 240; fx = { big: 0, small: 0, freeze: 0 }; curveLeft = 0;
    stage = 'match'; bonus = null; phase = 1; replayT = 0; deuceMatch = false; cheerT = 0; groanT = 0; fxLog = []; tableIntroT = 150;
    crowd = [];
    for (var i = 0; i < 12; i++) crowd.push({ x: 42 + i * 29 + (i % 2) * 6, hair: ['#222', '#8b4513', '#FF1493', '#ffd700', '#3a3a3a', '#7FFF00'][i % 6], skin: ['#f1c27d', '#c68642', '#8d5524', '#ffdbac'][i % 4], hat: i % 5 === 0, seed: Math.random() * 6 });
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '0';
    serve(Math.random() < 0.5 ? 1 : -1);
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Drag your paddle // tap the far side to charge a smash' : 'W/S or mouse // hold SPACE to charge a smash // tap DOWN drop, UP lob';
    var statA = document.getElementById('jd-stat-a');
    if (statA) statA.textContent = 'You';
    var statB = document.getElementById('jd-stat-b');
    if (statB) statB.textContent = 'CPU';
    window.skateRunning = true;
    startLoop();
  }

  function newBall(x, y, vx, vy) {
    return { x: x, y: y, vx: vx, vy: vy, r: 5, trail: [], drop: 0, lob: false, curve: 0, rallyHit: 0 };
  }
  function serve(towards) {
    var a = (Math.random() * 0.6 - 0.3);
    var sp = 4 + tier * 0.15;
    balls = [newBall(W / 2, H / 2, towards * Math.cos(a) * sp, Math.sin(a) * sp)];
    serveT = 50;
    rally = 0;
    smashArmed = 0;
    lastSmash = false;
    charge = 0;
  }

  function addStain(x, y, r) {
    stains.push({ x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, r: r + Math.random() * 3, a: 0.16 + Math.random() * 0.08, c: PINK });
    for (var i = 0; i < 2; i++) {
      stains.push({ x: x + (Math.random() - 0.5) * r * 3, y: y + (Math.random() - 0.5) * r * 3, r: 1 + Math.random() * 2, a: 0.14, c: PINK });
    }
    while (stains.length > 110) stains.shift();
  }
  function burst(x, y, color, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = (0.5 + Math.random()) * speed;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 18 + Math.random() * 18, color: color, size: 1 + Math.random() * 2 });
    }
    while (particles.length > 180) particles.shift();
  }
  function popup(x, y, text, color, big) {
    popups.push({ x: x, y: y, text: text, color: color || '#fff', life: big ? 70 : 50, big: !!big });
    while (popups.length > 12) popups.shift();
  }
  function award(n, x, y, label, color, big) {
    pts += n;
    popup(x, y, label + ' +' + withNum(n), color, big);
  }
  function quip() { var lines = TRASH[OPPONENTS[tier].ai]; quipT = 90; quipText = lines[Math.floor(Math.random() * lines.length)]; }
  function useSpecial(name) {
    if (!specialsUsed[name]) { specialsUsed[name] = true; specials++; }
    if (specials === 3 && !specialsUsed.variety) {
      specialsUsed.variety = true;
      award(PT_VARIETY, W / 2, H / 2 - 60, 'VARIETY', CYAN, true);
    }
  }

  // ── Match points: deuce at 4 all, win by two, first to 7 takes it anyway ──
  function matchOver(a, b) { return (a >= WIN_AT && a - b >= 2) || a >= WIN_CAP; }
  function matchPointFor(a, b) { return !matchOver(a, b) && ((a >= WIN_AT - 1 && a - b >= 1) || a >= WIN_CAP - 1); }

  function point(scorer, ball) {
    var sp = ball ? Math.hypot(ball.vx, ball.vy) : 0;
    if (rally > longestRally) longestRally = rally;
    if (rally >= 8) sayCallout('pong-c1');
    scoreFlash = 14;
    var by = ball ? ball.y : H / 2;
    var edgeX = scorer === you ? W - 6 : 6;
    addStain(edgeX, by, 9);
    addStain(scorer === you ? W - 12 : 12, by + 6, 5);
    burst(edgeX, by, scorer === you ? PINK : OPPONENTS[tier].color, 22, 3.2);
    scorer.score++;
    document.getElementById('jd-br-score').textContent = you.score;
    document.getElementById('jd-br-lives').textContent = cpu.score;
    heat = 0; overheat = 0; pickup = null; curveLeft = 0;
    if (you.score >= 4 && cpu.score >= 4) deuceMatch = true;
    if (scorer === you) {
      sfxScore();
      shake = 8;
      streak++;
      cheerT = 40;
      var mult = Math.min(4, streak);
      var px = W - 70, py = by < 60 ? 90 : Math.min(H - 40, by);
      award(PT_WIN * (tier + 1) * mult, px, py, mult > 1 ? 'POINT x' + mult : 'POINT', mult > 1 ? YELLOW : '#fff');
      if (rally >= 4) award(PT_RALLY * rally, px, py + 14, 'RALLY x' + rally, YELLOW);
      if (rally <= 1) award(PT_ACE, px, py + (rally >= 4 ? 28 : 14), 'ACE', LIME);
      else if (sp >= 8.4 || lastSmash) award(PT_SMASH, px, py + (rally >= 4 ? 28 : 14), 'SMASH', ORANGE);
    } else {
      sfxLose();
      shake = 4;
      streak = 0;
      groanT = 40;
      var down = cpu.score - you.score;
      if (down > maxDown) maxDown = down;
      if (Math.random() < 0.6 && !matchOver(cpu.score, you.score)) quip();
    }
    if (matchOver(you.score, cpu.score)) {
      beaten = tier + 1;
      var bx = W / 2, byy = H / 2 + 24;
      award(PT_TAPOUT * (tier + 1), bx, byy, 'TAPPED OUT', LIME, true);
      if (cpu.score === 0) award(PT_SHUTOUT, bx, byy + 18, 'SHUTOUT', YELLOW, true);
      else if (maxDown >= 2) award(PT_COMEBACK, bx, byy + 18, 'COMEBACK', ORANGE, true);
      if (deuceMatch) award(PT_DEUCE, bx, byy + 36, 'DEUCE SURVIVED', CYAN, true);
      maxDown = 0;
      replayT = 60;
      if (tier >= OPPONENTS.length - 1) {
        won = true;
        award(PT_CHAMP, bx, byy + 54, 'SHOP CHAMPION', PINK, true);
        say('pong-c3', 400);
        enterBoard(pts);
        saveBest();
        sfxWin();
        return;
      }
      sayCallout('pong-c2');
      sfxWin();
      shake = 12;
      startBonus();
      return;
    }
    if (matchOver(cpu.score, you.score)) {
      won = false;
      enterBoard(pts);
      saveBest();
      deathJingle();
      return;
    }
    if (you.score >= 4 && cpu.score >= 4 && you.score === cpu.score) { bannerT = 60; bannerText = 'DEUCE'; bannerSub = 'win by two'; }
    serve(scorer === you ? -1 : 1);
  }

  // ── The drill: twenty balls from the machine between opponents ──
  function startBonus() {
    stage = 'bonus';
    bonus = { fired: 0, returned: 0, missed: 0, combo: 0, timer: 55 * 60, next: 70, total: 20, done: false, endT: 0 };
    balls = [];
    bannerT = 130;
    bannerText = OPPONENTS[tier].name + ' TAPPED OUT';
    bannerSub = 'BONUS: THE BALL MACHINE. return twenty';
    you.score = 0; cpu.score = 0; deuceMatch = false; specials = 0; specialsUsed = {}; pickup = null; fx = { big: 0, small: 0, freeze: 0 }; curveLeft = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '0';
  }
  function fireBonusBall() {
    var n = bonus.fired;
    var y = 40 + Math.random() * (H - 80);
    var a = (Math.random() - 0.5) * 1.1;
    var sp = 5 + n * 0.16;
    var b = newBall(W - 30, y, -Math.cos(a) * sp, Math.sin(a) * sp);
    balls = [b];
    bonus.fired++;
    bonus.next = 0;
    burst(W - 30, y, CYAN, 8, 2);
    playSfx(300, 0.05, 'square', 0.08);
  }
  function endBonus() {
    bonus.done = true;
    bonus.endT = 150;
    balls = [];
    var bx = W / 2, by = H / 2 + 20;
    if (bonus.returned >= bonus.total) award(PT_BONUS_CLEAN, bx, by, 'CLEAN SHEET', YELLOW, true);
    else popup(bx, by, bonus.returned + ' OF ' + bonus.total + ' BACK', '#fff', true);
    sfxWin();
  }
  function nextOpponent() {
    stage = 'match';
    tier++;
    phase = 1;
    bannerT = 150;
    bannerText = 'NEXT UP: ' + OPPONENTS[tier].name;
    bannerSub = table().name + ' // ' + table().tip;
    tableIntroT = 200;
    tauntT = 220;
    cpu.y = H / 2 - PH / 2; cpu.aim = cpu.y; cpu.vy = 0;
    stains = [];
    streak = 0;
    serve(1);
  }

  // Predict where a ball crosses x, bouncing off the rails on the way.
  function predictY(ball, x) {
    var bx = ball.x, by = ball.y, vx = ball.vx, vy = ball.vy;
    if (vx <= 0) return by;
    var top = ball.r + 16, bot = H - ball.r - 2;
    var steps = 0;
    while (bx < x && steps++ < 400) {
      bx += vx; by += vy;
      if (by < top) { by = top + (top - by); vy = -vy; }
      if (by > bot) { by = bot - (by - bot); vy = -vy; }
    }
    return by;
  }
  // With more than one ball on the table the opponent tracks the one coming soonest.
  function cpuBall() {
    var bestB = null, bestD = 1e9;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var d = b.vx > 0 ? (W - b.x) / Math.max(0.1, b.vx) : 1e6 + (W - b.x);
      if (d < bestD) { bestD = d; bestB = b; }
    }
    return bestB || balls[0];
  }

  function cpuThink() {
    if (stage !== 'match') return;
    if (fx.freeze > 0) return;
    var opp = OPPONENTS[tier];
    var ball = cpuBall();
    if (!ball) return;
    var toward = ball.vx > 0;
    var ch = cpuH();
    var center = H / 2 - ch / 2;
    var maxV = opp.v + Math.min(1.4, rally * 0.09);
    var dark = table().dark;
    var target;
    if (opp.ai === 'lag') {
      var want = toward ? ball.y - ch / 2 : center;
      cpu.aim += (want - cpu.aim) * 0.07;
      target = cpu.aim + Math.sin(frame * 0.05) * opp.wob;
    } else if (opp.ai === 'rush') {
      var lead = ball.y + ball.vy * (toward ? 7 : 2) - ch / 2;
      var dir = lead > cpu.y + 2 ? 1 : lead < cpu.y - 2 ? -1 : 0;
      cpu.vy += dir * 0.75;
      cpu.vy *= 0.9;
      cpu.vy = Math.max(-maxV * 1.25, Math.min(maxV * 1.25, cpu.vy));
      cpu.y += cpu.vy;
      cpu.y = Math.max(18, Math.min(H - ch - 4, cpu.y));
      return;
    } else if (opp.ai === 'lurk') {
      var live = toward && ball.x > W / 2 - 30;
      target = live ? ball.y - ch / 2 : center + Math.sin(frame * 0.02) * opp.wob;
      if (live) maxV += 1.6;
    } else if (opp.ai === 'wobble') {
      // In the dark it only sees the ball once it is lit, so it commits late.
      var sees = !dark || ball.x > W - 140;
      target = toward && sees ? ball.y - ch / 2 + Math.sin(frame * 0.13) * opp.wob : center;
    } else {
      if (overheat > 0) { maxV *= 0.3; }
      maxV += (phase - 1) * 0.4;
      target = toward ? predictY(ball, W - 16 - PW - ball.r) - ch / 2 : center + Math.sin(frame * 0.03) * 12;
      if (toward && overheat === 0) target += (ball.y > H / 2 ? -1 : 1) * 14;
    }
    var dv = target - cpu.y;
    cpu.y += Math.max(-maxV, Math.min(maxV, dv));
    cpu.y = Math.max(18, Math.min(H - ch - 4, cpu.y));
  }

  function spawnPickup() {
    var p = PICKUPS[Math.floor(Math.random() * PICKUPS.length)];
    if (p.type === 'steal' && cpu.score === 0) p = PICKUPS[0];
    if (p.type === 'multi' && balls.length > 1) p = PICKUPS[3];
    pickup = { type: p.type, label: p.label, color: p.color, pts: p.pts, x: W / 2 + (Math.random() - 0.5) * 120, y: 60 + Math.random() * (H - 120), life: 60 * 9, bob: Math.random() * 6 };
  }
  function takePickup(ball) {
    var p = pickup; pickup = null;
    burst(p.x, p.y, p.color, 18, 3);
    playSfx(900, 0.08, 'square', 0.12); setTimeout(function () { playSfx(1300, 0.12, 'square', 0.12); }, 70);
    award(p.pts, p.x, p.y - 14, p.label, p.color, true);
    fxLog.push({ t: p.label, c: p.color, life: 120 });
    if (p.type === 'multi') {
      var b2 = newBall(ball.x, ball.y, ball.vx, -ball.vy - (Math.random() - 0.5));
      if (Math.abs(b2.vy) < 1.5) b2.vy = 1.5 * (b2.vy < 0 ? -1 : 1);
      balls.push(b2);
    } else if (p.type === 'big') fx.big = 60 * 8;
    else if (p.type === 'small') fx.small = 60 * 8;
    else if (p.type === 'curve') curveLeft = 3;
    else if (p.type === 'freeze') { fx.freeze = 60; popup(W - 60, cpu.y - 10, 'FROZEN', '#9ef'); }
    else if (p.type === 'steal') {
      if (cpu.score > 0) { cpu.score--; document.getElementById('jd-br-lives').textContent = cpu.score; groanT = 40; quip(); }
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;

    // You
    var yh = yourH();
    if (keyU) you.y -= 5;
    if (keyD) you.y += 5;
    you.y = Math.max(18, Math.min(H - yh - 4, you.y));
    youVel = you.y - youPrevY; youPrevY = you.y;
    if (spaceHeld) charge = Math.min(30, charge + 1); else charge = Math.max(0, charge - 3);
    if (touchArm > 0) { touchArm--; charge = 30; }
    if (downTap > 0) downTap--;
    if (upTap > 0) upTap--;

    cpuThink();
    cpuVel = cpu.y - cpuPrevY; cpuPrevY = cpu.y;

    if (bannerT > 0) bannerT--;
    if (tauntT > 0) tauntT--;
    if (quipT > 0) quipT--;
    if (scoreFlash > 0) scoreFlash--;
    if (hitFlash > 0) hitFlash--;
    if (shake > 0) shake--;
    if (overheat > 0) overheat--;
    if (replayT > 0) replayT--;
    if (cheerT > 0) cheerT--;
    if (groanT > 0) groanT--;
    if (tableIntroT > 0) tableIntroT--;
    if (fx.big > 0) fx.big--;
    if (fx.small > 0) fx.small--;
    if (fx.freeze > 0) fx.freeze--;
    for (var f = fxLog.length - 1; f >= 0; f--) { if (--fxLog[f].life <= 0) fxLog.splice(f, 1); }
    if (dispPts < pts) dispPts += Math.max(1, Math.ceil((pts - dispPts) * 0.12));
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.97; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var j = popups.length - 1; j >= 0; j--) {
      popups[j].y -= popups[j].big ? 0.25 : 0.55; popups[j].life--;
      if (popups[j].life <= 0) popups.splice(j, 1);
    }
    // The Machine's phases: on for the second point, all in at match point.
    if (table().boss) {
      var ph = 1 + (you.score >= 2 || cpu.score >= 2 ? 1 : 0) + (you.score >= 4 || cpu.score >= 4 ? 1 : 0);
      if (ph !== phase) { phase = ph; bannerT = 70; bannerText = 'PHASE ' + ph; bannerSub = ph === 2 ? 'the caps are moving' : 'overdrive'; shake = 6; playSfx(180, 0.2, 'sawtooth', 0.12); }
    }

    if (stage === 'bonus') { updateBonus(); return; }
    if (replayT > 0) return;
    if (serveT > 0) { serveT--; return; }

    // Pickups float in after a real rally starts
    if (pickup) {
      pickup.life--; pickup.bob += 0.08;
      if (pickup.life <= 0) pickup = null;
    } else if (rally >= 3) {
      if (pickupCd > 0) pickupCd--;
      else if (Math.random() < 0.02) { spawnPickup(); pickupCd = 240 + Math.random() * 240; }
    }

    var tb = table();
    for (var bi = balls.length - 1; bi >= 0; bi--) {
      var ball = balls[bi];
      if (ball.drop > 0) { ball.drop--; var dsp = Math.hypot(ball.vx, ball.vy); if (dsp > 2.4) { ball.vx *= 0.985; ball.vy *= 0.985; } }
      if (ball.curve) { ball.vy += ball.curve; ball.curve *= 0.985; }
      ball.x += ball.vx;
      ball.y += ball.vy;
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();

      // Walls
      if (ball.y < ball.r + 16) { ball.y = ball.r + 16; ball.vy = Math.abs(ball.vy); addStain(ball.x, 18, 3); burst(ball.x, 18, '#fff', 4, 1.2); sfxWall(); ball.lob = false; }
      if (ball.y > H - ball.r - 2) { ball.y = H - ball.r - 2; ball.vy = -Math.abs(ball.vy); addStain(ball.x, H - 4, 3); burst(ball.x, H - 4, '#fff', 4, 1.2); sfxWall(); ball.lob = false; }

      // Table features
      if (tb.bumpers) {
        for (var k = 0; k < tb.bumpers.length; k++) {
          var bp = tb.bumpers[k];
          var byp = bumperY(bp);
          var dx = ball.x - bp.x, dy = ball.y - byp, dist = Math.hypot(dx, dy);
          if (dist < bp.r + ball.r && dist > 0.01) {
            var nx = dx / dist, ny = dy / dist;
            var dot = ball.vx * nx + ball.vy * ny;
            if (dot < 0) {
              ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny;
              var spd = Math.hypot(ball.vx, ball.vy) * 1.04;
              var ang = Math.atan2(ball.vy, ball.vx);
              ball.vx = Math.cos(ang) * spd; ball.vy = Math.sin(ang) * spd;
              ball.x = bp.x + nx * (bp.r + ball.r + 0.5); ball.y = byp + ny * (bp.r + ball.r + 0.5);
              burst(ball.x, ball.y, '#fff', 8, 2); addStain(bp.x, byp, 5);
              playSfx(520, 0.05, 'square', 0.1);
              bp.hit = 10;
            }
          }
        }
      }
      if (tb.puddles) {
        for (var q = 0; q < tb.puddles.length; q++) {
          var pd = tb.puddles[q];
          if (Math.hypot(ball.x - pd.x, ball.y - pd.y) < pd.r) {
            ball.vy += pd.spin * 0.22;
            if (frame % 4 === 0) particles.push({ x: ball.x, y: ball.y, vx: (Math.random() - 0.5), vy: -0.5, life: 12, color: PINK, size: 2 });
          }
        }
      }
      if (pickup && Math.hypot(ball.x - pickup.x, ball.y - pickup.y) < 12 + ball.r) takePickup(ball);

      // Your paddle (left)
      var yx = 16;
      if (ball.vx < 0 && ball.x - ball.r < yx + PW && ball.x - ball.r > yx - 6 &&
          ball.y > you.y - ball.r && ball.y < you.y + yh + ball.r) {
        bounce(ball, you.y, yh, youVel, true);
        ball.x = yx + PW + ball.r;
        ball.vx = Math.abs(ball.vx);
      }
      // CPU paddle (right)
      var cx = W - 16 - PW, ch = cpuH();
      if (ball.vx > 0 && ball.x + ball.r > cx && ball.x + ball.r < cx + PW + 6 &&
          ball.y > cpu.y - ball.r && ball.y < cpu.y + ch + ball.r) {
        bounce(ball, cpu.y, ch, OPPONENTS[tier].ai === 'wobble' ? cpuVel * 1.4 : cpuVel * 0.6, false);
        ball.x = cx - ball.r;
        ball.vx = -Math.abs(ball.vx);
        if (OPPONENTS[tier].ai === 'predict') {
          heat++;
          var limit = phase >= 3 ? 4 : 6;
          if (heat >= limit) { overheat = 55; heat = 0; popup(cx - 30, cpu.y - 8, 'OVERHEAT', '#ff6347'); }
        }
      }

      // Out: the first ball off the table ends the point
      if (ball.x < -10) { point(cpu, ball); return; }
      if (ball.x > W + 10) { point(you, ball); return; }
    }
  }
  function bumperY(bp) {
    if (!bp.move) return bp.y;
    var amp = phase >= 2 ? 70 : 0;
    return bp.y + Math.sin(frame * 0.035 * bp.move + (bp.move > 0 ? 0 : 1.5)) * amp;
  }

  function bounce(ball, py, ph, pvel, mine) {
    addStain(ball.x, ball.y, 4);
    var rel = (ball.y - (py + ph / 2)) / (ph / 2);
    rel = Math.max(-1, Math.min(1, rel));
    var cap = 8.2 + tier * 0.45 + (phase >= 3 ? 0.6 : 0);
    var sp = Math.min(cap, Math.hypot(ball.vx, ball.vy) * 1.06 + 0.1);
    var kind = '';
    if (mine) {
      if (downTap > 0) kind = 'drop';
      else if (upTap > 0) kind = 'lob';
      else if (charge >= 15) kind = 'charged';
      else if (Math.abs(rel) > 0.72 && Math.abs(pvel) >= 3 && (pvel > 0) === (rel > 0)) kind = 'edge';
      else if (Math.abs(rel) < 0.15) kind = 'perfect';
    }
    lastSmash = false;
    ball.drop = 0; ball.lob = false;
    var ang = rel * (Math.PI / 3.4);
    var dirx = ball.vx > 0 ? 1 : -1;
    if (kind === 'charged') {
      sp = Math.min(cap * 1.5 + 2, Math.max(sp * 1.6, cap + 3));
      lastSmash = true; smashArmed = 24; shake = 10; scoreFlash = 10; charge = 0; touchArm = 0;
      award(PT_CHARGED, ball.x + 34, ball.y - 14, 'CHARGED SMASH', ORANGE, true);
      useSpecial('smash');
      playSfx(1400, 0.1, 'square', 0.14); playSfx(90, 0.2, 'sawtooth', 0.12);
      burst(ball.x, ball.y, '#fff', 20, 3.5);
    } else if (kind === 'edge') {
      sp = Math.min(cap + 2.2, sp * 1.3); lastSmash = true; smashArmed = 20; shake = 5;
      popup(ball.x + 30, ball.y - 12, 'SMASH', ORANGE); playSfx(1100, 0.08, 'square', 0.12);
      useSpecial('smash');
    } else if (kind === 'drop') {
      sp = Math.max(2.8, sp * 0.55); ball.drop = 70; downTap = 0;
      award(PT_DROP, ball.x + 30, ball.y - 12, 'DROP SHOT', CYAN);
      useSpecial('drop');
      playSfx(500, 0.12, 'triangle', 0.12);
    } else if (kind === 'lob') {
      sp = Math.max(3.2, sp * 0.75); ball.lob = true; upTap = 0;
      ang = (ball.y > H / 2 ? -1 : 1) * (Math.PI / 2.35);
      award(PT_LOB, ball.x + 30, ball.y - 12, 'LOB', LIME);
      useSpecial('lob');
      playSfx(760, 0.1, 'triangle', 0.1);
    } else if (kind === 'perfect') {
      award(PT_PERFECT * Math.max(1, rally), ball.x + 30, ball.y - 12, 'PERFECT', '#fff');
      playSfx(980, 0.06, 'square', 0.1);
    }
    ball.vx = Math.cos(ang) * sp * dirx;
    ball.vy = Math.sin(ang) * sp;
    if (kind !== 'lob') {
      ball.vy += pvel * 0.35;
      var maxVy = sp * 0.88;
      ball.vy = Math.max(-maxVy, Math.min(maxVy, ball.vy));
      ball.vx = Math.sqrt(Math.max(1, sp * sp - ball.vy * ball.vy)) * dirx;
    }
    if (mine && curveLeft > 0 && kind !== 'lob') { curveLeft--; ball.curve = (ball.vy > 0 ? -1 : 1) * 0.16; popup(ball.x + 22, ball.y + 12, 'CURVE', CYAN); }
    rally++;
    hitFlash = 6;
    burst(ball.x, ball.y, mine ? PINK : OPPONENTS[tier].color, 8, 2.2);
    if (mine) {
      var g = 10 + rally * 5;
      pts += g;
      if (rally >= 3 && !kind) popup(ball.x + 22, ball.y - 10, '+' + g, rally >= 8 ? YELLOW : 'rgba(255,255,255,0.8)');
    }
    sfxPaddle();
  }

  function updateBonus() {
    var b = bonus;
    if (b.done) { if (--b.endT <= 0) nextOpponent(); return; }
    if (bannerT > 90) return; // let the card land first
    b.timer--;
    var yh = yourH();
    if (!balls.length) {
      if (b.fired >= b.total || b.timer <= 0) { endBonus(); return; }
      if (--b.next <= 0) fireBonusBall();
      return;
    }
    var ball = balls[0];
    ball.x += ball.vx; ball.y += ball.vy;
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 10) ball.trail.shift();
    if (ball.y < ball.r + 16) { ball.y = ball.r + 16; ball.vy = Math.abs(ball.vy); sfxWall(); }
    if (ball.y > H - ball.r - 2) { ball.y = H - ball.r - 2; ball.vy = -Math.abs(ball.vy); sfxWall(); }
    var yx = 16;
    if (ball.vx < 0 && ball.x - ball.r < yx + PW && ball.x - ball.r > yx - 6 && ball.y > you.y - ball.r && ball.y < you.y + yh + ball.r) {
      ball.x = yx + PW + ball.r;
      var rel = Math.max(-1, Math.min(1, (ball.y - (you.y + yh / 2)) / (yh / 2)));
      var sp = Math.hypot(ball.vx, ball.vy) * 1.15;
      ball.vx = Math.cos(rel * 1.0) * sp; ball.vy = Math.sin(rel * 1.0) * sp;
      b.returned++; b.combo++;
      award(PT_BONUS_RETURN * b.combo, ball.x + 34, ball.y - 12, b.combo > 1 ? 'BACK x' + b.combo : 'BACK', b.combo >= 5 ? YELLOW : '#fff');
      burst(ball.x, ball.y, PINK, 8, 2.2); sfxPaddle(); hitFlash = 6;
    }
    if (ball.x > W + 10 || ball.x < -10) {
      if (ball.x < -10) { b.missed++; b.combo = 0; popup(60, ball.y, 'MISS', '#ff6347'); sfxLose(); groanT = 20; }
      balls = [];
      b.next = 26;
    }
    if (b.timer <= 0) endBonus();
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) upTap = 10; keyU = true; start(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); if (!e.repeat) downTap = 10; keyD = true; start(); }
    if (e.code === 'Space') { e.preventDefault(); spaceHeld = true; if (!e.repeat) start(); }
  });
  document.addEventListener('keyup', function(e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keyU = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keyD = false;
    if (e.code === 'Space') spaceHeld = false;
  });
  function canvasXY(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) * (W / r.width), y: (clientY - r.top) * (H / r.height) };
  }
  canvas.addEventListener('mousemove', function(e) {
    you.y = Math.max(18, Math.min(H - yourH() - 4, canvasXY(e.clientX, e.clientY).y - yourH() / 2));
  });
  canvas.addEventListener('click', function() { start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    var t = e.touches[0], p = canvasXY(t.clientX, t.clientY);
    if (p.x > W * 0.6) touchArm = 40; // tap the far side to charge a smash
    you.y = Math.max(18, Math.min(H - yourH() - 4, p.y - yourH() / 2));
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var t = e.touches[0], p = canvasXY(t.clientX, t.clientY);
    you.y = Math.max(18, Math.min(H - yourH() - 4, p.y - yourH() / 2));
  }, { passive: false });

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'pong', canvas: canvas, ctx: ctx, W: W, H: H, label: 'Needle Pong',
    title: function () { return won ? 'SHOP CHAMPION' : OPPONENTS[tier].name + ' WINS'; }, again: 'SPACE or TAP to start over',
    fmt: function (v) { return withNum(v); },
    scoreLabel: 'POINTS',
    levelLabel: function () { return 'BEAT ' + beaten + ' OF ' + OPPONENTS.length + ' // LONGEST RALLY ' + longestRally; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: tier + 1, meta: { beaten: beaten, longestRally: longestRally, specials: specials } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }

  // ── Attract-mode intro: CRT power-on, studio card, then the title scene ──
  function drawIntro() {
    var t = introT;
    // After the title scene the cabinet shows the shop wall for a few seconds.
    if (t >= 286) { wall.drawAttract(); return; }
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
    ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, W, H);
    for (var yy2 = 20; yy2 < H; yy2 += 16) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(W / 2 - 1, yy2, 2, 8); }
    // rally hits, each faster, each leaving a stain
    var hits = [16, 52, 82, 104, 118];
    var seg = 0;
    while (seg < hits.length - 1 && t2 > hits[seg + 1]) seg++;
    var splatT = 126;
    for (var i = 1; i <= seg && t2 <= splatT + 24; i++) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = PINK;
      var stx = i % 2 === 1 ? 26 : W - 26;
      ctx.beginPath(); ctx.arc(stx, 150 + i * 22, 6 + i * 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    var byy = 200 + Math.sin(t2 * 0.07) * 34;
    if (t2 <= splatT) {
      var t0 = hits[Math.min(seg, hits.length - 1)], t1 = hits[Math.min(seg + 1, hits.length - 1)];
      var pp = t1 > t0 ? Math.max(0, Math.min(1, (t2 - t0) / (t1 - t0))) : 1;
      var bxx = seg % 2 === 0 ? 34 + pp * (W - 68) : W - 34 - pp * (W - 68);
      if (t2 > hits[hits.length - 1]) bxx = W / 2 + (t2 - hits[hits.length - 1]) * 2;
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(bxx, byy, 6, 0, Math.PI * 2); ctx.fill();
    }
    // machines track the volley
    ctx.fillStyle = PINK; ctx.fillRect(16, byy - 26, 8, 52);
    ctx.fillStyle = '#2e2e38'; ctx.fillRect(5, byy - 12, 10, 24);
    ctx.fillStyle = '#b87333';
    ctx.beginPath(); ctx.arc(10, byy - 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, byy + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CYAN; ctx.fillRect(W - 24, byy - 26, 8, 52);
    ctx.fillStyle = '#2e2e38'; ctx.fillRect(W - 15, byy - 12, 10, 24);
    ctx.fillStyle = '#b87333';
    ctx.beginPath(); ctx.arc(W - 10, byy - 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W - 10, byy + 5, 4, 0, Math.PI * 2); ctx.fill();
    // the last return comes straight at the camera
    if (t2 > splatT && t2 < splatT + 16) {
      var gr = (t2 - splatT) / 16;
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(W / 2, 160, 6 + gr * gr * 420, 0, Math.PI * 2); ctx.fill();
    }
    if (t2 >= splatT + 16) {
      var wash = Math.max(0, 1 - (t2 - splatT - 16) / 40);
      ctx.fillStyle = 'rgba(255,20,147,' + (0.15 + wash * 0.85).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NEEDLE PONG', W / 2, 118);
    } else {
      slam('NEEDLE PONG', 110, 28, PINK);
    }
    if (t2 > 165) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('RUN THE SHOP LADDER', W / 2, 146); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('W/S or MOUSE // hold SPACE to charge a smash // tap DOWN drop, UP lob', W / 2, H - 42);
    ctx.fillText('five tables, pickups mid-rally, a ball machine between fights', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('BEST: ' + withNum(best) + ' PTS', W / 2, H - 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
  }

  function drawMachine(px2, py2, color, flip, coils, moving, hot, ph) {
    ph = ph || ph;
    // Paddles are tattoo machines: frame, coils, and the needle bar you rally with.
    var vib = moving ? (Math.random() - 0.5) * 1.6 : 0;
    if (hot) {
      var hg = ctx.createRadialGradient(px2 + PW / 2, py2 + ph / 2, 4, px2 + PW / 2, py2 + ph / 2, 40);
      hg.addColorStop(0, hot === 'red' ? 'rgba(255,99,71,0.45)' : 'rgba(0,255,255,0.28)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(px2 - 40, py2 - 30, PW + 80, ph + 60);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px2 + 2, py2 + 3, PW, ph);
    ctx.fillStyle = color;
    ctx.fillRect(px2, py2, PW, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(flip ? px2 + PW - 2 : px2, py2, 2, ph);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(flip ? px2 : px2 + PW - 2, py2, 2, ph);
    // grip tape bands
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (var b = 8; b < ph - 4; b += 12) ctx.fillRect(px2 + 1, py2 + b, PW - 2, 2);
    var bx3 = px2 + (flip ? PW + 2 : -12);
    ctx.fillStyle = '#2e2e38';
    ctx.fillRect(bx3, py2 + ph / 2 - 12 - (coils - 2) * 5, 10, 24 + (coils - 2) * 10);
    ctx.fillStyle = '#b87333';
    for (var c = 0; c < coils; c++) {
      var cy = py2 + ph / 2 + (c - (coils - 1) / 2) * 10 + vib;
      ctx.beginPath(); ctx.arc(bx3 + 5, cy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0a060';
      ctx.fillRect(bx3 + 3, cy - 1, 2, 1);
      ctx.fillStyle = '#b87333';
    }
    ctx.fillStyle = '#9aa2ae';
    ctx.fillRect(bx3 + (flip ? -4 : 10), py2 + ph / 2 - 1, 4, 2);
  }

  function drawTable() {
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, W, H);
    // Overhead lamp: one warm pool over the table, cones from the rig.
    var lamp = ctx.createRadialGradient(W / 2, H / 2 - 10, 20, W / 2, H / 2 - 10, 260);
    lamp.addColorStop(0, 'rgba(255,235,200,0.09)');
    lamp.addColorStop(0.6, 'rgba(255,235,200,0.03)');
    lamp.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,240,210,0.035)';
    ctx.beginPath(); ctx.moveTo(W / 4 - 4, 16); ctx.lineTo(W / 4 + 4, 16); ctx.lineTo(W / 4 + 60, H); ctx.lineTo(W / 4 - 60, H); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3 * W / 4 - 4, 16); ctx.lineTo(3 * W / 4 + 4, 16); ctx.lineTo(3 * W / 4 + 60, H); ctx.lineTo(3 * W / 4 - 60, H); ctx.fill();
    // Rails
    ctx.fillStyle = '#3a3a52';
    ctx.fillRect(0, 14, W, 2);
    ctx.fillRect(0, H - 2, W, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 30, W, 1);
    ctx.fillRect(0, H - 18, W, 1);
    // Tape corners holding the stencil sheet down
    ctx.fillStyle = 'rgba(235,230,210,0.14)';
    ctx.fillRect(2, 18, 22, 8);
    ctx.fillRect(W - 24, 18, 22, 8);
    ctx.fillRect(2, H - 26, 22, 8);
    ctx.fillRect(W - 24, H - 26, 22, 8);
    // Neon center line: a soft glow under a bright dashed core, breathing.
    var pulse = 0.5 + Math.sin(frame * 0.05) * 0.2;
    ctx.fillStyle = 'rgba(255,20,147,' + (0.08 * pulse).toFixed(3) + ')';
    ctx.fillRect(W / 2 - 4, 16, 8, H - 18);
    for (var y = 20; y < H; y += 16) {
      ctx.fillStyle = 'rgba(255,120,200,' + (0.35 + Math.abs(Math.sin(frame * 0.03 + y * 0.05)) * 0.4 * pulse).toFixed(2) + ')';
      ctx.fillRect(W / 2 - 1, y, 2, 8);
    }
    // The shop's neon behind the scoreboard
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = 'rgba(255,20,147,' + (0.22 + pulse * 0.1).toFixed(2) + ')';
    ctx.fillText('L U M E N A T I', W / 2, 26);
  }

  function drawCrowd() {
    // Shop regulars along the top rail: heads that bob for you and slump for them.
    for (var i = 0; i < crowd.length; i++) {
      var c = crowd[i];
      var bob = Math.sin(frame * 0.06 + c.seed) * 1.2;
      if (cheerT > 0) bob -= Math.abs(Math.sin(frame * 0.5 + c.seed)) * 4;
      if (groanT > 0) bob += 2;
      var x = c.x, y = 8 + bob;
      ctx.fillStyle = c.skin;
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = c.hair;
      if (c.hat) ctx.fillRect(x - 4, y - 5, 8, 2); else ctx.fillRect(x - 3, y - 4, 6, 2);
      if (cheerT > 0 && i % 2 === 0) { ctx.fillStyle = c.skin; ctx.fillRect(x - 5, y - 6 + bob, 2, 4); ctx.fillRect(x + 3, y - 6 + bob, 2, 4); }
    }
  }

  function drawFeatures() {
    var tb = table();
    if (tb.puddles) {
      for (var q = 0; q < tb.puddles.length; q++) {
        var pd = tb.puddles[q];
        ctx.fillStyle = 'rgba(255,20,147,0.13)';
        ctx.beginPath(); ctx.ellipse(pd.x, pd.y, pd.r, pd.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,20,147,0.2)';
        ctx.beginPath(); ctx.ellipse(pd.x - pd.r * 0.2, pd.y - pd.r * 0.15, pd.r * 0.55, pd.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        // the swirl shows which way it bends
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(pd.x, pd.y, pd.r * 0.45, frame * 0.04 * pd.spin, frame * 0.04 * pd.spin + 2.2); ctx.stroke();
      }
    }
    if (tb.bumpers) {
      for (var k = 0; k < tb.bumpers.length; k++) {
        var bp = tb.bumpers[k];
        var by = bumperY(bp);
        if (bp.move) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bp.x - 1, H / 2 - 74, 2, 148); }
        var hit = bp.hit > 0; if (bp.hit > 0) bp.hit--;
        var g = ctx.createRadialGradient(bp.x, by, 2, bp.x, by, bp.r + 10);
        g.addColorStop(0, hit ? 'rgba(255,255,255,0.6)' : 'rgba(255,20,147,0.35)');
        g.addColorStop(1, 'rgba(255,20,147,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bp.x - bp.r - 10, by - bp.r - 10, bp.r * 2 + 20, bp.r * 2 + 20);
        ctx.fillStyle = '#1a1a26';
        ctx.beginPath(); ctx.arc(bp.x, by, bp.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = hit ? '#fff' : PINK;
        ctx.beginPath(); ctx.arc(bp.x, by, bp.r - 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.arc(bp.x - 3, by - 3, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBall(ball, dim) {
    var sp = Math.hypot(ball.vx, ball.vy);
    var hot = Math.max(0, Math.min(1, (sp - 5) / 5));
    var a = dim;
    for (var i = 0; i < ball.trail.length; i++) {
      ctx.globalAlpha = a * (i / ball.trail.length) * (0.25 + hot * 0.3);
      ctx.fillStyle = hot > 0.6 ? '#fff' : ball.drop > 0 ? CYAN : PINK;
      var ts = 2 + (i / ball.trail.length) * 3;
      ctx.fillRect(ball.trail[i].x - ts / 2, ball.trail[i].y - ts / 2, ts, ts);
    }
    ctx.globalAlpha = a;
    var gr = 14 + hot * 12;
    var glow = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, gr);
    glow.addColorStop(0, 'rgba(255,' + Math.round(20 + hot * 180) + ',' + Math.round(147 + hot * 80) + ',0.55)');
    glow.addColorStop(1, 'rgba(255,20,147,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(ball.x - gr, ball.y - gr, gr * 2, gr * 2);
    var nl = 8 + hot * 6;
    var nx = sp > 0 ? ball.vx / sp : 1, ny = sp > 0 ? ball.vy / sp : 0;
    ctx.strokeStyle = 'rgba(220,230,240,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ball.x - nx * nl, ball.y - ny * nl); ctx.lineTo(ball.x, ball.y); ctx.stroke();
    ctx.fillStyle = hot > 0.7 ? '#fff' : ball.lob ? LIME : ball.drop > 0 ? CYAN : PINK;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(ball.x - 1, ball.y - 2, 2, 2);
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var opp = OPPONENTS[tier];
    var tb = table();
    ctx.save();
    if (shake > 0 && mode === 'play') ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawTable();
    drawCrowd();
    if (scoreFlash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (scoreFlash * 0.02).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // Big scores
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,20,147,0.5)';
    ctx.fillText(you.score, W / 2 - 50, 52);
    ctx.fillStyle = opp.color;
    ctx.globalAlpha = 0.5;
    ctx.fillText(cpu.score, W / 2 + 50, 52);
    ctx.globalAlpha = 1;
    if (stage === 'match') {
      var mp = matchPointFor(you.score, cpu.score) ? 'MATCH POINT' : matchPointFor(cpu.score, you.score) ? 'THEIR MATCH POINT' : (you.score >= 4 && cpu.score >= 4) ? 'DEUCE' : '';
      if (mp && Math.floor(frame / 20) % 2 === 0) {
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = mp === 'MATCH POINT' ? YELLOW : mp === 'DEUCE' ? CYAN : '#ff6347';
        ctx.fillText(mp, W / 2, 74);
      }
    }

    // Ink stains: the table remembers every rally
    for (var i = 0; i < stains.length; i++) {
      ctx.globalAlpha = stains[i].a;
      ctx.fillStyle = stains[i].c;
      ctx.beginPath(); ctx.arc(stains[i].x, stains[i].y, stains[i].r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawFeatures();

    // Pickup: a floating ink cap with its icon, blinking near the end
    if (pickup && (pickup.life > 90 || Math.floor(frame / 5) % 2 === 0)) {
      var py = pickup.y + Math.sin(pickup.bob) * 3;
      var pg = ctx.createRadialGradient(pickup.x, py, 2, pickup.x, py, 22);
      pg.addColorStop(0, pickup.color); pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35; ctx.fillStyle = pg; ctx.fillRect(pickup.x - 22, py - 22, 44, 44); ctx.globalAlpha = 1;
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(pickup.x, py, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = pickup.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pickup.x, py, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = pickup.color; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText({ multi: 'x2', big: 'BIG', small: 'SM', curve: 'CRV', freeze: 'ICE', steal: '$' }[pickup.type], pickup.x, py + 3);
    }

    var yh = yourH(), ch = cpuH();
    drawMachine(16, you.y, PINK, false, 2, Math.abs(youVel) > 0.5, smashArmed > 0 ? 'pink' : (charge >= 15 ? 'pink' : null), yh);
    if (stage === 'match') {
      drawMachine(W - 16 - PW, cpu.y, fx.freeze > 0 ? '#9ef' : opp.color, true, opp.coils, Math.abs(cpuVel) > 0.5, opp.ai === 'predict' ? (overheat > 0 ? 'red' : 'cyan') : null, ch);
      if (fx.freeze > 0) {
        ctx.fillStyle = 'rgba(160,230,255,0.35)';
        ctx.fillRect(W - 16 - PW - 4, cpu.y - 4, PW + 8, ch + 8);
      }
    } else {
      // The ball machine: an autoclave on the far rail, hums between shots
      var my = H / 2 - 30 + Math.sin(frame * 0.05) * 4;
      ctx.fillStyle = '#2e2e38'; ctx.fillRect(W - 34, my, 24, 60);
      ctx.fillStyle = '#4a4a5a'; ctx.fillRect(W - 32, my + 4, 20, 22);
      ctx.fillStyle = bonus && bonus.next < 10 && !balls.length ? CYAN : '#111'; ctx.fillRect(W - 30, my + 30, 16, 8);
      ctx.fillStyle = CYAN; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('MACHINE', W - 22, my + 52);
    }
    // Charge meter: fills while SPACE is held
    if (charge > 0 && stage === 'match') {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(28, you.y, 3, yh);
      ctx.fillStyle = charge >= 15 ? ORANGE : '#fff'; ctx.fillRect(28, you.y + yh - yh * (charge / 30), 3, yh * (charge / 30));
    }
    if (overheat > 0 && Math.floor(frame / 6) % 2 === 0) {
      ctx.fillStyle = '#ff6347';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('OVERHEAT', W - 30, cpu.y - 6);
    }
    if (quipT > 0 && stage === 'match') {
      // trash talk in a speech bubble off the paddle
      ctx.globalAlpha = Math.min(1, quipT / 20);
      ctx.font = '9px monospace';
      var qw = quipText.length * 5.6 + 12;
      var qx = W - 34 - qw, qy = Math.max(44, cpu.y - 22);
      ctx.fillStyle = '#fff'; ctx.fillRect(qx, qy - 11, qw, 15);
      ctx.beginPath(); ctx.moveTo(qx + qw - 6, qy + 4); ctx.lineTo(qx + qw + 2, qy + 9); ctx.lineTo(qx + qw - 12, qy + 4); ctx.fill();
      ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.fillText(quipText, qx + 6, qy);
      ctx.globalAlpha = 1;
    }

    // Every point inks a piece on your sheet, theirs stacks skulls
    for (var i = 0; i < you.score; i++) {
      var hx2 = W / 2 - 78 + i * 12;
      ctx.fillStyle = PINK;
      ctx.fillRect(hx2, 60, 3, 3); ctx.fillRect(hx2 + 4, 60, 3, 3);
      ctx.fillRect(hx2, 63, 7, 3); ctx.fillRect(hx2 + 2, 66, 3, 2);
    }
    for (var i = 0; i < cpu.score; i++) {
      var sx2 = W / 2 + 26 + i * 12;
      ctx.fillStyle = opp.color;
      ctx.fillRect(sx2, 60, 7, 5);
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(sx2 + 1, 61, 2, 2); ctx.fillRect(sx2 + 4, 61, 2, 2);
      ctx.fillStyle = opp.color;
      ctx.fillRect(sx2 + 1, 66, 5, 2);
    }

    // Particles
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 14);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Balls (hidden in the dark unless they are near a paddle or running hot)
    var showBalls = serveT === 0 || Math.floor(frame / 6) % 2 === 0;
    if (showBalls) {
      for (var b = 0; b < balls.length; b++) {
        var ball = balls[b];
        var dim = 1;
        if (tb.dark) {
          var edge = Math.min(ball.x, W - ball.x);
          var spd = Math.hypot(ball.vx, ball.vy);
          dim = edge < 110 ? 1 : edge < 170 ? (170 - edge) / 60 : 0;
          if (spd > 8) dim = Math.max(dim, 0.6);
          dim = Math.max(dim, 0.06);
        }
        drawBall(ball, dim);
      }
    }
    if (tb.dark) {
      // Lights out: only the lamps over the paddles reach the table
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 16, W, H - 18);
      var l1 = ctx.createRadialGradient(20, you.y + yh / 2, 10, 20, you.y + yh / 2, 130);
      l1.addColorStop(0, 'rgba(255,235,200,0.16)'); l1.addColorStop(1, 'rgba(255,235,200,0)');
      ctx.fillStyle = l1; ctx.fillRect(0, 16, W / 2, H - 18);
      var l2 = ctx.createRadialGradient(W - 20, cpu.y + ch / 2, 10, W - 20, cpu.y + ch / 2, 130);
      l2.addColorStop(0, 'rgba(255,235,200,0.16)'); l2.addColorStop(1, 'rgba(255,235,200,0)');
      ctx.fillStyle = l2; ctx.fillRect(W / 2, 16, W / 2, H - 18);
    }
    // Serve ring: a countdown pulse around the needle so the rhythm reads
    if (serveT > 0 && mode === 'play' && stage === 'match' && balls[0]) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (serveT / 50 * 0.6).toFixed(2) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(balls[0].x, balls[0].y, 6 + (50 - serveT) * 0.5, 0, Math.PI * 2); ctx.stroke();
    }

    // Popups
    for (var i = 0; i < popups.length; i++) {
      var pu = popups[i];
      ctx.globalAlpha = Math.min(1, pu.life / 16);
      ctx.fillStyle = pu.color;
      ctx.font = pu.big ? 'bold 14px monospace' : 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pu.text, Math.max(40, Math.min(W - 40, pu.x)), pu.y);
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = dispPts < pts ? YELLOW : '#fff';
    ctx.fillText('PTS ' + withNum(dispPts), 8, 11);
    ctx.textAlign = 'center';
    ctx.fillStyle = opp.color;
    if (stage === 'bonus' && bonus) ctx.fillText('BALL MACHINE ' + bonus.returned + '/' + bonus.total + ' // ' + Math.ceil(Math.max(0, bonus.timer) / 60) + 's', W / 2, 11);
    else ctx.fillText('VS ' + opp.name + ' (' + (tier + 1) + '/' + OPPONENTS.length + ')' + (tb.boss ? ' PHASE ' + phase : ''), W / 2, 11);
    ctx.textAlign = 'right';
    if (stage === 'bonus' && bonus && bonus.combo > 1) { ctx.fillStyle = bonus.combo >= 5 ? YELLOW : '#fff'; ctx.fillText('COMBO x' + bonus.combo, W - 8, 11); }
    else if (rally >= 2 && serveT === 0) {
      ctx.fillStyle = rally >= 8 ? YELLOW : rally >= 5 ? LIME : '#fff';
      ctx.fillText('RALLY ' + rally + (streak > 1 ? ' // STREAK x' + Math.min(4, streak) : ''), W - 8, 11);
    } else if (streak > 1) { ctx.fillStyle = YELLOW; ctx.fillText('STREAK x' + Math.min(4, streak), W - 8, 11); }
    else {
      ctx.fillStyle = '#9aa';
      ctx.fillText('BEST ' + withNum(Math.max(best, pts)), W - 8, 11);
    }
    // Active effects with their timers, stacked under the score
    var fy = 24;
    ctx.textAlign = 'left';
    ctx.font = 'bold 7px monospace';
    var fxRows = [];
    if (fx.big > 0) fxRows.push(['BIG BAR', fx.big / 480, LIME]);
    if (fx.small > 0) fxRows.push(['THEIR BAR SHRUNK', fx.small / 480, PURPLE]);
    if (fx.freeze > 0) fxRows.push(['FROZEN', fx.freeze / 60, '#9ef']);
    if (curveLeft > 0) fxRows.push(['CURVE x' + curveLeft, curveLeft / 3, CYAN]);
    for (var r = 0; r < fxRows.length; r++) {
      ctx.fillStyle = fxRows[r][2]; ctx.fillText(fxRows[r][0], 8, fy);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(8, fy + 2, 60, 2);
      ctx.fillStyle = fxRows[r][2]; ctx.fillRect(8, fy + 2, 60 * Math.max(0, Math.min(1, fxRows[r][1])), 2);
      fy += 11;
    }
    if (specials > 0 && specials < 3 && stage === 'match') { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText('SPECIALS ' + specials + '/3', 8, fy); }
    if (tauntT > 0 && bannerT === 0 && mode === 'play' && stage === 'match') {
      ctx.globalAlpha = Math.min(1, tauntT / 30);
      ctx.textAlign = 'center';
      ctx.fillStyle = opp.color;
      ctx.font = '9px monospace';
      ctx.fillText(opp.name + ': ' + opp.taunt, W / 2, H - 8);
      ctx.globalAlpha = 1;
    } else if (tableIntroT > 0 && bannerT === 0 && mode === 'play' && stage === 'match') {
      ctx.globalAlpha = Math.min(1, tableIntroT / 30);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '9px monospace';
      ctx.fillText(tb.name + ' // ' + tb.tip, W / 2, H - 8);
      ctx.globalAlpha = 1;
    }
    if (replayT > 0 && mode === 'play') {
      ctx.fillStyle = 'rgba(255,255,255,' + (replayT / 60 * 0.5).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      if (Math.floor(frame / 8) % 2 === 0) { ctx.fillStyle = '#ff3030'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'; ctx.fillText('REC  REPLAY', 8, 24); }
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 44);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = opp.color;
      ctx.fillText(bannerSub, W / 2, H / 2 - 26);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }
    ctx.restore();

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
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > 525) introT = 70; }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-pong', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
