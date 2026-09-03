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

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', PURPLE = '#9b59b6', RED = '#ff4444';
  var COLS = 4, ROWS = 4;
  var CW = 82, CHH = 56, GAP = 8;
  var GX = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
  var GY = 44;

  // Built-in flash: the American-traditional canon, drawn as outlined pixel
  // art so every card reads bold on the paper. Twelve sheets cover the biggest
  // grid without a repeat.
  var DOODLES = ['heart', 'swallow', 'anchor', 'rose', 'dagger', 'skull', 'star', 'horseshoe', 'snake', 'eye', 'bolt', 'cherry'];

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, level, frame;
  var cards, first, second, missT, timer, timerMax, streak, bannerT, bannerText, faces;
  var pairs, peekT, shuffleT, shuffled, misses, sheetMisses, bestStreak, lastMatchF, shake, tickCd;
  var popups, parts, grain, matchesTotal;

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
      faces.push({ type: 'img', img: im });
    }
    for (var i = 0; faces.length < DOODLES.length; i++) faces.push({ type: 'doodle', id: DOODLES[i % DOODLES.length] });
  }

  // Every session is a bigger, meaner sheet: more pairs, then the specials.
  // peek = a stencil that shows the whole sheet for a beat, wild = matches
  // anything and takes its partner too, bad = a botched tattoo that costs time.
  function layoutFor(lvl) {
    var cols = lvl <= 2 ? 4 : lvl <= 4 ? 5 : 6;
    return { cols: cols, rows: 4, cw: cols === 4 ? 82 : cols === 5 ? 68 : 56 };
  }
  function specialsFor(lvl) {
    if (lvl === 1) return [];
    if (lvl === 2) return ['peek', 'bad'];
    if (lvl === 3) return ['peek', 'wild'];
    if (lvl === 4) return ['peek', 'wild', 'bad', 'bad'];
    if (lvl === 5) return ['peek', 'wild'];
    return ['peek', 'wild', 'bad', 'bad'];
  }
  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function dealCards() {
    var L = layoutFor(level);
    COLS = L.cols; ROWS = L.rows; CW = L.cw;
    GX = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
    var specials = specialsFor(level);
    pairs = (COLS * ROWS - specials.length) / 2;
    var pool = shuffleArr(faces.map(function(f, i) { return i; })).slice(0, pairs);
    var deck = [];
    for (var i = 0; i < pairs; i++) { deck.push({ kind: 'pair', face: pool[i] }); deck.push({ kind: 'pair', face: pool[i] }); }
    for (var s = 0; s < specials.length; s++) deck.push({ kind: specials[s], face: -1 });
    shuffleArr(deck);
    cards = deck.map(function(d, i) {
      var col = i % COLS, row = Math.floor(i / COLS);
      var p = cardPos(col, row);
      return { kind: d.kind, face: d.face, state: 'down', flipT: 0, dealT: 14 + i * 3, col: col, row: row, px: p.x, py: p.y - 90, seen: 0, glowT: 0, shakeT: 0 };
    });
    first = null; second = null; missT = 0; peekT = 0; shuffleT = 0; shuffled = false; sheetMisses = 0;
    var secPerPair = Math.max(5, 11 - (level - 1));
    timerMax = pairs * secPerPair * 60;
    timer = timerMax;
    cursor.col = Math.min(cursor.col, COLS - 1); cursor.row = Math.min(cursor.row, ROWS - 1);
  }
  function cardPos(col, row) { return { x: GX + col * (CW + GAP), y: GY + row * (CHH + GAP) }; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; level = 1; frame = 0; streak = 0; bestStreak = 0; misses = 0; matchesTotal = 0;
    lastMatchF = -999; shake = 0; tickCd = 0; popups = []; parts = [];
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
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Tap the cards // find the pairs' : 'Tap a card, or arrows + SPACE // find the pairs';
    window.skateRunning = true;
    startLoop();
  }

  var cursor = { col: 0, row: 0 };

  function cardAt(col, row) {
    for (var i = 0; i < cards.length; i++) if (cards[i].col === col && cards[i].row === row) return cards[i];
    return null;
  }
  function addScore(n) {
    score += n;
    document.getElementById('jd-br-score').textContent = score;
  }
  function popup(x, y, text, color, big) {
    popups.push({ x: x, y: y, text: text, color: color || '#fff', life: big ? 70 : 50, big: !!big });
  }
  function burst(x, y, color, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random()) * (speed || 2.2);
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 26 + Math.random() * 22, color: color, s: 2 + Math.random() * 2 });
    }
  }
  function center(c) { return { x: c.px + CW / 2, y: c.py + CHH / 2 }; }
  function remainingPairs() {
    var n = 0;
    for (var i = 0; i < cards.length; i++) if (cards[i].kind === 'pair' && cards[i].state !== 'matched') n++;
    return n / 2;
  }
  function putDown(c) { if (c) { c.state = 'down'; c.seen++; } }

  function flip(card) {
    if (!card || card.state !== 'down' || missT > 0 || peekT > 0 || shuffleT > 0) return;
    card.state = 'up';
    card.flipT = 10;
    sfxFlip();
    var ctr = center(card);

    if (card.kind === 'peek') {
      // The stencil: the whole sheet shows for a beat, then the card is spent.
      putDown(first); first = null;
      card.state = 'gone';
      peekT = 80;
      popup(ctr.x, ctr.y, 'STENCIL PEEK', CYAN, true);
      burst(ctr.x, ctr.y, CYAN, 14, 2.5);
      sfxPeek();
      return;
    }
    if (card.kind === 'bad') {
      // A botched tattoo: five seconds gone, the streak with it.
      putDown(first); first = null;
      card.state = 'bad';
      timer = Math.max(1, timer - 300);
      streak = 0;
      shake = 14;
      card.shakeT = 20;
      popup(ctr.x, ctr.y, 'BAD TATTOO -5s', RED, true);
      burst(ctr.x, ctr.y, RED, 16, 2.6);
      sfxBad();
      return;
    }
    if (!first) { first = card; return; }
    if (card === first) return;
    second = card;
    var wild = first.kind === 'wild' ? first : second.kind === 'wild' ? second : null;
    if (wild || first.face === second.face) {
      match(first, second, wild);
    } else {
      streak = 0;
      missT = 45;
      misses++; sheetMisses++;
      first.shakeT = 14; second.shakeT = 14;
      sfxMiss();
    }
  }

  function match(a, b, wild) {
    a.state = 'matched'; b.state = 'matched';
    a.glowT = 40; b.glowT = 40;
    streak++;
    if (streak > bestStreak) bestStreak = streak;
    matchesTotal++;
    var mult = Math.min(5, streak);
    var mid = { x: (center(a).x + center(b).x) / 2, y: (center(a).y + center(b).y) / 2 };
    var pts = 100 * mult;
    addScore(pts);
    popup(center(b).x, center(b).y - 6, '+' + pts + (mult > 1 ? ' x' + mult : ''), mult > 1 ? YELLOW : '#fff', mult >= 3);
    burst(center(a).x, center(a).y, LIME, 10, 2);
    burst(center(b).x, center(b).y, LIME, 10, 2);
    if (streak === 3) sayCallout('flashmatch-c2');
    if (streak === 5) sayCallout('flashmatch-c3');
    sfxMatch(mult);

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
      // The wild takes the partner with it.
      var other = wild === a ? b : a;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (c !== other && c.kind === 'pair' && c.face === other.face && c.state !== 'matched') {
          c.state = 'matched'; c.flipT = 10; c.glowT = 50;
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
    // Later sessions shuffle the sheet once, at the halfway mark.
    if (level >= 4 && !shuffled && left <= Math.floor(pairs / 2)) startShuffle();
  }

  function clearSheet() {
    var secs = Math.floor(timer / 60);
    var tb = secs * 10 * level;
    if (tb > 0) { addScore(tb); popup(W / 2, H / 2 + 22, 'TIME +' + tb, CYAN, true); }
    if (sheetMisses === 0) { var pb = 500 * level; addScore(pb); popup(W / 2, H / 2 + 42, 'PERFECT SHEET +' + pb, YELLOW, true); say('so-sick', 500); }
    burst(W / 2, H / 2, YELLOW, 30, 3.5);
    level++;
    bannerT = 120;
    var sp = specialsFor(level);
    var extras = [];
    if (sp.indexOf('peek') >= 0) extras.push('STENCIL');
    if (sp.indexOf('wild') >= 0) extras.push('WILD');
    if (sp.indexOf('bad') >= 0) extras.push('BAD INK');
    bannerText = 'SESSION ' + level + ' // ' + ((COLS * ROWS - sp.length) / 2 + (layoutFor(level).cols * 4 - COLS * ROWS) / 2) + ' PAIRS' + (extras.length ? ' + ' + extras.join(' + ') : '');
    sayCallout('flashmatch-c1');
    sfxClear();
    dealCards();
    bannerText = 'SESSION ' + level + ' // ' + pairs + ' PAIRS' + (extras.length ? ' + ' + extras.join(' + ') : '');
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
    sfxShuffle();
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (bannerT > 0) bannerT--;
    if (shake > 0) shake--;
    if (peekT > 0) peekT--;
    if (shuffleT > 0) shuffleT--;
    if (missT > 0) {
      missT--;
      if (missT === 0 && first && second) {
        putDown(first); putDown(second);
        first = null; second = null;
      }
    }
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.flipT > 0) c.flipT--;
      if (c.dealT > 0) c.dealT--;
      if (c.glowT > 0) c.glowT--;
      if (c.shakeT > 0) c.shakeT--;
      var p = cardPos(c.col, c.row);
      c.px += (p.x - c.px) * 0.22;
      c.py += (p.y - c.py) * 0.22;
    }
    for (var k = popups.length - 1; k >= 0; k--) { popups[k].y -= 0.55; popups[k].life--; if (popups[k].life <= 0) popups.splice(k, 1); }
    for (var m = parts.length - 1; m >= 0; m--) { var pt = parts[m]; pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.09; pt.vx *= 0.97; pt.life--; if (pt.life <= 0) parts.splice(m, 1); }

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
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
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
      flip(cardAt(cursor.col, cursor.row));
    }
  });
  function pick(clientX, clientY) {
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

  function drawSpecialFace(c, x, y, w, h) {
    if (c.kind === 'wild') {
      ctx.fillStyle = '#3b1030';
      ctx.fillRect(x, y, w, h);
      var cx = x + w / 2, cy = y + h / 2 - 4;
      ctx.fillStyle = Math.floor(frame / 6) % 2 === 0 ? PINK : YELLOW;
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var r = i % 2 === 0 ? 14 : 6, a = -Math.PI / 2 + i * Math.PI / 5;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('WILD', cx, y + h - 6);
    } else if (c.kind === 'peek') {
      ctx.fillStyle = '#0d1f24';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = CYAN;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x + 8.5, y + 8.5, w - 17, h - 24);
      ctx.setLineDash([]);
      ctx.fillStyle = CYAN;
      ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('STENCIL', x + w / 2, y + h - 6);
    } else if (c.kind === 'bad') {
      ctx.fillStyle = '#2b1414';
      ctx.fillRect(x, y, w, h);
      drawDoodle('skull', x, y - 4, w, h);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 8); ctx.lineTo(x + w - 10, y + h - 14); ctx.moveTo(x + w - 10, y + 8); ctx.lineTo(x + 10, y + h - 14); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = RED;
      ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('BAD INK', x + w / 2, y + h - 5);
    }
  }

  function drawFace(c, x, y, w, h) {
    if (c.kind !== 'pair') { drawSpecialFace(c, x, y, w, h); return; }
    drawPaper(x, y, w, h, c.state === 'matched');
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
    }
  }

  function drawCard(c) {
    if (c.state === 'gone') {
      // A spent stencil leaves a faint outline on the table.
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
    // Flip: the card turns on its vertical axis, back for the first half,
    // face for the second. A peek shows every down card as a ghost face.
    var showFace = c.state !== 'down' || (peekT > 0 && c.kind === 'pair');
    var ghost = c.state === 'down' && peekT > 0;
    var ft = c.flipT / 10;
    var squeeze = c.flipT > 0 ? Math.abs(Math.cos(ft * Math.PI)) : 1;
    var backHalf = c.flipT > 5;
    var w = Math.max(2, CW * (1 - (1 - squeeze) * 0.95));
    var xx = x + (CW - w) / 2;
    if (c.glowT > 0) {
      ctx.fillStyle = 'rgba(127,255,0,' + (c.glowT / 40) * 0.35 + ')';
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
    // Edge shading through the turn.
    if (c.flipT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - squeeze) * 0.5 + ')';
      ctx.fillRect(xx, y, w, CHH);
    }
    if (c.state === 'matched') {
      var sweep = ((frame * 1.6 + c.col * 24 + c.row * 12) % (w + 40)) - 20;
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(xx + Math.max(0, Math.min(w - 6, sweep)), y, 6, CHH);
    }
    ctx.strokeStyle = c.state === 'matched' ? LIME : c.state === 'bad' ? RED : c.state === 'up' ? '#14121a' : 'rgba(255,255,255,0.3)';
    ctx.strokeRect(xx + 0.5, y + 0.5, w - 1, CHH - 1);
    ctx.globalAlpha = 1;
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'flashmatch', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'OUT OF TIME', again: 'SPACE or TAP to reshuffle',
    levelLabel: function (l) { return 'REACHED SESSION ' + l; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: level, meta: { sessions: level, streak: bestStreak, misses: misses, matches: matchesTotal } }); }
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
    var ids = ['heart', 'swallow', 'anchor', 'rose'];
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
    ctx.fillText('TAP a card, or ARROWS + SPACE to flip // streaks pay up to x5', W / 2, H - 42);
    ctx.fillText('clear the sheet before the clock dies // stencils peek, wilds match anything', W / 2, H - 29);
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
  // flickers when the clock is nearly dead.
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
    var lamp = ctx.createRadialGradient(W / 2, 40, 10, W / 2, 120, 300);
    lamp.addColorStop(0, 'rgba(255,214,150,' + 0.30 * flick + ')');
    lamp.addColorStop(0.5, 'rgba(255,190,120,' + 0.10 * flick + ')');
    lamp.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, H);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    var tr = Math.max(0, timer / timerMax);
    var nervous = tr < 0.25 && mode === 'play';
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 0.8, (Math.random() - 0.5) * shake * 0.8);
    drawTable(nervous);

    // Cards: the ones mid-flip or shaking draw last so they sit on top.
    for (var i = 0; i < cards.length; i++) if (cards[i].flipT === 0 && cards[i].shakeT === 0) drawCard(cards[i]);
    for (var i2 = 0; i2 < cards.length; i2++) if (cards[i2].flipT > 0 || cards[i2].shakeT > 0) drawCard(cards[i2]);

    if (peekT > 0) {
      ctx.fillStyle = 'rgba(0,255,255,' + (peekT > 60 ? (80 - peekT) / 20 * 0.08 : 0.08) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (shuffleT > 0) {
      ctx.fillStyle = 'rgba(255,215,0,0.06)';
      ctx.fillRect(0, 0, W, H);
    }

    // Keyboard cursor
    var p = cardPos(cursor.col, cursor.row);
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 2, p.y - 2, CW + 4, CHH + 4);
    ctx.lineWidth = 1;

    // Particles and popups
    for (var k = 0; k < parts.length; k++) {
      var pt = parts[k];
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / 20));
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.s, pt.s);
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
    ctx.fillStyle = tr > 0.5 ? CYAN : tr > 0.25 ? YELLOW : (Math.floor(frame / 6) % 2 === 0 ? RED : '#992222');
    var barShake = nervous ? Math.sin(frame * 1.3) * 1.2 : 0;
    ctx.fillRect(8, 32 + barShake, (W - 62) * tr, 5);
    var secs = Math.max(0, Math.ceil(timer / 60));
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = nervous ? (Math.floor(frame / 6) % 2 === 0 ? RED : '#fff') : '#fff';
    ctx.fillText(Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60), W - 8 + (nervous ? (Math.random() - 0.5) * 2 : 0), 39);

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, wall.best(), score), 110, 14);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'right';
    ctx.fillText('SESSION ' + level, W - 8, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(remainingPairs() + ' PAIRS LEFT', W - 8, 25);
    if (streak > 1) {
      var mult = Math.min(5, streak);
      ctx.fillStyle = mult >= 5 ? PINK : YELLOW;
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + (mult >= 3 && Math.floor(frame / 8) % 2 === 0 ? 12 : 11) + 'px monospace';
      ctx.fillText('STREAK x' + mult + (mult >= 5 ? ' MAX' : ''), W / 2, 15);
      ctx.font = 'bold 10px monospace';
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
