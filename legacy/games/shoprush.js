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
  function sfxBell() { playSfx(1568, 0.22, 'sine', 0.16); setTimeout(function(){playSfx(1319, 0.3, 'sine', 0.12);}, 110); }
  // Shop ambience: machines hum while chairs are busy, plus a soft murmur
  var humOsc = null, humGain = null, murmurSrc = null, murmurGain = null;
  function setAmbience(busyCount, crowd) {
    try {
      var c = getSfx();
      if (!humOsc) {
        humOsc = c.createOscillator();
        humGain = c.createGain();
        humOsc.type = 'sawtooth';
        humOsc.frequency.value = 62;
        humGain.gain.value = 0;
        humOsc.connect(humGain);
        humGain.connect(c.destination);
        humOsc.start();
        var len = c.sampleRate * 2;
        var buf = c.createBuffer(1, len, c.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
        murmurSrc = c.createBufferSource();
        murmurSrc.buffer = buf;
        murmurSrc.loop = true;
        var lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 340;
        murmurGain = c.createGain();
        murmurGain.gain.value = 0;
        murmurSrc.connect(lp);
        lp.connect(murmurGain);
        murmurGain.connect(c.destination);
        murmurSrc.start();
      }
      humGain.gain.setTargetAtTime(Math.min(0.022, busyCount * 0.009), c.currentTime, 0.15);
      murmurGain.gain.setTargetAtTime(Math.min(0.016, crowd * 0.005), c.currentTime, 0.3);
    } catch (e) {}
  }
  function sfxSeat() { playSfx(600, 0.08, 'square', 0.1); setTimeout(function(){playSfx(800, 0.1, 'square', 0.1);}, 70); }
  function sfxCash() { playSfx(900, 0.06, 'square', 0.11); setTimeout(function(){playSfx(1200, 0.06, 'square', 0.11);}, 60); setTimeout(function(){playSfx(1500, 0.1, 'square', 0.11);}, 120); }
  function sfxStorm() { playSfx(240, 0.2, 'sawtooth', 0.14); setTimeout(function(){playSfx(160, 0.28, 'sawtooth', 0.14);}, 160); }
  function sfxDay() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
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

  // ── This game's own chiptune: bustling front-of-house bounce ──
  var SONGS = [
    { root: 155.56, bass: [0,0,7,0, 5,5,9,5, 0,0,7,0, 10,9,7,5],      lead: [12,-1,16,-1, 17,16,-1,12, 16,-1,19,-1, 21,19,16,12] },
    { root: 164.81, bass: [0,-1,0,7, 5,-1,5,9, 0,-1,0,7, 9,-1,7,5],    lead: [16,19,-1,16, 12,-1,17,-1, 16,19,-1,21, 24,21,19,16] },
  ];
  var MENU_SONG = { root: 155.56, bass: [0,7,0,7, 5,9,5,9, 0,7,0,7, 10,-1,9,7], lead: [16,-1,12,16, 19,-1,16,-1, 21,-1,19,16, -1,17,16,12] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 11 : Math.max(9, 15 - day);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(day - 1) % SONGS.length];
    var b = song.bass[musicStep];
    if (b >= 0) playSfx(song.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.045);
    var l = song.lead[musicStep];
    if (l >= 0) playSfx(song.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.026);
    if (musicStep % 4 === 0) playSfx(65, 0.08, 'sawtooth', 0.04);
    if (musicStep % 8 === 4) playSfx(210, 0.04, 'sawtooth', 0.026);
    if (musicStep % 4 === 2) playSfx(2400, 0.012, 'square', 0.01);
  }
  function deathJingle() {
    jingleT = 110;
    var seq = [[392, 0], [370, 150], [330, 300], [294, 450], [262, 620], [196, 830], [131, 1120]];
    for (var i = 0; i < seq.length; i++) (function(n, d, last) {
      setTimeout(function() { playSfx(n, last ? 0.6 : 0.18, 'square', 0.085); }, d);
    })(seq[i][0], seq[i][1], i === seq.length - 1);
  }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF';
  var SKINS = ['#f0c8a0', '#d9a276', '#b97a4e', '#8d5a3b', '#6b4128'];
  var SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#00bcd4'];
  var HAIRS = ['#222', '#5b3b1a', '#FF1493', '#e8e4d8', '#1c6b4a'];

  var DOOR = { x: 30, y: 44 };
  var BENCH = [{ x: 46, y: 110 }, { x: 46, y: 152 }, { x: 46, y: 194 }, { x: 46, y: 236 }];
  var CHAIRS = [{ x: 322, y: 92 }, { x: 322, y: 172 }, { x: 322, y: 252 }];

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, hearts, day, frame, served, servedTarget;
  var runner, clients, chairs, spawnT, bannerT, bannerText, particles;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-shoprush') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-shoprush', String(best)); } catch(e) {} }
  }

  function spawnEvery() { return Math.max(220, 460 - day * 40); }
  function patienceMax() { return Math.max(560, 940 - day * 60); }
  function workTime() { return 480 + day * 50 + Math.random() * 240; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; hearts = 3; day = 1; frame = 0; served = 0; servedTarget = 5;
    mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0; bannerT = 0; bannerText = ''; particles = [];
    runner = { x: 200, y: 170, tx: null, ty: null, kx: 0, ky: 0, lead: null };
    clients = [];
    chairs = CHAIRS.map(function(c) { return { x: c.x, y: c.y, state: 'free', t: 0, client: null }; });
    spawnT = 90;
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Tap to run there // seat, then collect' : 'Arrows to run // seat, then collect';
    var statA = document.getElementById('jd-stat-a');
    if (statA) statA.textContent = 'Cash';
    var statB = document.getElementById('jd-stat-b');
    if (statB) statB.textContent = 'Rep';
    window.skateRunning = true;
    startLoop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2 - 0.5,
        life: 18 + Math.random() * 12,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
  }

  function freeBenchSeat() {
    for (var i = 0; i < BENCH.length; i++) {
      var taken = false;
      for (var j = 0; j < clients.length; j++) {
        if (clients[j].seat === i && (clients[j].state === 'walkin' || clients[j].state === 'waiting')) taken = true;
      }
      if (!taken) return i;
    }
    return -1;
  }

  function near(ax, ay, bx, by, d) {
    return Math.abs(ax - bx) < d && Math.abs(ay - by) < d;
  }

  function loseHeart() {
    hearts--;
    document.getElementById('jd-br-lives').textContent = hearts;
    sfxStorm();
    if (hearts <= 0) {
      setAmbience(0, 0);
      enterBoard(score);
      saveBest();
      deathJingle();
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (bannerT > 0) bannerT--;
    var busyN = 0;
    for (var i = 0; i < chairs.length; i++) if (chairs[i].state === 'busy') busyN++;
    setAmbience(busyN, clients.length);

    // Runner: keys beat taps
    if (runner.kx !== 0 || runner.ky !== 0) {
      runner.x += runner.kx * 2.6;
      runner.y += runner.ky * 2.6;
      runner.tx = null; runner.ty = null;
    } else if (runner.tx !== null) {
      var dx = runner.tx - runner.x, dy = runner.ty - runner.y;
      var d = Math.hypot(dx, dy);
      if (d < 3) { runner.tx = null; runner.ty = null; }
      else { runner.x += dx / d * 2.6; runner.y += dy / d * 2.6; }
    }
    runner.x = Math.max(16, Math.min(W - 16, runner.x));
    runner.y = Math.max(60, Math.min(H - 26, runner.y));

    // Spawning
    spawnT--;
    if (spawnT <= 0) {
      var seat = freeBenchSeat();
      if (seat !== -1) {
        clients.push({
          x: DOOR.x, y: DOOR.y, seat: seat, state: 'walkin',
          patience: patienceMax(), pmax: patienceMax(),
          skin: SKINS[Math.floor(Math.random() * SKINS.length)],
          shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
          hair: HAIRS[Math.floor(Math.random() * HAIRS.length)],
        });
        sfxBell();
        spawnT = spawnEvery() + Math.random() * 120;
      } else {
        spawnT = 60;
      }
    }

    // Clients
    for (var i = clients.length - 1; i >= 0; i--) {
      var c = clients[i];
      if (c.state === 'walkin') {
        var b = BENCH[c.seat];
        var dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
        if (d < 2) { c.state = 'waiting'; }
        else { c.x += dx / d * 1.4; c.y += dy / d * 1.4; }
      } else if (c.state === 'waiting') {
        c.patience--;
        if (c.patience <= 0) {
          c.state = 'storming';
        } else if (!runner.lead && near(runner.x, runner.y, c.x, c.y, 20)) {
          runner.lead = c;
          c.state = 'led';
          sfxSeat();
        }
      } else if (c.state === 'led') {
        // trail the runner
        var dx = runner.x - 14 - c.x, dy = runner.y - c.y, d = Math.hypot(dx, dy);
        if (d > 16) { c.x += dx / d * 2.4; c.y += dy / d * 2.4; }
      } else if (c.state === 'storming') {
        var dx = DOOR.x - c.x, dy = DOOR.y - c.y, d = Math.hypot(dx, dy);
        if (d < 4) {
          clients.splice(i, 1);
          loseHeart();
          if (mode !== 'play') return;
        } else { c.x += dx / d * 2.2; c.y += dy / d * 2.2; }
      }
    }

    // Chairs
    for (var i = 0; i < chairs.length; i++) {
      var ch = chairs[i];
      if (ch.state === 'free' && runner.lead && near(runner.x, runner.y, ch.x - 24, ch.y, 24)) {
        var c = runner.lead;
        runner.lead = null;
        c.state = 'inchair';
        c.x = ch.x; c.y = ch.y;
        ch.state = 'busy';
        ch.t = workTime();
        ch.client = c;
        ch.tip = Math.ceil(c.patience / c.pmax * 20);
        sfxSeat();
      } else if (ch.state === 'busy') {
        ch.t--;
        if (ch.t <= 0) { ch.state = 'done'; sfxBell(); }
      } else if (ch.state === 'done' && near(runner.x, runner.y, ch.x - 24, ch.y, 24)) {
        var pay = 30 + ch.tip;
        score += pay;
        if (ch.tip >= 14) sayCallout('shoprush-c1');
        document.getElementById('jd-br-score').textContent = score;
        spawnParticles(ch.x - 10, ch.y - 10, YELLOW, 10);
        sfxCash();
        var idx = clients.indexOf(ch.client);
        if (idx !== -1) clients.splice(idx, 1);
        ch.client = null;
        ch.state = 'free';
        served++;
        if (served >= servedTarget) {
          day++;
          served = 0;
          servedTarget = 4 + day;
          bannerT = 110;
          bannerText = 'DAY ' + day;
          say(day % 2 === 0 ? 'shoprush-c2' : 'shoprush-c3', 300);
          sfxDay();
        }
      }
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  var KEYS = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0], KeyW: [0,-1], KeyS: [0,1], KeyA: [-1,0], KeyD: [1,0] };
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    var k = KEYS[e.code];
    if (k) {
      e.preventDefault();
      start();
      if (k[0] !== 0) runner.kx = k[0];
      if (k[1] !== 0) runner.ky = k[1];
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) start();
    }
  });
  document.addEventListener('keyup', function(e) {
    var k = KEYS[e.code];
    if (!k) return;
    if (k[0] !== 0 && runner.kx === k[0]) runner.kx = 0;
    if (k[1] !== 0 && runner.ky === k[1]) runner.ky = 0;
  });
  function canvasXY(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return [(cx - r.left) * (W / r.width), (cy - r.top) * (H / r.height)];
  }
  canvas.addEventListener('click', function(e) {
    if (mode !== 'play') { start(); return; }
    var p = canvasXY(e.clientX, e.clientY);
    runner.tx = p[0]; runner.ty = p[1];
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode !== 'play') { start(); return; }
    var p = canvasXY(e.touches[0].clientX, e.touches[0].clientY);
    runner.tx = p[0]; runner.ty = p[1];
  }, { passive: false });

  function drawPerson(x, y, skin, shirt, hair, seated, moving) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 13, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    var bob = moving ? Math.abs(Math.sin(frame * 0.32 + x * 0.13)) * 2 : 0;
    y -= bob;
    ctx.fillStyle = hair;
    ctx.fillRect(x - 5, y - 16, 10, 4);
    ctx.fillStyle = skin;
    ctx.fillRect(x - 4, y - 13, 8, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - 1, y - 10, 2, 1);
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 6, y - 5, 12, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x - 6, y - 5, 12, 2);
    if (!seated) {
      ctx.fillStyle = '#223';
      var step2 = moving ? Math.sin(frame * 0.32 + x * 0.13) * 2 : 0;
      ctx.fillRect(x - 5, y + 6 + Math.max(0, step2), 4, 6 - Math.max(0, step2));
      ctx.fillRect(x + 1, y + 6 + Math.max(0, -step2), 4, 6 - Math.max(0, -step2));
    }
  }

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-shoprush-board';
  var board = [];
  try { board = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]') || []; } catch (e) {}
  var initials = ['A', 'A', 'A'];
  try {
    var lastN = localStorage.getItem('lumenati-arcade-initials');
    if (lastN && lastN.length === 3) initials = lastN.split('');
  } catch (e) {}
  var initSlot = 0, boardIdx = -1, finalScore = 0;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function fmtBoard(v) { return '$' + v; }

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
    ctx.fillText('BAD REVIEWS', W / 2, 58);
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
    ctx.fillText('SPACE or TAP to reopen the shop', W / 2, 286);
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
    ctx.fillStyle = '#241a20'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2e2028';
    for (var fy = 150; fy < H; fy += 24) ctx.fillRect(0, fy, W, 12);
    // the door bursts open
    var doorSwing = Math.max(0, Math.min(1, (t2 - 8) / 8));
    ctx.fillStyle = '#3a2a34';
    ctx.fillRect(14, 150, 34, 40);
    ctx.fillStyle = '#241a20';
    ctx.fillRect(16, 152, 30, 36);
    ctx.fillStyle = '#5c4250';
    ctx.save();
    ctx.translate(16, 170);
    ctx.rotate(-doorSwing * 1.1);
    ctx.fillRect(0, -18, 4, 36);
    ctx.restore();
    if (t2 === 12) sfxBell();
    if (t2 > 10 && t2 < 40 && Math.floor(t2 / 5) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('DING!', 50, 148);
    }
    // the rush pours in
    for (var i = 0; i < 3; i++) {
      var wx2 = Math.max(0, t2 - 14 - i * 16) * 3.2;
      if (wx2 <= 0) continue;
      wx2 = Math.min(wx2, 240 + i * 30);
      var wy2 = 200 + i * 28;
      drawPerson(30 + wx2, wy2, SKINS[i % SKINS.length], SHIRTS[i % SHIRTS.length], HAIRS[i % HAIRS.length], false, wx2 < 240 + i * 30);
      if (wx2 < 100 && t2 % 3 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(24 + wx2 - 8, wy2 + 12, 3, 2);
      }
    }
    // cash rains once the shop is rolling
    if (t2 > 90) {
      for (var i = 0; i < 6; i++) {
        var dy2 = ((t2 * 2 + i * 47) % 140);
        ctx.fillStyle = 'rgba(255,215,0,' + (0.5 - dy2 / 300).toFixed(2) + ')';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('$', 250 + (i * 23) % 120, 60 + dy2);
      }
    }
    var stampT = Math.max(0, Math.min(1, (t2 - 26) / 22));
    if (stampT > 0) {
      var fs = 60 - stampT * 32;
      ctx.globalAlpha = stampT;
      ctx.fillStyle = PINK;
      ctx.font = 'bold ' + Math.round(fs) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SHOP RUSH', W / 2, 110);
      ctx.globalAlpha = 1;
    }
    if (t2 > 150) { ctx.fillStyle = CYAN; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('NOBODY WALKS OUT', W / 2, 140); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS or TAP to run // walk to a client, lead them to a chair', W / 2, H - 42);
    ctx.fillText('grab the $ when the work is done // 3 walkouts close the shop', W / 2, H - 29);
    if (Math.floor(t / 22) % 2 === 0) {
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H - 10);
    } else {
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('BEST: ' + ('$' + best), W / 2, H - 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var sy2 = 0; sy2 < H; sy2 += 3) ctx.fillRect(0, sy2, W, 1);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    // Wood plank floor with grain
    ctx.fillStyle = '#2a1d24';
    ctx.fillRect(0, 0, W, H);
    for (var py2 = 58; py2 < H; py2 += 18) {
      var rowShade = (Math.floor(py2 / 18) % 2 === 0) ? '#30222a' : '#281a21';
      ctx.fillStyle = rowShade;
      ctx.fillRect(0, py2, W, 17);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, py2 + 17, W, 1);
      var off = (Math.floor(py2 / 18) % 2) * 60;
      for (var px2 = off; px2 < W; px2 += 120) {
        ctx.fillRect(px2, py2, 1, 17);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect((py2 * 37) % W, py2 + 8, 3, 2);
    }
    // Back wall: brick tint, flash sheets, framed pieces
    ctx.fillStyle = '#1a1016';
    ctx.fillRect(0, 0, W, 58);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (var by2 = 4; by2 < 54; by2 += 10) {
      for (var bx2 = (by2 % 20 === 4 ? 0 : 14); bx2 < W; bx2 += 28) ctx.fillRect(bx2, by2, 12, 1);
    }
    for (var i = 0; i < 4; i++) {
      var fsx = 84 + i * 72;
      ctx.fillStyle = '#3a2a20';
      ctx.fillRect(fsx - 2, 8, 26, 24);
      ctx.fillStyle = '#efe9dc';
      ctx.fillRect(fsx, 10, 22, 20);
      if (i === 0) { // heart
        ctx.fillStyle = '#d81e3c';
        ctx.fillRect(fsx + 6, 14, 4, 4); ctx.fillRect(fsx + 12, 14, 4, 4);
        ctx.fillRect(fsx + 6, 17, 10, 4); ctx.fillRect(fsx + 9, 21, 4, 3);
      } else if (i === 1) { // anchor
        ctx.fillStyle = '#2d6cdf';
        ctx.fillRect(fsx + 10, 12, 2, 12);
        ctx.fillRect(fsx + 6, 15, 10, 2);
        ctx.fillRect(fsx + 5, 22, 4, 2); ctx.fillRect(fsx + 13, 22, 4, 2);
      } else if (i === 2) { // bolt
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(fsx + 11, 12, 4, 5);
        ctx.fillRect(fsx + 8, 16, 6, 4);
        ctx.fillRect(fsx + 6, 20, 4, 5);
      } else { // skull
        ctx.fillStyle = '#ccd2d8';
        ctx.fillRect(fsx + 7, 13, 9, 7);
        ctx.fillRect(fsx + 9, 20, 5, 4);
        ctx.fillStyle = '#14121a';
        ctx.fillRect(fsx + 9, 15, 2, 2); ctx.fillRect(fsx + 13, 15, 2, 2);
      }
    }
    // Neon sign with a real glow
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    var neonOn = Math.floor(frame / 30) % 2 === 0;
    ctx.fillStyle = neonOn ? 'rgba(255,20,147,0.25)' : 'rgba(200,0,110,0.15)';
    ctx.fillText('* LUMENATI TATTOO *', W / 2 + 1, 41);
    ctx.fillText('* LUMENATI TATTOO *', W / 2 - 1, 39);
    ctx.fillStyle = neonOn ? PINK : '#c8006e';
    ctx.fillText('* LUMENATI TATTOO *', W / 2, 40);

    // Door with a striped awning
    ctx.fillStyle = '#3a2a34';
    ctx.fillRect(DOOR.x - 16, 30, 32, 28);
    for (var aw = 0; aw < 4; aw++) {
      ctx.fillStyle = aw % 2 === 0 ? PINK : '#efe9dc';
      ctx.fillRect(DOOR.x - 18 + aw * 9, 26, 9, 5);
    }
    ctx.fillStyle = LIME;
    ctx.font = '8px monospace';
    ctx.fillText('OPEN', DOOR.x, 47);

    // Bench with cushions
    ctx.fillStyle = '#4a3440';
    ctx.fillRect(24, 96, 44, 158);
    ctx.fillStyle = '#5c4250';
    ctx.fillRect(24, 96, 44, 5);
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = '#6b4a5c';
      ctx.fillRect(28, 104 + i * 42, 36, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(28, 104 + i * 42, 36, 3);
    }

    // Stations: lit work areas with the kit laid out
    for (var i = 0; i < chairs.length; i++) {
      var ch = chairs[i];
      // lamp light pool over the whole station
      var pool = ctx.createRadialGradient(ch.x + 8, ch.y - 4, 6, ch.x + 8, ch.y - 4, 52);
      pool.addColorStop(0, ch.state === 'busy' ? 'rgba(255,225,170,0.16)' : 'rgba(255,225,170,0.09)');
      pool.addColorStop(1, 'rgba(255,225,170,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(ch.x - 48, ch.y - 56, 112, 104);
      ctx.fillStyle = '#3a2a34';
      ctx.fillRect(ch.x - 18, ch.y - 24, 66, 52);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(ch.x - 18, ch.y - 24, 66, 2);
      // the lamp arm
      ctx.fillStyle = '#888';
      ctx.fillRect(ch.x + 40, ch.y - 24, 2, 10);
      ctx.fillRect(ch.x + 30, ch.y - 26, 12, 2);
      ctx.fillStyle = '#ffe1aa';
      ctx.fillRect(ch.x + 27, ch.y - 25, 5, 4);
      // ink caps on the tray
      for (var ic = 0; ic < 3; ic++) {
        ctx.fillStyle = ['#FF1493', '#14121a', '#2d6cdf'][ic];
        ctx.fillRect(ch.x - 16 + ic * 5, ch.y - 20, 3, 3);
      }
      // cushioned chair
      ctx.fillStyle = '#111';
      ctx.fillRect(ch.x - 10, ch.y - 8, 26, 20);
      ctx.fillStyle = '#2a2030';
      ctx.fillRect(ch.x - 8, ch.y - 6, 22, 8);
      ctx.fillStyle = '#666';
      ctx.fillRect(ch.x - 10, ch.y + 12, 26, 3);
      // The artist, always at station
      var bob = ch.state === 'busy' ? Math.sin(frame * 0.3 + i) * 2 : 0;
      drawPerson(ch.x + 30, ch.y + bob, SKINS[i % SKINS.length], '#1c1418', i === 0 ? PINK : HAIRS[i % HAIRS.length], false, false);
      if (ch.state === 'busy') {
        // machine arm + ink sparks + progress
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(ch.x + 18, ch.y - 4 + bob, 8, 5);
        if (frame % 5 === 0) {
          ctx.fillStyle = '#1c1418';
          ctx.fillRect(ch.x + 14 + Math.random() * 6, ch.y + Math.random() * 4, 2, 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(ch.x - 18, ch.y - 32, 66, 4);
        ctx.fillStyle = CYAN;
        ctx.fillRect(ch.x - 18, ch.y - 32, 66 * (1 - ch.t / (480 + day * 50 + 240)), 4);
        if (ch.client) drawPerson(ch.x, ch.y - 2, ch.client.skin, ch.client.shirt, ch.client.hair, true);
      }
      if (ch.state === 'done') {
        if (ch.client) drawPerson(ch.x, ch.y - 2, ch.client.skin, ch.client.shirt, ch.client.hair, true);
        if (Math.floor(frame / 12) % 2 === 0) {
          ctx.fillStyle = YELLOW;
          ctx.font = 'bold 14px monospace';
          ctx.fillText('$', ch.x - 2, ch.y - 34);
        }
      }
    }

    // Clients
    for (var i = 0; i < clients.length; i++) {
      var c = clients[i];
      if (c.state === 'inchair') continue;
      drawPerson(c.x, c.y, c.skin, c.shirt, c.hair, c.state === 'waiting', c.state !== 'waiting');
      if (c.state === 'waiting') {
        if ((frame + c.seat * 17) % 90 < 6) {
          ctx.fillStyle = '#223';
          ctx.fillRect(c.x - 5, c.y + 11, 4, 2);
        }
        var pr = c.patience / c.pmax;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c.x - 10, c.y - 24, 20, 3);
        ctx.fillStyle = pr > 0.35 ? LIME : '#ff4444';
        ctx.fillRect(c.x - 10, c.y - 24, 20 * pr, 3);
      }
      if (c.state === 'storming' && Math.floor(frame / 8) % 2 === 0) {
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('!!', c.x + 10, c.y - 18);
      }
    }

    // Runner (you): pink-haired shop runner
    var runnerMoving = runner.kx !== 0 || runner.ky !== 0 || runner.tx !== null;
    drawPerson(runner.x, runner.y, '#f0c8a0', '#14101c', PINK, false, runnerMoving);
    ctx.fillStyle = 'rgba(255,20,147,0.5)';
    ctx.fillRect(runner.x - 7, runner.y + 13, 14, 2);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.life / 28;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('$' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: $' + Math.max(best, score), 8, 26);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'right';
    ctx.fillText('DAY ' + day + ' // ' + served + '/' + servedTarget, W - 8, 14);
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = i < hearts ? PINK : 'rgba(255,255,255,0.18)';
      var hx = W - 12 - i * 14;
      ctx.fillRect(hx, 20, 4, 4); ctx.fillRect(hx + 5, 20, 4, 4);
      ctx.fillRect(hx, 24, 9, 4); ctx.fillRect(hx + 2, 28, 5, 3);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 30);
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
    if (!window.skateRunning) { rafId = null; setAmbience(0, 0); return; }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-shoprush', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
