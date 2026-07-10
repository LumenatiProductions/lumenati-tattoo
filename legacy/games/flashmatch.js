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
  function sfxFlip() { playSfx(500, 0.05, 'square', 0.08); }
  function sfxMatch() { playSfx(800, 0.08, 'square', 0.11); setTimeout(function(){playSfx(1100, 0.1, 'square', 0.11);}, 70); }
  function sfxMiss() { playSfx(240, 0.12, 'sawtooth', 0.09); }
  function sfxClear() { playSfx(700, 0.1, 'square', 0.12); setTimeout(function(){playSfx(950, 0.1, 'square', 0.12);}, 100); setTimeout(function(){playSfx(1250, 0.15, 'square', 0.12);}, 200); }
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

  // ── This game's own chiptune: playful quiz-floor swing ──
  var SONGS = [
    { root: 146.83, bass: [0,-1,4,-1, 7,-1,4,-1, 0,-1,4,-1, 9,-1,7,4], lead: [12,-1,16,-1, 19,16,-1,12, 14,-1,17,-1, 21,-1,19,16] },
    { root: 130.81, bass: [0,4,-1,7, -1,4,0,-1, 5,9,-1,12, -1,9,5,-1], lead: [16,-1,12,-1, 19,-1,16,-1, 21,-1,17,-1, 24,21,19,16] },
  ];
  var MENU_SONG = { root: 146.83, bass: [0,-1,7,4, 0,-1,9,7, 0,-1,7,4, 10,9,7,-1], lead: [16,19,-1,16, -1,21,19,-1, 16,19,-1,24, 21,-1,19,16] };
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

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', PURPLE = '#9b59b6';
  var COLS = 4, ROWS = 4;
  var CW = 82, CHH = 56, GAP = 8;
  var GX = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
  var GY = 42;

  // Built-in flash: the American-traditional canon (Sailor Jerry staples),
  // drawn as outlined pixel art so every card reads bold on the paper.
  var DOODLES = ['heart', 'swallow', 'anchor', 'rose', 'dagger', 'skull', 'star', 'horseshoe'];

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, lives, level, frame;
  var cards, first, second, missT, timer, timerMax, streak, bannerT, bannerText, faces;

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
    for (var i = 0; faces.length < 8; i++) faces.push({ type: 'doodle', id: DOODLES[i % DOODLES.length] });
  }

  function dealCards() {
    var deck = [];
    for (var i = 0; i < 8; i++) { deck.push(i); deck.push(i); }
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    cards = deck.map(function(f, i) {
      return { face: f, state: 'down', flipT: 0, dealT: 14 + i * 3, col: i % COLS, row: Math.floor(i / COLS) };
    });
    first = null; second = null; missT = 0;
    timerMax = Math.max(2400, 5400 - (level - 1) * 700); // 90s -> 40s
    timer = timerMax;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; level = 1; frame = 0; streak = 0;
    mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0; bannerT = 0; bannerText = '';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    collectFaces();
    dealCards();
    cursor = { col: 0, row: 0 };
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'Tap a card, or arrows + SPACE // find the pairs';
    window.skateRunning = true;
    startLoop();
  }

  var cursor = { col: 0, row: 0 };

  function cardAt(col, row) {
    for (var i = 0; i < cards.length; i++) if (cards[i].col === col && cards[i].row === row) return cards[i];
    return null;
  }

  function flip(card) {
    if (!card || card.state !== 'down' || missT > 0) return;
    card.state = 'up';
    card.flipT = 8;
    sfxFlip();
    if (!first) { first = card; return; }
    if (card === first) return;
    second = card;
    if (first.face === second.face) {
      first.state = 'matched'; second.state = 'matched';
      streak++;
      if (streak === 3) sayCallout('flashmatch-c2');
      var pts = 50 * Math.min(3, streak);
      score += pts;
      document.getElementById('jd-br-score').textContent = score;
      sfxMatch();
      first = null; second = null;
      var left = 0;
      for (var i = 0; i < cards.length; i++) if (cards[i].state !== 'matched') left++;
      if (left === 0) {
        var bonus = Math.round(timer / 60) * 5;
        score += bonus;
        document.getElementById('jd-br-score').textContent = score;
        level++;
        bannerT = 110;
        bannerText = 'SESSION ' + level + ' — LESS TIME';
        sayCallout(level % 2 === 0 ? 'flashmatch-c1' : 'flashmatch-c3');
        sfxClear();
        dealCards();
      }
    } else {
      streak = 0;
      missT = 45;
      sfxMiss();
    }
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (bannerT > 0) bannerT--;
    if (missT > 0) {
      missT--;
      if (missT === 0 && first && second) {
        first.state = 'down'; second.state = 'down';
        first = null; second = null;
      }
    }
    for (var i = 0; i < cards.length; i++) { if (cards[i].flipT > 0) cards[i].flipT--; if (cards[i].dealT > 0) cards[i].dealT--; }

    timer--;
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
      sfxMiss();
      dealCards();
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
  };

  function drawDoodle(id, x, y, w, h) {
    var g = SPRITES[id];
    if (!g) return;
    var px = 3;
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

  function drawCard(c) {
    var x = GX + c.col * (CW + GAP), y = GY + c.row * (CHH + GAP);
    if (c.dealT > 0) {
      ctx.globalAlpha = Math.max(0, 1 - c.dealT / 16);
      y -= c.dealT * 3;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x + 3, y + 4, CW, CHH);
    var squeeze = c.flipT > 0 ? Math.abs(Math.sin(c.flipT / 8 * Math.PI)) : 0;
    var w = CW * (1 - squeeze * 0.7);
    var xx = x + (CW - w) / 2;
    if (c.state === 'down') {
      ctx.fillStyle = '#2a1a2e';
      ctx.fillRect(xx, y, w, CHH);
      ctx.fillStyle = 'rgba(255,20,147,0.35)';
      for (var dy = 6; dy < CHH - 4; dy += 12) {
        for (var dx = 6; dx < w - 4; dx += 12) {
          ctx.fillRect(xx + dx, y + dy, 4, 4);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(xx, y, w, 2);
      if (w > 50) {
        ctx.fillStyle = 'rgba(255,20,147,0.55)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LT', xx + w / 2, y + CHH / 2 + 4);
      }
    } else {
      ctx.fillStyle = c.state === 'matched' ? '#1b2a1b' : '#efe9dc';
      ctx.fillRect(xx, y, w, CHH);
      if (squeeze < 0.4) {
        var f = faces[c.face];
        if (f.type === 'img' && f.img.complete && f.img.naturalWidth > 0) {
          var iw = f.img.naturalWidth, ih = f.img.naturalHeight;
          var s = Math.max((w - 6) / iw, (CHH - 6) / ih);
          var sw = (w - 6) / s, sh = (CHH - 6) / s;
          try {
            ctx.drawImage(f.img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, xx + 3, y + 3, w - 6, CHH - 6);
          } catch (e) {
            drawDoodle(DOODLES[c.face % DOODLES.length], xx, y, w, CHH);
          }
        } else if (f.type === 'img') {
          drawDoodle(DOODLES[c.face % DOODLES.length], xx, y, w, CHH);
        } else {
          drawDoodle(f.id, xx, y, w, CHH);
        }
        if (c.state === 'matched') {
          ctx.fillStyle = 'rgba(127,255,0,0.18)';
          ctx.fillRect(xx, y, w, CHH);
        }
      }
    }
    if (c.state === 'matched') {
      var sweep = ((frame * 1.6 + c.col * 24 + c.row * 12) % (w + 40)) - 20;
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(xx + Math.max(0, Math.min(w - 6, sweep)), y, 6, CHH);
    }
    ctx.strokeStyle = c.state === 'matched' ? LIME : c.state === 'up' ? '#14121a' : 'rgba(255,255,255,0.3)';
    ctx.strokeRect(xx + 0.5, y + 0.5, w - 1, CHH - 1);
    ctx.globalAlpha = 1;
  }

  // ── Shop leaderboard: top 5 on this machine, signed with three initials ──
  var BOARD_KEY = 'lumenati-arcade-flashmatch-board';
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
    ctx.fillText('OUT OF TIME', W / 2, 58);
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
    ctx.fillText('SPACE or TAP to reshuffle', W / 2, 286);
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
    var ids = ['heart', 'swallow', 'anchor', 'rose'];
    for (var i = 0; i < 4; i++) {
      var fx2 = 44 + i * 82, fy2 = 150;
      var flipT2 = Math.max(0, Math.min(1, (t2 - 16 - i * 14) / 18));
      var wq = 70 * Math.abs(flipT2 < 0.5 ? 1 - flipT2 * 2 : flipT2 * 2 - 1);
      var open2 = flipT2 >= 0.5;
      ctx.fillStyle = open2 ? '#efe9dc' : '#2a1a2e';
      ctx.fillRect(fx2 + (70 - wq) / 2, fy2, wq, 52);
      ctx.strokeStyle = open2 ? '#14121a' : 'rgba(255,20,147,0.5)';
      ctx.strokeRect(fx2 + (70 - wq) / 2 + 0.5, fy2 + 0.5, Math.max(1, wq - 1), 51);
      if (open2 && flipT2 > 0.85) drawDoodle(ids[i], fx2, fy2, 70, 52);
    }
    slam('FLASH MATCH', 100, 28, CYAN);
    if (t2 > 130) { ctx.fillStyle = YELLOW; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText('KNOW YOUR FLASH', W / 2, 126); }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 58, W, 58);
    ctx.fillStyle = '#cfd6dd';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TAP a card, or ARROWS + SPACE to flip // streaks pay triple', W / 2, H - 42);
    ctx.fillText('clear the board before the clock dies // it shrinks every session', W / 2, H - 29);
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
    var felt = ctx.createLinearGradient(0, 0, 0, H);
    felt.addColorStop(0, '#171223');
    felt.addColorStop(1, '#100c18');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, W, H);
    var vig = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 260);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    for (var i = 0; i < cards.length; i++) drawCard(cards[i]);

    // Keyboard cursor
    var cx = GX + cursor.col * (CW + GAP), cy = GY + cursor.row * (CHH + GAP);
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 2, cy - 2, CW + 4, CHH + 4);
    ctx.lineWidth = 1;

    // Timer
    var tr = Math.max(0, timer / timerMax);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(8, 30, W - 16, 5);
    ctx.fillStyle = tr > 0.3 ? CYAN : (Math.floor(frame / 6) % 2 === 0 ? '#ff4444' : '#992222');
    ctx.fillRect(8, 30, (W - 16) * tr, 5);

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 110, 14);
    ctx.fillStyle = LIME;
    ctx.textAlign = 'right';
    ctx.fillText('SESSION ' + level, W - 8, 14);
    if (streak > 1) {
      ctx.fillStyle = YELLOW;
      ctx.textAlign = 'center';
      ctx.fillText('STREAK x' + Math.min(3, streak), W / 2, 14);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = bannerText.indexOf('TIME') === 0 ? '#ff4444' : LIME;
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2);
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-flashmatch', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
