// DOM-based HUD: bars, scrap, round info, hotbar/inventory, prompts, messages.
SK.HUD = {
  el: {},
  hotbarKey: '',
  dmg: 0,
  icons: {},

  init() {
    const ids = ['hud', 'hp-fill', 'hp-text', 'stash-fill', 'stash-text', 'scrap-text', 'scrap-panel',
                 'wave-label', 'phase-label', 'timer-label', 'weapon-name', 'ammo-text', 'hotbar', 'prompt',
                 'messages', 'view-label', 'damage-vignette', 'respawn', 'hitmarker', 'banner', 'banner-title',
                 'banner-sub', 'weapon-panel', 'build-hint', 'build-mode-label', 'fuel-fill', 'fuel-row',
                 'ready-btn', 'prep-help', 'minimap', 'pause', 'pause-title', 'pause-sub', 'prep-buttons',
                 'medkit-count'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.renderIcons();

    // hotbar slots are clickable during the top-down prep phase
    this.el.hotbar.addEventListener('mousedown', (e) => {
      const slot = e.target.closest('.slot');
      if (slot && slot.dataset.idx !== undefined) SK.Build.select(+slot.dataset.idx);
    });
    this.el['ready-btn'].addEventListener('click', () => SK.Waves.startRound());
    document.getElementById('shop-btn').addEventListener('click', () => SK.Upgrades.show());
  },

  showPause(show, title = 'PAUSED', sub = 'Click to resume') {
    this.el['pause-title'].textContent = title;
    this.el['pause-sub'].textContent = sub;
    this.el.pause.classList.toggle('hidden', !show);
  },

  message(text, cls = '', dur = 2.2) {
    const box = this.el.messages;
    // don't spam the same message
    const lastMsg = box.lastElementChild;
    if (lastMsg && lastMsg.textContent === text) return;
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => d.classList.add('fade'), dur * 1000);
    setTimeout(() => d.remove(), dur * 1000 + 500);
  },

  banner(title, sub) {
    const b = this.el.banner;
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    b.classList.remove('show');
    void b.offsetWidth; // restart animation
    b.classList.add('show');
  },

  hitmarker(kill) {
    const h = this.el.hitmarker;
    h.className = kill ? 'kill' : '';
    void h.offsetWidth;
    h.classList.add('show');
  },

  damageFlash() { this.dmg = 1; },

  stolenFlash() {
    const p = this.el['scrap-panel'];
    p.classList.remove('stolen');
    void p.offsetWidth;
    p.classList.add('stolen');
  },

  fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  // Render each placeable structure's 3D model once into a small picture for the hotbar.
  renderIcons() {
    const C = SK.CONFIG, size = 128;
    let r;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) { return; }
    r.setSize(size, size);
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a3228, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const dir = new THREE.Vector3(1, 0.8, 0.65).normalize();
    const box = new THREE.Box3(), sphere = new THREE.Sphere();

    for (const t of C.BUILD_ORDER) {
      const { g } = SK.Structures.buildMesh(t);
      scene.add(g);
      box.setFromObject(g).getBoundingSphere(sphere);
      const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.95;
      cam.position.copy(sphere.center).addScaledVector(dir, dist);
      cam.lookAt(sphere.center);
      r.render(scene, cam);
      this.icons[t] = r.domElement.toDataURL();
      scene.remove(g);
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    r.dispose();
    r.forceContextLoss();
  },

  buildHotbar(key) {
    this.hotbarKey = key;
    const hb = this.el.hotbar, C = SK.CONFIG, B = SK.Build, prep = B.isPrep();
    hb.innerHTML = '';
    if (B.isOn()) {
      C.BUILD_ORDER.forEach((t, n) => {
        const def = C.STRUCTURES[t];
        const owned = SK.Inventory.count(t);
        const d = document.createElement('div');
        d.dataset.idx = n;
        d.className = 'slot' + (B.selected === t ? ' active' : '') + (!B.canAfford(t) ? ' poor' : '');
        d.innerHTML = `<span class="key">${n + 1}</span><span class="count">${owned ? '×' + owned : ''}</span>` +
          (this.icons[t] ? `<img class="icon" src="${this.icons[t]}" alt="" draggable="false">` : '') +
          `<span class="name">${def.name}</span>` +
          `<span class="cost">${owned ? 'in inventory' : '⚙ ' + def.cost}</span><span class="desc">${def.desc}${def.range ? ` · ${def.range}m` : ''}</span>`;
        hb.appendChild(d);
      });
      if (prep) {
        const r = document.createElement('div');
        r.dataset.idx = C.BUILD_ORDER.length;
        r.className = 'slot repair-slot' + (B.selected === 'repair' ? ' active' : '');
        r.innerHTML = `<span class="key">${C.BUILD_ORDER.length + 1}</span><span class="name">Repair</span>` +
                      `<span class="cost">uses fuel</span><span class="desc">hold LMB</span>`;
        hb.appendChild(r);
      } else {
        const x = document.createElement('div');
        x.className = 'slot exit-slot';
        x.innerHTML = '<span class="key">B</span><span class="name">Exit</span><span class="desc">back to combat</span>';
        hb.appendChild(x);
      }
    } else {
      [['shotgun', '1'], ['repair', '2']].forEach(([w, k]) => {
        const d = document.createElement('div');
        d.className = 'slot' + (SK.Weapons.current === w ? ' active' : '');
        d.innerHTML = `<span class="key">${k}</span><span class="name">${C.WEAPONS[w].name}</span>`;
        hb.appendChild(d);
      });
      const b = document.createElement('div');
      b.className = 'slot build-slot';
      b.innerHTML = '<span class="key">B</span><span class="name">Build</span>';
      hb.appendChild(b);
    }
  },

  update(dt) {
    const e = this.el, P = SK.Player, G = SK.Game, W = SK.Waves, Wp = SK.Weapons, B = SK.Build, C = SK.CONFIG;
    const prep = B.isPrep();
    e.hud.classList.toggle('prep', prep);

    e['hp-fill'].style.width = (100 * P.hp / P.maxHp) + '%';
    e['hp-text'].textContent = `${Math.ceil(P.hp)} / ${P.maxHp}`;
    e['stash-fill'].style.width = (100 * SK.Stash.hp / SK.Stash.maxHp) + '%';
    e['stash-text'].textContent = `${Math.ceil(SK.Stash.hp)} / ${SK.Stash.maxHp}`;
    e['scrap-text'].textContent = G.scrap;

    if (W.phase === 'prep') {
      e['wave-label'].textContent = `ROUND ${W.round + 1}`;
      e['phase-label'].textContent = 'PREPARATION';
      e['phase-label'].className = 'build';
      e['timer-label'].innerHTML = `Starts in <b>${this.fmtTime(W.timer)}</b><br>` +
        `<span class="gates">Incoming: ${W.nextGates.map((g) => g.name).join(', ')}` +
        `${W.expectsAir() ? ' · <span class="air">drones expected</span>' : ''}</span>` +
        (W.round >= 1 ? `<br><span class="strength">Enemy strength: +${Math.round((W.hpMulFor(W.round + 1) - 1) * 100)}% HP · ` +
          `+${Math.round((W.dmgMulFor(W.round + 1) - 1) * 100)}% damage</span>` : '');
    } else {
      e['wave-label'].textContent = `ROUND ${W.round}`;
      e['phase-label'].textContent = 'UNDER ATTACK';
      e['phase-label'].className = 'combat';
      e['timer-label'].innerHTML = `Enemies left: <b class="clock">${W.remaining()}</b> · fight time ${this.fmtTime(W.elapsed)}`;
    }
    e['prep-buttons'].classList.toggle('hidden', !prep);
    e['medkit-count'].textContent = SK.Upgrades.medkits;
    e['prep-help'].classList.toggle('hidden', !prep);
    e.minimap.classList.toggle('hidden', prep);

    // weapon panel
    if (prep) {
      e['weapon-name'].textContent = 'TOP-DOWN VIEW';
      e['ammo-text'].textContent = B.selected === 'repair' ? 'REPAIR' : 'PLACE';
    } else if (B.active) {
      e['weapon-name'].textContent = 'BUILD MODE';
      e['ammo-text'].textContent = '';
    } else if (Wp.current === 'shotgun') {
      e['weapon-name'].textContent = C.WEAPONS.shotgun.name;
      e['ammo-text'].textContent = Wp.reloading > 0 ? 'RELOADING…' : `${Wp.ammo} / ${SK.Upgrades.magSize()}`;
    } else {
      e['weapon-name'].textContent = C.WEAPONS.repair.name;
      e['ammo-text'].textContent = `${Math.floor(Wp.fuel)}%`;
    }
    e['fuel-fill'].style.width = Wp.fuel + '%';
    e['fuel-row'].classList.toggle('low', Wp.fuel < 20);
    e['build-mode-label'].classList.toggle('hidden', !B.active || prep);

    // hotbar (rebuild only when something changed)
    const key = [prep, B.isOn(), B.selected, Wp.current,
                 C.BUILD_ORDER.map((t) => SK.Inventory.count(t) + ':' + B.canAfford(t)).join()].join('|');
    if (key !== this.hotbarKey) this.buildHotbar(key);

    e.prompt.innerHTML = this.promptText();
    e.prompt.style.opacity = e.prompt.innerHTML ? 1 : 0;

    e['view-label'].textContent = P.view === 'fps' ? '1ST PERSON · V' : '3RD PERSON · V';

    this.dmg = Math.max(0, this.dmg - dt * 2);
    const low = P.alive ? Math.max(0, 1 - P.hp / 35) * 0.5 : 0.8;
    e['damage-vignette'].style.opacity = prep ? 0 : Math.max(this.dmg, low);

    if (!P.alive && !prep) {
      e.respawn.classList.remove('hidden');
      e.respawn.innerHTML = `YOU'RE DOWN<br><span>Respawning in ${Math.ceil(P.respawnTimer)}…</span>`;
    } else e.respawn.classList.add('hidden');
    e['build-hint'].classList.toggle('hidden', !B.isOn());
  },

  promptText() {
    const P = SK.Player, Wp = SK.Weapons, B = SK.Build, C = SK.CONFIG, prep = B.isPrep();
    const refuel = () => {
      const cost = Math.ceil((100 - Wp.fuel) * C.WEAPONS.repair.scrapPerFuel);
      return Wp.refueling ? `Refueling… <b>${Math.floor(Wp.fuel)}%</b>`
        : `Hold <kbd>F</kbd> to refuel torch (${Math.floor(Wp.fuel)}% · full tank ⚙${cost})`;
    };
    if (!P.alive && !prep) return '';

    if (B.isOn()) {
      const t = B.target;
      if (B.selected === 'repair') {
        if (Wp.refueling) return refuel();
        if (!t || !t.struct) return Wp.fuel < 100 ? refuel() : 'Hover over something you built';
        const s = t.struct;
        if (s.hp >= s.maxHp) return `<b>${s.def.name}</b> is fully repaired`;
        if (Wp.fuel <= 0) return '<span class="bad">Torch empty!</span> Hold <kbd>F</kbd> to refuel';
        return `Hold <kbd>LMB</kbd> to repair <b>${s.def.name}</b> ${Math.ceil(s.hp)}/${s.maxHp} · fuel ${Math.floor(Wp.fuel)}%`;
      }
      const def = C.STRUCTURES[B.selected];
      if (t && t.struct) {
        return `<b>${t.struct.def.name}</b> ${Math.ceil(t.struct.hp)}/${t.struct.maxHp} · ` +
               `<kbd>RMB</kbd>${prep ? '' : '/<kbd>X</kbd>'} pick up (back to inventory)`;
      }
      if (t && !t.valid) return `<span class="bad">${t.reason}</span>`;
      if (t) {
        const owned = SK.Inventory.count(B.selected);
        return `<kbd>LMB</kbd> place ${def.name} ${owned ? `(${owned} in inventory)` : `(buy for ⚙${def.cost})`} · drag for lines`;
      }
      return '';
    }
    if (Wp.nearStation && !prep) {
      const fuelPart = Wp.fuel < 100 ? ' · ' + refuel() : '';
      if (Wp.refueling) return refuel();
      return `<kbd>E</kbd> open Workshop (upgrades, healing)${fuelPart}`;
    }
    if (Wp.repairTarget) {
      const r = Wp.repairTarget;
      if (r.hp >= r.maxHp) return `<b>${r.def.name}</b> is fully repaired`;
      if (Wp.fuel <= 0) return '<span class="bad">Torch empty!</span> Refuel at the Stash (hold <kbd>F</kbd>)';
      return `Hold <kbd>LMB</kbd> to repair <b>${r.def.name}</b> ${Math.ceil(r.hp)}/${r.maxHp}`;
    }
    if (Wp.current === 'repair') {
      return Wp.fuel <= 0 ? '<span class="bad">Torch empty!</span> Refuel at the Stash (hold <kbd>F</kbd>)'
        : 'Aim at a damaged wall, turret or trap';
    }
    return '';
  }
};
