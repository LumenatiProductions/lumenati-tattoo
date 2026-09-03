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
  var WIN_AT = 5, PW = 8, PH = 56;

  // The shop ladder: beat one to face the next. Each artist plays their own
  // way (ai), hits with their own machine (look), and has a line for you.
  var OPPONENTS = [
    { name: 'SCRATCHER',   v: 2.4, wob: 14, ai: 'lag',     color: LIME,   coils: 2, taunt: 'first week on the machine' },
    { name: 'APPRENTICE',  v: 3.3, wob: 10, ai: 'rush',    color: YELLOW, coils: 2, taunt: 'watched every tutorial twice' },
    { name: 'RESIDENT',    v: 4.2, wob: 4,  ai: 'lurk',    color: PURPLE, coils: 3, taunt: 'books are full for a year' },
    { name: 'SHOP BOSS',   v: 4.4, wob: 9,  ai: 'wobble',  color: ORANGE, coils: 3, taunt: 'signs the checks' },
    { name: 'THE MACHINE', v: 5.4, wob: 0,  ai: 'predict', color: CYAN,   coils: 3, taunt: 'does not blink' },
  ];

  // ── Points: what the wall keeps ──
  var PT_WIN = 200;      // x (tier + 1) for every point you take
  var PT_RALLY = 25;     // x rally length, for points won off a real exchange
  var PT_ACE = 150;      // they never touched it
  var PT_SMASH = 100;    // won it at smash speed
  var PT_TAPOUT = 1000;  // x (tier + 1) for beating an opponent
  var PT_SHUTOUT = 1500; // 5 to 0
  var PT_COMEBACK = 800; // won after being two down
  var PT_CHAMP = 5000;   // cleared the whole shop

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var frame, you, cpu, ball, serveT, rally, trail, won, tier, bannerT, bannerText, bannerSub, scoreFlash, stains;
  var pts, dispPts, beaten, longestRally, maxDown, heat, overheat, smashArmed, shake, particles, popups, lastSmash;
  var youPrevY, youVel, cpuPrevY, cpuVel, hitFlash, tauntT, quipT, quipText;
  var keyU = false, keyD = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-pong-pts') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (pts > best) { best = pts; try { localStorage.setItem('lumenati-arcade-pong-pts', String(best)); } catch(e) {} }
  }
  function withNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    frame = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0; rally = 0; won = false;
    tier = 0; bannerT = 0; bannerText = ''; bannerSub = '';
    you = { y: H / 2 - PH / 2, score: 0 };
    cpu = { y: H / 2 - PH / 2, score: 0, aim: H / 2 - PH / 2, vy: 0 };
    trail = []; scoreFlash = 0; stains = [];
    pts = 0; dispPts = 0; beaten = 0; longestRally = 0; maxDown = 0; heat = 0; overheat = 0; smashArmed = 0;
    shake = 0; particles = []; popups = []; lastSmash = false;
    youPrevY = you.y; youVel = 0; cpuPrevY = cpu.y; cpuVel = 0; hitFlash = 0; tauntT = 150; quipT = 0; quipText = '';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '0';
    serve(Math.random() < 0.5 ? 1 : -1);
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Drag your paddle // first to 5' : 'W/S, mouse or drag // first to 5';
    var statA = document.getElementById('jd-stat-a');
    if (statA) statA.textContent = 'You';
    var statB = document.getElementById('jd-stat-b');
    if (statB) statB.textContent = 'CPU';
    window.skateRunning = true;
    startLoop();
  }

  function serve(towards) {
    var a = (Math.random() * 0.6 - 0.3);
    var sp = 4 + tier * 0.15;
    ball = { x: W / 2, y: H / 2, vx: towards * Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5 };
    serveT = 50;
    rally = 0;
    trail = [];
    smashArmed = 0;
    lastSmash = false;
  }

  function addStain(x, y, r) {
    stains.push({ x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, r: r + Math.random() * 3, a: 0.16 + Math.random() * 0.08, c: PINK });
    // a couple of satellite drops so it reads as a splash, not a dot
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
    while (particles.length > 160) particles.shift();
  }
  function popup(x, y, text, color, big) {
    popups.push({ x: x, y: y, text: text, color: color || '#fff', life: big ? 70 : 50, big: !!big });
    while (popups.length > 12) popups.shift();
  }
  function award(n, x, y, label, color, big) {
    pts += n;
    popup(x, y, label + ' +' + withNum(n), color, big);
  }

  function point(scorer) {
    var sp = Math.hypot(ball.vx, ball.vy);
    if (rally > longestRally) longestRally = rally;
    if (rally >= 8) sayCallout('pong-c1');
    scoreFlash = 14;
    var edgeX = ball.x < 0 ? 6 : W - 6;
    addStain(edgeX, ball.y, 9);
    addStain(ball.x < 0 ? 12 : W - 12, ball.y + 6, 5);
    burst(edgeX, ball.y, scorer === you ? PINK : OPPONENTS[tier].color, 22, 3.2);
    scorer.score++;
    document.getElementById('jd-br-score').textContent = you.score;
    document.getElementById('jd-br-lives').textContent = cpu.score;
    heat = 0; overheat = 0;
    if (scorer === you) {
      sfxScore();
      shake = 8;
      var px = W - 70, py = ball.y < 60 ? 90 : Math.min(H - 40, ball.y);
      award(PT_WIN * (tier + 1), px, py, 'POINT', '#fff');
      if (rally >= 4) award(PT_RALLY * rally, px, py + 14, 'RALLY x' + rally, YELLOW);
      if (rally <= 1) award(PT_ACE, px, py + (rally >= 4 ? 28 : 14), 'ACE', LIME);
      else if (sp >= 8.4 || lastSmash) award(PT_SMASH, px, py + (rally >= 4 ? 28 : 14), 'SMASH', ORANGE);
    } else {
      sfxLose();
      shake = 4;
      var down = cpu.score - you.score;
      if (down > maxDown) maxDown = down;
      if (Math.random() < 0.5 && cpu.score < WIN_AT) { quipT = 80; quipText = cpuQuip(); }
    }
    if (you.score >= WIN_AT) {
      beaten = tier + 1;
      var bx = W / 2, by = H / 2 + 24;
      award(PT_TAPOUT * (tier + 1), bx, by, 'TAPPED OUT', LIME, true);
      if (cpu.score === 0) award(PT_SHUTOUT, bx, by + 18, 'SHUTOUT', YELLOW, true);
      else if (maxDown >= 2) award(PT_COMEBACK, bx, by + 18, 'COMEBACK', ORANGE, true);
      maxDown = 0;
      if (tier >= OPPONENTS.length - 1) {
        // Cleared the whole shop
        won = true;
        award(PT_CHAMP, bx, by + 36, 'SHOP CHAMPION', PINK, true);
        say('pong-c3', 400);
        enterBoard(pts);
        saveBest();
        sfxWin();
        return;
      }
      bannerT = 130;
      bannerText = OPPONENTS[tier].name + ' TAPPED OUT';
      sayCallout('pong-c2');
      tier++;
      bannerSub = 'NEXT UP: ' + OPPONENTS[tier].name;
      tauntT = 200;
      you.score = 0; cpu.score = 0;
      cpu.y = H / 2 - PH / 2; cpu.aim = cpu.y; cpu.vy = 0;
      document.getElementById('jd-br-score').textContent = '0';
      document.getElementById('jd-br-lives').textContent = '0';
      sfxWin();
      shake = 12;
      serve(1);
      return;
    }
    if (cpu.score >= WIN_AT) {
      won = false;
      enterBoard(pts);
      saveBest();
      deathJingle();
      return;
    }
    serve(scorer === you ? -1 : 1);
  }

  function cpuQuip() {
    var lines = {
      lag: ['oops', 'lucky', 'is it on?'],
      rush: ['too easy', 'saw that coming', 'next'],
      lurk: ['patience', 'read it', 'thanks'],
      wobble: ['pay up', 'my table', 'again'],
      predict: ['calculated', 'inevitable', 'zero error'],
    }[OPPONENTS[tier].ai];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  // Predict where the ball crosses x, bouncing off the rails on the way.
  function predictY(x) {
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

  function cpuThink() {
    var opp = OPPONENTS[tier];
    var toward = ball.vx > 0;
    var center = H / 2 - PH / 2;
    var maxV = opp.v + Math.min(1.4, rally * 0.09);
    var target;
    if (opp.ai === 'lag') {
      // Follows late and loose, drifts back to the middle when it's not their ball.
      var want = toward ? ball.y - PH / 2 : center;
      cpu.aim += (want - cpu.aim) * 0.07;
      target = cpu.aim + Math.sin(frame * 0.05) * opp.wob;
    } else if (opp.ai === 'rush') {
      // Chases hard, leads the ball, overshoots on momentum.
      var lead = ball.y + ball.vy * (toward ? 7 : 2) - PH / 2;
      var dir = lead > cpu.y + 2 ? 1 : lead < cpu.y - 2 ? -1 : 0;
      cpu.vy += dir * 0.75;
      cpu.vy *= 0.9;
      cpu.vy = Math.max(-maxV * 1.25, Math.min(maxV * 1.25, cpu.vy));
      cpu.y += cpu.vy;
      cpu.y = Math.max(18, Math.min(H - PH - 4, cpu.y));
      return;
    } else if (opp.ai === 'lurk') {
      // Sits at center until the ball crosses the line, then snaps to it.
      var live = toward && ball.x > W / 2 - 30;
      target = live ? ball.y - PH / 2 : center + Math.sin(frame * 0.02) * opp.wob;
      if (live) maxV += 1.6;
    } else if (opp.ai === 'wobble') {
      // Fast but never still; the wobble is where you beat them.
      target = toward ? ball.y - PH / 2 + Math.sin(frame * 0.13) * opp.wob : center;
    } else {
      // The Machine: reads the bounce ahead of time. Its tell is heat: six
      // returns in a row and it stalls for a beat.
      if (overheat > 0) { maxV *= 0.3; }
      target = toward ? predictY(W - 16 - PW - ball.r) - PH / 2 : center + Math.sin(frame * 0.03) * 12;
      // it aims for the edges of its paddle to put angle on you
      if (toward && overheat === 0) target += (ball.y > H / 2 ? -1 : 1) * 14;
    }
    var dv = target - cpu.y;
    cpu.y += Math.max(-maxV, Math.min(maxV, dv));
    cpu.y = Math.max(18, Math.min(H - PH - 4, cpu.y));
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;

    // You
    if (keyU) you.y -= 5;
    if (keyD) you.y += 5;
    you.y = Math.max(18, Math.min(H - PH - 4, you.y));
    youVel = you.y - youPrevY; youPrevY = you.y;

    cpuThink();
    cpuVel = cpu.y - cpuPrevY; cpuPrevY = cpu.y;

    if (bannerT > 0) bannerT--;
    if (tauntT > 0) tauntT--;
    if (quipT > 0) quipT--;
    if (scoreFlash > 0) scoreFlash--;
    if (hitFlash > 0) hitFlash--;
    if (shake > 0) shake--;
    if (overheat > 0) overheat--;
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
    if (serveT > 0) { serveT--; return; }

    ball.x += ball.vx;
    ball.y += ball.vy;
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 10) trail.shift();

    // Walls
    if (ball.y < ball.r + 16) { ball.y = ball.r + 16; ball.vy = Math.abs(ball.vy); addStain(ball.x, 18, 3); burst(ball.x, 18, '#fff', 4, 1.2); sfxWall(); }
    if (ball.y > H - ball.r - 2) { ball.y = H - ball.r - 2; ball.vy = -Math.abs(ball.vy); addStain(ball.x, H - 4, 3); burst(ball.x, H - 4, '#fff', 4, 1.2); sfxWall(); }

    // Your paddle (left)
    var yx = 16;
    if (ball.vx < 0 && ball.x - ball.r < yx + PW && ball.x - ball.r > yx - 6 &&
        ball.y > you.y - ball.r && ball.y < you.y + PH + ball.r) {
      bounce(you.y, youVel, true);
      ball.x = yx + PW + ball.r;
      ball.vx = Math.abs(ball.vx);
    }
    // CPU paddle (right)
    var cx = W - 16 - PW;
    if (ball.vx > 0 && ball.x + ball.r > cx && ball.x + ball.r < cx + PW + 6 &&
        ball.y > cpu.y - ball.r && ball.y < cpu.y + PH + ball.r) {
      bounce(cpu.y, OPPONENTS[tier].ai === 'wobble' ? cpuVel * 1.4 : cpuVel * 0.6, false);
      ball.x = cx - ball.r;
      ball.vx = -Math.abs(ball.vx);
      if (OPPONENTS[tier].ai === 'predict') {
        heat++;
        if (heat >= 6) { overheat = 55; heat = 0; popup(cx - 30, cpu.y - 8, 'OVERHEAT', '#ff6347'); }
      }
    }

    function bounce(py, pvel, mine) {
      addStain(ball.x, ball.y, 4);
      var rel = (ball.y - (py + PH / 2)) / (PH / 2);
      rel = Math.max(-1, Math.min(1, rel));
      var cap = 8.2 + tier * 0.45;
      var sp = Math.min(cap, Math.hypot(ball.vx, ball.vy) * 1.06 + 0.1);
      // Smash: catch it on the edge while your paddle is moving into it.
      var smash = mine && Math.abs(rel) > 0.72 && Math.abs(pvel) >= 3 && (pvel > 0) === (rel > 0);
      if (smash) { sp = Math.min(cap + 2.2, sp * 1.3); lastSmash = true; smashArmed = 20; shake = 5; popup(ball.x + 30, ball.y - 12, 'SMASH', ORANGE); playSfx(1100, 0.08, 'square', 0.12); }
      else lastSmash = false;
      var ang = rel * (Math.PI / 3.4);
      var dirx = ball.vx > 0 ? 1 : -1;
      ball.vx = Math.cos(ang) * sp * dirx;
      ball.vy = Math.sin(ang) * sp;
      // Spin: paddle motion bends the return.
      ball.vy += pvel * 0.35;
      var maxVy = sp * 0.88;
      ball.vy = Math.max(-maxVy, Math.min(maxVy, ball.vy));
      ball.vx = Math.sqrt(Math.max(1, sp * sp - ball.vy * ball.vy)) * dirx;
      rally++;
      hitFlash = 6;
      burst(ball.x, ball.y, mine ? PINK : OPPONENTS[tier].color, 8, 2.2);
      if (mine) {
        var g = 10 + rally * 5;
        pts += g;
        if (rally >= 3) popup(ball.x + 22, ball.y - 10, '+' + g, rally >= 8 ? YELLOW : 'rgba(255,255,255,0.8)');
      }
      sfxPaddle();
    }

    // Out
    if (ball.x < -10) point(cpu);
    else if (ball.x > W + 10) point(you);
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); keyU = true; start(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); keyD = true; start(); }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) start(); }
  });
  document.addEventListener('keyup', function(e) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keyU = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keyD = false;
  });
  function canvasY(clientY) {
    var r = canvas.getBoundingClientRect();
    return (clientY - r.top) * (H / r.height);
  }
  canvas.addEventListener('mousemove', function(e) {
    you.y = Math.max(18, Math.min(H - PH - 4, canvasY(e.clientY) - PH / 2));
  });
  canvas.addEventListener('click', function() { start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    you.y = Math.max(18, Math.min(H - PH - 4, canvasY(e.touches[0].clientY) - PH / 2));
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    you.y = Math.max(18, Math.min(H - PH - 4, canvasY(e.touches[0].clientY) - PH / 2));
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
  function enterBoard(v) { wall.enter(v, { level: tier + 1, meta: { beaten: beaten, longestRally: longestRally } }); }
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
    ctx.fillText('Your machine vs theirs // W/S, MOUSE or DRAG // first to 5', W / 2, H - 42);
    ctx.fillText('rallies, aces and smashes score // catch it on the edge to smash', W / 2, H - 29);
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

  function drawMachine(px2, py2, color, flip, coils, moving, hot) {
    // Paddles are tattoo machines: frame, coils, and the needle bar you rally with.
    var vib = moving ? (Math.random() - 0.5) * 1.6 : 0;
    if (hot) {
      var hg = ctx.createRadialGradient(px2 + PW / 2, py2 + PH / 2, 4, px2 + PW / 2, py2 + PH / 2, 40);
      hg.addColorStop(0, hot === 'red' ? 'rgba(255,99,71,0.45)' : 'rgba(0,255,255,0.28)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(px2 - 40, py2 - 30, PW + 80, PH + 60);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px2 + 2, py2 + 3, PW, PH);
    ctx.fillStyle = color;
    ctx.fillRect(px2, py2, PW, PH);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(flip ? px2 + PW - 2 : px2, py2, 2, PH);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(flip ? px2 : px2 + PW - 2, py2, 2, PH);
    // grip tape bands
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (var b = 8; b < PH - 4; b += 12) ctx.fillRect(px2 + 1, py2 + b, PW - 2, 2);
    var bx3 = px2 + (flip ? PW + 2 : -12);
    ctx.fillStyle = '#2e2e38';
    ctx.fillRect(bx3, py2 + PH / 2 - 12 - (coils - 2) * 5, 10, 24 + (coils - 2) * 10);
    ctx.fillStyle = '#b87333';
    for (var c = 0; c < coils; c++) {
      var cy = py2 + PH / 2 + (c - (coils - 1) / 2) * 10 + vib;
      ctx.beginPath(); ctx.arc(bx3 + 5, cy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0a060';
      ctx.fillRect(bx3 + 3, cy - 1, 2, 1);
      ctx.fillStyle = '#b87333';
    }
    ctx.fillStyle = '#9aa2ae';
    ctx.fillRect(bx3 + (flip ? -4 : 10), py2 + PH / 2 - 1, 4, 2);
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

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var opp = OPPONENTS[tier];
    ctx.save();
    if (shake > 0 && mode === 'play') ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawTable();
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

    // Ink stains: the table remembers every rally
    for (var i = 0; i < stains.length; i++) {
      ctx.globalAlpha = stains[i].a;
      ctx.fillStyle = stains[i].c;
      ctx.beginPath(); ctx.arc(stains[i].x, stains[i].y, stains[i].r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawMachine(16, you.y, PINK, false, 2, Math.abs(youVel) > 0.5, smashArmed > 0 ? 'pink' : null);
    drawMachine(W - 16 - PW, cpu.y, opp.color, true, opp.coils, Math.abs(cpuVel) > 0.5, opp.ai === 'predict' ? (overheat > 0 ? 'red' : 'cyan') : null);
    if (overheat > 0 && Math.floor(frame / 6) % 2 === 0) {
      ctx.fillStyle = '#ff6347';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('OVERHEAT', W - 30, cpu.y - 6);
    }
    if (quipT > 0) {
      ctx.globalAlpha = Math.min(1, quipT / 20);
      ctx.fillStyle = opp.color;
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(quipText, W - 30, Math.max(40, cpu.y - 6));
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

    // The ball is a needle tip: trail, glow that grows with speed, a bright core
    var sp = Math.hypot(ball.vx, ball.vy);
    var hot = Math.max(0, Math.min(1, (sp - 5) / 5));
    for (var i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (i / trail.length) * (0.25 + hot * 0.3);
      ctx.fillStyle = hot > 0.6 ? '#fff' : PINK;
      var ts = 2 + (i / trail.length) * 3;
      ctx.fillRect(trail[i].x - ts / 2, trail[i].y - ts / 2, ts, ts);
    }
    ctx.globalAlpha = 1;
    if (serveT === 0 || Math.floor(frame / 6) % 2 === 0) {
      var gr = 14 + hot * 12;
      var glow = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, gr);
      glow.addColorStop(0, 'rgba(255,' + Math.round(20 + hot * 180) + ',' + Math.round(147 + hot * 80) + ',0.55)');
      glow.addColorStop(1, 'rgba(255,20,147,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(ball.x - gr, ball.y - gr, gr * 2, gr * 2);
      // needle: a short bright line trailing the direction of travel
      var nl = 8 + hot * 6;
      var nx = sp > 0 ? ball.vx / sp : 1, ny = sp > 0 ? ball.vy / sp : 0;
      ctx.strokeStyle = 'rgba(220,230,240,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ball.x - nx * nl, ball.y - ny * nl); ctx.lineTo(ball.x, ball.y); ctx.stroke();
      ctx.fillStyle = hot > 0.7 ? '#fff' : PINK;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(ball.x - 1, ball.y - 2, 2, 2);
    }
    // Serve ring: a countdown pulse around the needle so the rhythm reads
    if (serveT > 0 && mode === 'play') {
      ctx.strokeStyle = 'rgba(255,255,255,' + (serveT / 50 * 0.6).toFixed(2) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, 6 + (50 - serveT) * 0.5, 0, Math.PI * 2); ctx.stroke();
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
    ctx.fillText('VS ' + opp.name + ' (' + (tier + 1) + '/' + OPPONENTS.length + ')', W / 2, 11);
    ctx.textAlign = 'right';
    if (rally >= 2 && serveT === 0) {
      ctx.fillStyle = rally >= 8 ? YELLOW : rally >= 5 ? LIME : '#fff';
      ctx.fillText('RALLY ' + rally, W - 8, 11);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.fillText('BEST ' + withNum(Math.max(best, pts)), W - 8, 11);
    }
    if (tauntT > 0 && bannerT === 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, tauntT / 30);
      ctx.textAlign = 'center';
      ctx.fillStyle = opp.color;
      ctx.font = '9px monospace';
      ctx.fillText(opp.name + ': ' + opp.taunt, W / 2, H - 8);
      ctx.globalAlpha = 1;
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 44);
      ctx.font = 'bold 12px monospace';
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
