(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 400, H = 320;
  var CELL = 20, COLS = 20, ROWS = 16;

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
  function sfxEat() { playSfx(700, 0.07, 'square', 0.1); setTimeout(function(){playSfx(1000, 0.08, 'square', 0.1);}, 50); }
  function sfxBonus() { playSfx(900, 0.08, 'square', 0.12); setTimeout(function(){playSfx(1200, 0.08, 'square', 0.12);}, 70); setTimeout(function(){playSfx(1500, 0.12, 'square', 0.12);}, 140); }
  function sfxDie() { playSfx(200, 0.25, 'sawtooth', 0.15); }
  function sfxGameOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function(){playSfx(300, 0.15, 'square', 0.12);}, 150); setTimeout(function(){playSfx(200, 0.3, 'square', 0.12);}, 300); }

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#9b59b6', CYAN = '#00FFFF';

  var mode = 'ready'; // ready | play | over
  var score, lives, frame, snake, dir, turns, food, bonus, bonusT, eaten, stepEvery, respawnT, flashT;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-snake') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-snake', String(best)); } catch(e) {} }
  }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; lives = 3; frame = 0; eaten = 0; stepEvery = 9;
    bonus = null; bonusT = 0; respawnT = 0; flashT = 0; mode = 'ready';
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '3';
    resetSnake();
    placeFood();
    var hintEl = document.getElementById('jd-game-hint');
    if (hintEl) hintEl.textContent = 'Arrows or swipe to steer // machine +50';
    window.skateRunning = true;
    startLoop();
  }

  function resetSnake() {
    snake = [{x:9,y:8},{x:8,y:8},{x:7,y:8},{x:6,y:8}];
    dir = {x:1,y:0};
    turns = [];
  }

  function cellFree(x, y) {
    for (var i = 0; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) return false;
    if (food && food.x === x && food.y === y) return false;
    if (bonus && bonus.x === x && bonus.y === y) return false;
    return true;
  }

  function randFree() {
    var x, y, tries = 0;
    do { x = Math.floor(Math.random() * COLS); y = Math.floor(Math.random() * ROWS); tries++; }
    while (!cellFree(x, y) && tries < 500);
    return {x:x, y:y};
  }

  function placeFood() { food = randFree(); }

  function turn(nx, ny) {
    var last = turns.length ? turns[turns.length - 1] : dir;
    if (nx === -last.x && ny === -last.y) return; // no 180s
    if (nx === last.x && ny === last.y) return;
    if (turns.length < 3) turns.push({x:nx, y:ny});
  }

  function die() {
    lives--;
    document.getElementById('jd-br-lives').textContent = lives;
    flashT = 12;
    if (lives <= 0) {
      mode = 'over';
      saveBest();
      sfxGameOver();
    } else {
      sfxDie();
      resetSnake();
      respawnT = 45;
    }
  }

  function step() {
    if (turns.length) dir = turns.shift();
    var head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { die(); return; }
    for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) { die(); return; }
    }
    snake.unshift(head);
    if (food && head.x === food.x && head.y === food.y) {
      score += 10; eaten++;
      document.getElementById('jd-br-score').textContent = score;
      sfxEat();
      stepEvery = Math.max(5, 9 - Math.floor(eaten / 4));
      if (eaten % 5 === 0 && !bonus) { bonus = randFree(); bonusT = 300; }
      placeFood();
    } else if (bonus && head.x === bonus.x && head.y === bonus.y) {
      score += 50;
      document.getElementById('jd-br-score').textContent = score;
      sfxBonus();
      bonus = null; bonusT = 0;
    } else {
      snake.pop();
    }
  }

  function update() {
    frame++;
    if (flashT > 0) flashT--;
    if (respawnT > 0) { respawnT--; return; }
    if (bonus) { bonusT--; if (bonusT <= 0) bonus = null; }
    if (frame % stepEvery === 0) step();
  }

  // ── Input ──
  function start() {
    if (mode === 'over') { init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  var KEYS = {
    ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
    KeyW: [0,-1], KeyS: [0,1], KeyA: [-1,0], KeyD: [1,0]
  };
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    var k = KEYS[e.code];
    if (k) {
      e.preventDefault();
      start();
      turn(k[0], k[1]);
    } else if (e.code === 'Space') {
      e.preventDefault();
      start();
    }
  });
  // Touch: swipe to steer
  var tX = null, tY = null;
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    start();
    tX = e.touches[0].clientX; tY = e.touches[0].clientY;
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (tX === null) return;
    var dx = e.touches[0].clientX - tX, dy = e.touches[0].clientY - tY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
    tX = e.touches[0].clientX; tY = e.touches[0].clientY;
  }, { passive: false });
  canvas.addEventListener('click', function() { start(); });

  function draw() {
    ctx.fillStyle = '#0b1210';
    ctx.fillRect(0, 0, W, H);
    // Faint checkerboard
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (var y = 0; y < ROWS; y++) {
      for (var x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }

    // Food: an ink drop
    if (food) {
      var fx = food.x * CELL + 10, fy = food.y * CELL + 10;
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.arc(fx, fy + 2, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx, fy - 7); ctx.lineTo(fx + 4, fy); ctx.lineTo(fx - 4, fy); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(fx - 2, fy, 2, 2);
    }

    // Bonus: a tattoo machine, blinking as it expires
    if (bonus && (bonusT > 90 || Math.floor(frame / 5) % 2 === 0)) {
      var bx = bonus.x * CELL + 5, by = bonus.y * CELL + 1;
      ctx.fillStyle = PURPLE;
      ctx.fillRect(bx, by + 2, 10, 10);
      ctx.fillStyle = '#8B5CF6';
      ctx.fillRect(bx + 2, by + 12, 6, 4);
      ctx.fillStyle = '#ccc';
      ctx.fillRect(bx + 4, by + 16, 2, 3);
      ctx.fillStyle = PINK;
      ctx.fillRect(bx + 1, by, 3, 3);
      ctx.fillRect(bx + 6, by, 3, 3);
    }

    // Snake: a trail of ink
    var blink = respawnT > 0 && Math.floor(frame / 4) % 2 === 0;
    if (!blink) {
      for (var i = snake.length - 1; i >= 0; i--) {
        var s = snake[i];
        var t = i / Math.max(1, snake.length - 1);
        ctx.fillStyle = i === 0 ? LIME : 'rgba(127,255,0,' + (1 - t * 0.6).toFixed(2) + ')';
        var pad = i === 0 ? 1 : 2;
        ctx.fillRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
      }
      // Eyes on the head: two dots ahead of center, set perpendicular to travel
      var h = snake[0];
      var hx = h.x * CELL + 10, hy = h.y * CELL + 10;
      ctx.fillStyle = '#0b1210';
      ctx.fillRect(hx + dir.x * 4 + dir.y * 4 - 1, hy + dir.y * 4 + dir.x * 4 - 1, 3, 3);
      ctx.fillRect(hx + dir.x * 4 - dir.y * 4 - 1, hy + dir.y * 4 - dir.x * 4 - 1, 3, 3);
    }

    // Hit flash
    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,0,0,' + (flashT / 40).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE: ' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: ' + Math.max(best, score), 8, 26);

    if (mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PINK;
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Score: ' + score, W / 2, H / 2 + 5);
      ctx.fillStyle = score >= best && score > 0 ? YELLOW : '#9aa';
      ctx.font = '12px monospace';
      ctx.fillText(score >= best && score > 0 ? 'NEW BEST!' : 'Best: ' + best, W / 2, H / 2 + 25);
      ctx.fillStyle = YELLOW;
      ctx.fillText('SPACE or TAP to slither again', W / 2, H / 2 + 48);
    }

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = LIME;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('INK SNAKE', W / 2, H / 2 - 42);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText('ARROWS / WASD or SWIPE to steer', W / 2, H / 2 - 8);
      ctx.fillStyle = PINK;
      ctx.fillText('Drink ink drops +10, grow long', W / 2, H / 2 + 10);
      ctx.fillStyle = PURPLE;
      ctx.fillText('Grab the machine before it fades +50', W / 2, H / 2 + 28);
      ctx.fillStyle = YELLOW;
      ctx.fillText('Best: ' + best, W / 2, H / 2 + 46);
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
