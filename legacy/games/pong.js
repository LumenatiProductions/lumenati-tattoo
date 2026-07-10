(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 400, H = 320;

  // SFX
  var sfxCtx;
  function getSfx() { if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); return sfxCtx; }
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

  var PINK = '#FF1493', CYAN = '#00FFFF', YELLOW = '#FFD700', LIME = '#7FFF00';
  var WIN_AT = 5, PW = 8, PH = 56;

  // The shop ladder: beat one to face the next. Speed up, wobble down.
  var OPPONENTS = [
    { name: 'SCRATCHER', v: 2.5, wob: 14 },
    { name: 'APPRENTICE', v: 3.0, wob: 11 },
    { name: 'RESIDENT', v: 3.5, wob: 8 },
    { name: 'SHOP BOSS', v: 4.0, wob: 5 },
    { name: 'THE MACHINE', v: 4.7, wob: 1.5 },
  ];

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var frame, you, cpu, ball, serveT, rally, trail, won, tier, bannerT, bannerText;
  var keyU = false, keyD = false;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-pong') || '0', 10) || 0; } catch(e) {}
  function saveBest(beaten) {
    if (beaten > best) { best = beaten; try { localStorage.setItem('lumenati-arcade-pong', String(best)); } catch(e) {} }
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    frame = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0; rally = 0; won = false;
    tier = 0; bannerT = 0; bannerText = '';
    you = { y: H / 2 - PH / 2, score: 0 };
    cpu = { y: H / 2 - PH / 2, score: 0 };
    trail = [];
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '0';
    serve(Math.random() < 0.5 ? 1 : -1);
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'W/S, mouse or drag // first to 5';
    var statA = document.getElementById('jd-stat-a');
    if (statA) statA.textContent = 'You';
    var statB = document.getElementById('jd-stat-b');
    if (statB) statB.textContent = 'CPU';
    window.skateRunning = true;
    startLoop();
  }

  function serve(towards) {
    var a = (Math.random() * 0.6 - 0.3);
    var sp = 4;
    ball = { x: W / 2, y: H / 2, vx: towards * Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5 };
    serveT = 45;
    rally = 0;
    trail = [];
  }

  function point(scorer) {
    if (rally >= 8) sayCallout('pong-c1');
    scorer.score++;
    document.getElementById('jd-br-score').textContent = you.score;
    document.getElementById('jd-br-lives').textContent = cpu.score;
    if (scorer === you) sfxScore(); else sfxLose();
    if (you.score >= WIN_AT) {
      if (tier >= OPPONENTS.length - 1) {
        // Cleared the whole shop
        won = true;
        say('pong-c3', 400);
        enterBoard(OPPONENTS.length);
        saveBest(OPPONENTS.length);
        sfxWin();
        return;
      }
      bannerT = 110;
      bannerText = OPPONENTS[tier].name + ' TAPPED OUT';
      sayCallout('pong-c2');
      tier++;
      you.score = 0; cpu.score = 0;
      document.getElementById('jd-br-score').textContent = '0';
      document.getElementById('jd-br-lives').textContent = '0';
      sfxWin();
      serve(1);
      return;
    }
    if (cpu.score >= WIN_AT) {
      won = false;
      enterBoard(tier);
      saveBest(tier);
      deathJingle();
      return;
    }
    serve(scorer === you ? -1 : 1);
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;

    // You
    if (keyU) you.y -= 5;
    if (keyD) you.y += 5;
    you.y = Math.max(18, Math.min(H - PH - 4, you.y));

    // CPU: the current opponent chases with their own speed and wobble
    var opp = OPPONENTS[tier];
    var target = ball.vx > 0 ? ball.y - PH / 2 : H / 2 - PH / 2;
    target += Math.sin(frame * 0.05) * opp.wob;
    var maxV = opp.v + Math.min(1.2, rally * 0.08);
    var dv = target - cpu.y;
    cpu.y += Math.max(-maxV, Math.min(maxV, dv));
    cpu.y = Math.max(18, Math.min(H - PH - 4, cpu.y));

    if (bannerT > 0) bannerT--;
    if (serveT > 0) { serveT--; return; }

    ball.x += ball.vx;
    ball.y += ball.vy;
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > 6) trail.shift();

    // Walls
    if (ball.y < ball.r + 16) { ball.y = ball.r + 16; ball.vy = Math.abs(ball.vy); sfxWall(); }
    if (ball.y > H - ball.r - 2) { ball.y = H - ball.r - 2; ball.vy = -Math.abs(ball.vy); sfxWall(); }

    // Your paddle (left)
    var yx = 16;
    if (ball.vx < 0 && ball.x - ball.r < yx + PW && ball.x - ball.r > yx - 6 &&
        ball.y > you.y - ball.r && ball.y < you.y + PH + ball.r) {
      bounce(you.y);
      ball.x = yx + PW + ball.r;
      ball.vx = Math.abs(ball.vx);
    }
    // CPU paddle (right)
    var cx = W - 16 - PW;
    if (ball.vx > 0 && ball.x + ball.r > cx && ball.x + ball.r < cx + PW + 6 &&
        ball.y > cpu.y - ball.r && ball.y < cpu.y + PH + ball.r) {
      bounce(cpu.y);
      ball.x = cx - ball.r;
      ball.vx = -Math.abs(ball.vx);
    }

    function bounce(py) {
      var rel = (ball.y - (py + PH / 2)) / (PH / 2);
      rel = Math.max(-1, Math.min(1, rel));
      var sp = Math.min(9, Math.hypot(ball.vx, ball.vy) * 1.05 + 0.1);
      var ang = rel * (Math.PI / 3.4);
      ball.vx = Math.cos(ang) * sp * (ball.vx > 0 ? 1 : -1);
      ball.vy = Math.sin(ang) * sp;
      rally++;
      sfxPaddle();
    }

    // Out
    if (ball.x < -10) point(cpu);
    else if (ball.x > W + 10) point(you);
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { init(); mode = 'play'; return; }
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

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-pong-board';
  var board = [];
  try { board = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]') || []; } catch (e) {}
  var initials = ['A', 'A', 'A'];
  try {
    var lastN = localStorage.getItem('lumenati-arcade-initials');
    if (lastN && lastN.length === 3) initials = lastN.split('');
  } catch (e) {}
  var initSlot = 0, boardIdx = -1, finalScore = 0;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function fmtBoard(v) { return v + '/5 BEAT'; }

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
    ctx.fillText(won ? 'SHOP CHAMPION' : OPPONENTS[tier].name + ' WINS', W / 2, 58);
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
    ctx.fillText('SPACE or TAP to start over', W / 2, 286);
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
    ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, W, H);
    for (var yy2 = 20; yy2 < H; yy2 += 16) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(W / 2 - 1, yy2, 2, 8); }
    var period = 110;
    var ph = (t2 % period) / period;
    var bxp = 30 + (ph < 0.5 ? ph * 2 : (1 - ph) * 2) * (W - 60);
    var byp = 200 + Math.sin(t2 * 0.05) * 30;
    ctx.fillStyle = PINK; ctx.fillRect(14, byp - 28, 8, 56);
    ctx.fillStyle = CYAN; ctx.fillRect(W - 22, byp - 28, 8, 56);
    for (var i = 1; i < 6; i++) {
      ctx.globalAlpha = 0.4 - i * 0.06;
      ctx.fillStyle = PINK;
      ctx.fillRect(bxp - (ph < 0.5 ? i * 7 : -i * 7), byp - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = PINK;
    ctx.beginPath(); ctx.arc(bxp, byp, 6, 0, Math.PI * 2); ctx.fill();
    var flash = (t2 % period) < 8 || (t2 % period) > period / 2 - 4 && (t2 % period) < period / 2 + 4;
    slam('NEEDLE PONG', 110, 28, flash ? '#fff' : PINK);
    if (t2 > 130) { ctx.fillStyle = CYAN; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('RUN THE SHOP LADDER', W / 2, 140); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('W/S, ARROWS, MOUSE or DRAG to move // first to 5 wins the match', W / 2, H - 42);
    ctx.fillText('the ladder: Scratcher, Apprentice, Resident, The Machine', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('BEST: ' + (best + '/5 BEAT'), W / 2, H - 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    // Court
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(0, 14, W, 2);
    ctx.fillRect(0, H - 2, W, 2);
    for (var y = 20; y < H; y += 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(W / 2 - 1, y, 2, 8);
    }

    // Big scores
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,20,147,0.5)';
    ctx.fillText(you.score, W / 2 - 50, 52);
    ctx.fillStyle = 'rgba(0,255,255,0.5)';
    ctx.fillText(cpu.score, W / 2 + 50, 52);

    // Paddles
    ctx.fillStyle = PINK;
    ctx.fillRect(16, you.y, PW, PH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(16, you.y, 2, PH);
    ctx.fillStyle = CYAN;
    ctx.fillRect(W - 16 - PW, cpu.y, PW, PH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(W - 16 - 2, cpu.y, 2, PH);

    // Ball trail + ink-drop ball
    for (var i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (i / trail.length) * 0.4;
      ctx.fillStyle = PINK;
      ctx.fillRect(trail[i].x - 2, trail[i].y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    if (serveT === 0 || Math.floor(frame / 6) % 2 === 0) {
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(ball.x - 1, ball.y - 2, 2, 2);
    }

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FIRST TO ' + WIN_AT, 8, 11);
    ctx.textAlign = 'center';
    ctx.fillStyle = CYAN;
    ctx.fillText('VS ' + OPPONENTS[tier].name + ' (' + (tier + 1) + '/' + OPPONENTS.length + ')', W / 2, 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + best + '/' + OPPONENTS.length + ' BEAT', W - 8, 11);
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 44);
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = CYAN;
      ctx.fillText('NEXT UP: ' + OPPONENTS[tier].name, W / 2, H / 2 - 26);
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
    while (acc >= 16.67) {
      if (mode === 'play') update();
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > 285) introT = 70; }
      acc -= 16.67;
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  var obs = new MutationObserver(function() {
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-pong', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
