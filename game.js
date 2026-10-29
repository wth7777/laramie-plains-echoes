/* ============================================================
   LARAMIE PLAINS: ECHOES OF THE SURVEY
   One-up version — better graphics + full sound
   Pure canvas, no external assets. Ready for GitHub Pages.
   ============================================================ */
(() => {
  'use strict';

  // ---------- Canvas & constants ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = 640, H = 400, T = 32; // tile size
  const COLS = 20, ROWS = 12;

  // ---------- Audio system (Web Audio) ----------
  let audioCtx = null;
  let masterGain, musicGain, sfxGain;
  let ambientNodes = [];
  let musicPlaying = false;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(audioCtx.destination);

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.28;
    musicGain.connect(masterGain);

    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.55;
    sfxGain.connect(masterGain);
  }

  function resumeAudio() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  // Simple noise for wind / ambience
  function createNoiseBuffer(duration = 2) {
    const rate = audioCtx.sampleRate;
    const len = rate * duration;
    const buf = audioCtx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    return buf;
  }

  function startAmbient() {
    if (!audioCtx || ambientNodes.length) return;
    const noise = createNoiseBuffer(3);
    const src = audioCtx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.07;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start();
    ambientNodes = [src, filter, gain];

    // Distant soft wind modulation
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    ambientNodes.push(lfo, lfoGain);
  }

  // Procedural SFX
  function playTone(freq, type, dur, vol = 0.3, slide = 0) {
    if (!audioCtx) return;
    resumeAudio();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audioCtx.currentTime + dur);
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start();
    osc.stop(audioCtx.currentTime + dur + 0.05);
  }

  function playNoise(dur, vol = 0.2, filterFreq = 800) {
    if (!audioCtx) return;
    resumeAudio();
    const src = audioCtx.createBufferSource();
    src.buffer = createNoiseBuffer(dur + 0.1);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfxGain);
    src.start();
    src.stop(audioCtx.currentTime + dur + 0.05);
  }

  const SFX = {
    step: () => playNoise(0.06, 0.12, 600 + Math.random() * 200),
    interact: () => { playTone(520, 'triangle', 0.08, 0.25); playTone(780, 'sine', 0.12, 0.15); },
    collect: () => {
      playTone(660, 'sine', 0.1, 0.3);
      setTimeout(() => playTone(880, 'sine', 0.15, 0.25), 60);
      setTimeout(() => playTone(1100, 'triangle', 0.2, 0.2), 130);
    },
    stake: () => {
      playTone(440, 'square', 0.12, 0.2);
      setTimeout(() => playTone(554, 'square', 0.12, 0.18), 90);
      setTimeout(() => playTone(659, 'square', 0.25, 0.22), 180);
    },
    chest: () => {
      playTone(200, 'sawtooth', 0.15, 0.15, 80);
      setTimeout(() => playTone(400, 'triangle', 0.2, 0.2), 100);
    },
    hurt: () => { playTone(180, 'sawtooth', 0.18, 0.3, -60); playNoise(0.15, 0.15, 300); },
    swing: () => playNoise(0.1, 0.18, 1200),
    ui: () => playTone(700, 'sine', 0.05, 0.12),
    door: () => { playTone(150, 'triangle', 0.2, 0.2, 40); playNoise(0.15, 0.1, 400); },
    well: () => {
      playTone(220, 'sine', 0.4, 0.25);
      setTimeout(() => playTone(277, 'sine', 0.4, 0.22), 200);
      setTimeout(() => playTone(330, 'sine', 0.6, 0.2), 420);
    },
    success: () => {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playTone(f, 'triangle', 0.25, 0.22), i * 90));
    }
  };

  // Simple looping ambient music (pentatonic prairie feel)
  let musicTimer = null;
  function startMusic() {
    if (!audioCtx || musicPlaying) return;
    musicPlaying = true;
    const scale = [196, 220, 247, 294, 330, 392, 440]; // G major-ish low
    let idx = 0;
    function note() {
      if (!musicPlaying) return;
      const f = scale[Math.floor(Math.random() * scale.length)];
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(0.07, audioCtx.currentTime + 0.4);
      g.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 2.8);
      osc.connect(g);
      g.connect(musicGain);
      osc.start();
      osc.stop(audioCtx.currentTime + 3);
      musicTimer = setTimeout(note, 1800 + Math.random() * 1400);
    }
    note();
  }

  // ---------- Game state ----------
  const SAVE_KEY = 'laramieEchoesSave_v1';

  function fresh() {
    return {
      x: 2.5, y: 5.5,
      zone: 'camp',
      hp: 5, maxHp: 5,
      coins: 0,
      stakes: { stakeA: false, stakeB: false },
      quests: { stakes: false, shrine: false, well: false },
      hasSword: false,
      hasKey: false,
      hasMap: false,
      hasCompass: false,
      potion: 0,
      notes: [],
      openedChests: {},
      flags: {},
      facing: 'down',
      anim: 0
    };
  }

  let s = load() || fresh();
  let particles = [];
  let attackCd = 0, invuln = 0, interactCd = 0;
  let keys = {}, touch = { up: false, down: false, left: false, right: false };
  let last = 0;
  let camX = 0, camY = 0;
  let timeOfDay = 0.35; // 0–1, morning-ish start
  let footTimer = 0;
  let toastTimer = 0;

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ---------- Zones (expanded & polished) ----------
  const zones = {
    camp: {
      name: 'Survey Camp',
      biome: 'prairie',
      start: [2.5, 5.5],
      tiles: [
        '####################',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '####################'
      ],
      objects: [
        { x: 5, y: 3, k: 'sign', id: 'campSign', label: 'Survey Camp' },
        { x: 9, y: 5, k: 'stake', id: 'stakeA' },
        { x: 14, y: 7, k: 'stake', id: 'stakeB' },
        { x: 17, y: 3, k: 'well', id: 'well' },
        { x: 3, y: 8, k: 'npc', id: 'mara' },
        { x: 10, y: 2, k: 'rock', id: 'strangeRock' },
        { x: 7, y: 7, k: 'chest', id: 'chestCamp', item: 'potion' },
        { x: 15, y: 9, k: 'tent', id: 'tent1' },
        { x: 4, y: 4, k: 'campfire', id: 'fire' }
      ],
      links: [
        { x: 19, y: 5, to: 'town', tx: 1, ty: 5 },
        { x: 11, y: 1, to: 'ridge', tx: 10, ty: 10 }
      ]
    },
    town: {
      name: 'Laramie Tent Town',
      biome: 'town',
      start: [2.5, 5.5],
      tiles: [
        '####################',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggwwggggggwwggggg#',
        '#gggwwggggggwwggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#ggggwwgggggggggggg#',
        '#ggggwwgggggggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '####################'
      ],
      objects: [
        { x: 4, y: 3, k: 'building', label: 'General Store' },
        { x: 12, y: 3, k: 'building', label: 'Survey Office' },
        { x: 7, y: 8, k: 'npc', id: 'louisa' },
        { x: 15, y: 7, k: 'npc', id: 'deputy' },
        { x: 16, y: 9, k: 'chest', id: 'townChest', item: 'coins' },
        { x: 3, y: 9, k: 'sign', label: 'Town notice board' }
      ],
      links: [
        { x: 0, y: 5, to: 'camp', tx: 18, ty: 5 },
        { x: 19, y: 5, to: 'railhead', tx: 1, ty: 5 }
      ]
    },
    railhead: {
      name: 'End of the Rails',
      biome: 'town',
      start: [2.5, 5.5],
      tiles: [
        '####################',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#ggwwggggggggggwwgg#',
        '#ggwwggggggggggwwgg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '#ggggggggwwgggggggg#',
        '#ggggggggwwgggggggg#',
        '#gggggggggggggggggg#',
        '#gggggggggggggggggg#',
        '####################'
      ],
      objects: [
        { x: 4, y: 3, k: 'building', label: 'Freight Office' },
        { x: 9, y: 7, k: 'npc', id: 'engineer' },
        { x: 15, y: 8, k: 'enemy', id: 'ruffian1', hp: 2 },
        { x: 16, y: 4, k: 'chest', id: 'railChest', item: 'sword' },
        { x: 11, y: 2, k: 'sign', label: 'Tracks end here' }
      ],
      links: [
        { x: 0, y: 5, to: 'town', tx: 18, ty: 5 },
        { x: 10, y: 11, to: 'ridge', tx: 15, ty: 1 }
      ]
    },
    ridge: {
      name: 'The Wind-Carved Ridge',
      biome: 'ridge',
      start: [10.5, 10.5],
      tiles: [
        '####################',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '#rrrrrrrrrrrrrrrrrr#',
        '####################'
      ],
      objects: [
        { x: 10, y: 5, k: 'shrine', id: 'shrine' },
        { x: 5, y: 8, k: 'enemy', id: 'coyote1', hp: 1 },
        { x: 14, y: 3, k: 'enemy', id: 'coyote2', hp: 1 },
        { x: 8, y: 2, k: 'chest', id: 'ridgeChest', item: 'key' },
        { x: 16, y: 9, k: 'sign', label: 'La Ramée Canyon ahead' }
      ],
      links: [
        { x: 10, y: 11, to: 'camp', tx: 11, ty: 2 },
        { x: 15, y: 0, to: 'railhead', tx: 10, ty: 10 },
        { x: 0, y: 6, to: 'canyon', tx: 18, ty: 6 }
      ]
    },
    canyon: {
      name: 'La Ramée Canyon',
      biome: 'canyon',
      start: [18.5, 6.5],
      tiles: [
        '####################',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '#cccccccccccccccccc#',
        '####################'
      ],
      objects: [
        { x: 10, y: 5, k: 'cave', id: 'caveDoor' },
        { x: 6, y: 8, k: 'enemy', id: 'bandit1', hp: 3 },
        { x: 14, y: 3, k: 'chest', id: 'canyonChest', item: 'coins' },
        { x: 4, y: 4, k: 'sign', label: 'Understar Gate' }
      ],
      links: [
        { x: 19, y: 6, to: 'ridge', tx: 1, ty: 6 }
      ]
    }
  };

  // ---------- NPCs & dialog ----------
  const NPCS = {
    mara: {
      name: 'Mara – Surveyor',
      lines: [
        'You made it. The Union Pacific is still a day behind.',
        'Two brass stakes went missing in the night. Find them both.',
        'The old well on the east side… the chain trembles near it. Strange.'
      ]
    },
    louisa: {
      name: 'Louisa – Storekeeper',
      lines: [
        'Canvas, beans, and bad coffee. That is all I have until the next train.',
        'Heard the surveyors lost their stakes. Bad luck on these plains.',
        'Keep your powder dry and your eyes open. The ridge has coyotes.'
      ]
    },
    deputy: {
      name: 'Deputy Harker',
      lines: [
        'Quiet night so far. Prefer it that way.',
        'Ruffians have been spotted near the railhead. Watch yourself.',
        'If you find anything that does not belong to this century, report it.'
      ]
    },
    engineer: {
      name: 'Engineer Crowe',
      lines: [
        'Tracks end here for now. We push west at first light.',
        'Some of the men swear they heard singing from the canyon.',
        'There is a chest by the freight office. Not mine. Not asking.'
      ]
    }
  };

  // ---------- Helpers ----------
  function $(id) { return document.getElementById(id); }
  function say(msg, dur = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), dur);
  }
  function note(txt) {
    if (!s.notes.includes(txt)) {
      s.notes.unshift(txt);
      if (s.notes.length > 12) s.notes.pop();
      save();
    }
  }
  function dialog(title, body) {
    SFX.ui();
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = body;
    $('modal').classList.add('show');
  }
  function closeDialog() {
    $('modal').classList.remove('show');
  }
  function near(o, dist = 1.15) {
    return Math.abs(s.x - (o.x + 0.5)) < dist && Math.abs(s.y - (o.y + 0.5)) < dist;
  }
  function objAlive(o) {
    if (o.k === 'enemy' && (o.hp || 0) <= 0) return false;
    if (o.k === 'chest' && s.openedChests[o.id]) return false;
    return true;
  }
  function currentZone() { return zones[s.zone]; }

  // ---------- Particles ----------
  function spawnParticle(x, y, opts = {}) {
    particles.push({
      x, y,
      vx: opts.vx || (Math.random() - 0.5) * 40,
      vy: opts.vy || (Math.random() - 0.5) * 30 - 20,
      life: opts.life || 0.6 + Math.random() * 0.4,
      max: opts.life || 0.8,
      color: opts.color || '#c8b080',
      size: opts.size || 2 + Math.random() * 2
    });
  }
  function burst(x, y, n = 8, color) {
    for (let i = 0; i < n; i++) spawnParticle(x, y, { color, life: 0.5 + Math.random() * 0.5 });
  }

  // ---------- Movement & combat ----------
  function solidAt(tx, ty) {
    const z = currentZone();
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    const ch = z.tiles[ty][tx];
    return ch === '#';
  }

  function move(dt) {
    let dx = 0, dy = 0;
    if (keys['arrowup'] || keys['w'] || touch.up) dy -= 1;
    if (keys['arrowdown'] || keys['s'] || touch.down) dy += 1;
    if (keys['arrowleft'] || keys['a'] || touch.left) dx -= 1;
    if (keys['arrowright'] || keys['d'] || touch.right) dx += 1;

    if (dx || dy) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= len; dy /= len;
      if (Math.abs(dx) > Math.abs(dy)) s.facing = dx > 0 ? 'right' : 'left';
      else s.facing = dy > 0 ? 'down' : 'up';

      const speed = 3.6;
      const nx = s.x + dx * speed * dt;
      const ny = s.y + dy * speed * dt;

      // Axis separated collision
      if (!solidAt(Math.floor(nx), Math.floor(s.y)) && !solidAt(Math.floor(nx + 0.4), Math.floor(s.y)) &&
          !solidAt(Math.floor(nx), Math.floor(s.y + 0.4)) && !solidAt(Math.floor(nx + 0.4), Math.floor(s.y + 0.4))) {
        s.x = nx;
      }
      if (!solidAt(Math.floor(s.x), Math.floor(ny)) && !solidAt(Math.floor(s.x + 0.4), Math.floor(ny)) &&
          !solidAt(Math.floor(s.x), Math.floor(ny + 0.4)) && !solidAt(Math.floor(s.x + 0.4), Math.floor(ny + 0.4))) {
        s.y = ny;
      }

      s.anim += dt * 8;
      footTimer -= dt;
      if (footTimer <= 0) {
        SFX.step();
        footTimer = 0.28;
        // dust
        if (Math.random() < 0.4) spawnParticle(s.x * T + 16, s.y * T + 28, { color: '#a09060', size: 1.5, life: 0.4 });
      }

      // Zone links
      const z = currentZone();
      for (const link of z.links) {
        if (Math.abs(s.x - link.x) < 0.7 && Math.abs(s.y - link.y) < 0.7) {
          SFX.door();
          s.zone = link.to;
          s.x = link.tx + 0.5;
          s.y = link.ty + 0.5;
          say(`Entering ${zones[s.zone].name}`);
          save();
          burst(s.x * T, s.y * T, 6, '#d4a84b');
          break;
        }
      }
    } else {
      s.anim = 0;
    }

    // Enemies simple chase
    const z = currentZone();
    for (const o of z.objects) {
      if (o.k !== 'enemy' || !objAlive(o)) continue;
      const dist = Math.hypot(s.x - (o.x + 0.5), s.y - (o.y + 0.5));
      if (dist < 5 && dist > 0.6) {
        const ang = Math.atan2(s.y - (o.y + 0.5), s.x - (o.x + 0.5));
        o.x += Math.cos(ang) * 1.4 * dt;
        o.y += Math.sin(ang) * 1.4 * dt;
      }
      if (dist < 0.7 && invuln <= 0) {
        s.hp = Math.max(0, s.hp - 1);
        invuln = 1.1;
        SFX.hurt();
        burst(s.x * T + 16, s.y * T + 16, 10, '#c45c4a');
        say('You take a hit!');
        if (s.hp <= 0) {
          say('You collapse… waking back at camp.');
          s.hp = s.maxHp;
          s.zone = 'camp';
          s.x = 2.5; s.y = 5.5;
          save();
        }
      }
    }
  }

  function interact() {
    if (interactCd > 0) return;
    interactCd = 0.35;
    resumeAudio();
    SFX.interact();
    const z = currentZone();
    const o = z.objects.find(obj => near(obj) && objAlive(obj));
    if (!o) {
      say('Nothing close enough to examine.');
      return;
    }
    switch (o.k) {
      case 'stake':
        if (!s.stakes[o.id]) {
          s.stakes[o.id] = true;
          note('A brass survey stake bears coordinates that do not match the stars.');
          SFX.stake();
          burst(o.x * T + 16, o.y * T + 16, 12, '#d4a84b');
          say('Survey stake collected!');
          if (s.stakes.stakeA && s.stakes.stakeB && !s.quests.stakes) {
            s.quests.stakes = true;
            note('Both survey stakes align to a point beneath the old well.');
            SFX.success();
            say('Quest updated: investigate the old well.');
          }
        } else say('The stake is already recorded.');
        save();
        break;
      case 'well':
        if (!s.quests.stakes) {
          dialog('The Old Well', `<p>The rim is etched with strange markings. Your survey chain trembles, but you need the two brass stakes to calculate its true position.</p>`);
        } else if (!s.quests.well) {
          s.quests.well = true;
          SFX.well();
          note('The Star-Well answered the measurements. A stairway of impossible stone opened.');
          dialog('The Star-Well', `<p>The well answers your measurements with three clear tones. A narrow stairway appears in the dark. The old stories might be nonsense—but the stone is warm to the touch.</p><p><em>You have uncovered the first secret of the plains.</em></p>`);
          save();
        } else {
          dialog('The Star-Well', `<p>The stair still descends. Whatever waits below remembers Jacques La Ramée.</p>`);
        }
        break;
      case 'npc':
        talk(o.id);
        break;
      case 'sign':
        dialog(o.label || 'Sign', `<p>The weathered board reads: “${o.label}.” Your field book records the route. The wind carries the distant sound of a train that has not yet arrived.</p>`);
        break;
      case 'building':
        dialog(o.label, `<p>The building smells of coal smoke, wet canvas, and fresh-cut timber. It is locked for the night.</p>`);
        break;
      case 'rock':
        dialog('A Strange Stone', `<p>The stone is threaded with a blue mineral. Your compass needle points straight down. You mark the spot in your notebook.</p>`);
        note('A dark rock near camp contains a blue mineral that makes the compass point downward.');
        break;
      case 'chest':
        openChest(o);
        break;
      case 'shrine':
        if (!s.quests.stakes) {
          dialog('Wind Shrine', `<p>A stone marker stands in a ring of wind-carved rocks. It seems to be waiting for a surveyor who can read the land.</p>`);
        } else if (!s.quests.shrine) {
          s.quests.shrine = true;
          s.hasMap = true;
          s.hasCompass = true;
          SFX.success();
          note('The ridge shrine grants a map and compass. The old survey lines reveal a path to La Ramée Canyon.');
          dialog('Wind Shrine', `<p>The survey stakes align with the ridge. A hidden compartment opens: inside are an old map and compass. Canyon trails now appear on your map.</p>`);
          save();
        } else say('The shrine is quiet. The map and compass are yours.');
        break;
      case 'cave':
        if (!s.hasKey) {
          dialog('Sealed Stone Door', `<p>A door is cut into the canyon wall. The lock is made of brass, not iron. You need a key.</p>`);
        } else if (!s.flags.doorOpen) {
          s.flags.doorOpen = true;
          SFX.door();
          SFX.success();
          note('The Understar Door opened with a sound like a bell.');
          dialog('The Understar Door', `<p>Your brass key turns with a sound like a bell. Beyond the door, a stair descends toward an impossible sky. The survey is far from over.</p>`);
          save();
        } else {
          dialog('The Understar Door', `<p>The passage remains open. Whatever lies beneath the plains is waiting.</p>`);
        }
        break;
      case 'campfire':
        say('The fire crackles. Warmth against the high-plains wind.');
        burst(o.x * T + 16, o.y * T + 8, 5, '#ff8844');
        break;
      case 'tent':
        say('A surveyor’s tent. Canvas snaps in the breeze.');
        break;
      default:
        say('Interesting, but nothing more.');
    }
  }

  function talk(id) {
    const n = NPCS[id];
    if (!n) return;
    const line = n.lines[Math.floor(Math.random() * n.lines.length)];
    dialog(n.name, `<p>${line}</p>`);
  }

  function openChest(o) {
    if (s.openedChests[o.id]) return;
    s.openedChests[o.id] = true;
    SFX.chest();
    burst(o.x * T + 16, o.y * T + 16, 14, '#d4a84b');
    let msg = 'You open the chest… ';
    switch (o.item) {
      case 'potion':
        s.potion++;
        s.hp = Math.min(s.maxHp, s.hp + 2);
        msg += 'a healing draught. Health restored.';
        break;
      case 'coins':
        s.coins += 15 + Math.floor(Math.random() * 10);
        msg += `a purse of ${s.coins} coins total.`;
        break;
      case 'sword':
        s.hasSword = true;
        msg += 'a fine cavalry saber! Use Tool now attacks.';
        note('You found a cavalry saber at the railhead.');
        break;
      case 'key':
        s.hasKey = true;
        msg += 'a heavy brass key.';
        note('A brass key recovered from the ridge.');
        break;
      default:
        s.coins += 5;
        msg += 'a few coins.';
    }
    say(msg);
    save();
  }

  function useTool() {
    if (attackCd > 0) return;
    attackCd = 0.4;
    resumeAudio();
    if (s.hasSword) {
      SFX.swing();
      // Attack facing direction
      let ax = s.x, ay = s.y;
      if (s.facing === 'right') ax += 0.9;
      else if (s.facing === 'left') ax -= 0.9;
      else if (s.facing === 'down') ay += 0.9;
      else ay -= 0.9;
      burst(ax * T + 16, ay * T + 16, 6, '#e8e0d0');
      const z = currentZone();
      for (const o of z.objects) {
        if (o.k === 'enemy' && objAlive(o) && Math.hypot(ax - (o.x + 0.5), ay - (o.y + 0.5)) < 1.1) {
          o.hp = (o.hp || 1) - 1;
          SFX.hurt();
          burst(o.x * T + 16, o.y * T + 16, 8, '#c45c4a');
          if (o.hp <= 0) {
            say('Enemy defeated!');
            s.coins += 3;
            save();
          }
        }
      }
    } else {
      SFX.interact();
      say('You swing the survey chain. It is not a weapon… yet.');
    }
  }

  // ---------- Drawing (better graphics) ----------
  function drawTile(tx, ty, ch, biome) {
    const px = tx * T - camX;
    const py = ty * T - camY;
    if (px < -T || py < -T || px > W || py > H) return;

    // Base colors by biome
    let base, detail;
    if (ch === '#') {
      // wall / mountain edge
      ctx.fillStyle = '#2a3344';
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#3a4558';
      ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
      return;
    }
    if (biome === 'prairie' || biome === 'town') {
      base = (tx + ty) % 2 === 0 ? '#3d6b3a' : '#356235';
      detail = '#4a7a45';
    } else if (biome === 'ridge') {
      base = (tx + ty) % 2 === 0 ? '#5a5040' : '#4e4638';
      detail = '#6a6050';
    } else { // canyon
      base = (tx + ty) % 2 === 0 ? '#6a4a38' : '#5e4232';
      detail = '#7a5a48';
    }

    ctx.fillStyle = base;
    ctx.fillRect(px, py, T, T);

    // Subtle grass / rock detail
    ctx.fillStyle = detail;
    if (biome === 'prairie' || biome === 'town') {
      for (let i = 0; i < 4; i++) {
        const gx = px + 4 + (i * 7 + tx * 3) % 24;
        const gy = py + 8 + (i * 5 + ty * 2) % 20;
        ctx.fillRect(gx, gy, 2, 3);
      }
    } else {
      ctx.fillRect(px + 6, py + 10, 4, 2);
      ctx.fillRect(px + 18, py + 18, 5, 2);
    }

    // Soft edge shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(px, py + T - 3, T, 3);
  }

  function drawObject(o, t) {
    if (!objAlive(o)) return;
    const px = o.x * T - camX;
    const py = o.y * T - camY;
    if (px < -40 || py < -40 || px > W + 20 || py > H + 20) return;

    const bob = Math.sin(t * 3 + o.x) * 1.5;

    switch (o.k) {
      case 'stake': {
        // Brass survey stake
        ctx.fillStyle = s.stakes[o.id] ? '#4a5a4a' : '#c9a227';
        ctx.fillRect(px + 14, py + 8 + bob, 4, 20);
        ctx.fillStyle = '#e8d080';
        ctx.fillRect(px + 12, py + 6 + bob, 8, 5);
        if (!s.stakes[o.id]) {
          ctx.fillStyle = 'rgba(212,168,75,0.35)';
          ctx.beginPath();
          ctx.arc(px + 16, py + 12 + bob, 10 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'well': {
        ctx.fillStyle = '#3a3a42';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 22, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a2a32';
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 20, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // rim highlight
        ctx.strokeStyle = '#5a5a6a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px + 16, py + 18, 12, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (s.quests.stakes) {
          ctx.fillStyle = `rgba(100,180,255,${0.15 + Math.sin(t * 2) * 0.1})`;
          ctx.beginPath();
          ctx.ellipse(px + 16, py + 16, 8, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'npc': {
        // Simple person
        ctx.fillStyle = '#2a3a4a';
        ctx.fillRect(px + 11, py + 14, 10, 12); // body
        ctx.fillStyle = '#e0c8a0';
        ctx.beginPath();
        ctx.arc(px + 16, py + 10, 6, 0, Math.PI * 2);
        ctx.fill(); // head
        ctx.fillStyle = '#3d5a4a';
        ctx.fillRect(px + 9, py + 15, 4, 8); // arm
        ctx.fillRect(px + 19, py + 15, 4, 8);
        break;
      }
      case 'chest': {
        ctx.fillStyle = '#6a4a28';
        ctx.fillRect(px + 6, py + 12, 20, 14);
        ctx.fillStyle = '#8a6a38';
        ctx.fillRect(px + 6, py + 12, 20, 5);
        ctx.fillStyle = '#d4a84b';
        ctx.fillRect(px + 14, py + 16, 4, 6);
        break;
      }
      case 'sign': {
        ctx.fillStyle = '#5a4030';
        ctx.fillRect(px + 14, py + 10, 4, 18);
        ctx.fillStyle = '#8a6a40';
        ctx.fillRect(px + 6, py + 6, 20, 10);
        break;
      }
      case 'building': {
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(px + 2, py + 8, 28, 22);
        ctx.fillStyle = '#3a2a1a';
        ctx.beginPath();
        ctx.moveTo(px, py + 10);
        ctx.lineTo(px + 16, py + 2);
        ctx.lineTo(px + 32, py + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1a2030';
        ctx.fillRect(px + 12, py + 18, 8, 12); // door
        break;
      }
      case 'rock': {
        ctx.fillStyle = '#4a4a58';
        ctx.beginPath();
        ctx.moveTo(px + 6, py + 24);
        ctx.lineTo(px + 10, py + 10);
        ctx.lineTo(px + 22, py + 8);
        ctx.lineTo(px + 26, py + 22);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a6a9a';
        ctx.fillRect(px + 14, py + 14, 4, 4);
        break;
      }
      case 'enemy': {
        const flash = invuln > 0 && Math.floor(t * 10) % 2 ? 0.5 : 1;
        ctx.globalAlpha = flash;
        ctx.fillStyle = o.id.startsWith('coyote') ? '#8a6a40' : '#5a3a3a';
        ctx.fillRect(px + 8, py + 12, 16, 14);
        ctx.fillStyle = '#2a1a1a';
        ctx.beginPath();
        ctx.arc(px + 16, py + 10, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'shrine': {
        ctx.fillStyle = '#5a5a6a';
        ctx.fillRect(px + 10, py + 6, 12, 22);
        ctx.fillStyle = '#7a7a8a';
        ctx.fillRect(px + 6, py + 4, 20, 6);
        ctx.fillStyle = 'rgba(180,200,255,0.3)';
        ctx.beginPath();
        ctx.arc(px + 16, py + 8, 6 + Math.sin(t * 2) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'cave': {
        ctx.fillStyle = '#1a1a22';
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 28);
        ctx.quadraticCurveTo(px + 16, py + 4, px + 28, py + 28);
        ctx.closePath();
        ctx.fill();
        if (s.flags.doorOpen) {
          ctx.fillStyle = '#2a3a5a';
          ctx.fillRect(px + 10, py + 12, 12, 16);
        }
        break;
      }
      case 'campfire': {
        // wood
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(px + 10, py + 20, 12, 4);
        // flames
        const flicker = 0.7 + Math.sin(t * 12) * 0.3;
        ctx.fillStyle = `rgba(255,140,40,${flicker})`;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 8);
        ctx.lineTo(px + 10, py + 20);
        ctx.lineTo(px + 22, py + 20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(255,220,80,${flicker})`;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 12);
        ctx.lineTo(px + 13, py + 20);
        ctx.lineTo(px + 19, py + 20);
        ctx.closePath();
        ctx.fill();
        if (Math.random() < 0.3) spawnParticle(px + 16, py + 10, { color: '#ff8844', vy: -30, life: 0.5 });
        break;
      }
      case 'tent': {
        ctx.fillStyle = '#6a5a40';
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 26);
        ctx.lineTo(px + 16, py + 6);
        ctx.lineTo(px + 28, py + 26);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4a3a28';
        ctx.fillRect(px + 14, py + 16, 4, 10);
        break;
      }
    }
  }

  function drawPlayer(t) {
    const px = s.x * T - camX;
    const py = s.y * T - camY;
    const walk = Math.sin(s.anim) * 2;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 30, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // invuln flash
    if (invuln > 0 && Math.floor(t * 12) % 2 === 0) ctx.globalAlpha = 0.4;

    // body
    ctx.fillStyle = '#2a4a6a';
    ctx.fillRect(px + 10, py + 14 + walk * 0.3, 12, 14);

    // head
    ctx.fillStyle = '#e0c8a0';
    ctx.beginPath();
    ctx.arc(px + 16, py + 10 + walk * 0.2, 7, 0, Math.PI * 2);
    ctx.fill();

    // hat
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(px + 8, py + 4 + walk * 0.2, 16, 4);
    ctx.fillRect(px + 11, py + 1 + walk * 0.2, 10, 4);

    // legs
    ctx.fillStyle = '#2a2a3a';
    const legOff = Math.sin(s.anim) * 3;
    ctx.fillRect(px + 11, py + 26, 4, 6 + (s.facing === 'down' || s.facing === 'up' ? legOff : 0));
    ctx.fillRect(px + 17, py + 26, 4, 6 - (s.facing === 'down' || s.facing === 'up' ? legOff : 0));

    // tool / sword
    if (s.hasSword) {
      ctx.fillStyle = '#c0c0d0';
      if (s.facing === 'right') {
        ctx.fillRect(px + 22, py + 16, 12, 3);
        ctx.fillStyle = '#8a6a30';
        ctx.fillRect(px + 20, py + 14, 4, 7);
      } else if (s.facing === 'left') {
        ctx.fillRect(px - 2, py + 16, 12, 3);
        ctx.fillStyle = '#8a6a30';
        ctx.fillRect(px + 8, py + 14, 4, 7);
      } else {
        ctx.fillRect(px + 14, py + 8, 3, 10);
      }
    }

    ctx.globalAlpha = 1;
  }

  function draw() {
    const t = performance.now() / 1000;
    timeOfDay = (timeOfDay + 0.0008) % 1;

    // Camera follow with soft lerp
    const targetCamX = s.x * T - W / 2 + 16;
    const targetCamY = s.y * T - H / 2 + 16;
    camX += (targetCamX - camX) * 0.12;
    camY += (targetCamY - camY) * 0.12;
    camX = Math.max(0, Math.min(COLS * T - W, camX));
    camY = Math.max(0, Math.min(ROWS * T - H, camY));

    // Clear
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, W, H);

    const z = currentZone();

    // Tiles
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        drawTile(tx, ty, z.tiles[ty][tx], z.biome);
      }
    }

    // Link markers (gold frames)
    for (const link of z.links) {
      const px = link.x * T - camX;
      const py = link.y * T - camY;
      ctx.strokeStyle = `rgba(212,168,75,${0.5 + Math.sin(t * 3) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 4, py + 4, T - 8, T - 8);
      ctx.fillStyle = 'rgba(212,168,75,0.15)';
      ctx.fillRect(px + 4, py + 4, T - 8, T - 8);
    }

    // Objects
    const sorted = [...z.objects].sort((a, b) => a.y - b.y);
    for (const o of sorted) drawObject(o, t);

    // Player
    drawPlayer(t);

    // Particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - camX, p.y - camY, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Day/night vignette (subtle)
    const night = Math.sin(timeOfDay * Math.PI * 2) * 0.5 + 0.5;
    if (night > 0.6) {
      ctx.fillStyle = `rgba(10,15,30,${(night - 0.6) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Zone name
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(8, 8, 160, 22);
    ctx.fillStyle = '#d4a84b';
    ctx.font = '12px system-ui';
    ctx.fillText(z.name, 14, 23);
  }

  function updateHud() {
    const hearts = '♥ '.repeat(s.hp) + '♡ '.repeat(Math.max(0, s.maxHp - s.hp));
    $('health').textContent = hearts.trim();
    let toolTxt = s.hasSword ? 'Saber' : 'Survey chain';
    toolTxt += ` · ${s.coins} coins`;
    if (s.potion) toolTxt += ` · ${s.potion} draught`;
    $('tool').textContent = toolTxt;

    let obj = 'Quest: Find both survey stakes';
    if (s.quests.stakes && !s.quests.well) obj = 'Quest: Investigate the old well';
    else if (s.quests.well && !s.quests.shrine) obj = 'Quest: Seek the Wind Shrine on the ridge';
    else if (s.quests.shrine && !s.hasKey) obj = 'Quest: Find the brass key';
    else if (s.hasKey && !s.flags.doorOpen) obj = 'Quest: Open the Understar Door';
    else if (s.flags.doorOpen) obj = 'The survey continues beneath…';
    $('objective').textContent = obj;
  }

  function journal() {
    SFX.ui();
    const notes = s.notes.length
      ? '<ul>' + s.notes.map(n => `<li>${n}</li>`).join('') + '</ul>'
      : '<p>Your field book is still blank.</p>';
    dialog('Field Journal', notes);
  }

  function inventory() {
    SFX.ui();
    let html = '<ul>';
    html += `<li>Coins: ${s.coins}</li>`;
    html += `<li>Health: ${s.hp} / ${s.maxHp}</li>`;
    if (s.hasSword) html += '<li>Cavalry saber</li>';
    if (s.hasKey) html += '<li>Brass key</li>';
    if (s.hasMap) html += '<li>Old survey map</li>';
    if (s.hasCompass) html += '<li>Compass</li>';
    if (s.potion) html += `<li>Healing draught ×${s.potion}</li>`;
    html += `<li>Stakes: ${s.stakes.stakeA ? 'A ' : ''}${s.stakes.stakeB ? 'B' : '' || 'none'}</li>`;
    html += '</ul>';
    dialog('Satchel & Equipment', html);
  }

  // ---------- Input ----------
  $('interactBtn').onclick = () => { resumeAudio(); interact(); };
  $('toolBtn').onclick = () => { resumeAudio(); useTool(); };
  $('journalBtn').onclick = journal;
  $('bagBtn').onclick = inventory;
  $('helpBtn').onclick = () => {
    dialog('How to Play', `
      <p>Explore the Laramie Plains of 1867. Find the two survey stakes, unlock the Star-Well, and discover what lies beneath.</p>
      <ul>
        <li><b>Move:</b> arrow keys, WASD, or the d-pad.</li>
        <li><b>Interact:</b> Space, Enter, or the Interact button.</li>
        <li><b>Use Tool:</b> X or the Use Tool button (attacks once you have the sword).</li>
        <li><b>Journal / Satchel:</b> J / I or the buttons below.</li>
        <li><b>Travel:</b> walk into the gold-framed openings at map edges.</li>
      </ul>
      <p>Tip: enemies chase you. Face them and attack. Chests hold useful gear.</p>
      <p><small>Historical setting inspired by the real Laramie Plains; the Star-Well is pure fiction.</small></p>
    `);
  };
  $('resetBtn').onclick = () => {
    dialog('Start a new adventure?', `
      <p>This erases the saved game on this device and begins again at the survey camp.</p>
      <button id="confirmReset">Start over</button>
    `);
  };
  $('closeModal').onclick = closeDialog;
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeDialog(); });
  $('modalBody').addEventListener('click', e => {
    if (e.target.id === 'confirmReset') {
      localStorage.removeItem(SAVE_KEY);
      s = fresh();
      save();
      closeDialog();
      say('A new survey begins.');
      SFX.success();
    }
  });

  document.querySelectorAll('[data-dir]').forEach(b => {
    const d = b.dataset.dir;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      touch[d] = true;
      b.classList.add('pressed');
      b.setPointerCapture?.(e.pointerId);
      resumeAudio();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev =>
      b.addEventListener(ev, () => { touch[d] = false; b.classList.remove('pressed'); })
    );
  });

  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { resumeAudio(); interact(); }
    if (e.key.toLowerCase() === 'x' && !e.repeat) { resumeAudio(); useTool(); }
    if (e.key.toLowerCase() === 'j' && !e.repeat) journal();
    if (e.key.toLowerCase() === 'i' && !e.repeat) inventory();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // First interaction starts audio
  window.addEventListener('pointerdown', () => {
    resumeAudio();
    startAmbient();
    startMusic();
  }, { once: true });

  // ---------- Main loop ----------
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    attackCd = Math.max(0, attackCd - dt);
    invuln = Math.max(0, invuln - dt);
    interactCd = Math.max(0, interactCd - dt);

    move(dt);
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.vy += 40 * dt; // gravity
    });

    draw();
    updateHud();
    requestAnimationFrame(frame);
  }

  // Boot
  if (!s.notes.length) {
    note('1867: You arrive on the Laramie Plains with a brass survey chain and a blank field book.');
  }
  updateHud();
  requestAnimationFrame(frame);
})();
