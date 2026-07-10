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

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', PURPLE = '#9b59b6';
  var COLS = 4, ROWS = 4;
  var CW = 82, CHH = 56, GAP = 8;
  var GX = (W - (COLS * CW + (COLS - 1) * GAP)) / 2;
  var GY = 42;

  // Built-in flash doodles, used when the room doesn't have 8 images to deal
  var DOODLES = ['heart', 'skull', 'bolt', 'star', 'dagger', 'eight', 'drop', 'machine'];

  var mode = 'ready'; // ready | play | over
  var score, lives, level, frame;
  var cards, first, second, missT, timer, timerMax, streak, bannerT, bannerText, faces;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-flashmatch') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-flashmatch', String(best)); } catch(e) {} }
  }

  // Deal the artist's own work onto the cards: grab up to 8 images already on
  // the room page (portfolio, polaroids, posters); doodles fill any gaps.
  function collectFaces() {
    faces = [];
    var seen = {};
    var imgs = document.querySelectorAll('.br-portfolio-grid img, .bedroom-polaroid img, .bedroom-wall-poster img');
    for (var i = 0; i < imgs.length && faces.length < 8; i++) {
      var src = imgs[i].getAttribute('src');
      if (!src || seen[src]) continue;
      seen[src] = true;
      var im = new Image();
      im.src = src;
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
      return { face: f, state: 'down', flipT: 0, col: i % COLS, row: Math.floor(i / COLS) };
    });
    first = null; second = null; missT = 0;
    timerMax = Math.max(2400, 5400 - (level - 1) * 700); // 90s -> 40s
    timer = timerMax;
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; level = 1; frame = 0; streak = 0;
    mode = 'ready'; bannerT = 0; bannerText = '';
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
    if (bannerT > 0) bannerT--;
    if (missT > 0) {
      missT--;
      if (missT === 0 && first && second) {
        first.state = 'down'; second.state = 'down';
        first = null; second = null;
      }
    }
    for (var i = 0; i < cards.length; i++) if (cards[i].flipT > 0) cards[i].flipT--;

    timer--;
    if (timer <= 0) {
      lives--;
      document.getElementById('jd-br-lives').textContent = lives;
      if (lives <= 0) {
        mode = 'over';
        saveBest();
        sfxGameOver();
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

  function drawDoodle(id, x, y, w, h) {
    var cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = ['heart', 'drop'].indexOf(id) !== -1 ? PINK : id === 'bolt' ? YELLOW : id === 'star' ? CYAN : id === 'machine' ? PURPLE : id === 'eight' ? '#eee' : '#e8e4d8';
    if (id === 'heart') {
      ctx.fillRect(cx - 12, cy - 10, 9, 9); ctx.fillRect(cx + 3, cy - 10, 9, 9);
      ctx.fillRect(cx - 12, cy - 4, 24, 9); ctx.fillRect(cx - 7, cy + 5, 14, 6); ctx.fillRect(cx - 3, cy + 11, 6, 4);
    } else if (id === 'skull') {
      ctx.fillRect(cx - 10, cy - 12, 20, 14);
      ctx.fillRect(cx - 6, cy + 2, 12, 6);
      ctx.fillStyle = '#14101c';
      ctx.fillRect(cx - 7, cy - 7, 5, 5); ctx.fillRect(cx + 2, cy - 7, 5, 5);
    } else if (id === 'bolt') {
      ctx.fillRect(cx + 1, cy - 14, 8, 10); ctx.fillRect(cx - 5, cy - 6, 12, 8); ctx.fillRect(cx - 9, cy + 2, 8, 10);
    } else if (id === 'star') {
      ctx.fillRect(cx - 2, cy - 14, 4, 28); ctx.fillRect(cx - 14, cy - 2, 28, 4);
      ctx.fillRect(cx - 8, cy - 8, 16, 16);
    } else if (id === 'dagger') {
      ctx.fillRect(cx - 2, cy - 14, 4, 20); ctx.fillRect(cx - 9, cy - 2, 18, 4); ctx.fillRect(cx - 1, cy + 8, 2, 6);
    } else if (id === 'eight') {
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14101c';
      ctx.beginPath(); ctx.arc(cx, cy - 3, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eee';
      ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('8', cx, cy);
    } else if (id === 'drop') {
      ctx.beginPath(); ctx.arc(cx, cy + 3, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy - 13); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx - 7, cy); ctx.fill();
    } else { // machine
      ctx.fillRect(cx - 8, cy - 10, 16, 14);
      ctx.fillStyle = PINK;
      ctx.fillRect(cx - 10, cy - 13, 6, 5); ctx.fillRect(cx + 4, cy - 13, 6, 5);
      ctx.fillStyle = '#ccc';
      ctx.fillRect(cx - 1, cy + 4, 2, 8);
    }
  }

  function drawCard(c) {
    var x = GX + c.col * (CW + GAP), y = GY + c.row * (CHH + GAP);
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
    ctx.strokeStyle = c.state === 'matched' ? LIME : 'rgba(255,255,255,0.3)';
    ctx.strokeRect(xx + 0.5, y + 0.5, w - 1, CHH - 1);
  }

  function draw() {
    ctx.fillStyle = '#14101c';
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

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PINK;
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('OUT OF TIME', W / 2, H / 2 - 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Score: ' + score, W / 2, H / 2 + 5);
      ctx.fillStyle = score >= best && score > 0 ? YELLOW : '#9aa';
      ctx.font = '12px monospace';
      ctx.fillText(score >= best && score > 0 ? 'NEW BEST!' : 'Best: ' + best, W / 2, H / 2 + 25);
      ctx.fillStyle = YELLOW;
      ctx.fillText('SPACE or TAP to reshuffle', W / 2, H / 2 + 48);
    }

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = CYAN;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FLASH MATCH', W / 2, H / 2 - 46);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('Find the pairs in this room\'s flash', W / 2, H / 2 - 12);
      ctx.fillText('TAP a card, or ARROWS + SPACE', W / 2, H / 2 + 6);
      ctx.fillStyle = YELLOW;
      ctx.fillText('Streaks pay triple // beat the clock', W / 2, H / 2 + 24);
      ctx.fillStyle = '#9aa';
      ctx.fillText('Each session the clock shrinks // Best: ' + best, W / 2, H / 2 + 42);
    }
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
      else frame++;
      acc -= 16.67;
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  var obs = new MutationObserver(function() {
    if (document.getElementById('jd-game-overlay').style.display === 'flex') init();
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
