// Personal gear: Scrap Shotgun (hitscan pellets) and Repair Torch (fixes structures + stash for scrap).
(function () {
  const C = SK.CONFIG, U = SK.U, WC = C.WEAPONS;

  function buildShotgun() {
    const g = new THREE.Group();
    const wood = U.mat(0x6b4226), dark = U.mat(0x2b2b2e, { metalness: 0.7, roughness: 0.35 }),
          tape = U.mat(0x8a8a7a);
    g.add(U.box(0.08, 0.12, 0.35, wood, 0, -0.04, 0.24));
    g.add(U.box(0.1, 0.1, 0.25, dark, 0, 0, 0));
    for (const x of [-0.028, 0.028]) {
      const b = U.cyl(0.026, 0.026, 0.7, 8, dark, x, 0.02, -0.45);
      b.rotation.x = Math.PI / 2;
      g.add(b);
    }
    g.add(U.box(0.1, 0.07, 0.18, wood, 0, -0.05, -0.3));
    g.add(U.box(0.105, 0.06, 0.05, tape, 0, 0.02, -0.6));
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.82);
    g.add(muzzle);
    return { g, muzzle };
  }

  function buildTorch() {
    const g = new THREE.Group();
    const yellow = U.mat(0xd9a426), red = U.mat(0xa33b2a), copper = U.mat(0xb8733a, { metalness: 0.7 });
    const body = U.cyl(0.04, 0.05, 0.45, 8, yellow, 0, 0, -0.1);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    g.add(U.box(0.12, 0.16, 0.2, red, 0, -0.08, 0.12));
    const nozzle = U.cone(0.035, 0.18, 8, copper, 0, 0, -0.41);
    nozzle.rotation.x = -Math.PI / 2;
    g.add(nozzle);
    const tip = U.sphere(0.03, new THREE.MeshBasicMaterial({ color: 0x66e0ff }), 0, 0, -0.5);
    g.add(tip);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, -0.52);
    g.add(muzzle);
    return { g, muzzle, tip };
  }

  SK.Weapons = {
    current: 'shotgun',
    ammo: WC.shotgun.mag,
    reloading: 0,
    cd: 0,
    kick: 0,
    repairTarget: null,
    fuel: 100,          // Repair Torch fuel, percent
    refuelDebt: 0,
    nearStation: false,
    refueling: false,
    raycaster: new THREE.Raycaster(),
    _o: new THREE.Vector3(),
    _d: new THREE.Vector3(),
    _m: new THREE.Vector3(),
    _e: new THREE.Vector3(),
    _q: new THREE.Quaternion(),

    init(camera) {
      this.camera = camera;
      this.fp = { shotgun: buildShotgun(), repair: buildTorch() };
      this.tp = { shotgun: buildShotgun(), repair: buildTorch() };
      for (const k in this.fp) {
        const vm = this.fp[k].g;
        vm.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
        vm.position.set(0.24, -0.25, -0.62);
        vm.scale.setScalar(0.85);
        camera.add(vm);
        SK.Player.handR.add(this.tp[k].g);
        this.tp[k].g.scale.setScalar(1.3);
      }
    },

    select(name) {
      if (this.current === name) return;
      this.current = name;
      this.reloading = 0;
      this.cd = Math.max(this.cd, 0.25);
    },

    reload() {
      if (this.current !== 'shotgun' || this.reloading > 0 || this.ammo >= SK.Upgrades.magSize()) return;
      this.reloading = WC.shotgun.reload;
      SK.SFX.play('reload');
    },

    muzzleWorld(out) {
      const set = SK.Player.view === 'fps' ? this.fp : this.tp;
      return set[this.current].muzzle.getWorldPosition(out);
    },

    // Ray from the crosshair. Returns first hit among shootable things.
    aim(dir, far) {
      const o = this.camera.getWorldPosition(this._o);
      this.raycaster.set(o, dir);
      this.raycaster.near = 0;
      this.raycaster.far = far;
      const hits = this.raycaster.intersectObjects(SK.World.shootables, true);
      return hits[0] || null;
    },

    forward(out) {
      return out.set(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(this._q));
    },

    update(dt) {
      const I = SK.Input, P = SK.Player;
      this.cd -= dt;
      this.kick = Math.max(0, this.kick - dt * 6);
      this.repairTarget = null;

      const busy = !P.alive || SK.Build.active;
      if (!busy) {
        if (I.justPressed('Digit1')) this.select('shotgun');
        if (I.justPressed('Digit2')) this.select('repair');
        if (I.mouse.wheel) this.select(this.current === 'shotgun' ? 'repair' : 'shotgun');
        if (I.justPressed('KeyR')) this.reload();
      }

      if (this.reloading > 0) {
        this.reloading -= dt;
        if (this.reloading <= 0) { this.reloading = 0; this.ammo = SK.Upgrades.magSize(); }
      }

      if (!busy && this.current === 'shotgun' && I.mouse.left && this.cd <= 0 && this.reloading <= 0) {
        if (this.ammo > 0) this.fire();
        else this.reload();
      }
      if (!busy && this.current === 'repair') this.updateRepair(dt, I.mouse.left);
      this.updateRefuel(dt, !busy && I.down('KeyF'));

      this.animate(dt, busy);
    },

    // Hold F next to the Stash's fuel pump to refill the torch. Costs scrap.
    updateRefuel(dt, holding) {
      const W = WC.repair, P = SK.Player;
      // during top-down prep you're back at base, so you can refuel from anywhere
      this.nearStation = SK.Game.state === 'prep' ||
        (P.alive && U.distToRect(P.pos.x, P.pos.z, 0, 0, 2, 2) < W.stationRange);
      this.refueling = false;
      if (!holding || !this.nearStation || this.fuel >= 100) return;
      if (SK.Game.scrap <= 0) {
        SK.HUD.message('No scrap to buy fuel!', 'bad', 1);
        return;
      }
      const add = Math.min(W.refuelRate * dt, 100 - this.fuel);
      this.fuel += add;
      this.refuelDebt += add * W.scrapPerFuel;
      while (this.refuelDebt >= 1 && SK.Game.scrap > 0) { SK.Game.scrap--; this.refuelDebt--; }
      this.refueling = true;
      SK.SFX.play('repair', null, 0.12);
    },

    fire() {
      const W = WC.shotgun, P = SK.Player;
      this.ammo--;
      this.cd = W.fireRate * SK.Upgrades.fireRateMul();
      this.kick = 1;
      P.pitch = Math.min(1.45, P.pitch + 0.035);
      SK.SFX.play('shotgun');

      const fwd = this.forward(this._d).clone();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this._q);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this._q);
      const muzzle = this.muzzleWorld(this._m).clone();
      SK.FX.flash(muzzle, 5);
      let hitEnemy = false, killed = false;

      for (let n = 0; n < W.pellets; n++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * W.spread;
        const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
        const hit = this.aim(dir, W.range);
        const end = hit ? hit.point : this._o.clone().addScaledVector(dir, W.range);
        SK.FX.tracer(muzzle, end, 0xffe08a, 0.06, 0.7);
        if (!hit) continue;
        const ref = U.findRef(hit.object);
        if (ref && SK.Enemies.list.includes(ref)) {
          const head = !!hit.object.userData.isHead;
          SK.Enemies.damage(ref, W.damage * SK.Upgrades.dmgMul() * (head ? 1.6 : 1), hit.point, head);
          hitEnemy = true;
          if (ref.dead) killed = true;
        } else {
          SK.FX.burst(hit.point, ref ? 0xffcc66 : 0x9a8060, 2, 2, 0.06, 0.3);
        }
      }
      if (hitEnemy) { SK.HUD.hitmarker(killed); SK.SFX.play('hit'); }
    },

    updateRepair(dt, holding) {
      const W = WC.repair, P = SK.Player;
      const dir = this.forward(this._d);
      const hit = this.aim(dir, 60);
      if (!hit) return;
      const ref = U.findRef(hit.object);
      // Only your buildings can be repaired - the Stash can't.
      if (!ref || !ref.isStructure) return;
      const reach = Math.hypot(hit.point.x - P.pos.x, hit.point.z - P.pos.z);
      if (reach > W.range) return;
      this.repairTarget = ref;
      if (!holding) return;
      this.repairStruct(ref, dt, hit.point, this.muzzleWorld(this._m));
    },

    // Burn torch fuel to fix a structure. Used in first/third person and in the top-down prep view.
    repairStruct(ref, dt, point, from) {
      const W = WC.repair;
      if (ref.hp >= ref.maxHp) return false;
      if (this.fuel <= 0) {
        SK.HUD.message('Torch is out of fuel! Refuel at the Stash (hold F)', 'bad', 1.5);
        SK.SFX.play('error', null, 0.6);
        return false;
      }
      const hpPerFuel = W.hpPerFuel * SK.Upgrades.torchMul();
      const amount = Math.min(W.rate * dt, ref.maxHp - ref.hp, this.fuel * hpPerFuel);
      ref.hp += amount;
      this.fuel = Math.max(0, this.fuel - amount / hpPerFuel);
      if (from) SK.FX.tracer(from, point, 0x66e0ff, 0.05, 1);
      if (Math.random() < 0.5) SK.FX.burst(point, 0x9ff0ff, 2, 3, 0.05, 0.25);
      SK.FX.flash(point, 1.5);
      SK.SFX.play('repair', null, 0.07);
      return true;
    },

    animate(dt, busy) {
      const P = SK.Player;
      const fps = P.view === 'fps';
      const t = performance.now() / 1000;
      for (const k in this.fp) {
        const on = k === this.current && !busy;
        this.fp[k].g.visible = on && fps;
        this.tp[k].g.visible = on && !fps && P.alive;
      }
      const vm = this.fp[this.current].g;
      const bob = P.onGround ? Math.min(1, P.speedNow / 6) : 0;
      vm.position.set(
        0.24 + Math.sin(P.walkPhase) * 0.012 * bob,
        -0.25 + Math.abs(Math.cos(P.walkPhase)) * 0.012 * bob - (this.reloading > 0 ? 0.12 : 0),
        -0.62 + this.kick * 0.09
      );
      vm.rotation.x = this.kick * 0.25 + (this.reloading > 0 ? -0.6 : 0);
      if (this.fp.repair.tip) this.fp.repair.tip.scale.setScalar(1 + Math.sin(t * 20) * 0.3);
    }
  };
})();
