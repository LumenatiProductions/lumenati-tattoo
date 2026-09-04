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
  function sfxPaddle() { playSfx(300, 0.05, 'square', 0.1); }
  function sfxBrick(row) { playSfx(500 + row * 80, 0.06, 'square', 0.11); }
  function sfxWall() { playSfx(220, 0.04, 'square', 0.08); }
  function sfxLose() { playSfx(180, 0.3, 'sawtooth', 0.15); }
  function sfxLevel() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
  function sfxBomb() { playSfx(90, 0.25, 'sawtooth', 0.16); playSfx(60, 0.35, 'square', 0.1); setTimeout(function(){playSfx(140, 0.12, 'square', 0.08);}, 60); }
  function sfxGold() { playSfx(1400, 0.06, 'square', 0.1); setTimeout(function(){playSfx(1900, 0.1, 'square', 0.1);}, 60); setTimeout(function(){playSfx(2400, 0.14, 'square', 0.08);}, 120); }
  function sfxChain(n) { playSfx(600 + n * 90, 0.05, 'square', 0.07); }
  function sfxTally() { playSfx(880, 0.05, 'square', 0.08); setTimeout(function(){playSfx(1320, 0.08, 'square', 0.08);}, 50); }
  function sfxCatch() { playSfx(520, 0.05, 'triangle', 0.1); setTimeout(function(){playSfx(780, 0.06, 'triangle', 0.1);}, 40); }
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

  // ── This game's own chiptune: bouncy demolition major ──
  var SONGS = [
    { root: 130.81, bass: [0,-1,7,-1, 0,-1,7,-1, 5,-1,9,-1, 7,-1,5,-1], lead: [12,16,19,-1, 16,-1,12,-1, 17,21,24,-1, 19,-1,16,-1] },
    { root: 146.83, bass: [0,0,-1,7, 5,5,-1,9, 0,0,-1,7, 10,-1,9,7],   lead: [19,-1,16,12, -1,17,-1,21, 19,-1,16,12, 24,-1,21,19] },
  ];
  var MENU_SONG = { root: 164.81, bass: [0,-1,7,-1, 5,-1,9,-1, 0,-1,7,-1, 10,9,7,5], lead: [16,-1,19,16, -1,21,19,-1, 16,-1,19,24, 21,19,16,-1] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var stepFrames = menu ? 12 : Math.max(9, 15 - level);
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var song = menu ? MENU_SONG : SONGS[(level - 1) % SONGS.length];
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

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#9b59b6', CYAN = '#00FFFF';

  var COLS = 12, BW = 30, BH = 11, BGAP = 2, BTOP = 34;
  var BLEFT = (W - (COLS * BW + (COLS - 1) * BGAP)) / 2;

  // Every sheet is a flash design; break it off the wall tile by tile.
  // Every sheet is credited to one of the crew on its intro card.
  // Sheet credits come from the live roster (the shell injects the handles);
  // the fallback only shows up on a page with no roster at all.
  var CREW = (window.__ARCADE_CREW__ && window.__ARCADE_CREW__.length) ? window.__ARCADE_CREW__ : ['the crew'];
  while (CREW.length < 6) CREW = CREW.concat(CREW);
  var DESIGNS = [
    { name: 'HEART', artist: CREW[0], color: '#FF1493', rows: [
      '.XXX....XXX.', 'XXXXX..XXXXX', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX',
      '.XXXXXXXXXX.', '..XXXXXXXX..', '....XXXX....', '.....XX.....'] },
    { name: 'SKULL', artist: CREW[2], color: '#e8e4d8', rows: [
      '..XXXXXXXX..', '.XXXXXXXXXX.', '.XXXXXXXXXX.', '.XX.XXXX.XX.',
      '.XX.XXXX.XX.', '..XXX..XXX..', '..XXXXXXXX..', '...X.XX.X...'] },
    { name: 'BOLT', artist: CREW[3], color: '#FFD700', rows: [
      '......XXXX..', '.....XXXX...', '....XXXX....', '..XXXXXXXX..',
      '.....XXX....', '....XXX.....', '...XXX......', '..XXX.......'] },
    { name: 'STAR', artist: CREW[1], color: '#00FFFF', rows: [
      '.....XX.....', '....XXXX....', 'XXXXXXXXXXXX', '.XXXXXXXXXX.',
      '..XXXXXXXX..', '..XXX..XXX..', '.XXX....XXX.', '.XX......XX.'] },
    { name: 'DAGGER', artist: CREW[4], color: '#b8c4d0', rows: [
      '.....XX.....', '....XXXX....', '..XXXXXXXX..', '.....XX.....',
      '.....XX.....', '.....XX.....', '.....XX.....', '......X.....'] },
    { name: 'ANCHOR', artist: CREW[5], color: '#2d6cdf', rows: [
      '.....XX.....', '....XXXX....', '.....XX.....', '..XXXXXXXX..',
      '.....XX.....', '.X...XX...X.', '.XX..XX..XX.', '..XXXXXXXX..'] },
    { name: 'ROSE', artist: CREW[1], color: '#e8283c', rows: [
      '...XXXXXX...', '..XXX.XXXX..', '..XX.XX.XX..', '..XXX.XXXX..',
      '...XXXXXX...', '.X...XX...X.', '.XXX.XX.XXX.', '.....XX.....'] },
  ];
  // Boss sheets: every fourth sheet is a big piece with a core that only opens
  // up once the rest of the design is gone, and it fights back with ink.
  var BOSSES = [
    { name: 'DEATH SKULL', artist: CREW[2], color: '#f0ece0', core: [5, 5], rows: [
      '...XXXXXX...', '..XXXXXXXX..', '.XXXXXXXXXX.', '.XX.XXXX.XX.', '.XX.XXXX.XX.',
      '.XXXXXCXXXX.', '..XXXXXXXX..', '...X.XX.X...', '...XXXXXX...', '....X.X.X...'] },
    { name: 'BLOOD ROSE', artist: CREW[1], color: '#ff2d55', core: [3, 5], rows: [
      '....XXXX....', '..XXXXXXXX..', '.XXX.XX.XXX.', '.XX.XCX.XXX.', '.XXX.XX.XXX.',
      '..XXXXXXXX..', '....XXXX....', '.X...XX...X.', '.XXX.XX.XXX.', '...XXXXXX...'] },
    { name: 'IRON DAGGER', artist: CREW[4], color: '#c9d3de', core: [2, 5], rows: [
      '.....XX.....', '....XXXX....', '..XXXCXXXX..', '.....XX.....', '.....XX.....',
      '.....XX.....', '.....XX.....', '.....XX.....', '.....XX.....', '......X.....'] },
  ];
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, level, frame, flashT, bannerT, bannerText;
  var paddle, balls, bricks, particles, trail, paddleFlash;
  var drops, lasers, wideT, laserT, laserCd, popups;
  var stickyT, fireT, shake, chain, bestChain, bricksBroken, ceilCd;
  var sheetFrames, sheetMiss, clearT, clearLines, shields, motes, sparks;
  var sheetKind, sheetCells, shiftRow, scrollDrop, potT, bossN, bossBombs, bossBombCd, bossMax, bossesBeaten;
  var stunT, magnetT, splitReady, cardT, prevPaddleX, paddleVx, bossSway, edgeCatches, lastSheetKind;
  var keyL = false, keyR = false;

  // Chain: bricks broken since the last paddle touch. Every two steps the
  // multiplier climbs, up to x8. One paddle touch and it is back to x1.
  function mult() { return 1 + Math.min(7, Math.floor(chain / 2)); }

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-bricks') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-bricks', String(best)); } catch(e) {} }
  }

  function isBoss(lv) { return lv % 4 === 0; }
  function design() {
    if (isBoss(level)) return BOSSES[(level / 4 - 1) % BOSSES.length];
    return DESIGNS[(level - 1 - Math.floor(level / 4)) % DESIGNS.length];
  }
  // Sheet kinds cycle between bosses: plain, a shifting row, a sheet that
  // creeps down the wall, a sheet that regrows from an ink pot.
  var KINDS = ['plain', 'shift', 'scroll', 'pot'];
  function sheetKindFor(lv) {
    if (isBoss(lv)) return 'boss';
    var n = lv - Math.floor(lv / 4);
    return KINDS[(n - 1) % KINDS.length];
  }
  function kindLine(k) {
    return k === 'boss' ? 'BOSS SHEET // OPEN THE CORE LAST' : k === 'shift' ? 'ONE ROW WILL NOT SIT STILL' : k === 'scroll' ? 'THE SHEET IS SLIDING DOWN. DO NOT GET BURIED' : k === 'pot' ? 'SMASH THE INK POT OR IT REGROWS' : 'BREAK IT OFF THE WALL';
  }

  // Brick types: plain flash, tough (two hits, cracks first), ink bombs (blow
  // the neighbors), gold (worth five, always drops a capsule). The mix gets
  // meaner every sheet; second time through the book every plain tile is tough.
  function buildBricks() {
    bricks = [];
    sheetCells = [];
    var d = design();
    sheetKind = sheetKindFor(level);
    var boss = sheetKind === 'boss';
    var loop2 = level > DESIGNS.length + 3;
    var toughRate = boss ? 0.22 : loop2 ? 1 : Math.min(0.35, (level - 1) * 0.09);
    var bombs = boss ? 0 : level >= 3 ? Math.min(5, 1 + Math.floor((level - 1) / 2)) : 0;
    var golds = boss ? 2 : 1 + (level % 3 === 0 ? 1 : 0);
    var cells = [];
    for (var r = 0; r < d.rows.length; r++) {
      for (var c = 0; c < COLS; c++) {
        var ch = d.rows[r][c];
        if (ch !== 'X' && ch !== 'C') continue;
        var seed = ((r * 31 + c * 17 + level * 7) % 97) / 97;
        var brick = {
          x: BLEFT + c * (BW + BGAP), y: BTOP + r * (BH + BGAP),
          bx: BLEFT + c * (BW + BGAP), by: BTOP + r * (BH + BGAP),
          row: r, col: c, hp: 1, maxHp: 1, kind: 'plain',
          color: shade(d.color, 1 - r * 0.06), seed: seed, pulse: 0,
        };
        if (ch === 'C') { brick.kind = 'core'; brick.hp = 3; brick.maxHp = 3; }
        else if (seed < toughRate) { brick.kind = 'tough'; brick.hp = 2; brick.maxHp = 2; }
        bricks.push(brick);
        sheetCells.push({ x: brick.bx, y: brick.by, row: r, col: c, color: brick.color, seed: seed });
        if (brick.kind !== 'core') cells.push(brick);
      }
    }
    // Bombs and gold land on a deterministic spread so a sheet reads the same every run
    var pick = function (n, kind) {
      var stride = Math.max(1, Math.floor(cells.length / (n + 1)));
      for (var k = 1; k <= n; k++) {
        var b = cells[(k * stride + level * 3) % cells.length];
        if (b.kind === 'bomb' || b.kind === 'gold') b = cells[(k * stride + level * 3 + 1) % cells.length];
        b.kind = kind; b.hp = 1; b.maxHp = 1;
      }
    };
    pick(bombs, 'bomb');
    pick(golds, 'gold');
    // The ink pot: a three-hit jar at the top of the sheet that regrows what you break
    if (sheetKind === 'pot') {
      var topRow = bricks.filter(function (b) { return b.row === 0; });
      var pot = topRow[Math.floor(topRow.length / 2)] || bricks[0];
      pot.kind = 'pot'; pot.hp = 3; pot.maxHp = 3;
    }
    shiftRow = sheetKind === 'shift' ? 3 : -1;
    scrollDrop = 0; potT = 0;
    bossN = boss ? level / 4 : 0;
    bossMax = bricks.length;
    bossBombs = []; bossBombCd = 150; bossSway = 0;
    // Steel needle bars drift under the sheet from sheet 5; a second from 9
    shields = [];
    if (level >= 5 && !boss) shields.push({ x: 60, y: 160, w: 70, vx: 1.1 });
    if (level >= 9 && !boss) shields.push({ x: 260, y: 176, w: 56, vx: -1.5 });
    sheetFrames = 0; sheetMiss = false;
    cardT = 120;
    stunT = 0; magnetT = 0; splitReady = false;
  }

  // Pot sheets: a broken cell grows back while the pot still stands
  function regrow() {
    var used = {};
    for (var i = 0; i < bricks.length; i++) used[bricks[i].row + ':' + bricks[i].col] = true;
    var open = sheetCells.filter(function (c) { return !used[c.row + ':' + c.col]; });
    if (!open.length) return;
    var c = open[Math.floor(Math.random() * open.length)];
    bricks.push({ x: c.x, y: c.y + scrollDrop, bx: c.x, by: c.y, row: c.row, col: c.col, hp: 1, maxHp: 1, kind: 'plain', color: c.color, seed: c.seed, pulse: 0, grow: 24 });
    spawnParticles(c.x + BW / 2, c.y + scrollDrop + BH / 2, PINK, 6);
    playSfx(420, 0.08, 'triangle', 0.08);
  }

  function makeBall() {
    return { x: paddle.x + paddle.w / 2, y: paddle.y - 6, vx: 0, vy: 0, r: 4, stuck: true, off: 0 };
  }

  function serve() {
    balls = [makeBall()];
  }

  function launch() {
    var sp = 3.6 + Math.min(3, (level - 1) * 0.35);
    for (var i = 0; i < balls.length; i++) {
      if (!balls[i].stuck) continue;
      balls[i].stuck = false;
      var a = -Math.PI / 3 + Math.random() * (Math.PI / 6);
      var side = balls[i].off !== 0 ? (balls[i].off > 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
      balls[i].vx = Math.cos(a) * sp * side;
      balls[i].vy = -Math.abs(Math.sin(a) * sp);
      balls[i].off = 0;
    }
  }

  function addPopup(x, y, text, color, big) {
    popups.push({ x: Math.max(30, Math.min(W - 30, x)), y: y, text: text, color: color, life: big ? 70 : 45, big: !!big });
  }
  function award(pts, x, y, label, color, big) {
    score += pts;
    document.getElementById('jd-br-score').textContent = score;
    addPopup(x, y, (label ? label + ' ' : '') + '+' + pts, color || '#fff', big);
  }

  // ── Capsules: the good stuff falls out of broken bricks ──
  var DROP_NAMES = { multi: 'M', wide: 'W', slow: 'S', laser: 'L', life: '+', sticky: 'G', fire: 'F', magnet: 'U', split: '3' };
  var DROP_COLORS = { multi: PINK, wide: CYAN, slow: LIME, laser: YELLOW, life: '#7FFF00', sticky: '#5bd75b', fire: '#FF8A00', magnet: '#8fd3ff', split: '#ff77ff' };
  function maybeDrop(x, y, force) {
    var rate = Math.max(0.09, 0.15 - (level - 1) * 0.008);
    if (!force && Math.random() > rate) return;
    var r = Math.random();
    var kind = r < 0.16 ? 'multi' : r < 0.3 ? 'wide' : r < 0.41 ? 'slow' : r < 0.54 ? 'laser' : r < 0.66 ? 'sticky' : r < 0.76 ? 'fire' : r < 0.86 ? 'magnet' : r < 0.95 ? 'split' : 'life';
    drops.push({ x: x, y: y, vy: 1.5, kind: kind, spin: Math.random() * 6 });
  }

  function applyDrop(kind) {
    if (kind === 'multi') {
      var flying = [];
      for (var i = 0; i < balls.length; i++) if (!balls[i].stuck) flying.push(balls[i]);
      var src = flying.length ? flying : balls;
      var added = 0;
      for (var i = 0; i < src.length && balls.length < 6 && added < 2; i++) {
        var b0 = src[i];
        var sp0 = Math.max(3.2, Math.hypot(b0.vx, b0.vy)) || 3.6;
        for (var k = -1; k <= 1 && balls.length < 6 && added < 2; k += 2) {
          var ang = Math.atan2(b0.vy || -1, b0.vx || 0.4) + k * 0.5;
          balls.push({ x: b0.x, y: b0.y, vx: Math.cos(ang) * sp0, vy: Math.sin(ang) * sp0, r: 4, stuck: false });
          added++;
        }
      }
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'MULTIBALL!', PINK);
      sfxLevel();
    } else if (kind === 'wide') {
      wideT = 1200;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'WIDE!', CYAN);
      sfxPaddle();
    } else if (kind === 'slow') {
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].stuck) continue;
        balls[i].vx *= 0.72; balls[i].vy *= 0.72;
        var mn = Math.hypot(balls[i].vx, balls[i].vy);
        if (mn < 2.4 && mn > 0) { balls[i].vx *= 2.4 / mn; balls[i].vy *= 2.4 / mn; }
      }
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'SLOW-MO', LIME);
      sfxWall();
    } else if (kind === 'laser') {
      laserT = 800;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'LASERS!', YELLOW);
      sfxLevel();
    } else if (kind === 'sticky') {
      stickyT = 900;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'STICKY GRIP', '#5bd75b');
      sfxCatch();
    } else if (kind === 'fire') {
      fireT = 480;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'HOT NEEDLE!', '#FF8A00');
      sfxBomb();
    } else if (kind === 'magnet') {
      magnetT = 720;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'MAGNET NEEDLE', '#8fd3ff');
      sfxCatch();
    } else if (kind === 'split') {
      splitReady = true;
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, 'CHAIN SHOT ARMED', '#ff77ff');
      sfxLevel();
    } else {
      if (lives < 5) {
        lives++;
        document.getElementById('jd-br-lives').textContent = lives;
      }
      addPopup(paddle.x + paddle.w / 2, paddle.y - 16, '+1 LIFE', '#7FFF00');
      sfxLevel();
    }
  }

  function fireLaser() {
    if (laserT <= 0 || laserCd > 0) return;
    laserCd = 13;
    lasers.push({ x: paddle.x + 5, y: paddle.y - 4 });
    lasers.push({ x: paddle.x + paddle.w - 5, y: paddle.y - 4 });
    playSfx(1200, 0.05, 'square', 0.08);
  }

  // A brick takes a hit from a ball, a laser, or a bomb next door. Ball hits
  // feed the chain; lasers and blasts pay out at whatever the chain is.
  function coreShielded(b) {
    if (b.kind !== 'core') return false;
    for (var i = 0; i < bricks.length; i++) if (bricks[i] !== b) return true;
    return false;
  }
  function damageBrick(i, hx, hy, src, force) {
    var b = bricks[i];
    if (!b) return;
    if (coreShielded(b)) {
      // The core is armored until the rest of the piece is gone
      sfxWall();
      addPopup(hx, hy - 6, 'SHIELDED', 'rgba(255,255,255,0.7)');
      spawnParticles(hx, hy, '#cfd6dd', 3);
      b.pulse = 12;
      return;
    }
    if (b.kind === 'core' || b.kind === 'pot') force = false; // three real hits each
    b.hp -= force ? b.hp : 1;
    sfxBrick(b.row);
    if (b.hp > 0) {
      award(b.kind === 'core' ? 100 : 5, hx, hy, b.kind === 'core' ? 'CORE HIT' : 'CRACK', b.kind === 'core' ? YELLOW : 'rgba(255,255,255,0.8)', b.kind === 'core');
      spawnParticles(hx, hy, '#fff', b.kind === 'core' ? 10 : 4);
      if (b.kind === 'core') shake = Math.max(shake, 5);
      return;
    }
    bricks.splice(i, 1);
    bricksBroken++;
    if (src === 'ball') {
      chain++;
      if (chain > bestChain) bestChain = chain;
      if (chain >= 2 && chain % 2 === 0) sfxChain(Math.min(8, chain / 2));
    }
    var m = mult();
    var base = b.kind === 'gold' ? 50 : b.kind === 'bomb' ? 30 : b.kind === 'tough' ? 25 : b.kind === 'pot' ? 60 : (b.row < 2 ? 15 : 10);
    var label = b.kind === 'gold' ? 'GOLD' : b.kind === 'bomb' ? 'BOOM' : b.kind === 'tough' ? 'TOUGH' : b.kind === 'pot' ? 'POT SMASHED' : (b.row < 2 ? 'DEEP' : '');
    if (b.kind === 'core') {
      // Boss down: the whole piece goes up in ink
      bossesBeaten++;
      var bonus = 2500 * bossN;
      award(bonus, W / 2, 150, 'BOSS DOWN', PINK, true);
      shake = 16;
      for (var k = 0; k < 40; k++) particles.push({ x: b.x + BW / 2, y: b.y + BH / 2, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6 - 1, life: 30 + Math.random() * 30, color: k % 2 ? PINK : YELLOW, size: 2 + Math.random() * 3 });
      sparks.push({ x: b.x + BW / 2, y: b.y + BH / 2, r: 6, life: 14 });
      sfxBomb(); sfxGold();
      say('so-sick', 300);
      bossBombs = [];
      return;
    }
    if (b.kind === 'pot') { sfxGold(); shake = Math.max(shake, 6); }
    if (bricks.length === 0 && src === 'ball') award(200 * level, b.x + BW / 2, b.y + 14, 'LAST BRICK', LIME, true);
    else if (bricks.length === 1 && bricks[0].kind === 'core' && src === 'ball') addPopup(W / 2, 120, 'THE CORE IS OPEN', YELLOW, true);
    if (m > 1) label = (label ? label + ' ' : '') + 'x' + m;
    award(base * m, b.x + BW / 2, b.y, label, b.kind === 'gold' ? YELLOW : b.kind === 'bomb' ? '#FF8A00' : m >= 4 ? YELLOW : m > 1 ? CYAN : '#fff', b.kind !== 'plain' || m >= 4);
    spawnParticles(hx, hy, b.kind === 'gold' ? YELLOW : b.color, b.kind === 'plain' ? 8 : 14);
    if (b.kind === 'gold') { sfxGold(); maybeDrop(b.x + BW / 2, b.y + BH / 2, true); }
    else if (b.kind !== 'bomb') maybeDrop(b.x + BW / 2, b.y + BH / 2);
    if (b.kind === 'bomb') explode(b);
  }

  // Ink bombs take out every brick one cell away; bombs next door go off too.
  function explode(b) {
    sfxBomb();
    shake = Math.max(shake, 7);
    var cx = b.x + BW / 2, cy = b.y + BH / 2;
    for (var k = 0; k < 22; k++) {
      var a = (k / 22) * Math.PI * 2, spd = 1.5 + Math.random() * 2.5;
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 0.5, life: 22 + Math.random() * 14, color: k % 3 === 0 ? '#FF8A00' : k % 3 === 1 ? PINK : '#2b1a3a', size: 2 + Math.random() * 3 });
    }
    sparks.push({ x: cx, y: cy, r: 4, life: 14 });
    // Neighbors first, then damage by lookup: a bomb next door re-enters here
    // and reshuffles the array underneath us.
    var hit = [];
    for (var i = 0; i < bricks.length; i++) {
      var n = bricks[i];
      if (Math.abs(n.x - b.x) <= BW + BGAP + 1 && Math.abs(n.y - b.y) <= BH + BGAP + 1) hit.push(n);
    }
    for (var h = 0; h < hit.length; h++) {
      if (hit[h].kind === 'core' || hit[h].kind === 'pot') continue;
      var idx = bricks.indexOf(hit[h]);
      if (idx >= 0) damageBrick(idx, hit[h].x + BW / 2, hit[h].y + BH / 2, 'blast', true);
    }
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; level = 1; frame = 0; flashT = 0; mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0;
    bannerT = 0; bannerText = '';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    paddle = { x: W / 2 - 30, y: 298, w: 60, h: 8 };
    particles = []; trail = []; paddleFlash = 0;
    drops = []; lasers = []; wideT = 0; laserT = 0; laserCd = 0; popups = [];
    stickyT = 0; fireT = 0; shake = 0; chain = 0; bestChain = 0; bricksBroken = 0; ceilCd = 0;
    clearT = 0; clearLines = []; shields = []; sparks = [];
    bossesBeaten = 0; edgeCatches = 0; prevPaddleX = W / 2 - 30; paddleVx = 0; bossBombs = []; cardT = 0; stunT = 0; magnetT = 0; splitReady = false;
    motes = [];
    for (var i = 0; i < 26; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.2 + Math.random() * 0.5, r: 0.6 + Math.random() * 1.4, ph: Math.random() * 6 });
    buildBricks();
    serve();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Drag the paddle // FIRE launches + lasers' : 'Arrows, mouse or drag // SPACE launches';
    window.skateRunning = true;
    startLoop();
  }

  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 2.5 - 0.5,
        life: 18 + Math.random() * 12,
        color: color,
        size: 2 + Math.random() * 2
      });
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (paddleFlash > 0) paddleFlash--;
    if (flashT > 0) flashT--;
    if (shake > 0) shake--;
    if (ceilCd > 0) ceilCd--;
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= popups[i].big ? 0.35 : 0.5; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var i = sparks.length - 1; i >= 0; i--) { sparks[i].r += 5; sparks[i].life--; if (sparks[i].life <= 0) sparks.splice(i, 1); }
    for (var i = 0; i < motes.length; i++) { var mo = motes[i]; mo.y -= mo.s; mo.x += Math.sin(frame * 0.02 + mo.ph) * 0.2; if (mo.y < -4) { mo.y = H + 4; mo.x = Math.random() * W; } }

    // Paddle (inked by a boss bomb, it stalls for a beat)
    if (stunT > 0) { stunT--; }
    else {
      if (keyL) paddle.x -= 6;
      if (keyR) paddle.x += 6;
    }
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
    paddleVx = paddleVx * 0.5 + (paddle.x - prevPaddleX) * 0.5;
    prevPaddleX = paddle.x;
    if (cardT > 0) cardT--;

    // ── Sheet clear tally: the field holds while the bonuses land ──
    if (clearT > 0) {
      clearT--;
      var lineAt = [150, 120, 90, 60];
      for (var li = 0; li < clearLines.length; li++) {
        if (!clearLines[li].shown && clearT <= lineAt[li]) {
          clearLines[li].shown = true;
          score += clearLines[li].pts;
          document.getElementById('jd-br-score').textContent = score;
          sfxTally();
        }
      }
      if (clearT === 0) {
        level++;
        sfxLevel();
        buildBricks();
        drops = []; lasers = [];
        serve();
        bannerT = 90;
        bannerText = 'SHEET ' + level + ': ' + design().name;
        sayCallout(['bricks-c1', 'bricks-c2', 'bricks-c3'][level % 3]);
      }
      return;
    }
    sheetFrames++;

    if (wideT > 0) wideT--;
    if (laserT > 0) laserT--;
    if (laserCd > 0) laserCd--;
    if (stickyT > 0) stickyT--;
    if (fireT > 0) fireT--;
    paddle.w = wideT > 0 ? 92 : 60;

    // Needle bars drift under the sheet
    for (var si = 0; si < shields.length; si++) {
      var sh = shields[si];
      sh.x += sh.vx;
      if (sh.x < 4) { sh.x = 4; sh.vx = Math.abs(sh.vx); }
      if (sh.x + sh.w > W - 4) { sh.x = W - 4 - sh.w; sh.vx = -Math.abs(sh.vx); }
    }

    // ── The sheet itself moves on some walls ──
    if (magnetT > 0) magnetT--;
    var anyFlying = false;
    for (var fb = 0; fb < balls.length; fb++) if (!balls[fb].stuck) anyFlying = true;
    if (sheetKind === 'scroll' && anyFlying) {
      scrollDrop += level >= 8 ? 0.11 : 0.075;
      var lowest = 0;
      for (var bi2 = 0; bi2 < bricks.length; bi2++) { bricks[bi2].y = bricks[bi2].by + scrollDrop; if (bricks[bi2].y + BH > lowest) lowest = bricks[bi2].y + BH; }
      if (lowest > paddle.y - 34) {
        // Buried: the wall reached the machine
        lives--;
        document.getElementById('jd-br-lives').textContent = lives;
        flashT = 14; shake = 10; sheetMiss = true; chain = 0;
        addPopup(W / 2, 200, 'BURIED', '#ff5050', true);
        sfxLose();
        scrollDrop = 0;
        for (var bi3 = 0; bi3 < bricks.length; bi3++) bricks[bi3].y = bricks[bi3].by;
        if (lives <= 0) { enterBoard(score); saveBest(); deathJingle(); return; }
        balls = []; serve();
      }
    }
    if (shiftRow >= 0) {
      var sx = Math.sin(frame * 0.035) * 22;
      for (var bi4 = 0; bi4 < bricks.length; bi4++) if (bricks[bi4].row === shiftRow) bricks[bi4].x = bricks[bi4].bx + sx;
    }
    if (sheetKind === 'pot' && anyFlying) {
      var potAlive = false;
      for (var bi5 = 0; bi5 < bricks.length; bi5++) if (bricks[bi5].kind === 'pot') potAlive = true;
      if (potAlive && ++potT >= (level >= 9 ? 150 : 210)) { potT = 0; regrow(); }
    }
    for (var bi6 = 0; bi6 < bricks.length; bi6++) if (bricks[bi6].grow > 0) bricks[bi6].grow--;
    if (sheetKind === 'boss') {
      // The piece breathes and, from the second boss, sways across the wall
      if (bossN >= 2) {
        bossSway = Math.sin(frame * 0.02) * 26;
        for (var bi7 = 0; bi7 < bricks.length; bi7++) bricks[bi7].x = bricks[bi7].bx + bossSway;
      }
      if (anyFlying && --bossBombCd <= 0) {
        bossBombCd = Math.max(80, 190 - bossN * 25);
        var from = bricks[Math.floor(Math.random() * bricks.length)];
        if (from) { bossBombs.push({ x: from.x + BW / 2, y: from.y + BH, vy: 1.4, wob: Math.random() * 6 }); playSfx(160, 0.12, 'sawtooth', 0.09); }
      }
      for (var bb = bossBombs.length - 1; bb >= 0; bb--) {
        var ob = bossBombs[bb];
        ob.y += ob.vy; ob.vy = Math.min(3.2, ob.vy + 0.03); ob.x += Math.sin(frame * 0.1 + ob.wob) * 0.4;
        if (ob.y > paddle.y - 6 && ob.y < paddle.y + paddle.h + 10 && ob.x > paddle.x - 6 && ob.x < paddle.x + paddle.w + 6) {
          bossBombs.splice(bb, 1);
          stunT = 70; flashT = 8; shake = Math.max(shake, 6);
          addPopup(paddle.x + paddle.w / 2, paddle.y - 18, 'INKED! STALLED', '#ff5050', true);
          spawnParticles(ob.x, paddle.y, '#2b1a3a', 16);
          sfxLose();
        } else if (ob.y > H + 10) bossBombs.splice(bb, 1);
      }
    }

    // Balls in flight
    for (var bi = balls.length - 1; bi >= 0; bi--) {
      var ball = balls[bi];
      if (ball.stuck) {
        ball.x = paddle.x + paddle.w / 2 + ball.off;
        ball.y = paddle.y - 6;
        continue;
      }
      if (ball.ttl > 0) { ball.ttl--; if (ball.ttl === 0) { if (balls.length > 1) { balls.splice(bi, 1); continue; } } }
      if (magnetT > 0 && ball.vy > 0 && ball.y > 140) {
        // The magnet needle bends the ball back toward the machine
        var pc = paddle.x + paddle.w / 2;
        ball.vx += (pc - ball.x > 0 ? 1 : -1) * 0.06;
        var msp = Math.hypot(ball.vx, ball.vy), cap = 8;
        if (msp > cap) { ball.vx *= cap / msp; ball.vy *= cap / msp; }
      }
      ball.x += ball.vx;
      ball.y += ball.vy;
      trail.push({ x: ball.x, y: ball.y, fire: fireT > 0 });
      if (trail.length > 14 + balls.length * 4) trail.shift();

      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); sfxWall(); }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); sfxWall(); }
      if (ball.y < ball.r + 16) {
        ball.y = ball.r + 16; ball.vy = Math.abs(ball.vy); sfxWall();
        if (ceilCd === 0) { ceilCd = 45; award(25 * mult(), ball.x, 30, 'CEILING', CYAN); }
      }

      // Needle bars: steel, no points, just in the way
      for (var si = 0; si < shields.length; si++) {
        var sh = shields[si];
        if (ball.x + ball.r > sh.x && ball.x - ball.r < sh.x + sh.w && ball.y + ball.r > sh.y && ball.y - ball.r < sh.y + 6) {
          var ox = Math.min(ball.x + ball.r - sh.x, sh.x + sh.w - (ball.x - ball.r));
          var oy = Math.min(ball.y + ball.r - sh.y, sh.y + 6 - (ball.y - ball.r));
          if (ox < oy) ball.vx = ball.x < sh.x + sh.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
          else ball.vy = ball.y < sh.y + 3 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
          sfxWall();
          spawnParticles(ball.x, ball.y, '#cfd6dd', 3);
        }
      }

      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 6 &&
          ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
        var rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        rel = Math.max(-1, Math.min(1, rel));
        if (chain >= 4) addPopup(paddle.x + paddle.w / 2, paddle.y - 18, 'CHAIN ' + chain + ' ENDS', '#9aa');
        chain = 0;
        if (stickyT > 0) {
          ball.stuck = true; ball.off = rel * (paddle.w / 2 - 6); ball.vx = 0; ball.vy = 0;
          ball.y = paddle.y - 6;
          sfxCatch();
          paddleFlash = 8;
          continue;
        }
        var sp = Math.min(8, Math.hypot(ball.vx, ball.vy) * 1.02);
        var ang = rel * (Math.PI / 3);
        ball.vx = Math.sin(ang) * sp;
        ball.vy = -Math.abs(Math.cos(ang) * sp);
        // English: a moving machine bends the shot
        if (Math.abs(paddleVx) > 1.5) {
          ball.vx += paddleVx * 0.35;
          var esp = Math.hypot(ball.vx, ball.vy);
          if (esp > 8.5) { ball.vx *= 8.5 / esp; ball.vy *= 8.5 / esp; }
          if (Math.abs(paddleVx) > 3.5) award(10, ball.x, paddle.y - 30, 'ENGLISH', CYAN);
        }
        // Edge catch: the risky save pays
        if (Math.abs(rel) > 0.82) { edgeCatches++; award(30, ball.x, paddle.y - 42, 'EDGE', YELLOW); }
        ball.y = paddle.y - ball.r;
        if (splitReady) {
          splitReady = false;
          for (var sk = -1; sk <= 1; sk += 2) {
            var sang = Math.atan2(ball.vy, ball.vx) + sk * 0.42;
            balls.push({ x: ball.x, y: ball.y, vx: Math.cos(sang) * sp, vy: -Math.abs(Math.sin(sang) * sp), r: 4, stuck: false, ttl: 130 });
          }
          addPopup(ball.x, paddle.y - 54, 'CHAIN SHOT', '#ff77ff', true);
          sfxLevel();
        }
        paddleFlash = 8;
        for (var k = 0; k < 4; k++) particles.push({ x: ball.x, y: paddle.y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2 - 1, life: 10 + Math.random() * 8, color: '#fff', size: 1.5 });
        sfxPaddle();
      }

      for (var i = 0; i < bricks.length; i++) {
        var b = bricks[i];
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + BW &&
            ball.y + ball.r > b.y && ball.y - ball.r < b.y + BH) {
          if (fireT > 0) {
            // A hot needle burns straight through
            damageBrick(i, ball.x, ball.y, 'ball', true);
            break;
          }
          if (ball.ttl > 0 && balls.length > 1) ball.ttl = 1; // a chain-shot ball spends itself on one brick
          var overX = Math.min(ball.x + ball.r - b.x, b.x + BW - (ball.x - ball.r));
          var overY = Math.min(ball.y + ball.r - b.y, b.y + BH - (ball.y - ball.r));
          if (overX < overY) ball.vx = ball.x < b.x + BW / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
          else ball.vy = ball.y < b.y + BH / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
          damageBrick(i, ball.x, ball.y, 'ball');
          break;
        }
      }

      if (ball.y > H + 10) balls.splice(bi, 1);
    }

    // Lasers chew upward
    for (var li = lasers.length - 1; li >= 0; li--) {
      var lz = lasers[li];
      lz.y -= 7;
      var gone = lz.y < 14;
      for (var si = 0; si < shields.length && !gone; si++) {
        var sh2 = shields[si];
        if (lz.x > sh2.x && lz.x < sh2.x + sh2.w && lz.y > sh2.y && lz.y < sh2.y + 6) { gone = true; spawnParticles(lz.x, lz.y, YELLOW, 3); }
      }
      for (var i = 0; i < bricks.length && !gone; i++) {
        var b = bricks[i];
        if (lz.x > b.x && lz.x < b.x + BW && lz.y > b.y && lz.y < b.y + BH) {
          damageBrick(i, lz.x, lz.y, 'laser');
          gone = true;
        }
      }
      if (gone) lasers.splice(li, 1);
    }

    // Capsules fall toward the paddle
    for (var di = drops.length - 1; di >= 0; di--) {
      var d = drops[di];
      d.y += d.vy;
      d.spin += 0.08;
      d.vy = Math.min(2.6, d.vy + 0.02);
      if (d.y > paddle.y - 8 && d.y < paddle.y + paddle.h + 8 && d.x > paddle.x - 8 && d.x < paddle.x + paddle.w + 8) {
        applyDrop(d.kind);
        drops.splice(di, 1);
      } else if (d.y > H + 12) {
        drops.splice(di, 1);
      }
    }

    // Cleared the sheet: freeze the field and count the bonuses in
    if (bricks.length === 0) {
      var secs = Math.floor(sheetFrames / 60);
      var fast = Math.max(0, 1500 - secs * 25);
      fast = Math.round(fast / 10) * 10;
      clearLines = [{ t: 'SHEET ' + level + ' CLEAR', pts: 500 * level, shown: false }];
      if (fast > 0) clearLines.push({ t: 'FAST CLEAR ' + secs + 's', pts: fast, shown: false });
      if (!sheetMiss) clearLines.push({ t: 'NO MISS', pts: 1000, shown: false });
      if (bestChain >= 6) clearLines.push({ t: 'BEST CHAIN ' + bestChain, pts: bestChain * 50, shown: false });
      if (sheetKind === 'boss') clearLines.unshift({ t: design().name + ' DOWN', pts: 1000 * bossN, shown: false });
      clearLines = clearLines.slice(0, 4);
      clearT = 200;
      bossBombs = []; stunT = 0;
      shake = 8;
      balls = []; lasers = []; drops = [];
      wideT = 0; laserT = 0; stickyT = 0; fireT = 0; chain = 0;
      return;
    }

    // Every ball dropped
    if (balls.length === 0) {
      lives--;
      document.getElementById('jd-br-lives').textContent = lives;
      flashT = 12;
      shake = 4;
      sheetMiss = true;
      chain = 0;
      sfxLose();
      wideT = 0; laserT = 0; stickyT = 0; fireT = 0; drops = []; lasers = [];
      if (lives <= 0) {
        enterBoard(score);
        saveBest();
        deathJingle();
        return;
      }
      stunT = 0;
      serve();
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
    if (clearT > 0) return;
    if (cardT > 70) { cardT = 70; return; } // first tap dismisses the card, the next one serves
    fireLaser();
    launch();
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); keyL = true; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); keyR = true; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) start(); }
  });
  document.addEventListener('keyup', function(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
  });
  function canvasX(clientX) {
    var r = canvas.getBoundingClientRect();
    return (clientX - r.left) * (W / r.width);
  }
  canvas.addEventListener('mousemove', function(e) {
    paddle.x = Math.max(0, Math.min(W - paddle.w, canvasX(e.clientX) - paddle.w / 2));
  });
  canvas.addEventListener('click', function() { start(); });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    paddle.x = Math.max(0, Math.min(W - paddle.w, canvasX((e.targetTouches[0] || e.touches[0]).clientX) - paddle.w / 2));
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    paddle.x = Math.max(0, Math.min(W - paddle.w, canvasX((e.targetTouches[0] || e.touches[0]).clientX) - paddle.w / 2));
  }, { passive: false });

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'bricks', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'GAME OVER', again: 'SPACE or TAP to break again',
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
    levelLabel: function (lv) { return (lv - 1) + ' SHEETS // ' + bricksBroken + ' BRICKS // CHAIN ' + bestChain + (bossesBeaten ? ' // ' + bossesBeaten + (bossesBeaten === 1 ? ' BOSS' : ' BOSSES') : ''); },
  });
  function enterBoard(v) { wall.enter(v, { level: level, meta: { sheets: level - 1, chain: bestChain, bricks: bricksBroken, bosses: bossesBeaten, edges: edgeCatches } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }


  // ── Attract-mode intro: CRT power-on, studio card, then the title scene ──
  function drawIntro() {
    var t = introT;
    if (t > 285) { wall.drawAttract(); return; }
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
    ctx.fillStyle = '#100a18'; ctx.fillRect(0, 0, W, H);
    slam('FLASH BREAKER', 96, 24, YELLOW);
    var rowCols = [PINK, '#FF8A00', YELLOW, LIME, CYAN, '#b8c4d0', PINK, YELLOW, LIME, CYAN];
    var impactT = 96;
    // the wall assembles brick by brick
    for (var i = 0; i < 10; i++) {
      for (var r2 = 0; r2 < 2; r2++) {
        var lt2 = Math.max(0, Math.min(1, (t2 - 14 - i * 4 - r2 * 12) / 12));
        if (lt2 <= 0) continue;
        var bx5 = 12 + i * 38, by5 = (150 + r2 * 15) - (1 - lt2) * (1 - lt2) * 170;
        var smashed = t2 > impactT && Math.abs(bx5 + 17 - 200) < 62;
        if (smashed) continue;
        ctx.fillStyle = rowCols[(i + r2) % rowCols.length];
        ctx.fillRect(bx5, by5, 34, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(bx5, by5, 34, 2);
      }
    }
    // the ball drops, smashes through, shards everywhere
    if (t2 > 68) {
      var byp, bxp = 200;
      if (t2 <= impactT) {
        var fp = (t2 - 68) / (impactT - 68);
        byp = -10 + fp * fp * 165;
      } else {
        byp = 155 + Math.abs(Math.sin((t2 - impactT) * 0.09)) * 70;
      }
      ctx.fillStyle = 'rgba(255,20,147,0.3)';
      ctx.fillRect(bxp - 2, byp - 16, 4, 12);
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(bxp, byp, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (t2 > impactT && t2 < impactT + 26) {
      var sp2 = t2 - impactT;
      if (sp2 < 5) {
        ctx.fillStyle = 'rgba(255,255,255,' + ((5 - sp2) * 0.12).toFixed(2) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      for (var k = 0; k < 14; k++) {
        var ang2 = (k / 14) * Math.PI * 2;
        var dist2 = sp2 * (2 + (k % 3));
        ctx.fillStyle = rowCols[k % rowCols.length];
        ctx.globalAlpha = Math.max(0, 1 - sp2 / 26);
        ctx.fillRect(200 + Math.cos(ang2) * dist2, 158 + Math.sin(ang2) * dist2 + sp2 * sp2 * 0.05, 4, 4);
      }
      ctx.globalAlpha = 1;
    }
    if (t2 > 130) { ctx.fillStyle = CYAN; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('BREAK THE WHOLE BOOK', W / 2, 250); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARROWS, MOUSE or DRAG // SPACE launches and fires lasers', W / 2, H - 42);
    ctx.fillText('chain bricks without a paddle touch for up to x8 // catch capsules', W / 2, H - 29);
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

  // ── Drawing helpers ──
  function drawBrick(b) {
    var x = b.x, y = b.y;
    if (b.grow > 0) {
      ctx.globalAlpha = 1 - b.grow / 24;
      ctx.fillStyle = b.color;
      ctx.fillRect(x + b.grow / 2, y + b.grow / 4, BW - b.grow, BH - b.grow / 2);
      ctx.globalAlpha = 1;
      return;
    }
    if (b.kind === 'core') {
      var armored = coreShielded(b);
      var cp = 0.5 + 0.5 * Math.sin(frame * 0.12);
      var cg = ctx.createRadialGradient(x + BW / 2, y + BH / 2, 1, x + BW / 2, y + BH / 2, BW);
      cg.addColorStop(0, armored ? '#9aa3ad' : PINK);
      cg.addColorStop(1, armored ? '#2a2f36' : '#5a0030');
      ctx.fillStyle = cg;
      ctx.fillRect(x - 1, y - 1, BW + 2, BH + 2);
      if (armored) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + cp * 0.3).toFixed(2) + ')';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, BW - 1, BH - 1);
        ctx.fillStyle = '#c9d1d9';
        ctx.fillRect(x + 3, y + 3, 2, 2); ctx.fillRect(x + BW - 5, y + 3, 2, 2); ctx.fillRect(x + 3, y + BH - 5, 2, 2); ctx.fillRect(x + BW - 5, y + BH - 5, 2, 2);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + cp * 0.5).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x + BW / 2, y + BH / 2, 3 + cp * 2, 0, Math.PI * 2); ctx.fill();
        if (b.pulse > 0) { b.pulse--; ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x, y, BW, BH); }
      }
      for (var hp = 0; hp < b.hp; hp++) { ctx.fillStyle = armored ? '#5e6670' : '#fff'; ctx.fillRect(x + 4 + hp * 8, y - 4, 6, 2); }
      return;
    }
    if (b.kind === 'pot') {
      var pot = ctx.createLinearGradient(x, y, x, y + BH);
      pot.addColorStop(0, '#3a2b5a'); pot.addColorStop(1, '#120a1e');
      ctx.fillStyle = pot;
      ctx.fillRect(x, y, BW, BH);
      ctx.fillStyle = PINK;
      var lvl = BH * (b.hp / b.maxHp);
      ctx.fillRect(x + 3, y + BH - lvl, BW - 6, lvl - 1);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + 4, y + 2, BW - 8, 1);
      ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, BW - 1, BH - 1);
      return;
    }
    if (b.kind === 'gold') {
      var gg = ctx.createLinearGradient(x, y, x + BW, y + BH);
      gg.addColorStop(0, '#ffe680'); gg.addColorStop(0.5, '#d4a017'); gg.addColorStop(1, '#ffe680');
      ctx.fillStyle = gg;
      ctx.fillRect(x, y, BW, BH);
      // a shimmer sweeps across the gold
      var sw = ((frame * 1.6 + b.seed * 200) % (BW + 30)) - 15;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + Math.max(0, sw), y + 1, Math.max(0, Math.min(6, BW - sw)), BH - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x, y, BW, 1);
      ctx.fillStyle = 'rgba(90,60,0,0.6)'; ctx.fillRect(x, y + BH - 2, BW, 2);
      return;
    }
    if (b.kind === 'bomb') {
      var pulse = 0.5 + 0.5 * Math.sin(frame * 0.18 + b.seed * 6);
      ctx.fillStyle = '#1b1226';
      ctx.fillRect(x, y, BW, BH);
      ctx.fillStyle = 'rgba(255,138,0,' + (0.15 + pulse * 0.25).toFixed(2) + ')';
      ctx.fillRect(x + 1, y + 1, BW - 2, BH - 2);
      // the ink drop
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(x + BW / 2, y + 7, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + BW / 2 - 3, y + 6); ctx.lineTo(x + BW / 2, y + 1.5); ctx.lineTo(x + BW / 2 + 3, y + 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + BW / 2 - 1, y + 6, 1, 1);
      ctx.strokeStyle = 'rgba(255,138,0,' + (0.4 + pulse * 0.5).toFixed(2) + ')';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, BW - 1, BH - 1);
      return;
    }
    if (b.kind === 'tough') {
      // steel: brushed, riveted, cracked once it has taken a hit
      var sg = ctx.createLinearGradient(x, y, x, y + BH);
      sg.addColorStop(0, '#9aa3ad'); sg.addColorStop(0.5, '#5e6670'); sg.addColorStop(1, '#3c424a');
      ctx.fillStyle = sg;
      ctx.fillRect(x, y, BW, BH);
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x + 2, y + 3, BW - 4, BH - 6);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#c9d1d9';
      ctx.fillRect(x + 2, y + 2, 2, 2); ctx.fillRect(x + BW - 4, y + 2, 2, 2);
      ctx.fillRect(x + 2, y + BH - 4, 2, 2); ctx.fillRect(x + BW - 4, y + BH - 4, 2, 2);
      if (b.hp < b.maxHp) {
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        var cx0 = x + 6 + b.seed * (BW - 12);
        ctx.moveTo(cx0, y); ctx.lineTo(cx0 - 3, y + 4); ctx.lineTo(cx0 + 2, y + 7); ctx.lineTo(cx0 - 2, y + BH);
        ctx.moveTo(cx0 + 2, y + 7); ctx.lineTo(cx0 + 8, y + 9);
        ctx.stroke();
      }
      return;
    }
    // plain flash: bevelled tile with a hint of the sheet's linework
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, BW, BH);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    var lw = 3 + Math.floor(b.seed * 4);
    ctx.fillRect(x + 4, y + 4, BW - 8, 1);
    ctx.fillRect(x + 4 + lw, y + 7, BW - 8 - lw * 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x, y, BW, 1); ctx.fillRect(x, y, 1, BH);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + BH - 1, BW, 1); ctx.fillRect(x + BW - 1, y, 1, BH);
  }

  function drawPaddle() {
    var x = paddle.x, y = paddle.y, w = paddle.w;
    // the machine frame: a dark steel bar with a grip tube and two coils
    var pg = ctx.createLinearGradient(x, y, x, y + paddle.h);
    pg.addColorStop(0, '#d9dee4'); pg.addColorStop(0.5, '#8a929b'); pg.addColorStop(1, '#4a5058');
    ctx.fillStyle = pg;
    ctx.fillRect(x, y, w, paddle.h);
    ctx.fillStyle = '#2a2f36';
    ctx.fillRect(x, y + paddle.h, w, 3);
    // coils
    for (var k = 0; k < 2; k++) {
      var cx = x + w * (k === 0 ? 0.28 : 0.72);
      ctx.fillStyle = '#c47a2c';
      ctx.fillRect(cx - 5, y - 4, 10, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (var q = 0; q < 4; q++) ctx.fillRect(cx - 4 + q * 2.5, y - 4, 1, 5);
    }
    // grip + needle bar at the center
    ctx.fillStyle = paddleFlash > 0 ? '#ff8ad0' : PINK;
    ctx.fillRect(x + w / 2 - 6, y - 1, 12, paddle.h + 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + w / 2 - 0.5, y - 6, 1, 6);
    // gear lights
    if (laserT > 0) {
      var lp = 0.5 + 0.5 * Math.sin(frame * 0.4);
      ctx.fillStyle = 'rgba(255,215,0,' + (0.5 + lp * 0.5).toFixed(2) + ')';
      ctx.fillRect(x + 3, y - 3, 4, 3); ctx.fillRect(x + w - 7, y - 3, 4, 3);
    }
    if (stickyT > 0) {
      ctx.fillStyle = 'rgba(91,215,91,0.85)';
      ctx.fillRect(x + 2, y - 1, w - 4, 2);
    }
    if (wideT > 0) {
      ctx.fillStyle = 'rgba(0,255,255,0.7)';
      ctx.fillRect(x, y + 2, 4, paddle.h - 4); ctx.fillRect(x + w - 4, y + 2, 4, paddle.h - 4);
    }
    ctx.fillStyle = paddleFlash > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
    ctx.fillRect(x, y, w, 1);
    if (paddleFlash > 0) {
      ctx.fillStyle = 'rgba(255,20,147,' + (paddleFlash * 0.05).toFixed(2) + ')';
      ctx.fillRect(x - 4, y - 6, w + 8, paddle.h + 12);
    }
  }

  function drawCapsule(d) {
    var dc = DROP_COLORS[d.kind] || '#fff';
    var wob = Math.sin(d.spin) * 2;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-9 + wob, -4, 18, 11);
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(-9, -5, 18, 10);
    ctx.fillStyle = dc;
    ctx.fillRect(-9, -5, 18, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-9, -5, 18, 1);
    ctx.fillStyle = '#14121a';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(DROP_NAMES[d.kind] || '?', 0, 4);
    ctx.restore();
  }

  function drawGearBar(x, y, label, t, max, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, 54, 9);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, 54 * t / max), 9);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 3, y + 7);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var d0 = design();
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 1.6, (Math.random() - 0.5) * shake * 1.6);

    // ── The room: dark parlor wall in this sheet's ink ──
    ctx.fillStyle = '#100a18';
    ctx.fillRect(-10, -10, W + 20, H + 20);
    var tint = ctx.createRadialGradient(W / 2, 120, 30, W / 2, 120, 260);
    tint.addColorStop(0, d0.color + '22');
    tint.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);
    // slow diagonal hatch, like a wall of pinned paper
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    var off = (frame * 0.15) % 24;
    ctx.beginPath();
    for (var hx = -H; hx < W + H; hx += 24) { ctx.moveTo(hx + off, 0); ctx.lineTo(hx + off + H, H); }
    ctx.stroke();
    // ink motes drift up through the light
    for (var i = 0; i < motes.length; i++) {
      var mo = motes[i];
      ctx.fillStyle = 'rgba(255,255,255,' + (0.08 + mo.r * 0.06).toFixed(2) + ')';
      ctx.fillRect(mo.x, mo.y, mo.r, mo.r);
    }
    // neon ceiling line flickers in the sheet's color
    var flick = frame % 97 < 3 ? 0.35 : 1;
    ctx.fillStyle = d0.color;
    ctx.globalAlpha = 0.9 * flick;
    ctx.fillRect(0, 16, W, 2);
    ctx.globalAlpha = 0.25 * flick;
    ctx.fillRect(0, 18, W, 6);
    ctx.globalAlpha = 1;

    // Needle bars
    for (var si = 0; si < shields.length; si++) {
      var sh = shields[si];
      var sg = ctx.createLinearGradient(sh.x, sh.y, sh.x, sh.y + 6);
      sg.addColorStop(0, '#e6ebf0'); sg.addColorStop(0.5, '#7c858f'); sg.addColorStop(1, '#3a4048');
      ctx.fillStyle = sg;
      ctx.fillRect(sh.x, sh.y, sh.w, 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(sh.x + sh.w - 3, sh.y + 2, 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(sh.x, sh.y + 6, sh.w, 2);
    }

    // Scroll sheets: the line the wall must not cross
    if (sheetKind === 'scroll') {
      ctx.strokeStyle = 'rgba(255,80,80,' + (0.25 + 0.2 * Math.sin(frame * 0.2)).toFixed(2) + ')';
      ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, paddle.y - 34); ctx.lineTo(W, paddle.y - 34); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bricks: the flash design, tile by tile
    for (var i = 0; i < bricks.length; i++) drawBrick(bricks[i]);

    // Boss ink bombs falling on the machine
    for (var i = 0; i < bossBombs.length; i++) {
      var ob = bossBombs[i];
      ctx.fillStyle = '#2b1a3a';
      ctx.beginPath(); ctx.arc(ob.x, ob.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ob.x - 4, ob.y - 2); ctx.lineTo(ob.x, ob.y - 9); ctx.lineTo(ob.x + 4, ob.y - 2); ctx.fill();
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(ob.x, ob.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    drawPaddle();
    if (stunT > 0) {
      ctx.fillStyle = 'rgba(43,26,58,0.85)';
      ctx.fillRect(paddle.x - 3, paddle.y - 4, paddle.w + 6, paddle.h + 8);
      ctx.fillStyle = PINK; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('INKED', paddle.x + paddle.w / 2, paddle.y + 6);
    }

    // Trails + every ball in flight
    for (var i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (i / trail.length) * 0.35;
      ctx.fillStyle = trail[i].fire ? '#FF8A00' : PINK;
      var ts = 1 + (i / trail.length) * 3;
      ctx.fillRect(trail[i].x - ts / 2, trail[i].y - ts / 2, ts, ts);
    }
    ctx.globalAlpha = 1;
    for (var i = 0; i < balls.length; i++) {
      var bl = balls[i];
      var hot = fireT > 0 && !bl.stuck;
      var glow = ctx.createRadialGradient(bl.x, bl.y, 1, bl.x, bl.y, hot ? 14 : 9);
      glow.addColorStop(0, hot ? 'rgba(255,138,0,0.7)' : 'rgba(255,20,147,0.55)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(bl.x - 14, bl.y - 14, 28, 28);
      ctx.fillStyle = hot ? '#FF8A00' : PINK;
      ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(bl.x - 1.5, bl.y - 2.5, 2, 2);
      if (hot) {
        ctx.fillStyle = 'rgba(255,230,120,' + (0.4 + 0.4 * Math.random()).toFixed(2) + ')';
        ctx.fillRect(bl.x - 2, bl.y - 7 - Math.random() * 3, 4, 4);
      }
    }

    for (var i = 0; i < drops.length; i++) drawCapsule(drops[i]);

    // Laser needles
    for (var i = 0; i < lasers.length; i++) {
      ctx.fillStyle = 'rgba(255,215,0,0.35)';
      ctx.fillRect(lasers[i].x - 2, lasers[i].y - 8, 4, 12);
      ctx.fillStyle = YELLOW;
      ctx.fillRect(lasers[i].x - 1, lasers[i].y - 6, 2, 8);
      ctx.fillStyle = '#fff';
      ctx.fillRect(lasers[i].x - 0.5, lasers[i].y - 6, 1, 3);
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (var i = 0; i < sparks.length; i++) {
      ctx.strokeStyle = 'rgba(255,138,0,' + (sparks[i].life / 14).toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sparks[i].x, sparks[i].y, sparks[i].r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + (flashT / 40).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // ── HUD ──
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 12);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 100, 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = sheetKind === 'boss' ? PINK : YELLOW;
    ctx.fillText((sheetKind === 'boss' ? 'BOSS ' : 'SHEET ') + level + ': ' + d0.name, W - 8, 12);
    if (sheetKind === 'boss' && mode === 'play') {
      // The piece's health: bricks left
      var hpw = 120, hpx = W / 2 - hpw / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(hpx - 1, 20, hpw + 2, 6);
      ctx.fillStyle = bricks.length <= 1 ? YELLOW : PINK;
      ctx.fillRect(hpx, 21, hpw * Math.min(1, bricks.length / Math.max(1, bossMax)), 4);
    }
    // the chain meter
    if (mode === 'play' && chain > 0) {
      var m = mult();
      var pulse = 1 + 0.08 * Math.sin(frame * 0.35);
      ctx.textAlign = 'right';
      ctx.font = 'bold ' + Math.round(11 * (m >= 4 ? pulse : 1)) + 'px monospace';
      ctx.fillStyle = m >= 6 ? PINK : m >= 4 ? YELLOW : m > 1 ? CYAN : '#9aa';
      ctx.fillText('CHAIN ' + chain + '  x' + m, W - 8, 26);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(W - 62, 29, 54, 3);
      ctx.fillStyle = m >= 6 ? PINK : m >= 4 ? YELLOW : CYAN;
      ctx.fillRect(W - 62, 29, 54 * (m === 8 ? 1 : (chain % 2) / 2), 3);
    }
    // gear timers
    if (mode === 'play') {
      var gy = 20, gx = 8;
      if (wideT > 0) { drawGearBar(gx, gy, 'WIDE', wideT, 1200, CYAN); gx += 58; }
      if (laserT > 0) { drawGearBar(gx, gy, 'LASER', laserT, 800, YELLOW); gx += 58; }
      if (stickyT > 0) { drawGearBar(gx, gy, 'STICKY', stickyT, 900, '#5bd75b'); gx += 58; }
      if (fireT > 0) { drawGearBar(gx, gy, 'HOT', fireT, 480, '#FF8A00'); gx += 58; }
      if (magnetT > 0) { drawGearBar(gx, gy, 'MAGNET', magnetT, 720, '#8fd3ff'); gx += 58; }
      if (splitReady) { drawGearBar(gx, gy, 'SPLIT', 1, 1, '#ff77ff'); gx += 58; }
    }
    // Sheet intro card: the design, who drew it, and what this wall does
    if (cardT > 0 && mode === 'play' && clearT === 0) {
      ctx.globalAlpha = Math.min(1, cardT / 20);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(30, 108, W - 60, 96);
      ctx.strokeStyle = d0.color; ctx.lineWidth = 2; ctx.strokeRect(30, 108, W - 60, 96);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa'; ctx.font = 'bold 9px monospace';
      ctx.fillText(sheetKind === 'boss' ? 'BOSS SHEET ' + level : 'SHEET ' + level, W / 2, 126);
      ctx.fillStyle = d0.color; ctx.font = 'bold 22px monospace';
      ctx.fillText(d0.name, W / 2, 152);
      ctx.fillStyle = '#fff'; ctx.font = '10px monospace';
      ctx.fillText('drawn by ' + d0.artist, W / 2, 170);
      ctx.fillStyle = sheetKind === 'boss' ? PINK : CYAN; ctx.font = 'bold 9px monospace';
      ctx.fillText(kindLine(sheetKind), W / 2, 190);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }
    if (bannerT > 0 && mode === 'play') {
      bannerT--;
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = d0.color;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 40);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }

    // Sheet clear tally
    if (clearT > 0 && mode === 'play') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(40, 96, W - 80, 30 + clearLines.length * 22);
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = d0.color;
      ctx.fillText('SHEET CLEAR', W / 2, 118);
      ctx.font = 'bold 12px monospace';
      var ly = 142;
      for (var li = 0; li < clearLines.length; li++) {
        if (!clearLines[li].shown) continue;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.fillText(clearLines[li].t, 60, ly);
        ctx.textAlign = 'right';
        ctx.fillStyle = YELLOW;
        ctx.fillText('+' + clearLines[li].pts, W - 60, ly);
        ly += 22;
      }
    }

    var anyStuck = false;
    for (var i = 0; i < balls.length; i++) if (balls[i].stuck) anyStuck = true;
    if (anyStuck && mode === 'play' && clearT === 0) {
      ctx.fillStyle = '#9aa';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SPACE or TAP to launch', W / 2, H / 2 + 40);
    }

    // Popups
    ctx.textAlign = 'center';
    for (var i = 0; i < popups.length; i++) {
      ctx.globalAlpha = Math.min(1, popups[i].life / 18);
      ctx.font = 'bold ' + (popups[i].big ? 14 : 11) + 'px monospace';
      ctx.fillStyle = popups[i].color;
      ctx.fillText(popups[i].text, popups[i].x, popups[i].y);
    }
    ctx.globalAlpha = 1;

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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-bricks', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
