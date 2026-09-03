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
  function sfxBuzz() { playSfx(90 + Math.random() * 25, 0.06, 'sawtooth', 0.045); }
  // The machine hums for real: a continuous sawtooth that opens while inking
  var buzzOsc = null, buzzGain = null;
  function setBuzz(level) {
    try {
      var c = getSfx();
      if (!buzzOsc) {
        buzzOsc = c.createOscillator();
        buzzGain = c.createGain();
        buzzOsc.type = 'sawtooth';
        buzzOsc.frequency.value = 58;
        buzzGain.gain.value = 0;
        buzzOsc.connect(buzzGain);
        buzzGain.connect(c.destination);
        buzzOsc.start();
      }
      buzzGain.gain.setTargetAtTime(level, c.currentTime, 0.06);
      if (level > 0) buzzOsc.frequency.setValueAtTime(55 + Math.random() * 8, c.currentTime);
    } catch (e) {}
  }
  function sfxWince() { playSfx(300, 0.12, 'square', 0.13); setTimeout(function(){playSfx(200, 0.2, 'sawtooth', 0.13);}, 100); }
  function sfxDone() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
  function sfxFlinchWarn() { playSfx(1200, 0.07, 'square', 0.1); setTimeout(function(){playSfx(1200, 0.07, 'square', 0.1);}, 110); }
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

  // ── This game's own chiptune: smooth focused session groove ──
  var SONGS = [
    { root: 98.00, bass: [0,-1,-1,7, -1,-1,5,-1, 0,-1,-1,7, -1,-1,3,-1],  lead: [12,-1,-1,15, -1,-1,14,-1, 12,-1,-1,10, -1,-1,7,-1] },
    { root: 110.00, bass: [0,-1,5,-1, -1,3,-1,-1, 0,-1,5,-1, -1,7,-1,-1], lead: [15,-1,-1,12, -1,14,-1,-1, 15,-1,17,-1, 14,-1,12,-1] },
  ];
  var MENU_SONG = { root: 98.00, bass: [0,-1,7,-1, 5,-1,7,-1, 3,-1,7,-1, 5,-1,7,-1], lead: [12,-1,14,15, -1,14,-1,12, 15,-1,17,15, -1,14,12,-1] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 14 : Math.max(10, 16 - level);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(level - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.045);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.026);
    if (musicStep % 8 === 0) playSfx(65, 0.1, 'sawtooth', 0.022);
  }
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF';
  var INK = '#1c1418';
  var STENCIL = '#7b2fbf'; // stencils are purple, always
  var SKINS = ['#f0c8a0', '#d9a276', '#b97a4e', '#8d5a3b', '#6b4128'];
  var NEEDLE_X = 120;
  var MOTIF_GAP = 230, MOTIF_SPAN = 30;

  // ── Every design is a real piece: the line you trace, the linework around it ──
  // w0/wv shape the line weight (script swells, fine line stays thin).
  var DESIGNS = [
    { name: 'SIMPLE SCRIPT', motif: 'script', w0: 2.2, wv: 1.1, wf: 0.03 },
    { name: 'ROSE OUTLINE', motif: 'rose', w0: 2.4, wv: 0.4, wf: 0.05 },
    { name: 'FINE LINE HEART', motif: 'heart', w0: 1.6, wv: 0.2, wf: 0.04 },
    { name: 'THE DAGGER', motif: 'dagger', w0: 2.8, wv: 0.5, wf: 0.02 },
    { name: 'SNAKE', motif: 'snake', w0: 2.6, wv: 0.9, wf: 0.035 },
    { name: 'THE SHAKY CLIENT', motif: 'star', w0: 2.2, wv: 0.5, wf: 0.03 },
    { name: 'OLD SCHOOL ANCHOR', motif: 'anchor', w0: 3.0, wv: 0.3, wf: 0.02 },
  ];
  // Flinch kinds. Each telegraphs (warn frames) then shoves the skin.
  var FLINCHES = {
    sneeze:  { warn: 50, dur: [55, 80],   amp: [16, 24], line: 'GONNA SNEEZE', shape: 'bump' },
    twitch:  { warn: 30, dur: [18, 28],   amp: [11, 17], line: 'CRAMP', shape: 'bump' },
    breathe: { warn: 40, dur: [150, 210], amp: [12, 18], line: 'DEEP BREATH', shape: 'sway' },
  };
  var LINES = {
    start: ['MAKE IT CLEAN', 'I TRUST YOU', 'NO PRESSURE', 'MY FIRST ONE', 'SITTING STILL, PROMISE', 'MY BUDDY SENT ME'],
    ow: ['OW', 'HEY', 'THAT ONE HURT', 'WATCH IT', 'EASY'],
    lost: ['NOT SURE ABOUT THIS', 'IS THAT SUPPOSED TO BLEED', 'MAYBE A BREAK'],
    S: ['THAT IS SICK', 'FRAMING THIS'], A: ['LOVE IT', 'SO CLEAN'], B: ['LOOKS GOOD', 'NICE'], C: ['IT IS FINE', 'OK'], D: ['HMM', 'WE WILL SEE'],
  };
  var GRADE_BONUS = { S: 400, A: 250, B: 120, C: 50, D: 0 };
  var GRADE_TIP = { S: 150, A: 100, B: 50, C: 20, D: 0 };

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, trust, level, frame;
  var path, pathLen, sx, speed, tol, needleY, pointerY, keyU, keyD;
  var record, offStreak, combo, runCols, grace, prec, lastNick, lastLost, offTotal;
  var flinch; // { kind, warnT, t, dur, amp, cols, good, shape } | null
  var nextFlinch, bannerT, bannerText, particles, popups, shake, doneAcc, grade, gradeT, gradeLines;
  var speech, speechT, motifs, designsDone, bestAcc, bestCombo, tips;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-steady') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-steady', String(best)); } catch(e) {} }
  }
  function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function design() { return DESIGNS[(level - 1) % DESIGNS.length]; }
  function weight(wx) { var d = design(); return d.w0 + Math.sin(wx * d.wf) * d.wv; }

  function makePath(lvl) {
    var a1 = 16 + lvl * 5, f1 = 0.006 + lvl * 0.0011;
    var a2 = 7 + lvl * 2.5, f2 = 0.018 + lvl * 0.0022;
    var p1 = Math.random() * 6.28, p2 = Math.random() * 6.28;
    return function(x) {
      return 168 + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * a2;
    };
  }

  function talk(text, t) { speech = text; speechT = t || 110; }

  function startDesign() {
    path = makePath(level);
    pathLen = 2400 + level * 400;
    sx = 0;
    speed = Math.min(3.8, 1.5 + level * 0.22);
    tol = Math.max(6, 13 - level);
    record = [];
    offStreak = 0; offTotal = 0; runCols = 0;
    nextFlinch = 300 + Math.random() * 240;
    flinch = null;
    needleY = path(NEEDLE_X);
    pointerY = null;
    motifs = [];
    for (var mx = 320; mx < pathLen - 120; mx += MOTIF_GAP) motifs.push({ x: mx, state: 'stencil', judged: false });
    talk(pick(LINES.start), 130);
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; trust = 3; level = 1; frame = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    combo = 1; grace = 0; bannerT = 0; bannerText = ''; doneAcc = null; grade = null; gradeT = 0; gradeLines = [];
    particles = []; popups = []; shake = 0; keyU = false; keyD = false; prec = 0; lastNick = -999; lastLost = -999;
    speech = ''; speechT = 0; designsDone = 0; bestAcc = 0; bestCombo = 1; tips = 0;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    startDesign();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Drag up + down // stay on the stencil' : 'Up/Down keys // stay on the stencil';
    var statB = document.getElementById('jd-stat-b');
    if (statB) statB.textContent = 'Trust';
    window.skateRunning = true;
    startLoop();
  }

  function spawnParticles(x, y, color, count, spread) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * (spread || 3),
        vy: (Math.random() - 0.5) * (spread || 3),
        life: 14 + Math.random() * 12,
        color: color,
        size: 1 + Math.random() * 2
      });
    }
  }
  function addPopup(x, y, text, color, big) {
    popups.push({ x: x, y: y, text: text, color: color || '#fff', life: big ? 80 : 55, big: !!big });
  }
  function addScore(n, x, y, text, color, big) {
    score += n;
    document.getElementById('jd-br-score').textContent = score;
    if (text) addPopup(x, y, text, color, big);
  }

  // The stencil target at world x, including any flinch shove
  function targetAt(wx) {
    var y = path(wx);
    if (flinch && flinch.warnT <= 0) {
      var p = flinch.t / flinch.dur;
      y += (flinch.shape === 'sway' ? Math.sin(p * Math.PI * 2) : Math.sin(p * Math.PI)) * flinch.amp;
    }
    return y;
  }

  function startFlinch(kind, warnOverride) {
    var k = FLINCHES[kind];
    flinch = {
      kind: kind, warnT: warnOverride || k.warn, t: 0, shape: k.shape,
      dur: k.dur[0] + Math.random() * (k.dur[1] - k.dur[0]),
      amp: (Math.random() < 0.5 ? -1 : 1) * (k.amp[0] + Math.random() * (k.amp[1] - k.amp[0]) + level * 3),
      cols: 0, good: 0,
    };
    talk(k.line, k.warn + 30);
    sfxFlinchWarn();
  }
  function pickFlinch() {
    var kinds = ['sneeze'];
    if (level >= 2) kinds.push('twitch');
    if (level >= 3) kinds.push('breathe');
    if (level >= 4) kinds.push('twitch');
    return pick(kinds);
  }

  function gradeFor(acc) { return acc >= 97 ? 'S' : acc >= 90 ? 'A' : acc >= 78 ? 'B' : acc >= 60 ? 'C' : 'D'; }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (bannerT > 0) bannerT--;
    if (gradeT > 0) gradeT--;
    if (speechT > 0) { speechT--; if (speechT === 0) speech = ''; }
    if (grace > 0) grace--;
    if (shake > 0) shake--;

    // Needle control: keys nudge, pointer pulls
    if (keyU) needleY -= 3.4;
    if (keyD) needleY += 3.4;
    if (pointerY !== null) needleY += (pointerY - needleY) * 0.45;
    needleY = Math.max(70, Math.min(285, needleY));

    // Flinch clock
    if (!flinch) {
      nextFlinch--;
      if (nextFlinch <= 0) startFlinch(pickFlinch());
    } else if (flinch.warnT > 0) {
      flinch.warnT--;
      if (flinch.warnT === 0) shake = Math.max(shake, 10);
    } else {
      flinch.t++;
      if (flinch.t >= flinch.dur) {
        if (flinch.cols > 0 && flinch.good / flinch.cols >= 0.8) {
          addScore(40 * level, NEEDLE_X + 40, needleY - 30, 'RODE THE FLINCH +' + (40 * level), CYAN, true);
          spawnParticles(NEEDLE_X, needleY, YELLOW, 10, 4);
          sfxDone();
        }
        var chain = flinch.kind === 'twitch' && level >= 5 && Math.random() < 0.5;
        flinch = null;
        nextFlinch = Math.max(140, 340 - level * 30) + Math.random() * 240;
        if (chain) startFlinch('twitch', 14);
      }
    }

    var onNow = record[Math.floor(sx + NEEDLE_X) - 1];
    setBuzz(mode === 'play' && onNow && onNow.good ? 0.028 : 0);

    // Advance the needle along the design, judging every column crossed
    var newSx = sx + speed;
    for (var wx = Math.ceil(sx + NEEDLE_X); wx < newSx + NEEDLE_X; wx++) {
      var ty = targetAt(wx);
      var err = Math.abs(needleY - ty);
      var good = err <= tol;
      var tier = !good ? 0 : err <= tol * 0.35 ? 3 : err <= tol * 0.7 ? 2 : 1;
      record[wx] = { y: good ? needleY : ty, good: good, ny: needleY, tier: tier };
      if (flinch && flinch.warnT <= 0) { flinch.cols++; if (good) flinch.good++; }
      prec += ((good ? 1 - err / tol : 0) - prec) * 0.04;
      if (good) {
        offStreak = 0;
        runCols += tier === 3 ? 2 : 1;
        if (wx % 20 === 0) {
          addScore(tier * combo, 0, 0, null);
          spawnParticles(NEEDLE_X, needleY + 4, INK, 1);
        }
        if (tier === 3 && wx % 60 === 0) addPopup(NEEDLE_X + 14, needleY - 16, 'DEAD CENTER +' + (3 * combo), '#fff');
        if (runCols >= 60) {
          runCols = 0;
          if (combo < 8) {
            combo++;
            if (combo > bestCombo) bestCombo = combo;
            addPopup(NEEDLE_X + 20, needleY - 34, 'STEADY x' + combo, YELLOW, true);
            spawnParticles(NEEDLE_X, needleY, YELLOW, 8, 4);
            playSfx(600 + combo * 80, 0.08, 'square', 0.1);
            if (combo === 5) sayCallout('steady-c1');
          }
        }
      } else {
        offStreak++; offTotal++;
        if (offStreak === 1) { spawnParticles(NEEDLE_X, needleY, '#cc2222', 3); lastNick = frame; }
        if (offStreak === 8) {
          runCols = 0;
          if (combo > 1) { combo = Math.max(1, Math.floor(combo / 2)); addPopup(NEEDLE_X + 16, needleY - 20, 'WANDER', '#ff6347'); }
          talk(pick(LINES.ow), 60);
          shake = Math.max(shake, 5);
        }
        if (offStreak > 50 && grace === 0) {
          trust--;
          document.getElementById('jd-br-lives').textContent = trust;
          sfxWince();
          combo = 1; runCols = 0;
          grace = 120;
          lastLost = frame;
          shake = 14;
          addPopup(W / 2, 90, '-1 TRUST', '#ff6347', true);
          talk(pick(LINES.lost), 120);
          sayCallout('steady-c3');
          offStreak = 0;
          if (trust <= 0) {
            setBuzz(0);
            enterBoard(score);
            saveBest();
            deathJingle();
            return;
          }
        }
      }
    }
    sx = newSx;

    // Motifs get judged once the needle clears them: inked clean, or botched
    for (var m = 0; m < motifs.length; m++) {
      var mo = motifs[m];
      if (mo.judged || sx + NEEDLE_X < mo.x + MOTIF_SPAN) continue;
      mo.judged = true;
      var gc = 0, tc = 0;
      for (var q = mo.x - MOTIF_SPAN; q <= mo.x + MOTIF_SPAN; q++) if (record[q]) { tc++; if (record[q].good) gc++; }
      if (tc && gc / tc >= 0.75) {
        mo.state = 'ink';
        addScore(20 * level, NEEDLE_X - 20, path(mo.x) - 40, design().motif.toUpperCase() + ' +' + (20 * level), LIME);
        spawnParticles(NEEDLE_X - 30, path(mo.x), LIME, 6, 3);
      } else {
        mo.state = 'botched';
        addPopup(NEEDLE_X - 20, path(mo.x) - 40, 'BOTCHED', '#ff6347');
      }
    }

    // Design finished: grade the work
    if (sx + NEEDLE_X >= pathLen) {
      var goodCount = 0, total = 0;
      for (var i = NEEDLE_X; i < pathLen; i++) {
        if (record[i]) { total++; if (record[i].good) goodCount++; }
      }
      var acc = total ? Math.round(goodCount / total * 100) : 0;
      doneAcc = acc;
      if (acc > bestAcc) bestAcc = acc;
      grade = gradeFor(acc);
      gradeLines = [];
      var bonus = GRADE_BONUS[grade] * level;
      score += bonus;
      gradeLines.push({ t: 'ACCURACY ' + acc + '%   +' + fmtNum(bonus), c: '#fff' });
      if (offTotal === 0) {
        var clean = 300 * level;
        score += clean;
        gradeLines.push({ t: 'CLEAN LINE   +' + fmtNum(clean), c: CYAN });
      }
      var tip = GRADE_TIP[grade];
      if (tip) {
        score += tip; tips += tip;
        gradeLines.push({ t: 'TIP   +' + fmtNum(tip), c: YELLOW });
      }
      document.getElementById('jd-br-score').textContent = score;
      gradeT = 150;
      designsDone++;
      talk(pick(LINES[grade]), 150);
      if (grade === 'S') say('so-sick', 200);
      else if (acc >= 70) sayCallout(acc >= 90 ? 'steady-c2' : 'steady-c1');
      if (acc >= 90 && trust < 3) {
        trust++;
        document.getElementById('jd-br-lives').textContent = trust;
        gradeLines.push({ t: 'TRUST BACK', c: PINK });
      }
      if (grade === 'S' || grade === 'A') spawnParticles(W / 2, 100, YELLOW, 24, 6);
      sfxDone();
      level++;
      startDesign();
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x -= speed; p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 0.45; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); keyU = true; pointerY = null; start(); }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); keyD = true; pointerY = null; start(); }
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
  canvas.addEventListener('mousemove', function(e) { pointerY = canvasY(e.clientY); });
  canvas.addEventListener('mouseleave', function() { pointerY = null; });
  canvas.addEventListener('click', function() { start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    pointerY = canvasY(e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    pointerY = canvasY(e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchend', function(e) { e.preventDefault(); pointerY = null; }, { passive: false });

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'steady', label: 'Steady Hand', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'THE CLIENT LEFT', again: 'SPACE or TAP for the next client',
    levelLabel: function (l) { return (l - 1) + ' DESIGNS FINISHED'; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: level, meta: { designs: designsDone, bestAcc: bestAcc, bestCombo: bestCombo, tips: tips } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }

  // ── Linework: the same motif drawn as stencil, as ink, or as a botched job ──
  function motifStyle(state) {
    if (state === 'ink') { ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.setLineDash([]); }
    else if (state === 'botched') { ctx.strokeStyle = 'rgba(170,40,40,0.55)'; ctx.lineWidth = 1.6; ctx.setLineDash([2, 3]); }
    else { ctx.strokeStyle = STENCIL; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }
  function drawMotif(kind, cx, cy, state) {
    motifStyle(state);
    ctx.beginPath();
    if (kind === 'rose') {
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.moveTo(cx + 3, cy); ctx.arc(cx, cy, 3, 0, Math.PI * 1.5);
      for (var i = 0; i < 5; i++) {
        var a = i * Math.PI * 2 / 5 - Math.PI / 2;
        ctx.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
        ctx.quadraticCurveTo(cx + Math.cos(a + 0.6) * 20, cy + Math.sin(a + 0.6) * 20, cx + Math.cos(a + 1.25) * 8, cy + Math.sin(a + 1.25) * 8);
      }
      ctx.moveTo(cx - 6, cy + 14); ctx.quadraticCurveTo(cx - 20, cy + 16, cx - 22, cy + 28);
      ctx.moveTo(cx + 6, cy + 14); ctx.quadraticCurveTo(cx + 20, cy + 16, cx + 22, cy + 28);
    } else if (kind === 'heart') {
      ctx.moveTo(cx, cy + 14);
      ctx.bezierCurveTo(cx - 20, cy - 2, cx - 12, cy - 18, cx, cy - 8);
      ctx.bezierCurveTo(cx + 12, cy - 18, cx + 20, cy - 2, cx, cy + 14);
    } else if (kind === 'dagger') {
      ctx.moveTo(cx - 34, cy - 4); ctx.lineTo(cx + 30, cy - 2); ctx.lineTo(cx + 40, cy); ctx.lineTo(cx + 30, cy + 2); ctx.lineTo(cx - 34, cy + 4); ctx.closePath();
      ctx.moveTo(cx - 36, cy - 12); ctx.lineTo(cx - 32, cy - 12); ctx.lineTo(cx - 32, cy + 12); ctx.lineTo(cx - 36, cy + 12); ctx.closePath();
      ctx.moveTo(cx - 36, cy - 3); ctx.lineTo(cx - 52, cy - 3); ctx.lineTo(cx - 52, cy + 3); ctx.lineTo(cx - 36, cy + 3);
      ctx.moveTo(cx - 52, cy); ctx.arc(cx - 55, cy, 4, 0, Math.PI * 2);
    } else if (kind === 'snake') {
      ctx.moveTo(cx - 40, cy + 10);
      ctx.bezierCurveTo(cx - 30, cy - 22, cx - 10, cy + 26, cx + 4, cy - 2);
      ctx.bezierCurveTo(cx + 14, cy - 20, cx + 26, cy + 4, cx + 30, cy - 8);
      ctx.moveTo(cx + 30, cy - 8); ctx.arc(cx + 34, cy - 10, 5, Math.PI, Math.PI * 2.6);
      ctx.moveTo(cx + 39, cy - 9); ctx.lineTo(cx + 46, cy - 6); ctx.moveTo(cx + 44, cy - 7); ctx.lineTo(cx + 47, cy - 10);
      ctx.moveTo(cx + 33, cy - 11); ctx.arc(cx + 33, cy - 11, 1, 0, Math.PI * 2);
    } else if (kind === 'star') {
      for (var s = 0; s < 10; s++) {
        var r = s % 2 === 0 ? 15 : 6, an = s * Math.PI / 5 - Math.PI / 2;
        if (s === 0) ctx.moveTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); else ctx.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r);
      }
      ctx.closePath();
    } else if (kind === 'anchor') {
      ctx.moveTo(cx, cy - 22); ctx.arc(cx, cy - 22, 4, 0, Math.PI * 2);
      ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy + 16);
      ctx.moveTo(cx - 12, cy - 8); ctx.lineTo(cx + 12, cy - 8);
      ctx.moveTo(cx - 22, cy + 4); ctx.quadraticCurveTo(cx - 8, cy + 24, cx, cy + 16);
      ctx.quadraticCurveTo(cx + 8, cy + 24, cx + 22, cy + 4);
      ctx.moveTo(cx - 22, cy + 4); ctx.lineTo(cx - 26, cy + 10); ctx.moveTo(cx + 22, cy + 4); ctx.lineTo(cx + 26, cy + 10);
    } else {
      // script: a flourish of loops riding the line
      ctx.moveTo(cx - 30, cy + 2);
      ctx.bezierCurveTo(cx - 24, cy - 16, cx - 12, cy - 16, cx - 14, cy - 2);
      ctx.bezierCurveTo(cx - 16, cy + 10, cx - 4, cy + 12, cx, cy);
      ctx.bezierCurveTo(cx + 6, cy - 14, cx + 16, cy - 14, cx + 14, cy);
      ctx.bezierCurveTo(cx + 12, cy + 12, cx + 22, cy + 10, cx + 30, cy - 2);
      ctx.moveTo(cx + 34, cy - 10); ctx.arc(cx + 34, cy - 10, 1.2, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The client, up in the corner, reacting to the work
  function drawFace(x, y, skin) {
    var state = 'calm';
    if (frame - lastLost < 90) state = 'sad';
    else if (flinch && flinch.warnT > 0) state = 'tense';
    else if (flinch && flinch.warnT <= 0 && flinch.t < 12) state = 'pain';
    else if (frame - lastNick < 30) state = 'pain';
    else if (gradeT > 0 && (grade === 'S' || grade === 'A')) state = 'happy';
    ctx.fillStyle = '#2a2230';
    ctx.fillRect(x - 3, y - 3, 34, 34);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(x + 14, y + 15, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1014';
    ctx.beginPath(); ctx.arc(x + 14, y + 8, 12, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(x + 2, y + 6, 4, 8);
    ctx.fillStyle = '#1a1014';
    if (state === 'pain') {
      ctx.fillRect(x + 8, y + 13, 5, 1); ctx.fillRect(x + 15, y + 13, 5, 1);
      ctx.beginPath(); ctx.arc(x + 14, y + 21, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (state === 'tense') {
      ctx.fillRect(x + 9, y + 12, 3, 3); ctx.fillRect(x + 16, y + 12, 3, 3);
      ctx.fillRect(x + 8, y + 8, 5, 1); ctx.fillRect(x + 15, y + 8, 5, 1);
      ctx.fillRect(x + 11, y + 21, 6, 1);
    } else if (state === 'sad') {
      ctx.fillRect(x + 9, y + 14, 2, 2); ctx.fillRect(x + 17, y + 14, 2, 2);
      ctx.fillRect(x + 8, y + 11, 4, 1); ctx.fillRect(x + 16, y + 11, 4, 1);
      ctx.beginPath(); ctx.arc(x + 14, y + 24, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.strokeStyle = '#1a1014'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + 14, y + 25, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (state === 'happy') {
      ctx.fillRect(x + 8, y + 14, 4, 1); ctx.fillRect(x + 16, y + 14, 4, 1);
      ctx.strokeStyle = '#1a1014'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x + 14, y + 18, 5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    } else {
      ctx.fillRect(x + 9, y + 14, 2, 2); ctx.fillRect(x + 17, y + 14, 2, 2);
      ctx.fillRect(x + 11, y + 21, 6, 1);
    }
  }

  function drawSpeech(text) {
    var w = text.length * 5.2 + 12;
    var x = W - 8 - w, y = 40;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.moveTo(x + w - 14, y); ctx.lineTo(x + w - 10, y - 5); ctx.lineTo(x + w - 6, y); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 6, y + 10);
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
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = SKINS[0]; ctx.fillRect(0, 150, W, 120);
    var reach = Math.min(W, t2 * 2.8);
    for (var x2 = 0; x2 < reach; x2 += 3) {
      var lyy = 210 + Math.sin(x2 * 0.02) * 22 + Math.sin(x2 * 0.055) * 9;
      if (Math.floor(x2 / 6) % 2 === 0) { ctx.fillStyle = STENCIL; ctx.fillRect(x2, lyy - 1, 2, 2); }
    }
    drawMotif('rose', 300, 210 + Math.sin(300 * 0.02) * 22 + Math.sin(300 * 0.055) * 9, 'stencil');
    var inkReach = Math.max(0, Math.min(W, (t2 - 34) * 2.8));
    for (var x3 = 0; x3 < inkReach; x3 += 1) {
      var iyy = 210 + Math.sin(x3 * 0.02) * 22 + Math.sin(x3 * 0.055) * 9;
      ctx.fillStyle = INK; ctx.fillRect(x3, iyy - 1.5, 1.6, 3);
    }
    if (inkReach > 100) drawMotif('script', 100, 210 + Math.sin(100 * 0.02) * 22 + Math.sin(100 * 0.055) * 9, 'ink');
    if (inkReach > 0 && inkReach < W) {
      var nyy = 210 + Math.sin(inkReach * 0.02) * 22 + Math.sin(inkReach * 0.055) * 9;
      var vib = (Math.random() - 0.5) * 1.6;
      ctx.fillStyle = '#ccc'; ctx.fillRect(inkReach - 1, nyy - 14 + vib, 2, 12);
      ctx.fillStyle = '#9b59b6'; ctx.fillRect(inkReach - 6, nyy - 34 + vib, 12, 22);
      ctx.fillStyle = PINK; ctx.fillRect(inkReach - 8, nyy - 38 + vib, 4, 6); ctx.fillRect(inkReach + 4, nyy - 38 + vib, 4, 6);
    }
    ctx.globalAlpha = Math.min(1, t2 / 40);
    slam('STEADY HAND', 96, 28, STENCIL);
    ctx.globalAlpha = 1;
    if (t2 > 130) { ctx.fillStyle = PINK; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('EVERY LINE COUNTS', W / 2, 126); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('UP/DOWN, MOUSE or DRAG to keep the needle on the stencil', W / 2, H - 42);
    ctx.fillText('dead center pays triple // stay on it to build STEADY x8', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('BEST: ' + fmtNum(Math.max(best, wall.best())), W / 2, H - 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var skin = SKINS[(level - 1) % SKINS.length];
    var d = design();
    var shx = shake > 0 ? (Math.random() - 0.5) * shake * 0.7 : 0;
    var shy = shake > 0 ? (Math.random() - 0.5) * shake * 0.7 : 0;
    ctx.setTransform(1, 0, 0, 1, shx, shy);

    // Room behind
    ctx.fillStyle = '#14101c';
    ctx.fillRect(-8, -8, W + 16, H + 16);

    // The skin: a rounded limb (lighter down the middle), pores, a few hairs
    var sg = ctx.createLinearGradient(0, 62, 0, 294);
    sg.addColorStop(0, 'rgba(0,0,0,0.22)');
    sg.addColorStop(0.35, 'rgba(255,255,255,0.06)');
    sg.addColorStop(0.65, 'rgba(255,255,255,0.03)');
    sg.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = skin;
    ctx.fillRect(0, 62, W, 232);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 62, W, 232);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (var i = 0; i < 90; i++) {
      var tx2 = ((i * 67 - Math.floor(sx)) % W + W) % W;
      var ty2 = 74 + (i * 41) % 208;
      ctx.fillRect(tx2, ty2, 1 + (i % 2), 1);
    }
    ctx.strokeStyle = 'rgba(40,20,10,0.16)';
    ctx.lineWidth = 1;
    for (var h = 0; h < 14; h++) {
      var hx = ((h * 113 - Math.floor(sx)) % W + W) % W;
      var hy = 80 + (h * 53) % 200;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + 3, hy - 4, hx + 7, hy - 5); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,60,40,0.12)';
    ctx.fillRect((((177 - Math.floor(sx)) % W) + W) % W, 130, 3, 2);
    ctx.fillRect((((313 - Math.floor(sx)) % W) + W) % W, 230, 2, 2);

    // Worked skin goes pink behind the needle, fading as it heals
    for (var x = 0; x < NEEDLE_X; x += 2) {
      var wr = record[Math.floor(sx + x)];
      if (!wr) continue;
      var age = (NEEDLE_X - x) / NEEDLE_X;
      ctx.fillStyle = 'rgba(220,60,60,' + (0.17 - age * 0.11) + ')';
      ctx.fillRect(x, wr.ny - 7, 2, 14);
    }

    // Finished work behind the needle: real ink where clean, nicks where not
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var segOpen = false;
    for (var x = 0; x < NEEDLE_X; x++) {
      var wx = Math.floor(sx + x);
      var r = record[wx];
      if (r && r.good) {
        if (!segOpen || x % 8 === 0) {
          if (segOpen) { ctx.lineTo(x, r.y); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(x, r.y);
          ctx.strokeStyle = INK; ctx.lineWidth = weight(wx);
          segOpen = true;
        } else ctx.lineTo(x, r.y);
      } else {
        if (segOpen) { ctx.stroke(); segOpen = false; }
        if (r) {
          ctx.fillStyle = 'rgba(180,40,40,0.75)';
          ctx.fillRect(x, r.ny - 1, 1.6, 2);
          ctx.fillStyle = 'rgba(120,30,30,0.18)';
          ctx.fillRect(x, r.ny - 4, 1.6, 8);
        }
      }
    }
    if (segOpen) ctx.stroke();
    // A thin highlight along the fresh ink so it reads wet
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    var hlOpen = false;
    for (var x = 0; x < NEEDLE_X; x += 2) {
      var hr = record[Math.floor(sx + x)];
      if (hr && hr.good) { if (!hlOpen) { ctx.moveTo(x, hr.y - 1.2); hlOpen = true; } else ctx.lineTo(x, hr.y - 1.2); }
      else if (hlOpen) { ctx.stroke(); ctx.beginPath(); hlOpen = false; }
    }
    if (hlOpen) ctx.stroke();

    // The linework around the line: stencil ahead, ink or botched behind
    for (var m = 0; m < motifs.length; m++) {
      var mo = motifs[m];
      var mxs = mo.x - sx;
      if (mxs < -70 || mxs > W + 70) continue;
      drawMotif(d.motif, mxs, path(mo.x), mo.state);
    }

    // Stencil ahead of the needle: dashed purple, weighted like the line
    for (var x = NEEDLE_X; x < W; x += 3) {
      if (Math.floor(x / 6) % 2 === 0) {
        var ty = targetAt(sx + x);
        var wgt = weight(sx + x);
        ctx.fillStyle = STENCIL;
        ctx.fillRect(x, ty - wgt / 2, 2, wgt);
      }
    }
    // Tolerance channel hint right at the needle
    var tNow = targetAt(sx + NEEDLE_X);
    ctx.fillStyle = 'rgba(123,47,191,0.18)';
    ctx.fillRect(NEEDLE_X - 3, tNow - tol, 20, tol * 2);
    ctx.fillStyle = 'rgba(123,47,191,0.22)';
    ctx.fillRect(NEEDLE_X - 3, tNow - tol * 0.35, 20, tol * 0.7);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 24);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Power supply on the cart, clip cord swaying down to the machine
    ctx.fillStyle = '#23202c';
    ctx.fillRect(4, 6, 40, 22);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(8, 10, 12, 12);
    ctx.strokeStyle = '#9aa2ae'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(14, 16, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 16); ctx.lineTo(16, 12); ctx.stroke();
    var onAir = record[Math.floor(sx + NEEDLE_X) - 1];
    var inking = onAir && onAir.good;
    ctx.fillStyle = inking ? '#7FFF00' : '#442222';
    ctx.fillRect(26, 12, 4, 4);
    ctx.fillStyle = '#9aa';
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PWR', 25, 25);
    var vib = (Math.random() - 0.5) * (inking ? 2.2 : 1.2);
    ctx.strokeStyle = '#3a3440';
    ctx.beginPath();
    ctx.moveTo(NEEDLE_X - 2, needleY - 30 + vib);
    ctx.quadraticCurveTo(NEEDLE_X - 50 + Math.sin(frame * 0.04) * 8, needleY - 80, 24, 28);
    ctx.stroke();
    // The gloved hand behind the grip
    ctx.fillStyle = '#17171c';
    ctx.beginPath(); ctx.ellipse(NEEDLE_X + 12, needleY - 22 + vib, 12, 9, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(NEEDLE_X + 5, needleY - 12 + vib, 5, 3.5, -0.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(NEEDLE_X - 6, needleY - 14 + vib, 5, 3.2, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.ellipse(NEEDLE_X + 10, needleY - 25 + vib, 6, 3, -0.5, 0, Math.PI * 2); ctx.fill();
    // A real coil machine: steel frame, copper coils, grip taper, needle bar
    ctx.fillStyle = '#2e2e38';
    ctx.fillRect(NEEDLE_X - 7, needleY - 34 + vib, 14, 6);
    ctx.fillRect(NEEDLE_X - 7, needleY - 34 + vib, 5, 16);
    ctx.fillStyle = '#b87333';
    ctx.beginPath(); ctx.arc(NEEDLE_X + 2, needleY - 24 + vib, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(NEEDLE_X + 2, needleY - 15 + vib, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d99a5c';
    ctx.fillRect(NEEDLE_X - 1, needleY - 27 + vib, 3, 1); ctx.fillRect(NEEDLE_X - 1, needleY - 18 + vib, 3, 1);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(NEEDLE_X - 2, needleY - 25 + vib, 8, 1);
    ctx.fillRect(NEEDLE_X - 2, needleY - 16 + vib, 8, 1);
    ctx.fillStyle = '#9aa2ae';
    ctx.fillRect(NEEDLE_X - 6, needleY - 36 + vib, 12, 3);
    ctx.beginPath();
    ctx.moveTo(NEEDLE_X - 3, needleY - 10 + vib);
    ctx.lineTo(NEEDLE_X + 3, needleY - 10 + vib);
    ctx.lineTo(NEEDLE_X + 1.5, needleY - 2);
    ctx.lineTo(NEEDLE_X - 1.5, needleY - 2);
    ctx.fill();
    ctx.fillStyle = inking ? INK : '#cc2222';
    ctx.fillRect(NEEDLE_X - 0.5, needleY - 3, 1.5, 4);
    if (inking && frame % 3 === 0) { ctx.fillStyle = 'rgba(28,20,24,0.7)'; ctx.fillRect(NEEDLE_X + 1, needleY + 1, 1, 1); }

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // The station below: ink pot, towel, and this design's progress
    ctx.fillStyle = '#1c1522';
    ctx.fillRect(0, 294, W, 26);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(20, 297, 12, 13);
    ctx.fillStyle = PINK;
    ctx.fillRect(22, 295, 8, 4);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(44, 299, 22, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(44, 303, 22, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(80, 300, W - 88, 5);
    ctx.fillStyle = PINK;
    ctx.fillRect(80, 300, (W - 88) * Math.min(1, (sx + NEEDLE_X) / pathLen), 5);
    for (var m2 = 0; m2 < motifs.length; m2++) {
      ctx.fillStyle = motifs[m2].state === 'ink' ? LIME : motifs[m2].state === 'botched' ? '#ff6347' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(80 + (W - 88) * (motifs[m2].x / pathLen) - 1, 298, 2, 9);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.min(100, Math.floor((sx + NEEDLE_X) / pathLen * 100)) + '%', W - 8, 314);

    // HUD: score and the steady multiplier on the left
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE ' + fmtNum(score), 54, 14);
    ctx.fillStyle = '#9aa';
    ctx.font = '8px monospace';
    ctx.fillText('BEST ' + fmtNum(Math.max(best, wall.best(), score)), 54, 25);
    ctx.fillStyle = combo > 1 ? YELLOW : 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('STEADY x' + combo, 54, 38);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(54, 42, 64, 3);
    ctx.fillStyle = combo >= 8 ? LIME : YELLOW;
    ctx.fillRect(54, 42, 64 * (combo >= 8 ? 1 : Math.min(1, runCols / 60)), 3);

    // Design name and the precision meter in the middle
    ctx.fillStyle = LIME;
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('DESIGN ' + level + ': ' + d.name, W / 2, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '7px monospace';
    ctx.fillText('PRECISION', W / 2, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W / 2 - 50, 30, 100, 6);
    var pc = Math.max(0, Math.min(1, prec));
    ctx.fillStyle = pc > 0.75 ? LIME : pc > 0.45 ? YELLOW : '#ff6347';
    ctx.fillRect(W / 2 - 50, 30, 100 * pc, 6);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px monospace';
    ctx.fillText(Math.round(pc * 100) + '%', W / 2, 45);

    // The client and their trust, on the right
    drawFace(W - 100, 4, skin);
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = i < trust ? PINK : 'rgba(255,255,255,0.18)';
      var hx2 = W - 12 - i * 14;
      ctx.fillRect(hx2, 8, 4, 4); ctx.fillRect(hx2 + 5, 8, 4, 4);
      ctx.fillRect(hx2, 12, 9, 4); ctx.fillRect(hx2 + 2, 16, 5, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('TRUST', W - 8, 30);
    if (speech && mode === 'play') drawSpeech(speech);

    // Flinch warning
    if (flinch && flinch.warnT > 0 && Math.floor(frame / 5) % 2 === 0) {
      ctx.fillStyle = '#cc2222';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('! FLINCH !', W / 2, 60);
    }

    // Popups: every point event says why
    for (var i = 0; i < popups.length; i++) {
      var pu = popups[i];
      ctx.globalAlpha = Math.min(1, pu.life / 20);
      ctx.fillStyle = pu.color;
      ctx.font = 'bold ' + (pu.big ? 12 : 9) + 'px monospace';
      ctx.textAlign = 'center';
      var px = Math.max(40, Math.min(W - 40, pu.x));
      ctx.fillText(pu.text, px, pu.y);
    }
    ctx.globalAlpha = 1;

    // The grade card after each design
    if (gradeT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, gradeT / 25);
      ctx.fillStyle = 'rgba(10,6,14,0.86)';
      ctx.fillRect(W / 2 - 110, 62, 220, 34 + gradeLines.length * 13);
      ctx.strokeStyle = grade === 'S' ? YELLOW : grade === 'A' ? LIME : grade === 'B' ? CYAN : '#9aa';
      ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 110, 62, 220, 34 + gradeLines.length * 13);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(grade, W / 2 - 98, 88);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(grade === 'S' ? 'FLAWLESS' : grade === 'A' ? 'CLEAN WORK' : grade === 'B' ? 'SOLID' : grade === 'C' ? 'ROUGH' : 'SCRATCHER', W / 2 - 74, 80);
      ctx.fillStyle = '#9aa';
      ctx.font = '8px monospace';
      ctx.fillText('DESIGN ' + (level - 1) + ' DONE', W / 2 - 74, 91);
      for (var g = 0; g < gradeLines.length; g++) {
        ctx.fillStyle = gradeLines[g].c;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(gradeLines[g].t, W / 2, 106 + g * 13);
      }
      ctx.globalAlpha = 1;
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
    if (!window.skateRunning) { rafId = null; setBuzz(0); return; }
    if (!lastT) lastT = t;
    acc += Math.min(100, t - lastT);
    lastT = t;
    try {
    while (acc >= 16.67) {
      if (mode === 'play') update();
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > 520) introT = 70; }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-steady', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
