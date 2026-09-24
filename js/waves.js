// Round director.
//   PREP (top-down, mouse free): place gear from your inventory, pick things up, repair, refuel.
//   COMBAT (first/third person): no time limit. Every enemy spawns within the first minute;
//                 the round ends once they are all dead.
//   END OF ROUND: everything you built returns to your inventory,
//                 and the junkyard is rebuilt with a new layout. Back to PREP.
(function () {
  const C = SK.CONFIG, U = SK.U;

  SK.Waves = {
    round: 0,
    phase: 'prep',
    timer: C.PREP_TIME,
    schedule: [],   // [{ t, type }] spawn times within the round
    elapsed: 0,
    activeGates: [],
    nextGates: [],
    markers: [],

    init(scene) {
      for (const g of SK.Grid.gates) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.6, 40, 16, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.2,
                                        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        beam.position.set(g.center.x, 20, g.center.z);
        beam.visible = false;
        scene.add(beam);
        this.markers.push({ gate: g, beam });
      }
      this.pickNextGates();
    },

    // gates that matter right now (next round's during prep, this round's during combat)
    hotGates() { return this.phase === 'prep' ? this.nextGates : this.activeGates; },

    upcomingRound() { return this.phase === 'prep' ? this.round + 1 : this.round; },
    expectsAir() { return this.upcomingRound() >= 2; },

    pickNextGates() {
      const n = Math.min(SK.Grid.gates.length, 1 + Math.ceil((this.round + 1) / 2));
      this.nextGates = U.shuffle([...SK.Grid.gates]).slice(0, n);
      SK.Build.pathVersion = -1;
    },

    composition(n) {
      const list = [];
      for (const type of ['raider', 'mutant', 'brute', 'drone']) {
        const s = C.SPAWN[type];
        if (n < (s.from || 1)) continue;
        const count = Math.max(0, s.base + s.perRound * n);
        for (let k = 0; k < count; k++) list.push(type);
      }
      return U.shuffle(list);
    },

    // Split the round's enemies into packs (2-3 from the same gate) spread evenly over the round.
    buildSchedule(types) {
      const S = C.SPAWN;
      const packs = [];
      for (let k = 0; k < types.length;) {
        const size = S.packMin + Math.floor(Math.random() * (S.packMax - S.packMin + 1));
        packs.push(types.slice(k, k + size));
        k += size;
      }
      const spawnWindow = S.window;
      const schedule = [];
      packs.forEach((pack, n) => {
        const t0 = S.firstSpawn + (n / packs.length) * spawnWindow;
        const gate = U.pick(this.activeGates);
        pack.forEach((type, m) => schedule.push({ type, gate, t: t0 + m * 0.5 }));
      });
      return schedule.sort((a, b) => a.t - b.t);
    },

    // Enemy strength for the current round (see CONFIG.SCALING).
    hpMulFor(r) { return 1 + C.SCALING.hp * (Math.max(1, r) - 1); },
    dmgMulFor(r) { return 1 + C.SCALING.damage * (Math.max(1, r) - 1); },
    hpMul() { return this.hpMulFor(this.round); },
    dmgMul() { return this.dmgMulFor(this.round); },
    speedMul() { return Math.min(C.SCALING.speedMax, 1 + C.SCALING.speed * (Math.max(1, this.round) - 1)); },

    // ---- phase changes ----
    beginPrep() {
      this.phase = 'prep';
      this.timer = C.PREP_TIME;
      SK.Game.state = 'prep';
      SK.Build.active = false;
      SK.Build.pathVersion = -1;
      if (document.pointerLockElement) document.exitPointerLock();
      SK.TopView.enter();
      SK.HUD.showPause(false);
      SK.HUD.banner(`ROUND ${this.round + 1} · PREPARE`,
        `Enemies will come from ${this.nextGates.map((g) => g.name).join(', ')}`);
    },

    // Called by the READY button / G key, or when the prep timer runs out.
    startRound() {
      if (this.phase !== 'prep') return;
      if (SK.Upgrades.open) SK.Upgrades.close();
      this.round++;
      this.phase = 'combat';
      this.timer = 0;
      this.elapsed = 0; // counts up during the fight (no time limit)
      this.activeGates = this.nextGates;
      for (const g of SK.Grid.gates) g.lock = g.bruteLock = null;
      this.schedule = this.buildSchedule(this.composition(this.round));
      SK.Build.pathVersion = -1;
      SK.Player.respawn(true);
      SK.Player.updateCamera();
      SK.SFX.play('wave');
      // Needs the mouse captured again: wait for a click if the browser didn't lock it automatically.
      SK.Game.state = 'paused';
      SK.HUD.showPause(true, `ROUND ${this.round}`, 'Click to deploy');
      SK.Input.lock();
      SK.HUD.banner(`ROUND ${this.round}`, `Wipe them all out · incoming from ${this.activeGates.map((g) => g.name).join(', ')}`);
    },

    endRound() {
      SK.Enemies.clearAll();
      SK.Pickups.collectAll();
      const bonus = 40 + this.round * 15;
      SK.Game.addScrap(bonus);
      const returned = SK.Structures.returnAll();
      // brand new junkyard layout
      SK.Grid.generate((Math.random() * 1e9) | 0);
      SK.Grid.buildTerrain(SK.World.scene);
      SK.Stash.hp = Math.min(SK.Stash.maxHp, SK.Stash.hp + SK.Stash.maxHp * 0.1); // small patch-up
      SK.Player.respawn(true);
      SK.SFX.play('clear');
      this.pickNextGates();
      this.beginPrep();
      SK.HUD.banner(`ROUND ${this.round} SURVIVED`,
        `+${bonus} scrap · ${returned} items returned to inventory · the junkyard has shifted!`);
    },

    // Once a gate's route has to smash a wall, lock that gate onto that wall until it falls.
    updateLocks() {
      SK.Grid.updateRoutes();
      for (const g of this.activeGates) {
        if (!g.lock || g.lock.dead) g.lock = g.breach || null;
        if (!g.bruteLock || g.bruteLock.dead) g.bruteLock = g.bruteBreach || null;
      }
    },

    remaining() { return this.schedule.length + SK.Enemies.list.length; },

    update(dt, t) {
      const hot = this.hotGates();
      for (const m of this.markers) {
        m.beam.visible = hot.includes(m.gate);
        m.beam.material.opacity = this.phase === 'prep' ? 0.18 + Math.sin(t * 5) * 0.08 : 0.08;
      }
      if (SK.Game.state === 'menu') return;

      if (this.phase === 'prep') {
        this.timer -= dt;
        if (this.timer <= 0) this.startRound();
        return;
      }

      this.elapsed += dt;
      this.updateLocks();
      while (this.schedule.length && this.schedule[0].t <= this.elapsed) {
        const { type, gate } = this.schedule.shift();
        const c = U.pick(gate.cells);
        const pos = SK.Grid.cellToWorld(c.i, c.j);
        pos.x += U.rand(-0.4, 0.4);
        pos.z += U.rand(-0.4, 0.4);
        SK.Enemies.spawn(type, pos, this.hpMul(), gate);
      }
      // round is won once everything has spawned and been killed
      if (!this.schedule.length && !SK.Enemies.list.length) this.endRound();
    }
  };
})();
