// The player: movement, health, respawn, and the first-person / third-person camera.
(function () {
  const C = SK.CONFIG, PC = C.PLAYER, U = SK.U;
  const SPAWN = new THREE.Vector3(0, 0, 6);
  const AXIS_UP = new THREE.Vector3(0, 1, 0), AXIS_RIGHT = new THREE.Vector3(1, 0, 0);
  const _qa = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qr = new THREE.Quaternion();

  // Rotate a bone by `angle` around an axis given in the player's own space (x = right, y = up).
  function turnBone(bone, axis, angle, body) {
    if (!angle) return;
    body.getWorldQuaternion(_qr).invert();
    bone.parent.getWorldQuaternion(_qp).premultiply(_qr); // parent's rotation relative to the body
    _qa.setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(_qr.copy(_qp).invert().multiply(_qa).multiply(_qp));
  }

  // First-person copy of the model's rifle: barrel along -Z, muzzle at the front.
  function firstPersonGun(rifle, def) {
    const fwd = new THREE.Vector3(...def.forward).normalize();
    const up = new THREE.Vector3(...def.up);
    up.addScaledVector(fwd, -up.dot(fwd)).normalize();
    const back = fwd.clone().negate();
    const right = new THREE.Vector3().crossVectors(up, back);
    const mesh = new THREE.Mesh(rifle.geometry, rifle.material);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back)).invert();
    const tip = new THREE.Vector3(...def.muzzle).applyQuaternion(mesh.quaternion);
    mesh.position.set(-tip.x, -tip.y, -0.8 - tip.z); // barrel on the gun's centre line, muzzle 0.8 ahead
    const g = new THREE.Group();
    g.add(mesh);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, -0.82);
    g.add(muzzle);
    return { g, muzzle };
  }

  // Recoil over time since a shot: snaps back in 50 ms, then settles with a small overshoot.
  function recoilCurve(t) {
    if (t < 0.05) return Math.sin(t / 0.05 * Math.PI / 2);
    t -= 0.05;
    return Math.exp(-t * 9) * Math.cos(t * 10);
  }

  function gunMuzzle(rifle, def) {
    const muzzle = new THREE.Object3D();
    muzzle.position.set(...def.muzzle);
    rifle.add(muzzle);
    return muzzle;
  }

  SK.Player = {
    pos: SPAWN.clone(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: -0.1,
    onGround: true,
    radius: PC.radius,
    hp: PC.maxHp,
    maxHp: PC.maxHp,
    alive: true,
    respawnTimer: 0,
    sinceHit: 99,
    sinceShot: 99,
    view: 'fps',
    walkPhase: 0,
    speedNow: 0,
    camDist: 0,
    mesh: null,
    handR: null,
    raycaster: new THREE.Raycaster(),
    _pivot: new THREE.Vector3(),
    _fwd: new THREE.Vector3(),
    _right: new THREE.Vector3(),
    _dir: new THREE.Vector3(),

    init(scene, camera) {
      this.camera = camera;
      const g = new THREE.Group();
      const jacket = U.mat(0x5a6b3a), pants = U.mat(0x3b3a36), skin = U.mat(0xd1a17a),
            metal = U.mat(0x444a50, { metalness: 0.6, roughness: 0.4 }), scarf = U.mat(0xa33b2a),
            pack = U.mat(0x7a5a3a);

      const leg = (x) => {
        const hip = new THREE.Group();
        hip.position.set(x, 0.82, 0);
        hip.add(U.box(0.2, 0.82, 0.22, pants, 0, -0.41, 0));
        g.add(hip);
        return hip;
      };
      this.legL = leg(-0.12);
      this.legR = leg(0.12);
      g.add(U.box(0.5, 0.66, 0.3, jacket, 0, 1.15, 0));
      g.add(U.box(0.4, 0.5, 0.22, pack, 0, 1.18, 0.25));
      g.add(U.box(0.36, 0.1, 0.32, scarf, 0, 1.47, 0));
      g.add(U.sphere(0.18, skin, 0, 1.64, 0));
      g.add(U.box(0.3, 0.08, 0.1, metal, 0, 1.68, -0.15));
      g.add(U.cyl(0.2, 0.21, 0.12, 10, metal, 0, 1.78, 0));

      const arm = (x) => {
        const sh = new THREE.Group();
        sh.position.set(x, 1.4, 0);
        sh.add(U.box(0.14, 0.6, 0.14, jacket, 0, -0.3, 0));
        g.add(sh);
        return sh;
      };
      this.armR = arm(0.3);
      this.armL = arm(-0.3);
      this.handR = new THREE.Object3D();
      this.handR.position.set(0, -0.58, 0);
      this.handR.rotation.x = -Math.PI / 2;
      this.armR.add(this.handR);

      g.visible = false;
      this.mesh = g;
      scene.add(g);

      SK.Assets.instance('player')
        .then((m) => this.useModel(m))
        .catch((err) => console.warn('Player model not loaded, using the box model.', err));
    },

    // Swap the box body for the Blender model. The arm groups stay (hidden) so the Repair Torch
    // still hangs off handR and tilts with the aim; the model's own rifle becomes the Scrap Shotgun.
    useModel(m) {
      const g = this.mesh, def = C.MODELS.player;
      for (const c of [...g.children]) {
        if (c === this.armR || c === this.armL) c.children.forEach((p) => { if (p !== this.handR) p.visible = false; });
        else g.remove(c);
      }
      g.add(m.object);
      this.armR.position.set(0.1, 1.22, -0.05);
      this.handR.position.set(0, -0.42, 0);
      this.handR.scale.setScalar(0.8);

      const bone = (name) => m.object.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      const B = def.bones || {};
      this.bones = { root: bone(B.root), spine: bone(B.spine), chest: bone(B.chest), neck: bone(B.neck) };
      const gun = def.gun && bone(def.gun.node);
      if (gun) SK.Weapons.swapGun('shotgun', firstPersonGun(gun, def.gun), { g: gun, muzzle: gunMuzzle(gun, def.gun) });

      this.model = m;
      this.anim = { move: 0, run: 0, legs: 0, dir: 1, aim: 0 };
      const { walk, idle, run } = m.actions;
      if (walk) walk.play().setEffectiveWeight(0);
      if (run) run.play().setEffectiveWeight(0);
      if (idle) idle.play();
      m.mixer.update(0);

      // Where the carried rifle points in the idle pose: shooting turns her right by `turn`
      // and tilts the barrel up by `lift` (radians) so it lines up with the aim.
      if (gun) {
        g.updateMatrixWorld(true);
        const q = g.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(gun.getWorldQuaternion(new THREE.Quaternion()));
        const d = new THREE.Vector3(...def.gun.forward).normalize().applyQuaternion(q);
        this.stance = { turn: Math.atan2(-d.x, -d.z), lift: -Math.asin(U.clamp(d.y, -1, 1)) };
      }
    },

    // Every shot: shoulder the rifle at once (re-posing now, so this shot already leaves the
    // raised muzzle) and start the recoil kick.
    recoil() {
      this.sinceShot = 0;
      if (!this.model) return;
      this.anim.aim = 1;
      this.animateModel(0);
    },

    // Model animation:
    //  - idle / walk / run blended by speed (run = the walk with its motion exaggerated, played faster)
    //  - the legs turn toward the direction we move (backwards = walk cycle reversed),
    //    while the upper body keeps facing the aim and the chest leans with the look pitch.
    //  - shooting: she turns side-on and lifts the rifle onto the aim line, kicks with each shot,
    //    and lowers it again a moment after the last one (at once to sprint).
    animateModel(dt) {
      const m = this.model, A = this.anim, { walk, idle, run } = m.actions;
      const def = C.MODELS.player, aimDef = def.aim || {};
      const ease = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);

      const hold = this.sprinting ? 0.3 : aimDef.hold || 1.2;
      A.aim = ease(A.aim, this.sinceShot < hold ? 1 : 0, 5);
      const S = this.stance;
      const turn = S ? S.turn * A.aim : 0;                            // upper body faces this far right
      const lift = S ? S.lift * (aimDef.lift ?? 1) * A.aim : 0;
      const kick = recoilCurve(this.sinceShot) * (aimDef.kick || 0);

      // movement direction relative to where the upper body faces: 0 = forward, +-PI/2 = right / left, PI = back
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const vf = this.vel.x * fx + this.vel.z * fz;
      const vr = this.vel.x * -fz + this.vel.z * fx;
      const moving = this.onGround && this.speedNow > 0.4;
      let legs = turn, dir = A.dir;
      if (moving) {
        let ang = Math.atan2(vr, vf) - turn;
        if (ang < -Math.PI) ang += Math.PI * 2;
        dir = Math.abs(ang) > 1.75 ? -1 : 1;
        legs = dir > 0 ? ang : ang - Math.PI * Math.sign(ang);
        legs = turn + U.clamp(legs, -1.3, 1.3);
      }
      A.dir = dir;
      A.legs = ease(A.legs, legs, 10);
      A.move = ease(A.move, moving ? 1 : 0, 10);
      A.run = ease(A.run, moving && this.sprinting && dir > 0 ? 1 : 0, 6);

      const gain = C.MODELS.player.runGain || 1.6;
      if (walk) {
        walk.setEffectiveWeight(A.move * (1 - A.run));
        if (idle) idle.setEffectiveWeight(1 - A.move * (1 - A.run));
        if (run) run.setEffectiveWeight(A.move * A.run * gain);
        // stride cadence follows speed (a run's stride is longer, so fewer steps per metre)
        const stride = (m.speeds.walk || 1) * (1 + (gain - 1) * A.run);
        walk.timeScale = this.onGround ? dir * U.clamp(this.speedNow / stride, 0.6, 1.9 + 0.5 * A.run) : 0;
        if (run) { run.timeScale = walk.timeScale; run.time = walk.time; }
      }
      // The mixer only rewrites a bone when its animated value changes, so undo last frame's
      // procedural turns first or they would pile up.
      const b = this.bones, rest = this._boneRest || (this._boneRest = {});
      for (const k in b) if (b[k] && rest[k]) b[k].quaternion.copy(rest[k]);
      m.mixer.update(dt);
      for (const k in b) if (b[k]) (rest[k] || (rest[k] = new THREE.Quaternion())).copy(b[k].quaternion);
      m.object.position.z = kick * 0.25; // the shot shoves her back a few centimetres
      if (!b.root) return;
      const UP = AXIS_UP, RIGHT = AXIS_RIGHT;
      const twist = A.legs - turn; // upper body turns back from the legs to face its target
      const lean = -0.18 * A.run * A.move, look = this.pitch * 0.8;
      turnBone(b.root, UP, -A.legs, this.mesh);
      if (b.spine) turnBone(b.spine, UP, twist * 0.5, this.mesh);
      if (b.chest) turnBone(b.chest, UP, twist * 0.5, this.mesh);
      // tilting about the aim's right axis: with her side-on, this raises the barrel
      if (b.spine) turnBone(b.spine, RIGHT, lean + (lift + kick) * 0.4, this.mesh); // lean into the run
      if (b.chest) turnBone(b.chest, RIGHT, look + (lift + kick) * 0.6, this.mesh); // aim up / down
      if (b.neck && (turn || lift || kick)) {
        // keep her head level and looking at the target: undo the bend and most of the turn,
        // then nod with the aim as before
        turnBone(b.neck, RIGHT, -(lean + look + lift + kick), this.mesh);
        turnBone(b.neck, UP, turn * 0.85, this.mesh);
        turnBone(b.neck, RIGHT, lean + look + kick * 0.3, this.mesh);
      }
    },

    toggleView() {
      this.view = this.view === 'fps' ? 'tps' : 'fps';
      SK.HUD.message(this.view === 'fps' ? 'First-person view' : 'Third-person view');
    },

    takeDamage(n) {
      if (!this.alive) return;
      this.hp -= n * SK.Upgrades.armorMul();
      this.sinceHit = 0;
      SK.SFX.play('hurt', null, 0.15);
      SK.HUD.damageFlash();
      if (this.hp <= 0) this.die();
    },

    die() {
      this.alive = false;
      this.hp = 0;
      this.respawnTimer = PC.respawn;
      const lost = Math.floor(SK.Game.scrap * 0.2);
      SK.Game.scrap -= lost;
      SK.Deaths = (SK.Deaths || 0) + 1;
      SK.HUD.message(`You went down! Lost ${lost} scrap`, 'bad');
      SK.FX.burst(this._pivot.copy(this.pos).setY(1), 0x8b1a1a, 20, 5, 0.12, 1);
      this.mesh.visible = false;
    },

    respawn(quiet) {
      this.alive = true;
      this.hp = this.maxHp;
      this.placeAtFreeSpot();
      this.vel.set(0, 0, 0);
      if (!quiet) SK.HUD.message('Back in action!', 'good');
    },

    // Put the player on the nearest open cell to the spawn point (you may have built on it).
    placeAtFreeSpot() {
      const G = SK.Grid;
      const c0 = G.worldToCell(SPAWN.x, SPAWN.z);
      for (let r = 0; r < 12; r++) {
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            const i = c0.i + di, j = c0.j + dj;
            if (G.walkable(i, j) && !G.gateSet.has(G.idx(i, j))) {
              G.cellToWorld(i, j, this.pos);
              this.vel.set(0, 0, 0);
              return;
            }
          }
        }
      }
      this.pos.copy(SPAWN);
    },

    update(dt) {
      const I = SK.Input;
      if (!this.alive) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
        return;
      }

      this.yaw -= I.mouse.dx * C.MOUSE_SENS;
      this.pitch = U.clamp(this.pitch - I.mouse.dy * C.MOUSE_SENS, -1.45, 1.45);

      let f = 0, r = 0;
      if (I.down('KeyW')) f++;
      if (I.down('KeyS')) f--;
      if (I.down('KeyD')) r++;
      if (I.down('KeyA')) r--;
      const sprint = (I.down('ShiftLeft') || I.down('ShiftRight')) && f > 0;
      this.sprinting = sprint;
      const spd = (sprint ? PC.sprint : PC.speed) * SK.Upgrades.speedMul();
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let wx = fx * f + rx * r, wz = fz * f + rz * r;
      const wl = Math.hypot(wx, wz);
      if (wl > 0) { wx /= wl; wz /= wl; }

      const t = 1 - Math.exp(-(this.onGround ? 14 : 3) * dt);
      this.vel.x += (wx * spd - this.vel.x) * t;
      this.vel.z += (wz * spd - this.vel.z) * t;
      if (this.onGround && I.justPressed('Space')) { this.vel.y = PC.jump; this.onGround = false; }
      this.vel.y -= PC.gravity * dt;

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
      SK.Grid.resolveCircle(this.pos, this.radius);

      this.speedNow = Math.hypot(this.vel.x, this.vel.z);
      this.walkPhase += this.speedNow * dt * 1.4;

      this.sinceHit += dt;
      this.sinceShot += dt;
      if (this.sinceHit > PC.regenDelay) this.hp = Math.min(this.maxHp, this.hp + PC.regenRate * dt);

      // third-person body animation
      const kick = recoilCurve(this.sinceShot) * 0.35;
      this.armR.rotation.x = Math.PI / 2 + this.pitch + kick;
      if (this.model) { this.animateModel(dt); return; }
      const swing = this.onGround ? Math.sin(this.walkPhase * 2) * 0.7 * Math.min(1, this.speedNow / 5) : 0.3;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = Math.PI / 2.4 + this.pitch + kick;
      this.armL.rotation.z = -0.5;
    },

    updateCamera() {
      const cam = this.camera;
      cam.rotation.order = 'YXZ';
      cam.rotation.set(this.pitch, this.yaw, 0);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;

      if (this.view === 'fps') {
        const bob = this.onGround ? Math.sin(this.walkPhase * 2) * 0.05 * Math.min(1, this.speedNow / 6) : 0;
        cam.position.set(this.pos.x, this.pos.y + PC.eye + bob, this.pos.z);
        this.mesh.visible = false;
        this.camDist = 0;
        return;
      }

      // Over-the-shoulder camera, pulled in if something is in the way.
      const pivot = this._pivot.set(this.pos.x, this.pos.y + 1.65, this.pos.z);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const fwd = this._fwd.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
      const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const dir = this._dir.copy(right).multiplyScalar(0.75).addScaledVector(fwd, -3.8);
      const len = dir.length();
      dir.divideScalar(len);
      this.raycaster.set(pivot, dir);
      this.raycaster.far = len;
      const hits = this.raycaster.intersectObjects(SK.World.solids, true);
      const dist = hits.length ? Math.max(0.3, hits[0].distance - 0.25) : len;
      cam.position.copy(pivot).addScaledVector(dir, dist);
      cam.position.y = Math.max(cam.position.y, 0.25);
      this.mesh.visible = this.alive;
      this.camDist = dist;
    }
  };
})();
