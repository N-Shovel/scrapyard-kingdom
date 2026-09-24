// Buildable structures (walls, turrets, traps) and the central Stash.
(function () {
  const C = SK.CONFIG, U = SK.U;

  // Flak gun elevation (radians): rests pointing up, never dips below MIN while tracking.
  const FLAK_PIVOT_Y = 0.36, FLAK_REST_PITCH = 1.0, FLAK_MIN_PITCH = 0.35, FLAK_MAX_PITCH = 1.35;

  // Flat circle on the ground showing a turret's reach (unit radius, scale it to the range).
  const ringGeo = new THREE.RingGeometry(0.97, 1, 72).rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2);
  function makeRangeRing(color, lineOpacity, fillOpacity) {
    const g = new THREE.Group();
    const opts = { color, transparent: true, depthWrite: false, side: THREE.DoubleSide };
    const line = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ ...opts, opacity: lineOpacity }));
    const fill = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ ...opts, opacity: fillOpacity }));
    line.renderOrder = fill.renderOrder = 1;
    g.add(fill, line);
    g.userData.line = line;
    g.userData.fill = fill;
    return g;
  }

  // ---------- meshes ----------
  function buildMesh(type) {
    const g = new THREE.Group();
    let head = null, muzzle = null, spikes = null;

    if (type === 'wreck') {
      const paint = U.mat(U.pick([0x8a3b2a, 0x3d5a6e, 0x6e6a3b, 0x5b3d6e, 0x7a5230, 0x2f4f3a]));
      const dark = U.mat(0x1e1e1e), glass = U.mat(0x2a3a44, { metalness: 0.5, roughness: 0.3 });
      const car = new THREE.Group();
      car.add(U.box(1.5, 0.7, 1.96, paint, 0, 0.6, 0));
      car.add(U.box(1.3, 0.55, 1.0, paint, 0, 1.22, 0.1));
      car.add(U.box(1.32, 0.35, 0.05, glass, 0, 1.25, -0.42));
      for (const [x, z] of [[-0.75, 0.6], [0.75, 0.6], [-0.75, -0.6], [0.75, -0.6]]) {
        const w = U.cyl(0.3, 0.3, 0.22, 10, dark, x, 0.3, z);
        w.rotation.z = Math.PI / 2;
        car.add(w);
      }
      // scrap sheet to fill the gap so it reads as a wall
      const sheet = U.box(1.95, 1.1, 0.06, U.mat(U.pick(U.RUST)), 0, 0.55, 0);
      sheet.rotation.y = Math.PI / 2;
      sheet.position.x = U.pick([-0.9, 0.9]);
      car.add(sheet);
      car.rotation.y = U.pick([0, Math.PI]) + U.rand(-0.08, 0.08);
      car.rotation.z = U.rand(-0.05, 0.05);
      g.add(car);
    }

    if (type === 'container') {
      const color = U.pick([0x9a2f24, 0x2d5c8a, 0x3f7a3a, 0xc27a1e, 0x6a6a6a]);
      const body = U.mat(color), rib = U.mat(new THREE.Color(color).multiplyScalar(0.7).getHex());
      g.add(U.box(1.98, 2.5, 1.98, body, 0, 1.25, 0));
      for (let k = -0.75; k <= 0.76; k += 0.375) {
        g.add(U.box(0.08, 2.4, 2.02, rib, k, 1.25, 0));
        g.add(U.box(2.02, 2.4, 0.08, rib, 0, 1.25, k));
      }
      g.add(U.box(2.02, 0.1, 2.02, rib, 0, 2.52, 0));
    }

    if (type === 'turret') {
      const base = U.mat(0x5a5048), tire = U.mat(0x1c1c1c), olive = U.mat(0x4b5a2a),
            metal = U.mat(0x33363a, { metalness: 0.7, roughness: 0.35 });
      g.add(U.cyl(0.8, 0.9, 0.3, 12, tire, 0, 0.15, 0));
      g.add(U.cyl(0.75, 0.85, 0.3, 12, tire, 0, 0.45, 0));
      g.add(U.cyl(0.35, 0.5, 0.7, 8, base, 0, 0.9, 0));
      head = new THREE.Group();
      head.position.y = 1.35;
      head.add(U.box(0.8, 0.5, 0.8, olive, 0, 0, 0));
      head.add(U.box(0.3, 0.3, 0.4, U.mat(0x6b5a2a), 0.5, -0.05, 0.05));
      for (const x of [-0.14, 0.14]) {
        const b = U.cyl(0.07, 0.08, 1.1, 8, metal, x, 0.05, -0.8);
        b.rotation.x = Math.PI / 2;
        head.add(b);
      }
      head.add(U.box(0.5, 0.05, 0.5, metal, 0, 0.28, 0.1));
      muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.05, -1.4);
      head.add(muzzle);
      g.add(head);
    }

    if (type === 'flak') {
      const sand = U.mat(0x9c8660), steel = U.mat(0x4a5058, { metalness: 0.6, roughness: 0.4 }),
            blue = U.mat(0x2f4f6a), dark = U.mat(0x222428, { metalness: 0.7, roughness: 0.3 });
      g.add(U.cyl(0.9, 0.95, 0.5, 10, sand, 0, 0.25, 0));
      g.add(U.cyl(0.35, 0.45, 0.8, 8, steel, 0, 0.9, 0));
      head = new THREE.Group();
      head.position.y = 1.4;
      head.add(U.box(0.9, 0.35, 0.7, blue, 0, 0, 0));
      // side brackets holding the gun's pivot axle
      for (const x of [-0.36, 0.36]) head.add(U.box(0.08, 0.4, 0.34, blue, x, 0.32, 0));
      const pitch = new THREE.Group();
      pitch.position.y = FLAK_PIVOT_Y;
      const axle = U.cyl(0.07, 0.07, 0.8, 8, steel, 0, 0, 0);
      axle.rotation.z = Math.PI / 2;
      pitch.add(axle);
      pitch.add(U.box(0.5, 0.26, 0.4, steel, 0, 0, -0.1)); // breech block
      for (const [x, y] of [[-0.13, 0.07], [0.13, 0.07], [-0.13, -0.07], [0.13, -0.07]]) {
        const b = U.cyl(0.045, 0.055, 1.1, 6, dark, x, y, -0.8);
        b.rotation.x = Math.PI / 2;
        pitch.add(b);
      }
      muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, -1.35);
      pitch.add(muzzle);
      pitch.rotation.x = FLAK_REST_PITCH; // idle: barrels point at the sky
      head.add(pitch);
      head.userData.pitch = pitch;
      g.add(head);
    }

    if (type === 'spikes') {
      const plate = U.box(1.9, 0.08, 1.9, U.mat(0x3a3530), 0, 0.04, 0);
      g.add(plate);
      spikes = new THREE.Group();
      const steel = U.mat(0x8a8d90, { metalness: 0.8, roughness: 0.3 });
      for (let a = -0.6; a <= 0.61; a += 0.4)
        for (let b = -0.6; b <= 0.61; b += 0.4) {
          const s = U.cone(0.1, 0.4, 5, steel, a, 0.25, b);
          s.castShadow = false;
          spikes.add(s);
        }
      g.add(spikes);
    }

    if (type === 'tar') {
      const tar = U.mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 16),
        U.mat(0x14100c, { roughness: 0.15, metalness: 0.4, flatShading: false }), 0, 0.03, 0);
      tar.castShadow = false;
      g.add(tar);
      spikes = new THREE.Group(); // bubbles (reuse the "spikes" slot for the animated part)
      for (let n = 0; n < 5; n++) {
        const b = U.sphere(0.12, U.mat(0x2a2018, { roughness: 0.1, metalness: 0.5 }), U.rand(-0.6, 0.6), 0.05, U.rand(-0.6, 0.6));
        b.castShadow = false;
        spikes.add(b);
      }
      g.add(spikes);
      g.add(U.box(0.5, 0.35, 0.35, U.mat(0x7a2f1c), 0.75, 0.18, 0.75)); // tipped-over barrel
    }

    if (type === 'mine') {
      g.add(U.cyl(0.45, 0.5, 0.18, 10, U.mat(0x4f5a3a), 0, 0.09, 0));
      g.add(U.cyl(0.18, 0.2, 0.1, 8, U.mat(0x3a3d42, { metalness: 0.6 }), 0, 0.23, 0));
      spikes = U.sphere(0.07, new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 2 }), 0, 0.3, 0);
      g.add(spikes);
    }

    return { g, head, muzzle, spikes };
  }

  // ---------- structures ----------
  const Structures = {
    list: [],
    group: new THREE.Group(),
    _tmp: new THREE.Vector3(),
    _tmp2: new THREE.Vector3(),

    rangeGroup: new THREE.Group(), // range circles of placed turrets, shown while building
    buildMesh,
    makeRangeRing,
    rangeColor(type) { return C.STRUCTURES[type].air ? 0x66c8ff : type === 'mine' ? 0xff5a3c : 0xffb347; },

    init(scene) {
      scene.add(this.group);
      this.rangeGroup.visible = false;
      scene.add(this.rangeGroup);
    },

    create(type, i, j, hp) {
      const def = C.STRUCTURES[type];
      const s = { type, def, i, j, hp: hp || def.hp, maxHp: def.hp, cd: 0, isStructure: true,
                  spawnT: 0, hitT: 0, pos: SK.Grid.cellToWorld(i, j) };
      const m = buildMesh(type);
      s.mesh = m.g; s.head = m.head; s.muzzle = m.muzzle; s.spikes = m.spikes;
      s.mesh.position.copy(s.pos);
      U.tagRef(s.mesh, s);
      this.group.add(s.mesh);
      if (def.range) {
        s.rangeRing = makeRangeRing(this.rangeColor(type), 0.55, 0.05);
        s.rangeRing.position.set(s.pos.x, def.air ? 0.05 : 0.04, s.pos.z);
        s.rangeRing.scale.setScalar(def.range);
        this.rangeGroup.add(s.rangeRing);
      }
      s.bar = SK.FX.makeBar(1.5);
      SK.Grid.structs[SK.Grid.idx(i, j)] = s;
      this.list.push(s);
      SK.Grid.recompute();
      return s;
    },

    destroy(s, quiet) {
      if (s.dead) return;
      s.dead = true;
      this.group.remove(s.mesh);
      if (s.rangeRing) {
        this.rangeGroup.remove(s.rangeRing);
        s.rangeRing.traverse((o) => { if (o.material) o.material.dispose(); });
      }
      SK.FX.removeBar(s.bar);
      SK.Grid.structs[SK.Grid.idx(s.i, s.j)] = null;
      this.list.splice(this.list.indexOf(s), 1);
      SK.Grid.recompute();
      if (!quiet) {
        const p = this._tmp.copy(s.pos).setY(0.8);
        SK.FX.burst(p, 0x8a4b2a, 16, 7, 0.25, 1.0);
        SK.FX.burst(p, 0x333333, 10, 4, 0.35, 1.2);
        SK.SFX.play('destroy', s.pos);
        const trap = s.type === 'spikes' || s.type === 'tar';
        SK.HUD.message(trap ? `A ${s.def.name} wore out!` : `${s.def.name} destroyed!`, 'bad');
      }
    },

    // End of round: everything still standing goes back into the inventory (with its current HP).
    returnAll() {
      const n = this.list.length;
      for (const s of [...this.list]) {
        SK.Inventory.add(s.type, Math.ceil(s.hp));
        this.destroy(s, true);
      }
      return n;
    },

    damage(s, n, silent) {
      if (s.dead) return;
      s.hp -= n;
      if (!silent) {
        s.hitT = 0.15;
        SK.SFX.play('clank', s.pos, 0.08);
      }
      if (s.hp <= 0) this.destroy(s);
    },

    update(dt) {
      for (let n = this.list.length - 1; n >= 0; n--) {
        const s = this.list[n];
        // pop-in animation + hit shake
        if (s.spawnT < 1) {
          s.spawnT = Math.min(1, s.spawnT + dt * 5);
          const k = 1 - Math.pow(1 - s.spawnT, 3);
          s.mesh.scale.set(1, k, 1);
        }
        s.hitT -= dt;
        s.mesh.position.x = s.pos.x + (s.hitT > 0 ? U.rand(-0.06, 0.06) : 0);
        s.mesh.position.z = s.pos.z + (s.hitT > 0 ? U.rand(-0.06, 0.06) : 0);

        if (s.type === 'turret' || s.type === 'flak') this.updateTurret(s, dt);
        if (s.type === 'spikes') this.updateSpikes(s, dt);
        if (s.type === 'tar') this.updateTar(s, dt);
        if (s.type === 'mine') this.updateMine(s, dt);
        if (s.dead) continue;

        // traps always show durability so you know when to replace them
        SK.FX.updateBar(s.bar, s.pos.x, s.def.height + 0.5, s.pos.z, s.hp / s.maxHp,
                        s.type === 'spikes' || s.type === 'tar');
      }
    },

    // Ground enemies standing on this cell.
    enemiesOn(s) {
      return SK.Enemies.list.filter((e) => !e.def.flying &&
        U.distToRect(e.pos.x, e.pos.z, s.pos.x, s.pos.z, 1, 1) < e.def.radius * 0.5);
    },

    // Tar Pit: slows every ground enemy wading through it. Wears down while in use.
    updateTar(s, dt) {
      const t = performance.now() / 1000;
      s.spikes.children.forEach((b, n) => { b.scale.setScalar(0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + n * 1.7))); });
      const inside = this.enemiesOn(s);
      for (const e of inside) e.slowT = 0.15;
      if (inside.length) this.damage(s, s.def.wear * inside.length * dt, true);
    },

    // Scrap Mine: blows up the first time a ground enemy steps on it, hurting everything nearby.
    updateMine(s, dt) {
      s.spikes.material.emissiveIntensity = Math.sin(performance.now() / 150) > 0 ? 2.5 : 0.2;
      if (!this.enemiesOn(s).length) return;
      const def = s.def;
      const p = this._tmp.copy(s.pos).setY(0.6);
      for (const e of [...SK.Enemies.list]) {
        if (e.def.flying) continue;
        const d = Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z);
        if (d < def.radius) SK.Enemies.damage(e, def.damage * (1 - 0.6 * d / def.radius), null);
      }
      SK.FX.burst(p, 0xff9a30, 24, 9, 0.22, 0.7);
      SK.FX.burst(p, 0x333333, 14, 5, 0.4, 1.2);
      SK.FX.flash(p, 12);
      SK.SFX.play('destroy', s.pos);
      this.destroy(s, true);
    },

    // Can this turret see the enemy? Ground turrets may fire over at most TURRET_MAX_COVER walls/junk.
    // Flak shoots up into open sky, so walls don't matter.
    canSee(s, e) {
      if (s.def.air) return true;
      return SK.Grid.obstaclesBetween(s.pos.x, s.pos.z, e.pos.x, e.pos.z, C.TURRET_MAX_COVER) <= C.TURRET_MAX_COVER;
    },

    updateTurret(s, dt) {
      const def = s.def;
      s.cd -= dt;
      s.scanT = (s.scanT || 0) - dt;
      // re-pick a target a few times a second (line-of-sight checks aren't free)
      if (s.scanT <= 0 || !s.target || s.target.dead) {
        s.scanT = 0.2;
        const inRange = [];
        for (const e of SK.Enemies.list) {
          if (!!e.def.flying !== !!def.air) continue; // flak = air only, junk turret = ground only
          const d = Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z);
          if (d < def.range) inRange.push([d, e]);
        }
        inRange.sort((a, b) => a[0] - b[0]);
        s.target = null;
        for (const [, e] of inRange) if (this.canSee(s, e)) { s.target = e; break; }
      }
      const best = s.target;
      const pitch = s.head.userData.pitch;
      if (!best || best.dead) {
        s.head.rotation.y += dt * 0.4;
        if (pitch) pitch.rotation.x += (FLAK_REST_PITCH - pitch.rotation.x) * (1 - Math.exp(-3 * dt));
        return;
      }
      const want = U.yawTo(best.pos.x - s.pos.x, best.pos.z - s.pos.z);
      s.head.rotation.y = U.angleLerp(s.head.rotation.y, want, 1 - Math.exp(-12 * dt));
      const diff = Math.abs(U.angleLerp(s.head.rotation.y, want, 1) - s.head.rotation.y);
      const aimY = SK.Enemies.aimHeight(best);
      if (pitch) {
        const flat = Math.hypot(best.pos.x - s.pos.x, best.pos.z - s.pos.z);
        const wantPitch = U.clamp(Math.atan2(aimY - 1.4 - FLAK_PIVOT_Y, flat), FLAK_MIN_PITCH, FLAK_MAX_PITCH);
        pitch.rotation.x += (wantPitch - pitch.rotation.x) * (1 - Math.exp(-10 * dt));
      }
      if (s.cd <= 0 && diff < 0.25) {
        s.cd = def.fireRate;
        const from = s.muzzle.getWorldPosition(this._tmp);
        const to = this._tmp2.set(best.pos.x, aimY, best.pos.z);
        SK.FX.tracer(from, to, def.air ? 0x9fe8ff : 0xffd070, 0.06);
        SK.FX.flash(from, 2.5);
        if (def.air) SK.FX.burst(to, 0x333333, 5, 2, 0.25, 0.5); // flak puff
        SK.SFX.play('turret', s.pos, 0.05);
        SK.Enemies.damage(best, def.damage * SK.Upgrades.turretMul(), to);
      }
    },

    updateSpikes(s, dt) {
      const def = s.def;
      s.cd -= dt;
      // spikes sink and dull as durability runs out
      s.spikes.position.y = Math.max(0, s.spikes.position.y - dt * 2);
      s.spikes.scale.y = 0.35 + 0.65 * (s.hp / s.maxHp);
      if (s.cd > 0) return;
      let hits = 0;
      for (const e of SK.Enemies.list) {
        if (U.distToRect(e.pos.x, e.pos.z, s.pos.x, s.pos.z, 1, 1) < e.def.radius * 0.5) {
          SK.Enemies.damage(e, def.damage, this._tmp.set(e.pos.x, 0.4, e.pos.z));
          hits++;
        }
      }
      if (hits) {
        s.cd = def.rate;
        if (s.spikes) s.spikes.position.y = 0.15;
        SK.FX.burst(this._tmp.copy(s.pos).setY(0.3), 0x999999, 4, 3, 0.08, 0.3);
        this.damage(s, def.wear * hits);
      }
    }
  };

  // ---------- the Stash (what you must protect) ----------
  const Stash = {
    isStash: true,
    def: { name: 'Stash' },
    hp: C.STASH_HP,
    maxHp: C.STASH_HP,
    pos: new THREE.Vector3(0, 0, 0),
    group: new THREE.Group(),
    hitT: 0,
    beacon: null,

    init(scene) {
      const g = this.group;
      const concrete = U.mat(0x7c776e), rust = U.mat(0x8a4b2a), tin = U.mat(0x9a8f7c, { metalness: 0.4 }),
            dark = U.mat(0x2a2522), wood = U.mat(0x6b4a2a), yellow = U.mat(0xd9a426);
      g.add(U.box(3.95, 0.3, 3.95, concrete, 0, 0.15, 0));
      g.add(U.box(3.2, 2.2, 3.2, rust, 0, 1.4, 0));
      for (let k = -1.4; k <= 1.41; k += 0.35) g.add(U.box(0.06, 2.1, 3.26, tin, k, 1.4, 0));
      const roof = U.box(3.8, 0.15, 3.8, tin, 0, 2.6, 0);
      roof.rotation.z = 0.12;
      g.add(roof);
      g.add(U.box(1.0, 1.6, 0.1, dark, 0, 1.1, 1.62));
      g.add(U.box(0.8, 0.8, 0.8, wood, 1.5, 0.7, 1.5));
      g.add(U.box(0.6, 0.6, 0.6, wood, -1.55, 0.6, 1.4));
      g.add(U.box(0.7, 0.5, 0.7, yellow, -1.5, 0.55, -1.5));
      g.add(U.cone(0.9, 0.9, 7, U.mat(0x6e5a44), 1.4, 0.75, -1.4));
      g.add(U.cyl(0.05, 0.05, 3.2, 6, U.mat(0x444444), -1.2, 4.2, -1.2));
      this.beacon = U.sphere(0.15, new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 }), -1.2, 5.85, -1.2);
      g.add(this.beacon);
      const flag = U.box(0.02, 0.5, 0.8, U.mat(0xcc3a22), -1.2, 5.3, -0.8);
      g.add(flag);
      // fuel pump for the Repair Torch
      const pumpRed = U.mat(0xb8281c);
      g.add(U.box(0.45, 1.1, 0.35, pumpRed, 1.45, 0.85, 1.75));
      g.add(U.box(0.35, 0.3, 0.05, U.mat(0xe8e0c8), 1.45, 1.1, 1.94));
      g.add(U.cyl(0.04, 0.04, 0.6, 6, U.mat(0x1c1c1c), 1.75, 0.8, 1.8));
      const lamp = new THREE.PointLight(0xffb060, 1.8, 16, 2);
      lamp.position.set(0, 3.5, 2.5);
      g.add(lamp);
      U.tagRef(g, this);
      scene.add(g);
      this.bar = SK.FX.makeBar(3.2);
    },

    damage(n, attacker) {
      this.hp -= n;
      this.hitT = 0.15;
      SK.SFX.play('stash', this.pos, 0.1);
      if (attacker && attacker.def.steals) {
        const stolen = SK.Game.steal(C.STASH_STEAL);
        if (stolen) SK.HUD.stolenFlash();
      }
      if (this.hp <= 0) {
        this.hp = 0;
        SK.Game.gameOver('The raiders overran your Stash.');
      }
    },

    update(dt, t) {
      this.hitT -= dt;
      this.group.position.x = this.hitT > 0 ? U.rand(-0.05, 0.05) : 0;
      this.beacon.material.emissiveIntensity = Math.sin(t * 4) > 0 ? 3 : 0.2;
      SK.FX.updateBar(this.bar, 0, 6.4, 0, this.hp / this.maxHp, true);
    }
  };

  SK.Structures = Structures;
  SK.Stash = Stash;
})();
