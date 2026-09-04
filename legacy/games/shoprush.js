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
  function sfxDing() { playSfx(2093, 0.05, 'sine', 0.14); setTimeout(function(){playSfx(2637, 0.16, 'sine', 0.12);}, 40); }
  function sfxBuy() { playSfx(523, 0.08, 'square', 0.1); setTimeout(function(){playSfx(659, 0.08, 'square', 0.1);}, 80); setTimeout(function(){playSfx(784, 0.08, 'square', 0.1);}, 160); setTimeout(function(){playSfx(1047, 0.2, 'square', 0.1);}, 240); }
  function sfxNope() { playSfx(180, 0.12, 'square', 0.1); setTimeout(function(){playSfx(150, 0.16, 'square', 0.1);}, 90); }
  function sfxSplash() { playSfx(300, 0.1, 'sawtooth', 0.1); setTimeout(function(){playSfx(120, 0.25, 'sawtooth', 0.1);}, 60); }
  function sfxPower(off) { if (off) { playSfx(220, 0.35, 'sawtooth', 0.12); setTimeout(function(){playSfx(90, 0.5, 'sawtooth', 0.1);}, 200); } else { playSfx(440, 0.1, 'square', 0.1); setTimeout(function(){playSfx(880, 0.2, 'square', 0.1);}, 90); } }
  function sfxShutter() { for (var i = 0; i < 6; i++) (function(k){ setTimeout(function(){ playSfx(140 + k * 10, 0.05, 'sawtooth', 0.08); }, k * 70); })(i); }
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
    var stepFrames = menu ? 11 : Math.max(7, 15 - day - ((rush || eventT > 0) ? 3 : 0));
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

  var PINK = '#FF1493', LIME = '#7FFF00', YELLOW = '#FFD700', CYAN = '#00FFFF', RED = '#ff4444';
  var SKINS = ['#f0c8a0', '#d9a276', '#b97a4e', '#8d5a3b', '#6b4128'];
  var SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#00bcd4'];
  var HAIRS = ['#222', '#5b3b1a', '#FF1493', '#e8e4d8', '#1c6b4a'];

  // Who walks in. base = the ticket, work = how long the chair is busy,
  // pat = how much patience they arrive with, tip scales with how fast they
  // got seated. Big tickets take longer and tie up a chair: the trade-off.
  var TYPES = {
    walk:      { base: 40,  work: 1.0,  pat: 1.0,  label: 'WALK-IN' },
    flash:     { base: 25,  work: 0.55, pat: 0.8,  label: 'FLASH PIECE' },
    sleeve:    { base: 120, work: 1.7,  pat: 1.1,  label: 'SLEEVE' },
    celeb:     { base: 220, work: 1.2,  pat: 0.55, label: 'CELEBRITY' },
    inspector: { base: 0,   work: 0,    pat: 0.9,  label: 'INSPECTOR' },
  };
  var PICKUPS = {
    aftercare: { pay: 15, label: 'AFTERCARE UPSELL' },
    flash:     { pay: 25, label: 'FLASH SOLD' },
    coffee:    { pay: 0,  label: 'COFFEE ROUND' },
  };

  var DOOR = { x: 30, y: 44 };
  var BENCH = [{ x: 46, y: 110 }, { x: 46, y: 152 }, { x: 46, y: 194 }, { x: 46, y: 236 }];
  var CHAIRS = [{ x: 322, y: 92 }, { x: 322, y: 172 }, { x: 322, y: 252 }];
  var CHAIR4 = { x: 214, y: 252 }; // the fourth station, bought in the shop
  var REGISTER = { x: 103, y: 92 };   // where finished clients pay
  var BACKROOM = { x: 386, y: 300 };  // where deliveries go
  // Things you cannot walk through: routing is part of the job.
  var FURNITURE = [
    { x: 74, y: 54, w: 58, h: 28, name: 'desk' },
    { x: 364, y: 48, w: 28, h: 30, name: 'plant' },
    { x: 166, y: 150, w: 60, h: 20, name: 'table' },
  ];
  var UPGRADES = [
    { key: 'chair4',    cost: 400, name: 'FOURTH STATION',  what: 'one more chair on the floor' },
    { key: 'shoes',     cost: 250, name: 'NEW SHOES',       what: 'you run faster' },
    { key: 'coffee',    cost: 300, name: 'COFFEE MACHINE',  what: 'the queue waits longer, free round each morning' },
    { key: 'flashwall', cost: 350, name: 'FLASH WALL',      what: 'more flash clients, flash sells double' },
    { key: 'artist2',   cost: 600, name: 'SECOND ARTIST',   what: 'seats one client on their own' },
    { key: 'neon',      cost: 450, name: 'BIG NEON',        what: 'tips pay half again' },
  ];
  var LINES = {
    walk: ['walk-in?', 'got a chair?', 'been thinking about this', 'first one, go easy'],
    flash: ['that piece on the wall', 'just the flash', 'quick one'],
    sleeve: ['sleeve. big one', 'full arm, all day', 'we finishing this today?'],
    celeb: ['you know who I am', 'no photos', 'where do I sit'],
    inspector: ['health department', 'show me the stations', 'clipboard time'],
    storm: ['forget it', 'wasted my day', 'one star', 'never again'],
    pay: ['worth it', 'thanks', 'tip is in there', 'see you next time'],
  };

  var mode = 'intro'; // intro | ready | play | over
  var introT = 0;
  var score, hearts, day, frame, served, servedTarget;
  var runner, clients, chairs, spawnT, bannerT, bannerText, particles, popups, pickups;
  var streak, lastSeatFrame, quickChain, dayWalkouts, rush, inspectorDone, pickupT, doorT, shake, multFlash, dayProg;
  var stats; // for the wall's record: what this run was made of
  var bank, owned, helper, spill, bucket, eventT, eventType, eventDone, paparazzi, powerOut, delivery;
  var dayStart, dayTips, dayTipN, dayServed, starsHistory, perfectStreak, shopT, shopSel, shutterT, bubbles, lastStars;

  var best = 0;
  try { best = parseInt(localStorage.getItem('lumenati-arcade-shoprush') || '0', 10) || 0; } catch(e) {}
  function saveBest() {
    if (score > best) { best = score; try { localStorage.setItem('lumenati-arcade-shoprush', String(best)); } catch(e) {} }
  }

  function spawnEvery() { var s = Math.max(200, 460 - day * 40); if (rush) s *= 0.55; if (eventType === 'rushhour' && eventT > 0) s *= 0.5; return s; }
  function patienceMax() { return Math.max(620, 1060 - day * 50) * (owned.coffee ? 1.3 : 1); }
  function workTime() { return 480 + day * 50 + Math.random() * 240; }
  function mult() { return Math.min(5, 1 + Math.floor(streak / 3)); }
  function runSpeed() { return owned.shoes ? 3.4 : 2.6; }
  function tipMult() { return owned.neon ? 1.5 : 1; }
  function bubble(x, y, text, color, life) { bubbles.push({ x: x, y: y, text: text, color: color || '#fff', life: life || 110 }); }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; hearts = 3; day = 1; frame = 0; served = 0; servedTarget = 5;
    mode = 'intro'; introT = 0; musicStep = -1; musicFrame = 0; bannerT = 0; bannerText = '';
    particles = []; popups = []; pickups = [];
    eventDone = false;
    streak = 0; lastSeatFrame = -999; quickChain = 0; dayWalkouts = 0; rush = false; inspectorDone = false;
    pickupT = 700; doorT = 0; shake = 0; multFlash = 0; dayProg = 0;
    stats = { clients: 0, bestMult: 1, cleanDays: 0, celebs: 0, bestDay: 0, upgrades: 0, stars: 0 };
    runner = { x: 200, y: 200, tx: null, ty: null, kx: 0, ky: 0, lead: null, face: 1, wasMoving: false, carrying: false, slipT: 0 };
    clients = [];
    chairs = CHAIRS.map(function(c) { return { x: c.x, y: c.y, state: 'free', t: 0, tmax: 1, client: null, tip: 0 }; });
    spawnT = 90;
    bank = 0; owned = { chair4: false, shoes: false, coffee: false, flashwall: false, artist2: false, neon: false };
    helper = null; spill = null; bucket = null; eventT = 0; eventType = null; eventDone = false; paparazzi = []; powerOut = 0; delivery = null;
    dayStart = 0; dayTips = 0; dayTipN = 0; dayServed = 0; starsHistory = []; perfectStreak = 0; shopT = 0; shopSel = 0; shutterT = 0; bubbles = []; lastStars = 0;
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

  function spawnParticles(x, y, color, count, cash) {
    for (var i = 0; i < count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * (cash ? 4 : 3),
        vy: -Math.random() * (cash ? 3.2 : 2) - 0.5,
        life: 22 + Math.random() * 16,
        color: color,
        size: 2 + Math.random() * 2,
        cash: cash && Math.random() < 0.5,
      });
    }
  }
  function pop(x, y, text, color, big) {
    popups.push({ x: x, y: y, text: text, color: color || YELLOW, life: big ? 70 : 52, big: !!big });
  }
  function setScore() { document.getElementById('jd-br-score').textContent = score; }
  // Every dollar goes through here so the reason always shows on screen.
  function earn(amount, x, y, label, big) {
    if (amount <= 0) return;
    score += amount;
    bank += amount;
    setScore();
    pop(x, y - 6, '$' + amount, YELLOW, big);
    if (label) pop(x, y + 8, label, '#fff');
    spawnParticles(x, y, YELLOW, big ? 18 : 8, true);
    sfxCash();
    if (big) { shake = Math.max(shake, 10); sayCallout('shoprush-c1'); }
  }

  function freeBenchSeat() {
    for (var i = 0; i < BENCH.length; i++) {
      var taken = false;
      for (var j = 0; j < clients.length; j++) {
        var st = clients[j].state;
        if (clients[j].seat === i && (st === 'walkin' || st === 'waiting' || st === 'inspecting' || st === 'claimed')) taken = true;
      }
      if (!taken) return i;
    }
    return -1;
  }

  function near(ax, ay, bx, by, d) {
    return Math.abs(ax - bx) < d && Math.abs(ay - by) < d;
  }

  function pickType() {
    var r = Math.random();
    if (day >= 3 && !inspectorDone && served >= 2 && r < 0.18) { inspectorDone = true; return 'inspector'; }
    if (day >= 4 && r < 0.10) return 'celeb';
    if (day >= 2 && r < 0.32) return 'sleeve';
    if (r < (owned.flashwall ? 0.7 : 0.58)) return 'flash';
    return 'walk';
  }

  function spawnClient() {
    var seat = freeBenchSeat();
    if (seat === -1) return false;
    var type = pickType();
    var t = TYPES[type];
    var pm = Math.round(patienceMax() * t.pat);
    clients.push({
      x: DOOR.x, y: DOOR.y, seat: seat, state: 'walkin', type: type,
      patience: pm, pmax: pm, t: 0,
      skin: SKINS[Math.floor(Math.random() * SKINS.length)],
      shirt: type === 'inspector' ? '#f2f2f2' : type === 'celeb' ? '#111' : SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
      hair: type === 'inspector' ? '#5b3b1a' : HAIRS[Math.floor(Math.random() * HAIRS.length)],
      ink: [SHIRTS[Math.floor(Math.random() * SHIRTS.length)], PINK],
    });
    doorT = 34;
    sfxBell();
    var sayLines = LINES[type] || LINES.walk;
    bubble(DOOR.x + 6, DOOR.y - 14, sayLines[Math.floor(Math.random() * sayLines.length)], type === 'celeb' ? PINK : '#fff', 90);
    if (type === 'celeb') { pop(DOOR.x + 40, DOOR.y + 10, 'CELEBRITY WALK-IN', PINK, true); shake = 6; if (day >= 4 && !paparazzi.length) spawnPaparazzi(); }
    if (type === 'inspector') pop(DOOR.x + 40, DOOR.y + 10, 'HEALTH INSPECTOR', CYAN, true);
    if (type === 'sleeve') pop(DOOR.x + 34, DOOR.y + 10, 'SLEEVE. BIG TICKET', '#fff');
    return true;
  }

  function spawnPickup() {
    var r = Math.random();
    var type = r < 0.45 ? 'aftercare' : r < 0.8 ? 'flash' : 'coffee';
    pickups.push({ x: 100 + Math.random() * 170, y: 90 + Math.random() * 190, type: type, life: 640 });
  }

  function walkout(c) {
    dayWalkouts++;
    bubble(c.x, c.y - 16, LINES.storm[Math.floor(Math.random() * LINES.storm.length)], RED, 80);
    if (streak > 0) pop(c.x + 20, c.y - 20, 'STREAK LOST', RED);
    streak = 0; quickChain = 0;
    loseHeart();
  }

  function loseHeart() {
    hearts--;
    document.getElementById('jd-br-lives').textContent = hearts;
    sfxStorm();
    shake = Math.max(shake, 8);
    if (hearts <= 0) {
      setAmbience(0, 0);
      enterBoard(score);
      saveBest();
      deathJingle();
    }
  }

  function seatBonus(c, x, y) {
    // The rep streak: every seat feeds it, every walkout empties it.
    var before = mult();
    streak++;
    stats.clients++;
    var m = mult();
    if (m > before) { pop(x, y - 30, 'REP x' + m, PINK, true); multFlash = 40; sfxDay(); if (m > stats.bestMult) stats.bestMult = m; }
    // Back-to-back seats with nobody left waiting pay a chain bonus.
    if (frame - lastSeatFrame < 260) { quickChain++; earn(10 * quickChain * m, x, y - 16, 'QUICK SEAT x' + quickChain); }
    else quickChain = 0;
    lastSeatFrame = frame;
    if (c.type === 'celeb') {
      stats.celebs++;
      sayCallout('shoprush-c1');
      if (hearts < 3) { hearts++; document.getElementById('jd-br-lives').textContent = hearts; pop(x, y - 44, 'REP UP', LIME, true); }
    }
  }

  // Close the doors: rate the day, then the shop screen (between-day upgrades).
  function endDay() {
    var dayCash = score - dayStart;
    if (dayCash > stats.bestDay) stats.bestDay = dayCash;
    var avgTip = dayTipN ? dayTips / dayTipN : 0;
    var stars = dayWalkouts === 0 ? (avgTip > 0.6 ? 3 : 2) : (dayWalkouts === 1 ? 1 : 0);
    lastStars = stars;
    starsHistory.push(stars);
    stats.stars += stars;
    if (stars === 3) { perfectStreak++; } else perfectStreak = 0;
    if (dayWalkouts === 0) {
      var bonus = 60 * day * mult();
      stats.cleanDays++;
      earn(bonus, W / 2, H / 2 + 10, 'CLEAN DAY. NOBODY WALKED', true);
    }
    if (stars > 0) earn(stars * 40 * day, W / 2, H / 2 + 34, stars + ' STAR DAY', stars === 3);
    if (perfectStreak >= 2) earn(100 * perfectStreak * day, W / 2, H / 2 + 58, 'PERFECT STREAK x' + perfectStreak, true);
    // everyone still on the floor finishes up on their own overnight
    clients = clients.filter(function(c) { return c.state === 'inchair'; });
    runner.lead = null; runner.carrying = false;
    paparazzi = []; delivery = null; bucket = null; spill = null; powerOut = 0; eventT = 0; eventType = null;
    if (helper) { helper.state = 'idle'; helper.lead = null; }
    shutterT = 70;
    shopT = 0; shopSel = 0;
    sfxShutter();
    mode = 'shop';
    setAmbience(0, 0);
  }
  function openDoors() {
    day++;
    served = 0; dayServed = 0;
    servedTarget = 4 + day;
    dayWalkouts = 0; rush = false; inspectorDone = false; dayProg = 0; eventDone = false;
    dayStart = score; dayTips = 0; dayTipN = 0;
    bannerT = 110;
    bannerText = 'DAY ' + day;
    say(day % 2 === 0 ? 'shoprush-c2' : 'shoprush-c3', 300);
    sfxDay();
    spawnT = 60;
    // the coffee machine pours a round every morning
    if (owned.coffee) pop(W / 2, H / 2 + 12, 'MORNING COFFEE. QUEUE CHILLS', CYAN);
    // deliveries and the mop bucket show up with the day
    if (day >= 3) { delivery = { x: DOOR.x + 30, y: DOOR.y + 24, held: false, life: 1200 }; pop(DOOR.x + 40, DOOR.y + 40, 'DELIVERY AT THE DOOR', '#fff'); }
    if (day >= 2) bucket = { x: 120 + Math.random() * 160, y: 100 + Math.random() * 150 };
    mode = 'play';
  }
  function buy(i) {
    var u = UPGRADES[i];
    if (owned[u.key]) { sfxNope(); return; }
    if (bank < u.cost) { sfxNope(); pop(W / 2, 250, 'NOT ENOUGH IN THE BANK', RED); return; }
    bank -= u.cost;
    owned[u.key] = true;
    stats.upgrades++;
    sfxBuy();
    pop(W / 2, 250, u.name + ' BOUGHT', LIME, true);
    if (u.key === 'chair4') chairs.push({ x: CHAIR4.x, y: CHAIR4.y, state: 'free', t: 0, tmax: 1, client: null, tip: 0 });
    if (u.key === 'artist2') helper = { x: 300, y: 150, state: 'idle', lead: null, face: -1, target: null };
  }
  function shopTick() {
    frame++;
    musicTick();
    if (shutterT > 0) shutterT--;
    shopT++;
    // Nobody at the controls (or a very patient one): the doors open on their own.
    if (shopT > 720) openDoors();
    for (var i = popups.length - 1; i >= 0; i--) { popups[i].y -= 0.5; popups[i].life--; if (popups[i].life <= 0) popups.splice(i, 1); }
  }

  // Paparazzi crowd the aisle by the door until the celebrity is seated.
  function spawnPaparazzi() {
    for (var i = 0; i < 3; i++) paparazzi.push({ x: 70 + i * 22, y: 96 + (i % 2) * 16, ph: Math.random() * 6 });
  }

  // Runner movement with furniture and crowds in the way; slides along edges.
  function blocked(x, y) {
    for (var i = 0; i < FURNITURE.length; i++) {
      var f = FURNITURE[i];
      if (x + 6 > f.x && x - 6 < f.x + f.w && y + 12 > f.y && y - 4 < f.y + f.h) return true;
    }
    if (owned.chair4) { if (x + 6 > CHAIR4.x - 18 && x - 6 < CHAIR4.x + 48 && y + 12 > CHAIR4.y - 24 && y - 4 < CHAIR4.y + 28) return true; }
    for (var j = 0; j < paparazzi.length; j++) if (near(x, y, paparazzi[j].x, paparazzi[j].y, 12)) return true;
    return false;
  }
  function blockRect(x, y) {
    for (var i = 0; i < FURNITURE.length; i++) {
      var f = FURNITURE[i];
      if (x + 6 > f.x && x - 6 < f.x + f.w && y + 12 > f.y && y - 4 < f.y + f.h) return f;
    }
    if (owned.chair4 && x + 6 > CHAIR4.x - 18 && x - 6 < CHAIR4.x + 48 && y + 12 > CHAIR4.y - 24 && y - 4 < CHAIR4.y + 28) return { x: CHAIR4.x - 18, y: CHAIR4.y - 24, w: 66, h: 52 };
    return null;
  }
  // steer = true (tap moves): when the way is blocked, slide around the
  // shorter side of whatever is in the way instead of stopping dead.
  function moveRunner(dx, dy, steer) {
    var sp = runSpeed() * (runner.slipT > 0 ? 0.5 : 1) * (runner.carrying ? 0.8 : 1);
    var nx = runner.x + dx * sp, ny = runner.y + dy * sp;
    var movedX = false, movedY = false;
    if (!blocked(nx, runner.y)) { runner.x = nx; movedX = dx !== 0; }
    else if (steer && dx !== 0) {
      var r1 = blockRect(nx, runner.y);
      if (r1) { var sy = (runner.y < r1.y + r1.h / 2) ? -1 : 1; var yy = runner.y + sy * sp; if (!blocked(runner.x, yy)) { runner.y = yy; movedY = true; } }
    }
    if (movedY) { /* already steered around in y this frame */ }
    else if (!blocked(runner.x, ny)) { runner.y = ny; movedY = dy !== 0; }
    else if (steer && dy !== 0 && !movedX) {
      var r2 = blockRect(runner.x, ny);
      if (r2) { var sx = (runner.x < r2.x + r2.w / 2) ? -1 : 1; var xx = runner.x + sx * sp; if (!blocked(xx, runner.y)) { runner.x = xx; movedX = true; } }
    }
    if (dx !== 0) runner.face = dx > 0 ? 1 : -1;
    return movedX || movedY;
  }

  function update() {
    frame++;
    musicTick();
    if (calloutCd > 0) calloutCd--;
    if (bannerT > 0) bannerT--;
    if (doorT > 0) doorT--;
    if (shake > 0) shake--;
    if (multFlash > 0) multFlash--;
    var target = Math.min(1, served / servedTarget);
    dayProg += (target - dayProg) * 0.02;
    var busyN = 0;
    for (var i = 0; i < chairs.length; i++) if (chairs[i].state === 'busy') busyN++;
    setAmbience(busyN, clients.length);

    if (runner.slipT > 0) runner.slipT--;
    if (powerOut > 0) { powerOut--; if (powerOut === 0) { sfxPower(false); pop(W / 2, 120, 'LIGHTS BACK', LIME); } }
    if (eventT > 0) { eventT--; if (eventT === 0) eventType = null; }
    for (var bi = bubbles.length - 1; bi >= 0; bi--) { bubbles[bi].life--; if (bubbles[bi].life <= 0) bubbles.splice(bi, 1); }
    // Runner: keys beat taps
    var moving = false;
    if (runner.kx !== 0 || runner.ky !== 0) {
      var kd = Math.hypot(runner.kx, runner.ky);
      moveRunner(runner.kx / kd, runner.ky / kd);
      runner.tx = null; runner.ty = null;
      moving = true;
    } else if (runner.tx !== null) {
      var dx = runner.tx - runner.x, dy = runner.ty - runner.y;
      var d = Math.hypot(dx, dy);
      if (d < 3) { runner.tx = null; runner.ty = null; }
      else {
        if (!moveRunner(dx / d, dy / d, true)) { runner.tx = null; runner.ty = null; } // boxed in: stop
        else moving = true;
      }
    }
    runner.x = Math.max(16, Math.min(W - 16, runner.x));
    runner.y = Math.max(60, Math.min(H - 26, runner.y));

    // The mop bucket: kick it and the floor gets slick for a while.
    if (bucket && near(runner.x, runner.y, bucket.x, bucket.y, 12)) {
      spill = { x: bucket.x, y: bucket.y, life: 700 };
      bucket = null;
      sfxSplash();
      pop(spill.x, spill.y - 14, 'SPILL. WATCH YOUR STEP', CYAN);
      shake = 5;
    }
    if (spill) {
      spill.life--;
      if (spill.life <= 0) spill = null;
      else if (near(runner.x, runner.y, spill.x, spill.y, 28)) runner.slipT = 8;
    }
    // Delivery: carry the box to the back room.
    if (delivery) {
      if (!delivery.held) {
        delivery.life--;
        if (delivery.life <= 0) { delivery = null; pop(DOOR.x + 40, DOOR.y + 40, 'DELIVERY LEFT ON THE CURB', RED); }
        else if (!runner.lead && near(runner.x, runner.y, delivery.x, delivery.y, 14)) { delivery.held = true; runner.carrying = true; sfxSeat(); pop(runner.x, runner.y - 24, 'TO THE BACK ROOM', '#fff'); }
      } else if (near(runner.x, runner.y, BACKROOM.x, BACKROOM.y, 26)) {
        runner.carrying = false;
        earn(50 * mult(), runner.x, runner.y - 12, 'SUPPLIES STOCKED');
        delivery = null;
      }
    }

    // The day's event, once, around the middle of the day.
    if (!eventDone && served >= Math.floor(servedTarget / 2) && day >= 2) {
      eventDone = true;
      var pool = ['rushhour'];
      if (day >= 5) pool.push('power');
      if (day >= 4) pool.push('celeb');
      var ev = pool[Math.floor(Math.random() * pool.length)];
      if (ev === 'rushhour') { eventType = 'rushhour'; eventT = 600; bannerT = 90; bannerText = 'RUSH HOUR'; spawnT = Math.min(spawnT, 30); }
      else if (ev === 'power') { powerOut = 300; sfxPower(true); bannerT = 90; bannerText = 'POWER FLICKER'; }
      else if (ev === 'celeb') {
        var seat0 = freeBenchSeat();
        if (seat0 !== -1) {
          var pm0 = Math.round(patienceMax() * TYPES.celeb.pat);
          clients.push({ x: DOOR.x, y: DOOR.y, seat: seat0, state: 'walkin', type: 'celeb', patience: pm0, pmax: pm0, t: 0, skin: SKINS[1], shirt: '#111', hair: HAIRS[2], ink: [PINK, YELLOW] });
          doorT = 34; sfxBell(); shake = 6;
          pop(DOOR.x + 40, DOOR.y + 10, 'CELEBRITY. PAPARAZZI IN THE AISLE', PINK, true);
          spawnPaparazzi();
        }
      }
    }
    // Paparazzi mill about; they leave once no celebrity waits.
    if (paparazzi.length) {
      var celebWaiting = false;
      for (var pi = 0; pi < clients.length; pi++) if (clients[pi].type === 'celeb' && (clients[pi].state === 'walkin' || clients[pi].state === 'waiting' || clients[pi].state === 'led')) celebWaiting = true;
      if (!celebWaiting) { paparazzi = []; pop(100, 110, 'PAPARAZZI GONE', '#fff'); }
      else for (var pj = 0; pj < paparazzi.length; pj++) { var pp = paparazzi[pj]; pp.ph += 0.05; pp.x += Math.sin(pp.ph) * 0.4; pp.y += Math.cos(pp.ph * 0.7) * 0.3; }
    }

    // The second artist seats one client at a time on their own.
    if (helper) {
      var hs = 1.6;
      if (helper.state === 'idle') {
        // nothing to seat: wipe a dirty station on the way
        var dirtyCh = null;
        for (var dci = 0; dci < chairs.length; dci++) if (chairs[dci].state === 'dirty') { dirtyCh = chairs[dci]; break; }
        if (dirtyCh && frame % 20 === 0) { helper.state = 'wiping'; helper.target = dirtyCh; }
        var waitingC = null, freeCh = null;
        for (var wi = 0; wi < clients.length; wi++) { var wc = clients[wi]; if (wc.state === 'waiting' && wc.type !== 'inspector' && (!waitingC || wc.patience < waitingC.patience)) waitingC = wc; }
        for (var fi = 0; fi < chairs.length; fi++) if (chairs[fi].state === 'free') { freeCh = chairs[fi]; break; }
        if (waitingC && freeCh && frame % 30 === 0) { helper.state = 'toClient'; helper.target = waitingC; waitingC.state = 'claimed'; }
      } else if (helper.state === 'wiping') {
        var wch = helper.target;
        if (!wch || wch.state !== 'dirty') { helper.state = 'idle'; helper.target = null; }
        else {
          var wdx = wch.x - 24 - helper.x, wdy = wch.y - helper.y, wd = Math.hypot(wdx, wdy);
          if (wd < 6) { wch.state = 'free'; pop(wch.x - 10, wch.y - 20, 'CREW WIPED IT', CYAN); helper.state = 'idle'; helper.target = null; }
          else { helper.x += wdx / wd * hs; helper.y += wdy / wd * hs; helper.face = wdx > 0 ? 1 : -1; }
        }
      } else if (helper.state === 'toClient') {
        var tc = helper.target;
        if (!tc || clients.indexOf(tc) === -1) { helper.state = 'idle'; helper.target = null; }
        else {
          var hdx = tc.x + 14 - helper.x, hdy = tc.y - helper.y, hd = Math.hypot(hdx, hdy);
          if (hd < 4) { helper.state = 'leading'; tc.state = 'hled'; helper.lead = tc; helper.target = null; }
          else { helper.x += hdx / hd * hs; helper.y += hdy / hd * hs; helper.face = hdx > 0 ? 1 : -1; }
        }
      } else if (helper.state === 'leading') {
        var lc = helper.lead, dest = null;
        for (var di = 0; di < chairs.length; di++) if (chairs[di].state === 'free') { dest = chairs[di]; break; }
        if (!lc || !dest) { if (lc) { lc.state = 'waiting'; } helper.state = 'idle'; helper.lead = null; }
        else {
          var ddx = dest.x - 24 - helper.x, ddy = dest.y - helper.y, dd = Math.hypot(ddx, ddy);
          if (dd < 4) {
            lc.state = 'inchair'; lc.x = dest.x; lc.y = dest.y;
            dest.state = 'busy'; var tt2 = TYPES[lc.type];
            dest.tmax = workTime() * tt2.work; dest.t = dest.tmax; dest.client = lc;
            dest.tip = Math.ceil(lc.patience / lc.pmax * tt2.base * 0.4 * tipMult());
            dayTips += lc.patience / lc.pmax; dayTipN++;
            sfxSeat(); streak++; stats.clients++;
            pop(dest.x - 10, dest.y - 24, 'SEATED BY THE CREW', CYAN);
            helper.state = 'idle'; helper.lead = null;
          } else { helper.x += ddx / dd * hs; helper.y += ddy / dd * hs; helper.face = ddx > 0 ? 1 : -1; if (lc) { lc.x += (helper.x - 14 * helper.face - lc.x) * 0.2; lc.y += (helper.y - lc.y) * 0.2; } }
        }
      }
    }
    if (moving && frame % 7 === 0) particles.push({ x: runner.x - runner.face * 6, y: runner.y + 12, vx: -runner.face * 0.6, vy: -0.3, life: 14, color: 'rgba(255,255,255,0.35)', size: 2 });
    runner.wasMoving = moving;

    // Closing rush: the last two seats of every day come in hot.
    if (!rush && served >= servedTarget - 2) {
      rush = true;
      bannerT = 90; bannerText = 'CLOSING RUSH';
      spawnT = Math.min(spawnT, 40);
    }

    // Spawning
    spawnT--;
    if (spawnT <= 0) {
      if (spawnClient()) spawnT = spawnEvery() + Math.random() * 120;
      else spawnT = 60;
    }
    pickupT--;
    if (pickupT <= 0 && pickups.length < 2) { spawnPickup(); pickupT = 520 + Math.random() * 500; }

    // Clients
    for (var i = clients.length - 1; i >= 0; i--) {
      var c = clients[i];
      if (c.state === 'walkin') {
        var b = BENCH[c.seat];
        var dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
        if (d < 2) { c.state = 'waiting'; }
        else { c.x += dx / d * 1.4; c.y += dy / d * 1.4; }
      } else if (c.state === 'claimed') {
        c.patience--; // the crew is on the way; still waiting, still ticking
        if (c.patience <= 0) { c.state = 'storming'; pop(c.x + 22, c.y - 16, 'WALKED OUT', RED, true); }
      } else if (c.state === 'hled') {
        // carried along by the helper
      } else if (c.state === 'paying') {
        var rdx = REGISTER.x - c.x, rdy = REGISTER.y + 10 - c.y, rd = Math.hypot(rdx, rdy);
        if (rd < 4) {
          var ty2 = TYPES[c.type], m2 = mult();
          var youThere = near(runner.x, runner.y, REGISTER.x, REGISTER.y + 10, 30);
          var tip2 = youThere ? c.tip * 2 : c.tip;
          var pay2 = (ty2.base + tip2) * m2;
          sfxDing();
          earn(pay2, c.x + 10, c.y - 14, ty2.label + (tip2 > 0 ? ' +$' + tip2 + (youThere ? ' TIP DOUBLED' : ' TIP') : '') + (m2 > 1 ? ' x' + m2 : ''), pay2 >= 150);
          bubble(c.x, c.y - 18, LINES.pay[Math.floor(Math.random() * LINES.pay.length)], '#fff', 70);
          c.state = 'leaving';
          served++; dayServed++;
          if (served >= servedTarget) { endDay(); return; }
        } else { c.x += rdx / rd * 1.5; c.y += rdy / rd * 1.5; }
      } else if (c.state === 'waiting') {
        c.patience--;
        if (c.patience <= 0) {
          c.state = 'storming';
          pop(c.x + 22, c.y - 16, c.type === 'inspector' ? 'FAILED' : 'WALKED OUT', RED, true);
        } else if (c.type === 'inspector' && near(runner.x, runner.y, c.x, c.y, 22)) {
          c.state = 'inspecting';
          c.t = 170;
          pop(c.x + 22, c.y - 16, 'INSPECTING...', CYAN);
          sfxSeat();
        } else if (c.type !== 'inspector' && !runner.lead && !runner.carrying && near(runner.x, runner.y, c.x, c.y, 20)) {
          runner.lead = c;
          c.state = 'led';
          sfxSeat();
        }
      } else if (c.state === 'inspecting') {
        c.t--;
        if (c.t <= 0) {
          c.state = 'leaving';
          var dirty = 0;
          for (var k = 0; k < chairs.length; k++) if (chairs[k].state === 'dirty') dirty++;
          if (dirty) { pop(c.x + 22, c.y - 16, 'CLEAN THOSE STATIONS', RED); }
          else earn(80 * mult(), c.x + 10, c.y - 10, 'PASSED INSPECTION', true);
        }
      } else if (c.state === 'led') {
        // trail the runner
        var dx = runner.x - 14 * runner.face - c.x, dy = runner.y - c.y, d = Math.hypot(dx, dy);
        if (d > 16) { c.x += dx / d * 2.4; c.y += dy / d * 2.4; }
      } else if (c.state === 'leaving') {
        var dx = DOOR.x - c.x, dy = DOOR.y - c.y, d = Math.hypot(dx, dy);
        if (d < 4) { clients.splice(i, 1); doorT = 30; }
        else { c.x += dx / d * 1.6; c.y += dy / d * 1.6; }
      } else if (c.state === 'storming') {
        var dx = DOOR.x - c.x, dy = DOOR.y - c.y, d = Math.hypot(dx, dy);
        if (d < 4) {
          clients.splice(i, 1);
          doorT = 30;
          walkout(c);
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
        var tt = TYPES[c.type];
        ch.tmax = workTime() * tt.work;
        ch.t = ch.tmax;
        ch.client = c;
        ch.tip = Math.ceil(c.patience / c.pmax * tt.base * 0.5 * tipMult());
        dayTips += c.patience / c.pmax; dayTipN++;
        sfxSeat();
        seatBonus(c, ch.x - 10, ch.y - 10);
      } else if (ch.state === 'busy') {
        if (powerOut === 0) ch.t--;
        if (ch.t <= 0) {
          // Done: the client heads to the register to pay, the station needs a wipe.
          var cl = ch.client;
          cl.state = 'paying'; cl.tip = ch.tip; cl.x = ch.x - 20; cl.y = ch.y + 4;
          ch.client = null; ch.state = 'dirty'; ch.t = 0;
          sfxBell();
        }
      } else if (ch.state === 'dirty' && near(runner.x, runner.y, ch.x - 24, ch.y, 24)) {
        ch.state = 'free';
        pop(ch.x - 10, ch.y - 20, 'STATION WIPED', CYAN);
        spawnParticles(ch.x, ch.y - 6, CYAN, 6);
        sfxSeat();
      }
    }

    // Upsells on the floor
    for (var i = pickups.length - 1; i >= 0; i--) {
      var pk = pickups[i];
      pk.life--;
      if (pk.life <= 0) { pickups.splice(i, 1); continue; }
      if (near(runner.x, runner.y, pk.x, pk.y, 14)) {
        var spec = PICKUPS[pk.type];
        if (pk.type === 'coffee') {
          var calmed = 0;
          for (var j = 0; j < clients.length; j++) if (clients[j].state === 'waiting') { clients[j].patience = Math.min(clients[j].pmax, clients[j].patience + 240); calmed++; }
          pop(pk.x, pk.y - 10, calmed ? 'COFFEE ROUND. EVERYONE CHILLS' : 'COFFEE. NOBODY WAITING', CYAN);
          spawnParticles(pk.x, pk.y, CYAN, 8);
          sfxSeat();
        } else {
          var pkPay = spec.pay * mult() * (pk.type === 'flash' && owned.flashwall ? 2 : 1);
          earn(pkPay, pk.x, pk.y - 6, spec.label + (pk.type === 'flash' && owned.flashwall ? ' x2' : ''));
        }
        pickups.splice(i, 1);
      }
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= popups[i].big ? 0.45 : 0.6; popups[i].life--;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { mode = 'play'; return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); mode = 'play'; return; }
    if (mode === 'ready') mode = 'play';
  }
  var KEYS = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0], KeyW: [0,-1], KeyS: [0,1], KeyA: [-1,0], KeyD: [1,0] };
  var SHOP_ROWS = UPGRADES.length + 1; // the last row opens the doors
  function shopKey(code) {
    if (code === 'ArrowUp' || code === 'KeyW') shopSel = (shopSel + SHOP_ROWS - 1) % SHOP_ROWS;
    else if (code === 'ArrowDown' || code === 'KeyS') shopSel = (shopSel + 1) % SHOP_ROWS;
    else if (code === 'Space' || code === 'Enter') { if (shopSel === UPGRADES.length) openDoors(); else buy(shopSel); }
    else if (code === 'Escape') openDoors();
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    if (mode === 'shop') { if (KEYS[e.code] || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); if (!e.repeat) shopKey(e.code); } return; }
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
  // Shop screen rows: y positions the tap handler and the drawing share.
  var SHOP_Y0 = 96, SHOP_ROW = 24;
  function shopTap(x, y) {
    var row = Math.floor((y - SHOP_Y0 + 14) / SHOP_ROW);
    if (row >= 0 && row < UPGRADES.length) { shopSel = row; buy(row); }
    else if (y > SHOP_Y0 + UPGRADES.length * SHOP_ROW - 6) openDoors();
  }
  canvas.addEventListener('click', function(e) {
    var p = canvasXY(e.clientX, e.clientY);
    if (mode === 'shop') { shopTap(p[0], p[1]); return; }
    if (mode !== 'play') { start(); return; }
    runner.tx = p[0]; runner.ty = p[1];
  });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var p = canvasXY(e.touches[0].clientX, e.touches[0].clientY);
    if (mode === 'shop') { shopTap(p[0], p[1]); return; }
    if (mode !== 'play') { start(); return; }
    runner.tx = p[0]; runner.ty = p[1];
  }, { passive: false });

  // ── People: walk cycle, swinging arms, a face that sours as patience goes ──
  // o = { type, mood (0 happy .. 3 furious), face (-1 left, 1 right) }
  function drawPerson(x, y, skin, shirt, hair, seated, moving, o) {
    o = o || {};
    var type = o.type || 'walk', mood = o.mood || 0, face = o.face || 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 13, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    var ph = frame * 0.32 + x * 0.13;
    var bob = moving ? Math.abs(Math.sin(ph)) * 2 : 0;
    y -= bob;
    // arms swing opposite the legs
    var swing = moving ? Math.sin(ph) * 3 : 0;
    ctx.fillStyle = skin;
    if (type === 'sleeve') {
      // inked arms: skin with bands of color
      ctx.fillRect(x - 8, y - 4 + swing, 3, 8); ctx.fillRect(x + 5, y - 4 - swing, 3, 8);
      ctx.fillStyle = o.ink ? o.ink[0] : '#3498db';
      ctx.fillRect(x - 8, y - 2 + swing, 3, 2); ctx.fillRect(x + 5, y - 2 - swing, 3, 2);
      ctx.fillStyle = o.ink ? o.ink[1] : PINK;
      ctx.fillRect(x - 8, y + 1 + swing, 3, 2); ctx.fillRect(x + 5, y + 1 - swing, 3, 2);
    } else {
      ctx.fillRect(x - 8, y - 4 + swing, 3, 8); ctx.fillRect(x + 5, y - 4 - swing, 3, 8);
    }
    ctx.fillStyle = hair;
    ctx.fillRect(x - 5, y - 16, 10, 4);
    if (type === 'celeb') ctx.fillRect(x - 6, y - 14, 2, 5); // the big hair
    ctx.fillStyle = skin;
    ctx.fillRect(x - 4, y - 13, 8, 7);
    // face
    var ex = face > 0 ? 0 : -1;
    if (type === 'celeb') {
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 4, y - 11, 8, 2);
    } else {
      ctx.fillStyle = '#1a1018';
      ctx.fillRect(x - 2 + ex, y - 11, 1, 1); ctx.fillRect(x + 1 + ex, y - 11, 1, 1);
      if (mood >= 3) { ctx.fillRect(x - 3 + ex, y - 12, 2, 1); ctx.fillRect(x + 1 + ex, y - 12, 2, 1); }
    }
    ctx.fillStyle = mood >= 3 ? '#8a1a1a' : '#5a2a2a';
    if (mood === 0) { ctx.fillRect(x - 1, y - 8, 3, 1); ctx.fillRect(x - 2, y - 9, 1, 1); ctx.fillRect(x + 2, y - 9, 1, 1); }
    else if (mood === 1) ctx.fillRect(x - 1, y - 8, 3, 1);
    else if (mood === 2) { ctx.fillRect(x - 1, y - 9, 3, 1); ctx.fillRect(x - 2, y - 8, 1, 1); ctx.fillRect(x + 2, y - 8, 1, 1); }
    else { ctx.fillRect(x - 2, y - 9, 5, 2); if (frame % 20 < 10) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 6, y - 18, 2, 2); ctx.fillRect(x + 8, y - 21, 2, 2); } }
    // body
    ctx.fillStyle = shirt;
    ctx.fillRect(x - 6, y - 5, 12, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x - 6, y - 5, 12, 2);
    if (type === 'inspector') {
      ctx.fillStyle = '#1c3d8a'; ctx.fillRect(x - 1, y - 5, 2, 8); // tie
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 7, y - 3, 5, 7); // clipboard
      ctx.fillStyle = '#888'; ctx.fillRect(x + 8, y - 1, 3, 1); ctx.fillRect(x + 8, y + 1, 3, 1);
    } else if (type === 'celeb') {
      ctx.fillStyle = YELLOW; ctx.fillRect(x - 4, y - 4, 8, 1); // the chain
      if (frame % 16 < 8) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, y - 16, 2, 2); ctx.fillRect(x - 11, y - 8, 2, 2); }
    } else if (type === 'flash') {
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(x + 7, y - 3, 5, 6);
      ctx.fillStyle = PINK; ctx.fillRect(x + 9, y - 1, 2, 2);
    }
    if (!seated) {
      ctx.fillStyle = '#223';
      var step2 = moving ? Math.sin(ph) * 2 : 0;
      ctx.fillRect(x - 5, y + 6 + Math.max(0, step2), 4, 6 - Math.max(0, step2));
      ctx.fillRect(x + 1, y + 6 + Math.max(0, -step2), 4, 6 - Math.max(0, -step2));
    }
  }
  function moodOf(c) {
    var pr = c.patience / c.pmax;
    return pr > 0.66 ? 0 : pr > 0.4 ? 1 : pr > 0.18 ? 2 : 3;
  }

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  // Every cabinet, room and the kiosk post to the same wall; this game only
  // hands over the final score and draws what the module gives back.
  var wall = window.ArcadeBoard.attach({
    game: 'shoprush', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'BAD REVIEWS', again: 'SPACE or TAP to reopen the shop',
    fmt: function (v) { return '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    scoreLabel: 'CASH',
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
    label: 'Shop Rush',
    levelLabel: function (l) { return 'CLOSED ON DAY ' + l + ' // ' + stats.clients + ' CLIENTS // BEST DAY $' + stats.bestDay + ' // ' + stats.upgrades + ' UPGRADES'; },
  });
  function enterBoard(v) { wall.enter(v, { level: day, meta: { clients: stats.clients, bestMult: stats.bestMult, cleanDays: stats.cleanDays, celebs: stats.celebs, bestDay: stats.bestDay, upgrades: stats.upgrades, stars: stats.stars } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }



  // ── Attract-mode intro: CRT power-on, studio card, then the title scene ──
  function drawIntro() {
    var t = introT;
    // After the title scene the cabinet flips to the shop wall, then loops.
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
      drawPerson(30 + wx2, wy2, SKINS[i % SKINS.length], SHIRTS[i % SHIRTS.length], HAIRS[i % HAIRS.length], false, wx2 < 240 + i * 30, { type: ['walk', 'sleeve', 'flash'][i] });
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
    ctx.fillText('ARROWS or TAP to run // seat fast for tips, be at the register when they pay', W / 2, H - 42);
    ctx.fillText('wipe the station, spend the bank between days // 3 walkouts close the shop', W / 2, H - 29);
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

  function skyColor(p) {
    // morning, noon, dusk, night
    var stops = [[143, 199, 255], [191, 227, 255], [255, 154, 92], [27, 31, 74]];
    var f = Math.max(0, Math.min(0.999, p)) * 3, i = Math.floor(f), k = f - i;
    var a = stops[i], b = stops[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')';
  }

  function drawWindow(x, y, w, h) {
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = skyColor(dayProg);
    ctx.fillRect(x, y, w, h);
    if (dayProg > 0.7) {
      ctx.fillStyle = 'rgba(255,255,255,' + ((dayProg - 0.7) * 2).toFixed(2) + ')';
      ctx.fillRect(x + 6, y + 4, 1, 1); ctx.fillRect(x + 19, y + 9, 1, 1); ctx.fillRect(x + 33, y + 3, 1, 1); ctx.fillRect(x + 27, y + 14, 1, 1);
    } else if (dayProg < 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      var cx = x + 6 + ((frame * 0.1) % (w + 20)) - 10;
      ctx.fillRect(cx, y + 5, 10, 3); ctx.fillRect(cx + 3, y + 3, 5, 2);
    }
    // the street: a rooftop line and the sun or moon
    ctx.fillStyle = '#2b2233';
    ctx.fillRect(x, y + h - 6, w, 6);
    ctx.fillRect(x + 8, y + h - 10, 6, 4); ctx.fillRect(x + 28, y + h - 12, 9, 6);
    var sunX = x + 6 + dayProg * (w - 12), sunY = y + 4 + Math.sin(dayProg * Math.PI) * -2 + (1 - Math.sin(dayProg * Math.PI)) * 8;
    ctx.fillStyle = dayProg > 0.75 ? '#f4f1d8' : '#ffd23f';
    ctx.fillRect(sunX, sunY, 4, 4);
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(x + w / 2 - 1, y, 2, h); ctx.fillRect(x, y + h / 2 - 1, w, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 2, y + 2, w / 2 - 5, 3);
  }

  function drawPickup(pk) {
    var bl = pk.life < 120 && Math.floor(frame / 6) % 2 === 0;
    if (bl) return;
    var fl = Math.sin(frame * 0.15 + pk.x) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(pk.x, pk.y + 7, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
    var y = pk.y + fl;
    if (pk.type === 'aftercare') {
      ctx.fillStyle = '#fff'; ctx.fillRect(pk.x - 5, y - 6, 10, 12);
      ctx.fillStyle = LIME; ctx.fillRect(pk.x - 1, y - 4, 2, 8); ctx.fillRect(pk.x - 4, y - 1, 8, 2);
    } else if (pk.type === 'flash') {
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(pk.x - 6, y - 7, 12, 14);
      ctx.fillStyle = PINK; ctx.fillRect(pk.x - 3, y - 4, 6, 4); ctx.fillRect(pk.x - 1, y + 1, 2, 3);
      ctx.fillStyle = '#14121a'; ctx.fillRect(pk.x - 4, y - 5, 2, 2);
    } else {
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(pk.x - 4, y - 5, 8, 10);
      ctx.fillStyle = '#5b3b1a'; ctx.fillRect(pk.x - 4, y - 5, 8, 2);
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(pk.x + 4, y - 2, 3, 4);
      if (frame % 12 < 6) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(pk.x - 1, y - 10, 2, 3); }
    }
    ctx.fillStyle = YELLOW;
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pk.type === 'coffee' ? 'CALM' : '$' + PICKUPS[pk.type].pay, pk.x, y - 11);
  }

  function draw() {
    if (mode === 'intro') { drawIntro(); return; }
    drawScene();
    if (mode === 'shop') drawShop();
    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();
  }

  function drawStar(x, y, on) {
    ctx.fillStyle = on ? YELLOW : 'rgba(255,255,255,0.18)';
    ctx.fillRect(x - 1, y - 5, 2, 10); ctx.fillRect(x - 5, y - 1, 10, 2);
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.1)';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  // The between-day screen: the shutter comes down, the till gets counted,
  // and the bank buys the shop something.
  function drawShop() {
    // shutter rolling down over the whole screen
    var sh = shutterT > 0 ? 1 - shutterT / 70 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H * sh);
    if (sh < 1) {
      ctx.fillStyle = '#3a3a44';
      for (var yy = 0; yy < H * sh; yy += 6) { ctx.fillStyle = yy % 12 === 0 ? '#4a4a56' : '#2e2e38'; ctx.fillRect(0, yy, W, 6); }
      return;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = PINK;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('CLOSED. DAY ' + day + ' IN THE BOOKS', W / 2, 34);
    for (var st = 0; st < 3; st++) drawStar(W / 2 - 16 + st * 16, 50, st < lastStars);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('BANK $' + bank + '   //   LIFETIME $' + score, W / 2, 72);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '8px monospace';
    ctx.fillText(perfectStreak >= 2 ? 'PERFECT STREAK x' + perfectStreak + '. KEEP IT.' : lastStars === 3 ? 'THREE STARS. SEAT THEM FAST, NOBODY WALKS.' : lastStars >= 1 ? 'FASTER SEATS MEAN BIGGER TIPS AND MORE STARS.' : 'TWO WALKOUTS TODAY. THE COFFEE MACHINE HELPS.', W / 2, 86);
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i], y = SHOP_Y0 + i * SHOP_ROW;
      var sel = i === shopSel, have = owned[u.key], can = bank >= u.cost;
      if (sel) { ctx.fillStyle = 'rgba(255,20,147,' + (0.22 + 0.08 * Math.sin(frame * 0.15)) + ')'; ctx.fillRect(28, y - 12, W - 56, SHOP_ROW - 3); }
      ctx.textAlign = 'left';
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = have ? LIME : can ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.fillText((sel ? '> ' : '  ') + u.name, 34, y);
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(u.what, 46, y + 9);
      ctx.textAlign = 'right';
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = have ? LIME : can ? YELLOW : 'rgba(255,255,255,0.35)';
      ctx.fillText(have ? 'OWNED' : '$' + u.cost, W - 34, y);
    }
    var oy = SHOP_Y0 + UPGRADES.length * SHOP_ROW + 4;
    var openSel = shopSel === UPGRADES.length;
    ctx.fillStyle = openSel ? PINK : 'rgba(255,255,255,0.12)';
    ctx.fillRect(W / 2 - 80, oy - 4, 160, 24);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('OPEN THE DOORS: DAY ' + (day + 1), W / 2, oy + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '8px monospace';
    ctx.fillText(('ontouchstart' in window) ? 'TAP an upgrade to buy it // TAP the doors to open' : 'ARROWS pick // SPACE buys // ESC opens the doors', W / 2, H - 14);
    // the auto-open timer, honest about it
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(40, H - 6, (W - 80) * (1 - shopT / 720), 2);
  }

  function drawScene() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // Wood plank floor with grain
    ctx.fillStyle = '#2a1d24';
    ctx.fillRect(-8, -8, W + 16, H + 16);
    for (var py2 = 58; py2 < H; py2 += 18) {
      var rowShade = (Math.floor(py2 / 18) % 2 === 0) ? '#30222a' : '#281a21';
      ctx.fillStyle = rowShade;
      ctx.fillRect(-8, py2, W + 16, 17);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-8, py2 + 17, W + 16, 1);
      var off = (Math.floor(py2 / 18) % 2) * 60;
      for (var px2 = off; px2 < W; px2 += 120) {
        ctx.fillRect(px2, py2, 1, 17);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect((py2 * 37) % W, py2 + 8, 3, 2);
    }
    // A rug in the middle of the floor
    ctx.fillStyle = 'rgba(255,20,147,0.08)';
    ctx.fillRect(130, 120, 130, 130);
    ctx.strokeStyle = 'rgba(255,20,147,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(136, 126, 118, 118);
    // Night falls on the floor too
    if (dayProg > 0.6) { ctx.fillStyle = 'rgba(10,8,30,' + ((dayProg - 0.6) * 0.5).toFixed(2) + ')'; ctx.fillRect(-8, 58, W + 16, H); }

    // Back wall: brick tint, flash sheets, windows onto the street, a clock
    ctx.fillStyle = '#1a1016';
    ctx.fillRect(-8, -8, W + 16, 66);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (var by2 = 4; by2 < 54; by2 += 10) {
      for (var bx2 = (by2 % 20 === 4 ? 0 : 14); bx2 < W; bx2 += 28) ctx.fillRect(bx2, by2, 12, 1);
    }
    var FRAMES = [84, 118, 344];
    for (var i = 0; i < FRAMES.length; i++) {
      var fsx = FRAMES[i];
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
      } else { // skull
        ctx.fillStyle = '#ccd2d8';
        ctx.fillRect(fsx + 7, 13, 9, 7);
        ctx.fillRect(fsx + 9, 20, 5, 4);
        ctx.fillStyle = '#14121a';
        ctx.fillRect(fsx + 9, 15, 2, 2); ctx.fillRect(fsx + 13, 15, 2, 2);
      }
    }
    drawWindow(160, 7, 44, 22);
    drawWindow(236, 7, 44, 22);
    // the shop clock reads the day's progress
    ctx.fillStyle = '#efe9dc';
    ctx.beginPath(); ctx.arc(306, 19, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(306, 19, 9, 0, Math.PI * 2); ctx.stroke();
    var ang = -Math.PI / 2 + dayProg * Math.PI * 1.6;
    ctx.strokeStyle = '#14121a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(306, 19); ctx.lineTo(306 + Math.cos(ang) * 6, 19 + Math.sin(ang) * 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(306, 19); ctx.lineTo(306 + Math.cos(ang * 4) * 4, 19 + Math.sin(ang * 4) * 4); ctx.stroke();

    // Neon sign with a real glow, brighter as the street goes dark
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    var neonOn = Math.floor(frame / 30) % 2 === 0;
    var glow = (0.25 + dayProg * 0.35) * (owned.neon ? 1.8 : 1);
    if (owned.neon) { ctx.fillStyle = 'rgba(255,20,147,' + (glow * 0.35).toFixed(2) + ')'; ctx.fillRect(W / 2 - 96, 28, 192, 20); }
    ctx.fillStyle = neonOn ? 'rgba(255,20,147,' + glow.toFixed(2) + ')' : 'rgba(200,0,110,0.15)';
    ctx.fillText('* LUMENATI TATTOO *', W / 2 + 1, 41);
    ctx.fillText('* LUMENATI TATTOO *', W / 2 - 1, 39);
    ctx.fillText('* LUMENATI TATTOO *', W / 2, 42);
    ctx.fillStyle = neonOn ? PINK : '#c8006e';
    ctx.fillText('* LUMENATI TATTOO *', W / 2, 40);

    // Door with a striped awning; it swings when someone comes or goes
    ctx.fillStyle = '#3a2a34';
    ctx.fillRect(DOOR.x - 16, 30, 32, 28);
    ctx.fillStyle = skyColor(dayProg);
    ctx.fillRect(DOOR.x - 12, 33, 24, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(DOOR.x - 12, 47, 24, 8);
    var swingA = doorT > 0 ? Math.sin((doorT / 34) * Math.PI) * 1.1 : 0;
    ctx.save();
    ctx.translate(DOOR.x - 12, 33);
    ctx.rotate(-swingA);
    ctx.fillStyle = '#5c4250';
    ctx.fillRect(0, 0, 24, 22);
    ctx.fillStyle = '#7a5a6c';
    ctx.fillRect(3, 3, 18, 8);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(19, 13, 2, 2);
    ctx.restore();
    for (var aw = 0; aw < 4; aw++) {
      ctx.fillStyle = aw % 2 === 0 ? PINK : '#efe9dc';
      ctx.fillRect(DOOR.x - 18 + aw * 9, 26, 9, 5);
    }
    ctx.fillStyle = LIME;
    ctx.font = '8px monospace';
    ctx.fillText(rush ? 'LAST CALL' : 'OPEN', DOOR.x, 66);

    // Front desk by the door: register, bell, the day's take
    ctx.fillStyle = '#4a3440';
    ctx.fillRect(74, 62, 58, 18);
    ctx.fillStyle = '#5c4250';
    ctx.fillRect(74, 62, 58, 3);
    ctx.fillStyle = '#2a2030';
    ctx.fillRect(80, 54, 16, 10);
    ctx.fillStyle = LIME;
    ctx.fillRect(82, 56, 12, 3);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(112, 58, 8, 5); ctx.fillRect(115, 56, 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(74, 80, 58, 3);
    // a plant in the corner
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(372, 66, 12, 10);
    ctx.fillStyle = '#2e8b57';
    ctx.fillRect(370, 54, 6, 8); ctx.fillRect(377, 50, 5, 12); ctx.fillRect(383, 56, 5, 8);
    // coffee machine on the wall once bought
    if (owned.coffee) {
      ctx.fillStyle = '#2a2030'; ctx.fillRect(138, 50, 18, 14);
      ctx.fillStyle = '#c9a227'; ctx.fillRect(140, 52, 14, 3);
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(143, 58, 6, 5);
      if (frame % 40 < 20) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(146, 44, 2, 4); ctx.fillRect(149, 41, 2, 4); }
    }
    // the flash table mid-floor: prints, a jar of pens, something to route around
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(168, 168, 60, 4);
    ctx.fillStyle = '#4a3440'; ctx.fillRect(166, 150, 60, 20);
    ctx.fillStyle = '#5c4250'; ctx.fillRect(166, 150, 60, 3);
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(170, 155, 12, 9); ctx.fillRect(186, 154, 12, 9); ctx.fillRect(203, 156, 12, 9);
    ctx.fillStyle = PINK; ctx.fillRect(173, 158, 5, 3); ctx.fillStyle = '#2d6cdf'; ctx.fillRect(189, 157, 5, 3); ctx.fillStyle = '#14121a'; ctx.fillRect(206, 159, 4, 3);
    if (owned.flashwall) { ctx.fillStyle = YELLOW; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText('FLASH $', 196, 148); }
    // the back room door
    ctx.fillStyle = '#3a2a34'; ctx.fillRect(372, 284, 26, 36);
    ctx.fillStyle = '#2a2030'; ctx.fillRect(375, 288, 20, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('BACK', 385, 296);
    // spill on the floor
    if (spill) {
      ctx.fillStyle = 'rgba(80,160,255,' + Math.min(0.35, spill.life / 900).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(spill.x, spill.y + 4, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(spill.x - 8, spill.y, 6, 2); ctx.fillRect(spill.x + 6, spill.y + 6, 4, 2);
    }
    // the mop bucket, waiting to be kicked
    if (bucket) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(bucket.x, bucket.y + 8, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c230'; ctx.fillRect(bucket.x - 7, bucket.y - 4, 14, 12);
      ctx.fillStyle = '#5aa9ff'; ctx.fillRect(bucket.x - 5, bucket.y - 3, 10, 3);
      ctx.fillStyle = '#8a8a8a'; ctx.fillRect(bucket.x + 4, bucket.y - 18, 2, 16);
      ctx.fillStyle = '#ddd'; ctx.fillRect(bucket.x + 1, bucket.y - 21, 8, 4);
    }
    // a delivery at the door
    if (delivery && !delivery.held) {
      var bl2 = delivery.life < 200 && Math.floor(frame / 8) % 2 === 0;
      if (!bl2) {
        ctx.fillStyle = '#b8863b'; ctx.fillRect(delivery.x - 9, delivery.y - 8, 18, 14);
        ctx.fillStyle = '#8a6228'; ctx.fillRect(delivery.x - 9, delivery.y - 2, 18, 2);
        ctx.fillStyle = '#fff'; ctx.fillRect(delivery.x - 5, delivery.y - 6, 6, 3);
        ctx.fillStyle = YELLOW; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('CARRY $50', delivery.x, delivery.y - 12);
      }
    }

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
      var pool = ctx.createRadialGradient(ch.x + 8, ch.y - 4, 6, ch.x + 8, ch.y - 4, 52);
      pool.addColorStop(0, ch.state === 'busy' ? 'rgba(255,225,170,0.18)' : 'rgba(255,225,170,0.09)');
      pool.addColorStop(1, 'rgba(255,225,170,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(ch.x - 48, ch.y - 56, 112, 104);
      ctx.fillStyle = '#3a2a34';
      ctx.fillRect(ch.x - 18, ch.y - 24, 66, 52);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(ch.x - 18, ch.y - 24, 66, 2);
      ctx.fillStyle = '#888';
      ctx.fillRect(ch.x + 40, ch.y - 24, 2, 10);
      ctx.fillRect(ch.x + 30, ch.y - 26, 12, 2);
      ctx.fillStyle = '#ffe1aa';
      ctx.fillRect(ch.x + 27, ch.y - 25, 5, 4);
      for (var ic = 0; ic < 3; ic++) {
        ctx.fillStyle = ['#FF1493', '#14121a', '#2d6cdf'][ic];
        ctx.fillRect(ch.x - 16 + ic * 5, ch.y - 20, 3, 3);
      }
      // the machine on its hook
      ctx.fillStyle = '#9b59b6';
      ctx.fillRect(ch.x - 4, ch.y - 21, 7, 3);
      ctx.fillStyle = '#ccc';
      ctx.fillRect(ch.x + 3, ch.y - 20, 4, 1);
      // cushioned chair
      ctx.fillStyle = '#111';
      ctx.fillRect(ch.x - 10, ch.y - 8, 26, 20);
      ctx.fillStyle = '#2a2030';
      ctx.fillRect(ch.x - 8, ch.y - 6, 22, 8);
      ctx.fillStyle = '#666';
      ctx.fillRect(ch.x - 10, ch.y + 12, 26, 3);
      var bob = ch.state === 'busy' ? Math.sin(frame * 0.3 + i) * 2 : 0;
      drawPerson(ch.x + 30, ch.y + bob, SKINS[i % SKINS.length], '#1c1418', i === 0 ? PINK : HAIRS[i % HAIRS.length], false, false, { face: -1 });
      if (ch.state === 'busy') {
        ctx.fillStyle = '#9b59b6';
        ctx.fillRect(ch.x + 18, ch.y - 4 + bob, 8, 5);
        if (frame % 5 === 0) {
          ctx.fillStyle = '#1c1418';
          ctx.fillRect(ch.x + 14 + Math.random() * 6, ch.y + Math.random() * 4, 2, 2);
        }
        if (frame % 3 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(ch.x + 16 + Math.random() * 4, ch.y - 2 + Math.random() * 3, 1, 1);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(ch.x - 18, ch.y - 32, 66, 4);
        ctx.fillStyle = CYAN;
        ctx.fillRect(ch.x - 18, ch.y - 32, 66 * (1 - ch.t / ch.tmax), 4);
        if (ch.client) {
          drawPerson(ch.x, ch.y - 2, ch.client.skin, ch.client.shirt, ch.client.hair, true, false, { type: ch.client.type, mood: 0, ink: ch.client.ink });
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(TYPES[ch.client.type].label, ch.x + 14, ch.y - 36);
        }
      }
      if (ch.state === 'dirty') {
        // ink and wrap on the chair: wipe it before the next client
        ctx.fillStyle = 'rgba(20,18,26,0.7)';
        ctx.fillRect(ch.x - 6, ch.y - 4, 5, 3); ctx.fillRect(ch.x + 3, ch.y, 4, 2); ctx.fillRect(ch.x - 2, ch.y + 4, 6, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(ch.x + 6, ch.y - 6, 5, 2);
        if (Math.floor(frame / 14) % 2 === 0) {
          ctx.fillStyle = CYAN;
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('WIPE IT', ch.x + 2, ch.y - 34);
        }
      }
      if (powerOut > 0 && ch.state === 'busy') {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO POWER', ch.x + 14, ch.y - 44);
      }
    }

    // Upsells on the floor
    for (var i = 0; i < pickups.length; i++) drawPickup(pickups[i]);

    // Clients
    for (var i = 0; i < clients.length; i++) {
      var c = clients[i];
      if (c.state === 'inchair') continue;
      var mv = c.state !== 'waiting' && c.state !== 'inspecting';
      var mood = (c.state === 'waiting') ? moodOf(c) : c.state === 'storming' ? 3 : 0;
      var fc = (c.state === 'storming' || c.state === 'leaving') ? -1 : 1;
      drawPerson(c.x, c.y, c.skin, c.shirt, c.hair, c.state === 'waiting' || c.state === 'inspecting', mv, { type: c.type, mood: mood, face: fc, ink: c.ink });
      if (c.state === 'waiting') {
        if ((frame + c.seat * 17) % 90 < 6) {
          ctx.fillStyle = '#223';
          ctx.fillRect(c.x - 5, c.y + 11, 4, 2);
        }
        var pr = c.patience / c.pmax;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c.x - 10, c.y - 24, 20, 3);
        ctx.fillStyle = pr > 0.4 ? LIME : pr > 0.18 ? YELLOW : RED;
        ctx.fillRect(c.x - 10, c.y - 24, 20 * pr, 3);
        if (c.type !== 'walk') {
          ctx.fillStyle = c.type === 'celeb' ? PINK : c.type === 'inspector' ? CYAN : c.type === 'sleeve' ? YELLOW : '#fff';
          ctx.font = '7px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(TYPES[c.type].label + (TYPES[c.type].base ? ' $' + TYPES[c.type].base : ''), c.x + 14, c.y - 6);
        }
        if (pr < 0.18 && Math.floor(frame / 8) % 2 === 0) {
          ctx.fillStyle = RED;
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('!', c.x + 10, c.y - 20);
        }
      }
      if (c.state === 'inspecting') {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(c.x - 10, c.y - 24, 20, 3);
        ctx.fillStyle = CYAN;
        ctx.fillRect(c.x - 10, c.y - 24, 20 * (1 - c.t / 170), 3);
      }
      if (c.state === 'storming' && Math.floor(frame / 8) % 2 === 0) {
        ctx.fillStyle = RED;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('!!', c.x + 10, c.y - 18);
      }
    }

    // Paparazzi: a knot of cameras by the door
    for (var pi = 0; pi < paparazzi.length; pi++) {
      var pz = paparazzi[pi];
      drawPerson(pz.x, pz.y, SKINS[(pi + 2) % SKINS.length], '#333', '#222', false, true, { face: 1 });
      ctx.fillStyle = '#111'; ctx.fillRect(pz.x + 6, pz.y - 8, 6, 4);
      if ((frame + pi * 7) % 24 < 3) { ctx.fillStyle = '#fff'; ctx.fillRect(pz.x + 4, pz.y - 12, 10, 8); }
    }
    // The second artist, when hired
    if (helper) {
      drawPerson(helper.x, helper.y, SKINS[3], '#1c1418', CYAN, false, helper.state !== 'idle', { face: helper.face });
      ctx.fillStyle = 'rgba(0,255,255,0.5)';
      ctx.fillRect(helper.x - 7, helper.y + 13, 14, 2);
      if (helper.state === 'leading') { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText('CREW', helper.x, helper.y - 22); }
    }
    // Runner (you): pink-haired shop runner
    var runnerMoving = runner.kx !== 0 || runner.ky !== 0 || runner.tx !== null;
    drawPerson(runner.x, runner.y, '#f0c8a0', '#14101c', PINK, false, runnerMoving, { face: runner.face });
    if (runner.carrying) {
      ctx.fillStyle = '#b8863b'; ctx.fillRect(runner.x - 8, runner.y - 24, 16, 12);
      ctx.fillStyle = '#8a6228'; ctx.fillRect(runner.x - 8, runner.y - 19, 16, 2);
    }
    if (runner.slipT > 0 && frame % 4 < 2) { ctx.fillStyle = 'rgba(90,170,255,0.7)'; ctx.fillRect(runner.x - 10, runner.y + 12, 4, 2); ctx.fillRect(runner.x + 6, runner.y + 13, 4, 2); }
    // the register glows when someone is coming to pay: be there for the tip
    var paying = false;
    for (var ci = 0; ci < clients.length; ci++) if (clients[ci].state === 'paying') paying = true;
    if (paying) {
      ctx.fillStyle = 'rgba(255,215,0,' + (0.25 + 0.15 * Math.sin(frame * 0.2)) + ')';
      ctx.beginPath(); ctx.ellipse(REGISTER.x, REGISTER.y + 14, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = YELLOW; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
      ctx.fillText(near(runner.x, runner.y, REGISTER.x, REGISTER.y + 10, 30) ? 'TIP x2' : 'REGISTER', REGISTER.x, REGISTER.y + 30);
    }
    ctx.fillStyle = 'rgba(255,20,147,0.5)';
    ctx.fillRect(runner.x - 7, runner.y + 13, 14, 2);
    if (runner.lead) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TO A CHAIR', runner.x, runner.y - 22);
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 28);
      ctx.fillStyle = p.color;
      if (p.cash) { ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText('$', p.x, p.y); }
      else ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // speech bubbles
    for (var bi2 = 0; bi2 < bubbles.length; bi2++) {
      var bb = bubbles[bi2];
      ctx.globalAlpha = Math.min(1, bb.life / 20);
      ctx.font = '8px monospace';
      var mt = ctx.measureText ? ctx.measureText(bb.text) : null;
      var tw = ((mt && mt.width) ? mt.width : bb.text.length * 4.8) + 8;
      ctx.fillStyle = '#fff';
      ctx.fillRect(bb.x - 2, bb.y - 10, tw, 12);
      ctx.fillRect(bb.x + 2, bb.y + 2, 4, 3);
      ctx.fillStyle = bb.color === '#fff' ? '#14121a' : bb.color;
      ctx.textAlign = 'left';
      ctx.fillText(bb.text, bb.x + 2, bb.y - 1);
    }
    ctx.globalAlpha = 1;
    for (var i = 0; i < popups.length; i++) {
      var pu = popups[i];
      ctx.globalAlpha = Math.min(1, pu.life / 18);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = pu.big ? 'bold 13px monospace' : 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pu.text, pu.x + 1, pu.y + 1);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y);
    }
    ctx.globalAlpha = 1;
    // the power flicker: the shop goes dark except the neon and the windows
    if (powerOut > 0) {
      var flick = powerOut > 280 || powerOut < 20 ? (Math.random() < 0.5 ? 0.35 : 0.7) : 0.7;
      ctx.fillStyle = 'rgba(0,0,10,' + flick + ')';
      ctx.fillRect(-8, -8, W + 16, H + 16);
    }
    ctx.restore();

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('$' + score, 8, 14);
    ctx.fillStyle = '#9aa';
    ctx.fillText('BEST: $' + Math.max(best, score), 8, 26);
    ctx.fillStyle = LIME;
    ctx.font = 'bold 8px monospace';
    ctx.fillText('BANK $' + bank, 8, 37);
    if (starsHistory.length) for (var sh2 = 0; sh2 < 3; sh2++) drawStar(64 + sh2 * 10, 34, sh2 < lastStars);
    // the rep multiplier, pulsing when it just climbed
    var m = mult();
    var mx = 118, my = 20;
    ctx.fillStyle = m > 1 ? (multFlash > 0 && Math.floor(frame / 4) % 2 === 0 ? '#fff' : PINK) : 'rgba(255,255,255,0.35)';
    ctx.font = 'bold ' + (multFlash > 0 ? 13 : 11) + 'px monospace';
    ctx.fillText('x' + m, mx, my);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '7px monospace';
    ctx.fillText('REP', mx + (multFlash > 0 ? 24 : 18), my);
    // streak pips to the next multiplier
    for (var sp = 0; sp < 3; sp++) {
      ctx.fillStyle = (streak % 3) > sp && m < 5 ? PINK : 'rgba(255,255,255,0.18)';
      ctx.fillRect(mx + sp * 5, my + 4, 3, 2);
    }
    ctx.fillStyle = rush ? RED : LIME;
    ctx.textAlign = 'right';
    ctx.font = 'bold 10px monospace';
    ctx.fillText((rush ? 'CLOSING // ' : 'DAY ' + day + ' // ') + served + '/' + servedTarget, W - 8, 14);
    var waiting = 0, hot = false;
    for (var i = 0; i < clients.length; i++) if (clients[i].state === 'waiting') { waiting++; if (clients[i].patience / clients[i].pmax < 0.3) hot = true; }
    if (waiting) {
      ctx.fillStyle = hot ? RED : 'rgba(255,255,255,0.6)';
      ctx.font = '8px monospace';
      ctx.fillText(waiting + ' WAITING' + (hot ? ' // HURRY' : ''), W - 8, 36);
    }
    for (var i = 0; i < 3; i++) {
      ctx.fillStyle = i < hearts ? PINK : 'rgba(255,255,255,0.18)';
      var hx = W - 12 - i * 14;
      ctx.fillRect(hx, 20, 4, 4); ctx.fillRect(hx + 5, 20, 4, 4);
      ctx.fillRect(hx, 24, 9, 4); ctx.fillRect(hx + 2, 28, 5, 3);
    }
    if (bannerT > 0 && mode === 'play') {
      ctx.globalAlpha = Math.min(1, bannerT / 25);
      ctx.fillStyle = (bannerText === 'CLOSING RUSH' || bannerText === 'RUSH HOUR' || bannerText === 'POWER FLICKER') ? RED : LIME;
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bannerText, W / 2, H / 2 - 30);
      if (bannerText !== 'CLOSING RUSH' && bannerText !== 'RUSH HOUR' && bannerText !== 'POWER FLICKER') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(servedTarget + ' CLIENTS TO CLOSE', W / 2, H / 2 - 12);
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px monospace';
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
    if (!window.skateRunning) { rafId = null; setAmbience(0, 0); return; }
    if (!lastT) lastT = t;
    acc += Math.min(100, t - lastT);
    lastT = t;
    try {
    while (acc >= 16.67) {
      if (mode === 'play') update();
      else if (mode === 'shop') shopTick();
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
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { init(); say('title-shoprush', 700); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
