// Ink or Die 3D: a Tony Hawk style third-person park, in the arcade's palette.
// three.js renders to an offscreen canvas that gets blitted onto the cabinet's
// 2D canvas every frame, so the HUD, the popups and the shared wall screens
// draw on top exactly like the other cartridges. Two-minute sessions, a line
// system with a multiplier, goals with S-K-A-T-E letters, and no lives:
// a bail costs the line, not the run.
(function() {
  var canvas = document.getElementById('jd-skate-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 400, H = 320;
  var hiRes = false;
  function hi() {
    if (hiRes) return;
    try { if (typeof ctx.setTransform === 'function') { canvas.width = 800; canvas.height = 640; hiRes = true; } } catch (e) {}
  }
  function tx() { try { if (hiRes) ctx.setTransform(2, 0, 0, 2, 0, 0); } catch (e) {} }

  // ── SFX (the arcade's tiny WebAudio pattern) ──
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
    } catch (e) {}
  }
  function sfxOllie() { playSfx(220, 0.06, 'square', 0.08); setTimeout(function() { playSfx(440, 0.05, 'square', 0.06); }, 40); }
  function sfxLand() { playSfx(90, 0.08, 'sawtooth', 0.1); }
  function sfxGrind() { playSfx(1800 + Math.random() * 400, 0.03, 'sawtooth', 0.03); }
  function sfxTrick() { playSfx(880, 0.05, 'square', 0.06); setTimeout(function() { playSfx(1320, 0.06, 'square', 0.05); }, 50); }
  function sfxBank(big) { playSfx(660, 0.08, 'square', 0.1); setTimeout(function() { playSfx(880, 0.08, 'square', 0.1); }, 80); setTimeout(function() { playSfx(big ? 1760 : 1320, 0.2, 'square', 0.12); }, 160); }
  function sfxBail() { playSfx(160, 0.25, 'sawtooth', 0.14); }
  function sfxLetter() { playSfx(988, 0.07, 'square', 0.1); setTimeout(function() { playSfx(1319, 0.1, 'square', 0.1); }, 70); setTimeout(function() { playSfx(1760, 0.16, 'square', 0.1); }, 140); }
  function sfxTick() { playSfx(1200, 0.03, 'square', 0.05); }
  function sfxOver() { playSfx(400, 0.15, 'square', 0.12); setTimeout(function() { playSfx(300, 0.15, 'square', 0.12); }, 150); setTimeout(function() { playSfx(200, 0.3, 'square', 0.12); }, 300); }

  // ── Announcer: the skate lines already in public/audio/arcade ──
  var VOICE_CACHE = {};
  function say(name, delay) {
    try {
      setTimeout(function() {
        try {
          if (!VOICE_CACHE[name]) { VOICE_CACHE[name] = new Audio('/audio/arcade/' + name + '.mp3?v=3'); VOICE_CACHE[name].volume = 0.5; }
          VOICE_CACHE[name].currentTime = 0;
          VOICE_CACHE[name].play().catch(function() {});
        } catch (e) {}
      }, delay || 0);
    } catch (e) {}
  }
  var lingoCd = 0, lastLingo = '';
  var YEAHS = ['gnarly', 'so-sick', 'radical', 'shred-it', 'skate-sick', 'skate-fire', 'skate-combo', 'skate-clean', 'skate-keepgoing'];
  function sayMoment(name, force) {
    if (lingoCd > 0 && !force) return;
    if (name === lastLingo && !force) return;
    lingoCd = 480; lastLingo = name;
    say(name, 80);
  }
  function sayLingo() {
    if (lingoCd > 0) return;
    var l = YEAHS[Math.floor(Math.random() * YEAHS.length)];
    if (l === lastLingo) l = YEAHS[(YEAHS.indexOf(l) + 1) % YEAHS.length];
    sayMoment(l);
  }

  // ── Music: a slow rolling groove, faster in play ──
  var SONG = { root: 110, bass: [0,-1,0,3, -1,3,5,-1, 0,-1,0,3, 7,-1,5,3], lead: [12,-1,15,-1, 17,15,-1,12, -1,15,17,19, -1,17,15,-1] };
  var musicStep = -1, musicFrame = 0;
  function musicTick() {
    var stepFrames = mode === 'play' ? 11 : 14;
    musicFrame++;
    if (musicFrame < stepFrames) return;
    musicFrame = 0;
    musicStep = (musicStep + 1) % 16;
    var b = SONG.bass[musicStep];
    if (b >= 0) playSfx(SONG.root * Math.pow(2, b / 12), 0.12, 'triangle', 0.04);
    var l = SONG.lead[musicStep];
    if (l >= 0) playSfx(SONG.root * 2 * Math.pow(2, l / 12), 0.08, 'square', 0.022);
    if (musicStep % 4 === 0) playSfx(65, 0.08, 'sawtooth', 0.035);
  }

  var PINK = '#FF1493', CYAN = '#00FFFF', LIME = '#7FFF00', YELLOW = '#FFD700', PURPLE = '#B026FF', ORANGE = '#FF6347';
  var mode = 'intro'; // intro | play | enter | over
  var frame = 0, introT = 0;
  var score, clock, bestLine, trickCount, bailCount, longestGrind, maxAir, specialUsed, lettersGot;
  var popups = [], banners = [], trickStack = [];
  var hintEl = document.getElementById('jd-game-hint');

  // ══════════════════════════════════════════════════════════════════
  //  THE PARK (analytic collision; meshes are built from the same numbers)
  // ══════════════════════════════════════════════════════════════════
  var R = 3.2;               // transition radius
  var QP = { z: -28, x0: -20, x1: 20 };                 // quarter pipe on the north wall
  var HP = { x0: 12, x1: 28, z0: 6, z1: 24 };           // halfpipe on the east side
  var FUN = { cx: -12, cz: 8, half: 4, top: 2, h: 0.9 }; // funbox
  var KICK = { x0: 8, x1: 11, z0: -4, z1: 0, h: 1.2 };   // kicker
  var LAND = { x0: 15, x1: 18, z0: -4, z1: 0, h: 1.2 };  // landing ramp across the gap
  var STAIR = { x0: -14, x1: -8, zTop: 22, zBot: 19, h: 1.2 }; // stairs down toward -z
  var PLAT = { x0: -20, x1: -8, z0: 22, z1: 28, h: 1.2 };
  var LEDGE = { x0: -18, x1: 0, z: -16, w: 0.8, h: 0.6 };
  var PLANTER = { x0: 16, x1: 20, z0: -15, z1: -13, h: 0.7 };
  var BOUND = 29.5;
  var RAILS = [
    { name: 'funbox rail', a: [-16, FUN.h + 0.5, 8], b: [-8, FUN.h + 0.5, 8], kind: 'rail' },
    { name: 'flat rail', a: [-6, 0.55, -8], b: [6, 0.55, -8], kind: 'rail' },
    { name: 'flat rail', a: [-2, 0.55, 14], b: [10, 0.55, 14], kind: 'rail' },
    { name: 'the ledge', a: [LEDGE.x0, LEDGE.h, LEDGE.z], b: [LEDGE.x1, LEDGE.h, LEDGE.z], kind: 'ledge', ledge: true },
    { name: 'handrail', a: [-11, STAIR.h + 0.5, STAIR.zTop], b: [-11, 0.5, STAIR.zBot], kind: 'rail' },
    { name: 'planter', a: [PLANTER.x0, PLANTER.h, PLANTER.z0], b: [PLANTER.x1, PLANTER.h, PLANTER.z0], kind: 'ledge' },
  ];
  var LETTERS = [
    { ch: 'S', x: -12, y: 3.2, z: 8 },
    { ch: 'K', x: 0, y: 4.6, z: -26 },
    { ch: 'A', x: -1, y: 2.4, z: -16 },
    { ch: 'T', x: 13, y: 3.4, z: -2 },
    { ch: 'E', x: -14, y: 3.4, z: 25 },
  ];

  // Ground height under (x, z) plus the slope along a heading, and what it is.
  function groundAt(x, z) {
    var h = 0, kind = 'flat';
    // quarter pipe (north wall)
    if (x > QP.x0 && x < QP.x1 && z <= QP.z + R && z >= QP.z) {
      var d = (QP.z + R) - z; if (d > R) d = R;
      h = R - Math.sqrt(Math.max(0, R * R - d * d)); kind = 'qp';
    }
    // halfpipe
    if (z > HP.z0 && z < HP.z1) {
      if (x >= HP.x0 && x <= HP.x0 + R) { var d1 = (HP.x0 + R) - x; h = R - Math.sqrt(Math.max(0, R * R - d1 * d1)); kind = 'hpw'; }
      else if (x >= HP.x1 - R && x <= HP.x1) { var d2 = x - (HP.x1 - R); h = R - Math.sqrt(Math.max(0, R * R - d2 * d2)); kind = 'hpe'; }
    }
    // funbox
    var fd = Math.max(Math.abs(x - FUN.cx), Math.abs(z - FUN.cz));
    if (fd <= FUN.top) { h = FUN.h; kind = 'box'; }
    else if (fd <= FUN.half) { h = FUN.h * (FUN.half - fd) / (FUN.half - FUN.top); kind = 'boxramp'; }
    // kicker and landing ramp
    if (x >= KICK.x0 && x <= KICK.x1 && z >= KICK.z0 && z <= KICK.z1) { h = KICK.h * (x - KICK.x0) / (KICK.x1 - KICK.x0); kind = 'kicker'; }
    if (x >= LAND.x0 && x <= LAND.x1 && z >= LAND.z0 && z <= LAND.z1) { h = LAND.h * (LAND.x1 - x) / (LAND.x1 - LAND.x0); kind = 'landing'; }
    // stairs and platform
    if (x >= PLAT.x0 && x <= PLAT.x1 && z >= PLAT.z0 && z <= PLAT.z1) { h = PLAT.h; kind = 'plat'; }
    if (x >= STAIR.x0 && x <= STAIR.x1 && z >= STAIR.zBot && z < STAIR.zTop) { h = STAIR.h * (z - STAIR.zBot) / (STAIR.zTop - STAIR.zBot); kind = 'stairs'; }
    // ledge and planter tops are walls to a roller, landings to a flyer
    if (z > LEDGE.z - LEDGE.w / 2 && z < LEDGE.z + LEDGE.w / 2 && x > LEDGE.x0 && x < LEDGE.x1) { h = LEDGE.h; kind = 'ledgetop'; }
    if (x > PLANTER.x0 && x < PLANTER.x1 && z > PLANTER.z0 && z < PLANTER.z1) { h = PLANTER.h; kind = 'ledgetop'; }
    return { h: h, kind: kind };
  }
  // Slope along a heading: rise per metre, sampled a little ahead.
  function slopeAlong(x, z, dx, dz) {
    var s = 0.35;
    var a = groundAt(x, z).h, b = groundAt(x + dx * s, z + dz * s).h;
    return (b - a) / s;
  }

  // ══════════════════════════════════════════════════════════════════
  //  THREE.JS SCENE
  // ══════════════════════════════════════════════════════════════════
  var T = null, renderer = null, scene = null, camera = null, glCanvas = null;
  var skaterG = null, deckG = null, bodyG = null, armL = null, armR = null, legL = null, legR = null, headG = null;
  var letterMeshes = [], moonMesh = null, neonMats = [];
  var threeReady = false, threeFailed = false;

  function mat(hex, emissive, flat) {
    var m = new T.MeshLambertMaterial({ color: hex });
    if (emissive) { m.emissive = new T.Color(emissive); m.emissiveIntensity = 0.9; }
    return m;
  }
  function box(w, h, d, m, x, y, z) {
    var g = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  }
  function gridTexture() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#17171f'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2;
    for (var i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    g.fillStyle = 'rgba(255,20,147,0.25)'; g.fillRect(126, 0, 4, 256);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(15, 15);
    return t;
  }
  function eyeTexture() {
    var c = document.createElement('canvas'); c.width = 256; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#0d0a14'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = PINK; g.lineWidth = 8; g.beginPath(); g.moveTo(128, 30); g.lineTo(230, 210); g.lineTo(26, 210); g.closePath(); g.stroke();
    g.strokeStyle = CYAN; g.lineWidth = 6; g.beginPath(); g.ellipse(128, 140, 52, 26, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = CYAN; g.beginPath(); g.arc(128, 140, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.fillText('LUMENATI', 128, 244);
    return new T.CanvasTexture(c);
  }
  function neonSign(text, color, x, y, z, ry) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 512, 128);
    g.font = 'bold 72px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 24; g.fillStyle = color; g.fillText(text, 256, 64);
    var t = new T.CanvasTexture(c);
    var m = new T.MeshBasicMaterial({ map: t, transparent: true });
    var p = new T.Mesh(new T.PlaneGeometry(8, 2), m);
    p.position.set(x, y, z); p.rotation.y = ry;
    scene.add(p);
    neonMats.push(m);
  }
  // A transition: quarter-circle profile extruded along its length.
  function transitionMesh(length, m) {
    // profile in (d, h): flat edge at d = 0, the wall at d = R, quarter circle between
    var s = new T.Shape();
    s.moveTo(0, 0);
    for (var i = 1; i <= 14; i++) { var a = (i / 14) * Math.PI / 2; s.lineTo(Math.sin(a) * R, R - Math.cos(a) * R); }
    s.lineTo(R, 0); s.lineTo(0, 0);
    var g = new T.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
    return new T.Mesh(g, m);
  }
  function buildPark() {
    scene = new T.Scene();
    scene.background = new T.Color('#07061a');
    scene.fog = new T.Fog('#07061a', 40, 90);
    camera = new T.PerspectiveCamera(70, 800 / 640, 0.1, 300);
    scene.add(new T.AmbientLight(0x8888aa, 0.9));
    var sun = new T.DirectionalLight(0xffe0f0, 0.7); sun.position.set(-20, 40, 10); scene.add(sun);
    var fill = new T.DirectionalLight(0x00ffff, 0.25); fill.position.set(30, 10, -30); scene.add(fill);

    var asphalt = new T.MeshLambertMaterial({ map: gridTexture() });
    var ground = new T.Mesh(new T.PlaneGeometry(60, 60), asphalt); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    var concrete = mat('#3a3a48'), coping = mat('#c8c8d8'), rail = mat('#d0d0e0'), pink = mat(PINK), cyan = mat(CYAN), lime = mat(LIME), gold = mat(YELLOW), purple = mat(PURPLE);

    // walls around the plaza, the north one wears the eye
    var wallM = mat('#1a1826');
    box(60, 8, 1, wallM, 0, 4, -30); box(60, 8, 1, wallM, 0, 4, 30); box(1, 8, 60, wallM, -30, 4, 0); box(1, 8, 60, wallM, 30, 4, 0);
    var eye = new T.Mesh(new T.PlaneGeometry(10, 10), new T.MeshBasicMaterial({ map: eyeTexture() })); eye.position.set(0, 5.5, -29.4); scene.add(eye);
    neonSign('INK OR DIE', PINK, -18, 6.5, -29.3, 0);
    neonSign('NO PARENTS', CYAN, 18, 6.5, -29.3, 0);
    neonSign('LUMENATI', LIME, 29.3, 6.5, 0, -Math.PI / 2);
    neonSign('DENVER', YELLOW, -29.3, 6.5, 10, Math.PI / 2);
    neonSign('FLASH', PURPLE, 0, 6.5, 29.3, Math.PI);

    // quarter pipe: profile rises toward the wall at z = QP.z
    // local +d must point at the wall (-z) and the extrude must run along +x
    var qp = transitionMesh(QP.x1 - QP.x0, concrete);
    qp.rotation.y = Math.PI / 2; qp.position.set(QP.x0, 0, QP.z + R);
    scene.add(qp);
    box(QP.x1 - QP.x0, 0.12, 0.12, coping, 0, R + 0.02, QP.z + 0.06);

    // halfpipe: west transition faces east, east transition faces west
    var hpw = transitionMesh(HP.z1 - HP.z0, concrete);
    hpw.rotation.y = Math.PI; hpw.position.set(HP.x0 + R, 0, HP.z1); scene.add(hpw);
    var hpe = transitionMesh(HP.z1 - HP.z0, concrete);
    hpe.position.set(HP.x1 - R, 0, HP.z0); scene.add(hpe);
    box(0.12, 0.12, HP.z1 - HP.z0, coping, HP.x0 + 0.06, R + 0.02, (HP.z0 + HP.z1) / 2);
    box(0.12, 0.12, HP.z1 - HP.z0, coping, HP.x1 - 0.06, R + 0.02, (HP.z0 + HP.z1) / 2);
    box(HP.x1 - HP.x0, 0.1, HP.z1 - HP.z0, mat('#2c2c3a'), (HP.x0 + HP.x1) / 2, 0.02, (HP.z0 + HP.z1) / 2);

    // funbox as a frustum
    (function() {
      var h = FUN.h, a = FUN.half, t = FUN.top, cx = FUN.cx, cz = FUN.cz;
      var v = [
        -a, 0, -a,  a, 0, -a,  a, 0, a,  -a, 0, a,
        -t, h, -t,  t, h, -t,  t, h, t,  -t, h, t,
      ];
      var idx = [4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
      g.setIndex(idx); g.computeVertexNormals();
      var m = new T.Mesh(g, mat('#2f2f40')); m.position.set(cx, 0, cz); scene.add(m);
      box(t * 2, 0.06, t * 2, pink, cx, h + 0.03, cz);
    })();

    // rails
    RAILS.forEach(function(r) {
      var ax = r.a[0], ay = r.a[1], az = r.a[2], bx = r.b[0], by = r.b[1], bz = r.b[2];
      var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az));
      if (r.kind === 'rail') {
        var cyl = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, len, 8), rail);
        cyl.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        cyl.lookAt(bx, by, bz); cyl.rotateX(Math.PI / 2);
        scene.add(cyl);
        // posts
        for (var k = 0; k <= 2; k++) { var f = k / 2; box(0.08, ay + (by - ay) * f - groundAt(ax + (bx - ax) * f, az + (bz - az) * f).h, 0.08, rail, ax + (bx - ax) * f, (ay + (by - ay) * f + groundAt(ax + (bx - ax) * f, az + (bz - az) * f).h) / 2, az + (bz - az) * f); }
      }
    });
    box(LEDGE.x1 - LEDGE.x0, LEDGE.h, LEDGE.w, mat('#4a4a5c'), (LEDGE.x0 + LEDGE.x1) / 2, LEDGE.h / 2, LEDGE.z);
    box(LEDGE.x1 - LEDGE.x0, 0.04, 0.1, coping, (LEDGE.x0 + LEDGE.x1) / 2, LEDGE.h + 0.02, LEDGE.z - LEDGE.w / 2 + 0.05);
    box(PLANTER.x1 - PLANTER.x0, PLANTER.h, PLANTER.z1 - PLANTER.z0, mat('#3d3d50'), (PLANTER.x0 + PLANTER.x1) / 2, PLANTER.h / 2, (PLANTER.z0 + PLANTER.z1) / 2);
    box(PLANTER.x1 - PLANTER.x0 - 0.4, 0.5, PLANTER.z1 - PLANTER.z0 - 0.4, lime, (PLANTER.x0 + PLANTER.x1) / 2, PLANTER.h + 0.2, (PLANTER.z0 + PLANTER.z1) / 2);

    // kicker, gap paint, landing
    (function() {
      var g = new T.BufferGeometry();
      var v = [KICK.x0, 0, KICK.z0, KICK.x1, 0, KICK.z0, KICK.x1, KICK.h, KICK.z0, KICK.x0, 0, KICK.z1, KICK.x1, 0, KICK.z1, KICK.x1, KICK.h, KICK.z1];
      g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
      g.setIndex([0,1,2, 3,5,4, 0,2,5, 0,5,3, 1,4,5, 1,5,2]); g.computeVertexNormals();
      scene.add(new T.Mesh(g, mat('#5a3a22')));
      var g2 = new T.BufferGeometry();
      var v2 = [LAND.x1, 0, LAND.z0, LAND.x0, 0, LAND.z0, LAND.x0, LAND.h, LAND.z0, LAND.x1, 0, LAND.z1, LAND.x0, 0, LAND.z1, LAND.x0, LAND.h, LAND.z1];
      g2.setAttribute('position', new T.Float32BufferAttribute(v2, 3));
      g2.setIndex([0,2,1, 3,4,5, 0,5,2, 0,3,5, 1,2,5, 1,5,4]); g2.computeVertexNormals();
      scene.add(new T.Mesh(g2, mat('#5a3a22')));
      var paint = new T.Mesh(new T.PlaneGeometry(LAND.x0 - KICK.x1, KICK.z1 - KICK.z0), new T.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.35 }));
      paint.rotation.x = -Math.PI / 2; paint.position.set((KICK.x1 + LAND.x0) / 2, 0.02, (KICK.z0 + KICK.z1) / 2); scene.add(paint);
    })();

    // stairs and platform
    box(PLAT.x1 - PLAT.x0, PLAT.h, PLAT.z1 - PLAT.z0, concrete, (PLAT.x0 + PLAT.x1) / 2, PLAT.h / 2, (PLAT.z0 + PLAT.z1) / 2);
    for (var st = 0; st < 4; st++) {
      var sh = STAIR.h * (st + 1) / 4, sz = STAIR.zBot + (STAIR.zTop - STAIR.zBot) * st / 4;
      box(STAIR.x1 - STAIR.x0, sh, (STAIR.zTop - STAIR.zBot) / 4, concrete, (STAIR.x0 + STAIR.x1) / 2, sh / 2, sz + (STAIR.zTop - STAIR.zBot) / 8);
    }

    // moon and stars
    moonMesh = new T.Mesh(new T.SphereGeometry(3, 16, 16), new T.MeshBasicMaterial({ color: '#fff4c8' }));
    moonMesh.position.set(-40, 45, -70); scene.add(moonMesh);
    var starG = new T.BufferGeometry(), sv = [];
    for (var si = 0; si < 300; si++) { var th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45; sv.push(Math.cos(th) * Math.cos(ph) * 120, Math.sin(ph) * 120 + 5, Math.sin(th) * Math.cos(ph) * 120); }
    starG.setAttribute('position', new T.Float32BufferAttribute(sv, 3));
    scene.add(new T.Points(starG, new T.PointsMaterial({ color: '#ffffff', size: 0.7 })));

    // letters
    letterMeshes = LETTERS.map(function(L) {
      var c = document.createElement('canvas'); c.width = 128; c.height = 128;
      var g = c.getContext('2d'); g.font = 'bold 96px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = YELLOW; g.shadowBlur = 20; g.fillStyle = YELLOW; g.fillText(L.ch, 64, 64);
      var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true }));
      sp.scale.set(1.6, 1.6, 1); sp.position.set(L.x, L.y, L.z); scene.add(sp);
      return sp;
    });

    buildSkater();
  }

  function buildSkater() {
    skaterG = new T.Group();
    bodyG = new T.Group();
    var skin = mat('#e8b89a'), shirt = mat('#1a1a1a'), pants = mat('#2a2a3a'), cap = mat(PINK), deckM = mat('#7a4a2a'), wheelM = mat('#f0f0f0');
    var torso = new T.Mesh(new T.BoxGeometry(0.5, 0.6, 0.28), shirt); torso.position.y = 1.05; bodyG.add(torso);
    headG = new T.Group();
    var head = new T.Mesh(new T.SphereGeometry(0.19, 10, 8), skin); headG.add(head);
    var capM = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.1, 10), cap); capM.position.y = 0.12; headG.add(capM);
    var brim = new T.Mesh(new T.BoxGeometry(0.22, 0.03, 0.2), cap); brim.position.set(0, 0.08, 0.2); headG.add(brim);
    headG.position.y = 1.55; bodyG.add(headG);
    armL = new T.Group(); armR = new T.Group();
    var aL = new T.Mesh(new T.BoxGeometry(0.12, 0.5, 0.12), skin); aL.position.y = -0.25; armL.add(aL);
    var aR = new T.Mesh(new T.BoxGeometry(0.12, 0.5, 0.12), skin); aR.position.y = -0.25; armR.add(aR);
    armL.position.set(-0.32, 1.32, 0); armR.position.set(0.32, 1.32, 0);
    bodyG.add(armL); bodyG.add(armR);
    legL = new T.Group(); legR = new T.Group();
    var lL = new T.Mesh(new T.BoxGeometry(0.16, 0.6, 0.16), pants); lL.position.y = -0.3; legL.add(lL);
    var lR = new T.Mesh(new T.BoxGeometry(0.16, 0.6, 0.16), pants); lR.position.y = -0.3; legR.add(lR);
    legL.position.set(-0.14, 0.75, -0.18); legR.position.set(0.14, 0.75, 0.18);
    bodyG.add(legL); bodyG.add(legR);
    skaterG.add(bodyG);
    deckG = new T.Group();
    var deck = new T.Mesh(new T.BoxGeometry(0.28, 0.04, 0.9), deckM); deckG.add(deck);
    var tape = new T.Mesh(new T.BoxGeometry(0.26, 0.01, 0.86), mat('#2a2a2a')); tape.position.y = 0.025; deckG.add(tape);
    var stripe = new T.Mesh(new T.BoxGeometry(0.06, 0.012, 0.86), mat(PINK)); stripe.position.y = 0.03; deckG.add(stripe);
    var under = new T.Mesh(new T.BoxGeometry(0.24, 0.01, 0.8), mat(PINK)); under.position.y = -0.025; deckG.add(under);
    for (var i = 0; i < 4; i++) {
      var w = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.05, 8), wheelM);
      w.rotation.z = Math.PI / 2; w.position.set(i % 2 ? 0.14 : -0.14, -0.08, i < 2 ? -0.3 : 0.3); deckG.add(w);
    }
    deckG.position.y = 0.12;
    skaterG.add(deckG);
    scene.add(skaterG);
  }

  function ensureThree() {
    if (threeReady) return true;
    if (!window.THREE) return false;
    try {
      T = window.THREE;
      glCanvas = document.createElement('canvas'); glCanvas.width = 800; glCanvas.height = 640;
      renderer = new T.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false });
      renderer.setSize(800, 640, false);
      renderer.setPixelRatio(1);
      buildPark();
      threeReady = true;
    } catch (e) { threeFailed = true; window.__arcadeError = 'three: ' + String(e && e.message || e); }
    return threeReady;
  }

  // ══════════════════════════════════════════════════════════════════
  //  THE SKATER
  // ══════════════════════════════════════════════════════════════════
  var P; // player state
  var keys = { up: false, down: false, left: false, right: false, space: false };
  var tapT = { left: 0, right: 0, up: 0, down: 0 }; // frames held, to tell taps from holds
  var pressedAt = { left: -99, right: -99, up: -99, down: -99 }; // so a held push key is not a grab
  var airStart = -99;
  var cam = { x: 0, y: 3, z: 8, lx: 0, ly: 1, lz: 0 };
  var G = 22, MAXSPD = 14, PUSH = 9, FRICTION = 0.6;
  var SESSION = 120 * 60;
  var goals, goalCardT, tallyT, tallyLines, shake, flashT, specialBar, specialFlash, lastBankT;

  function resetPlayer() {
    P = { x: 0, y: 0, z: 12, yaw: Math.PI, speed: 0, vy: 0, air: false, airT: 0, hold: 0, crouch: 0, gapStart: null,
      grind: null, grindT: 0, grindPos: 0, grindDir: 1, grindTrick: '50-50', balance: 0, bal: 0,
      manual: null, manualT: 0, mbal: 0,
      spin: 0, spinDir: 0, grab: null, grabT: 0, flip: null, flipT: 0, flipDone: false,
      bail: 0, bailRot: 0, wasQp: null, hpLaunch: false, invuln: 0, bodyYaw: Math.PI, airPeak: 0, lastLand: 0 };
  }
  var line;
  function resetLine() { line = { pts: 0, mult: 1, names: [], count: 0, open: false, keepT: 0 }; }

  function init() {
    if (window.skateInt) { clearInterval(window.skateInt); window.skateInt = null; }
    score = 0; clock = SESSION; bestLine = 0; trickCount = 0; bailCount = 0; longestGrind = 0; maxAir = 0; specialUsed = 0; lettersGot = 0;
    popups = []; banners = []; trickStack = []; frame = 0; introT = 0; mode = 'intro'; musicStep = -1; musicFrame = 0;
    shake = 0; flashT = 0; specialBar = 0; specialFlash = 0; lastBankT = 0; lingoCd = 0;
    goals = [
      { key: 'line', label: 'SICK LINE 3,000', done: false, bonus: 1000 },
      { key: 'ledge', label: 'GRIND THE LEDGE', done: false, bonus: 1000 },
      { key: 'spin', label: '540 OFF THE HALFPIPE', done: false, bonus: 1000 },
      { key: 'letters', label: 'COLLECT S-K-A-T-E', done: false, bonus: 1000, prog: 0, need: 5 },
    ];
    goalCardT = 0; tallyT = 0; tallyLines = [];
    LETTERS.forEach(function(L) { L.got = false; });
    if (letterMeshes.length) letterMeshes.forEach(function(m) { m.visible = true; });
    resetPlayer(); resetLine();
    document.getElementById('jd-br-score').textContent = '0';
    document.getElementById('jd-br-lives').textContent = '2:00';
    if (hintEl) hintEl.textContent = ('ontouchstart' in window) ? 'Left: drag to steer, up to push // Right: tap ollie, swipe for tricks' : 'Arrows steer, hold UP to push, SPACE ollie // in the air: tap arrows flip, hold L/R spin, hold U/D grab';
    window.skateRunning = true;
    startLoop();
  }

  // ── Scoring ──
  function addPopup(text, color, big) {
    var s = worldToScreen(P.x, P.y + 1.9, P.z);
    var recent = 0;
    for (var pi = 0; pi < popups.length; pi++) if (popups[pi].life > 55) recent++;
    popups.push({ x: Math.max(60, Math.min(W - 60, s.x)), y: Math.max(40, Math.min(H - 40, s.y)) - recent * 14, text: text, color: color || '#fff', life: 70, big: !!big, vy: -0.7 });
  }
  function trick(name, pts) {
    var stale = line.names.indexOf(name) >= 0;
    if (!stale) { line.names.push(name); line.mult = Math.min(12, line.mult + 1); }
    var p = stale ? Math.ceil(pts / 2) : pts;
    line.pts += p; line.count++; line.open = true; line.keepT = 0;
    trickCount++;
    specialBar = Math.min(100, specialBar + pts * 0.45);
    trickStack.unshift({ name: name + (stale ? ' (stale)' : ''), life: 90 });
    if (trickStack.length > 5) trickStack.pop();
    addPopup(name + ' +' + p, stale ? '#aaa' : YELLOW);
    sfxTrick();
    if (line.count === 4 || line.count === 8) sayLingo();
  }
  function bank(sketchy) {
    if (!line.open) { resetLine(); return; }
    var total = Math.round(line.pts * line.mult * (sketchy ? 0.5 : 1));
    if (total > 0) {
      score += total;
      document.getElementById('jd-br-score').textContent = score;
      if (total > bestLine) bestLine = total;
      if (total >= 3000) goalDone('line');
      if (total >= 5000) { banners.push({ text: 'LEGENDARY LINE +' + total, color: PINK, t: 120 }); shake = 16; flashT = 30; sayMoment('skate-legend', true); }
      else if (total >= 2000) { banners.push({ text: 'HUGE LINE +' + total, color: YELLOW, t: 90 }); shake = 10; sayMoment('skate-huge', true); }
      else if (total >= 500) { banners.push({ text: (sketchy ? 'SKETCHY ' : 'SICK ') + 'LINE +' + total, color: sketchy ? ORANGE : LIME, t: 60 }); if (!sketchy) sayMoment('skate-sick'); }
      else addPopup((sketchy ? 'SKETCHY ' : 'LANDED ') + '+' + total, sketchy ? ORANGE : LIME, true);
      sfxBank(total >= 2000);
      if (!sketchy && total >= 200) sayMoment('skate-clean');
    }
    lastBankT = frame;
    resetLine();
  }
  function loseLine(reason) {
    if (line.open && line.pts > 0) addPopup(reason + ' LOST ' + Math.round(line.pts * line.mult), '#ff5050', true);
    resetLine();
  }
  function goalDone(key) {
    for (var i = 0; i < goals.length; i++) if (goals[i].key === key && !goals[i].done) {
      goals[i].done = true;
      banners.push({ text: 'GOAL: ' + goals[i].label, color: CYAN, t: 80 });
      sayMoment('skate-goal', true);
      shake = Math.max(shake, 6);
    }
  }

  // ── Actions ──
  function ollie() {
    if (P.bail > 0 || mode !== 'play') return;
    if (P.grind) { // hop off the rail
      var ft = P.grindT / 60;
      endGrind(false);
      P.air = true; P.vy = 5.5; P.airT = 0; P.airPeak = P.y; airStart = frame;
      sfxOllie();
      return;
    }
    if (P.air) return;
    if (P.manual) { P.manual = null; }
    P.air = true; P.airT = 0; P.airPeak = P.y; airStart = frame;
    P.vy = 5.6 + Math.min(3.2, P.crouch * 0.35) + Math.min(2, P.speed * 0.12);
    P.crouch = 0;
    P.spin = 0; P.grab = null; P.grabT = 0; P.flip = null; P.flipT = 0;
    line.keepT = 0;
    sfxOllie();
  }
  function startFlip(name) {
    if (!P.air || P.flip || P.bail > 0) return;
    P.flip = name; P.flipT = 0;
  }
  var FLIP_PTS = { 'KICKFLIP': 40, 'HEELFLIP': 40, 'SHOVE-IT': 30, 'IMPOSSIBLE': 60 };
  var RAIL_TRICKS = { '50-50': 0, 'BOARDSLIDE': 25, 'NOSEGRIND': 30, '5-0': 30, 'TAILSLIDE': 35 };

  function startGrind(rail, dir) {
    P.grind = rail; P.grindT = 0; P.grindDir = dir; P.grindTrick = '50-50'; P.bal = 0; P.balance = 0;
    P.air = false; P.vy = 0; P.spin = 0; P.grab = null; P.flip = null;
    // snap onto the rail
    var t = projectOnRail(rail, P.x, P.z);
    P.grindPos = t;
    var pt = railPoint(rail, t); P.x = pt[0]; P.y = pt[1]; P.z = pt[2];
    trick('50-50 ' + rail.name.toUpperCase(), 20);
    if (Math.abs(P.speed) < 4) P.speed = 4;
    sayMoment('skate-grind');
  }
  function endGrind(drop) {
    if (!P.grind) return;
    var secs = P.grindT / 60;
    if (secs > longestGrind) longestGrind = secs;
    if (P.grind.ledge && secs >= 2) goalDone('ledge');
    var distPts = Math.round(secs * 12);
    if (distPts > 0) { line.pts += distPts; addPopup('GRIND +' + distPts, CYAN); }
    var r = P.grind;
    P.grind = null;
    // heading follows the rail direction
    var dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2];
    var len = Math.hypot(dx, dz) || 1;
    P.yaw = Math.atan2(dx * P.grindDir, dz * P.grindDir);
    P.bodyYaw = P.yaw;
    if (drop) { P.air = true; P.vy = 1.5; P.airT = 0; P.airPeak = P.y; }
  }
  function projectOnRail(r, x, z) {
    var dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2];
    var l2 = dx * dx + dz * dz || 1;
    var t = ((x - r.a[0]) * dx + (z - r.a[2]) * dz) / l2;
    return Math.max(0, Math.min(1, t));
  }
  function railPoint(r, t) { return [r.a[0] + (r.b[0] - r.a[0]) * t, r.a[1] + (r.b[1] - r.a[1]) * t, r.a[2] + (r.b[2] - r.a[2]) * t]; }
  function railLen(r) { return Math.hypot(r.b[0] - r.a[0], r.b[2] - r.a[2]); }

  function bail(reason) {
    if (P.bail > 0) return;
    P.bail = 70; P.bailRot = 0; bailCount++;
    P.air = false; P.grind = null; P.manual = null; P.spin = 0; P.grab = null; P.flip = null;
    P.speed = 0; P.vy = 0;
    loseLine(reason || 'BAILED');
    addPopup('BAIL', '#ff5050', true);
    shake = 12; sfxBail(); sayMoment('skate-bail');
  }

  function land() {
    var g = groundAt(P.x, P.z);
    P.y = g.h; P.air = false;
    var airFrames = P.airT;
    var height = P.airPeak - g.h;
    if (height > maxAir) maxAir = height;
    // spin remainder decides the landing
    var rem = ((P.spin % 180) + 180) % 180;
    var off = Math.min(rem, 180 - rem);
    var midFlip = P.flip && !P.flipDone;
    var spinDeg = Math.round(Math.abs(P.spin) / 180) * 180;
    if (spinDeg >= 180) {
      var pts = spinDeg === 180 ? 15 : spinDeg === 360 ? 40 : spinDeg === 540 ? 90 : spinDeg === 720 ? 160 : 260;
      trick(spinDeg + (P.grab ? ' ' + P.grab : ''), pts);
      if (spinDeg >= 540 && P.hpLaunch) goalDone('spin');
    } else if (P.grab && P.grabT > 12) {
      trick(P.grab, 25 + Math.min(40, Math.round(P.grabT / 3)));
    }
    P.bodyYaw = P.yaw + (Math.round(P.spin / 180) * Math.PI);
    if (height > 3.5 && !midFlip && off < 35) { trick('BIG AIR', 30); sayMoment('skate-bigair'); }
    // gap over the kicker paint
    if (P.gapStart !== null && g.kind === 'landing') { trick('THE GAP', 80); }
    P.gapStart = null;
    var wasHp = P.hpLaunch;
    P.hpLaunch = false;
    if (off >= 60 || (midFlip && P.flipT < 8)) { bail(off >= 60 ? 'SIDEWAYS' : 'FLIP NOT DONE'); return; }
    var sketchy = off >= 35 || midFlip;
    P.spin = 0; P.spinDir = 0; P.grab = null; P.grabT = 0; P.flip = null; P.flipT = 0;
    // quarter pipe or halfpipe transition: come back the way you came
    if (g.kind === 'qp' || g.kind === 'hpw' || g.kind === 'hpe') {
      var into = g.kind === 'qp' ? -Math.cos(P.yaw) : (g.kind === 'hpw' ? -Math.sin(P.yaw) : Math.sin(P.yaw));
      if (into > 0) { P.yaw += Math.PI; P.bodyYaw = P.yaw; }
      P.speed = Math.max(3, P.speed * 0.85 + Math.min(6, height * 1.2));
    }
    var freshLand = function(k) { return keys[k] && pressedAt[k] >= airStart; };
    if (freshLand('down') && !sketchy) { P.manual = 'MANUAL'; P.manualT = 0; P.mbal = 0; trick('MANUAL', 10); }
    else if (freshLand('up') && !sketchy && P.speed > 5) { P.manual = 'NOSE MANUAL'; P.manualT = 0; P.mbal = 0; trick('NOSE MANUAL', 12); }
    else if (g.kind === 'ledgetop') { P.manual = null; }
    P.lastLand = frame;
    if (sketchy) { addPopup('SKETCHY', ORANGE); line.keepT = 999; bank(true); }
    else { line.keepT = 0; }
    sfxLand();
  }

  // ── Update ──
  function update() {
    frame++;
    musicTick();
    if (lingoCd > 0) lingoCd--;
    if (shake > 0) shake *= 0.85;
    if (flashT > 0) flashT--;
    if (specialFlash > 0) specialFlash--;
    if (goalCardT > 0) { goalCardT--; return; }
    if (tallyT > 0) { tallyT--; if (tallyT === 0) finishSession(); return; }
    clock--;
    if (clock % 60 === 0) {
      var s = Math.ceil(clock / 60);
      document.getElementById('jd-br-lives').textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
      if (s <= 10 && s > 0) sfxTick();
    }
    if (clock <= 0) { endSession(); return; }
    for (var i = popups.length - 1; i >= 0; i--) { popups[i].y += popups[i].vy; popups[i].life--; if (popups[i].life <= 0) popups.splice(i, 1); }
    for (var b = banners.length - 1; b >= 0; b--) { banners[b].t--; if (banners[b].t <= 0) banners.splice(b, 1); }
    for (var t = 0; t < trickStack.length; t++) trickStack[t].life--;
    while (trickStack.length && trickStack[trickStack.length - 1].life <= 0) trickStack.pop();
    if (specialBar >= 100 && !specialFlash && !P.specialArmed) { P.specialArmed = true; specialFlash = 60; sayMoment('skate-special', true); }
    if (specialBar < 100) P.specialArmed = false;
    if (specialBar > 0 && !line.open) specialBar = Math.max(0, specialBar - 0.05);

    var dt = 1 / 60;
    // key hold timers (tap vs hold)
    ['left', 'right', 'up', 'down'].forEach(function(k) { tapT[k] = keys[k] ? tapT[k] + 1 : 0; });

    if (P.bail > 0) {
      P.bail--; P.bailRot += 0.25;
      if (P.bail === 0) { P.y = groundAt(P.x, P.z).h; P.bodyYaw = P.yaw; }
      updateCamera(); return;
    }

    if (P.grind) {
      // ride the rail: balance drifts, LEFT/RIGHT corrects, arrows switch tricks
      P.grindT++;
      var r = P.grind, len = railLen(r);
      var spd = Math.max(3.5, Math.abs(P.speed));
      P.grindPos += (spd * dt / len) * P.grindDir;
      P.bal += (Math.random() - 0.5) * 0.06 + P.balance * 0.02;
      if (keys.left) P.bal -= 0.045; if (keys.right) P.bal += 0.045;
      P.balance = P.bal;
      if (tapT.down === 1 && P.grindTrick !== 'BOARDSLIDE') { P.grindTrick = 'BOARDSLIDE'; trick('BOARDSLIDE', 25); }
      if (tapT.up === 1 && P.grindTrick !== 'NOSEGRIND') { P.grindTrick = 'NOSEGRIND'; trick('NOSEGRIND', 30); }
      if (tapT.left === 1 && P.grindTrick !== '5-0') { P.grindTrick = '5-0'; trick('5-0', 30); }
      if (tapT.right === 1 && P.grindTrick !== 'TAILSLIDE') { P.grindTrick = 'TAILSLIDE'; trick('TAILSLIDE', 35); }
      if (P.grindT % 6 === 0) sfxGrind();
      if (Math.abs(P.bal) > 1) { bail('SLIPPED'); return; }
      if (P.grindPos <= 0 || P.grindPos >= 1) { endGrind(true); updateCamera(); return; }
      var pt = railPoint(r, P.grindPos); P.x = pt[0]; P.y = pt[1]; P.z = pt[2];
      var dx = r.b[0] - r.a[0], dz = r.b[2] - r.a[2];
      P.yaw = Math.atan2(dx * P.grindDir, dz * P.grindDir); P.bodyYaw = P.yaw;
      if (P.grindT === 120) { line.pts += 20; line.mult = Math.min(12, line.mult + 1); addPopup('LONG GRIND +20 x' + line.mult, CYAN); }
      updateCamera(); return;
    }

    if (P.air) {
      P.airT++;
      var holding = keys.space && P.airT < 14;
      P.vy -= (holding ? G * 0.7 : G) * dt;
      P.y += P.vy * dt;
      if (P.y > P.airPeak) P.airPeak = P.y;
      // spins: hold left or right
      var fresh = function(k) { return keys[k] && pressedAt[k] >= airStart; };
      if (fresh('left') && tapT.left > 8) { P.spin -= 9; P.spinDir = -1; }
      if (fresh('right') && tapT.right > 8) { P.spin += 9; P.spinDir = 1; }
      // grabs: hold up or down (pressed in the air); both = method; special = christ air
      var wantGrab = null;
      if (fresh('up') && fresh('down')) wantGrab = (specialBar >= 100) ? 'CHRIST AIR' : 'METHOD';
      else if (fresh('up') && tapT.up > 8) wantGrab = Math.abs(P.spin) > 120 ? 'NOSEGRAB' : 'MELON';
      else if (fresh('down') && tapT.down > 8) wantGrab = Math.abs(P.spin) > 120 ? 'STALEFISH' : 'INDY';
      if (wantGrab) {
        if (P.grab !== wantGrab) {
          if (wantGrab === 'CHRIST AIR') { specialBar = 0; specialUsed++; trick('CHRIST AIR', 200); banners.push({ text: 'SPECIAL: CHRIST AIR', color: PINK, t: 70 }); }
          P.grab = wantGrab; P.grabT = 0;
        }
        P.grabT++;
      }
      // taps: flips
      if (!P.flip) {
        if (tapT.right === 6 && !keys.right) {} // (release handled below)
      }
      if (P.flip) { P.flipT++; if (P.flipT >= 22) P.flipDone = true; }
      // horizontal motion continues
      P.x += Math.sin(P.yaw) * P.speed * dt; P.z += Math.cos(P.yaw) * P.speed * dt;
      clampToPark();
      // gap tracking
      if (P.gapStart !== null && P.x > LAND.x0 && P.y < 0.5) P.gapStart = null;
      // rails: catch one on the way down
      if (P.vy < 0) {
        for (var ri = 0; ri < RAILS.length; ri++) {
          var rr = RAILS[ri];
          var tt = projectOnRail(rr, P.x, P.z), rp = railPoint(rr, tt);
          var hd = Math.hypot(P.x - rp[0], P.z - rp[2]);
          if (hd < 1.1 && P.y <= rp[1] + 0.9 && P.y >= rp[1] - 0.45 && tt > 0.02 && tt < 0.98) {
            var ddx = rr.b[0] - rr.a[0], ddz = rr.b[2] - rr.a[2];
            var dot = Math.sin(P.yaw) * ddx + Math.cos(P.yaw) * ddz;
            // spins must be settled to lock on
            var remg = ((P.spin % 180) + 180) % 180; var offg = Math.min(remg, 180 - remg);
            if (offg < 60) {
              if (Math.abs(P.spin) >= 150) { var sd = Math.round(Math.abs(P.spin) / 180) * 180; trick(sd + ' TO RAIL', sd === 180 ? 20 : 50); }
              startGrind(rr, dot >= 0 ? 1 : -1);
              return;
            }
          }
        }
      }
      var gg = groundAt(P.x, P.z);
      if (P.y <= gg.h && P.vy <= 0) { land(); }
      updateCamera(); return;
    }

    // rolling
    if (keys.space) { P.crouch = Math.min(12, P.crouch + 1); }
    var steer = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    var turn = (2.6 - Math.min(1.6, P.speed * 0.1)) * dt;
    if (P.manual) {
      P.manualT++;
      P.mbal += (P.manual === 'MANUAL' ? 0.012 : -0.012) + (Math.random() - 0.5) * 0.01;
      if (keys.up) P.mbal -= 0.03; if (keys.down) P.mbal += 0.03;
      if (Math.abs(P.mbal) > 1) { bail('TIPPED'); return; }
      if (P.manualT % 30 === 0) { line.pts += 8; addPopup(P.manual + ' +8', CYAN); }
      if (P.manualT > 20 && !keys.up && !keys.down) { P.manual = null; line.keepT = 0; }
    } else {
      if (keys.up) P.speed = Math.min(MAXSPD, P.speed + PUSH * dt);
      if (keys.down && P.speed > 0) P.speed = Math.max(0, P.speed - 12 * dt);
    }
    P.yaw += steer * turn * (P.speed > 0.5 ? 1 : 0);
    P.bodyYaw = P.yaw;
    // slope: downhill speeds, uphill slows
    var dx1 = Math.sin(P.yaw), dz1 = Math.cos(P.yaw);
    var sl = slopeAlong(P.x, P.z, dx1, dz1);
    var hereK = groundAt(P.x, P.z).kind;
    var onTranny = hereK === 'qp' || hereK === 'hpw' || hereK === 'hpe';
    // transitions pump you rather than stall you: light drag, and the launch below does the rest
    P.speed -= Math.min(sl, 1.2) * (onTranny ? 3 : 9) * dt;
    P.speed = Math.max(0, P.speed - FRICTION * dt);
    if (P.speed < 0.3 && sl > 0.3) { P.yaw += Math.PI; P.bodyYaw = P.yaw; P.speed = 1; } // roll back down
    var nx = P.x + dx1 * P.speed * dt, nz = P.z + dz1 * P.speed * dt;
    var here = groundAt(P.x, P.z), there = groundAt(nx, nz);
    // walls and ledge sides
    if (there.h > P.y + 0.35 && there.kind === 'ledgetop') { P.speed *= 0.2; P.yaw += Math.PI * 0.9; addPopup('BONK', '#ff5050'); loseLine('BONK'); updateCamera(); return; }
    P.x = nx; P.z = nz; clampToPark();
    // leaving the surface: kicker lip, funbox edge, quarter pipe top, platform edge
    var drop = here.h - there.h;
    var launched = false;
    if ((here.kind === 'qp' || here.kind === 'hpw' || here.kind === 'hpe')) {
      var dd = here.kind === 'qp' ? (QP.z + R) - P.z : here.kind === 'hpw' ? (HP.x0 + R) - P.x : P.x - (HP.x1 - R);
      var into2 = here.kind === 'qp' ? -dz1 : here.kind === 'hpw' ? -dx1 : dx1;
      if (dd > R * 0.55 && into2 > 0.3 && P.speed > 2.5) {
        // vert: up the wall you go (speed becomes height, a pump on SPACE adds more)
        P.air = true; P.airT = 0; P.airPeak = P.y; airStart = frame;
        P.vy = Math.min(14, 4 + P.speed * 0.85 + (keys.space ? 2.5 : 0));
        P.speed *= 0.15;
        P.hpLaunch = here.kind !== 'qp';
        P.wasQp = here.kind;
        P.spin = 0; P.grab = null; P.flip = null; P.flipT = 0;
        launched = true;
        sfxOllie();
      }
    }
    if (!launched && here.kind === 'kicker' && there.kind !== 'kicker' && P.speed > 4) {
      P.air = true; P.airT = 0; P.airPeak = P.y; airStart = frame; P.vy = Math.min(9, P.speed * 0.45 + (keys.space ? 2 : 0)); P.gapStart = P.x; launched = true;
      P.spin = 0; P.grab = null; P.flip = null;
    }
    if (!launched && drop > 0.35) { P.air = true; P.airT = 0; P.airPeak = P.y; airStart = frame; P.vy = 0.5; launched = true; }
    if (!launched) {
      P.y = there.h;
      // clean roll after a landing banks the line
      if (line.open) { line.keepT++; if (line.keepT === 45) bank(false); }
    }
    // letters
    for (var li = 0; li < LETTERS.length; li++) {
      var L = LETTERS[li];
      if (!L.got && Math.hypot(P.x - L.x, P.z - L.z) < 1.4 && Math.abs(P.y + 1 - L.y) < 1.6) {
        L.got = true; lettersGot++; if (letterMeshes[li]) letterMeshes[li].visible = false;
        addPopup('GOT ' + L.ch, YELLOW, true); sfxLetter();
        goals[3].prog = lettersGot;
        if (lettersGot === 5) { goalDone('letters'); sayMoment('skate-letters', true); }
      }
    }
    updateCamera();
  }
  // letters can be grabbed in the air too
  function airLetters() {
    for (var li = 0; li < LETTERS.length; li++) {
      var L = LETTERS[li];
      if (!L.got && Math.hypot(P.x - L.x, P.z - L.z) < 1.5 && Math.abs(P.y + 1 - L.y) < 1.8) {
        L.got = true; lettersGot++; if (letterMeshes[li]) letterMeshes[li].visible = false;
        addPopup('GOT ' + L.ch, YELLOW, true); sfxLetter();
        goals[3].prog = lettersGot;
        if (lettersGot === 5) { goalDone('letters'); sayMoment('skate-letters', true); }
      }
    }
  }
  function clampToPark() {
    if (P.x < -BOUND) { P.x = -BOUND; P.speed *= 0.4; }
    if (P.x > BOUND) { P.x = BOUND; P.speed *= 0.4; }
    if (P.z < -BOUND) { P.z = -BOUND; P.speed *= 0.4; }
    if (P.z > BOUND) { P.z = BOUND; P.speed *= 0.4; }
  }
  function updateCamera() {
    if (P.air) airLetters();
    var dx = Math.sin(P.yaw), dz = Math.cos(P.yaw);
    var dist = 5.5 + Math.min(3, P.speed * 0.18);
    var hgt = 2.4 + Math.max(0, P.y) * 0.35;
    var tx0 = P.x - dx * dist, tz0 = P.z - dz * dist, ty0 = P.y + hgt;
    var e = 0.1;
    var camFloor = groundAt(Math.max(-BOUND, Math.min(BOUND, tx0)), Math.max(-BOUND, Math.min(BOUND, tz0))).h + 1.2;
    if (ty0 < camFloor) ty0 = camFloor;
    cam.x += (tx0 - cam.x) * e; cam.y += (ty0 - cam.y) * e; cam.z += (tz0 - cam.z) * e;
    var lx = P.x + dx * 2.5, lz = P.z + dz * 2.5, ly = P.y + 1.0 + Math.max(0, P.y - groundAt(P.x, P.z).h) * 0.3;
    cam.lx += (lx - cam.lx) * 0.18; cam.ly += (ly - cam.ly) * 0.18; cam.lz += (lz - cam.lz) * 0.18;
  }

  function endSession() {
    // goals tally, then the wall
    tallyLines = [];
    var bonus = 0, allDone = true;
    goals.forEach(function(g) { if (g.done) { bonus += g.bonus; tallyLines.push({ t: g.label + '   +' + g.bonus, c: LIME }); } else { allDone = false; tallyLines.push({ t: g.label + '   missed', c: 'rgba(255,255,255,0.4)' }); } });
    if (allDone) { bonus += 2500; tallyLines.push({ t: 'ALL GOALS   +2500', c: YELLOW }); }
    if (line.open) bank(false);
    score += bonus;
    document.getElementById('jd-br-score').textContent = score;
    tallyT = 240; sfxOver();
    if (bonus >= 4000) sayMoment('skate-wall', true);
  }
  function finishSession() {
    enterBoard(score);
  }

  // ── Input ──
  function start() {
    if (mode === 'intro') { beginRun(); return; }
    if (mode === 'over') { if (wall.inBeat()) return; init(); beginRun(); return; }
  }
  function beginRun() {
    mode = 'play'; goalCardT = 180; clock = SESSION; musicStep = -1;
    document.getElementById('jd-br-lives').textContent = '2:00';
  }
  document.addEventListener('keydown', function(e) {
    if (!window.skateRunning) return;
    var c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') { if (!keys.left) { keys.left = true; tapT.left = 0; pressedAt.left = frame; } e.preventDefault(); }
    else if (c === 'ArrowRight' || c === 'KeyD') { if (!keys.right) { keys.right = true; tapT.right = 0; pressedAt.right = frame; } e.preventDefault(); }
    else if (c === 'ArrowUp' || c === 'KeyW') { if (!keys.up) { keys.up = true; tapT.up = 0; pressedAt.up = frame; } e.preventDefault(); }
    else if (c === 'ArrowDown' || c === 'KeyS') { if (!keys.down) { keys.down = true; tapT.down = 0; pressedAt.down = frame; } e.preventDefault(); }
    else if (c === 'Space') { e.preventDefault(); if (mode !== 'play') { start(); return; } if (!keys.space) { keys.space = true; if (P && !P.air && !P.grind) P.crouch = 0; if (P && P.grind) ollie(); } }
    else if (c === 'Enter') { if (mode !== 'play') start(); }
    if (mode !== 'play' && (c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight')) { /* menu keys go nowhere */ }
  });
  document.addEventListener('keyup', function(e) {
    if (!window.skateRunning) return;
    var c = e.code;
    var wasTap = function(k) { return tapT[k] > 0 && tapT[k] <= 8 && pressedAt[k] >= airStart; };
    if (c === 'ArrowLeft' || c === 'KeyA') { if (mode === 'play' && P && P.air && wasTap('left')) startFlipNamed('HEELFLIP'); keys.left = false; }
    else if (c === 'ArrowRight' || c === 'KeyD') { if (mode === 'play' && P && P.air && wasTap('right')) startFlipNamed('KICKFLIP'); keys.right = false; }
    else if (c === 'ArrowUp' || c === 'KeyW') { if (mode === 'play' && P && P.air && wasTap('up')) startFlipNamed('IMPOSSIBLE'); keys.up = false; }
    else if (c === 'ArrowDown' || c === 'KeyS') { if (mode === 'play' && P && P.air && wasTap('down')) startFlipNamed('SHOVE-IT'); keys.down = false; }
    else if (c === 'Space') { if (keys.space && mode === 'play' && P && !P.air && !P.grind && P.bail === 0) ollie(); keys.space = false; }
  });
  function startFlipNamed(name) {
    if (!P.air || P.bail > 0) return;
    if (P.flip) { if (P.flipDone) { /* a second flip on the same air */ } else return; }
    P.flip = name; P.flipT = 0; P.flipDone = false;
    trick(name + (P.y - groundAt(P.x, P.z).h < 0.8 && P.vy < 0 ? ' LATE' : ''), FLIP_PTS[name] * (P.y - groundAt(P.x, P.z).h < 0.8 && P.vy < 0 ? 2 : 1));
  }
  // Touch: left half steers and pushes, right half ollies and tricks
  var touches = {};
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    if (mode !== 'play') { start(); return; }
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var r = canvas.getBoundingClientRect();
      var lx = (t.clientX - r.left) / r.width;
      touches[t.identifier] = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, side: lx < 0.5 ? 'L' : 'R', t: 0, used: false };
      if (lx >= 0.5) { keys.space = true; P.crouch = 0; }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i], o = touches[t.identifier]; if (!o) continue;
      var dx = t.clientX - o.sx, dy = t.clientY - o.sy;
      if (o.side === 'L') { keys.left = dx < -18; keys.right = dx > 18; keys.up = dy < -24; keys.down = dy > 24; }
      else if (P && P.air && !o.used && (Math.abs(dx) > 30 || Math.abs(dy) > 30)) {
        o.used = true;
        if (Math.abs(dx) > Math.abs(dy)) { keys[dx > 0 ? 'right' : 'left'] = true; tapT[dx > 0 ? 'right' : 'left'] = 9; o.hold = dx > 0 ? 'right' : 'left'; }
        else { keys[dy > 0 ? 'down' : 'up'] = true; tapT[dy > 0 ? 'down' : 'up'] = 9; o.hold = dy > 0 ? 'down' : 'up'; }
      }
    }
  }, { passive: false });
  function touchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i], o = touches[t.identifier]; if (!o) continue;
      if (o.side === 'L') { keys.left = keys.right = keys.up = keys.down = false; }
      else {
        if (o.hold) { keys[o.hold] = false; }
        else if (!o.used) { if (P && P.air && P.bail === 0) startFlipNamed('KICKFLIP'); }
        if (keys.space && mode === 'play' && P && !P.air && !P.grind && P.bail === 0) ollie();
        keys.space = false;
      }
      delete touches[t.identifier];
    }
  }
  canvas.addEventListener('touchend', touchEnd, { passive: false });
  canvas.addEventListener('touchcancel', touchEnd, { passive: false });
  canvas.addEventListener('click', function() { if (mode !== 'play') start(); });

  // ── The shop wall: the shared leaderboard (public/arcade-board.js) ──
  var wall = window.ArcadeBoard.attach({
    game: 'skate3d', canvas: canvas, ctx: ctx, W: W, H: H,
    title: 'SESSION OVER', again: 'SPACE or TAP to skate again',
    scoreLabel: 'SCORE',
    levelLabel: function() { return trickCount + ' TRICKS // BEST LINE ' + bestLine + ' // ' + lettersGot + '/5 LETTERS'; },
    isActive: function () { return !!window.skateRunning; },
    getMode: function () { return mode; }, setMode: function (m) { mode = m; },
    getFrame: function () { return frame; },
    say: function (n) { say(n, 350); },
  });
  function enterBoard(v) { wall.enter(v, { level: goals.filter(function(g) { return g.done; }).length + 1, meta: { line: bestLine, tricks: trickCount, bails: bailCount, grind: Math.round(longestGrind * 10) / 10, air: Math.round(maxAir * 10) / 10, letters: lettersGot, specials: specialUsed } }); }
  function drawInitials() { wall.drawInitials(); }
  function drawBoard() { wall.drawBoard(); }

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════
  var tmpV = null;
  function worldToScreen(x, y, z) {
    if (!threeReady || !camera) return { x: W / 2, y: H / 2 };
    if (!tmpV) tmpV = new T.Vector3();
    tmpV.set(x, y, z).project(camera);
    return { x: (tmpV.x + 1) / 2 * W, y: (1 - tmpV.y) / 2 * H };
  }
  function poseSkater() {
    if (!skaterG) return;
    skaterG.position.set(P.x, P.y, P.z);
    var vis = P.bail > 0 ? 0 : 1;
    // body yaw plus spin in the air
    var spinRad = P.air ? (P.spin * Math.PI / 180) : 0;
    skaterG.rotation.set(0, P.bodyYaw + spinRad + Math.PI, 0);
    var crouch = P.crouch / 12;
    var lean = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    bodyG.rotation.set(0, 0, 0); bodyG.position.set(0, 0, 0);
    deckG.rotation.set(0, 0, 0); deckG.position.set(0, 0.12, 0);
    armL.rotation.set(0, 0, 0.3); armR.rotation.set(0, 0, -0.3);
    legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
    headG.rotation.set(0, 0, 0);
    if (P.bail > 0) {
      bodyG.rotation.set(P.bailRot, 0, P.bailRot * 0.7); bodyG.position.y = 0.4 + Math.sin(P.bailRot) * 0.3;
      deckG.position.set(Math.sin(P.bailRot) * 1.2, 0.3 + Math.abs(Math.cos(P.bailRot)) * 0.8, 0.5); deckG.rotation.set(P.bailRot * 2, P.bailRot, 0);
      return;
    }
    if (P.grind) {
      bodyG.position.y = -0.05; bodyG.rotation.z = -P.balance * 0.35;
      if (P.grindTrick === 'BOARDSLIDE') deckG.rotation.y = Math.PI / 2;
      if (P.grindTrick === 'NOSEGRIND') deckG.rotation.x = -0.35;
      if (P.grindTrick === '5-0') deckG.rotation.x = 0.35;
      if (P.grindTrick === 'TAILSLIDE') { deckG.rotation.y = Math.PI / 2; deckG.rotation.x = 0.3; }
      legL.rotation.x = 0.4; legR.rotation.x = -0.4;
      return;
    }
    if (P.air) {
      // tuck, grabs, flips
      bodyG.position.y = -0.15;
      legL.rotation.x = 0.9; legR.rotation.x = 0.9;
      deckG.position.y = 0.25;
      if (P.grab === 'INDY') { armR.rotation.set(1.6, 0, -1.2); deckG.rotation.z = 0.2; }
      else if (P.grab === 'MELON') { armL.rotation.set(1.6, 0, 1.2); deckG.rotation.z = -0.2; }
      else if (P.grab === 'METHOD') { armL.rotation.set(1.8, 0, 1.4); legL.rotation.x = 1.6; legR.rotation.x = 1.6; deckG.rotation.x = -0.9; deckG.position.y = 0.4; }
      else if (P.grab === 'NOSEGRAB') { armR.rotation.set(2.2, 0, -0.3); deckG.rotation.x = -0.6; }
      else if (P.grab === 'STALEFISH') { armR.rotation.set(1.2, 0, -1.6); deckG.rotation.z = 0.5; }
      else if (P.grab === 'CHRIST AIR') { armL.rotation.set(0, 0, 1.5); armR.rotation.set(0, 0, -1.5); deckG.position.set(0.6, 0.6, 0); deckG.rotation.z = 1.2; }
      if (P.flip) {
        var f = Math.min(1, P.flipT / 22) * Math.PI * 2;
        if (P.flip === 'KICKFLIP') deckG.rotation.z = f;
        else if (P.flip === 'HEELFLIP') deckG.rotation.z = -f;
        else if (P.flip === 'SHOVE-IT') deckG.rotation.y = f;
        else if (P.flip === 'IMPOSSIBLE') deckG.rotation.x = f;
      }
      return;
    }
    // rolling: crouch before the pop, lean into carves, push cycle
    bodyG.position.y = -crouch * 0.35;
    legL.rotation.x = crouch * 0.8; legR.rotation.x = crouch * 0.8;
    bodyG.rotation.z = -lean * 0.25;
    if (P.manual) { deckG.rotation.x = P.manual === 'MANUAL' ? 0.5 : -0.5; bodyG.rotation.x = P.manual === 'MANUAL' ? -0.25 : 0.25; bodyG.position.y = 0.05; }
    if (keys.up && !P.manual && P.speed < MAXSPD - 0.5) { var ph = Math.sin(frame * 0.35); legR.rotation.x = 0.5 + ph * 0.6; legR.position.z = 0.18 + ph * 0.25; }
    if (P.speed > 1 && frame - P.lastLand < 18) { armL.rotation.set(0, 0, 2.6); armR.rotation.set(0, 0, -2.6); }
  }
  function renderThree() {
    if (!threeReady) return;
    var sx = shake > 0.3 ? (Math.random() - 0.5) * shake * 0.03 : 0, sy = shake > 0.3 ? (Math.random() - 0.5) * shake * 0.03 : 0;
    if (mode === 'intro') {
      var a = frame * 0.004;
      camera.position.set(Math.sin(a) * 26, 9 + Math.sin(a * 0.7) * 2, Math.cos(a) * 26);
      camera.lookAt(0, 1.5, 0);
    } else {
      camera.position.set(cam.x + sx, cam.y + sy, cam.z);
      camera.lookAt(cam.lx, cam.ly, cam.lz);
    }
    poseSkater();
    if (skaterG) skaterG.visible = mode !== 'intro';
    for (var i = 0; i < letterMeshes.length; i++) { letterMeshes[i].position.y = LETTERS[i].y + Math.sin(frame * 0.06 + i) * 0.2; }
    for (var n = 0; n < neonMats.length; n++) neonMats[n].opacity = 0.75 + Math.sin(frame * 0.2 + n * 1.7) * 0.15 + (Math.random() < 0.02 ? -0.4 : 0);
    renderer.render(scene, camera);
    ctx.drawImage(glCanvas, 0, 0, W, H);
  }

  function draw() {
    tx();
    if (mode === 'intro') { drawIntro(); return; }
    if (!threeReady) {
      ctx.fillStyle = '#07061a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = threeFailed ? '#ff5050' : '#9aa'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillText(threeFailed ? 'THIS SCREEN NEEDS WEBGL' : 'LOADING THREE.JS...', W / 2, H / 2);
    } else {
      renderThree();
    }
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flashT / 30) * 0.5 + ')'; ctx.fillRect(0, 0, W, H); }
    if (mode === 'play' || tallyT > 0) drawHud();
    if (mode === 'enter') drawInitials();
    if (mode === 'over') drawBoard();
  }

  function drawHud() {
    ctx.textAlign = 'left';
    // score and clock
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.fillText(String(score), 10, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '8px monospace'; ctx.fillText('SCORE', 10, 30);
    var s = Math.max(0, Math.ceil(clock / 60));
    ctx.textAlign = 'center'; ctx.font = 'bold 16px monospace'; ctx.fillStyle = s <= 10 ? '#ff5050' : YELLOW;
    ctx.fillText(Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60), W / 2, 22);
    // running line
    if (line.open && line.pts > 0) {
      ctx.textAlign = 'right';
      var total = line.pts * line.mult;
      ctx.fillStyle = total >= 2000 ? PINK : total >= 500 ? YELLOW : '#fff';
      ctx.font = 'bold ' + (total >= 2000 ? 18 : 14) + 'px monospace';
      ctx.fillText(String(total), W - 10, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '8px monospace';
      ctx.fillText(line.pts + ' x ' + line.mult, W - 10, 30);
      if (line.keepT > 0 && line.keepT < 45 && !P.air && !P.grind && !P.manual) {
        ctx.fillStyle = LIME; ctx.font = 'bold 8px monospace'; ctx.fillText('KEEP IT GOING', W - 10, 44);
        ctx.fillStyle = 'rgba(127,255,0,0.4)'; ctx.fillRect(W - 10 - 60, 47, 60 * (1 - line.keepT / 45), 3);
      }
    }
    // trick stack
    ctx.textAlign = 'right'; ctx.font = 'bold 9px monospace';
    for (var i = 0; i < trickStack.length; i++) {
      ctx.globalAlpha = Math.min(1, trickStack[i].life / 30);
      ctx.fillStyle = i === 0 ? '#fff' : 'rgba(255,255,255,0.7)';
      ctx.fillText(trickStack[i].name, W - 10, 60 + i * 12);
    }
    ctx.globalAlpha = 1;
    // special bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(10, 40, 70, 6);
    ctx.fillStyle = specialBar >= 100 ? (Math.floor(frame / 6) % 2 ? YELLOW : PINK) : PURPLE; ctx.fillRect(10, 40, 70 * specialBar / 100, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '7px monospace'; ctx.textAlign = 'left';
    ctx.fillText(specialBar >= 100 ? 'SPECIAL: UP+DOWN IN THE AIR' : 'SPECIAL', 10, 55);
    // goals
    ctx.font = '7px monospace';
    for (var g = 0; g < goals.length; g++) {
      var go = goals[g];
      ctx.fillStyle = go.done ? LIME : 'rgba(255,255,255,0.55)';
      ctx.fillText((go.done ? '[x] ' : '[ ] ') + go.label + (go.key === 'letters' && !go.done ? ' ' + lettersGot + '/5' : ''), 10, 70 + g * 10);
    }
    // grind and manual balance
    if (P.grind || P.manual) {
      var b = P.grind ? P.balance : P.mbal;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - 40, H - 40, 80, 6);
      ctx.fillStyle = Math.abs(b) > 0.7 ? '#ff5050' : CYAN; ctx.fillRect(W / 2 - 2 + b * 38, H - 42, 4, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
      ctx.fillText(P.grind ? P.grindTrick + ' // LEFT/RIGHT BALANCE' : P.manual + ' // UP/DOWN BALANCE', W / 2, H - 46);
    }
    // popups
    for (var p = 0; p < popups.length; p++) {
      var pp = popups[p];
      ctx.globalAlpha = Math.min(1, pp.life / 20);
      ctx.font = 'bold ' + (pp.big ? 13 : 10) + 'px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(pp.text, pp.x + 1, pp.y + 1);
      ctx.fillStyle = pp.color; ctx.fillText(pp.text, pp.x, pp.y);
    }
    ctx.globalAlpha = 1;
    // banners
    for (var bn = 0; bn < banners.length; bn++) {
      var B = banners[bn];
      ctx.globalAlpha = Math.min(1, B.t / 20);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 118 + bn * 26, W, 24);
      ctx.fillStyle = B.color; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText(B.text, W / 2, 135 + bn * 26);
    }
    ctx.globalAlpha = 1;
    // goal card at the start
    if (goalCardT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(40, 70, W - 80, 150);
      ctx.strokeStyle = LIME; ctx.lineWidth = 2; ctx.strokeRect(40, 70, W - 80, 150);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText('THE PLAZA // 2:00 ON THE CLOCK', W / 2, 96);
      ctx.font = 'bold 10px monospace';
      for (var gi = 0; gi < goals.length; gi++) { ctx.fillStyle = YELLOW; ctx.fillText('[ ] ' + goals[gi].label, W / 2, 124 + gi * 18); }
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '8px monospace';
      ctx.fillText('bails cost the line, not the run', W / 2, 206);
    }
    // tally at the end
    if (tallyT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(30, 60, W - 60, 180);
      ctx.strokeStyle = PINK; ctx.lineWidth = 2; ctx.strokeRect(30, 60, W - 60, 180);
      ctx.fillStyle = PINK; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillText('TIME', W / 2, 88);
      ctx.font = 'bold 10px monospace';
      for (var ti = 0; ti < tallyLines.length; ti++) { if (tallyT < 240 - ti * 25) { ctx.fillStyle = tallyLines[ti].c; ctx.fillText(tallyLines[ti].t, W / 2, 116 + ti * 20); } }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
      ctx.fillText('SCORE ' + score, W / 2, 225);
    }
    ctx.textAlign = 'left';
  }

  // ── Attract-mode intro: power-on, studio card, the park orbiting under the title, the wall ──
  function drawIntro() {
    var t = introT;
    if (t < 70) {
      ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, W, H);
      if (t < 14) { var lw = (t / 14) * W; ctx.fillStyle = '#cfe8ff'; ctx.fillRect((W - lw) / 2, H / 2 - 1, lw, 2); }
      else if (Math.sin(t * 1.9) > -0.5 || t > 38) {
        ctx.fillStyle = PINK; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.fillText('LUMENATI', W / 2, H / 2 - 6);
        ctx.fillStyle = '#d8dde4'; ctx.font = 'bold 10px monospace'; ctx.fillText('PRESENTS', W / 2, H / 2 + 12);
      }
      return;
    }
    if (t >= 300) { wall.drawAttract(); return; }
    if (threeReady) renderThree(); else { ctx.fillStyle = '#07061a'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PINK; ctx.font = 'bold 30px monospace'; ctx.fillText('INK OR DIE', W / 2, 96);
    ctx.fillStyle = CYAN; ctx.font = 'bold 22px monospace'; ctx.fillText('3 D', W / 2, 126);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '9px monospace';
    ctx.fillText('THE PLAZA // TWO MINUTES // SIGN THE WALL', W / 2, 150);
    var page = Math.floor((t - 70) / 80) % 3;
    var lines = page === 0
      ? ['ARROWS steer, hold UP to push, DOWN brakes', 'SPACE ollies, hold it for more pop', 'ride up the quarter pipe for vert']
      : page === 1
        ? ['in the air: TAP an arrow to flip', 'HOLD LEFT/RIGHT to spin, UP/DOWN to grab', 'land flat or it is sketchy, land sideways and you bail']
        : ['ollie onto a rail to grind, arrows switch tricks', 'hold DOWN on landing for a manual', 'full special bar: UP+DOWN in the air is a christ air'];
    ctx.fillStyle = YELLOW; ctx.font = '8px monospace';
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, 190 + i * 14);
    if (t % 60 < 40) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.fillText(('ontouchstart' in window) ? 'TAP TO SKATE' : 'PRESS SPACE', W / 2, 262); }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '8px monospace';
    ctx.fillText('BEST ' + wall.best() + ' // PROTOTYPE', W / 2, 290);
    ctx.textAlign = 'left';
  }

  // ── Fixed-step loop ──
  var rafId = null, lastT = 0, acc = 0;
  function startLoop() { if (rafId === null) { lastT = 0; acc = 0; rafId = requestAnimationFrame(loop); } }
  function loop(t) {
    if (!window.skateRunning) { rafId = null; return; }
    if (!lastT) lastT = t;
    acc += Math.min(100, t - lastT);
    lastT = t;
    try {
      if (!threeReady && !threeFailed) ensureThree();
      while (acc >= 16.67) {
        if (mode === 'play') update();
        else { frame++; musicTick(); if (mode === 'intro' && ++introT > 540) introT = 70; }
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

  // Test hook: read the skater, or set position and clock (used by the headless checks).
  window.__skate3dDebug = { get: function() { return { P: P, mode: mode, score: score, clock: clock, line: line }; }, set: function(o) { if (!P) return; if (o.x != null) P.x = o.x; if (o.z != null) P.z = o.z; if (o.y != null) P.y = o.y; if (o.yaw != null) { P.yaw = o.yaw; P.bodyYaw = o.yaw; } if (o.speed != null) P.speed = o.speed; if (o.clock != null) clock = o.clock; } };

  var obs = new MutationObserver(function() {
    if (document.getElementById('jd-game-overlay').style.display === 'flex') { hi(); init(); }
  });
  var overlay = document.getElementById('jd-game-overlay');
  if (overlay) obs.observe(overlay, { attributes: true, attributeFilter: ['style'] });
})();
