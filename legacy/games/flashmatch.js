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
  function sfxFlip() { playSfx(500, 0.05, 'square', 0.08); }
  function sfxMatch(mult) { var b = 800 + (mult - 1) * 90; playSfx(b, 0.08, 'square', 0.11); setTimeout(function(){playSfx(b * 1.375, 0.1, 'square', 0.11);}, 70); if (mult >= 3) setTimeout(function(){playSfx(b * 1.8, 0.12, 'square', 0.1);}, 140); }
  function sfxMiss() { playSfx(240, 0.12, 'sawtooth', 0.09); }
  function sfxBad() { playSfx(160, 0.25, 'sawtooth', 0.13); setTimeout(function(){playSfx(110, 0.3, 'sawtooth', 0.12);}, 120); }
  function sfxPeek() { playSfx(1200, 0.05, 'square', 0.08); setTimeout(function(){playSfx(1600, 0.05, 'square', 0.08);}, 50); setTimeout(function(){playSfx(2000, 0.09, 'square', 0.08);}, 100); }
  function sfxWild() { for (var i = 0; i < 5; i++) (function(i){ setTimeout(function(){ playSfx(600 + i * 160, 0.07, 'square', 0.1); }, i * 45); })(i); }
  function sfxShuffle() { for (var i = 0; i < 6; i++) (function(i){ setTimeout(function(){ playSfx(300 + (i % 2) * 220, 0.04, 'square', 0.07); }, i * 60); })(i); }
  function sfxClear() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); setTimeout(function(){playSfx(1600, 0.25, 'square', 0.12);}, 320); }
  function sfxTick() { playSfx(90, 0.08, 'sawtooth', 0.07); }
  function sfxSteal() { playSfx(330, 0.12, 'sawtooth', 0.1); setTimeout(function(){playSfx(220, 0.2, 'sawtooth', 0.1);}, 110); }
  function sfxSnatch() { playSfx(1100, 0.06, 'square', 0.1); setTimeout(function(){playSfx(1500, 0.1, 'square', 0.1);}, 60); }
  function sfxNote(i) { playSfx(440 * Math.pow(2, (i % 8) / 12 * 2), 0.14, 'triangle', 0.12); }
  function sfxFreeze() { for (var i = 0; i < 4; i++) (function(i){ setTimeout(function(){ playSfx(1800 - i * 300, 0.09, 'triangle', 0.1); }, i * 70); })(i); }
  function sfxCash() { playSfx(1320, 0.05, 'square', 0.09); setTimeout(function(){playSfx(1760, 0.07, 'square', 0.09);}, 45); setTimeout(function(){playSfx(2200, 0.1, 'square', 0.08);}, 90); }


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

  // ── This game's own chiptune: playful quiz-floor swing ──
  var SONGS = [
    { root: 146.83, bass: [0,-1,4,-1, 7,-1,4,-1, 0,-1,4,-1, 9,-1,7,4], lead: [12,-1,16,-1, 19,16,-1,12, 14,-1,17,-1, 21,-1,19,16] },
    { root: 130.81, bass: [0,4,-1,7, -1,4,0,-1, 5,9,-1,12, -1,9,5,-1], lead: [16,-1,12,-1, 19,-1,16,-1, 21,-1,17,-1, 24,21,19,16] },
    { root: 164.81, bass: [0,-1,0,7, 5,-1,5,3, 0,-1,0,7, 10,-1,8,7], lead: [12,15,-1,19, -1,15,12,-1, 17,19,-1,22, 19,-1,17,15] },
  ];
  var MENU_SONG = { root: 146.83, bass: [0,-1,7,4, 0,-1,9,7, 0,-1,7,4, 10,9,7,-1], lead: [16,19,-1,16, -1,21,19,-1, 16,19,-1,24, 21,-1,19,16] };
  var musicStep = -1, musicFrame = 0, jingleT = 0;
  function musicTick() {
    if (jingleT > 0) { jingleT--; return; }
    var menu = mode !== 'play';
    var hurry = !menu && timer / timerMax < 0.25;
    var stepFrames = menu ? 12 : Math.max(hurry ? 7 : 9, 15 - level);
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

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', PURPLE = '#9b59b6', RED = '#ff4444', ORANGE = '#ff9a3c';
  var COLS = 4, ROWS = 4;
  var CW = 82, CHH = 56, GAP = 8;
  var GX = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
  var GY = 44;

  // Built-in flash: the American-traditional canon, drawn as outlined pixel
  // art so every card reads bold on the paper. Eighteen sheets cover the
  // biggest grid without a repeat.
  var DOODLES = ['heart', 'swallow', 'anchor', 'rose', 'dagger', 'skull', 'star', 'horseshoe', 'snake', 'eye', 'bolt', 'cherry', 'moon', 'spider', 'crown', 'dice', 'flame', 'sun'];

  // ── Four ways to play, one per session, round and round ──
  // CLASSIC: find the pairs while a rival across the table hunts them too.
  // SPEED: pairs light up for a beat; tap both before they fade.
  // ORDER: a client asks for a piece by name; find it in the face-down sheet.
  // TRACE: the sheet flips a sequence; repeat it. Longer every round.
  var MODES = ['classic', 'speed', 'order', 'trace'];
  var MODE_NAME = { classic: 'CLASSIC SHEET', speed: 'SPEED SHEET', order: 'CLIENT ORDER', trace: 'TRACE' };
  var MODE_RULES = {
    classic: ['find every pair before the clock dies', 'the rival across the table hunts pairs too // grab them first'],
    speed: ['a pair lights up for a beat', 'tap both before they fade // chain them for more'],
    order: ['the client wants a piece by name', 'find one of its cards in the sheet // fast pays more'],
    trace: ['the sheet flips a sequence', 'tap the same cards in the same order // it grows each round'],
  };
  function modeFor(lvl) { return lvl === 1 ? 'classic' : MODES[(lvl - 1) % 4]; }

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, level, frame;
  var cards, first, second, missT, timer, timerMax, streak, bannerT, bannerText, faces;
  var pairs, peekT, shuffleT, shuffled, misses, sheetMisses, bestStreak, lastMatchF, shake, tickCd;
  var popups, parts, grain, matchesTotal;
  var sm, rulesT, freezeT, doubleT, badLampT, cash;
  var rival, sp, ord, tr, bestTrace, bestChain, ordersDone, stolen, snatched;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-flashmatch') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-flashmatch', String(best)); } catch(e) {} }
  }

  // Deal the artist's flash wall onto the cards: the page hands the piece
  // urls over via window.__ROOM_FLASH__; classic tattoo doodles fill the gaps
  // (an empty wall means a full sheet of them).
  function collectFaces() {
    faces = [];
    var srcs = (window.__ROOM_FLASH__ || []).slice(0, 8);
    for (var i = 0; i < srcs.length; i++) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.src = srcs[i];
      faces.push({ type: 'img', img: im, name: 'SHEET ' + (i + 1) });
    }
    for (var i = 0; faces.length < DOODLES.length; i++) faces.push({ type: 'doodle', id: DOODLES[i % DOODLES.length], name: DOODLES[i % DOODLES.length].toUpperCase() });
  }
  function faceName(fi) { var f = faces[fi]; return f ? f.name : 'FLASH'; }

  // Every session is a bigger, meaner sheet. Specials only ride the pair
  // modes: peek = a stencil that shows the whole sheet for a beat, wild =
  // matches anything and takes its partner too, bad = a botched tattoo that
  // costs time, freeze = stops the clock, double = twice the points for a
  // while, scramble = the rival forgets everything it has seen.
  function layoutFor(lvl, m) {
    if (m === 'order') return { cols: lvl <= 4 ? 4 : 6, rows: 3, cw: lvl <= 4 ? 82 : 56 };
    if (m === 'trace') return { cols: 4, rows: 3, cw: 82 };
    var cols = lvl <= 2 ? 4 : lvl <= 4 ? 5 : 6;
    return { cols: cols, rows: 4, cw: cols === 4 ? 82 : cols === 5 ? 68 : 56 };
  }
  function specialsFor(lvl, m) {
    if (m !== 'classic') return [];
    if (lvl === 1) return [];
    if (lvl <= 4) return ['peek', 'wild', 'freeze'];
    if (lvl <= 8) return ['peek', 'wild', 'bad', 'freeze', 'double', 'scramble'];
    return ['peek', 'wild', 'bad', 'bad', 'freeze', 'double', 'scramble', 'wild'];
  }
  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function dealCards() {
    sm = modeFor(level);
    var L = layoutFor(level, sm);
    COLS = L.cols; ROWS = L.rows; CW = L.cw;
    GX = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
    GY = sm === 'order' ? 92 : 44;
    var specials = specialsFor(level, sm);
    var deck = [];
    if (sm === 'trace') {
      // One of everything, no pairs: the sequence needs distinct faces.
      pairs = COLS * ROWS;
      var pool0 = shuffleArr(faces.map(function(f, i) { return i; })).slice(0, pairs);
      for (var q = 0; q < pairs; q++) deck.push({ kind: 'pair', face: pool0[q] });
    } else {
      pairs = (COLS * ROWS - specials.length) / 2;
      var pool = shuffleArr(faces.map(function(f, i) { return i; })).slice(0, pairs);
      for (var i = 0; i < pairs; i++) { deck.push({ kind: 'pair', face: pool[i] }); deck.push({ kind: 'pair', face: pool[i] }); }
      for (var s = 0; s < specials.length; s++) deck.push({ kind: specials[s], face: -1 });
    }
    shuffleArr(deck);
    cards = deck.map(function(d, i) {
      var col = i % COLS, row = Math.floor(i / COLS);
      var p = cardPos(col, row);
      return { kind: d.kind, face: d.face, state: 'down', flipT: 0, dealT: 14 + i * 3, col: col, row: row, px: p.x, py: p.y - 90, seen: 0, glowT: 0, shakeT: 0, glowColor: LIME, held: false, holdT: 0, rseen: false };
    });
    first = null; second = null; missT = 0; peekT = 0; shuffleT = 0; shuffled = false; sheetMisses = 0;
    freezeT = 0; doubleT = 0;
    var secPerPair = Math.max(5, 11 - (level - 1));
    if (sm === 'classic') timerMax = pairs * secPerPair * 60;
    else if (sm === 'speed') timerMax = pairs * Math.max(5, 9 - Math.floor(level / 3)) * 60;
    else if (sm === 'order') timerMax = ordersFor() * Math.max(7, 12 - Math.floor(level / 3)) * 60;
    else timerMax = traceRoundsFor() * Math.max(9, 14 - Math.floor(level / 3)) * 60;
    timer = timerMax;
    cursor.col = Math.min(cursor.col, COLS - 1); cursor.row = Math.min(cursor.row, ROWS - 1);
    rulesT = level === 1 ? 0 : 170;
    // Mode state
    rival = { cd: rivalEvery(), phase: 'idle', x: W / 2, y: -30, tx: W / 2, ty: -30, t: 0, a: null, b: null, peekT: 0 };
    sp = { a: null, b: null, t: 0, next: 60, chain: 0, window: Math.max(60, 120 - level * 5), done: 0 };
    ord = { face: -1, t: 0, max: 1, done: 0, total: ordersFor(), thanksT: 0, line: '' };
    tr = { seq: [], show: true, idx: 0, showT: 0, inputIdx: 0, round: 1, rounds: traceRoundsFor(), gapT: 40, doneT: 0 };
    if (sm === 'order') nextOrder();
    if (sm === 'trace') newTraceRound(3);
  }
  function rivalEvery() { return Math.max(140, 330 - level * 22); }
  function ordersFor() { return 3 + Math.floor(level / 4); }
  function traceRoundsFor() { return 3 + Math.floor(level / 4); }
  function cardPos(col, row) { return { x: GX + col * (CW + GAP), y: GY + row * (CHH + GAP) }; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; level = 1; frame = 0; streak = 0; bestStreak = 0; misses = 0; matchesTotal = 0;
    lastMatchF = -999; shake = 0; tickCd = 0; popups = []; parts = []; cash = [];
    bestTrace = 0; bestChain = 0; ordersDone = 0; stolen = 0; snatched = 0; badLampT = 0;
    mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0; bannerT = 0; bannerText = '';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    collectFaces();
    cursor = { col: 0, row: 0 };
    dealCards();
    if (!grain) {
      grain = [];
      for (var i = 0; i < 90; i++) grain.push({ y: Math.random() * H, a: 0.03 + Math.random() * 0.05, w: 0.5 + Math.random() * 1.5 });
    }
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Tap the cards // four ways to play' : 'Tap a card, or arrows + SPACE // four ways to play';
    window.skateRunning = true;
    startLoop();
  }

  var cursor = { col: 0, row: 0 };

  function cardAt(col, row) {
    for (var i = 0; i < cards.length; i++) if (cards[i].col === col && cards[i].row === row) return cards[i];
    return null;
  }
  function addScore(n) {
    if (doubleT > 0) n *= 2;
    score += n;
    document.getElementById('jd-br-score').textContent = score;
    return n;
  }
  function popup(x, y, text, color, big) {
    popups.push({ x: x, y: y, text: text, color: color || '#fff', life: big ? 70 : 50, big: !!big });
  }
  function burst(x, y, color, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp2 = (0.6 + Math.random()) * (speed || 2.2);
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2 - 1, life: 26 + Math.random() * 22, color: color, s: 2 + Math.random() * 2 });
    }
  }
  // Chips and cash fly when a score lands big.
  function flyCash(x, y, n) {
    for (var i = 0; i < n; i++) cash.push({ x: x + (Math.random() - 0.5) * 30, y: y, vx: (Math.random() - 0.5) * 3, vy: -2.5 - Math.random() * 2.5, life: 50 + Math.random() * 20, chip: Math.random() < 0.4, rot: Math.random() * 6 });
    sfxCash();
  }
  function center(c) { return { x: c.px + CW / 2, y: c.py + CHH / 2 }; }
  function live(c) { return c.kind === 'pair' && c.state !== 'matched' && c.state !== 'stolen'; }
  function remainingPairs() {
    var n = 0;
    for (var i = 0; i < cards.length; i++) if (live(cards[i])) n++;
    return sm === 'trace' ? n : n / 2;
  }
  function putDown(c) { if (c) { c.state = 'down'; c.seen++; } }
  function mult() { return Math.min(5, Math.max(1, streak)); }
  function miss(a, b, penalty) {
    streak = 0;
    misses++; sheetMisses++;
    if (a) a.shakeT = 14;
    if (b) b.shakeT = 14;
    if (penalty) { timer = Math.max(1, timer - penalty); shake = Math.max(shake, 6); }
    sfxMiss();
  }

  // ── Flipping, by mode ──
  function flip(card) {
    if (!card || rulesT > 0 || peekT > 0 || shuffleT > 0) return;
    if (sm === 'speed') { flipSpeed(card); return; }
    if (sm === 'order') { flipOrder(card); return; }
    if (sm === 'trace') { flipTrace(card); return; }
    flipClassic(card);
  }

  function flipClassic(card) {
    if (card.state !== 'down' || missT > 0 || card.held) return;
    card.state = 'up';
    card.flipT = 10;
    sfxFlip();
    var ctr = center(card);
    if (card.kind === 'peek') {
      putDown(first); first = null;
      card.state = 'gone';
      peekT = 80;
      popup(ctr.x, ctr.y, 'STENCIL PEEK', CYAN, true);
      burst(ctr.x, ctr.y, CYAN, 14, 2.5);
      sfxPeek();
      return;
    }
    if (card.kind === 'bad') {
      putDown(first); first = null;
      card.state = 'bad';
      timer = Math.max(1, timer - 300);
      streak = 0;
      shake = 14; badLampT = 45;
      card.shakeT = 20;
      popup(ctr.x, ctr.y, 'BAD TATTOO -5s', RED, true);
      burst(ctr.x, ctr.y, RED, 16, 2.6);
      sfxBad();
      return;
    }
    if (card.kind === 'freeze') {
      putDown(first); first = null;
      card.state = 'gone';
      freezeT = 300;
      popup(ctr.x, ctr.y, 'FREEZE // CLOCK STOPS 5s', CYAN, true);
      burst(ctr.x, ctr.y, '#bff', 18, 2.4);
      sfxFreeze();
      return;
    }
    if (card.kind === 'double') {
      putDown(first); first = null;
      card.state = 'gone';
      doubleT = 600;
      popup(ctr.x, ctr.y, 'DOUBLE INK // x2 FOR 10s', YELLOW, true);
      burst(ctr.x, ctr.y, YELLOW, 18, 2.6);
      sfxWild();
      return;
    }
    if (card.kind === 'scramble') {
      putDown(first); first = null;
      card.state = 'gone';
      rivalForget();
      popup(ctr.x, ctr.y, 'SCRAMBLE // RIVAL FORGETS', ORANGE, true);
      burst(ctr.x, ctr.y, ORANGE, 18, 2.6);
      sfxShuffle();
      return;
    }
    if (!first) { first = card; return; }
    if (card === first) return;
    second = card;
    var wild = first.kind === 'wild' ? first : second.kind === 'wild' ? second : null;
    if (wild || first.face === second.face) {
      // Beat the rival to it: the pair it was reaching for is yours.
      if (rival.phase !== 'idle' && rival.a && (rival.a === first || rival.a === second || rival.b === first || rival.b === second)) {
        snatched++;
        var sb = 50 * level;
        addScore(sb);
        popup(W / 2, GY - 6, 'SNATCHED +' + sb, LIME, true);
        rivalAbort();
        sfxSnatch();
      }
      match(first, second, wild, 0);
    } else {
      missT = 45;
      miss(first, second, 0);
    }
  }

  function flipSpeed(card) {
    if (card.state === 'lit') {
      card.state = 'got';
      card.flipT = 10;
      card.glowT = 30; card.glowColor = CYAN;
      sfxFlip();
      var a = sp.a, b = sp.b;
      if (a.state === 'got' && b.state === 'got') {
        sp.chain++;
        if (sp.chain > bestChain) bestChain = sp.chain;
        sp.done++;
        var bonus = 25 * sp.chain;
        addScore(bonus);
        popup((center(a).x + center(b).x) / 2, Math.min(center(a).y, center(b).y) - 18, 'SPEED CHAIN x' + sp.chain + ' +' + bonus, CYAN);
        match(a, b, null, 0);
        sp.a = null; sp.b = null; sp.t = 0;
        sp.next = Math.max(20, 50 - level * 2);
      }
      return;
    }
    if (card.state === 'down') {
      // Wrong card: a beat lost and the chain broken.
      card.flipT = 10; card.state = 'up'; card.held = true; card.holdT = 18;
      sp.chain = 0;
      miss(card, null, 60);
      popup(center(card).x, center(card).y - 6, 'WRONG CARD -1s', RED);
    }
  }

  function flipOrder(card) {
    if (card.state !== 'down' || missT > 0 || card.held) return;
    card.state = 'up';
    card.flipT = 10;
    sfxFlip();
    var ctr = center(card);
    if (card.face === ord.face) {
      // That's the piece. Fast pays, memory pays.
      card.state = 'matched'; card.glowT = 40; card.glowColor = LIME;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
      ordersDone++; ord.done++;
      var base = 150 * mult();
      var fast = Math.round((ord.t / ord.max) * 100) * level;
      var pts = addScore(base + fast);
      popup(ctr.x, ctr.y - 6, '+' + pts + (mult() > 1 ? ' x' + mult() : ''), mult() > 1 ? YELLOW : '#fff', true);
      if (fast > 40 * level) popup(ctr.x, ctr.y + 12, 'FAST +' + fast, CYAN);
      if (card.seen === 1) { addScore(60); popup(ctr.x, ctr.y + 26, 'RECALL +60', CYAN); }
      if (pts >= 400) flyCash(ctr.x, ctr.y, 8);
      burst(ctr.x, ctr.y, LIME, 14, 2.4);
      sfxMatch(mult());
      ord.thanksT = 50; ord.line = pickLine(['sick, thanks', 'thats the one', 'yes. love it', 'perfect, book me']);
      if (streak === 3) sayCallout('flashmatch-c2');
      first = null;
      if (ord.done >= ord.total) { clearSheet(); return; }
      nextOrder(true);
    } else {
      // Not it: it shows for a beat so you remember where it lives.
      first = card;
      missT = 30;
      miss(null, null, 0);
      card.shakeT = 10;
    }
  }
  function pickLine(a) { return a[Math.floor(Math.random() * a.length)]; }
  function nextOrder(after) {
    var pool = [];
    for (var i = 0; i < cards.length; i++) if (live(cards[i]) && cards[i].state === 'down' && pool.indexOf(cards[i].face) < 0) pool.push(cards[i].face);
    if (!pool.length) { clearSheet(); return; }
    var f = pool[Math.floor(Math.random() * pool.length)];
    ord.face = f;
    ord.max = Math.max(300, 600 - level * 25);
    ord.t = ord.max;
    if (!after) { ord.thanksT = 0; ord.line = ''; }
  }

  function newTraceRound(len) {
    var pool = cards.slice();
    shuffleArr(pool);
    tr.seq = pool.slice(0, Math.min(len, pool.length));
    tr.show = true; tr.idx = 0; tr.showT = 0; tr.inputIdx = 0; tr.gapT = 40; tr.doneT = 0;
    for (var i = 0; i < cards.length; i++) { cards[i].state = 'down'; cards[i].glowT = 0; }
  }
  function flipTrace(card) {
    if (tr.show || tr.doneT > 0 || card.state !== 'down' && card.state !== 'up') return;
    var want = tr.seq[tr.inputIdx];
    if (card === want) {
      card.flipT = 10; card.state = 'up'; card.glowT = 24; card.glowColor = LIME;
      sfxNote(tr.inputIdx);
      tr.inputIdx++;
      if (tr.inputIdx >= tr.seq.length) {
        // Round traced clean.
        streak++;
        if (streak > bestStreak) bestStreak = streak;
        var len = tr.seq.length;
        if (len > bestTrace) bestTrace = len;
        var pts = addScore(40 * len * mult());
        popup(W / 2, GY + 30, 'TRACE x' + len + ' +' + pts, LIME, true);
        if (len >= 6) { flyCash(W / 2, GY + 40, 10); say('so-sick', 200); }
        burst(W / 2, H / 2, LIME, 24, 3);
        sfxMatch(Math.min(5, len));
        tr.doneT = 50;
      }
    } else {
      // Wrong card: the sequence plays again, a couple of seconds gone.
      card.flipT = 10; card.state = 'up'; card.glowT = 20; card.glowColor = RED;
      miss(card, null, 120);
      popup(center(card).x, center(card).y - 6, 'WRONG -2s', RED);
      tr.show = true; tr.idx = 0; tr.showT = 0; tr.inputIdx = 0; tr.gapT = 50;
    }
  }

  function match(a, b, wild, extra) {
    a.state = 'matched'; b.state = 'matched';
    a.glowT = 40; b.glowT = 40; a.glowColor = LIME; b.glowColor = LIME;
    a.held = false; b.held = false;
    streak++;
    if (streak > bestStreak) bestStreak = streak;
    matchesTotal++;
    var m = mult();
    var mid = { x: (center(a).x + center(b).x) / 2, y: (center(a).y + center(b).y) / 2 };
    var pts = addScore(100 * m + (extra || 0));
    popup(center(b).x, center(b).y - 6, '+' + pts + (m > 1 ? ' x' + m : ''), m > 1 ? YELLOW : '#fff', m >= 3);
    burst(center(a).x, center(a).y, LIME, 10, 2);
    burst(center(b).x, center(b).y, LIME, 10, 2);
    if (streak === 3) sayCallout('flashmatch-c2');
    if (streak === 5) sayCallout('flashmatch-c3');
    if (pts >= 400) flyCash(mid.x, mid.y, 6);
    sfxMatch(m);

    // Recall: you flipped this card once before and came back for it.
    var recalled = 0;
    if (a.seen === 1) recalled++;
    if (b.seen === 1) recalled++;
    if (recalled) {
      var rb = 50 * recalled;
      addScore(rb);
      popup(mid.x, mid.y + 14, (recalled === 2 ? 'PERFECT RECALL' : 'RECALL') + ' +' + rb, CYAN);
    }
    // Quick hands: back to back matches inside a second and a half.
    if (frame - lastMatchF < 90) { addScore(30); popup(mid.x, mid.y + 28, 'QUICK +30', PINK); }
    lastMatchF = frame;

    if (wild) {
      var other = wild === a ? b : a;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (c !== other && c.kind === 'pair' && c.face === other.face && live(c)) {
          c.state = 'matched'; c.flipT = 10; c.glowT = 50; c.glowColor = PINK;
          burst(center(c).x, center(c).y, PINK, 14, 2.6);
        }
      }
      addScore(150);
      popup(center(wild).x, center(wild).y - 20, 'WILD +150', PINK, true);
      sfxWild();
    }
    first = null; second = null;

    var left = remainingPairs();
    if (left === 0) { clearSheet(); return; }
    if (sm === 'classic' && level >= 4 && !shuffled && left <= Math.floor(pairs / 2)) startShuffle();
  }

  function clearSheet() {
    var secs = Math.floor(timer / 60);
    var tb = secs * 10 * level;
    if (tb > 0) { addScore(tb); popup(W / 2, H / 2 + 22, 'TIME +' + tb, CYAN, true); }
    if (sheetMisses === 0) { var pb = 500 * level; addScore(pb); popup(W / 2, H / 2 + 42, 'PERFECT SHEET +' + pb, YELLOW, true); say('so-sick', 500); flyCash(W / 2, H / 2, 12); }
    burst(W / 2, H / 2, YELLOW, 30, 3.5);
    level++;
    sayCallout('flashmatch-c1');
    sfxClear();
    dealCards();
    bannerT = 0;
  }

  function startShuffle() {
    shuffled = true;
    shuffleT = 60;
    bannerT = 70; bannerText = 'SHUFFLE';
    var down = [];
    for (var i = 0; i < cards.length; i++) if (cards[i].state === 'down') down.push(cards[i]);
    var slots = down.map(function(c) { return { col: c.col, row: c.row }; });
    shuffleArr(slots);
    for (var k = 0; k < down.length; k++) { down[k].col = slots[k].col; down[k].row = slots[k].row; down[k].seen = 0; }
    rivalForget();
    sfxShuffle();
  }

  // ── The rival: an artist across the table who wants the same pairs ──
  // It remembers every card that has shown its face. When it knows a pair it
  // reaches for both; otherwise it peeks one card, which you get to see too.
  function rivalForget() { for (var i = 0; i < cards.length; i++) cards[i].rseen = false; }
  function rivalKnownPair() {
    var byFace = {};
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.kind !== 'pair' || c.state !== 'down' || !c.rseen || c === first) continue;
      if (byFace[c.face]) return [byFace[c.face], c];
      byFace[c.face] = c;
    }
    return null;
  }
  function rivalAbort() {
    if (rival.a && rival.a.state === 'up' && rival.a.held) { rival.a.state = 'down'; rival.a.held = false; }
    rival.a = null; rival.b = null; rival.phase = 'return'; rival.tx = W / 2; rival.ty = -30;
  }
  function rivalStep() {
    if (sm !== 'classic' || missT > 0 && rival.phase === 'idle') return;
    rival.x += (rival.tx - rival.x) * 0.18;
    rival.y += (rival.ty - rival.y) * 0.18;
    if (rival.phase === 'idle') {
      if (rival.cd > 0) { rival.cd--; return; }
      var pair = rivalKnownPair();
      if (pair) { rival.a = pair[0]; rival.b = pair[1]; rival.phase = 'reachA'; rival.t = 0; }
      else {
        var down = [];
        for (var i = 0; i < cards.length; i++) if (cards[i].state === 'down' && !cards[i].rseen && cards[i] !== first) down.push(cards[i]);
        if (!down.length) for (var j = 0; j < cards.length; j++) if (cards[j].state === 'down' && cards[j] !== first) down.push(cards[j]);
        if (!down.length) { rival.cd = 60; return; }
        rival.a = down[Math.floor(Math.random() * down.length)]; rival.b = null; rival.phase = 'reachPeek'; rival.t = 0;
      }
      var ca = center(rival.a); rival.tx = ca.x; rival.ty = ca.y - 10;
      return;
    }
    rival.t++;
    if (rival.phase === 'reachPeek') {
      if (rival.t > 26) {
        var c = rival.a;
        if (c.state === 'down') { c.state = 'up'; c.flipT = 10; c.held = true; c.rseen = true; sfxFlip(); }
        rival.phase = 'peeking'; rival.t = 0;
      }
    } else if (rival.phase === 'peeking') {
      if (rival.t > 40) { var cp = rival.a; if (cp.state === 'up') { cp.state = 'down'; cp.seen++; } cp.held = false; rival.a = null; rival.phase = 'return'; rival.tx = W / 2; rival.ty = -30; }
    } else if (rival.phase === 'reachA') {
      if (rival.t > 26) {
        if (rival.a.state !== 'down') { rivalAbort(); return; }
        rival.a.state = 'up'; rival.a.flipT = 10; rival.a.held = true; sfxFlip();
        rival.phase = 'reachB'; rival.t = 0;
        var cb = center(rival.b); rival.tx = cb.x; rival.ty = cb.y - 10;
      }
    } else if (rival.phase === 'reachB') {
      if (rival.t > 24) {
        if (rival.b.state !== 'down') { rivalAbort(); return; }
        rival.b.state = 'up'; rival.b.flipT = 10; rival.b.held = true; sfxFlip();
        rival.phase = 'steal'; rival.t = 0;
      }
    } else if (rival.phase === 'steal') {
      if (rival.t > 22) {
        rival.a.state = 'stolen'; rival.b.state = 'stolen'; rival.a.held = false; rival.b.held = false;
        rival.a.glowT = 30; rival.b.glowT = 30; rival.a.glowColor = RED; rival.b.glowColor = RED;
        stolen++;
        streak = 0;
        popup(W / 2, GY - 6, 'RIVAL TOOK THE ' + faceName(rival.a.face), RED, true);
        sfxSteal();
        rival.a = null; rival.b = null; rival.phase = 'return'; rival.tx = W / 2; rival.ty = -30;
        if (remainingPairs() === 0) { clearSheet(); return; }
      }
    } else if (rival.phase === 'return') {
      if (rival.t > 24) { rival.phase = 'idle'; rival.cd = rivalEvery(); }
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (bannerT > 0) bannerT--;
    if (shake > 0) shake--;
    if (badLampT > 0) badLampT--;
    if (peekT > 0) peekT--;
    if (shuffleT > 0) shuffleT--;
    if (doubleT > 0) doubleT--;
    if (missT > 0) {
      missT--;
      if (missT === 0) {
        if (sm === 'order') { putDown(first); first = null; }
        else if (first && second) { putDown(first); putDown(second); first = null; second = null; }
      }
    }
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.flipT > 0) c.flipT--;
      if (c.dealT > 0) c.dealT--;
      if (c.glowT > 0) c.glowT--;
      if (c.shakeT > 0) c.shakeT--;
      if (c.holdT > 0) { c.holdT--; if (c.holdT === 0) { c.held = false; if (c.state === 'up') { c.state = 'down'; c.seen++; } } }
      if (c.state === 'up' && c.kind === 'pair') c.rseen = true;
      var p = cardPos(c.col, c.row);
      c.px += (p.x - c.px) * 0.22;
      c.py += (p.y - c.py) * 0.22;
    }
    for (var k = popups.length - 1; k >= 0; k--) { popups[k].y -= 0.55; popups[k].life--; if (popups[k].life <= 0) popups.splice(k, 1); }
    for (var m = parts.length - 1; m >= 0; m--) { var pt = parts[m]; pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.09; pt.vx *= 0.97; pt.life--; if (pt.life <= 0) parts.splice(m, 1); }
    for (var n = cash.length - 1; n >= 0; n--) { var ch = cash[n]; ch.x += ch.vx; ch.y += ch.vy; ch.vy += 0.12; ch.rot += 0.15; ch.life--; if (ch.life <= 0) cash.splice(n, 1); }

    // The rules card holds the table still for a beat.
    if (rulesT > 0) { rulesT--; return; }

    if (sm === 'classic') rivalStep();
    if (sm === 'speed') speedStep();
    if (sm === 'order') orderStep();
    if (sm === 'trace') traceStep();

    if (freezeT > 0) { freezeT--; return; }
    timer--;
    if (timer / timerMax < 0.25) {
      if (tickCd > 0) tickCd--;
      else { sfxTick(); tickCd = timer / timerMax < 0.1 ? 30 : 60; }
    }
    if (timer <= 0) {
      lives--;
      document.getElementById('jd-br-lives').textContent = lives;
      if (lives <= 0) {
        enterBoard(score);
        saveBest();
        deathJingle();
        return;
      }
      bannerT = 90;
      bannerText = 'TIME! SAME SHEET, GO AGAIN';
      shake = 10;
      sfxMiss();
      dealCards();
      rulesT = 0;
    }
  }

  function speedStep() {
    if (sp.a) {
      sp.t--;
      if (sp.t <= 0) {
        // Faded: back down, chain gone.
        if (sp.a.state !== 'matched') { sp.a.state = 'down'; sp.a.seen++; }
        if (sp.b.state !== 'matched') { sp.b.state = 'down'; sp.b.seen++; }
        if (sp.chain > 0) popup(W / 2, GY - 6, 'CHAIN LOST', RED);
        sp.chain = 0;
        sp.a = null; sp.b = null;
        sp.next = 30;
      }
      return;
    }
    if (sp.next > 0) { sp.next--; return; }
    var byFace = {};
    var pairsDown = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!live(c) || c.state !== 'down') continue;
      if (byFace[c.face]) pairsDown.push([byFace[c.face], c]); else byFace[c.face] = c;
    }
    if (!pairsDown.length) { if (remainingPairs() === 0) clearSheet(); return; }
    var pick2 = pairsDown[Math.floor(Math.random() * pairsDown.length)];
    sp.a = pick2[0]; sp.b = pick2[1];
    sp.a.state = 'lit'; sp.b.state = 'lit'; sp.a.flipT = 10; sp.b.flipT = 10;
    sp.a.glowT = sp.window; sp.b.glowT = sp.window; sp.a.glowColor = CYAN; sp.b.glowColor = CYAN;
    sp.t = sp.window;
    sfxPeek();
  }

  function orderStep() {
    if (ord.thanksT > 0) ord.thanksT--;
    if (ord.face < 0) return;
    ord.t--;
    if (ord.t <= 0) {
      // The client walked. Next one in.
      streak = 0;
      shake = 8;
      popup(W / 2, 70, 'CLIENT WALKED', RED, true);
      timer = Math.max(1, timer - 120);
      ord.done++;
      sfxBad();
      ord.thanksT = 40; ord.line = pickLine(['forget it', 'too slow', 'ill go elsewhere']);
      if (ord.done >= ord.total) { clearSheet(); return; }
      nextOrder(true);
    }
  }

  function traceStep() {
    if (tr.doneT > 0) {
      tr.doneT--;
      if (tr.doneT === 0) {
        tr.round++;
        if (tr.round > tr.rounds) { clearSheet(); return; }
        newTraceRound(tr.seq.length + 1);
      }
      return;
    }
    if (!tr.show) return;
    if (tr.gapT > 0) { tr.gapT--; return; }
    var STEP = Math.max(18, 34 - level * 2);
    tr.showT++;
    var c = tr.seq[tr.idx];
    if (tr.showT === 1) { c.state = 'up'; c.flipT = 10; c.glowT = STEP; c.glowColor = CYAN; sfxNote(tr.idx); }
    if (tr.showT >= STEP) { c.state = 'down'; tr.showT = 0; tr.idx++; if (tr.idx >= tr.seq.length) { tr.show = false; tr.inputIdx = 0; bannerT = 40; bannerText = 'YOUR TURN'; } }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  function tapAnywhere() {
    if (rulesT > 20) { rulesT = 20; return true; }
    return false;
  }
  var KEYS = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0], KeyW: [0,-1], KeyS: [0,1], KeyA: [-1,0], KeyD: [1,0] };
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    var k = KEYS[e.code];
    if (k) {
      e.preventDefault();
      start();
      cursor.col = Math.max(0, Math.min(COLS - 1, cursor.col + k[0]));
      cursor.row = Math.max(0, Math.min(ROWS - 1, cursor.row + k[1]));
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (mode !== 'play') { start(); return; }
      if (tapAnywhere()) return;
      flip(cardAt(cursor.col, cursor.row));
    }
  });
  function pick(clientX, clientY) {
    if (tapAnywhere()) return;
    var r = canvas.getBoundingClientRect();
    var x = (clientX - r.left) * (W / r.width), y = (clientY - r.top) * (H / r.height);
    var col = Math.floor((x - GX) / (CW + GAP)), row = Math.floor((y - GY) / (CHH + GAP));
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      cursor.col = col; cursor.row = row;
      flip(cardAt(col, row));
    }
  }
  canvas.addEventListener('click', function(e) {
    if (mode !== 'play') { start(); return; }
    pick(e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode !== 'play') { start(); return; }
    pick(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  // 16x12 sprites, 3px pixels, traditional palette: bold black outlines,
  // red/gold/green/blue fills, aged-bone greys (never white-on-white).
  var PAL = { K: '#14121a', R: '#d81e3c', r: '#8c1024', Y: '#f2c14e', G: '#2e8b4a', B: '#2d6cdf', O: '#e8731c', P: '#ff6aa2', S: '#ccd2d8', W: '#d8dde4' };
  var SPRITES = {
    heart: [
      '...KKK....KKK...',
      '..KRRRK..KRRRK..',
      '.KRRRRRKKRRRRRK.',
      '.KRRRRRRRRRRRRK.',
      'KKKKKKKKKKKKKKKK',
      'KYYYYYYYYYYYYYYK',
      'KKKKKKKKKKKKKKKK',
      '.KRRRRRRRRRRRRK.',
      '..KRRRRRRRRRRK..',
      '...KRRRRRRRRK...',
      '.....KRRRRK.....',
      '.......KK.......'],
    swallow: [
      '..K.......KK....',
      '.KBK.....KBBK...',
      '.KBBK...KBBBBK..',
      '..KBBK.KBBKBBKO.',
      '..KBBBKBBBBBBOK.',
      '...KBBBBBRRRBK..',
      '....KBBBRRRK....',
      '...KKBBBRRK.....',
      '..KBBKKBBK......',
      '.KBK...KK.......',
      '.KK.............',
      '................'],
    anchor: [
      '......KKKK......',
      '......KYYK......',
      '......KYYK......',
      '.......KK.......',
      '...KKKKKKKKKK...',
      '.......KK.......',
      '.......KK.......',
      '.K.....KK.....K.',
      'KBK....KK....KBK',
      'KBK....KK....KBK',
      '.KBK...KK...KBK.',
      '..KBBKKKKKKBBK..'],
    rose: [
      '....KKKKK.......',
      '...KRRRRRK......',
      '..KRPKKKRRK.....',
      '..KRKRRPKRK.....',
      '..KRRKKRRRK.....',
      '...KRRRRRK......',
      '.GK.KKKKK.KG....',
      'GGGK..K..KGGG...',
      '.GG...K....GG...',
      '......K.........',
      '.....K..........',
      '.....K..........'],
    dagger: [
      '.....KKKKK......',
      '.....KYKYK......',
      '.....KYKYK......',
      '..KKKKKKKKKKK...',
      '.....KWWWK......',
      '.....KWWWK......',
      '......KWWK......',
      '......KWWK......',
      '.......KWK......',
      '.......KWK......',
      '.......KK.......',
      '........K.......'],
    skull: [
      '....KKKKKKKK....',
      '...KSSSSSSSSK...',
      '..KSSSSSSSSSSK..',
      '..KSKKSSSSKKSK..',
      '..KSKKSSSSKKSK..',
      '..KSSSSKKSSSSK..',
      '...KSSSKKSSSK...',
      '...KKSSSSSSKK...',
      '....KSKSKSK.....',
      '....KSKSKSK.....',
      '....KKKKKKK.....',
      '................'],
    star: [
      '.......KK.......',
      '......KRrK......',
      '.....KRRrrK.....',
      'KKKKKRRRrrrKKKKK',
      '.KrrrRRRrrRRRK..',
      '..KrrRRRrrRRK...',
      '...KrrRRrrRK....',
      '...KrRRKKrrRK...',
      '..KrRRK..KrrRK..',
      '..KRRK....KrrK..',
      '..KKK.....KKK...',
      '................'],
    horseshoe: [
      '...KKKKKKKK.....',
      '..KYYYYYYYYK....',
      '.KYYKYYYYKYYK...',
      '.KYK......KYK...',
      'KYYK......KYYK..',
      'KYK........KYK..',
      'KYK........KYK..',
      'KYK........KYK..',
      'KYYK......KYYK..',
      '.KYK......KYK...',
      '.KKK......KKK...',
      '................'],
    snake: [
      '....KKKKK.......',
      '...KGGGGGK......',
      '..KGKGGGGGK.....',
      '..KGGGGGRRK.....',
      '...KKKKGGK......',
      '......KGGK......',
      '.KKKK.KGGK......',
      'KGGGGKKGGK......',
      'KGGGGGGGGK......',
      '.KGGGGGGK.......',
      '..KKKKKK........',
      '................'],
    eye: [
      '.......KK.......',
      '......KYYK......',
      '.....KYYYYK.....',
      '....KYKKKKYK....',
      '...KYKWWWWKYK...',
      '..KYKWWBBWWKYK..',
      '.KYKWWBKKBWWKYK.',
      'KYKWWWBBBBWWWKYK',
      'KYYKKWWWWWWKKYYK',
      'KYYYYKKKKKKYYYYK',
      'KKKKKKKKKKKKKKKK',
      '................'],
    bolt: [
      '........KKKK....',
      '.......KYYYK....',
      '......KYYYK.....',
      '.....KYYYK......',
      '....KYYYYKKK....',
      '...KYYYYYYYK....',
      '..KKKKKYYYK.....',
      '......KYYK......',
      '.....KYYK.......',
      '....KYYK........',
      '...KYK..........',
      '...KK...........'],
    cherry: [
      '.........KK.....',
      '........KGK.....',
      '.......KGK......',
      '......KGK.......',
      '.....KGK.KK.....',
      '....KGK.KGK.....',
      '...KKK..KGK.....',
      '..KRRRK.KKK.....',
      '.KRRRRRKKRRK....',
      '.KRRRRRKRRRRK...',
      '.KRRRRRKRRRRK...',
      '..KKKKK.KKKK....'],
    moon: [
      '.....KKKKKK.....',
      '...KKYYYYYYKK...',
      '..KYYYYKKKKKK...',
      '.KYYYYK.........',
      '.KYYYK..........',
      'KYYYYK..........',
      'KYYYYK..........',
      '.KYYYK..........',
      '.KYYYYK.........',
      '..KYYYYKKKKKK...',
      '...KKYYYYYYKK...',
      '.....KKKKKK.....'],
    spider: [
      '.K............K.',
      '..K..KKKKKK..K..',
      '...KKKKKKKKKK...',
      '..K.KKRKKRKK.K..',
      '.K..KKKKKKKK..K.',
      'K...KKKKKKKK...K',
      '.K..KKKKKKKK..K.',
      '..K.KKKRRKKK.K..',
      '...KKKKKKKKKK...',
      '..K..KKKKKK..K..',
      '.K............K.',
      '................'],
    crown: [
      '................',
      '.K.....KK.....K.',
      'KYK...KYYK...KYK',
      'KYYK..KYYK..KYYK',
      'KYYYK.KYYK.KYYYK',
      'KYYYYKKYYKKYYYYK',
      'KYYYYYYYYYYYYYYK',
      'KYYRYYYYRYYYYRYK',
      'KYYYYYYYYYYYYYYK',
      'KKKKKKKKKKKKKKKK',
      'KYYYYYYYYYYYYYYK',
      'KKKKKKKKKKKKKKKK'],
    dice: [
      '..KKKKKKKKKKK...',
      '.KWWWWWWWWWWWK..',
      '.KWKKWWWWWKKWK..',
      '.KWKKWWWWWKKWK..',
      '.KWWWWWWWWWWWK..',
      '.KWWWWKKWWWWWK..',
      '.KWWWWKKWWWWWK..',
      '.KWWWWWWWWWWWK..',
      '.KWKKWWWWWKKWK..',
      '.KWKKWWWWWKKWK..',
      '.KWWWWWWWWWWWK..',
      '..KKKKKKKKKKK...'],
    flame: [
      '.......K........',
      '......KOK.......',
      '......KOOK......',
      '.....KOOOK..K...',
      '.....KOOOOK.KOK.',
      '....KOOYOOKKOOK.',
      '....KOYYYOOOOK..',
      '...KOOYYYYOOOK..',
      '...KOOYYYYYOOK..',
      '....KOOYYYOOK...',
      '.....KOOOOOK....',
      '......KKKKK.....'],
    sun: [
      '.......KK.......',
      '..K....KK....K..',
      '...K..KYYK..K...',
      '....KKYYYYKK....',
      '.....KYYYYK.....',
      'KKKKKYYKKYYKKKKK',
      'KKKKKYYKKYYKKKKK',
      '.....KYYYYK.....',
      '....KKYYYYKK....',
      '...K..KYYK..K...',
      '..K....KK....K..',
      '.......KK.......'],
  };

  function drawDoodle(id, x, y, w, h) {
    var g = SPRITES[id];
    if (!g) return;
    var px = w < 60 ? 2.5 : 3;
    var ox = x + (w - 16 * px) / 2, oy = y + (h - 12 * px) / 2;
    for (var r = 0; r < g.length; r++) {
      for (var c = 0; c < g[r].length; c++) {
        var ch = g[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = PAL[ch] || PAL.K;
        ctx.fillRect(ox + c * px, oy + r * px, px, px);
      }
    }
  }

  // The card back: a flash sheet's reverse, plum paper with a diamond lattice
  // and the shop's eye pressed in the middle.
  function drawBack(x, y, w, h) {
    ctx.fillStyle = '#2a1a2e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,20,147,0.22)';
    for (var dy = 5; dy < h - 3; dy += 10) {
      for (var dx = 5 + ((dy / 10) % 2) * 5; dx < w - 3; dx += 10) {
        ctx.fillRect(x + dx, y + dy, 2, 2);
      }
    }
    ctx.strokeStyle = 'rgba(255,20,147,0.45)';
    ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    if (w > 30) {
      var cx = x + w / 2, cy = y + h / 2;
      ctx.fillStyle = 'rgba(255,20,147,0.6)';
      ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx + 12, cy + 9); ctx.lineTo(cx - 12, cy + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a1a2e';
      ctx.beginPath(); ctx.ellipse(cx, cy + 3, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8ad0';
      ctx.beginPath(); ctx.arc(cx, cy + 3, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w, 2);
  }

  // Aged paper for a face, with a pin at the top like a sheet on the wall.
  function drawPaper(x, y, w, h, matched) {
    ctx.fillStyle = matched ? '#1b2a1b' : '#efe9dc';
    ctx.fillRect(x, y, w, h);
    if (!matched) {
      ctx.fillStyle = 'rgba(120,90,40,0.10)';
      ctx.fillRect(x, y + h - 8, w, 8);
      ctx.fillRect(x + w - 6, y, 6, h);
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(x + w / 2, y + 4, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function label(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }
  function drawSpecialFace(c, x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2 - 4;
    if (c.kind === 'wild') {
      ctx.fillStyle = '#3b1030';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = Math.floor(frame / 6) % 2 === 0 ? PINK : YELLOW;
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 === 0 ? 14 : 6, a = -Math.PI / 2 + i * Math.PI / 5;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      label('WILD', cx, y + h - 6, '#fff');
    } else if (c.kind === 'peek') {
      ctx.fillStyle = '#0d1f24';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = CYAN;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x + 8.5, y + 8.5, w - 17, h - 24);
      ctx.setLineDash([]);
      label('STENCIL', cx, y + h - 6, CYAN);
    } else if (c.kind === 'bad') {
      ctx.fillStyle = '#2b1414';
      ctx.fillRect(x, y, w, h);
      drawDoodle('skull', x, y - 4, w, h);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 8); ctx.lineTo(x + w - 10, y + h - 14); ctx.moveTo(x + w - 10, y + 8); ctx.lineTo(x + 10, y + h - 14); ctx.stroke();
      ctx.lineWidth = 1;
      label('BAD INK', cx, y + h - 5, RED);
    } else if (c.kind === 'freeze') {
      ctx.fillStyle = '#0e1a2c';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#bff'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (var k = 0; k < 3; k++) { var an = k * Math.PI / 3; ctx.moveTo(cx - Math.cos(an) * 13, cy - Math.sin(an) * 13); ctx.lineTo(cx + Math.cos(an) * 13, cy + Math.sin(an) * 13); }
      ctx.stroke(); ctx.lineWidth = 1;
      label('FREEZE', cx, y + h - 5, '#bff');
    } else if (c.kind === 'double') {
      ctx.fillStyle = '#2a2208';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
      ctx.fillText('x2', cx, cy + 7);
      label('DOUBLE INK', cx, y + h - 5, YELLOW);
    } else if (c.kind === 'scramble') {
      ctx.fillStyle = '#2a1608';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 2;
      ctx.beginPath();
      for (var q = 0; q < 4; q++) { ctx.moveTo(cx - 14 + q * 9, cy - 8); ctx.lineTo(cx - 8 + q * 9, cy + 6); }
      ctx.stroke(); ctx.lineWidth = 1;
      label('SCRAMBLE', cx, y + h - 5, ORANGE);
    }
  }

  function drawFace(c, x, y, w, h) {
    if (c.kind !== 'pair') { drawSpecialFace(c, x, y, w, h); return; }
    var done = c.state === 'matched' || c.state === 'stolen';
    drawPaper(x, y, w, h, done);
    var f = faces[c.face];
    if (f.type === 'img' && f.img.complete && f.img.naturalWidth > 0) {
      var iw = f.img.naturalWidth, ih = f.img.naturalHeight;
      var s = Math.max((w - 6) / iw, (h - 6) / ih);
      var sw = (w - 6) / s, sh = (h - 6) / s;
      try {
        ctx.drawImage(f.img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x + 3, y + 3, w - 6, h - 6);
      } catch (e) {
        drawDoodle(DOODLES[c.face % DOODLES.length], x, y, w, h);
      }
    } else if (f.type === 'img') {
      drawDoodle(DOODLES[c.face % DOODLES.length], x, y, w, h);
    } else {
      drawDoodle(f.id, x, y, w, h);
    }
    if (c.state === 'matched') {
      ctx.fillStyle = 'rgba(127,255,0,0.18)';
      ctx.fillRect(x, y, w, h);
    } else if (c.state === 'stolen') {
      ctx.fillStyle = 'rgba(255,60,60,0.28)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = RED; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + w - 6, y + h - 6); ctx.moveTo(x + w - 6, y + 6); ctx.lineTo(x + 6, y + h - 6); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  function drawCard(c) {
    if (c.state === 'gone') {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(c.px + 0.5, c.py + 0.5, CW - 1, CHH - 1);
      ctx.setLineDash([]);
      return;
    }
    var x = c.px, y = c.py;
    if (c.shakeT > 0) x += Math.sin(c.shakeT * 1.8) * 3;
    if (c.dealT > 0) ctx.globalAlpha = Math.max(0, 1 - c.dealT / 16);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x + 3, y + 4, CW, CHH);
    var showFace = c.state !== 'down' || (peekT > 0 && c.kind === 'pair');
    var ghost = c.state === 'down' && peekT > 0;
    var ft = c.flipT / 10;
    var squeeze = c.flipT > 0 ? Math.abs(Math.cos(ft * Math.PI)) : 1;
    var backHalf = c.flipT > 5;
    var w = Math.max(2, CW * (1 - (1 - squeeze) * 0.95));
    var xx = x + (CW - w) / 2;
    if (c.glowT > 0) {
      var gcol = c.glowColor === CYAN ? '0,255,255' : c.glowColor === RED ? '255,68,68' : c.glowColor === PINK ? '255,20,147' : '127,255,0';
      ctx.fillStyle = 'rgba(' + gcol + ',' + Math.min(0.4, (c.glowT / 40) * 0.35 + 0.1) + ')';
      ctx.fillRect(xx - 4, y - 4, w + 8, CHH + 8);
    }
    if (backHalf || !showFace) {
      drawBack(xx, y, w, CHH);
    } else {
      drawFace(c, xx, y, w, CHH);
      if (ghost) {
        ctx.fillStyle = 'rgba(0,255,255,' + (peekT < 20 ? peekT / 20 * 0.35 : 0.35) + ')';
        ctx.fillRect(xx, y, w, CHH);
      }
    }
    if (c.flipT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - squeeze) * 0.5 + ')';
      ctx.fillRect(xx, y, w, CHH);
    }
    if (c.state === 'matched') {
      var sweep = ((frame * 1.6 + c.col * 24 + c.row * 12) % (w + 40)) - 20;
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(xx + Math.max(0, Math.min(w - 6, sweep)), y, 6, CHH);
    }
    if (c.state === 'lit' || c.state === 'got') {
      ctx.strokeStyle = c.state === 'got' ? LIME : (Math.floor(frame / 4) % 2 === 0 ? CYAN : '#fff');
      ctx.lineWidth = 2;
      ctx.strokeRect(xx - 1.5, y - 1.5, w + 3, CHH + 3);
      ctx.lineWidth = 1;
    }
    ctx.strokeStyle = c.state === 'matched' ? LIME : c.state === 'stolen' ? RED : c.state === 'bad' ? RED : c.state === 'up' ? '#14121a' : 'rgba(255,255,255,0.3)';
    ctx.strokeRect(xx + 0.5, y + 0.5, w - 1, CHH - 1);
    ctx.globalAlpha = 1;
  }

  // The rival's hand: a sleeve from the top of the table, ink down the arm.
  function drawRivalHand() {
    if (sm !== 'classic' || rival.phase === 'idle' && rival.y < -20) return;
    var x = rival.x, y = rival.y;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 12, y + 6, 26, 30);
    // sleeve up to the edge
    ctx.fillStyle = '#1c1c22';
    ctx.fillRect(x - 9, -10, 18, Math.max(0, y + 4));
    ctx.fillStyle = '#c9956a';
    ctx.fillRect(x - 9, y - 6, 18, 10);
    ctx.fillStyle = PINK; ctx.fillRect(x - 6, y - 2, 4, 3);
    ctx.fillStyle = '#14121a'; ctx.fillRect(x + 1, y - 3, 5, 4);
    // hand + fingers
    ctx.fillStyle = '#d9a67a';
    ctx.fillRect(x - 11, y + 2, 22, 16);
    for (var f = 0; f < 4; f++) ctx.fillRect(x - 10 + f * 5.5, y + 16, 4, 9);
    ctx.fillRect(x + 11, y + 6, 5, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (var g = 0; g < 4; g++) ctx.fillRect(x - 10 + g * 5.5, y + 23, 4, 2);
  }

  // The client at the top of the sheet in CLIENT ORDER, with the ask.
  function drawClient() {
    if (sm !== 'order') return;
    var x = 16, y = 46;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y, W - 32, 40);
    // head
    var mood = ord.thanksT > 0 ? (ord.line.indexOf('too') >= 0 || ord.line.indexOf('forget') >= 0 || ord.line.indexOf('else') >= 0 ? 'mad' : 'happy') : (ord.t / ord.max < 0.3 ? 'tense' : 'calm');
    ctx.fillStyle = '#e0b08a';
    ctx.fillRect(x + 8, y + 6, 26, 28);
    ctx.fillStyle = '#2b1a12';
    ctx.fillRect(x + 6, y + 3, 30, 8);
    ctx.fillRect(x + 6, y + 3, 5, 18);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(x + 14, y + 16, 3, 3); ctx.fillRect(x + 25, y + 16, 3, 3);
    if (mood === 'happy') { ctx.fillRect(x + 15, y + 26, 12, 2); ctx.fillRect(x + 13, y + 24, 2, 2); ctx.fillRect(x + 27, y + 24, 2, 2); }
    else if (mood === 'mad') { ctx.fillRect(x + 15, y + 27, 12, 2); ctx.fillRect(x + 12, y + 13, 6, 2); ctx.fillRect(x + 24, y + 13, 6, 2); }
    else if (mood === 'tense') { ctx.fillRect(x + 16, y + 26, 10, 3); }
    else ctx.fillRect(x + 16, y + 26, 10, 2);
    ctx.fillStyle = PINK; ctx.fillRect(x + 10, y + 30, 22, 4);
    // bubble
    var bx = x + 46, by = y + 4, bw = W - 32 - 54, bh = 32;
    ctx.fillStyle = '#fffbe6';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#14121a';
    ctx.fillRect(bx - 6, by + 12, 6, 6);
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
    var text = ord.thanksT > 0 ? ord.line : (ord.face >= 0 ? 'gimme the ' + faceName(ord.face) : '');
    ctx.fillText(text, bx + 8, by + 14);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#666';
    ctx.fillText('ORDER ' + Math.min(ord.total, ord.done + 1) + ' OF ' + ord.total, bx + 8, by + 26);
    // patience bar
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(bx + 110, by + 20, bw - 120, 5);
    var pr = Math.max(0, ord.t / ord.max);
    ctx.fillStyle = pr > 0.5 ? LIME : pr > 0.25 ? YELLOW : RED;
    ctx.fillRect(bx + 110, by + 20, (bw - 120) * pr, 5);
  }

  // The rules card: the mode's name and two lines, held for a beat.
  function drawRules() {
    if (rulesT <= 0) return;
    var a = rulesT > 150 ? (170 - rulesT) / 20 : rulesT < 20 ? rulesT / 20 : 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('SESSION ' + level, W / 2, 96);
    ctx.fillStyle = sm === 'speed' ? CYAN : sm === 'order' ? YELLOW : sm === 'trace' ? PINK : LIME;
    ctx.font = 'bold 24px monospace';
    ctx.fillText(MODE_NAME[sm], W / 2, 130);
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.fillText(MODE_RULES[sm][0], W / 2, 162);
    ctx.fillText(MODE_RULES[sm][1], W / 2, 180);
    if (sm === 'classic' && specialsFor(level, sm).length) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '9px monospace';
      ctx.fillText('on the sheet: ' + specialsFor(level, sm).map(function(s) { return s.toUpperCase(); }).filter(function(v, i, arr) { return arr.indexOf(v) === i; }).join(' // '), W / 2, 204);
    }
    if (Math.floor(frame / 18) % 2 === 0) { ctx.fillStyle = YELLOW; ctx.font = 'bold 11px monospace'; ctx.fillText('TAP OR SPACE TO DEAL', W / 2, 240); }
    ctx.globalAlpha = 1;
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'flashmatch', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'OUT OF TIME', again: 'SPACE or TAP to reshuffle',
    levelLabel: function (l) { return 'SESSION ' + l + ' // STREAK ' + bestStreak + ' // TRACE ' + bestTrace + ' // CHAIN ' + bestChain; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: level, meta: { sessions: level, streak: bestStreak, misses: misses, matches: matchesTotal, trace: bestTrace, chain: bestChain, orders: ordersDone, stolen: stolen, snatched: snatched } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }


  // ── Attract-mode intro: CRT power-on, studio card, title scene, the wall ──
  var INTRO_LOOP = 285, ATTRACT_END = 285 + 240;
  function drawIntro() {
    var t = introT;
    if (t >= INTRO_LOOP) { wall.drawAttract(); return; }
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
    drawTable(0);
    var ids = ['heart', 'swallow', 'crown', 'rose'];
    for (var i = 0; i < 4; i++) {
      var fx2 = 44 + i * 82, fy2 = 150;
      var flipT2 = Math.max(0, Math.min(1, (t2 - 16 - i * 14) / 18));
      var wq = 70 * Math.abs(flipT2 < 0.5 ? 1 - flipT2 * 2 : flipT2 * 2 - 1);
      var open2 = flipT2 >= 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(fx2 + (70 - wq) / 2 + 3, fy2 + 4, wq, 52);
      if (open2) drawPaper(fx2 + (70 - wq) / 2, fy2, Math.max(2, wq), 52, false);
      else drawBack(fx2 + (70 - wq) / 2, fy2, Math.max(2, wq), 52);
      if (open2 && flipT2 > 0.85) drawDoodle(ids[i], fx2, fy2, 70, 52);
    }
    slam('FLASH MATCH', 100, 28, CYAN);
    if (t2 > 130) { ctx.fillStyle = YELLOW; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('KNOW YOUR FLASH', W / 2, 126); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TAP a card, or ARROWS + SPACE // four sheets: classic, speed, orders, trace', W / 2, H - 42);
    ctx.fillText('a rival hunts your pairs // streaks pay up to x5 // sign the wall', W / 2, H - 29);
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

  // The parlor table: dark stained wood under a hanging lamp. The lamp
  // flickers when the clock is nearly dead, and blinks out on bad ink.
  function drawTable(nervous) {
    var wood = ctx.createLinearGradient(0, 0, 0, H);
    wood.addColorStop(0, '#2a1a12');
    wood.addColorStop(0.5, '#1d120c');
    wood.addColorStop(1, '#130b08');
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, W, H);
    if (grain) {
      for (var i = 0; i < grain.length; i++) {
        ctx.fillStyle = 'rgba(255,200,140,' + grain[i].a + ')';
        ctx.fillRect(0, grain[i].y, W, grain[i].w);
      }
    }
    var flick = nervous ? (Math.random() < 0.15 ? 0.55 : 1) : 1;
    if (badLampT > 0) flick = (badLampT % 6 < 3) ? 0.25 : 0.9;
    var cold = freezeT > 0;
    var lamp = ctx.createRadialGradient(W / 2, 40, 10, W / 2, 120, 300);
    lamp.addColorStop(0, (cold ? 'rgba(170,230,255,' : 'rgba(255,214,150,') + 0.30 * flick + ')');
    lamp.addColorStop(0.5, (cold ? 'rgba(120,200,255,' : 'rgba(255,190,120,') + 0.10 * flick + ')');
    lamp.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, H);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var tr2 = Math.max(0, timer / timerMax);
    var nervous = tr2 < 0.25 && mode === 'play' && freezeT === 0;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 0.8, (Math.random() - 0.5) * shake * 0.8);
    drawTable(nervous);
    drawClient();

    for (var i = 0; i < cards.length; i++) if (cards[i].flipT === 0 && cards[i].shakeT === 0) drawCard(cards[i]);
    for (var i2 = 0; i2 < cards.length; i2++) if (cards[i2].flipT > 0 || cards[i2].shakeT > 0) drawCard(cards[i2]);
    drawRivalHand();

    if (peekT > 0) {
      ctx.fillStyle = 'rgba(0,255,255,' + (peekT > 60 ? (80 - peekT) / 20 * 0.08 : 0.08) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (shuffleT > 0) { ctx.fillStyle = 'rgba(255,215,0,0.06)'; ctx.fillRect(0, 0, W, H); }
    if (doubleT > 0) { ctx.fillStyle = 'rgba(255,215,0,' + (0.04 + 0.03 * Math.sin(frame * 0.2)) + ')'; ctx.fillRect(0, 0, W, H); }

    // Keyboard cursor
    var p = cardPos(cursor.col, cursor.row);
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 2, p.y - 2, CW + 4, CHH + 4);
    ctx.lineWidth = 1;

    for (var k = 0; k < parts.length; k++) {
      var pt = parts[k];
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / 20));
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.s, pt.s);
    }
    for (var c2 = 0; c2 < cash.length; c2++) {
      var ch = cash[c2];
      ctx.globalAlpha = Math.max(0, Math.min(1, ch.life / 18));
      if (ch.chip) {
        ctx.fillStyle = '#d81e3c'; ctx.beginPath(); ctx.arc(ch.x, ch.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ch.x, ch.y, 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.save(); ctx.translate(ch.x, ch.y); ctx.rotate(Math.sin(ch.rot) * 0.6);
        ctx.fillStyle = '#7fbf5a'; ctx.fillRect(-7, -4, 14, 8);
        ctx.fillStyle = '#2e6b2e'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 3);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (var q = 0; q < popups.length; q++) {
      var pu = popups[q];
      ctx.globalAlpha = Math.min(1, pu.life / 18);
      ctx.font = 'bold ' + (pu.big ? 13 : 10) + 'px monospace';
      ctx.fillStyle = '#000';
      ctx.fillText(pu.text, pu.x + 1, pu.y + 1);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y);
    }
    ctx.globalAlpha = 1;

    // Timer: the bar, then the clock digits that get nervous under a quarter.
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(8, 32, W - 62, 5);
    ctx.fillStyle = freezeT > 0 ? '#bff' : tr2 > 0.5 ? CYAN : tr2 > 0.25 ? YELLOW : (Math.floor(frame / 6) % 2 === 0 ? RED : '#992222');
    var barShake = nervous ? Math.sin(frame * 1.3) * 1.2 : 0;
    ctx.fillRect(8, 32 + barShake, (W - 62) * tr2, 5);
    var secs = Math.max(0, Math.ceil(timer / 60));
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = freezeT > 0 ? '#bff' : nervous ? (Math.floor(frame / 6) % 2 === 0 ? RED : '#fff') : '#fff';
    ctx.fillText(freezeT > 0 ? 'FROZEN' : (Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60)), W - 8 + (nervous ? (Math.random() - 0.5) * 2 : 0), 39);

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, wall.best(), score), 110, 14);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'right';
    ctx.fillText('SESSION ' + level + ' // ' + MODE_NAME[sm], W - 8, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    var sub = sm === 'order' ? ('ORDER ' + Math.min(ord.total, ord.done + 1) + '/' + ord.total)
      : sm === 'trace' ? ('ROUND ' + tr.round + '/' + tr.rounds + ' // LEN ' + tr.seq.length)
      : (remainingPairs() + ' PAIRS LEFT' + (sm === 'speed' && sp.chain > 1 ? ' // CHAIN x' + sp.chain : ''));
    ctx.fillText(sub, W - 8, 25);
    if (doubleT > 0) { ctx.fillStyle = YELLOW; ctx.textAlign = 'left'; ctx.fillText('x2 INK ' + Math.ceil(doubleT / 60), 200, 14); }
    if (streak > 1) {
      var m = mult();
      ctx.fillStyle = m >= 5 ? PINK : YELLOW;
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + (m >= 3 && Math.floor(frame / 8) % 2 === 0 ? 12 : 11) + 'px monospace';
      ctx.fillText('STREAK x' + m + (m >= 5 ? ' MAX' : ''), W / 2, 15);
      ctx.font = 'bold 10px monospace';
    }
    if (sm === 'classic' && rival.phase === 'idle' && rulesT === 0) {
      // The rival's next move, ticking down.
      ctx.fillStyle = 'rgba(255,68,68,0.25)';
      ctx.fillRect(W - 60, 41, 52, 2);
      ctx.fillStyle = RED;
      ctx.fillRect(W - 60, 41, 52 * (1 - rival.cd / rivalEvery()), 2);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      var hot = bannerText.indexOf('TIME') === 0;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, H / 2 - 22, W, 34);
      ctx.fillStyle = hot ? RED : bannerText === 'SHUFFLE' ? YELLOW : LIME;
      ctx.font = 'bold ' + (bannerText.length > 26 ? 13 : 18) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 + 1);
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
    }
    drawRules();
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
      else { frame++; musicTick(); if (mode === 'intro' && ++introT > ATTRACT_END) introT = 70; }
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-flashmatch', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
