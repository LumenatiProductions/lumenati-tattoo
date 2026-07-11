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
  var STENCIL = '#7b2fbf'; // stencils are purple, always
  var SKINS = ['#f0c8a0', '#d9a276', '#b97a4e', '#8d5a3b', '#6b4128'];
  var NAMES = ['SIMPLE SCRIPT', 'WAVY BANNER', 'FINE LINE', 'FREEHAND CURVES', 'THE SHAKY CLIENT'];
  var NEEDLE_X = 120;

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, trust, level, frame;
  var path, pathLen, sx, speed, tol, needleY, pointerY, keyU, keyD;
  var record, offStreak, combo, comboT, grace;
  var flinch; // { warnT, t, dur, amp } | null
  var nextFlinch, bannerT, bannerText, particles, doneAcc;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-steady') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-steady', String(best)); } catch(e) {} }
  }

  function makePath(lvl) {
    var a1 = 16 + lvl * 5, f1 = 0.006 + lvl * 0.0011;
    var a2 = 7 + lvl * 2.5, f2 = 0.018 + lvl * 0.0022;
    var p1 = Math.random() * 6.28, p2 = Math.random() * 6.28;
    return function(x) {
      return 168 + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * a2;
    };
  }

  function startDesign() {
    path = makePath(level);
    pathLen = 2400 + level * 400;
    sx = 0;
    speed = 1.5 + level * 0.22;
    tol = Math.max(7, 13 - level);
    record = [];
    offStreak = 0;
    nextFlinch = 300 + Math.random() * 240;
    flinch = null;
    needleY = path(NEEDLE_X);
    pointerY = null;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; trust = 3; level = 1; frame = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    combo = 1; comboT = 0; grace = 0; bannerT = 0; bannerText = ''; doneAcc = null;
    particles = []; keyU = false; keyD = false;
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

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        life: 14 + Math.random() * 12,
        color: color,
        size: 1 + Math.random() * 2
      });
    }
  }

  // The stencil target at world x, including any flinch shove
  function targetAt(wx) {
    var y = path(wx);
    if (flinch && flinch.warnT <= 0) {
      var p = flinch.t / flinch.dur;
      y += Math.sin(p * Math.PI) * flinch.amp;
    }
    return y;
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (bannerT > 0) bannerT--;
    if (comboT > 0) { comboT--; if (comboT === 0) combo = 1; }
    if (grace > 0) grace--;

    // Needle control: keys nudge, pointer pulls
    if (keyU) needleY -= 3.4;
    if (keyD) needleY += 3.4;
    if (pointerY !== null) needleY += (pointerY - needleY) * 0.45;
    needleY = Math.max(70, Math.min(285, needleY));

    // Flinch clock
    if (!flinch) {
      nextFlinch--;
      if (nextFlinch <= 0) {
        flinch = { warnT: 45, t: 0, dur: 55 + Math.random() * 25, amp: (Math.random() < 0.5 ? -1 : 1) * (15 + level * 4) };
        sfxFlinchWarn();
      }
    } else if (flinch.warnT > 0) {
      flinch.warnT--;
    } else {
      flinch.t++;
      if (flinch.t >= flinch.dur) {
        flinch = null;
        nextFlinch = Math.max(140, 340 - level * 30) + Math.random() * 240;
      }
    }

    var onNow = record[Math.floor(sx + NEEDLE_X) - 1];
    setBuzz(mode === 'play' && onNow && onNow.good ? 0.028 : 0);

    // Advance the needle along the design, judging every column crossed
    var newSx = sx + speed;
    for (var wx = Math.ceil(sx + NEEDLE_X); wx < newSx + NEEDLE_X; wx++) {
      var ty = targetAt(wx);
      var good = Math.abs(needleY - ty) <= tol;
      record[wx] = { y: good ? needleY : ty, good: good, ny: needleY };
      if (good) {
        offStreak = 0;
        if (wx % 6 === 0) {
          score += combo;
          document.getElementById('jd-br-score').textContent = score;
          spawnParticles(NEEDLE_X, needleY + 4, '#1a1a1a', 1);
        }
        if (wx % 90 === 0 && combo < 5) { combo++; comboT = 999; }
        comboT = 240;
      } else {
        offStreak++;
        if (offStreak === 1) spawnParticles(NEEDLE_X, needleY, '#cc2222', 3);
        if (offStreak > 50 && grace === 0) {
          trust--;
          document.getElementById('jd-br-lives').textContent = trust;
          sfxWince();
          combo = 1; comboT = 0;
          grace = 120;
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

    // Design finished: grade the work
    if (sx + NEEDLE_X >= pathLen) {
      var goodCount = 0, total = 0;
      for (var i = NEEDLE_X; i < pathLen; i++) {
        if (record[i]) { total++; if (record[i].good) goodCount++; }
      }
      var acc = total ? Math.round(goodCount / total * 100) : 0;
      doneAcc = acc;
      score += acc * level;
      document.getElementById('jd-br-score').textContent = score;
      bannerT = 120;
      bannerText = acc >= 90 ? 'CLEAN WORK: ' + acc + '%' : acc >= 70 ? 'SOLID: ' + acc + '%' : 'ROUGH: ' + acc + '%';
      if (acc >= 70) sayCallout(acc >= 90 ? 'steady-c2' : 'steady-c1');
      if (acc >= 90 && trust < 3) {
        trust++;
        document.getElementById('jd-br-lives').textContent = trust;
      }
      sfxDone();
      level++;
      startDesign();
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x -= speed; p.y += p.vy; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { init(); mode = 'play'; return; }
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

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-steady-board';
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
    ctx.fillText('THE CLIENT LEFT', W / 2, 58);
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
    ctx.fillText('SPACE or TAP for the next client', W / 2, 286);
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
    ctx.fillStyle = '#14101c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = SKINS[0]; ctx.fillRect(0, 150, W, 120);
    var reach = Math.min(W, t2 * 2.8);
    for (var x2 = 0; x2 < reach; x2 += 3) {
      var lyy = 210 + Math.sin(x2 * 0.02) * 22 + Math.sin(x2 * 0.055) * 9;
      if (Math.floor(x2 / 6) % 2 === 0) { ctx.fillStyle = STENCIL; ctx.fillRect(x2, lyy - 1, 2, 2); }
    }
    var inkReach = Math.max(0, Math.min(W, (t2 - 34) * 2.8));
    for (var x3 = 0; x3 < inkReach; x3 += 1) {
      var iyy = 210 + Math.sin(x3 * 0.02) * 22 + Math.sin(x3 * 0.055) * 9;
      ctx.fillStyle = '#1c1418'; ctx.fillRect(x3, iyy - 1.5, 1.6, 3);
    }
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
    ctx.fillText('slipping costs client trust // 90%+ clean work wins it back', W / 2, H - 29);
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
    var skin = SKINS[(level - 1) % SKINS.length];

    // Room behind
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, W, H);

    // The skin band, with living texture
    ctx.fillStyle = skin;
    ctx.fillRect(0, 62, W, 232);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (var i = 0; i < 70; i++) {
      var tx2 = ((i * 67 + Math.floor(sx / 3)) % W + W) % W;
      var ty2 = 74 + (i * 41) % 208;
      ctx.fillRect(tx2, ty2, 1 + (i % 2), 1);
    }
    ctx.fillStyle = 'rgba(120,60,40,0.12)';
    ctx.fillRect(((177 + Math.floor(sx / 3)) % W), 130, 3, 2);
    ctx.fillRect(((313 + Math.floor(sx / 3)) % W), 230, 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 62, W, 8);
    ctx.fillRect(0, 286, W, 8);
    // The station below: ink pot and towels
    ctx.fillStyle = '#1c1522';
    ctx.fillRect(0, 294, W, 26);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(20, 298, 12, 14);
    ctx.fillStyle = PINK;
    ctx.fillRect(22, 296, 8, 4);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(44, 300, 22, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(44, 304, 22, 1);

    // Finished work behind the needle: ink where clean, red nicks where not
    for (var x = 0; x < NEEDLE_X; x++) {
      var wx = Math.floor(sx + x);
      var r = record[wx];
      if (!r) continue;
      if (r.good) {
        ctx.fillStyle = '#1c1418';
        ctx.fillRect(x, r.y - 1.5, 1.6, 3);
      } else {
        ctx.fillStyle = 'rgba(180,40,40,0.75)';
        ctx.fillRect(x, r.ny - 1, 1.6, 2);
      }
    }

    // Stencil ahead of the needle: dashed purple
    for (var x = NEEDLE_X; x < W; x += 3) {
      if (Math.floor((x + frame * 0) / 6) % 2 === 0) {
        var ty = targetAt(sx + x);
        ctx.fillStyle = STENCIL;
        ctx.fillRect(x, ty - 1, 2, 2);
      }
    }
    // Tolerance channel hint right at the needle
    var tNow = targetAt(sx + NEEDLE_X);
    ctx.fillStyle = 'rgba(123,47,191,0.18)';
    ctx.fillRect(NEEDLE_X - 3, tNow - tol, 20, tol * 2);

    // Flinch warning
    if (flinch && flinch.warnT > 0 && Math.floor(frame / 5) % 2 === 0) {
      ctx.fillStyle = '#cc2222';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('! FLINCH !', W / 2, 52);
    }

    // Power supply on the cart, clip cord swaying down to the machine
    ctx.fillStyle = '#23202c';
    ctx.fillRect(4, 6, 40, 22);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(8, 10, 12, 12);
    ctx.strokeStyle = '#9aa2ae';
    ctx.beginPath(); ctx.arc(14, 16, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 16); ctx.lineTo(16, 12); ctx.stroke();
    var onAir = record[Math.floor(sx + NEEDLE_X) - 1];
    ctx.fillStyle = onAir && onAir.good ? '#7FFF00' : '#442222';
    ctx.fillRect(26, 12, 4, 4);
    ctx.fillStyle = '#9aa';
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PWR', 25, 25);
    var vib = (Math.random() - 0.5) * 1.6;
    ctx.strokeStyle = '#3a3440';
    ctx.beginPath();
    ctx.moveTo(NEEDLE_X - 2, needleY - 30 + vib);
    ctx.quadraticCurveTo(NEEDLE_X - 50 + Math.sin(frame * 0.04) * 8, needleY - 80, 24, 28);
    ctx.stroke();
    var on = record[Math.floor(sx + NEEDLE_X) - 1];
    var inking = on && on.good;
    // A real coil machine: steel frame, copper coils, grip taper, needle bar
    ctx.fillStyle = '#2e2e38';
    ctx.fillRect(NEEDLE_X - 7, needleY - 34 + vib, 14, 6);
    ctx.fillRect(NEEDLE_X - 7, needleY - 34 + vib, 5, 16);
    ctx.fillStyle = '#b87333';
    ctx.beginPath(); ctx.arc(NEEDLE_X + 2, needleY - 24 + vib, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(NEEDLE_X + 2, needleY - 15 + vib, 5, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = inking ? '#1c1418' : '#cc2222';
    ctx.fillRect(NEEDLE_X - 0.5, needleY - 3, 1.5, 4);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.life / 24;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Progress bar for this design
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(8, 300, W - 16, 5);
    ctx.fillStyle = PINK;
    ctx.fillRect(8, 300, (W - 16) * Math.min(1, (sx + NEEDLE_X) / pathLen), 5);

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 8, 26);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'center';
    ctx.fillText('DESIGN ' + level + ': ' + NAMES[(level - 1) % NAMES.length], W / 2, 14);
    // Trust hearts
    ctx.textAlign = 'right';
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = i < trust ? PINK : 'rgba(255,255,255,0.18)';
      var hx = W - 12 - i * 14;
      ctx.fillRect(hx, 8, 4, 4); ctx.fillRect(hx + 5, 8, 4, 4);
      ctx.fillRect(hx, 12, 9, 4); ctx.fillRect(hx + 2, 16, 5, 3);
    }
    if (combo > 1 && comboT > 0) {
      ctx.fillStyle = YELLOW;
      ctx.textAlign = 'right';
      ctx.fillText('STEADY x' + combo, W - 8, 34);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = doneAcc !== null && doneAcc >= 90 ? LIME : YELLOW;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, 46);
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
    if (!window.skateRunning) { rafId = null; setBuzz(0); return; }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-steady', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
