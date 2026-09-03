// The shop wall: one leaderboard shared by every cabinet, every room, the
// kiosk and the /arcade hall of fame. Each game hands its game-over moment to
// this module instead of keeping its own localStorage board (the nine copies
// this replaces were identical). Two boards per game: the all-time wall (top
// 10, forever) and today's board (top 5, resets at midnight in Denver), so a
// walk-in with a decent run still gets to sign. Runs post to
// /api/arcade/scores; the last wall seen is cached locally so the screen
// never sits blank, and a run that can't reach the server still lands on the
// cached wall for this machine.
(function () {
  var ENDPOINT = '/api/arcade/scores';
  var WALL_SIZE = 10, TODAY_SIZE = 5;
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var BLOCKED = {};
  'ASS FUK FUC FCK FUQ CUM CUN DIK DIC COK COC TIT SEX FAG KKK NIG NGR NAZ JIZ WTF STD HIV PIS POO PEE XXX HOR SLT RAP KYS DIE'
    .split(' ').forEach(function (w) { BLOCKED[w] = 1; });

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function artistParam() {
    try {
      var m = /[?&]artist=([^&]+)/.exec(location.search);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    return window.__ARCADE_ARTIST__ || '';
  }
  function deviceName() {
    try {
      var m = /[?&]device=([a-z]+)/.exec(location.search);
      if (m) return m[1];
    } catch (e) {}
    return window.__ARCADE_DEVICE__ || 'web';
  }
  function withNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function request(method, body, cb) {
    var f = window.fetch;
    if (typeof f !== 'function') { cb(null); return; }
    var url = ENDPOINT;
    if (method === 'GET') url += '?' + body;
    try {
      f(url, method === 'GET'
        ? { method: 'GET', credentials: 'same-origin' }
        : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); })
        .then(function (j) { cb(j); })
        .catch(function () { cb(null); });
    } catch (e) { cb(null); }
  }

  function attach(o) {
    var game = o.game, ctx = o.ctx, canvas = o.canvas, W = o.W || 400, H = o.H || 320;
    var fmt = o.fmt || function (v) { return withNum(v); };
    var PINK = (o.colors && o.colors.pink) || '#FF1493';
    var YELLOW = (o.colors && o.colors.yellow) || '#FFD700';
    var CYAN = (o.colors && o.colors.cyan) || '#00FFFF';
    var LIME = (o.colors && o.colors.lime) || '#7FFF00';
    var say = o.say || function () {};
    var CACHE_KEY = 'lumenati-arcade-' + game + '-board';
    var TODAY_KEY = 'lumenati-arcade-' + game + '-today';

    var alltime = [], today = [], plays = 0, playsToday = 0;
    try { alltime = JSON.parse(lsGet(CACHE_KEY) || '[]') || []; } catch (e) { alltime = []; }
    try {
      var t = JSON.parse(lsGet(TODAY_KEY) || 'null');
      if (t && t.day === dayKey()) today = t.rows || [];
    } catch (e) { today = []; }

    var initials = ['A', 'A', 'A'];
    var lastN = lsGet('lumenati-arcade-initials');
    if (lastN && lastN.length === 3) initials = lastN.split('');
    var initSlot = 0, finalScore = 0, finalLevel = 1, finalMeta = null;
    var myRank = 0, myTodayRank = 0, madeWall = false, madeToday = false;
    var status = ''; // '' | 'posting' | 'posted' | 'offline' | 'blocked'
    var shakeT = 0, revealT = 0;
    var runStart = now();
    var synced = false;

    function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
    function dayKey() {
      try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver' }).format(new Date()); } catch (e) { return new Date().toDateString(); }
    }
    function frame() { return o.getFrame ? o.getFrame() : 0; }
    function mode() { return o.getMode ? o.getMode() : ''; }
    function setMode(m) { if (o.setMode) o.setMode(m); }
    function active() { return o.isActive ? !!o.isActive() : true; }

    function adopt(j) {
      if (!j || !j.alltime) return;
      alltime = j.alltime.slice(0, WALL_SIZE);
      today = (j.today || []).slice(0, TODAY_SIZE);
      plays = j.plays || 0; playsToday = j.playsToday || 0;
      lsSet(CACHE_KEY, JSON.stringify(alltime));
      lsSet(TODAY_KEY, JSON.stringify({ day: dayKey(), rows: today }));
      synced = true;
    }
    function refresh() {
      var q = 'game=' + encodeURIComponent(game);
      var a = artistParam();
      if (a) q += '&artist=' + encodeURIComponent(a);
      request('GET', q, adopt);
    }
    refresh();

    function slotOn(list, score, size) {
      var i = 0;
      while (i < list.length && list[i].s >= score) i++;
      return i < size ? i + 1 : 0;
    }

    // The game calls this the moment a run ends. score = the final number the
    // wall should hold; extra = { level, meta } rides along for the record.
    function enter(score, extra) {
      finalScore = Math.max(0, Math.floor(score || 0));
      finalLevel = (extra && extra.level) || 1;
      finalMeta = (extra && extra.meta) || null;
      myRank = 0; myTodayRank = 0; initSlot = 0; status = ''; shakeT = 0; revealT = 0;
      madeWall = finalScore > 0 && slotOn(alltime, finalScore, WALL_SIZE) > 0;
      madeToday = finalScore > 0 && slotOn(today, finalScore, TODAY_SIZE) > 0;
      var duration = Math.round((now() - runStart) / 1000);
      if (madeWall || madeToday) {
        setMode('enter');
        say('high-score');
      } else {
        setMode('over');
        say('game-over');
        // Unsigned runs still count as plays on the wall.
        if (finalScore > 0) post(null, duration, function () {});
        playsToday++; plays++;
      }
      runStart = now();
      lastDuration = duration;
    }
    var lastDuration = 0;

    function post(name, duration, cb) {
      var body = { game: game, name: name, score: finalScore, level: finalLevel, duration: duration, device: deviceName() };
      var a = artistParam();
      if (a) body.artist = a;
      if (finalMeta) body.meta = finalMeta;
      request('POST', body, cb);
    }

    function commitInitials() {
      var name = initials.join('');
      if (BLOCKED[name]) { status = 'blocked'; shakeT = 24; return; }
      lsSet('lumenati-arcade-initials', name);
      // Land it on the local boards right away; the server's answer replaces
      // them (and confirms the rank) when it comes back.
      var row = { n: name, s: finalScore, l: finalLevel, at: new Date().toISOString() };
      var a = alltime.slice(); a.push(row); a.sort(byScore); alltime = a.slice(0, WALL_SIZE);
      var t = today.slice(); t.push(row); t.sort(byScore); today = t.slice(0, TODAY_SIZE);
      myRank = indexOfRow(alltime, row); myTodayRank = indexOfRow(today, row);
      plays++; playsToday++;
      lsSet(CACHE_KEY, JSON.stringify(alltime));
      lsSet(TODAY_KEY, JSON.stringify({ day: dayKey(), rows: today }));
      status = 'posting'; revealT = 0;
      setMode('over');
      post(name, lastDuration, function (j) {
        if (!j || !j.alltime) { status = 'offline'; return; }
        adopt(j);
        myRank = j.rank || 0; myTodayRank = j.todayRank || 0;
        status = 'posted';
      });
    }
    function byScore(x, y) { return y.s - x.s || (x.at < y.at ? -1 : x.at > y.at ? 1 : 0); }
    function indexOfRow(list, row) { for (var i = 0; i < list.length; i++) if (list[i] === row) return i + 1; return 0; }

    function cycleInit(d) {
      initials[initSlot] = LETTERS[(LETTERS.indexOf(initials[initSlot]) + d + 26) % 26];
      if (status === 'blocked') status = '';
    }

    // Keyboard on the sign-in screen: type letters, arrows to dial, SPACE/ENTER to confirm.
    document.addEventListener('keydown', function (e) {
      if (!active() || mode() !== 'enter') return;
      e.preventDefault();
      if (/^Key[A-Z]$/.test(e.code)) {
        initials[initSlot] = e.code.charAt(3);
        if (status === 'blocked') status = '';
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
    canvas.addEventListener('click', function (e) { if (active() && mode() === 'enter') enterTap(e.clientX, e.clientY); });
    canvas.addEventListener('touchstart', function (e) {
      if (active() && mode() === 'enter') { e.preventDefault(); var t = (e.targetTouches && e.targetTouches[0]) || e.touches[0]; enterTap(t.clientX, t.clientY); }
    }, { passive: false });

    // ── The sign-in screen ──
    function drawInitials() {
      var f = frame();
      if (shakeT > 0) shakeT--;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.84)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = YELLOW;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(madeWall ? 'YOU MADE THE WALL' : 'TOP OF THE DAY', W / 2, 62);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(fmt(finalScore), W / 2, 88);
      // Where it lands, before the letters go on.
      var wallSlot = slotOn(alltime, finalScore, WALL_SIZE), todaySlot = slotOn(today, finalScore, TODAY_SIZE);
      var chip = [];
      if (wallSlot) chip.push('#' + wallSlot + ' ALL TIME');
      if (todaySlot) chip.push('#' + todaySlot + ' TODAY');
      ctx.fillStyle = CYAN;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(chip.join('   '), W / 2, 106);
      ctx.fillStyle = '#9aa';
      ctx.font = '10px monospace';
      ctx.fillText('SIGN THE WALL', W / 2, 122);
      var sx = shakeT > 0 ? Math.sin(shakeT * 1.4) * 4 : 0;
      for (var i = 0; i < 3; i++) {
        var x = W / 2 + (i - 1) * 40 + sx;
        var on = i === initSlot;
        if (on) {
          ctx.fillStyle = PINK;
          ctx.font = 'bold 12px monospace';
          ctx.fillText('▲', x, 146);
          ctx.fillText('▼', x, 208);
        }
        ctx.fillStyle = status === 'blocked' ? '#ff6347' : (on && Math.floor(f / 8) % 2 === 0 ? PINK : '#fff');
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
      ctx.fillStyle = status === 'blocked' ? '#ff6347' : '#9aa';
      ctx.font = '9px monospace';
      ctx.fillText(status === 'blocked' ? 'NOT THOSE LETTERS. TRY OTHERS' : ('ontouchstart' in window ? 'TAP the arrows // OK signs it' : 'TYPE or ARROWS // SPACE signs it'), W / 2, 274);
      ctx.restore();
    }

    // ── The game-over screen: the shop wall beside today's board ──
    function drawBoard() {
      var f = frame();
      revealT++;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.86)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = PINK;
      ctx.font = 'bold 22px monospace';
      ctx.fillText(typeof o.title === 'function' ? o.title() : (o.title || 'GAME OVER'), W / 2, 40);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText((o.scoreLabel || 'SCORE') + ' ' + fmt(finalScore), W / 2, 62);
      if (myRank || myTodayRank) {
        var chips = [];
        if (myRank) chips.push('#' + myRank + ' ALL TIME');
        if (myTodayRank) chips.push('#' + myTodayRank + ' TODAY');
        ctx.fillStyle = Math.floor(f / 12) % 2 === 0 ? YELLOW : '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(chips.join('   '), W / 2, 78);
      }

      // Left: the all-time wall.
      var LX = 18, LW = 190, ROW = 15, TOP = 104;
      ctx.textAlign = 'left';
      ctx.fillStyle = CYAN;
      ctx.font = 'bold 10px monospace';
      ctx.fillText('SHOP WALL', LX, 94);
      ctx.fillStyle = 'rgba(0,255,255,0.35)';
      ctx.fillRect(LX, 98, LW, 1);
      ctx.font = 'bold 11px monospace';
      for (var i = 0; i < WALL_SIZE; i++) {
        var y = TOP + i * ROW;
        var e = alltime[i];
        var mine = e && myRank === i + 1;
        if (e && revealT < i * 3) continue; // rows drop in one by one
        ctx.fillStyle = mine ? YELLOW : (e ? (i === 0 ? '#fff' : 'rgba(255,255,255,0.85)') : 'rgba(255,255,255,0.22)');
        ctx.textAlign = 'right';
        ctx.fillText(String(i + 1), LX + 20, y);
        ctx.textAlign = 'left';
        ctx.fillText(e ? e.n : '---', LX + 32, y);
        ctx.textAlign = 'right';
        ctx.fillText(e ? fmt(e.s) : '-', LX + LW, y);
        if (mine && Math.floor(f / 10) % 2 === 0) {
          ctx.textAlign = 'left';
          ctx.fillStyle = PINK;
          ctx.fillText('▸', LX - 12, y);
        }
      }

      // Right: today's board, then the play count.
      var RX = 232, RW = 152;
      ctx.textAlign = 'left';
      ctx.fillStyle = LIME;
      ctx.font = 'bold 10px monospace';
      ctx.fillText('TODAY', RX, 94);
      ctx.fillStyle = 'rgba(127,255,0,0.35)';
      ctx.fillRect(RX, 98, RW, 1);
      ctx.font = 'bold 11px monospace';
      for (var j = 0; j < TODAY_SIZE; j++) {
        var yy = TOP + j * ROW;
        var t = today[j];
        var mineT = t && myTodayRank === j + 1;
        ctx.fillStyle = mineT ? YELLOW : (t ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.22)');
        ctx.textAlign = 'right';
        ctx.fillText(String(j + 1), RX + 14, yy);
        ctx.textAlign = 'left';
        ctx.fillText(t ? t.n : '---', RX + 26, yy);
        ctx.textAlign = 'right';
        ctx.fillText(t ? fmt(t.s) : '-', RX + RW, yy);
        if (mineT && Math.floor(f / 10) % 2 === 0) {
          ctx.textAlign = 'left';
          ctx.fillStyle = PINK;
          ctx.fillText('▸', RX - 12, yy);
        }
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '9px monospace';
      ctx.fillText(withNum(playsToday) + ' PLAYS TODAY', RX, TOP + TODAY_SIZE * ROW + 10);
      ctx.fillText(withNum(plays) + ' ALL TIME', RX, TOP + TODAY_SIZE * ROW + 22);
      if (status) {
        var msg = status === 'posting' ? 'POSTING TO THE WALL...' : status === 'posted' ? 'ON THE WALL' : status === 'offline' ? 'SAVED ON THIS MACHINE' : '';
        if (msg) {
          ctx.fillStyle = status === 'posted' ? LIME : status === 'offline' ? '#ff6347' : 'rgba(255,255,255,0.55)';
          ctx.fillText(msg, RX, TOP + TODAY_SIZE * ROW + 40);
        }
      } else if (!synced) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('WALL FROM THIS MACHINE', RX, TOP + TODAY_SIZE * ROW + 40);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = YELLOW;
      ctx.font = '11px monospace';
      ctx.fillText(o.again || 'SPACE or TAP to play again', W / 2, 292);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '9px monospace';
      ctx.fillText('the whole wall: lumenatitattoo.com/arcade', W / 2, 308);
      ctx.restore();
    }

    return {
      enter: enter,
      drawInitials: drawInitials,
      drawBoard: drawBoard,
      refresh: refresh,
      markStart: function () { runStart = now(); },
      top: function () { return alltime[0] || null; },
      best: function () { return alltime[0] ? alltime[0].s : 0; },
      get alltime() { return alltime; },
      get today() { return today; },
    };
  }

  window.ArcadeBoard = { attach: attach, BLOCKED: BLOCKED };
})();
